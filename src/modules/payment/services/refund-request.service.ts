import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { auditLogService } from '../../business/services/audit-log.service';
import { sendRefundApprovedSms, sendRefundRejectedSms } from '../../auth/sms/sms.service';
import {
  applyCompletedRefund,
  getAppointmentFinancials,
  lockAppointmentPayments,
  toDecimal,
} from './payment-finance.helpers';

interface RefundInput {
  amount?: number;
  paymentId?: string;
  reason?: string;
}

export class RefundRequestService {
  /**
   * Business-member authorization for refund operations. Owner/Admin see every branch;
   * branch-scoped members are limited to their branches.
   */
  private async verifyAccess(businessId: string, userId: string, branchId?: string) {
    const member = await prisma.businessMember.findUnique({
      where: { businessId_userId: { businessId, userId } },
      include: {
        userRoles: { include: { role: true, branches: { select: { branchId: true } } } },
      },
    });

    if (!member || member.status !== 'ACTIVE') {
      throw ApiError.forbidden('Not a member of this business');
    }

    const systemKeys = member.userRoles
      .map((ur) => ur.role.systemKey)
      .filter((key): key is string => Boolean(key));
    const isOwnerOrAdmin = systemKeys.some((key) => ['OWNER', 'ADMIN'].includes(key));

    if (!isOwnerOrAdmin && branchId) {
      const allowed = new Set(
        member.userRoles
          .filter((ur) => ur.scopeType === 'BRANCH')
          .flatMap((ur) => ur.branches.map((b) => b.branchId))
      );
      if (!allowed.has(branchId)) {
        throw ApiError.forbidden('Cannot access refunds for this branch');
      }
    }

    return { member, isOwnerOrAdmin };
  }

  /** List all refund requests for a business (filtered by status, branchId, etc.) */
  async listRefundRequests(
    businessId: string,
    userId: string,
    query: { status?: string; page?: number; limit?: number }
  ) {
    const { isOwnerOrAdmin, member } = await this.verifyAccess(businessId, userId);

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = { appointment: { businessId } };
    if (query.status) where.status = query.status;

    if (!isOwnerOrAdmin) {
      const allowedBranchIds = member.userRoles
        .filter((ur) => ur.scopeType === 'BRANCH')
        .flatMap((ur) => ur.branches.map((b) => b.branchId));
      where.appointment = { ...where.appointment, branchId: { in: allowedBranchIds } };
    }

    const [data, total] = await Promise.all([
      prisma.refundRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { requestedAt: 'desc' },
        include: {
          appointment: {
            select: {
              id: true,
              scheduledStart: true,
              branchId: true,
              customer: { select: { id: true, firstName: true, lastName: true } },
            },
          },
          reviewedBy: { select: { id: true, phone: true } },
          completedBy: { select: { id: true, phone: true } },
        },
      }),
      prisma.refundRequest.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  /** Get a single refund request. */
  async getRefundRequest(refundRequestId: string, businessId: string, userId: string) {
    const refundRequest = await prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: {
        appointment: {
          select: {
            id: true,
            businessId: true,
            branchId: true,
            status: true,
            scheduledStart: true,
            finalAgreedAmount: true,
            totalAmount: true,
            customer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phones: { where: { isPrimary: true }, take: 1, select: { phone: true } },
              },
            },
          },
        },
        reviewedBy: { select: { id: true, phone: true } },
        completedBy: { select: { id: true, phone: true } },
      },
    });

    if (!refundRequest || refundRequest.appointment.businessId !== businessId) {
      throw new ApiError(404, 'Refund request not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyAccess(businessId, userId, refundRequest.appointment.branchId);

    return refundRequest;
  }

  /** Refundable amount for an appointment under its historical policy snapshot. */
  async getRefundableAmount(appointmentId: string, businessId: string, userId: string) {
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment || appointment.businessId !== businessId) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }
    await this.verifyAccess(businessId, userId, appointment.branchId);
    const financials = await getAppointmentFinancials(prisma, appointmentId);
    return financials;
  }

  /** Appointments are only refund-eligible once they are settled operationally. */
  private assertRefundEligible(status: string) {
    if (!['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(status)) {
      throw ApiError.badRequest(
        `Cannot request a refund for an appointment in ${status} status. It must be CANCELLED, NO_SHOW or COMPLETED.`
      );
    }
  }

  /**
   * Create a refund request.
   * Validates the historical refund policy, operational eligibility and that the
   * requested amount does not exceed the currently refundable balance.
   */
  async createRefundRequest(appointmentId: string, businessId: string, userId: string, input: RefundInput) {
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment || appointment.businessId !== businessId) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }
    await this.verifyAccess(businessId, userId, appointment.branchId);

    if (!appointment.refundPolicyType || appointment.refundPolicyType === 'NO_REFUND') {
      throw ApiError.badRequest('The refund policy for this appointment does not allow refunds');
    }
    this.assertRefundEligible(appointment.status);

    const financials = await getAppointmentFinancials(prisma, appointmentId);
    if (financials.refundable.lte(0)) {
      throw ApiError.badRequest('There is no refundable balance for this appointment');
    }

    const requestedAmount = input.amount != null ? toDecimal(input.amount) : financials.refundable;
    if (requestedAmount.lte(0)) {
      throw ApiError.badRequest('Requested refund amount must be greater than zero');
    }
    if (requestedAmount.gt(financials.refundable)) {
      throw ApiError.badRequest('Requested refund amount exceeds the refundable balance');
    }

    let paymentId: string | null = null;
    if (input.paymentId) {
      const payment = await prisma.appointmentPayment.findUnique({ where: { id: input.paymentId } });
      if (!payment || payment.appointmentId !== appointmentId) {
        throw ApiError.badRequest('Payment does not belong to this appointment');
      }
      if (payment.status === 'VOIDED') {
        throw ApiError.badRequest('Cannot refund a voided payment');
      }
      paymentId = payment.id;
    }

    return prisma.$transaction(async (tx) => {
      await lockAppointmentPayments(tx, appointmentId);

      // Recompute under lock so concurrent requests cannot over-commit the balance.
      const locked = await getAppointmentFinancials(tx, appointmentId);
      if (requestedAmount.gt(locked.refundable)) {
        throw ApiError.conflict('Requested refund amount exceeds the available refundable balance');
      }

      const created = await tx.refundRequest.create({
        data: {
          appointmentId,
          paymentId,
          requestedAmount,
          status: 'PENDING',
          reason: input.reason,
        },
      });

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: userId,
          action: 'REFUND_REQUESTED',
          entityType: 'RefundRequest',
          entityId: created.id,
          newValues: { appointmentId, requestedAmount: requestedAmount.toString(), paymentId },
        },
        tx
      );

      return created;
    });
  }

  /**
   * Approve a refund request (idempotent). APPROVED only authorizes the refund; it does
   * NOT mean money was returned — that requires completeRefund().
   */
  async approveRefund(
    refundRequestId: string,
    businessId: string,
    userId: string,
    approvedAmount?: number
  ) {
    const refundRequest = await this.getRefundRequest(refundRequestId, businessId, userId);

    if (refundRequest.status === 'COMPLETED') {
      throw ApiError.badRequest('This refund has already been completed');
    }
    if (refundRequest.status === 'APPROVED') {
      return refundRequest; // Idempotent
    }
    if (refundRequest.status === 'REJECTED') {
      throw ApiError.badRequest('Cannot approve a rejected refund request');
    }

    const appointmentId = refundRequest.appointmentId;

    const updated = await prisma.$transaction(async (tx) => {
      await lockAppointmentPayments(tx, appointmentId);

      const fresh = await tx.refundRequest.findUnique({ where: { id: refundRequestId } });
      if (!fresh) throw new ApiError(404, 'Refund request not found', ErrorCodes.NOT_FOUND);
      if (fresh.status === 'APPROVED') return fresh;
      if (fresh.status === 'COMPLETED' || fresh.status === 'REJECTED') {
        throw ApiError.badRequest(`Cannot approve a refund request in ${fresh.status} status`);
      }

      const amount = approvedAmount != null ? toDecimal(approvedAmount) : fresh.requestedAmount;
      if (amount.lte(0)) {
        throw ApiError.badRequest('Approved amount must be greater than zero');
      }
      if (amount.gt(fresh.requestedAmount)) {
        throw ApiError.badRequest('Approved amount cannot exceed the requested amount');
      }

      // Exclude this request so its own reservation is not double-counted.
      const financials = await getAppointmentFinancials(tx, appointmentId, {
        excludeRefundRequestId: refundRequestId,
      });
      if (amount.gt(financials.refundable)) {
        throw ApiError.conflict('Approved amount exceeds the available refundable balance');
      }

      const updatedRefund = await tx.refundRequest.update({
        where: { id: refundRequestId },
        data: {
          status: 'APPROVED',
          approvedAmount: amount,
          reviewedAt: new Date(),
          reviewedById: userId,
        },
      });

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: userId,
          action: 'REFUND_APPROVED',
          entityType: 'RefundRequest',
          entityId: refundRequestId,
          oldValues: { status: 'PENDING' },
          newValues: { status: 'APPROVED', approvedAmount: amount.toString() },
        },
        tx
      );

      return updatedRefund;
    });

    // Best-effort customer notification; never fail an already-committed approval.
    const phone = refundRequest.appointment.customer.phones[0]?.phone;
    if (phone) {
      await sendRefundApprovedSms(
        phone,
        toDecimal(updated.approvedAmount ?? updated.requestedAmount).toString(),
        refundRequest.appointment.scheduledStart
      ).catch(() => {});
    }

    return updated;
  }

  /** Reject a refund request (idempotent). A rejection reason is required. */
  async rejectRefund(
    refundRequestId: string,
    businessId: string,
    userId: string,
    rejectionReason?: string
  ) {
    const refundRequest = await this.getRefundRequest(refundRequestId, businessId, userId);

    if (refundRequest.status === 'REJECTED') {
      return refundRequest; // Idempotent
    }
    if (refundRequest.status === 'APPROVED' || refundRequest.status === 'COMPLETED') {
      throw ApiError.badRequest(`Cannot reject a refund request in ${refundRequest.status} status`);
    }
    if (!rejectionReason || !rejectionReason.trim()) {
      throw ApiError.badRequest('A rejection reason is required');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const fresh = await tx.refundRequest.findUnique({ where: { id: refundRequestId } });
      if (!fresh) throw new ApiError(404, 'Refund request not found', ErrorCodes.NOT_FOUND);
      if (fresh.status === 'REJECTED') return fresh;
      if (fresh.status !== 'PENDING') {
        throw ApiError.badRequest(`Cannot reject a refund request in ${fresh.status} status`);
      }

      const updatedRefund = await tx.refundRequest.update({
        where: { id: refundRequestId },
        data: {
          status: 'REJECTED',
          reviewedAt: new Date(),
          reviewedById: userId,
          rejectionReason,
        },
      });

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: userId,
          action: 'REFUND_REJECTED',
          entityType: 'RefundRequest',
          entityId: refundRequestId,
          oldValues: { status: 'PENDING' },
          newValues: { status: 'REJECTED', rejectionReason },
        },
        tx
      );

      return updatedRefund;
    });

    // Best-effort customer notification; never fail an already-committed rejection.
    const phone = refundRequest.appointment.customer.phones[0]?.phone;
    if (phone) {
      await sendRefundRejectedSms(
        phone,
        refundRequest.appointment.scheduledStart,
        updated.rejectionReason ?? undefined
      ).catch(() => {});
    }

    return updated;
  }

  /**
   * Confirm that an approved refund was actually transferred outside Z-Salon.
   * APPROVED -> COMPLETED only. Records who/when/amount/reference and applies the
   * refund to the underlying payments atomically.
   */
  async completeRefund(
    refundRequestId: string,
    businessId: string,
    userId: string,
    input: { amount?: number; reference?: string; note?: string } = {}
  ) {
    const refundRequest = await this.getRefundRequest(refundRequestId, businessId, userId);

    if (refundRequest.status === 'PENDING') {
      throw ApiError.badRequest('A refund must be approved before it can be completed');
    }
    if (refundRequest.status === 'REJECTED') {
      throw ApiError.badRequest('Cannot complete a rejected refund request');
    }

    const appointmentId = refundRequest.appointmentId;

    const result = await prisma.$transaction(async (tx) => {
      await lockAppointmentPayments(tx, appointmentId);

      const fresh = await tx.refundRequest.findUnique({ where: { id: refundRequestId } });
      if (!fresh) throw new ApiError(404, 'Refund request not found', ErrorCodes.NOT_FOUND);

      const approved = toDecimal(fresh.approvedAmount ?? fresh.requestedAmount);
      const amount = input.amount != null ? toDecimal(input.amount) : approved;

      if (amount.lte(0)) {
        throw ApiError.badRequest('Completed refund amount must be greater than zero');
      }
      if (amount.gt(approved)) {
        throw ApiError.badRequest('Completed refund amount cannot exceed the approved amount');
      }

      if (fresh.status === 'COMPLETED') {
        // Idempotent: same amount is a no-op; a different amount is a conflict.
        if (input.amount != null && !amount.eq(toDecimal(fresh.approvedAmount))) {
          throw ApiError.conflict('Refund has already been completed with a different amount');
        }
        return fresh;
      }

      if (fresh.status !== 'APPROVED') {
        throw ApiError.badRequest(`Cannot complete a refund request in ${fresh.status} status`);
      }

      // Guard the total refunded across the appointment under lock. `refundable` is the
      // headroom for THIS request (policy cap minus already-refunded minus other reservations).
      const financials = await getAppointmentFinancials(tx, appointmentId, {
        excludeRefundRequestId: refundRequestId,
      });
      if (amount.gt(financials.refundable)) {
        throw ApiError.conflict('Refund exceeds the total refundable amount for this appointment');
      }

      await applyCompletedRefund(tx, appointmentId, amount);

      const updatedRefund = await tx.refundRequest.update({
        where: { id: refundRequestId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          completedById: userId,
          completionReference: input.reference,
          completionNote: input.note,
        },
      });

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: userId,
          action: 'REFUND_COMPLETED',
          entityType: 'RefundRequest',
          entityId: refundRequestId,
          oldValues: { status: 'APPROVED', approvedAmount: approved.toString() },
          newValues: {
            status: 'COMPLETED',
            amount: amount.toString(),
            reference: input.reference,
          },
        },
        tx
      );

      return updatedRefund;
    });

    return result;
  }
}

export const refundRequestService = new RefundRequestService();
