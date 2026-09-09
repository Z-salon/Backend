import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { AppointmentStatus, AppointmentActorType, Prisma } from '@prisma/client';
import { auditLogService } from '../../business/services/audit-log.service';

export class CustomerAppointmentService {
  /**
   * Helper to find all customer IDs associated with the user's phone across all businesses.
   */
  private async getCustomerIdsForUser(userId: string): Promise<string[]> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError(401, 'User not found', ErrorCodes.UNAUTHORIZED);

    const phones = await prisma.customerPhone.findMany({
      where: { phone: user.phone },
      select: { customerId: true }
    });

    return [...new Set(phones.map(p => p.customerId))];
  }

  /**
   * Get all appointments for the authenticated customer.
   */
  async getCustomerAppointments(userId: string, query: any) {
    const customerIds = await this.getCustomerIdsForUser(userId);
    if (customerIds.length === 0) {
      return { data: [], meta: { total: 0, page: query.page, limit: query.limit, totalPages: 0 } };
    }

    const where: any = {
      customerId: { in: customerIds },
      status: { not: 'EXPIRED' } // customers probably shouldn't see expired pending requests, or maybe they should?
    };

    if (query.status) where.status = query.status;
    if (query.startDate || query.endDate) {
      where.scheduledStart = {};
      if (query.startDate) where.scheduledStart.gte = new Date(query.startDate);
      if (query.endDate) where.scheduledStart.lte = new Date(query.endDate);
    }

    const skip = (query.page - 1) * query.limit;

    const [total, appointments] = await Promise.all([
      prisma.appointment.count({ where }),
      prisma.appointment.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { scheduledStart: 'desc' },
        include: {
          business: { select: { id: true, name: true, logoUrl: true } },
          branch: { select: { id: true, name: true, address: true } },
          service: { select: { id: true, name: true, durationMinutes: true, price: true } },
          staff: { include: { staff: { select: { id: true, firstName: true, lastName: true } } } },
        },
      }),
    ]);

    return {
      data: appointments.map(this.mapToCustomerResponse),
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  }

  async getCustomerAppointment(userId: string, appointmentId: string) {
    const customerIds = await this.getCustomerIdsForUser(userId);
    if (customerIds.length === 0) throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        business: { select: { id: true, name: true, logoUrl: true } },
        branch: { select: { id: true, name: true, address: true } },
        service: { select: { id: true, name: true, durationMinutes: true, price: true } },
        staff: { include: { staff: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });

    if (!appointment || !customerIds.includes(appointment.customerId)) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }

    return this.mapToCustomerResponse(appointment);
  }

  async rescheduleAppointment(userId: string, appointmentId: string, newStartTime: Date, reason?: string, newStaffId?: string) {
    const customerIds = await this.getCustomerIdsForUser(userId);
    if (customerIds.length === 0) throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { staff: true, service: true }
    });

    if (!appointment || !customerIds.includes(appointment.customerId)) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }

    if (['COMPLETED', 'CANCELLED', 'NO_SHOW', 'EXPIRED'].includes(appointment.status)) {
      throw new ApiError(400, `Cannot reschedule an appointment in ${appointment.status} status.`, ErrorCodes.VALIDATION_ERROR);
    }

    const config = await prisma.branchBookingConfig.findUnique({ where: { branchId: appointment.branchId } });
    if (!config || !config.reschedulingEnabled) {
      throw new ApiError(400, 'Rescheduling is disabled for this branch.', ErrorCodes.VALIDATION_ERROR);
    }

    // Determine new staff
    const staffId = newStaffId || appointment.staff[0]?.staffId;
    const newEndTime = new Date(newStartTime.getTime() + appointment.service.durationMinutes * 60000);

    // Validate availability and advance booking rules
    const now = new Date();
    const minutesToAppointment = (newStartTime.getTime() - now.getTime()) / 60000;
    if (minutesToAppointment < config.minimumAdvanceBookingMinutes) {
      throw new ApiError(400, `Cannot book less than ${config.minimumAdvanceBookingMinutes} minutes in advance.`, ErrorCodes.VALIDATION_ERROR);
    }
    const daysToAppointment = minutesToAppointment / (60 * 24);
    if (daysToAppointment > config.maximumAdvanceBookingDays) {
      throw new ApiError(400, `Cannot book more than ${config.maximumAdvanceBookingDays} days in advance.`, ErrorCodes.VALIDATION_ERROR);
    }

    // Check conflicts
    const conflict = await prisma.appointment.findFirst({
      where: {
        branchId: appointment.branchId,
        id: { not: appointmentId },
        scheduledStart: { lt: newEndTime },
        scheduledEnd: { gt: newStartTime },
        status: { notIn: ['CANCELLED', 'NO_SHOW', 'EXPIRED'] },
        ...(staffId ? { staff: { some: { staffId } } } : {})
      }
    });

    if (conflict) {
      // NOTE: In a real system we would call availability service to find alternatives here.
      throw new ApiError(409, 'Time slot or staff is unavailable at the requested time.', ErrorCodes.CONFLICT);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedAppt = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          scheduledStart: newStartTime,
          scheduledEnd: newEndTime
        }
      });

      if (newStaffId && newStaffId !== appointment.staff[0]?.staffId) {
        await tx.appointmentStaff.deleteMany({ where: { appointmentId } });
        await tx.appointmentStaff.create({ data: { appointmentId, staffId: newStaffId } });
      }

      await tx.appointmentStatusHistory.create({
        data: {
          appointmentId,
          statusFrom: appointment.status,
          statusTo: appointment.status,
          actorId: userId,
          actorType: AppointmentActorType.USER,
          reason: reason || 'Customer rescheduled',
        }
      });
      
      await auditLogService.createAuditLog(
        {
          businessId: appointment.businessId,
          actorId: userId, // User doing the action
          action: 'APPOINTMENT_RESCHEDULED_BY_CUSTOMER',
          entityType: 'Appointment',
          entityId: appointmentId,
          oldValues: { scheduledStart: appointment.scheduledStart, scheduledEnd: appointment.scheduledEnd },
          newValues: { scheduledStart: newStartTime, scheduledEnd: newEndTime },
        },
        tx
      );

      return updatedAppt;
    });

    // Send SMS (placeholder)
    // await smsService.send(user.phone, "Your appointment has been rescheduled...");

    return this.getCustomerAppointment(userId, appointmentId);
  }

  async cancelAppointment(userId: string, appointmentId: string, reason?: string) {
    const customerIds = await this.getCustomerIdsForUser(userId);
    if (customerIds.length === 0) throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment || !customerIds.includes(appointment.customerId)) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }

    if (['COMPLETED', 'CANCELLED', 'NO_SHOW', 'EXPIRED'].includes(appointment.status)) {
      throw new ApiError(400, `Cannot cancel an appointment in ${appointment.status} status.`, ErrorCodes.VALIDATION_ERROR);
    }

    const config = await prisma.branchBookingConfig.findUnique({ where: { branchId: appointment.branchId } });
    if (!config || !config.customerCancellationEnabled) {
      throw new ApiError(400, 'Customer cancellation is disabled for this branch.', ErrorCodes.VALIDATION_ERROR);
    }

    const now = new Date();
    const minutesToAppointment = (appointment.scheduledStart.getTime() - now.getTime()) / 60000;
    if (minutesToAppointment < config.cancellationWindowMinutes) {
      throw new ApiError(400, `Cannot cancel within ${config.cancellationWindowMinutes} minutes of the appointment.`, ErrorCodes.VALIDATION_ERROR);
    }

    // Determine refund amount based on actual payments recorded
    const paidPayments = await prisma.appointmentPayment.aggregate({
      where: { appointmentId, status: 'PAID' },
      _sum: { amount: true },
    });
    const amountPaid = paidPayments._sum.amount || new Prisma.Decimal(0);

    let refundableAmount = new Prisma.Decimal(0);
    if (amountPaid.gt(0)) {
      if (config.refundPolicyType === 'FULL_REFUND') {
        refundableAmount = amountPaid;
      } else if (config.refundPolicyType === 'PARTIAL_REFUND' && config.refundPercentage) {
        refundableAmount = amountPaid.mul(config.refundPercentage).div(100);
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          status: AppointmentStatus.CANCELLED,
          cancelledAt: new Date()
        }
      });

      await tx.appointmentStatusHistory.create({
        data: {
          appointmentId,
          statusFrom: appointment.status,
          statusTo: AppointmentStatus.CANCELLED,
          actorId: userId,
          actorType: AppointmentActorType.USER,
          reason: reason || 'Customer cancelled',
        }
      });

      if (amountPaid.gt(0)) {
        await tx.cancellationRecord.create({
          data: {
            appointmentId,
            amountPaid,
            refundableAmount,
            refundStatus: refundableAmount.gt(0) ? 'REFUND_PENDING' : 'NOT_APPLICABLE',
            reason: reason || 'Customer cancellation',
          }
        });
      }

      await auditLogService.createAuditLog(
        {
          businessId: appointment.businessId,
          actorId: userId,
          action: 'APPOINTMENT_CANCELLED_BY_CUSTOMER',
          entityType: 'Appointment',
          entityId: appointmentId,
          oldValues: { status: appointment.status },
          newValues: { status: AppointmentStatus.CANCELLED },
        },
        tx
      );
    });

    // Send SMS (placeholder)
    // await smsService.send(user.phone, "Your appointment has been cancelled.");

    return this.getCustomerAppointment(userId, appointmentId);
  }

  async getAppointmentHistory(userId: string, appointmentId: string) {
    const customerIds = await this.getCustomerIdsForUser(userId);
    if (customerIds.length === 0) throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment || !customerIds.includes(appointment.customerId)) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }

    const [statusHistory, serviceUsages, payments, receipt] = await Promise.all([
      prisma.appointmentStatusHistory.findMany({
        where: { appointmentId },
        orderBy: { transitionTimestamp: 'asc' },
        select: {
          id: true,
          statusFrom: true,
          statusTo: true,
          reason: true,
          transitionTimestamp: true,
        },
      }),
      prisma.serviceUsage.findMany({
        where: { appointmentId },
        orderBy: { recordedAt: 'asc' },
        select: {
          id: true,
          serviceName: true,
          serviceDetails: true,
          productsUsed: true,
          notes: true,
          recordedAt: true,
        },
      }),
      prisma.appointmentPayment.findMany({
        where: { appointmentId, status: 'PAID' },
        orderBy: { paidAt: 'asc' },
        select: {
          id: true,
          amount: true,
          status: true,
          paidAt: true,
          paymentMethod: { select: { name: true, type: true } },
        },
      }),
      prisma.paymentReceipt.findFirst({
        where: { appointmentId },
        orderBy: { submittedAt: 'desc' },
        select: {
          id: true,
          status: true,
          submittedAmount: true,
          receiptImageUrl: true,
          submittedAt: true,
          reviewedAt: true,
          rejectionReason: true,
        },
      }),
    ]);

    return { statusHistory, serviceUsages, payments, receipt };
  }

  private mapToCustomerResponse(appointment: any): any {
    return {
      id: appointment.id,
      business: appointment.business,
      branch: appointment.branch,
      service: appointment.service,
      scheduledStart: appointment.scheduledStart,
      scheduledEnd: appointment.scheduledEnd,
      status: appointment.status,
      totalAmount: appointment.totalAmount,
      depositAmount: appointment.depositAmount,
      notes: appointment.notes,
      bookingSource: appointment.bookingSource,
      createdAt: appointment.createdAt,
      staff: appointment.staff?.[0] ? {
        id: appointment.staff[0].staff.id,
        firstName: appointment.staff[0].staff.firstName,
      } : null, // Hide staff last name for privacy sometimes, but let's keep it simple
    };
  }
}

export const customerAppointmentService = new CustomerAppointmentService();
