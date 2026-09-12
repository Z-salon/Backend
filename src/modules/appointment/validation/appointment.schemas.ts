import { z } from 'zod';
import { AppointmentStatus, BookingSource } from '@prisma/client';

export const appointmentCreateSchema = z.object({
  branchId: z.string().uuid('Invalid branch ID'),
  customerId: z.string().uuid('Invalid customer ID'),
  serviceId: z.string().uuid('Invalid service ID'),
  staffId: z.string().uuid('staffId is required'),
  scheduledStart: z.string().datetime({ message: 'Invalid scheduled start datetime' }),
  // Client-supplied scheduledEnd is ignored; duration is derived server-side.
  scheduledEnd: z.string().datetime({ message: 'Invalid scheduled end datetime' }).optional(),
  notes: z.string().max(1000).optional(),
  internalNotes: z.string().max(1000).optional(),
  bookingSource: z.nativeEnum(BookingSource).default(BookingSource.ONLINE),
});

export const appointmentWalkInSchema = z.object({
  branchId: z.string().uuid('Invalid branch ID'),
  customerId: z.string().uuid('Invalid customer ID'),
  serviceId: z.string().uuid('Invalid service ID'),
  staffId: z.string().uuid('staffId is required'),
  scheduledStart: z.string().datetime({ message: 'Invalid scheduled start datetime' }).optional(),
  scheduledEnd: z.string().datetime({ message: 'Invalid scheduled end datetime' }).optional(),
  notes: z.string().max(1000).optional(),
  internalNotes: z.string().max(1000).optional(),
});

export const appointmentStaffBookingSchema = z.object({
  branchId: z.string().uuid('Invalid branch ID'),
  customerId: z.string().uuid('Invalid customer ID'),
  serviceId: z.string().uuid('Invalid service ID'),
  staffId: z.string().uuid('staffId is required'),
  scheduledStart: z.string().datetime({ message: 'Invalid scheduled start datetime' }),
  scheduledEnd: z.string().datetime({ message: 'Invalid scheduled end datetime' }).optional(),
  notes: z.string().max(1000).optional(),
  internalNotes: z.string().max(1000).optional(),
  bookingSource: z.enum(['STAFF', 'PHONE']).default('STAFF'),
  paymentMethodId: z.string().uuid('Invalid payment method ID').optional(),
  amount: z.number().positive().optional(),
  paymentReference: z.string().max(200).optional(),
});

export const publicBookingSchema = z.object({
  verificationToken: z.string().min(1, 'OTP verification token is required'),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().min(1),
  branchId: z.string().uuid('Invalid branch ID'),
  serviceId: z.string().uuid('Invalid service ID'),
  staffId: z.string().uuid('staffId is required'),
  scheduledStart: z.string().datetime({ message: 'Invalid scheduled start datetime' }),
  scheduledEnd: z.string().datetime({ message: 'Invalid scheduled end datetime' }).optional(),
  notes: z.string().max(1000).optional(),
});

export const publicReceiptSchema = z.object({
  paymentMethodId: z.string().uuid('Invalid payment method ID'),
  submittedAmount: z.number().positive().optional(),
  receiptImageUrl: z.string().url('A valid receipt image URL is required'),
  customerNote: z.string().max(1000).optional(),
});

export const appointmentUpdateSchema = z.object({
  notes: z.string().max(1000).nullable().optional(),
  internalNotes: z.string().max(1000).nullable().optional(),
}).strict().refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

export const appointmentRescheduleSchema = z.object({
  newStartTime: z.string().datetime({ message: 'Invalid start datetime' }),
  reason: z.string().max(500).optional(),
  staffId: z.string().uuid('Invalid staff ID').optional(),
});

export const appointmentServiceChangeSchema = z.object({
  serviceId: z.string().uuid('Invalid service ID'),
});

export const appointmentStatusUpdateSchema = z.object({
  status: z.nativeEnum(AppointmentStatus, { required_error: 'Status is required' }),
  reason: z.string().max(500).optional(),
});

export const appointmentListQuerySchema = z.object({
  branchId: z.string().uuid('Invalid branch ID').optional(),
  customerId: z.string().uuid('Invalid customer ID').optional(),
  serviceId: z.string().uuid('Invalid service ID').optional(),
  staffId: z.string().uuid('Invalid staff ID').optional(),
  status: z.nativeEnum(AppointmentStatus).optional(),
  bookingSource: z.nativeEnum(BookingSource).optional(),
  startDate: z.string().datetime({ message: 'Invalid start date format' }).optional(),
  endDate: z.string().datetime({ message: 'Invalid end date format' }).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const appointmentStaffAssignSchema = z.object({
  staffId: z.string().uuid('staffId is required'),
});

export const appointmentStatusTransitionSchema = z.object({
  status: z.nativeEnum(AppointmentStatus, { required_error: 'Status is required' }),
  reason: z.string().max(500).optional(),
});