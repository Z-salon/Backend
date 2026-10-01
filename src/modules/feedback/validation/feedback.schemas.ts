import { z } from 'zod';
import { FeedbackCategoryType } from '@prisma/client';

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
    responses: z
      .array(feedbackResponseInputSchema)
      .min(1, 'At least one response is required')
      .max(50, 'Too many responses in one submission'),
  })
  .strict();

export type FeedbackSubmitSchemaInput = z.infer<typeof feedbackSubmitSchema>;
