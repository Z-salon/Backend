import { Request, Response, NextFunction } from 'express';
import { appointmentPaymentService } from '../services/appointment-payment.service';
import { successResponse } from '../../../utils/api-response';

export class AppointmentPaymentController {
  async createPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, id: appointmentId } = req.params;
      const recordedById = req.auth!.userId;
      const { paymentMethodId, amount, reference, notes } = req.body;

      const payment = await appointmentPaymentService.createPayment(
        appointmentId,
        businessId,
        recordedById,
        { paymentMethodId, amount, reference, notes }
      );

      res.status(201).json(successResponse('Payment recorded successfully', payment));
    } catch (err) {
      next(err);
    }
  }

  async getPaymentsForAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, id: appointmentId } = req.params;
      const payments = await appointmentPaymentService.getPaymentsForAppointment(appointmentId, businessId);
      res.json(successResponse('Payments retrieved successfully', payments));
    } catch (err) {
      next(err);
    }
  }

  async voidPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, paymentId } = req.params;
      const actorId = req.auth!.userId;
      const { reason } = req.body;

      const payment = await appointmentPaymentService.voidPayment(paymentId, businessId, actorId, reason);
      res.json(successResponse('Payment voided successfully', payment));
    } catch (err) {
      next(err);
    }
  }
}

export const appointmentPaymentController = new AppointmentPaymentController();
