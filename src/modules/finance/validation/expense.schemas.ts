import { z } from 'zod';
import { ExpenseStatus } from '@prisma/client';

const moneyString = z.union([z.number(), z.string().min(1)]);

export const expenseCategoryCreateSchema = z
  .object({
    name: z.string().min(1, 'name is required').max(100),
    description: z.string().max(1000).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const expenseCategoryUpdateSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(1000).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export const expenseCreateSchema = z
  .object({
    branchId: z.string().uuid('branchId must be a valid UUID'),
    categoryId: z.string().uuid('categoryId must be a valid UUID'),
    amount: moneyString,
    amountPaid: moneyString.optional(),
    description: z.string().max(2000).nullable().optional(),
    vendor: z.string().max(255).nullable().optional(),
    receiptNumber: z.string().max(100).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    expenseDate: z.string().optional(),
    dueDate: z.string().nullable().optional(),
    paymentMethodId: z.string().uuid().nullable().optional(),
  })
  .strict();

export const expenseUpdateSchema = z
  .object({
    categoryId: z.string().uuid().optional(),
    amount: moneyString.optional(),
    description: z.string().max(2000).nullable().optional(),
    vendor: z.string().max(255).nullable().optional(),
    receiptNumber: z.string().max(100).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    expenseDate: z.string().optional(),
    dueDate: z.string().nullable().optional(),
    paymentMethodId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export const expensePaymentSchema = z
  .object({
    amount: moneyString,
    paymentMethodId: z.string().uuid().nullable().optional(),
    paidAt: z.string().optional(),
  })
  .strict();

export const expenseVoidSchema = z
  .object({
    reason: z.string().max(500).optional(),
  })
  .strict();

export const expenseStatusSchema = z.nativeEnum(ExpenseStatus);
