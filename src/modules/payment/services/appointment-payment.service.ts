import { prisma } from '../../../libs/prisma';
import { ApiError } from '../../../utils/api-error';
import { Prisma, AppointmentPaymentStatus } from '@prisma/client';
import { auditLogService } from '../../business/services/audit-log.service';

export class AppointmentPaymentService {
  /**
   * Record a final service payment for an appointment.
   * Can be used for walk-ins or paying remaining balances.
   */
  async createPayment(
    appointmentId: string,
    businessId: string,
    recordedById: string,
    data: {
      paymentMethodId: string;
      amount: number;
      reference?: string;
      notes?: string;
    }
  ) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment || appointment.businessId !== businessId) {
      throw ApiError.notFound('Appointment not found');
    }

    const paymentMethod = await prisma.paymentMethod.findUnique({
      where: { id: data.paymentMethodId },
    });

    if (!paymentMethod || paymentMethod.businessId !== businessId || !paymentMethod.isActive) {
      throw ApiError.badRequest('Invalid or inactive payment method');
    }

    if (data.amount <= 0) {
      throw ApiError.badRequest('Payment amount must be greater than zero');
    }

    const payment = await prisma.$transaction(async (tx) => {
      const newPayment = await tx.appointmentPayment.create({
        data: {
          appointmentId,
          businessId,
          branchId: appointment.branchId,
          paymentMethodId: data.paymentMethodId,
          amount: new Prisma.Decimal(data.amount.toString()),
          status: AppointmentPaymentStatus.PAID,
          reference: data.reference,
          notes: data.notes,
          recordedById,
        },
        include: {
          paymentMethod: { select: { name: true, type: true } },
        },
      });

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: recordedById,
          action: 'APPOINTMENT_PAYMENT_RECORDED',
          entityType: 'AppointmentPayment',
          entityId: newPayment.id,
          newValues: {
            appointmentId,
            amount: data.amount,
            method: paymentMethod.name,
          },
        },
        tx
      );

      return newPayment;
    });

    return payment;
  }

  /**
   * Get all payments for an appointment.
   */
  async getPaymentsForAppointment(appointmentId: string, businessId: string) {
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment || appointment.businessId !== businessId) {
      throw ApiError.notFound('Appointment not found');
    }

    return prisma.appointmentPayment.findMany({
      where: { appointmentId },
      orderBy: { paidAt: 'asc' },
      include: {
        paymentMethod: { select: { name: true, type: true } },
        recordedBy: { select: { id: true, phone: true } },
      },
    });
  }

  /**
   * Void a payment (if a mistake was made).
   */
  async voidPayment(paymentId: string, businessId: string, actorId: string, reason: string) {
    const payment = await prisma.appointmentPayment.findUnique({ where: { id: paymentId } });
    
    if (!payment || payment.businessId !== businessId) {
      throw ApiError.notFound('Payment not found');
    }

    if (payment.status !== AppointmentPaymentStatus.PAID) {
      throw ApiError.badRequest(`Cannot void a payment that is in ${payment.status} status`);
    }

    if (!reason) {
      throw ApiError.badRequest('A reason is required to void a payment');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const voided = await tx.appointmentPayment.update({
        where: { id: paymentId },
        data: { 
          status: AppointmentPaymentStatus.VOIDED,
          notes: payment.notes ? `${payment.notes}\n[VOIDED: ${reason}]` : `[VOIDED: ${reason}]`
        },
      });

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId,
          action: 'APPOINTMENT_PAYMENT_VOIDED',
          entityType: 'AppointmentPayment',
          entityId: paymentId,
          oldValues: { status: payment.status },
          newValues: { status: AppointmentPaymentStatus.VOIDED, reason },
        },
        tx
      );

      return voided;
    });

    return updated;
  }
}

export const appointmentPaymentService = new AppointmentPaymentService();
