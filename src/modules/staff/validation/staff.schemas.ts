import { z } from 'zod';
import { StaffStatus, ProficiencyLevel } from '@prisma/client';

export const phoneSchema = z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid phone number format. Use E.164 format (e.g., +2519XXXXXXXX)').optional();

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const timeStringSchema = z.string().regex(timeRegex, 'Time must be in HH:mm format');

const intervalSchema = z.object({
  start: timeStringSchema,
  end: timeStringSchema,
}).refine(data => data.start < data.end, {
  message: 'Start time must be before end time',
  path: ['start'],
});

const noOverlapRefinement = (intervals: { start: string; end: string }[], ctx: z.RefinementCtx) => {
  const sorted = [...intervals].sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].end > sorted[i + 1].start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Intervals cannot overlap',
      });
      break;
    }
  }
};

export const createStaffSchema = z.object({
  branchId: z.string().uuid(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional(),
  phone: phoneSchema,
  title: z.string().max(100).optional(),
  bio: z.string().max(1000).optional(),
});

export const updateStaffSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  phone: phoneSchema,
  title: z.string().max(100).optional(),
  bio: z.string().max(1000).optional(),
  status: z.nativeEnum(StaffStatus).optional(),
});

export const moveStaffBranchSchema = z.object({
  branchId: z.string().uuid(),
});

export const addCategoryQualificationSchema = z.object({
  categoryId: z.string().uuid(),
});

export const addServiceQualificationSchema = z.object({
  serviceId: z.string().uuid(),
  proficiencyLevel: z.nativeEnum(ProficiencyLevel).default('SENIOR'),
});

export const updateWeeklyHoursSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  isWorking: z.boolean(),
  intervals: z.array(intervalSchema).superRefine(noOverlapRefinement),
}).refine(data => {
  if (data.isWorking && data.intervals.length === 0) {
    return false;
  }
  if (!data.isWorking && data.intervals.length > 0) {
    return false;
  }
  return true;
}, {
  message: 'Working day must have intervals, OFF day must not have intervals',
  path: ['intervals'],
});

export const createWeeklyBreakSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  start: timeStringSchema,
  end: timeStringSchema,
}).refine(data => data.start < data.end, {
  message: 'Break start time must be before end time',
  path: ['start'],
});

export const updateWeeklyBreakSchema = z.object({
  start: timeStringSchema.optional(),
  end: timeStringSchema.optional(),
}).refine(data => {
  if (data.start && data.end) {
    return data.start < data.end;
  }
  return true;
}, {
  message: 'Break start time must be before end time',
  path: ['start'],
});

export const updateScheduleOverrideSchema = z.object({
  isWorking: z.boolean(),
  intervals: z.array(intervalSchema).superRefine(noOverlapRefinement),
}).refine(data => {
  if (data.isWorking && data.intervals.length === 0) {
    return false;
  }
  if (!data.isWorking && data.intervals.length > 0) {
    return false;
  }
  return true;
}, {
  message: 'Working override must have intervals, OFF override must not have intervals',
  path: ['intervals'],
});

export const updateBreakOverrideSchema = z.object({
  intervals: z.array(intervalSchema).superRefine(noOverlapRefinement),
});

export const createTimeOffSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  allDay: z.boolean(),
  start: timeStringSchema.optional(),
  end: timeStringSchema.optional(),
  reason: z.string().max(500).optional(),
}).refine(data => {
  if (data.allDay) {
    if (data.start || data.end) return false;
  } else {
    if (!data.start || !data.end) return false;
    if (data.start >= data.end) return false;
  }
  return true;
}, {
  message: 'Invalid time off configuration (check allDay and start/end times)',
  path: ['allDay'],
});

export const updateTimeOffSchema = z.object({
  allDay: z.boolean().optional(),
  start: timeStringSchema.optional(),
  end: timeStringSchema.optional(),
  reason: z.string().max(500).optional(),
});
