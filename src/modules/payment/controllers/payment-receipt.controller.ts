import { Request, Response, NextFunction } from 'express';
import { paymentReceiptService } from '../services/payment-receipt.service';
import { successResponse } from '../../../utils/api-response';
import { prisma } from '../../../libs/prisma';
import { ApiError } from '../../../utils/api-error';

/**
 * Resolves customer IDs for a user via their phone number.
 * A user's phone may map to multiple Customer records (across businesses).
 * We return them all and let the service guard the specific appointment.
 */
async function getCustomerIdsForUser(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.unauthorized('User not found');

  const phones = await prisma.customerPhone.findMany({
    where: { phone: user.phone },
    select: { customerId: true },
  });

  return [...new Set(phones.map((p) => p.customerId))];
}

export class PaymentReceiptController {
  // ─── Customer-facing ──────────────────────────────────────────

  /**
   * GET /api/v1/businesses/:businessId/payment-methods/public
   * Returns active payment methods (visible to customers).
   */
  async getPublicPaymentMethods(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId } = req.params;
      const methods = await paymentReceiptService.getPublicPaymentMethods(businessId);
      res.json(successResponse('Payment methods retrieved', methods));
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/customer/appointments/:id/receipt
   * Customer submits a receipt image URL.
   */
  async submitReceipt(req: Request, res: Response, next: NextFunction) {
    try {
      const appointmentId = req.params.id;
      const userId = req.auth!.userId;

      // Resolve which customer record matches this appointment
      const customerIds = await getCustomerIdsForUser(userId);
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
      });
      if (!appointment || !customerIds.includes(appointment.customerId)) {
        throw ApiError.notFound('Appointment not found');
      }
      const customerId = appointment.customerId;

      const { paymentMethodId, submittedAmount, receiptImageUrl, customerNote } = req.body;

      const receipt = await paymentReceiptService.submitReceipt(appointmentId, customerId, {
        paymentMethodId,
        submittedAmount,
        receiptImageUrl,
        customerNote,
      });

      res.status(201).json(successResponse('Receipt submitted for verification', receipt));
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/customer/appointments/:id/receipt
   * Customer views status of their own receipt.
   */
  async getMyReceipt(req: Request, res: Response, next: NextFunction) {
    try {
      const appointmentId = req.params.id;
      const userId = req.auth!.userId;

      const customerIds = await getCustomerIdsForUser(userId);
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
      });
      if (!appointment || !customerIds.includes(appointment.customerId)) {
        throw ApiError.notFound('Appointment not found');
      }

      const receipt = await paymentReceiptService.getReceiptForAppointment(
        appointmentId,
        appointment.customerId
      );
      res.json(successResponse('Receipt retrieved', receipt));
    } catch (err) {
      next(err);
    }
  }

  // ─── Business-facing ──────────────────────────────────────────

  /**
   * GET /api/v1/businesses/:businessId/receipts/pending
   * Admin sees all pending receipts for review.
   */
  async listPendingReceipts(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId } = req.params;
      const branchId = req.query.branchId as string | undefined;
      const receipts = await paymentReceiptService.listPendingReceipts(businessId, branchId);
      res.json(successResponse('Pending receipts retrieved', receipts));
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/businesses/:businessId/appointments/:id/receipt
   */
  async getReceiptForAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, id } = req.params;
      const receipt = await paymentReceiptService.getReceiptForBusiness(id, businessId);
      res.json(successResponse('Receipt retrieved', receipt));
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/businesses/:businessId/appointments/:id/receipt/verify
   * Admin approves or rejects a receipt.
   */
  async verifyReceipt(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, id } = req.params;
      const reviewerId = req.auth!.userId;
      const { action, rejectionReason, verifiedAmount } = req.body;

      if (!['APPROVE', 'REJECT'].includes(action)) {
        res.status(400).json({ success: false, message: 'action must be APPROVE or REJECT' });
        return;
      }

      const receipt = await paymentReceiptService.verifyReceipt(id, businessId, reviewerId, {
        action,
        rejectionReason,
        verifiedAmount,
      });

      res.json(successResponse(`Receipt ${action.toLowerCase()}d successfully`, receipt));
    } catch (err) {
      next(err);
    }
  }
}

export const paymentReceiptController = new PaymentReceiptController();
