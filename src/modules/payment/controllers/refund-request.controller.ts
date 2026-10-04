import { Request, Response, NextFunction } from 'express';
import { refundRequestService } from '../services/refund-request.service';
import { successResponse } from '../../../utils/api-response';
import { ApiError } from '../../../utils/api-error';

export class RefundRequestController {

  /** GET /businesses/:businessId/appointments/:appointmentId/refundable */
  async getRefundableAmount(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, appointmentId } = req.params;
      const userId = req.auth!.userId;
      const financials = await refundRequestService.getRefundableAmount(appointmentId, businessId, userId);
      res.json(successResponse('Refundable amount retrieved', financials));
    } catch (error) {
      next(error);
    }
  }

  /** POST /businesses/:businessId/refund-requests */
  async createRefundRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId } = req.params;
      const userId = req.auth!.userId;
      const { appointmentId, amount, paymentId, reason } = req.body;

      if (!appointmentId) {
        throw ApiError.badRequest('appointmentId is required');
      }

      const created = await refundRequestService.createRefundRequest(appointmentId, businessId, userId, {
        amount,
        paymentId,
        reason,
      });
      res.status(201).json(successResponse('Refund request created', created));
    } catch (error) {
      next(error);
    }
  }

  async listRefundRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId } = req.params;
      const userId = req.auth!.userId;
      const { status, page, limit } = req.query;

      const result = await refundRequestService.listRefundRequests(businessId, userId, {
        status: status as string,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
      });

      res.json({ success: true, data: result.data, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }

  async getRefundRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, refundRequestId } = req.params;
      const userId = req.auth!.userId;

      const refundRequest = await refundRequestService.getRefundRequest(refundRequestId, businessId, userId);
      res.json({ success: true, data: refundRequest });
    } catch (error) {
      next(error);
    }
  }

  async approveRefund(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, refundRequestId } = req.params;
      const userId = req.auth!.userId;

      const updated = await refundRequestService.approveRefund(refundRequestId, businessId, userId);
      res.json({ success: true, data: updated, message: 'Refund approved' });
    } catch (error) {
      next(error);
    }
  }

  async rejectRefund(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, refundRequestId } = req.params;
      const userId = req.auth!.userId;
      const { rejectionReason } = req.body;

      const updated = await refundRequestService.rejectRefund(refundRequestId, businessId, userId, rejectionReason);
      res.json({ success: true, data: updated, message: 'Refund rejected' });
    } catch (error) {
      next(error);
    }
  }

  /** Confirms an approved refund was actually transferred outside Z-Salon. */
  async completeRefund(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, refundRequestId } = req.params;
      const userId = req.auth!.userId;
      const { amount, reference, note } = req.body;

      const updated = await refundRequestService.completeRefund(refundRequestId, businessId, userId, {
        amount,
        reference,
        note,
      });
      res.json(successResponse('Refund completed', updated));
    } catch (error) {
      next(error);
    }
  }
}

export const refundRequestController = new RefundRequestController();
