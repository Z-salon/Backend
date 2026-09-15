import { Request, Response, NextFunction } from 'express';
import { batchCreateService } from '../services/batch-create.service';
import { successResponse } from '../../../utils/api-response';

export class BatchCreateController {
  /**
   * Batch create branches
   */
  async createBranches(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const userId = req.auth!.userId;

      const branches = await batchCreateService.createBranches(businessId, userId, req.body);

      res.status(201).json(successResponse('Branches created successfully', { count: branches.length, items: branches }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Batch create services
   */
  async createServices(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const userId = req.auth!.userId;

      const services = await batchCreateService.createServices(businessId, req.auth!.userId, req.body);

      res.status(201).json(successResponse('Services created successfully', services));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Batch create staff
   */
  async createStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const userId = req.auth!.userId;

      const staff = await batchCreateService.createStaff(businessId, req.auth!.userId, req.body);

      res.status(201).json(successResponse('Staff created successfully', staff));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Batch create payment methods
   */
  async createPaymentMethods(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const userId = req.auth!.userId;

      const methods = await batchCreateService.createPaymentMethods(businessId, req.auth!.userId, req.body);

      res.status(201).json(successResponse('Payment methods created successfully', methods));
    } catch (error) {
      next(error);
    }
  }
}

export const batchCreateController = new BatchCreateController();