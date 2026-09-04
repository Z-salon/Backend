import { Request, Response, NextFunction } from 'express';
import { staffQualificationService } from '../services/staff-qualification.service';
import { successResponse } from '../../../utils/api-response';
import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';

async function resolveBusinessId(staffId: string): Promise<string> {
  const staff = await prisma.staff.findUnique({ where: { id: staffId } });
  if (!staff) throw ApiError.notFound('Staff not found', ErrorCodes.NOT_FOUND);
  return staff.businessId;
}

export class StaffQualificationController {
  async addCategoryQualification(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = req.params.staffId;
      const userId = req.auth!.userId;
      const businessId = await resolveBusinessId(staffId);
      const { categoryId } = req.body;

      const result = await staffQualificationService.addCategoryQualification(businessId, staffId, userId, categoryId);
      res.status(201).json(successResponse('Category qualification added', result));
    } catch (error) {
      next(error);
    }
  }

  async removeCategoryQualification(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = req.params.staffId;
      const categoryId = req.params.categoryId;
      const userId = req.auth!.userId;
      const businessId = await resolveBusinessId(staffId);

      await staffQualificationService.removeCategoryQualification(businessId, staffId, userId, categoryId);
      res.status(200).json(successResponse('Category qualification removed', null));
    } catch (error) {
      next(error);
    }
  }

  async addServiceQualification(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = req.params.staffId;
      const userId = req.auth!.userId;
      const businessId = await resolveBusinessId(staffId);
      const { serviceId, proficiencyLevel } = req.body;

      const result = await staffQualificationService.addServiceQualification(businessId, staffId, userId, serviceId, proficiencyLevel);
      res.status(201).json(successResponse('Service qualification added', result));
    } catch (error) {
      next(error);
    }
  }

  async removeServiceQualification(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = req.params.staffId;
      const serviceId = req.params.serviceId;
      const userId = req.auth!.userId;
      const businessId = await resolveBusinessId(staffId);

      await staffQualificationService.removeServiceQualification(businessId, staffId, userId, serviceId);
      res.status(200).json(successResponse('Service qualification removed', null));
    } catch (error) {
      next(error);
    }
  }
}

export const staffQualificationController = new StaffQualificationController();
