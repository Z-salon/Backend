import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { auditLogService } from '../../business/services/audit-log.service';
import {
  sendRefundApprovedSms,
  sendRefundRejectedSms,
} from '../../auth/sms/sms.service';

export class RefundRequestService {
  
  /**
   * List all refund requests for a business (filtered by status, branchId, etc.)
   */
  async listRefundRequests(businessId: string, userId: string, query: {
    status?: string;
    page?: number;
    limit?: number;
  }) {
    // Ensure user is a business member (verifyAppointmentAccess is per-appointment;
    // for listing we just confirm business membership here via prisma query on business ownership)
    const member = await prisma.businessMember.findFirst({
      where: { businessId, userId, status: 'ACTIVE' }
    });
    if (!member) {
      throw new ApiError(403, 'Not a member of this business', ErrorCodes.FORBIDDEN);
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      appointment: { businessId }
    };
    if (query.status) where.status = query.status;

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
              customer: { select: { id: true, firstName: true, lastName: true } }
            }
          },
          reviewedBy: { select: { id: true, phone: true } }
        }
      }),
      prisma.refundRequest.count({ where })
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
    };
  }

  /**
   * Get a single refund request
   */
  async getRefundRequest(refundRequestId: string, businessId: string, userId: string) {
    const refundRequest = await prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: {
        appointment: {
          select: {
            id: true,
            businessId: true,
            scheduledStart: true,
            customer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phones: { where: { isPrimary: true }, take: 1, select: { phone: true } },
              }
            }
          }
        },
        reviewedBy: { select: { id: true, phone: true } }
      }
    });

    if (!refundRequest || refundRequest.appointment.businessId !== businessId) {
      throw new ApiError(404, 'Refund request not found', ErrorCodes.NOT_FOUND);
    }

    return refundRequest;
  }

  /**
   * Approve a refund request (idempotent)
   */
  async approveRefund(refundRequestId: string, businessId: string, userId: string) {
    const refundRequest = await this.getRefundRequest(refundRequestId, businessId, userId);

    if (refundRequest.status === 'APPROVED') {
      return refundRequest; // Idempotent
    }

    if (refundRequest.status === 'REJECTED') {
      throw new ApiError(400, 'Cannot approve a rejected refund request', ErrorCodes.VALIDATION_ERROR);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedRefund = await tx.refundRequest.update({
        where: { id: refundRequestId },
        data: {
          status: 'APPROVED',
          approvedAmount: refundRequest.requestedAmount,
          reviewedAt: new Date(),
          reviewedById: userId,
        },
        include: { appointment: { select: { businessId: true, id: true } } }
      });

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: userId,
          action: 'REFUND_APPROVED',
          entityType: 'RefundRequest',
          entityId: refundRequestId,
          oldValues: { status: 'PENDING' },
          newValues: { status: 'APPROVED', approvedAmount: refundRequest.requestedAmount },
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
        (updated.approvedAmount ?? refundRequest.requestedAmount).toString(),
        refundRequest.appointment.scheduledStart
      ).catch(() => {});
    }

    return updated;
  }

  /**
   * Reject a refund request (idempotent)
   */
  async rejectRefund(refundRequestId: string, businessId: string, userId: string, rejectionReason?: string) {
    const refundRequest = await this.getRefundRequest(refundRequestId, businessId, userId);

    if (refundRequest.status === 'REJECTED') {
      return refundRequest; // Idempotent
    }

    if (refundRequest.status === 'APPROVED') {
      throw new ApiError(400, 'Cannot reject an approved refund request', ErrorCodes.VALIDATION_ERROR);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedRefund = await tx.refundRequest.update({
        where: { id: refundRequestId },
        data: {
          status: 'REJECTED',
          reviewedAt: new Date(),
          reviewedById: userId,
          rejectionReason: rejectionReason || 'Refund rejected by staff',
        },
        include: { appointment: { select: { businessId: true, id: true } } }
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
}

export const refundRequestService = new RefundRequestService();
