import { FeedbackCategory, Prisma } from '@prisma/client';
import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { auditLogService } from '../../business/services/audit-log.service';
import { generateFeedbackToken, hashFeedbackToken, buildFeedbackUrl } from '../../../utils/feedback-token';
import { sendFeedbackRequestSms } from '../../auth/sms/sms.service';
import { config } from '../../../config/env';

/** Feedback links are valid for 7 days after the appointment is completed. */
export const FEEDBACK_EXPIRY_DAYS = 7;

export interface FeedbackResponseInput {
  category_id: string;
  rating_value?: number;
  text_response?: string;
  boolean_response?: boolean;
}

export interface SubmitFeedbackInput {
  token: string;
  is_anonymous?: boolean;
  responses: FeedbackResponseInput[];
}

export class FeedbackRequestService {
  /**
   * Create the (single) feedback request for a completed appointment.
   *
   * Idempotent: the UNIQUE(appointmentId) constraint is the source of truth, so
   * concurrent appointment-completion events can never create two requests.
   *
   * Returns the persisted request together with the raw token so the caller can
   * build the customer link. The raw token is never persisted or logged.
   */
  async generateFeedbackRequest(appointmentId: string, actorId?: string) {
    const existing = await prisma.feedbackRequest.findUnique({ where: { appointmentId } });
    if (existing) {
      return { request: existing, rawToken: null as string | null };
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        business: { select: { id: true, feedbackEnabled: true } },
        customer: {
          select: {
            id: true,
            phones: { where: { isPrimary: true }, take: 1, select: { phone: true } },
          },
        },
      },
    });

    if (!appointment) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.APPOINTMENT_NOT_FOUND);
    }

    if (appointment.status !== 'COMPLETED') {
      throw new ApiError(
        400,
        'Feedback requests can only be generated for completed appointments',
        ErrorCodes.FEEDBACK_NOT_AVAILABLE
      );
    }

    if (!appointment.customerId) {
      throw new ApiError(
        400,
        'Appointment has no customer to request feedback from',
        ErrorCodes.FEEDBACK_NOT_AVAILABLE
      );
    }

    if (!appointment.business.feedbackEnabled) {
      // Business switch is off: do not create requests or send notifications.
      throw new ApiError(400, 'Feedback is disabled for this business', ErrorCodes.FEEDBACK_DISABLED);
    }

    const rawToken = generateFeedbackToken();
    const tokenHash = hashFeedbackToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + FEEDBACK_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    let request;
    try {
      request = await prisma.feedbackRequest.create({
        data: {
          businessId: appointment.businessId,
          appointmentId,
          customerId: appointment.customerId,
          tokenHash,
          sentAt: now,
          expiresAt,
          status: 'PENDING',
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Another worker won the race — reuse the request it created.
        const winner = await prisma.feedbackRequest.findUnique({ where: { appointmentId } });
        if (winner) {
          return { request: winner, rawToken: null as string | null };
        }
      }
      throw error;
    }

    // Audit + notification are best-effort. Neither may affect appointment state.
    if (actorId) {
      await auditLogService
        .createAuditLog({
          businessId: appointment.businessId,
          actorId,
          action: 'FEEDBACK_REQUEST_CREATED',
          entityType: 'FeedbackRequest',
          entityId: request.id,
          newValues: { appointmentId, customerId: appointment.customerId, expiresAt: expiresAt.toISOString() },
        })
        .catch(() => {});
    }

    const phone = appointment.customer?.phones[0]?.phone;
    if (phone) {
      const feedbackUrl = buildFeedbackUrl(config.frontendUrl, rawToken);
      await sendFeedbackRequestSms(phone, feedbackUrl).catch(() => {});
    }

    return { request, rawToken };
  }

  /**
   * Resolve a raw customer token to its PENDING request, or throw a safe error.
   * Never reveals which customer a token belongs to.
   */
  private async loadPendingRequestByToken(token: string) {
    if (!token) {
      throw new ApiError(400, 'Feedback token is required', ErrorCodes.VALIDATION_ERROR);
    }

    const tokenHash = hashFeedbackToken(token);

    const request = await prisma.feedbackRequest.findUnique({
      where: { tokenHash },
      include: {
        appointment: { select: { id: true, status: true, branchId: true, createdById: true } },
        business: { select: { id: true, name: true, owner_id: true } },
      },
    });

    if (!request) {
      throw new ApiError(404, 'Feedback request not found', ErrorCodes.FEEDBACK_REQUEST_NOT_FOUND);
    }

    if (request.status === 'SUBMITTED') {
      throw new ApiError(409, 'Feedback has already been submitted', ErrorCodes.FEEDBACK_ALREADY_SUBMITTED);
    }

    if (request.status === 'EXPIRED' || request.expiresAt <= new Date()) {
      if (request.status === 'PENDING') {
        await prisma.feedbackRequest
          .update({ where: { id: request.id }, data: { status: 'EXPIRED' } })
          .catch(() => {});
      }
      throw new ApiError(410, 'This feedback link has expired', ErrorCodes.FEEDBACK_REQUEST_EXPIRED);
    }

    if (request.appointment.status !== 'COMPLETED') {
      throw new ApiError(
        409,
        'Feedback is not available for this appointment',
        ErrorCodes.FEEDBACK_NOT_AVAILABLE
      );
    }

    return request;
  }

  /**
   * Customer-facing form payload: only enabled categories and no internal IDs.
   */
  async getFormByToken(token: string) {
    const request = await this.loadPendingRequestByToken(token);

    const categories = await prisma.feedbackCategory.findMany({
      where: { businessId: request.businessId, isEnabled: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        ratingScaleMin: true,
        ratingScaleMax: true,
        sortOrder: true,
      },
    });

    return {
      request_id: request.id,
      expires_at: request.expiresAt,
      business: { id: request.business.id, name: request.business.name },
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        description: category.description,
        type: category.type,
        rating_scale_min: category.ratingScaleMin,
        rating_scale_max: category.ratingScaleMax,
        sort_order: category.sortOrder,
      })),
    };
  }

  /**
   * Strictly validate one response against its category's configured type.
   * Throws 400 with field details on any semantic mismatch.
   */
  private validateResponseAgainstCategory(category: FeedbackCategory, response: FeedbackResponseInput) {
    const hasRating = response.rating_value !== undefined;
    const hasText = response.text_response !== undefined;
    const hasBoolean = response.boolean_response !== undefined;

    const invalid = (message: string) => {
      throw new ApiError(400, message, ErrorCodes.FEEDBACK_RESPONSE_INVALID, {
        categoryId: category.id,
        categoryType: category.type,
      });
    };

    switch (category.type) {
      case 'RATING': {
        if (!hasRating) invalid('A rating_value is required for RATING categories');
        if (hasText || hasBoolean) invalid('RATING categories only accept rating_value');
        if (!Number.isInteger(response.rating_value)) invalid('rating_value must be an integer');
        const min = category.ratingScaleMin ?? 1;
        const max = category.ratingScaleMax ?? 5;
        if (response.rating_value! < min || response.rating_value! > max) {
          invalid(`rating_value must be between ${min} and ${max}`);
        }
        break;
      }
      case 'TEXT': {
        if (!hasText) invalid('A text_response is required for TEXT categories');
        if (hasRating || hasBoolean) invalid('TEXT categories only accept text_response');
        if (typeof response.text_response! !== 'string' || response.text_response!.trim().length === 0) {
          invalid('text_response must be a non-empty string');
        }
        break;
      }
      case 'BOOLEAN': {
        if (!hasBoolean) invalid('A boolean_response is required for BOOLEAN categories');
        if (hasRating || hasText) invalid('BOOLEAN categories only accept boolean_response');
        if (typeof response.boolean_response !== 'boolean') invalid('boolean_response must be a boolean');
        break;
      }
      default:
        invalid('Unsupported feedback category type');
    }
  }

  /**
   * Validate every response, then create the submission + responses + request
   * status transition atomically.
   */
  async submitFeedback(input: SubmitFeedbackInput) {
    const request = await this.loadPendingRequestByToken(input.token);

    const isAnonymous = input.is_anonymous === true;

    // Reject duplicate category answers up front for a clear 400.
    const categoryIds = input.responses.map((response) => response.category_id);
    if (new Set(categoryIds).size !== categoryIds.length) {
      throw new ApiError(
        400,
        'Each feedback category may only be answered once per submission',
        ErrorCodes.VALIDATION_ERROR
      );
    }

    // Load categories scoped to THIS business. A category belonging to another
    // business simply will not be found — it is never trusted by ID alone.
    const categories = await prisma.feedbackCategory.findMany({
      where: { id: { in: categoryIds }, businessId: request.businessId },
    });
    const categoryById = new Map(categories.map((category) => [category.id, category]));

    const validated = input.responses.map((response) => {
      const category = categoryById.get(response.category_id);

      if (!category) {
        throw new ApiError(422, 'Invalid feedback category', ErrorCodes.FEEDBACK_CATEGORY_INVALID, {
          categoryId: response.category_id,
        });
      }

      if (!category.isEnabled) {
        throw new ApiError(422, 'This feedback category is no longer available', ErrorCodes.FEEDBACK_CATEGORY_DISABLED, {
          categoryId: category.id,
        });
      }

      this.validateResponseAgainstCategory(category, response);

      return {
        feedbackCategoryId: category.id,
        ratingValue: response.rating_value ?? null,
        textResponse: response.text_response ?? null,
        booleanResponse: response.boolean_response ?? null,
      };
    });

    const now = new Date();

    const submission = await prisma.$transaction(async (tx) => {
      const current = await tx.feedbackRequest.findUnique({
        where: { id: request.id },
        select: { id: true, status: true, expiresAt: true },
      });

      if (!current) {
        throw new ApiError(404, 'Feedback request not found', ErrorCodes.FEEDBACK_REQUEST_NOT_FOUND);
      }

      if (current.status === 'SUBMITTED') {
        throw new ApiError(409, 'Feedback has already been submitted', ErrorCodes.FEEDBACK_ALREADY_SUBMITTED);
      }

      if (current.status !== 'PENDING' || current.expiresAt <= now) {
        throw new ApiError(410, 'This feedback link has expired', ErrorCodes.FEEDBACK_REQUEST_EXPIRED);
      }

      // Claim the request atomically. Only one concurrent submission can flip
      // PENDING -> SUBMITTED, which guarantees a single submission per request.
      const claimed = await tx.feedbackRequest.updateMany({
        where: { id: current.id, status: 'PENDING' },
        data: { status: 'SUBMITTED' },
      });

      if (claimed.count === 0) {
        throw new ApiError(409, 'Feedback has already been submitted', ErrorCodes.FEEDBACK_ALREADY_SUBMITTED);
      }

      const created = await tx.feedbackSubmission.create({
        data: {
          feedbackRequestId: current.id,
          isAnonymous,
          submittedAt: now,
        },
      });

      await tx.feedbackResponse.createMany({
        data: validated.map((response) => ({
          feedbackSubmissionId: created.id,
          ...response,
        })),
      });

      return created;
    });

    // Audit as a customer-initiated event. The AuditLog requires a real user
    // actor, so we attribute it to the appointment creator or business owner and
    // mark the actor type explicitly. No feedback text is duplicated here.
    const actorId = request.appointment.createdById ?? request.business.owner_id;
    await auditLogService
      .createAuditLog({
        businessId: request.businessId,
        actorId,
        action: 'FEEDBACK_SUBMITTED',
        entityType: 'FeedbackSubmission',
        entityId: submission.id,
        newValues: { actorType: 'CUSTOMER', isAnonymous, requestId: request.id },
      })
      .catch(() => {});

    return {
      submission_id: submission.id,
      is_anonymous: submission.isAnonymous,
      submitted_at: submission.submittedAt,
    };
  }
}

export const feedbackRequestService = new FeedbackRequestService();
