import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { availabilityService } from '../availability/availability.service';
import { GetAvailableSlotsInput, ValidateSlotInput } from '../availability/availability.types';

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

export class AvailabilityController {
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
