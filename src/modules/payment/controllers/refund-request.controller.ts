import { Request, Response, NextFunction } from 'express';
import { refundRequestService } from '../services/refund-request.service';

export class RefundRequestController {

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
}

export const refundRequestController = new RefundRequestController();
