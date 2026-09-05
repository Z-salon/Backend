import { z } from 'zod';
import { isValidPhone } from '../../../utils/phone';
import { CustomerStatus } from '@prisma/client';

const phoneValidation = z
  .string()
  .min(1, 'Phone number is required')
  .refine((val) => isValidPhone(val), {
    message: 'Invalid phone number format',
  });

export const customerPhoneSchema = z.object({
  phone: phoneValidation,
  isPrimary: z.boolean().default(false),
});

export const createCustomerSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  phones: z.array(customerPhoneSchema).optional().default([]),
});

export const updateCustomerSchema = z.object({
  firstName: z.string().trim().min(1, 'First name cannot be empty').optional(),
  lastName: z.string().trim().min(1, 'Last name cannot be empty').optional(),
});

export const matchCustomerSchema = z.object({
  phone: phoneValidation,
});

export const addCustomerPhoneSchema = z.object({
  phone: phoneValidation,
  isPrimary: z.boolean().default(false),
});

export const getCustomersQuerySchema = z.object({
  q: z.string().optional(),
  phone: z.string().optional(),
  status: z.nativeEnum(CustomerStatus).optional(),
  page: z.preprocess((val) => (val !== undefined ? Number(val) : 1), z.number().int().min(1).default(1)),
  limit: z.preprocess((val) => (val !== undefined ? Number(val) : 20), z.number().int().min(1).max(100).default(20)),
});
