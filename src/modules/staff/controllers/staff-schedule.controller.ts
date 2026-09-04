import { Request, Response, NextFunction } from 'express';
import { staffScheduleService } from '../services/staff-schedule.service';
import { staffValidationService } from '../services/staff-validation.service';
import { successResponse } from '../../../utils/api-response';
import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';

async function resolveBusinessId(staffId: string): Promise<string> {
  const staff = await prisma.staff.findUnique({ where: { id: staffId } });
  if (!staff) throw ApiError.notFound('Staff not found', ErrorCodes.NOT_FOUND);
  return staff.businessId;
}

export class StaffScheduleController {
  async getWeeklyHours(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = req.params.staffId;
      const userId = req.auth!.userId;
      const businessId = await resolveBusinessId(staffId);

      const result = await staffScheduleService.getWeeklyHours(businessId, staffId, userId);
      res.status(200).json(successResponse('Weekly hours retrieved successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async updateWeeklyHours(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = req.params.staffId;
      const userId = req.auth!.userId;
      const businessId = await resolveBusinessId(staffId);
      const { dayOfWeek, isWorking, intervals } = req.body;

      const result = await staffScheduleService.updateWeeklyHours(businessId, staffId, userId, dayOfWeek, isWorking, intervals);
      res.status(200).json(successResponse('Weekly hours updated successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async validateSchedule(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = req.params.staffId;
      const userId = req.auth!.userId;
      const businessId = await resolveBusinessId(staffId);

      const result = await staffValidationService.validateProposedSchedule(businessId, staffId, userId, req.body);
      res.status(200).json(successResponse('Schedule validation completed', result));
    } catch (error) {
      next(error);
    }
  }

  async getWeeklyBreaks(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = req.params.staffId;
      const userId = req.auth!.userId;
      const businessId = await resolveBusinessId(staffId);

      const result = await staffScheduleService.getWeeklyBreaks(businessId, staffId, userId);
      res.status(200).json(successResponse('Weekly breaks retrieved successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async createWeeklyBreak(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = req.params.staffId;
      const userId = req.auth!.userId;
      const businessId = await resolveBusinessId(staffId);
      const { dayOfWeek, start, end } = req.body;

      const result = await staffScheduleService.createWeeklyBreak(businessId, staffId, userId, dayOfWeek, start, end);
      res.status(201).json(successResponse('Weekly break created successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async updateWeeklyBreak(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = req.params.staffId;
      const breakId = req.params.breakId;
      const userId = req.auth!.userId;
      const businessId = await resolveBusinessId(staffId);
      const { start, end } = req.body;

      const result = await staffScheduleService.updateWeeklyBreak(businessId, staffId, userId, breakId, start, end);
      res.status(200).json(successResponse('Weekly break updated successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async deleteWeeklyBreak(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = req.params.staffId;
      const breakId = req.params.breakId;
      const userId = req.auth!.userId;
      const businessId = await resolveBusinessId(staffId);

      await staffScheduleService.deleteWeeklyBreak(businessId, staffId, userId, breakId);
      res.status(200).json(successResponse('Weekly break deleted successfully', null));
    } catch (error) {
      next(error);
    }
  }

  async getScheduleOverrides(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = req.params.staffId;
      const userId = req.auth!.userId;
      const businessId = await resolveBusinessId(staffId);
      const { from, to } = req.query;

      const result = await staffScheduleService.getScheduleOverrides(businessId, staffId, userId, from as string, to as string);
      res.status(200).json(successResponse('Schedule overrides retrieved', result));
    } catch (error) {
      next(error);
    }
  }

  async updateScheduleOverride(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = req.params.staffId;
      const date = req.params.date;
      const userId = req.auth!.userId;
      const businessId = await resolveBusinessId(staffId);
      const { isWorking, intervals } = req.body;

      const result = await staffScheduleService.updateScheduleOverride(businessId, staffId, userId, date, isWorking, intervals);
      res.status(200).json(successResponse('Schedule override updated', result));
    } catch (error) {
      next(error);
    }
  }

  async deleteScheduleOverride(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = req.params.staffId;
      const date = req.params.date;
      const userId = req.auth!.userId;
      const businessId = await resolveBusinessId(staffId);

      await staffScheduleService.deleteScheduleOverride(businessId, staffId, userId, date);
      res.status(200).json(successResponse('Schedule override deleted', null));
    } catch (error) {
      next(error);
    }
  }

  async getBreakOverrides(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = req.params.staffId;
      const userId = req.auth!.userId;
      const businessId = await resolveBusinessId(staffId);
      const { from, to } = req.query;

      const result = await staffScheduleService.getBreakOverrides(businessId, staffId, userId, from as string, to as string);
      res.status(200).json(successResponse('Break overrides retrieved', result));
    } catch (error) {
      next(error);
    }
  }

  async updateBreakOverride(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = req.params.staffId;
      const date = req.params.date;
      const userId = req.auth!.userId;
      const businessId = await resolveBusinessId(staffId);
      const { intervals } = req.body;

      const result = await staffScheduleService.updateBreakOverride(businessId, staffId, userId, date, intervals);
      res.status(200).json(successResponse('Break override updated', result));
    } catch (error) {
      next(error);
    }
  }

  async deleteBreakOverride(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = req.params.staffId;
      const date = req.params.date;
      const userId = req.auth!.userId;
      const businessId = await resolveBusinessId(staffId);

      await staffScheduleService.deleteBreakOverride(businessId, staffId, userId, date);
      res.status(200).json(successResponse('Break override deleted', null));
    } catch (error) {
      next(error);
    }
  }
}

export const staffScheduleController = new StaffScheduleController();
