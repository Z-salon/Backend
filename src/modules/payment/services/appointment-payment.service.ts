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
   * Record an appointment payment split across one or more payment methods.
   * e.g. 1000 cash + 1500 card creates one AppointmentPayment row per method.
   */
  async createPayments(
    appointmentId: string,
    businessId: string,
    recordedById: string,
    data: {
      payments: { paymentMethodId: string; amount: number }[];
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

    if (!data.payments || data.payments.length === 0) {
      throw ApiError.badRequest('At least one payment entry is required');
    }

    for (const entry of data.payments) {
      if (!entry.paymentMethodId) {
        throw ApiError.badRequest('paymentMethodId is required for every payment entry');
      }
      if (!(entry.amount > 0)) {
        throw ApiError.badRequest('Every payment amount must be greater than zero');
      }
    }

    const methodIds = data.payments.map((p) => p.paymentMethodId);
    const paymentMethods = await prisma.paymentMethod.findMany({
      where: { id: { in: methodIds }, businessId, isActive: true },
    });

    const methodMap = new Map(paymentMethods.map((m) => [m.id, m]));
    const invalid = methodIds.filter((id) => !methodMap.has(id));
    if (invalid.length > 0) {
      throw ApiError.badRequest('One or more payment methods are invalid or inactive');
    }

    return prisma.$transaction(async (tx) => {
      const created = [];

      for (const entry of data.payments) {
        const method = methodMap.get(entry.paymentMethodId)!;

        const payment = await tx.appointmentPayment.create({
          data: {
            appointmentId,
            businessId,
            branchId: appointment.branchId,
            paymentMethodId: entry.paymentMethodId,
            amount: new Prisma.Decimal(entry.amount.toString()),
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
            entityId: payment.id,
            newValues: {
              appointmentId,
              amount: entry.amount,
              method: method.name,
            },
          },
          tx
        );

        created.push(payment);
      }

      return created;
    });
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
