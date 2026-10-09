import { z } from 'zod';
import { FeedbackCategoryType, FeedbackExpiryMode } from '@prisma/client';

const ratingBound = z.number().int().min(0).max(10).nullable();

export const feedbackCategoryCreateSchema = z
  .object({
    name: z.string().min(1, 'name is required').max(100),
    description: z.string().max(1000).nullable().optional(),
    type: z.nativeEnum(FeedbackCategoryType, { required_error: 'type is required' }),
    ratingScaleMin: ratingBound.optional(),
    ratingScaleMax: ratingBound.optional(),
    isEnabled: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
  })
  .strict();

export const feedbackCategoryUpdateSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(1000).nullable().optional(),
    type: z.nativeEnum(FeedbackCategoryType).optional(),
    ratingScaleMin: ratingBound.optional(),
    ratingScaleMax: ratingBound.optional(),
    isEnabled: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export const feedbackResponseInputSchema = z
  .object({
    category_id: z.string().uuid('category_id must be a valid UUID'),
    rating_value: z.number().int().optional(),
    text_response: z.string().max(5000).optional(),
    boolean_response: z.boolean().optional(),
  })
  .strict();

export const feedbackSubmitSchema = z
  .object({
    token: z.string().min(1, 'token is required').max(200),
    is_anonymous: z.boolean().default(false),
    idempotency_key: z.string().max(200).optional(),
    idempotencyKey: z.string().max(200).optional(),
    responses: z
      .array(feedbackResponseInputSchema)
      .min(1, 'At least one response is required')
      .max(50, 'Too many responses in one submission'),
  })
  .strict();

export const feedbackSettingsUpdateSchema = z
  .object({
    feedbackEnabled: z.boolean().optional(),
    feedbackExpiryMode: z.nativeEnum(FeedbackExpiryMode).optional(),
    feedbackCustomExpiryDays: z.number().int().min(1, 'Custom expiry days must be at least 1').max(365, 'Custom expiry days cannot exceed 365').nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  })
  .refine(
    (data) => {
      if (data.feedbackExpiryMode === 'CUSTOM' && (data.feedbackCustomExpiryDays === null || data.feedbackCustomExpiryDays === undefined)) {
        return false;
      }
      return true;
    },
    {
      message: 'feedbackCustomExpiryDays is required when feedbackExpiryMode is CUSTOM',
      path: ['feedbackCustomExpiryDays'],
    }
  );

export type FeedbackSubmitSchemaInput = z.infer<typeof feedbackSubmitSchema>;
export type FeedbackSettingsUpdateInput = z.infer<typeof feedbackSettingsUpdateSchema>;
