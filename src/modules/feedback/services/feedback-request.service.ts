import { createHash } from 'crypto';
import { FeedbackCategory, FeedbackExpiryMode, Prisma } from '@prisma/client';
import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { auditLogService } from '../../business/services/audit-log.service';
import {
  generateFeedbackToken,
  hashFeedbackToken,
  encryptFeedbackToken,
  decryptFeedbackToken,
  buildFeedbackUrl,
  buildFeedbackQrUrl,
} from '../../../utils/feedback-token';
import { sendFeedbackRequestSms } from '../../auth/sms/sms.service';
import { config } from '../../../config/env';
import { feedbackAccessService } from './feedback-access.service';

/** Default fallback when business settings are not yet set. */
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
  idempotency_key?: string;
  idempotencyKey?: string;
  responses: FeedbackResponseInput[];
}

export class FeedbackRequestService {
  /**
   * Calculate effective expiresAt snapshot using business policy and appointment completion time.
   */
  calculateExpiresAt(
    completionTime: Date,
    mode: FeedbackExpiryMode = 'DAYS_7',
    customDays: number | null = null
  ): Date | null {
    const baseTime = completionTime.getTime();
    switch (mode) {
      case 'DAYS_7':
        return new Date(baseTime + 7 * 24 * 60 * 60 * 1000);
      case 'DAYS_15':
        return new Date(baseTime + 15 * 24 * 60 * 60 * 1000);
      case 'DAYS_30':
        return new Date(baseTime + 30 * 24 * 60 * 60 * 1000);
      case 'CUSTOM': {
        const days = customDays && customDays > 0 ? customDays : 7;
        return new Date(baseTime + days * 24 * 60 * 60 * 1000);
      }
      case 'NEVER':
        return null;
      default:
        return new Date(baseTime + 7 * 24 * 60 * 60 * 1000);
    }
  }

  /**
   * Create the (single) feedback request for a completed appointment.
   *
   * Idempotent: the UNIQUE(appointmentId) constraint is the source of truth, so
   * concurrent appointment-completion events can never create two requests.
   *
   * Reopening an appointment returns the existing request and decodes the existing token
   * rather than generating a new token or creating duplicate requests.
   */
  async generateFeedbackRequest(appointmentId: string, actorId?: string) {
    const existing = await prisma.feedbackRequest.findUnique({ where: { appointmentId } });
    if (existing) {
      let rawToken: string | null = null;
      if (existing.encryptedToken) {
        try {
          rawToken = decryptFeedbackToken(existing.encryptedToken);
        } catch {
          rawToken = null;
        }
      }
      return { request: existing, rawToken };
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        business: {
          select: {
            id: true,
            feedbackEnabled: true,
            feedbackExpiryMode: true,
            feedbackCustomExpiryDays: true,
          },
        },
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
    const encryptedToken = encryptFeedbackToken(rawToken);
    const now = new Date();

    const completionTime = appointment.completedAt ?? appointment.actualEnd ?? now;
    const expiresAt = this.calculateExpiresAt(
      completionTime,
      appointment.business.feedbackExpiryMode,
      appointment.business.feedbackCustomExpiryDays
    );

    let request;
    try {
      request = await prisma.feedbackRequest.create({
        data: {
          businessId: appointment.businessId,
          appointmentId,
          customerId: appointment.customerId,
          tokenHash,
          encryptedToken,
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
          let winnerToken: string | null = null;
          if (winner.encryptedToken) {
            try {
              winnerToken = decryptFeedbackToken(winner.encryptedToken);
            } catch {
              winnerToken = null;
            }
          }
          return { request: winner, rawToken: winnerToken };
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
          newValues: {
            appointmentId,
            customerId: appointment.customerId,
            expiresAt: expiresAt ? expiresAt.toISOString() : null,
          },
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

    if (request.status === 'REVOKED') {
      throw new ApiError(410, 'This feedback link has been revoked', ErrorCodes.FEEDBACK_REQUEST_REVOKED);
    }

    if (request.status === 'SUBMITTED') {
      throw new ApiError(409, 'Feedback has already been submitted', ErrorCodes.FEEDBACK_ALREADY_SUBMITTED);
    }

    const isExpired = request.status === 'EXPIRED' || (request.expiresAt !== null && request.expiresAt <= new Date());
    if (isExpired) {
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
   * Compute a deterministic hash for checking request body idempotency.
   */
  computePayloadFingerprint(isAnonymous: boolean, responses: FeedbackResponseInput[]): string {
    const sorted = [...responses].sort((a, b) => a.category_id.localeCompare(b.category_id));
    const canonical = JSON.stringify({ isAnonymous, responses: sorted });
    return createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Validate every response, then create the submission + responses + request
   * status transition atomically. Supports client idempotency keys.
   */
  async submitFeedback(input: SubmitFeedbackInput) {
    if (!input.token) {
      throw new ApiError(400, 'Feedback token is required', ErrorCodes.VALIDATION_ERROR);
    }

    const tokenHash = hashFeedbackToken(input.token);
    const request = await prisma.feedbackRequest.findUnique({
      where: { tokenHash },
      include: {
        appointment: { select: { id: true, status: true, branchId: true, createdById: true } },
        business: { select: { id: true, name: true, owner_id: true } },
        submission: true,
      },
    });

    if (!request) {
      throw new ApiError(404, 'Feedback request not found', ErrorCodes.FEEDBACK_REQUEST_NOT_FOUND);
    }

    if (request.status === 'REVOKED') {
      throw new ApiError(410, 'This feedback link has been revoked', ErrorCodes.FEEDBACK_REQUEST_REVOKED);
    }

    const isAnonymous = input.is_anonymous === true;
    const idempotencyKey = input.idempotency_key || input.idempotencyKey;
    const payloadHash = this.computePayloadFingerprint(isAnonymous, input.responses);

    // If already submitted, check for an idempotent replay
    if (request.status === 'SUBMITTED' || request.submission) {
      const existingSubmission =
        request.submission || (await prisma.feedbackSubmission.findUnique({ where: { feedbackRequestId: request.id } }));

      if (idempotencyKey && existingSubmission) {
        if (existingSubmission.idempotencyKey === idempotencyKey) {
          if (existingSubmission.requestPayloadHash === payloadHash) {
            // Replay identical request with identical idempotency key -> return existing result
            return {
              submission_id: existingSubmission.id,
              is_anonymous: existingSubmission.isAnonymous,
              submitted_at: existingSubmission.submittedAt,
            };
          } else {
            // Key reused with different payload -> reject
            throw new ApiError(
              422,
              'Idempotency key reused with different payload',
              ErrorCodes.IDEMPOTENCY_CONFLICT
            );
          }
        }
      }
      throw new ApiError(409, 'Feedback has already been submitted', ErrorCodes.FEEDBACK_ALREADY_SUBMITTED);
    }

    const now = new Date();

    if (request.status === 'EXPIRED' || (request.expiresAt !== null && request.expiresAt <= now)) {
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

    const submission = await prisma.$transaction(async (tx) => {
      const current = await tx.feedbackRequest.findUnique({
        where: { id: request.id },
        select: { id: true, status: true, expiresAt: true },
      });

      if (!current) {
        throw new ApiError(404, 'Feedback request not found', ErrorCodes.FEEDBACK_REQUEST_NOT_FOUND);
      }

      if (current.status === 'REVOKED') {
        throw new ApiError(410, 'This feedback link has been revoked', ErrorCodes.FEEDBACK_REQUEST_REVOKED);
      }

      if (current.status === 'SUBMITTED') {
        throw new ApiError(409, 'Feedback has already been submitted', ErrorCodes.FEEDBACK_ALREADY_SUBMITTED);
      }

      if (current.status !== 'PENDING' || (current.expiresAt !== null && current.expiresAt <= now)) {
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
          idempotencyKey: idempotencyKey ?? null,
          requestPayloadHash: payloadHash,
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

    // Audit as a customer-initiated event.
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

  /**
   * Retrieve existing feedback request and shareable link for an appointment.
   * OWNER/ADMIN only, or FEEDBACK_VIEW, subject to branch scope.
   * Reopening does NOT generate a new token or create duplicate requests.
   */
  async getAppointmentFeedbackRequest(businessId: string, appointmentId: string, userId: string) {
    const access = await feedbackAccessService.assertFeedbackAccess(businessId, userId, 'FEEDBACK_VIEW');

    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, businessId },
      select: { id: true, branchId: true },
    });

    if (!appointment) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.APPOINTMENT_NOT_FOUND);
    }

    if (!access.hasBusinessScope && !access.allowedBranchIds.has(appointment.branchId)) {
      throw new ApiError(403, 'Access denied to this branch', ErrorCodes.FORBIDDEN);
    }

    const request = await prisma.feedbackRequest.findUnique({
      where: { appointmentId },
      include: {
        submission: {
          select: { id: true, submittedAt: true, isAnonymous: true },
        },
      },
    });

    if (!request) {
      throw new ApiError(404, 'Feedback request not found for this appointment', ErrorCodes.FEEDBACK_REQUEST_NOT_FOUND);
    }

    const now = new Date();
    let effectiveStatus = request.status;
    if (request.status === 'PENDING' && request.expiresAt !== null && request.expiresAt <= now) {
      effectiveStatus = 'EXPIRED';
    }

    let feedbackUrl: string | null = null;
    let qrCodeUrl: string | null = null;

    if (request.encryptedToken) {
      try {
        const rawToken = decryptFeedbackToken(request.encryptedToken);
        feedbackUrl = buildFeedbackUrl(config.frontendUrl, rawToken);
        qrCodeUrl = buildFeedbackQrUrl(feedbackUrl);
      } catch {
        feedbackUrl = null;
        qrCodeUrl = null;
      }
    }

    return {
      id: request.id,
      appointment_id: request.appointmentId,
      customer_id: request.customerId,
      status: effectiveStatus,
      sent_at: request.sentAt,
      expires_at: request.expiresAt,
      url: feedbackUrl,
      qr_code_url: qrCodeUrl,
      is_submitted: request.status === 'SUBMITTED',
      is_revoked: request.status === 'REVOKED',
      is_expired: effectiveStatus === 'EXPIRED',
      submission: request.submission
        ? {
            id: request.submission.id,
            submitted_at: request.submission.submittedAt,
            is_anonymous: request.submission.isAnonymous,
          }
        : null,
      created_at: request.createdAt,
      updated_at: request.updatedAt,
    };
  }

  /**
   * Revoke an active feedback request for an appointment.
   * Terminal state: cannot be submitted once revoked.
   */
  async revokeFeedbackRequest(businessId: string, appointmentId: string, userId: string) {
    const access = await feedbackAccessService.assertFeedbackAccess(businessId, userId, 'FEEDBACK_MANAGE');

    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, businessId },
      select: { id: true, branchId: true },
    });

    if (!appointment) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.APPOINTMENT_NOT_FOUND);
    }

    if (!access.hasBusinessScope && !access.allowedBranchIds.has(appointment.branchId)) {
      throw new ApiError(403, 'Access denied to this branch', ErrorCodes.FORBIDDEN);
    }

    const request = await prisma.feedbackRequest.findUnique({
      where: { appointmentId },
    });

    if (!request) {
      throw new ApiError(404, 'Feedback request not found for this appointment', ErrorCodes.FEEDBACK_REQUEST_NOT_FOUND);
    }

    if (request.status === 'SUBMITTED') {
      throw new ApiError(
        409,
        'Cannot revoke a feedback request that has already been submitted',
        ErrorCodes.CONFLICT
      );
    }

    if (request.status === 'REVOKED') {
      return {
        id: request.id,
        appointment_id: request.appointmentId,
        status: 'REVOKED',
        updated_at: request.updatedAt,
      };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.feedbackRequest.update({
        where: { id: request.id },
        data: { status: 'REVOKED' },
      });

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: userId,
          action: 'FEEDBACK_REQUEST_REVOKED',
          entityType: 'FeedbackRequest',
          entityId: request.id,
          oldValues: { status: request.status },
          newValues: { status: 'REVOKED' },
        },
        tx
      );

      return res;
    });

    return {
      id: updated.id,
      appointment_id: updated.appointmentId,
      status: updated.status,
      updated_at: updated.updatedAt,
    };
  }
}

export const feedbackRequestService = new FeedbackRequestService();
