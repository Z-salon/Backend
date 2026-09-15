import { Request, Response, NextFunction } from 'express';
import { branchPhoneService } from '../services/branch-phone.service';
import { successResponse } from '../../../utils/api-response';
import { normalizePhone } from '../../../utils/phone';

export class BranchPhoneController {
  async createBranchPhone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const userId = req.auth!.userId;
      const { phoneNumber, label, isPrimary } = req.body;

      const phone = await branchPhoneService.createBranchPhone(businessId, userId, req.params.branchId, {
        phoneNumber,
        label,
        isPrimary,
      });

      res.status(201).json(successResponse('Branch phone created successfully', phone));
    } catch (error) {
      next(error);
    }
  }

  async getBranchPhones(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const branchId = req.params.branchId;
      const userId = req.auth!.userId;

      const phones = await branchPhoneService.getBranchPhones(branchId, userId);

      res.json(successResponse('Branch phones retrieved successfully', phones));
    } catch (error) {
      next(error);
    }
  }

  async updateBranchPhone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const branchId = req.params.branchId;
      const phoneId = req.params.phoneId;
      const userId = req.auth!.userId;
      const input = req.body;

      const phone = await branchPhoneService.updateBranchPhone(branchId, userId, req.params.phoneId, input);

      res.json(successResponse('Branch phone updated successfully', phone));
    } catch (error) {
      next(error);
    }
  }

  async setPrimaryPhone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const branchId = req.params.branchId;
      const phoneId = req.params.phoneId;
      const userId = req.auth!.userId;

      const phone = await branchPhoneService.setPrimaryPhone(branchId, userId, req.params.phoneId);

      res.json(successResponse('Primary phone set successfully', phone));
    } catch (error) {
      next(error);
    }
  }

  async removeBranchPhone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const branchId = req.params.branchId;
      const phoneId = req.params.phoneId;
      const userId = req.auth!.userId;

      await branchPhoneService.removeBranchPhone(branchId, userId, req.params.phoneId);

      res.json(successResponse('Branch phone removed successfully'));
    } catch (error) {
      next(error);
    }
  }
}

export const branchPhoneController = new BranchPhoneController();