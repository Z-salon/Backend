import { Request, Response, NextFunction } from 'express';
import { paymentMethodService } from '../services/payment-method.service';
import { successResponse } from '../../../utils/api-response';

export class PaymentMethodController {
  async createPaymentMethod(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.params.businessId;
      const userId = req.auth!.userId;
      const data = req.body;

      const method = await paymentMethodService.createPaymentMethod(businessId, userId, data);
      res.status(201).json(successResponse('Payment method created successfully', method));
    } catch (error) {
      next(error);
    }
  }

  async getPaymentMethods(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.params.businessId;
      const onlyActive = req.query.active === 'true';
      const methods = await paymentMethodService.getPaymentMethods(businessId, onlyActive);
      res.json(successResponse('Payment methods retrieved successfully', methods));
    } catch (error) {
      next(error);
    }
  }

  async updatePaymentMethod(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, id } = req.params;
      const userId = req.auth!.userId;
      const data = req.body;

      const method = await paymentMethodService.updatePaymentMethod(businessId, id, userId, data);
      res.json(successResponse('Payment method updated successfully', method));
    } catch (error) {
      next(error);
    }
  }

  async deletePaymentMethod(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, id } = req.params;
      const userId = req.auth!.userId;

      await paymentMethodService.deletePaymentMethod(businessId, id, userId);
      res.json(successResponse('Payment method deleted successfully', null));
    } catch (error) {
      next(error);
    }
  }
}

export const paymentMethodController = new PaymentMethodController();
