import { z } from 'zod';
import { ServiceCategoryStatus, ServiceStatus, EmployeeAssignmentMode, DepositPolicyType } from '@prisma/client';

export const createServiceCategorySchema = z.object({
  name: z.string({ required_error: 'Category name is required' }).min(1, 'Category name cannot be empty').max(250).trim(),
  description: z.string().optional(),
  branchIds: z.array(z.string().uuid('Invalid branch ID')).min(1, 'At least one branch is required')
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Duplicate branch IDs are not allowed',
    }),
});

export const updateServiceCategorySchema = z.object({
  name: z.string().min(1, 'Category name cannot be empty').max(250).trim().optional(),
  description: z.string().nullable().optional(),
  status: z.nativeEnum(ServiceCategoryStatus).optional(),
});

export const assignCategoryBranchSchema = z.object({
  branchId: z.string().uuid('Invalid branch ID'),
});

export const updateCategoryBranchAssignmentSchema = z.object({
  isActive: z.boolean({ required_error: 'isActive is required' }),
});

export const createServiceSchema = z.object({
  categoryId: z.string({ required_error: 'Category ID is required' }).uuid('Invalid category ID'),
  name: z.string({ required_error: 'Service name is required' }).min(1, 'Service name cannot be empty').max(250).trim(),
  description: z.string().optional(),
  durationMinutes: z.number({ required_error: 'Duration is required' }).int().positive('Duration must be greater than 0'),
  price: z.union([z.string(), z.number()]).refine((val) => {
    const num = Number(val);
    return !isNaN(num) && num >= 0;
  }, { message: 'Price must be greater than or equal to 0' }),
  employeeAssignmentMode: z.nativeEnum(EmployeeAssignmentMode, {
    required_error: 'Employee assignment mode is required',
  }),
  showPriceToCustomer: z.boolean().optional().default(true),
  depositPolicyType: z.nativeEnum(DepositPolicyType).optional().default(DepositPolicyType.NONE),
  depositAmount: z.union([z.string(), z.number()]).nullable().optional(),
  branchIds: z.array(z.string().uuid('Invalid branch ID')).min(1, 'At least one branch is required')
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Duplicate branch IDs are not allowed',
    }),
});

export const updateServiceSchema = z.object({
  categoryId: z.string().uuid('Invalid category ID').optional(),
  name: z.string().min(1, 'Service name cannot be empty').max(250).trim().optional(),
  description: z.string().nullable().optional(),
  durationMinutes: z.number().int().positive('Duration must be greater than 0').optional(),
  price: z.union([z.string(), z.number()]).refine((val) => {
    const num = Number(val);
    return !isNaN(num) && num >= 0;
  }, { message: 'Price must be greater than or equal to 0' }).optional(),
  employeeAssignmentMode: z.nativeEnum(EmployeeAssignmentMode).optional(),
  showPriceToCustomer: z.boolean().optional(),
  depositPolicyType: z.nativeEnum(DepositPolicyType).optional(),
  depositAmount: z.union([z.string(), z.number()]).nullable().optional(),
  status: z.nativeEnum(ServiceStatus).optional(),
});

export const assignServiceBranchSchema = z.object({
  branchId: z.string().uuid('Invalid branch ID'),
});

export const updateServiceBranchAssignmentSchema = z.object({
  isActive: z.boolean({ required_error: 'isActive is required' }),
  durationMinutes: z.number().int().positive('Duration must be greater than 0').optional().nullable(),
  price: z.union([z.string(), z.number()]).refine((val) => {
    const num = Number(val);
    return !isNaN(num) && num >= 0;
  }, { message: 'Price must be greater than or equal to 0' }).optional().nullable(),
  bufferMinutes: z.number().int().min(0, 'Buffer minutes must be >= 0').optional(),
});
