import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { availabilityService } from '../availability/availability.service';
import { GetAvailableSlotsInput, ValidateSlotInput } from '../availability/availability.types';
import { getBranchOperatingIntervals, getStaffEffectiveIntervals } from '../availability/staff-availability.service';
import { prisma } from '../../../libs/prisma';
import { DateTime } from 'luxon';

const getAvailabilitySchema = z.object({
  branchId: z.string().uuid('branchId must be a valid UUID'),
  serviceId: z.string().uuid('serviceId must be a valid UUID'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format'),
  staffId: z.string().uuid('staffId must be a valid UUID').optional(),
  source: z.enum(['PUBLIC', 'INTERNAL']).optional(),
});

const validateSlotSchema = z.object({
  branchId: z.string().uuid('branchId must be a valid UUID'),
  serviceId: z.string().uuid('serviceId must be a valid UUID'),
  staffId: z.string().uuid('staffId must be a valid UUID'),
  startTime: z.string().min(1, 'startTime is required'),
  source: z.enum(['PUBLIC', 'INTERNAL']).optional(),
});

const intervalDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format'),
});

function serializeIntervals(intervals: { start: DateTime; end: DateTime }[]) {
  return intervals.map((interval) => ({
    start: interval.start.toISO(),
    end: interval.end.toISO(),
  }));
}

export class AvailabilityController {
  /**
   * GET /api/v1/businesses/:businessId/branches/:branchId/operating-intervals
   * Returns the branch's effective operating intervals for a local date.
   */
  async getBranchOperatingIntervals(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, branchId } = req.params;
      const parsed = intervalDateSchema.safeParse(req.query);

      if (!parsed.success) {
        res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          errors: parsed.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
        });
        return;
      }

      const branch = await prisma.branch.findFirst({
        where: { id: branchId, businessId },
        select: { id: true, timezone: true },
      });

      if (!branch) {
        res.status(404).json({ success: false, message: 'Branch not found in this business' });
        return;
      }

      const date = DateTime.fromISO(parsed.data.date, { zone: branch.timezone });
      if (!date.isValid) {
        res.status(400).json({ success: false, message: 'Invalid date' });
        return;
      }

      const intervals = await getBranchOperatingIntervals(branch.id, date, branch.timezone);
      res.status(200).json({
        success: true,
        data: {
          businessId,
          branchId: branch.id,
          date: parsed.data.date,
          timezone: branch.timezone,
          intervals: serializeIntervals(intervals),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/businesses/:businessId/branches/:branchId/staff/:staffId/effective-intervals
   * Returns staff availability after branch hours, breaks, time off, and appointments.
   */
  async getStaffEffectiveIntervals(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, branchId, staffId } = req.params;
      const parsed = intervalDateSchema.safeParse(req.query);

      if (!parsed.success) {
        res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          errors: parsed.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
        });
        return;
      }

      const [branch, staff] = await Promise.all([
        prisma.branch.findFirst({
          where: { id: branchId, businessId },
          select: { id: true, timezone: true },
        }),
        prisma.staff.findFirst({
          where: { id: staffId, businessId, branchId },
          select: { id: true },
        }),
      ]);

      if (!branch) {
        res.status(404).json({ success: false, message: 'Branch not found in this business' });
        return;
      }

      if (!staff) {
        res.status(404).json({ success: false, message: 'Staff member not found in this branch' });
        return;
      }

      const date = DateTime.fromISO(parsed.data.date, { zone: branch.timezone });
      if (!date.isValid) {
        res.status(400).json({ success: false, message: 'Invalid date' });
        return;
      }

      const intervals = await getStaffEffectiveIntervals(
        staff.id,
        branch.id,
        date,
        branch.timezone
      );

      res.status(200).json({
        success: true,
        data: {
          businessId,
          branchId: branch.id,
          staffId: staff.id,
          date: parsed.data.date,
          timezone: branch.timezone,
          intervals: serializeIntervals(intervals),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/businesses/:businessId/availability
   * Public endpoint for customers to query available booking slots.
   */
  async getAvailableSlots(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId } = req.params;
      const parsed = getAvailabilitySchema.safeParse(req.query);

      if (!parsed.success) {
        res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          errors: parsed.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
        });
        return;
      }

      const input: GetAvailableSlotsInput = {
        businessId,
        branchId: parsed.data.branchId,
        serviceId: parsed.data.serviceId,
        date: parsed.data.date,
        staffId: parsed.data.staffId,
        source: parsed.data.source ?? 'PUBLIC',
      };

      const result = await availabilityService.getAvailableSlots(input);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/businesses/:businessId/availability/validate
   * Validates whether a specific slot is still available.
   */
  async validateSlot(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId } = req.params;
      const parsed = validateSlotSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          errors: parsed.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
        });
        return;
      }

      const input: ValidateSlotInput = {
        businessId,
        branchId: parsed.data.branchId,
        serviceId: parsed.data.serviceId,
        staffId: parsed.data.staffId,
        startTime: parsed.data.startTime,
        source: parsed.data.source ?? 'PUBLIC',
      };

      const result = await availabilityService.validateSlot(input);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const availabilityController = new AvailabilityController();
