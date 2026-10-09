import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { FollowUpOutcome } from '@prisma/client';
import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { appointmentFollowUpService } from '../services/appointment-follow-up.service';
import { appointmentService } from '../services/appointment.service';

const ListQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  status: z.enum(['OPEN', 'RESOLVED', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const ResolveBodySchema = z.object({
  outcome: z.nativeEnum(FollowUpOutcome),
  note: z.string().max(1000).optional(),
  newStartTime: z.string().datetime().optional(),
  staffId: z.string().uuid().optional(),
});

const ReopenBodySchema = z.object({
  note: z.string().max(1000).optional(),
});

export class AppointmentFollowUpController {
  private async assertAppointmentAccess(businessId: string, userId: string, appointmentId: string) {
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment || appointment.businessId !== businessId) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }
    await appointmentService.verifyAppointmentAccess(businessId, userId, appointment);
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const userId = req.auth!.userId;
      const query = ListQuerySchema.parse(req.query);
      const result = await appointmentFollowUpService.list(businessId, userId, query);
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  /** Warning/indicator data for the appointment detail page. */
  async getForAppointment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const appointmentId = req.params.appointmentId;
      const userId = req.auth!.userId;
      await this.assertAppointmentAccess(businessId, userId, appointmentId);
      const result = await appointmentFollowUpService.getForAppointment(businessId, appointmentId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async resolve(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const followUpId = req.params.followUpId;
      const userId = req.auth!.userId;
      const input = ResolveBodySchema.parse(req.body);
      const result = await appointmentFollowUpService.resolve(businessId, userId, followUpId, input);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async reopen(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const followUpId = req.params.followUpId;
      const userId = req.auth!.userId;
      const { note } = ReopenBodySchema.parse(req.body ?? {});
      const followUp = await appointmentFollowUpService.reopen(businessId, userId, followUpId, note);
      res.status(201).json({ success: true, data: followUp });
    } catch (error) {
      next(error);
    }
  }

  async reminderHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const appointmentId = req.params.appointmentId;
      const userId = req.auth!.userId;
      await this.assertAppointmentAccess(businessId, userId, appointmentId);
      const history = await appointmentFollowUpService.getReminderHistory(businessId, appointmentId);
      res.json({ success: true, data: history });
    } catch (error) {
      next(error);
    }
  }
}

export const appointmentFollowUpController = new AppointmentFollowUpController();
