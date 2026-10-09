import { Prisma, FeedbackExpiryMode } from '@prisma/client';
import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { auditLogService } from '../../business/services/audit-log.service';
import { feedbackAccessService } from './feedback-access.service';
import { FEEDBACK_SUBMISSION_INCLUDE, toAdminFeedbackResponse } from '../mappers/feedback-response.mapper';
import { FeedbackSettingsUpdateInput } from '../validation/feedback.schemas';

export interface FeedbackListQuery {
  page?: number;
  limit?: number;
  fromDate?: Date;
  toDate?: Date;
  branchId?: string;
  categoryId?: string;
  isAnonymous?: boolean;
}

export class FeedbackAdminService {
  /**
   * Private list of feedback submissions. OWNER/ADMIN or FEEDBACK_VIEW, business-scoped.
   * Enforces branch-level access restrictions for branch-scoped members.
   */
  async listFeedback(businessId: string, userId: string, query: FeedbackListQuery) {
    const access = await feedbackAccessService.assertFeedbackAccess(businessId, userId, 'FEEDBACK_VIEW');

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;
    const skip = (page - 1) * limit;

    let branchFilter: string | { in: string[] } | undefined;
    if (query.branchId) {
      if (!access.hasBusinessScope && !access.allowedBranchIds.has(query.branchId)) {
        throw new ApiError(403, 'Access denied to this branch', ErrorCodes.FORBIDDEN);
      }
      branchFilter = query.branchId;
    } else if (!access.hasBusinessScope) {
      branchFilter = { in: Array.from(access.allowedBranchIds) };
    }

    const where: Prisma.FeedbackSubmissionWhereInput = {
      feedbackRequest: {
        businessId,
        ...(branchFilter ? { appointment: { branchId: branchFilter } } : {}),
      },
    };

    if (query.isAnonymous !== undefined) {
      where.isAnonymous = query.isAnonymous;
    }

    if (query.fromDate || query.toDate) {
      where.submittedAt = {};
      if (query.fromDate) where.submittedAt.gte = query.fromDate;
      if (query.toDate) where.submittedAt.lte = query.toDate;
    }

    if (query.categoryId) {
      where.responses = { some: { feedbackCategoryId: query.categoryId } };
    }

    const [rows, total] = await Promise.all([
      prisma.feedbackSubmission.findMany({
        where,
        skip,
        take: limit,
        orderBy: { submittedAt: 'desc' },
        include: FEEDBACK_SUBMISSION_INCLUDE,
      }),
      prisma.feedbackSubmission.count({ where }),
    ]);

    return {
      data: rows.map(toAdminFeedbackResponse),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Private detail. Applies the exact same privacy and branch mapping as the list.
   */
  async getFeedbackDetail(businessId: string, userId: string, submissionId: string) {
    const access = await feedbackAccessService.assertFeedbackAccess(businessId, userId, 'FEEDBACK_VIEW');

    const submission = await prisma.feedbackSubmission.findFirst({
      where: { id: submissionId, feedbackRequest: { businessId } },
      include: FEEDBACK_SUBMISSION_INCLUDE,
    });

    if (!submission) {
      throw new ApiError(404, 'Feedback submission not found', ErrorCodes.FEEDBACK_NOT_FOUND);
    }

    if (!access.hasBusinessScope && submission.feedbackRequest.appointment?.branch?.id) {
      if (!access.allowedBranchIds.has(submission.feedbackRequest.appointment.branch.id)) {
        throw new ApiError(403, 'Access denied to this branch', ErrorCodes.FORBIDDEN);
      }
    }

    // Record the view without any customer-identifying metadata.
    await auditLogService
      .createAuditLog({
        businessId,
        actorId: userId,
        action: 'FEEDBACK_VIEWED',
        entityType: 'FeedbackSubmission',
        entityId: submission.id,
        newValues: { isAnonymous: submission.isAnonymous },
      })
      .catch(() => {});

    return toAdminFeedbackResponse(submission);
  }

  /**
   * Get feedback settings for a business (OWNER/ADMIN or FEEDBACK_VIEW).
   */
  async getFeedbackSettings(businessId: string, userId: string) {
    await feedbackAccessService.assertFeedbackAccess(businessId, userId, 'FEEDBACK_VIEW');

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        feedbackEnabled: true,
        feedbackExpiryMode: true,
        feedbackCustomExpiryDays: true,
      },
    });

    if (!business) {
      throw new ApiError(404, 'Business not found', ErrorCodes.BUSINESS_NOT_FOUND);
    }

    return {
      business_id: business.id,
      feedback_enabled: business.feedbackEnabled,
      feedback_expiry_mode: business.feedbackExpiryMode,
      feedback_custom_expiry_days: business.feedbackCustomExpiryDays,
    };
  }

  /**
   * Update feedback settings for a business (OWNER/ADMIN or FEEDBACK_MANAGE).
   */
  async updateFeedbackSettings(businessId: string, userId: string, input: FeedbackSettingsUpdateInput) {
    await feedbackAccessService.assertFeedbackAccess(businessId, userId, 'FEEDBACK_MANAGE');

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new ApiError(404, 'Business not found', ErrorCodes.BUSINESS_NOT_FOUND);
    }

    const changes: Prisma.BusinessUpdateInput = {};
    if (input.feedbackEnabled !== undefined) {
      changes.feedbackEnabled = input.feedbackEnabled;
    }

    if (input.feedbackExpiryMode !== undefined || input.feedbackCustomExpiryDays !== undefined) {
      const mode = (input.feedbackExpiryMode ?? business.feedbackExpiryMode) as FeedbackExpiryMode;
      const validModes = ['DAYS_7', 'DAYS_15', 'DAYS_30', 'CUSTOM', 'NEVER'];
      if (!validModes.includes(mode)) {
        throw new ApiError(400, `Invalid feedbackExpiryMode. Must be one of ${validModes.join(', ')}`, ErrorCodes.VALIDATION_ERROR);
      }

      changes.feedbackExpiryMode = mode;

      if (mode === 'CUSTOM') {
        const days = input.feedbackCustomExpiryDays !== undefined ? input.feedbackCustomExpiryDays : business.feedbackCustomExpiryDays;
        if (!days || !Number.isInteger(days) || days < 1 || days > 365) {
          throw new ApiError(400, 'Custom expiry days must be an integer between 1 and 365', ErrorCodes.VALIDATION_ERROR);
        }
        changes.feedbackCustomExpiryDays = days;
      } else {
        changes.feedbackCustomExpiryDays = null;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.business.update({
        where: { id: businessId },
        data: changes,
        select: {
          id: true,
          feedbackEnabled: true,
          feedbackExpiryMode: true,
          feedbackCustomExpiryDays: true,
        },
      });

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: userId,
          action: 'BUSINESS_SETTINGS_UPDATED',
          entityType: 'Business',
          entityId: businessId,
          oldValues: {
            feedbackEnabled: business.feedbackEnabled,
            feedbackExpiryMode: business.feedbackExpiryMode,
            feedbackCustomExpiryDays: business.feedbackCustomExpiryDays,
          },
          newValues: {
            feedbackEnabled: res.feedbackEnabled,
            feedbackExpiryMode: res.feedbackExpiryMode,
            feedbackCustomExpiryDays: res.feedbackCustomExpiryDays,
          },
        },
        tx
      );

      return res;
    });

    return {
      business_id: updated.id,
      feedback_enabled: updated.feedbackEnabled,
      feedback_expiry_mode: updated.feedbackExpiryMode,
      feedback_custom_expiry_days: updated.feedbackCustomExpiryDays,
    };
  }
}

export const feedbackAdminService = new FeedbackAdminService();
