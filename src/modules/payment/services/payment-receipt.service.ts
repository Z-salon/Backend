import { prisma } from '../../../libs/prisma';
import { ApiError } from '../../../utils/api-error';
import { auditLogService } from '../../business/services/audit-log.service';
import { AppointmentStatus, AppointmentActorType, PaymentVerificationStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';

export class PaymentReceiptService {
  /**
   * Get all available (active) payment methods for a business.
   * Exposed to customers so they know how to pay.
   */
  async getPublicPaymentMethods(businessId: string) {
    return prisma.paymentMethod.findMany({
      where: { businessId, isActive: true },
      orderBy: { displayOrder: 'asc' },
      select: {
        id: true,
        name: true,
        type: true,
        accountName: true,
        accountNumber: true,
        instructions: true,
      },
    });
  }

  /**
   * Customer submits a receipt for a PENDING appointment.
   * Only one active receipt (PENDING or APPROVED) is allowed per appointment.
   */
  async submitReceipt(
    appointmentId: string,
    customerId: string,
    data: {
      paymentMethodId: string;
      submittedAmount?: number;
      receiptImageUrl: string;
      customerNote?: string;
    }
  ) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { paymentReceipts: { orderBy: { submittedAt: 'desc' } } },
    });

    if (!appointment) {
      throw ApiError.notFound('Appointment not found');
    }

    // Security: verify the customer owns this appointment
    if (appointment.customerId !== customerId) {
      throw ApiError.forbidden('Cannot submit receipt for another customer\'s appointment');
    }

    // Only PENDING appointments require a receipt submission
    if (appointment.status !== AppointmentStatus.PENDING) {
      throw ApiError.badRequest(`Cannot submit a receipt for an appointment in ${appointment.status} status`);
    }

    // Block if already has a PENDING or APPROVED receipt
    const hasActiveReceipt = appointment.paymentReceipts.some(
      r => r.status === PaymentVerificationStatus.APPROVED || r.status === PaymentVerificationStatus.PENDING
    );

    if (hasActiveReceipt) {
      throw ApiError.conflict('A receipt is already pending review or has been approved for this appointment');
    }

    // Validate payment method belongs to this business
    const paymentMethod = await prisma.paymentMethod.findUnique({
      where: { id: data.paymentMethodId },
    });
    if (!paymentMethod || paymentMethod.businessId !== appointment.businessId || !paymentMethod.isActive) {
      throw ApiError.badRequest('Invalid or inactive payment method');
    }

    // Validate image URL is non-empty (actual Cloudinary URL comes from frontend)
    if (!data.receiptImageUrl || !data.receiptImageUrl.startsWith('http')) {
      throw ApiError.badRequest('A valid receipt image URL is required');
    }

    const receipt = await prisma.paymentReceipt.create({
      data: {
        appointmentId,
        customerId,
        businessId: appointment.businessId,
        branchId: appointment.branchId,
        paymentMethodId: data.paymentMethodId,
        expectedAmount: appointment.totalAmount,
        submittedAmount: data.submittedAmount
          ? new Prisma.Decimal(data.submittedAmount.toString())
          : null,
        receiptImageUrl: data.receiptImageUrl,
        customerNote: data.customerNote,
        status: PaymentVerificationStatus.PENDING,
      },
      include: {
        paymentMethod: { select: { name: true, type: true } },
      },
    });

    return receipt;
  }

  /**
   * Admin/Manager reviews a receipt — either APPROVE or REJECT.
   * On approval, appointment atomically transitions to CONFIRMED.
   */
  async verifyReceipt(
    appointmentId: string,
    businessId: string,
    reviewerId: string,
    data: {
      action: 'APPROVE' | 'REJECT';
      rejectionReason?: string;
      verifiedAmount?: number;
    }
  ) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { paymentReceipts: { where: { status: PaymentVerificationStatus.PENDING } } },
    });

    if (!appointment || appointment.businessId !== businessId) {
      throw ApiError.notFound('Appointment not found');
    }

    if (appointment.paymentReceipts.length === 0) {
      throw ApiError.badRequest('No pending payment receipt found for this appointment');
    }

    const receipt = appointment.paymentReceipts[0]; // Process the pending one

    // Guard: cannot approve a cancelled or expired appointment
    if (['CANCELLED', 'EXPIRED', 'COMPLETED', 'NO_SHOW'].includes(appointment.status)) {
      throw ApiError.badRequest(
        `Cannot approve receipt for an appointment in ${appointment.status} status`
      );
    }

    if (data.action === 'REJECT' && !data.rejectionReason) {
      throw ApiError.badRequest('A rejection reason is required');
    }

    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const claimed = await tx.paymentReceipt.updateMany({
        where: { id: receipt.id, status: PaymentVerificationStatus.PENDING },
        data: {
          status:
            data.action === 'APPROVE'
              ? PaymentVerificationStatus.APPROVED
              : PaymentVerificationStatus.REJECTED,
          rejectionReason: data.action === 'REJECT' ? data.rejectionReason : null,
          reviewedAt: now,
          reviewedById: reviewerId,
          ...(data.verifiedAmount
            ? { submittedAmount: new Prisma.Decimal(data.verifiedAmount.toString()) }
            : {}),
        },
      });

      if (claimed.count !== 1) {
        throw ApiError.conflict('This receipt has already been reviewed');
      }

      const updatedReceipt = await tx.paymentReceipt.findUnique({ where: { id: receipt.id } });

      if (data.action === 'APPROVE') {
        const existingPayment = await tx.appointmentPayment.findFirst({
          where: {
            appointmentId,
            reference: `Receipt: ${receipt.id}`,
            status: 'PAID',
          },
        });

        const shouldConfirm = appointment.status === AppointmentStatus.PENDING;

        if (!existingPayment) {
          const finalAmount = data.verifiedAmount
            ? new Prisma.Decimal(data.verifiedAmount.toString())
            : (receipt.submittedAmount || receipt.expectedAmount);

          await tx.appointmentPayment.create({
            data: {
              appointmentId,
              businessId,
              branchId: appointment.branchId,
              paymentMethodId: receipt.paymentMethodId,
              amount: finalAmount,
              status: 'PAID',
              reference: `Receipt: ${receipt.id}`,
              recordedById: reviewerId,
            },
          });
        }

        if (shouldConfirm) {
          await tx.appointment.update({
            where: { id: appointmentId },
            data: {
              status: AppointmentStatus.CONFIRMED,
              confirmedAt: now,
            },
          });

          await tx.appointmentStatusHistory.create({
            data: {
              appointmentId,
              statusFrom: appointment.status,
              statusTo: AppointmentStatus.CONFIRMED,
              actorId: reviewerId,
              actorType: AppointmentActorType.USER,
              reason: 'Payment receipt approved — appointment confirmed',
            },
          });
        }

        await auditLogService.createAuditLog(
          {
            businessId,
            actorId: reviewerId,
            action: 'PAYMENT_RECEIPT_APPROVED',
            entityType: 'PaymentReceipt',
            entityId: receipt.id,
            newValues: {
              appointmentId,
              newStatus: shouldConfirm ? AppointmentStatus.CONFIRMED : appointment.status,
              verifiedAmount: data.verifiedAmount,
            },
          },
          tx
        );
      } else {
        await auditLogService.createAuditLog(
          {
            businessId,
            actorId: reviewerId,
            action: 'PAYMENT_RECEIPT_REJECTED',
            entityType: 'PaymentReceipt',
            entityId: receipt.id,
            newValues: {
              appointmentId,
              rejectionReason: data.rejectionReason,
            },
          },
          tx
        );
      }

      return updatedReceipt;
    }).then(async (updatedReceipt) => {
      if (data.action === 'APPROVE' && appointment.status === AppointmentStatus.PENDING) {
        const customer = await prisma.customer.findUnique({
          where: { id: appointment.customerId },
          include: { phones: true },
        });
        const phone = customer?.phones.find((p) => p.isPrimary)?.phone || customer?.phones[0]?.phone;
        if (phone) {
          try {
            const { sendAppointmentConfirmationSms } = await import('../../auth/sms/sms.service');
            await sendAppointmentConfirmationSms(phone, appointment.scheduledStart, appointment.scheduledEnd);
          } catch (err) {
            console.error('Failed to send confirmation SMS after receipt approval', err);
          }
        }
      }
      return updatedReceipt;
    });
  }

  /**
   * Get receipt status for an appointment (customer-facing).
   */
  async getReceiptForAppointment(appointmentId: string, customerId: string) {
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment || appointment.customerId !== customerId) {
      throw ApiError.notFound('Appointment not found');
    }

    // Return the most relevant receipt (e.g., APPROVED, PENDING, or most recent REJECTED)
    const receipt = await prisma.paymentReceipt.findFirst({
      where: { appointmentId },
      orderBy: { submittedAt: 'desc' },
      include: {
        paymentMethod: { select: { name: true, type: true } },
      },
    });

    return receipt;
  }

  /**
   * Get receipt for admin review.
   */
  async getReceiptForBusiness(appointmentId: string, businessId: string) {
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment || appointment.businessId !== businessId) {
      throw ApiError.notFound('Appointment not found');
    }

    // Get the most recent receipt for admin view
    const receipt = await prisma.paymentReceipt.findFirst({
      where: { appointmentId },
      orderBy: { submittedAt: 'desc' },
      include: {
        paymentMethod: { select: { name: true, type: true } },
        customer: { select: { id: true, firstName: true, lastName: true } },
        reviewedBy: { select: { id: true, phone: true } },
      },
    });

    return receipt;
  }

  /**
   * List pending receipts for a business (for admin dashboard).
   */
  async listPendingReceipts(businessId: string, branchId?: string) {
    const where: any = {
      businessId,
      status: PaymentVerificationStatus.PENDING,
    };
    if (branchId) where.branchId = branchId;

    return prisma.paymentReceipt.findMany({
      where,
      orderBy: { submittedAt: 'asc' },
      include: {
        appointment: {
          select: {
            id: true,
            scheduledStart: true,
            scheduledEnd: true,
            status: true,
            service: { select: { id: true, name: true } },
          },
        },
        customer: { select: { id: true, firstName: true, lastName: true } },
        paymentMethod: { select: { name: true, type: true } },
      },
    });
  }
}

export const paymentReceiptService = new PaymentReceiptService();
