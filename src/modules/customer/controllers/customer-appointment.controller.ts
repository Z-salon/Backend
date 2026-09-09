import { Request, Response, NextFunction } from 'express';
import { customerAppointmentService } from '../services/customer-appointment.service';
import { z } from 'zod';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'EXPIRED']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export class CustomerAppointmentController {
  async getCustomerAppointments(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.auth!.userId;
      const query = paginationSchema.parse(req.query);

      const result = await customerAppointmentService.getCustomerAppointments(userId, query);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async getCustomerAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.auth!.userId;
      const { appointmentId } = req.params;

      const appointment = await customerAppointmentService.getCustomerAppointment(userId, appointmentId);
      res.status(200).json({ success: true, data: appointment });
    } catch (error) {
      next(error);
    }
  }

  async rescheduleAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.auth!.userId;
      const { appointmentId } = req.params;
      
      const schema = z.object({
        newStartTime: z.string().datetime(),
        reason: z.string().min(1).optional(),
        staffId: z.string().uuid().optional()
      });
      const data = schema.parse(req.body);

      const result = await customerAppointmentService.rescheduleAppointment(userId, appointmentId, new Date(data.newStartTime), data.reason, data.staffId);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async cancelAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.auth!.userId;
      const { appointmentId } = req.params;

      const schema = z.object({
        reason: z.string().min(1).optional()
      });
      const data = schema.parse(req.body);

      const result = await customerAppointmentService.cancelAppointment(userId, appointmentId, data.reason);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
  
  async getAppointmentHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.auth!.userId;
      const { appointmentId } = req.params;

      const history = await customerAppointmentService.getAppointmentHistory(userId, appointmentId);
      res.status(200).json({ success: true, data: history });
    } catch (error) {
      next(error);
    }
  }
}

export const customerAppointmentController = new CustomerAppointmentController();
