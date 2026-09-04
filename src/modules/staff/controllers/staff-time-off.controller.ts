import { Request, Response, NextFunction } from 'express';
import { staffTimeOffService } from '../services/staff-time-off.service';
import { successResponse } from '../../../utils/api-response';
import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';

async function resolveBusinessId(staffId: string): Promise<string> {
  const staff = await prisma.staff.findUnique({ where: { id: staffId } });
  if (!staff) throw ApiError.notFound('Staff not found', ErrorCodes.NOT_FOUND);
  return staff.businessId;
}

export class StaffTimeOffController {
  async createTimeOff(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = req.params.staffId;
      const userId = req.auth!.userId;
      const businessId = await resolveBusinessId(staffId);

      const result = await staffTimeOffService.createTimeOff(businessId, staffId, userId, req.body);
      res.status(201).json(successResponse('Time off created successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async getTimeOffs(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = req.params.staffId;
      const userId = req.auth!.userId;
      const businessId = await resolveBusinessId(staffId);
      const { from, to } = req.query;

      const result = await staffTimeOffService.getTimeOffs(businessId, staffId, userId, from as string, to as string);
      res.status(200).json(successResponse('Time offs retrieved successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async updateTimeOff(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = req.params.staffId;
      const timeOffId = req.params.timeOffId;
      const userId = req.auth!.userId;
      const businessId = await resolveBusinessId(staffId);

      const result = await staffTimeOffService.updateTimeOff(businessId, staffId, userId, timeOffId, req.body);
      res.status(200).json(successResponse('Time off updated successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async deleteTimeOff(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = req.params.staffId;
      const timeOffId = req.params.timeOffId;
      const userId = req.auth!.userId;
      const businessId = await resolveBusinessId(staffId);

      await staffTimeOffService.deleteTimeOff(businessId, staffId, userId, timeOffId);
      res.status(200).json(successResponse('Time off deleted successfully', null));
    } catch (error) {
      next(error);
    }
  }
}

export const staffTimeOffController = new StaffTimeOffController();
