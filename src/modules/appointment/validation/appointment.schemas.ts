import { z } from 'zod';
import { AppointmentStatus, BookingSource } from '@prisma/client';

export const appointmentCreateSchema = z.object({
  branchId: z.string().uuid('Invalid branch ID'),
  customerId: z.string().uuid('Invalid customer ID'),
  serviceId: z.string().uuid('Invalid service ID'),
  staffId: z.string().uuid('Invalid staff ID').optional(),
  scheduledStart: z.string().datetime({ message: 'Invalid scheduled start datetime' }),
  scheduledEnd: z.string().datetime({ message: 'Invalid scheduled end datetime' }),
  notes: z.string().max(1000).optional(),
  internalNotes: z.string().max(1000).optional(),
  bookingSource: z.nativeEnum(BookingSource).default(BookingSource.ONLINE),
});

export const appointmentUpdateSchema = z.object({
  scheduledStart: z.string().datetime({ message: 'Invalid scheduled start datetime' }).optional(),
  scheduledEnd: z.string().datetime({ message: 'Invalid scheduled end datetime' }).optional(),
  staffId: z.string().uuid('Invalid staff ID').nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  internalNotes: z.string().max(1000).nullable().optional(),
  status: z.nativeEnum(AppointmentStatus).optional(),
}).strict().refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
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
  staffId: z.string().uuid('Invalid staff ID'),
});

export const appointmentStatusTransitionSchema = z.object({
  status: z.nativeEnum(AppointmentStatus, { required_error: 'Status is required' }),
  reason: z.string().max(500).optional(),
});