import { Request, Response, NextFunction } from 'express';
import { publicBookingService } from '../services/public-booking.service';
import { successResponse } from '../../../utils/api-response';

export class PublicBookingController {
  async createPublicBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const {
        verificationToken,
        firstName,
        lastName,
        phone,
        branchId,
        serviceId,
        staffId,
        scheduledStart,
        notes,
      } = req.body;

      const appointment = await publicBookingService.createPublicBooking(businessId, {
        verificationToken,
        firstName,
        lastName,
        phone,
        branchId,
        serviceId,
        staffId,
        scheduledStart: new Date(scheduledStart),
        notes,
      });

      res.status(201).json(successResponse('Appointment created successfully', appointment));
    } catch (error) {
      next(error);
    }
  }

  async submitPublicReceipt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { businessId, appointmentId } = req.params;
      const { verificationToken, paymentMethodId, submittedAmount, receiptImageUrl, customerNote } = req.body;

      const receipt = await publicBookingService.submitPublicReceipt(businessId, appointmentId, {
        verificationToken,
        paymentMethodId,
        submittedAmount,
        receiptImageUrl,
        customerNote,
      });

      res.status(201).json(successResponse('Receipt submitted for verification', receipt));
    } catch (error) {
      next(error);
    }
  }
}

export const publicBookingController = new PublicBookingController();
