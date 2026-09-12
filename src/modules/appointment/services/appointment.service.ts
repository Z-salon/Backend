import { DateTime } from 'luxon';
import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { auditLogService } from '../../business/services/audit-log.service';
import { availabilityService } from '../../services/availability/availability.service';
import { appointmentMatchingService } from './appointment-matching.service';
import {
  AppointmentCreateCoreInput,
  AppointmentValidationResult,
  AppointmentResponse,
} from '../types';
import { AppointmentStatus, BookingSource, AppointmentActorType, EmployeeAssignmentMode } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { sendAppointmentConfirmationSms } from '../../auth/sms/sms.service';

export class AppointmentService {
  /**
   * Core appointment creation logic.
   * Handles all booking sources (ONLINE, STAFF, PHONE, WALK_IN).
   * Centralizes all validation, status determination, and transaction logic.
   */
  async createAppointment(input: AppointmentCreateCoreInput, actorId: string | null): Promise<AppointmentResponse> {
    const {
      businessId,
      branchId,
      customerId,
      serviceId,
      staffId,
      notes,
      internalNotes,
      bookingSource,
    } = input;

    if (!staffId) {
      throw new ApiError(400, 'staffId is required', ErrorCodes.VALIDATION_ERROR);
    }

    let scheduledStart = input.scheduledStart;
    if (bookingSource === BookingSource.WALK_IN && !scheduledStart) {
      const branchRecord = await prisma.branch.findUnique({ where: { id: branchId } });
      if (!branchRecord) {
        throw new ApiError(400, 'Branch not found in this business', ErrorCodes.VALIDATION_ERROR);
      }
      scheduledStart = DateTime.now().setZone(branchRecord.timezone).toJSDate();
    }
    if (!scheduledStart) {
      throw new ApiError(400, 'scheduledStart is required', ErrorCodes.VALIDATION_ERROR);
    }

    const validation = await this.validateAppointmentCreation({
      businessId,
      branchId,
      customerId,
      serviceId,
      staffId,
      scheduledStart,
      bookingSource: input.bookingSource,
    });

    if (!validation.isValid) {
      throw new ApiError(400, validation.errors.join('; '), ErrorCodes.VALIDATION_ERROR);
    }

    if (!validation.effectiveConfig) {
      throw new ApiError(400, 'Service configuration not found', ErrorCodes.VALIDATION_ERROR);
    }

    const { customer, effectiveConfig } = validation;
    const scheduledEnd = new Date(scheduledStart.getTime() + effectiveConfig.effectiveDurationMinutes * 60000);

    const bookingConfig = await this.getBranchBookingConfig(branchId);
    const totalAmount = effectiveConfig.effectivePrice;
    const depositAmount = this.calculateDeposit(
      effectiveConfig.depositPolicyType,
      effectiveConfig.depositAmount,
      totalAmount
    );
    const depositRequired = depositAmount !== null && depositAmount > 0;

    if (
      (bookingSource === BookingSource.PHONE || bookingSource === BookingSource.STAFF) &&
      depositRequired &&
      !input.verifiedPayment
    ) {
      throw new ApiError(
        400,
        'Deposit is required for this service. Verify payment first, then create a confirmed appointment with payment details. An appointment will not be created until payment is verified.',
        ErrorCodes.VALIDATION_ERROR
      );
    }

    if (input.verifiedPayment) {
      if (!actorId) {
        throw new ApiError(400, 'A staff user is required to record a verified payment', ErrorCodes.VALIDATION_ERROR);
      }
      const paymentMethod = await prisma.paymentMethod.findUnique({
        where: { id: input.verifiedPayment.paymentMethodId },
      });
      if (!paymentMethod || paymentMethod.businessId !== businessId || !paymentMethod.isActive) {
        throw new ApiError(400, 'Invalid or inactive payment method', ErrorCodes.VALIDATION_ERROR);
      }
      if (input.verifiedPayment.amount <= 0) {
        throw new ApiError(400, 'Payment amount must be greater than zero', ErrorCodes.VALIDATION_ERROR);
      }
    }

    if (input.verifiedPayment) {
      if (!actorId) {
        throw new ApiError(400, 'Verified payment can only be recorded by staff', ErrorCodes.VALIDATION_ERROR);
      }
      const paymentMethod = await prisma.paymentMethod.findUnique({
        where: { id: input.verifiedPayment.paymentMethodId },
      });
      if (!paymentMethod || paymentMethod.businessId !== businessId || !paymentMethod.isActive) {
        throw new ApiError(400, 'Invalid or inactive payment method', ErrorCodes.VALIDATION_ERROR);
      }
    }

    let initialStatus: AppointmentStatus;
    if (bookingSource === BookingSource.WALK_IN) {
      initialStatus = AppointmentStatus.CHECKED_IN;
    } else if (bookingSource === BookingSource.ONLINE && (depositRequired || bookingConfig?.bookingApprovalRequired)) {
      initialStatus = AppointmentStatus.PENDING;
    } else {
      initialStatus = AppointmentStatus.CONFIRMED;
    }

    const actorType = actorId ? AppointmentActorType.USER : AppointmentActorType.SYSTEM;

    const appointment = await prisma.$transaction(async (tx) => {
      await this.checkConflicts(tx, {
        branchId,
        staffId,
        scheduledStart,
        scheduledEnd,
        serviceId,
        excludeAppointmentId: undefined,
      });

      const appointment = await tx.appointment.create({
        data: {
          businessId,
          branchId,
          customerId,
          serviceId,
          scheduledStart,
          scheduledEnd,
          status: initialStatus,
          totalAmount: new Prisma.Decimal(totalAmount.toString()),
          depositAmount: depositAmount ? new Prisma.Decimal(depositAmount.toString()) : null,
          notes,
          internalNotes,
          bookingSource,
          createdById: actorId,
          ...(initialStatus === AppointmentStatus.CONFIRMED ? { confirmedAt: new Date() } : {}),
          ...(initialStatus === AppointmentStatus.CHECKED_IN ? { checkedInAt: new Date() } : {}),
        },
      });

      await tx.appointmentStatusHistory.create({
        data: {
          appointmentId: appointment.id,
          statusFrom: null,
          statusTo: initialStatus,
          actorId: actorId,
          actorType,
          reason: `Appointment created via ${bookingSource}`,
        },
      });

      await tx.appointmentStaff.create({
        data: {
          appointmentId: appointment.id,
          staffId,
        },
      });

      if (input.verifiedPayment && (bookingSource === BookingSource.PHONE || bookingSource === BookingSource.STAFF)) {
        await tx.appointmentPayment.create({
          data: {
            appointmentId: appointment.id,
            businessId,
            branchId,
            paymentMethodId: input.verifiedPayment.paymentMethodId,
            amount: new Prisma.Decimal(input.verifiedPayment.amount.toString()),
            status: 'PAID',
            reference: input.verifiedPayment.reference,
            notes: input.verifiedPayment.notes,
            recordedById: actorId as string,
          },
        });
      }

      if (actorId) {
        await auditLogService.createAuditLog(
          {
            businessId,
            actorId,
            action: 'APPOINTMENT_CREATED',
            entityType: 'Appointment',
            entityId: appointment.id,
            newValues: {
              branchId,
              customerId,
              serviceId,
              staffId,
              scheduledStart: scheduledStart.toISOString(),
              scheduledEnd: scheduledEnd.toISOString(),
              status: initialStatus,
              bookingSource,
              totalAmount,
            },
          },
          tx
        );
      }

      return appointment;
    }, { timeout: 10000 });

    if (initialStatus === AppointmentStatus.CONFIRMED) {
      await this.sendConfirmationSms(customer, appointment.scheduledStart, appointment.scheduledEnd);
    }

    return this.getAppointmentById(appointment.id, businessId);
  }

  /**
   * Validates all aspects of appointment creation.
   */
  private async validateAppointmentCreation(input: {
    businessId: string;
    branchId: string;
    customerId: string;
    serviceId: string;
    staffId: string;
    scheduledStart: Date;
    bookingSource: string;
  }): Promise<AppointmentValidationResult> {
    const { businessId, branchId, customerId, serviceId, staffId, scheduledStart, bookingSource } = input;

    if (!staffId) {
      return { isValid: false, errors: ['staffId is required'] };
    }

    // Validate business
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business || business.status !== 'ACTIVE') {
      return { isValid: false, errors: ['Business not found or inactive'] };
    }

    // Validate branch
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch || branch.businessId !== businessId) {
      return { isValid: false, errors: ['Branch not found in this business'] };
    }
    if (!branch.isActive) {
      return { isValid: false, errors: ['Branch is not active'] };
    }

    // Validate customer
    const customer = await prisma.customer.findUnique({
      where: { id: customerId, businessId },
      include: { phones: true },
    });
    if (!customer) {
      return { isValid: false, errors: ['Customer not found in this business'] };
    }
    if (customer.status === 'ARCHIVED') {
      return { isValid: false, errors: ['Customer is archived'] };
    }

    // Validate service at branch
    const serviceValidation = await availabilityService.validateServiceAtBranch(input.serviceId, branchId);
    if (!serviceValidation.isValid) {
      return { isValid: false, errors: serviceValidation.errors };
    }

    // Validate staff (required for MVP)
    const staffRecord = await prisma.staff.findUnique({ where: { id: staffId } });
    if (!staffRecord) {
      return { isValid: false, errors: ['Staff not found'] };
    }
    if (staffRecord.businessId !== businessId) {
      return { isValid: false, errors: ['Staff does not belong to this business'] };
    }
    if (staffRecord.branchId !== branchId) {
      return { isValid: false, errors: ['Staff does not belong to this branch'] };
    }
    if (staffRecord.status !== 'ACTIVE') {
      return { isValid: false, errors: ['Staff is not active'] };
    }

    const qualification = await prisma.staffServiceQualification.findFirst({
      where: { staffId, serviceId, isActive: true },
    });
    if (!qualification) {
      return { isValid: false, errors: ['Staff is not qualified for this service'] };
    }
    const staff = staffRecord;

    if (bookingSource === 'ONLINE') {
      const mode = serviceValidation.effectiveConfig?.employeeAssignmentMode;
      if (mode && mode !== EmployeeAssignmentMode.CUSTOMER_CHOOSES) {
        return {
          isValid: false,
          errors: [
            `Online booking requires CUSTOMER_CHOOSES staff assignment. ${mode} is not supported in this MVP.`,
          ],
        };
      }
    }

    const slotValidation = await availabilityService.validateSlot({
      businessId,
      branchId,
      serviceId,
      staffId,
      startTime: scheduledStart.toISOString(),
      source: bookingSource === 'ONLINE' ? 'PUBLIC' : 'INTERNAL',
    });

    if (!slotValidation.valid) {
      return { isValid: false, errors: [slotValidation.reason || 'Time slot is not available'] };
    }

    // Check online booking policy
    if (bookingSource === 'ONLINE') {
      const bookingConfig = await this.getBranchBookingConfig(branchId);
      if (bookingConfig && !bookingConfig.onlineBookingEnabled) {
        return { isValid: false, errors: ['Online booking is disabled for this branch'] };
      }
    }

    // Check walk-in policy
    if (bookingSource === 'WALK_IN') {
      const bookingConfig = await this.getBranchBookingConfig(branchId);
      if (bookingConfig && !bookingConfig.walkInEnabled) {
        return { isValid: false, errors: ['Walk-in appointments are disabled for this branch'] };
      }
    }

    return {
      isValid: true,
      errors: [],
      business,
      branch,
      service: serviceValidation.service,
      customer,
      staff,
      effectiveConfig: serviceValidation.effectiveConfig,
    };
  }



  private async getBranchBookingConfig(branchId: string) {
    return prisma.branchBookingConfig.findUnique({ where: { branchId } });
  }

  private calculateDeposit(policyType: string, depositAmount: number | null, totalAmount: number): number | null {
    if (policyType === 'NONE') return null;
    if (policyType === 'FULL') return totalAmount;
    if (policyType === 'FIXED') return depositAmount;
    if (policyType === 'PERCENTAGE') return Math.round(totalAmount * (depositAmount || 0) / 100);
    return null;
  }

  private async sendConfirmationSms(customer: any, scheduledStart: Date, scheduledEnd: Date): Promise<void> {
    try {
      const phone = customer?.phones?.find((p: any) => p.isPrimary)?.phone || customer?.phones?.[0]?.phone;
      if (!phone) return;
      await sendAppointmentConfirmationSms(phone, scheduledStart, scheduledEnd);
    } catch (err) {
      console.error('Failed to send appointment confirmation SMS', err);
    }
  }

  async checkConflicts(tx: any, input: {
    branchId: string;
    staffId: string;
    scheduledStart: Date;
    scheduledEnd: Date;
    serviceId: string;
    excludeAppointmentId?: string;
  }) {
    if (!input.staffId) {
      throw new ApiError(400, 'staffId is required', ErrorCodes.VALIDATION_ERROR);
    }

    // Resolve buffer for the new appointment
    const newServiceConfig = await availabilityService.resolveServiceBranchConfig(input.serviceId, input.branchId);
    if (!newServiceConfig) {
       throw new ApiError(400, 'Service configuration not found', ErrorCodes.VALIDATION_ERROR);
    }
    const newBuffer = newServiceConfig.bufferMinutes || 0;
    const newReservedEnd = new Date(input.scheduledEnd.getTime() + newBuffer * 60000);

    const dayStart = new Date(input.scheduledStart);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const where: any = {
      staff: { some: { staffId: input.staffId } },
      scheduledStart: { lt: dayEnd },
      scheduledEnd: { gt: dayStart },
      status: { notIn: ['CANCELLED', 'NO_SHOW', 'EXPIRED'] },
    };

    if (input.excludeAppointmentId) {
      where.id = { not: input.excludeAppointmentId };
    }

    const appointments = await tx.appointment.findMany({
      where,
      include: {
        service: {
          include: { branchAssignments: true }
        }
      }
    });

    for (const appt of appointments) {
      let existingBuffer = 0;
      const branchAssignment = appt.service.branchAssignments.find((ba: any) => ba.branchId === appt.branchId);
      if (branchAssignment && branchAssignment.bufferMinutes !== undefined) {
        existingBuffer = branchAssignment.bufferMinutes;
      }
      const existingReservedEnd = new Date(appt.scheduledEnd.getTime() + existingBuffer * 60000);

      // Check for overlap: newStart < existingReservedEnd AND existingStart < newReservedEnd
      if (input.scheduledStart < existingReservedEnd && appt.scheduledStart < newReservedEnd) {
        throw new ApiError(409, 'Time slot conflicts with existing appointment', ErrorCodes.CONFLICT);
      }
    }
  }

  async getAppointmentById(id: string, businessId: string): Promise<any> {
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phones: { select: { phone: true, isPrimary: true } },
          },
        },
        service: { select: { id: true, name: true, durationMinutes: true, price: true } },
        staff: { include: { staff: { select: { id: true, firstName: true, lastName: true } } } },
        statusHistory: {
          orderBy: { transitionTimestamp: 'asc' },
          include: { actor: { select: { id: true, phone: true } } },
        },
      },
    });

    if (!appointment || appointment.businessId !== businessId) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }

    return this.mapToResponse(appointment);
  }

  async getAppointments(businessId: string, userId: string, query: any) {
    const auth = await this.getMembershipAndUserRoles(businessId, userId);

    const where: any = { businessId };

    if (query.branchId) where.branchId = query.branchId;
    if (query.customerId) where.customerId = query.customerId;
    if (query.serviceId) where.serviceId = query.serviceId;
    if (query.staffId) where.staff = { some: { staffId: query.staffId } };
    if (query.status) where.status = query.status;
    if (query.bookingSource) where.bookingSource = query.bookingSource;

    if (query.startDate || query.endDate) {
      where.scheduledStart = {};
      if (query.startDate) where.scheduledStart.gte = new Date(query.startDate);
      if (query.endDate) where.scheduledStart.lte = new Date(query.endDate);
    }

    if (!auth.isOwnerOrAdmin) {
      const allowedBranchIds = Array.from(auth.allowedBranchIds);
      where.branchId = { in: allowedBranchIds };
      where.status = { not: 'ARCHIVED' };
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
          customer: { select: { id: true, firstName: true, lastName: true, phones: { select: { phone: true, isPrimary: true } } } },
          service: { select: { id: true, name: true, durationMinutes: true, price: true } },
          staff: { include: { staff: { select: { id: true, firstName: true, lastName: true } } } },
        },
      }),
    ]);

    return {
      data: appointments.map(this.mapToResponse),
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  }

  async updateAppointment(appointmentId: string, businessId: string, userId: string, data: any) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { staff: true },
    });
    if (!appointment || appointment.businessId !== businessId) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyAppointmentAccess(businessId, userId, appointment);

    const disallowed = ['scheduledStart', 'scheduledEnd', 'staffId', 'status', 'serviceId', 'customerId', 'branchId'];
    const attempted = disallowed.filter((field) => data[field] !== undefined);
    if (attempted.length > 0) {
      throw new ApiError(
        400,
        `Cannot update ${attempted.join(', ')} via generic PATCH. Use reschedule, service change, staff assignment, or status transition endpoints.`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    const oldValues = {
      notes: appointment.notes,
      internalNotes: appointment.internalNotes,
    };

    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.internalNotes !== undefined ? { internalNotes: data.internalNotes } : {}),
        },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, phones: true } },
          service: { select: { id: true, name: true, durationMinutes: true, price: true } },
          staff: { include: { staff: { select: { id: true, firstName: true, lastName: true } } } },
        },
      });

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: userId,
          action: 'APPOINTMENT_UPDATED',
          entityType: 'Appointment',
          entityId: appointmentId,
          oldValues,
          newValues: {
            notes: data.notes !== undefined ? data.notes : appointment.notes,
            internalNotes: data.internalNotes !== undefined ? data.internalNotes : appointment.internalNotes,
          },
        },
        tx
      );

      return updated;
    });

    return this.mapToResponse(updated);
  }

  async transitionStatus(appointmentId: string, businessId: string, userId: string, status: AppointmentStatus, reason?: string) {
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment || appointment.businessId !== businessId) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyAppointmentAccess(businessId, userId, appointment);

    // Validate status transition
    if (!this.isValidTransition(appointment.status, status)) {
      throw new ApiError(400, `Cannot transition from ${appointment.status} to ${status}`, ErrorCodes.INVALID_SCOPE_CONFIGURATION);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const timestampField = this.getTimestampField(status);
      const updated = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          status,
          ...(timestampField ? { [timestampField]: new Date() } : {}),
        },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, phones: true } },
          service: { select: { id: true, name: true, durationMinutes: true, price: true } },
          staff: { include: { staff: { select: { id: true, firstName: true, lastName: true } } } },
        },
      });

      await tx.appointmentStatusHistory.create({
        data: {
          appointmentId,
          statusFrom: appointment.status,
          statusTo: status,
          actorId: userId,
          actorType: AppointmentActorType.USER,
          reason,
        },
      });

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: userId,
          action: `APPOINTMENT_${status}`,
          entityType: 'Appointment',
          entityId: appointmentId,
          oldValues: { status: appointment.status },
          newValues: { status, reason },
        },
        tx
      );

      return updated;
    });

    return this.mapToResponse(updated);
  }

  private isValidTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
    const validTransitions: Record<AppointmentStatus, AppointmentStatus[]> = {
      PENDING: [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED, AppointmentStatus.EXPIRED],
      CONFIRMED: [AppointmentStatus.CHECKED_IN, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
      CHECKED_IN: [AppointmentStatus.IN_PROGRESS, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
      IN_PROGRESS: [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED],
      COMPLETED: [],
      CANCELLED: [],
      NO_SHOW: [],
      EXPIRED: [],
    };

    return validTransitions[from]?.includes(to) ?? false;
  }

  private getTimestampField(status: AppointmentStatus): string | null {
    switch (status) {
      case AppointmentStatus.CONFIRMED: return 'confirmedAt';
      case AppointmentStatus.CHECKED_IN: return 'checkedInAt';
      case AppointmentStatus.IN_PROGRESS: return 'inProgressAt';
      case AppointmentStatus.COMPLETED: return 'completedAt';
      case AppointmentStatus.CANCELLED: return 'cancelledAt';
      case AppointmentStatus.NO_SHOW: return 'noShowAt';
      default: return null;
    }
  }

  async cancelAppointment(businessId: string, userId: string, appointmentId: string, reason?: string) {
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment || appointment.businessId !== businessId) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyAppointmentAccess(businessId, userId, appointment);

    if (['COMPLETED', 'CANCELLED', 'NO_SHOW', 'EXPIRED'].includes(appointment.status)) {
      throw new ApiError(400, `Cannot cancel an appointment in ${appointment.status} status.`, ErrorCodes.VALIDATION_ERROR);
    }

    const config = await prisma.branchBookingConfig.findUnique({ where: { branchId: appointment.branchId } });

    // Calculate actual amount paid from payment records (not the deprecated depositAmount field)
    const paidPayments = await prisma.appointmentPayment.aggregate({
      where: { appointmentId, status: 'PAID' },
      _sum: { amount: true },
    });
    const amountPaid = paidPayments._sum.amount || new Prisma.Decimal(0);

    // Determine refund amount based on policy
    let refundableAmount = new Prisma.Decimal(0);

    // For business cancellation, they might ignore the deadline or apply the same refund rules.
    // For now, apply the refund rule if there's a payment.
    if (amountPaid.gt(0) && config) {
      if (config.refundPolicyType === 'FULL_REFUND') {
        refundableAmount = amountPaid;
      } else if (config.refundPolicyType === 'PARTIAL_REFUND' && config.refundPercentage) {
        refundableAmount = amountPaid.mul(config.refundPercentage).div(100);
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedAppt = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          status: AppointmentStatus.CANCELLED,
          cancelledAt: new Date()
        },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, phones: true } },
          service: { select: { id: true, name: true, durationMinutes: true, price: true } },
          staff: { include: { staff: { select: { id: true, firstName: true, lastName: true } } } },
        }
      });

      await tx.appointmentStatusHistory.create({
        data: {
          appointmentId,
          statusFrom: appointment.status,
          statusTo: AppointmentStatus.CANCELLED,
          actorId: userId,
          actorType: AppointmentActorType.USER,
          reason: reason || 'Business user cancelled',
        }
      });

      if (amountPaid.gt(0)) {
        await tx.cancellationRecord.create({
          data: {
            appointmentId,
            amountPaid,
            refundableAmount,
            refundStatus: refundableAmount.gt(0) ? 'REFUND_PENDING' : 'NOT_APPLICABLE',
            reason: reason || 'Business cancellation',
          }
        });
      }

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: userId,
          action: 'APPOINTMENT_CANCELLED_BY_BUSINESS',
          entityType: 'Appointment',
          entityId: appointmentId,
          oldValues: { status: appointment.status },
          newValues: { status: AppointmentStatus.CANCELLED },
        },
        tx
      );

      return updatedAppt;
    });

    return this.mapToResponse(updated);
  }

  async rescheduleBusinessAppointment(businessId: string, userId: string, appointmentId: string, newStartTime: Date, reason?: string, newStaffId?: string) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { staff: true, service: true }
    });

    if (!appointment || appointment.businessId !== businessId) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }
    await this.verifyAppointmentAccess(businessId, userId, appointment);

    if (['COMPLETED', 'CANCELLED', 'NO_SHOW', 'EXPIRED'].includes(appointment.status)) {
      throw new ApiError(400, `Cannot reschedule an appointment in ${appointment.status} status.`, ErrorCodes.VALIDATION_ERROR);
    }

    const staffId = newStaffId || appointment.staff[0]?.staffId;
    if (!staffId) {
      throw new ApiError(400, 'staffId is required for MVP', ErrorCodes.VALIDATION_ERROR);
    }

    const effectiveConfig = await availabilityService.resolveServiceBranchConfig(appointment.serviceId, appointment.branchId);
    if (!effectiveConfig) {
      throw new ApiError(400, 'Service configuration not found', ErrorCodes.VALIDATION_ERROR);
    }
    const newEndTime = new Date(newStartTime.getTime() + effectiveConfig.effectiveDurationMinutes * 60000);

    const slotValidation = await availabilityService.validateSlot({
      businessId,
      branchId: appointment.branchId,
      serviceId: appointment.serviceId,
      staffId,
      startTime: newStartTime.toISOString(),
      source: 'INTERNAL',
      excludeAppointmentId: appointmentId,
    });
    if (!slotValidation.valid) {
      throw new ApiError(409, slotValidation.reason || 'Time slot conflicts with existing availability', ErrorCodes.CONFLICT);
    }

    await this.checkConflicts(prisma, {
      branchId: appointment.branchId,
      staffId: staffId,
      scheduledStart: newStartTime,
      scheduledEnd: newEndTime,
      serviceId: appointment.serviceId,
      excludeAppointmentId: appointmentId
    });

    const updated = await prisma.$transaction(async (tx) => {
      const updatedAppt = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          scheduledStart: newStartTime,
          scheduledEnd: newEndTime
        },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, phones: true } },
          service: { select: { id: true, name: true, durationMinutes: true, price: true } },
          staff: { include: { staff: { select: { id: true, firstName: true, lastName: true } } } },
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
          reason: reason || 'Business user rescheduled',
        }
      });

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: userId,
          action: 'APPOINTMENT_RESCHEDULED_BY_BUSINESS',
          entityType: 'Appointment',
          entityId: appointmentId,
          oldValues: { scheduledStart: appointment.scheduledStart, scheduledEnd: appointment.scheduledEnd },
          newValues: { scheduledStart: newStartTime, scheduledEnd: newEndTime },
        },
        tx
      );

      return updatedAppt;
    });

    return this.mapToResponse(updated);
  }

  async editService(businessId: string, userId: string, appointmentId: string, newServiceId: string) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { staff: true, service: true }
    });

    if (!appointment || appointment.businessId !== businessId) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }
    await this.verifyAppointmentAccess(businessId, userId, appointment);

    const serviceValidation = await availabilityService.validateServiceAtBranch(newServiceId, appointment.branchId);
    if (!serviceValidation.isValid || !serviceValidation.effectiveConfig) {
      throw new ApiError(400, serviceValidation.errors.join('; '), ErrorCodes.VALIDATION_ERROR);
    }

    const effectiveConfig = serviceValidation.effectiveConfig;
    const newEndTime = new Date(appointment.scheduledStart.getTime() + effectiveConfig.effectiveDurationMinutes * 60000);
    const staffId = appointment.staff[0]?.staffId;
    if (!staffId) {
      throw new ApiError(400, 'staffId is required for MVP', ErrorCodes.VALIDATION_ERROR);
    }

    const qualification = await prisma.staffServiceQualification.findFirst({
      where: { staffId, serviceId: newServiceId, isActive: true },
    });
    if (!qualification) {
      throw new ApiError(400, 'Staff is not qualified for this service', ErrorCodes.VALIDATION_ERROR);
    }

    const slotValidation = await availabilityService.validateSlot({
      businessId,
      branchId: appointment.branchId,
      serviceId: newServiceId,
      staffId,
      startTime: appointment.scheduledStart.toISOString(),
      source: 'INTERNAL',
      excludeAppointmentId: appointmentId,
    });
    if (!slotValidation.valid) {
      throw new ApiError(409, slotValidation.reason || 'Current appointment time is not available for the new service', ErrorCodes.CONFLICT);
    }

    await this.checkConflicts(prisma, {
      branchId: appointment.branchId,
      staffId: staffId,
      scheduledStart: appointment.scheduledStart,
      scheduledEnd: newEndTime,
      serviceId: newServiceId,
      excludeAppointmentId: appointmentId
    });

    const updated = await prisma.$transaction(async (tx) => {
      const updatedAppt = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          serviceId: newServiceId,
          scheduledEnd: newEndTime,
          totalAmount: new Prisma.Decimal(effectiveConfig.effectivePrice.toString())
        },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, phones: true } },
          service: { select: { id: true, name: true, durationMinutes: true, price: true } },
          staff: { include: { staff: { select: { id: true, firstName: true, lastName: true } } } },
        }
      });

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: userId,
          action: 'APPOINTMENT_SERVICE_CHANGED',
          entityType: 'Appointment',
          entityId: appointmentId,
          oldValues: { serviceId: appointment.serviceId, totalAmount: appointment.totalAmount },
          newValues: { serviceId: newServiceId, totalAmount: effectiveConfig.effectivePrice },
        },
        tx
      );

      return updatedAppt;
    });

    return this.mapToResponse(updated);
  }

  async verifyAppointmentAccess(businessId: string, userId: string, appointment: any) {
    const auth = await this.getMembershipAndUserRoles(businessId, userId);

    if (!auth.isOwnerOrAdmin) {
      if (!auth.allowedBranchIds.has(appointment.branchId)) {
        throw new ApiError(403, 'Cannot access appointments in this branch', ErrorCodes.FORBIDDEN);
      }
    }
  }

  private async getMembershipAndUserRoles(businessId: string, userId: string) {
    const membership = await prisma.businessMember.findUnique({
      where: { businessId_userId: { businessId, userId } },
      include: {
        userRoles: {
          include: {
            role: true,
            branches: { select: { branchId: true } },
          },
        },
      },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      throw new ApiError(403, 'Not a member of this business', ErrorCodes.NOT_BUSINESS_MEMBER);
    }

    const roleSystemKeys = membership.userRoles
      .map((ur) => ur.role.systemKey)
      .filter((key): key is string => Boolean(key));

    const isOwnerOrAdmin = roleSystemKeys.some((key) => ['OWNER', 'ADMIN'].includes(key));
    const isBranchManager = roleSystemKeys.some((key) => key === 'BRANCH_MANAGER');
    const isReceptionist = roleSystemKeys.some((key) => key === 'RECEPTIONIST');

    const allowedBranchIds = new Set(
      membership.userRoles
        .filter((ur) => ur.scopeType === 'BRANCH')
        .flatMap((ur) => ur.branches.map((b) => b.branchId))
    );

    return { membership, isOwnerOrAdmin, isBranchManager, isReceptionist, allowedBranchIds };
  }

  private mapToResponse(appointment: any): any {
    return {
      id: appointment.id,
      businessId: appointment.businessId,
      branchId: appointment.branchId,
      customerId: appointment.customerId,
      serviceId: appointment.serviceId,
      scheduledStart: appointment.scheduledStart,
      scheduledEnd: appointment.scheduledEnd,
      actualStart: appointment.actualStart,
      actualEnd: appointment.actualEnd,
      status: appointment.status,
      totalAmount: appointment.totalAmount,
      depositAmount: appointment.depositAmount,
      notes: appointment.notes,
      internalNotes: appointment.internalNotes,
      bookingSource: appointment.bookingSource,
      createdById: appointment.createdById,
      confirmedAt: appointment.confirmedAt,
      checkedInAt: appointment.checkedInAt,
      inProgressAt: appointment.inProgressAt,
      completedAt: appointment.completedAt,
      cancelledAt: appointment.cancelledAt,
      noShowAt: appointment.noShowAt,
      createdAt: appointment.createdAt,
      updatedAt: appointment.updatedAt,
      customer: appointment.customer ? {
        id: appointment.customer.id,
        firstName: appointment.customer.firstName,
        lastName: appointment.customer.lastName,
        phones: appointment.customer.phones || [],
      } : undefined,
      service: appointment.service ? {
        id: appointment.service.id,
        name: appointment.service.name,
        durationMinutes: appointment.service.durationMinutes,
        price: appointment.service.price,
      } : undefined,
      staff: appointment.staff?.[0] ? {
        id: appointment.staff[0].staff.id,
        firstName: appointment.staff[0].staff.firstName,
        lastName: appointment.staff[0].staff.lastName,
      } : null,
      statusHistory: appointment.statusHistory?.map((h: any) => ({
        id: h.id,
        appointmentId: h.appointmentId,
        statusFrom: h.statusFrom,
        statusTo: h.statusTo,
        actorId: h.actorId,
        actorType: h.actorType,
        reason: h.reason,
        transitionTimestamp: h.transitionTimestamp,
        createdAt: h.createdAt,
        actor: h.actor ? { id: h.actor.id, phone: h.actor.phone } : null,
      })) || [],
    };
  }

  /**
   * Find or create customer by phone (for walk-in/phone booking)
   * Uses database-level uniqueness to prevent race conditions
   */
  async findOrCreateCustomer(
    businessId: string,
    actorId: string | null,
    data: { firstName: string; lastName: string; phone: string }
  ): Promise<{ customerId: string; isNew: boolean }> {
    return appointmentMatchingService.findOrCreateCustomer(businessId, actorId, data);
  }

  /**
   * Match customer by phone (for walk-in/phone lookup)
   */
  async matchCustomerByPhone(businessId: string, phone: string) {
    return appointmentMatchingService.matchCustomerByPhone(businessId, phone);
  }

  /**
   * Assign staff to appointment
   */
  async assignStaff(
    appointmentId: string,
    businessId: string,
    userId: string,
    staffId: string
  ) {
    if (!staffId) {
      throw new ApiError(400, 'staffId is required', ErrorCodes.VALIDATION_ERROR);
    }

    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment || appointment.businessId !== businessId) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyAppointmentAccess(businessId, userId, appointment);

    const staff = await prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) {
      throw new ApiError(400, 'Staff not found', ErrorCodes.VALIDATION_ERROR);
    }
    if (staff.businessId !== businessId) {
      throw new ApiError(400, 'Staff does not belong to this business', ErrorCodes.BRANCH_NOT_IN_BUSINESS);
    }
    if (staff.branchId !== appointment.branchId) {
      throw new ApiError(400, 'Staff does not belong to this branch', ErrorCodes.BRANCH_NOT_IN_BUSINESS);
    }
    if (staff.status !== 'ACTIVE') {
      throw new ApiError(400, 'Staff is not active', ErrorCodes.VALIDATION_ERROR);
    }

    const qualification = await prisma.staffServiceQualification.findFirst({
      where: { staffId, serviceId: appointment.serviceId, isActive: true },
    });
    if (!qualification) {
      throw new ApiError(400, 'Staff is not qualified for this service', ErrorCodes.VALIDATION_ERROR);
    }

    const slotValidation = await availabilityService.validateSlot({
      businessId,
      branchId: appointment.branchId,
      serviceId: appointment.serviceId,
      staffId,
      startTime: appointment.scheduledStart.toISOString(),
      source: 'INTERNAL',
      excludeAppointmentId: appointmentId,
    });
    if (!slotValidation.valid) {
      throw new ApiError(409, slotValidation.reason || 'Staff is not available for this appointment', ErrorCodes.CONFLICT);
    }

    await this.checkConflicts(prisma, {
      branchId: appointment.branchId,
      staffId,
      scheduledStart: appointment.scheduledStart,
      scheduledEnd: appointment.scheduledEnd,
      serviceId: appointment.serviceId,
      excludeAppointmentId: appointmentId,
    });

    await prisma.$transaction(async (tx) => {
      await tx.appointmentStaff.deleteMany({ where: { appointmentId } });
      await tx.appointmentStaff.create({ data: { appointmentId, staffId } });
    });

    await auditLogService.createAuditLog({
      businessId,
      actorId: userId,
      action: 'APPOINTMENT_STAFF_ASSIGNED',
      entityType: 'AppointmentStaff',
      entityId: appointmentId,
      newValues: { staffId },
    });

    return this.getAppointmentById(appointmentId, businessId);
  }

  /**
   * Unassign staff from appointment
   */
  async unassignStaff(
    appointmentId: string,
    businessId: string,
    userId: string
  ) {
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment || appointment.businessId !== businessId) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyAppointmentAccess(businessId, userId, appointment);

    throw new ApiError(
      400,
      'Appointments must have exactly one staff member. Use staff assignment to reassign instead of unassigning.',
      ErrorCodes.VALIDATION_ERROR
    );

    await auditLogService.createAuditLog({
      businessId,
      actorId: userId,
      action: 'APPOINTMENT_STAFF_UNASSIGNED',
      entityType: 'AppointmentStaff',
      entityId: appointmentId,
      oldValues: { appointmentId },
    });

    return this.getAppointmentById(appointmentId, businessId);
  }

  /**
   * Get appointment status history
   */
  async getStatusHistory(
    appointmentId: string,
    businessId: string,
    userId: string
  ): Promise<any[]> {
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment || appointment.businessId !== businessId) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyAppointmentAccess(businessId, userId, appointment);

    const history = await prisma.appointmentStatusHistory.findMany({
      where: { appointmentId },
      orderBy: { transitionTimestamp: 'asc' },
      include: { actor: { select: { id: true, phone: true } } },
    });

    return history.map((h: any) => ({
      id: h.id,
      appointmentId: h.appointmentId,
      statusFrom: h.statusFrom,
      statusTo: h.statusTo,
      actorId: h.actorId,
      actorType: h.actorType,
      reason: h.reason,
      transitionTimestamp: h.transitionTimestamp,
      createdAt: h.createdAt,
      actor: h.actor ? { id: h.actor.id, phone: h.actor.phone } : null,
    })); 
  }

  /**
   * Mark an appointment as NO_SHOW.
   * Only CONFIRMED appointments can become NO_SHOW (CHECKED_IN is not valid — customer arrived).
   */
  async markNoShow(
    appointmentId: string,
    businessId: string,
    userId: string,
    reason?: string
  ) {
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment || appointment.businessId !== businessId) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyAppointmentAccess(businessId, userId, appointment);

    // Only CONFIRMED appointments can be marked as no-show
    // CHECKED_IN means the customer physically arrived — nonsensical to mark no-show
    if (!this.isValidTransition(appointment.status, AppointmentStatus.NO_SHOW)) {
      throw new ApiError(
        400,
        `Cannot mark an appointment as NO_SHOW from ${appointment.status} status. ` +
          `Only CONFIRMED appointments are eligible.`,
        ErrorCodes.APPOINTMENT_INVALID_TRANSITION
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedAppt = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          status: AppointmentStatus.NO_SHOW,
          noShowAt: new Date(),
        },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, phones: true } },
          service: { select: { id: true, name: true, durationMinutes: true, price: true } },
          staff: { include: { staff: { select: { id: true, firstName: true, lastName: true } } } },
        },
      });

      await tx.appointmentStatusHistory.create({
        data: {
          appointmentId,
          statusFrom: appointment.status,
          statusTo: AppointmentStatus.NO_SHOW,
          actorId: userId,
          actorType: AppointmentActorType.USER,
          reason: reason || 'Customer did not show up',
        },
      });

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: userId,
          action: 'APPOINTMENT_NO_SHOW',
          entityType: 'Appointment',
          entityId: appointmentId,
          oldValues: { status: appointment.status },
          newValues: { status: AppointmentStatus.NO_SHOW, reason },
        },
        tx
      );

      return updatedAppt;
    });

    return this.mapToResponse(updated);
  }
}

export const appointmentService = new AppointmentService();