import { Prisma } from '@prisma/client';
import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { auditLogService } from '../../business/services/audit-log.service';
import { feedbackAccessService } from './feedback-access.service';
import { FEEDBACK_SUBMISSION_INCLUDE, toAdminFeedbackResponse } from '../mappers/feedback-response.mapper';

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
   * Private list of feedback submissions. OWNER/ADMIN only, business-scoped.
   */
  async listFeedback(businessId: string, userId: string, query: FeedbackListQuery) {
    await feedbackAccessService.assertFeedbackAccess(businessId, userId, 'FEEDBACK_VIEW');

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.FeedbackSubmissionWhereInput = {
      feedbackRequest: {
        businessId,
        ...(query.branchId ? { appointment: { branchId: query.branchId } } : {}),
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
   * Private detail. Applies the exact same privacy mapping as the list.
   */
  async getFeedbackDetail(businessId: string, userId: string, submissionId: string) {
    await feedbackAccessService.assertFeedbackAccess(businessId, userId, 'FEEDBACK_VIEW');

    const submission = await prisma.feedbackSubmission.findFirst({
      where: { id: submissionId, feedbackRequest: { businessId } },
      include: FEEDBACK_SUBMISSION_INCLUDE,
    });

    if (!submission) {
      throw new ApiError(404, 'Feedback submission not found', ErrorCodes.FEEDBACK_NOT_FOUND);
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
}

export const feedbackAdminService = new FeedbackAdminService();
