import { Request, Response, NextFunction } from 'express';
import { staffService } from '../services/staff.service';
import { successResponse } from '../../../utils/api-response';

export class StaffController {
  async createStaff(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.params.businessId;
      const userId = req.auth!.userId;
      const result = await staffService.createStaff(businessId, userId, req.body);
      res.status(201).json(successResponse('Staff created successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async getBusinessStaff(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.params.businessId;
      const userId = req.auth!.userId;
      const { branchId, status } = req.query;

      const result = await staffService.getBusinessStaff(businessId, userId, {
        branchId: branchId as string,
        status: status as any,
      });

      res.status(200).json(successResponse('Staff retrieved successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async getStaffDetails(req: Request, res: Response, next: NextFunction) {
    try {
      // staffId-based routes don't have businessId in params, resolve from staff
      const staffId = req.params.staffId;
      const userId = req.auth!.userId;

      // getStaffDetails needs businessId; we find it from the staff record then verify membership
      const { prisma } = await import('../../../libs/prisma');
      const { ApiError, ErrorCodes } = await import('../../../utils/api-error');
      const staff = await prisma.staff.findUnique({ where: { id: staffId } });
      if (!staff) {
        throw ApiError.notFound('Staff not found', ErrorCodes.NOT_FOUND);
      }

      const result = await staffService.getStaffDetails(staff.businessId, staffId, userId);
      res.status(200).json(successResponse('Staff details retrieved successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async updateStaff(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = req.params.staffId;
      const userId = req.auth!.userId;

      const { prisma } = await import('../../../libs/prisma');
      const { ApiError, ErrorCodes } = await import('../../../utils/api-error');
      const staff = await prisma.staff.findUnique({ where: { id: staffId } });
      if (!staff) {
        throw ApiError.notFound('Staff not found', ErrorCodes.NOT_FOUND);
      }

      const result = await staffService.updateStaff(staff.businessId, staffId, userId, req.body);
      res.status(200).json(successResponse('Staff updated successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async moveStaffBranch(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = req.params.staffId;
      const userId = req.auth!.userId;
      const { branchId } = req.body;

      const { prisma } = await import('../../../libs/prisma');
      const { ApiError, ErrorCodes } = await import('../../../utils/api-error');
      const staff = await prisma.staff.findUnique({ where: { id: staffId } });
      if (!staff) {
        throw ApiError.notFound('Staff not found', ErrorCodes.NOT_FOUND);
      }

      const result = await staffService.moveStaffBranch(staff.businessId, staffId, userId, branchId);
      res.status(200).json(successResponse('Staff branch updated successfully', result));
    } catch (error) {
      next(error);
    }
  }
}

export const staffController = new StaffController();
