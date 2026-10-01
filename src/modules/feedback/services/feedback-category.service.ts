import { FeedbackCategory, FeedbackCategoryType, Prisma } from '@prisma/client';
import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { auditLogService } from '../../business/services/audit-log.service';
import { feedbackAccessService } from './feedback-access.service';

export interface FeedbackCategoryInput {
  name?: string;
  description?: string | null;
  type?: FeedbackCategoryType;
  ratingScaleMin?: number | null;
  ratingScaleMax?: number | null;
  isEnabled?: boolean;
  sortOrder?: number;
}

const MIN_RATING_BOUND = 0;
const MAX_RATING_BOUND = 10;

export class FeedbackCategoryService {
  /**
   * Reject invalid category configurations. Never silently correct input.
   */
  private validateCategoryConfig(
    type: FeedbackCategoryType,
    min: number | null | undefined,
    max: number | null | undefined
  ) {
    if (type === 'RATING') {
      if (min === null || min === undefined || max === null || max === undefined) {
        throw new ApiError(
          400,
          'ratingScaleMin and ratingScaleMax are required for RATING categories',
          ErrorCodes.FEEDBACK_CATEGORY_INVALID
        );
      }
      if (!Number.isInteger(min) || !Number.isInteger(max)) {
        throw new ApiError(400, 'Rating scale bounds must be integers', ErrorCodes.FEEDBACK_CATEGORY_INVALID);
      }
      if (min < MIN_RATING_BOUND || max > MAX_RATING_BOUND) {
        throw new ApiError(
          400,
          `Rating scale must be between ${MIN_RATING_BOUND} and ${MAX_RATING_BOUND}`,
          ErrorCodes.FEEDBACK_CATEGORY_INVALID
        );
      }
      if (min >= max) {
        throw new ApiError(
          400,
          'ratingScaleMin must be less than ratingScaleMax',
          ErrorCodes.FEEDBACK_CATEGORY_INVALID
        );
      }
      return;
    }

    if (min !== null && min !== undefined) {
      throw new ApiError(
        400,
        `ratingScaleMin must be null for ${type} categories`,
        ErrorCodes.FEEDBACK_CATEGORY_INVALID
      );
    }
    if (max !== null && max !== undefined) {
      throw new ApiError(
        400,
        `ratingScaleMax must be null for ${type} categories`,
        ErrorCodes.FEEDBACK_CATEGORY_INVALID
      );
    }
  }

  private mapCategory(category: FeedbackCategory, responseCount?: number) {
    return {
      id: category.id,
      name: category.name,
      description: category.description,
      type: category.type,
      rating_scale_min: category.ratingScaleMin,
      rating_scale_max: category.ratingScaleMax,
      is_enabled: category.isEnabled,
      sort_order: category.sortOrder,
      ...(responseCount !== undefined ? { response_count: responseCount } : {}),
      created_at: category.createdAt,
      updated_at: category.updatedAt,
    };
  }

  async createCategory(businessId: string, userId: string, input: FeedbackCategoryInput) {
    await feedbackAccessService.assertFeedbackAccess(businessId, userId, 'FEEDBACK_MANAGE');

    if (!input.name || !input.type) {
      throw new ApiError(400, 'name and type are required', ErrorCodes.VALIDATION_ERROR);
    }

    this.validateCategoryConfig(input.type, input.ratingScaleMin, input.ratingScaleMax);

    const duplicate = await prisma.feedbackCategory.findFirst({
      where: { businessId, name: input.name },
      select: { id: true },
    });

    if (duplicate) {
      throw new ApiError(409, 'A feedback category with this name already exists', ErrorCodes.FEEDBACK_CATEGORY_DUPLICATE);
    }

    const category = await prisma.$transaction(async (tx) => {
      const created = await tx.feedbackCategory.create({
        data: {
          businessId,
          name: input.name!,
          description: input.description ?? null,
          type: input.type!,
          ratingScaleMin: input.type === 'RATING' ? input.ratingScaleMin ?? null : null,
          ratingScaleMax: input.type === 'RATING' ? input.ratingScaleMax ?? null : null,
          isEnabled: input.isEnabled ?? true,
          sortOrder: input.sortOrder ?? 0,
        },
      });

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: userId,
          action: 'FEEDBACK_CATEGORY_CREATED',
          entityType: 'FeedbackCategory',
          entityId: created.id,
          newValues: {
            name: created.name,
            type: created.type,
            ratingScaleMin: created.ratingScaleMin,
            ratingScaleMax: created.ratingScaleMax,
          },
        },
        tx
      );

      return created;
    });

    return this.mapCategory(category, 0);
  }

  /** Admin management view — includes disabled categories. */
  async listCategories(businessId: string, userId: string) {
    await feedbackAccessService.assertFeedbackAccess(businessId, userId, 'FEEDBACK_VIEW');

    const categories = await prisma.feedbackCategory.findMany({
      where: { businessId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { responses: true } } },
    });

    return categories.map((category) => this.mapCategory(category, category._count.responses));
  }

  /** Customer-facing view — only enabled categories. */
  async listEnabledCategories(businessId: string) {
    return prisma.feedbackCategory.findMany({
      where: { businessId, isEnabled: true },
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
  }

  async updateCategory(categoryId: string, userId: string, input: FeedbackCategoryInput) {
    const category = await prisma.feedbackCategory.findUnique({ where: { id: categoryId } });

    if (!category) {
      throw new ApiError(404, 'Feedback category not found', ErrorCodes.FEEDBACK_CATEGORY_NOT_FOUND);
    }

    await feedbackAccessService.assertFeedbackAccess(category.businessId, userId, 'FEEDBACK_MANAGE');

    const finalType = input.type ?? category.type;
    const finalMin = input.ratingScaleMin !== undefined ? input.ratingScaleMin : category.ratingScaleMin;
    const finalMax = input.ratingScaleMax !== undefined ? input.ratingScaleMax : category.ratingScaleMax;

    const configChanged =
      finalType !== category.type ||
      finalMin !== category.ratingScaleMin ||
      finalMax !== category.ratingScaleMax;

    if (configChanged) {
      const responseCount = await prisma.feedbackResponse.count({ where: { feedbackCategoryId: categoryId } });
      if (responseCount > 0) {
        throw new ApiError(
          409,
          'This category already has responses; its type and rating scale cannot be changed',
          ErrorCodes.FEEDBACK_CATEGORY_IMMUTABLE
        );
      }
    }

    this.validateCategoryConfig(finalType, finalMin, finalMax);

    if (input.name && input.name !== category.name) {
      const duplicate = await prisma.feedbackCategory.findFirst({
        where: { businessId: category.businessId, name: input.name, id: { not: categoryId } },
        select: { id: true },
      });

      if (duplicate) {
        throw new ApiError(409, 'A feedback category with this name already exists', ErrorCodes.FEEDBACK_CATEGORY_DUPLICATE);
      }
    }

    const changes: Prisma.FeedbackCategoryUpdateInput = {};
    if (input.name !== undefined) changes.name = input.name;
    if (input.description !== undefined) changes.description = input.description;
    if (input.type !== undefined) changes.type = input.type;
    if (input.ratingScaleMin !== undefined) changes.ratingScaleMin = input.ratingScaleMin;
    if (input.ratingScaleMax !== undefined) changes.ratingScaleMax = input.ratingScaleMax;
    if (input.isEnabled !== undefined) changes.isEnabled = input.isEnabled;
    if (input.sortOrder !== undefined) changes.sortOrder = input.sortOrder;

    if (Object.keys(changes).length === 0) {
      const responseCount = await prisma.feedbackResponse.count({ where: { feedbackCategoryId: categoryId } });
      return this.mapCategory(category, responseCount);
    }

    const disabling = input.isEnabled === false && category.isEnabled === true;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.feedbackCategory.update({ where: { id: categoryId }, data: changes });

      await auditLogService.createAuditLog(
        {
          businessId: category.businessId,
          actorId: userId,
          action: disabling ? 'FEEDBACK_CATEGORY_DISABLED' : 'FEEDBACK_CATEGORY_UPDATED',
          entityType: 'FeedbackCategory',
          entityId: categoryId,
          oldValues: {
            name: category.name,
            type: category.type,
            ratingScaleMin: category.ratingScaleMin,
            ratingScaleMax: category.ratingScaleMax,
            isEnabled: category.isEnabled,
            sortOrder: category.sortOrder,
          },
          newValues: {
            name: result.name,
            type: result.type,
            ratingScaleMin: result.ratingScaleMin,
            ratingScaleMax: result.ratingScaleMax,
            isEnabled: result.isEnabled,
            sortOrder: result.sortOrder,
          },
        },
        tx
      );

      return result;
    });

    const responseCount = await prisma.feedbackResponse.count({ where: { feedbackCategoryId: categoryId } });
    return this.mapCategory(updated, responseCount);
  }
}

export const feedbackCategoryService = new FeedbackCategoryService();
