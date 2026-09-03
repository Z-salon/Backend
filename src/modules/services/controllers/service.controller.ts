import { Request, Response, NextFunction } from 'express';
import { serviceService } from '../services/service.service';
import { successResponse } from '../../../utils/api-response';

export class ServiceController {
  async createService(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.params.businessId;
      const userId = req.auth!.userId;
      const result = await serviceService.createService(businessId, userId, req.body);
      res.status(201).json(successResponse('Service created successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async getServices(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.params.businessId;
      const userId = req.auth!.userId;
      const { branchId, categoryId, status } = req.query;

      const result = await serviceService.getServices(businessId, userId, {
        branchId: branchId as string,
        categoryId: categoryId as string,
        status: status as any,
      });

      res.status(200).json(successResponse('Services retrieved successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async getServiceById(req: Request, res: Response, next: NextFunction) {
    try {
      const serviceId = req.params.serviceId;
      const userId = req.auth!.userId;
      const result = await serviceService.getServiceById(serviceId, userId);
      res.status(200).json(successResponse('Service details retrieved successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async updateService(req: Request, res: Response, next: NextFunction) {
    try {
      const serviceId = req.params.serviceId;
      const userId = req.auth!.userId;
      const result = await serviceService.updateService(serviceId, userId, req.body);
      res.status(200).json(successResponse('Service updated successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async addServiceToBranch(req: Request, res: Response, next: NextFunction) {
    try {
      const serviceId = req.params.serviceId;
      const { branchId } = req.body;
      const userId = req.auth!.userId;
      const result = await serviceService.addServiceToBranch(serviceId, userId, branchId);
      res.status(201).json(successResponse('Service assigned to branch successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async getServiceBranches(req: Request, res: Response, next: NextFunction) {
    try {
      const serviceId = req.params.serviceId;
      const userId = req.auth!.userId;
      const result = await serviceService.getServiceBranches(serviceId, userId);
      res.status(200).json(successResponse('Service branch assignments retrieved successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async updateServiceBranchAssignment(req: Request, res: Response, next: NextFunction) {
    try {
      const { serviceId, branchId } = req.params;
      const { isActive } = req.body;
      const userId = req.auth!.userId;
      const result = await serviceService.updateServiceBranchAssignment(
        serviceId,
        branchId,
        userId,
        isActive
      );
      res.status(200).json(successResponse('Service branch assignment updated successfully', result));
    } catch (error) {
      next(error);
    }
  }
}

export const serviceController = new ServiceController();
