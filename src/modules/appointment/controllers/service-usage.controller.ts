import { Request, Response, NextFunction } from 'express';
import { serviceUsageService } from '../services/service-usage.service';
import { successResponse } from '../../../utils/api-response';

export class ServiceUsageController {
  async addServiceUsage(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, id: appointmentId } = req.params;
      const recordedById = req.auth!.userId;
      const { serviceId, serviceName, serviceDetails, productsUsed, notes } = req.body;

      const usage = await serviceUsageService.addServiceUsage(
        appointmentId,
        businessId,
        recordedById,
        { serviceId, serviceName, serviceDetails, productsUsed, notes }
      );

      res.status(201).json(successResponse('Service usage recorded', usage));
    } catch (err) {
      next(err);
    }
  }

  async getServiceUsages(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, id: appointmentId } = req.params;
      const usages = await serviceUsageService.getServiceUsages(appointmentId, businessId);
      res.json(successResponse('Service usages retrieved', usages));
    } catch (err) {
      next(err);
    }
  }

  async updateServiceUsage(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, usageId } = req.params;
      const actorId = req.auth!.userId;
      const usage = await serviceUsageService.updateServiceUsage(usageId, businessId, actorId, req.body);
      res.json(successResponse('Service usage updated', usage));
    } catch (err) {
      next(err);
    }
  }

  async deleteServiceUsage(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, usageId } = req.params;
      await serviceUsageService.deleteServiceUsage(usageId, businessId);
      res.json(successResponse('Service usage deleted', null));
    } catch (err) {
      next(err);
    }
  }
}

export const serviceUsageController = new ServiceUsageController();
