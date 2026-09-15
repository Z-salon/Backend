import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { customerConfirmationService } from '../services/customer-confirmation.service';

const TokenParamsSchema = z.object({
  token: z.string().min(1),
});

const CancelBodySchema = z.object({
  reason: z.string().optional(),
});

const RescheduleBodySchema = z.object({
  newStartTime: z.string().datetime(),
});

export class CustomerConfirmationController {
  
  async getAppointmentFromToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = TokenParamsSchema.parse(req.params);
      const appointment = await customerConfirmationService.getAppointmentFromToken(token);
      res.json({ success: true, data: appointment });
    } catch (error) {
      next(error);
    }
  }

  async confirmAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = TokenParamsSchema.parse(req.params);
      const updated = await customerConfirmationService.confirmAppointment(token);
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  async cancelAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = TokenParamsSchema.parse(req.params);
      const { reason } = CancelBodySchema.parse(req.body);
      const cancelled = await customerConfirmationService.cancelAppointment(token, reason);
      res.json({ success: true, data: cancelled });
    } catch (error) {
      next(error);
    }
  }

  async rescheduleAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = TokenParamsSchema.parse(req.params);
      const { newStartTime } = RescheduleBodySchema.parse(req.body);
      const rescheduled = await customerConfirmationService.rescheduleAppointment(token, newStartTime);
      res.json({ success: true, data: rescheduled });
    } catch (error) {
      next(error);
    }
  }
}

export const customerConfirmationController = new CustomerConfirmationController();
