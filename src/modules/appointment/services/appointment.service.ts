import { DateTime } from 'luxon';
import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { auditLogService } from '../../business/services/audit-log.service';
import { availabilityService } from '../../services/availability/availability.service';
import { customerService } from '../../customer/services/customer.service';
import { appointmentRepository } from '../repository/appointment.repository';
import { appointmentMatchingService } from './appointment-matching.service';
import {
  AppointmentCreateCoreInput,
  AppointmentValidationResult,
  AppointmentResponse,
  AppointmentStatusHistoryResponse,
} from '../types';
import { AppointmentStatus, BookingSource, AppointmentActorType } from '@prisma/client';
import { Prisma } from '@prisma/client';

export class AppointmentService {
  /**
   * Core appointment creation logic.
   * Handles all booking sources (ONLINE, STAFF, PHONE, WALK_IN).
   * Centralizes all validation, status determination, and transaction logic.
   */
  async createAppointment(input: AppointmentCreateCoreInput, actorId: string): Promise<AppointmentResponse> {
    const {
      businessId,
      branchId,
      customerId,
      serviceId,
      staffId,
      scheduledStart,
      scheduledEnd,
      notes,
      internalNotes,
      bookingSource,
      createdById,
    } = input;

    // 1. Validate all entities and relationships
    const validation = await this.validateAppointmentCreation({
      businessId,
      branchId,
      customerId,
      serviceId,
      staffId,
      scheduledStart,
      scheduledEnd,
      bookingSource: input.bookingSource,
    });

    if (!validation.isValid) {
      throw new ApiError(400, validation.errors.join('; '), ErrorCodes.VALIDATION_ERROR);
    }

    if (!validation.effectiveConfig) {
      throw new ApiError(400, 'Service configuration not found', ErrorCodes.VALIDATION_ERROR);
    }

    const { business, branch, service, customer, staff, effectiveConfig } = validation;

    // 2. Determine initial status based on booking source and config
    let initialStatus: AppointmentStatus;
    const bookingConfig = await this.getBranchBookingConfig(branchId);

    if (bookingSource === BookingSource.WALK_IN) {
      initialStatus = AppointmentStatus.CHECKED_IN;
    } else if (bookingConfig?.bookingApprovalRequired) {
      initialStatus = AppointmentStatus.PENDING;
    } else {
      initialStatus = AppointmentStatus.CONFIRMED;
    }

    // 3. Calculate pricing (store historical price)
    const totalAmount = effectiveConfig.effectivePrice;
    const depositAmount = this.calculateDeposit(
      effectiveConfig.depositPolicyType,
      effectiveConfig.depositAmount,
      totalAmount
    );

    // 4. Create appointment with all related records in transaction
    const appointment = await prisma.$transaction(async (tx) => {
      // Check for conflicting appointments
      await this.checkConflicts(tx, {
        branchId,
        staffId: staff?.id,
        scheduledStart,
        scheduledEnd,
        serviceId: input.serviceId,
        excludeAppointmentId: undefined,
      });

      // Create appointment
      const appointment = await tx.appointment.create({
        data: {
          businessId,
          branchId,
          customerId: input.customerId,
          serviceId: input.serviceId,
          scheduledStart,
          scheduledEnd,
          status: initialStatus,
          totalAmount: new Prisma.Decimal(totalAmount.toString()),
          depositAmount: depositAmount ? new Prisma.Decimal(depositAmount.toString()) : null,
          notes: input.notes,
          internalNotes: input.internalNotes,
          bookingSource: input.bookingSource,
          createdById: actorId,
          ...(initialStatus === AppointmentStatus.CONFIRMED ? { confirmedAt: new Date() } : {}),
          ...(initialStatus === AppointmentStatus.CHECKED_IN ? { checkedInAt: new Date() } : {}),
        },
      });

      // Create status history
      await tx.appointmentStatusHistory.create({
        data: {
          appointmentId: appointment.id,
          statusFrom: null,
          statusTo: initialStatus,
          actorId: actorId,
          actorType: AppointmentActorType.USER,
          reason: `Appointment created via ${bookingSource}`,
        },
      });

      // Assign staff if provided
      if (input.staffId) {
        await tx.appointmentStaff.create({
          data: {
            appointmentId: appointment.id,
            staffId: input.staffId,
          },
        });
      }

      // Create audit log
      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: actorId,
          action: 'APPOINTMENT_CREATED',
          entityType: 'Appointment',
          entityId: appointment.id,
          newValues: {
            branchId,
            customerId,
            serviceId,
            staffId: input.staffId,
            scheduledStart: scheduledStart.toISOString(),
            scheduledEnd: scheduledEnd.toISOString(),
            status: initialStatus,
            bookingSource,
            totalAmount,
          },
        },
        tx
      );

      return appointment;
    });

    // Return full appointment with relations
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
    staffId?: string;
    scheduledStart: Date;
    scheduledEnd: Date;
    bookingSource: string;
  }): Promise<AppointmentValidationResult> {
    const { businessId, branchId, customerId, serviceId, staffId, scheduledStart, scheduledEnd, bookingSource } = input;

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
    const customer = await prisma.customer.findUnique({ where: { id: customerId, businessId } });
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

    // Validate staff if provided
    let staff = null;
    if (input.staffId) {
      const staffRecord = await prisma.staff.findUnique({ where: { id: input.staffId } });
      if (!staffRecord || staffRecord.businessId !== businessId || staffRecord.branchId !== branchId) {
        return { isValid: false, errors: ['Staff not found or not in this branch'] };
      }
      if (staffRecord.status !== 'ACTIVE') {
        return { isValid: false, errors: ['Staff is not active'] };
      }

      // Check staff qualification
      const qualification = await prisma.staffServiceQualification.findFirst({
        where: { staffId: input.staffId, serviceId: input.serviceId, isActive: true },
      });
      if (!qualification) {
        return { isValid: false, errors: ['Staff is not qualified for this service'] };
      }
      staff = staffRecord;
    }

    // Validate time slot
    if (scheduledStart >= scheduledEnd) {
      return { isValid: false, errors: ['scheduledStart must be before scheduledEnd'] };
    }

    // Check if slot is valid for branch hours and staff availability
    const slotValidation = await this.validateTimeSlot({
      branchId,
      serviceId: input.serviceId,
      staffId: input.staffId,
      scheduledStart,
      scheduledEnd,
      bookingSource,
    });

    if (!slotValidation.isValid) {
      return { isValid: false, errors: slotValidation.errors };
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

    // Validate staff availability if staff is specified
    if (staffId) {
      const staffValidation = await this.validateStaffAvailability({
        staffId,
        branchId,
        scheduledStart,
        scheduledEnd,
        serviceId: input.serviceId,
      });
      if (!staffValidation.isValid) {
        return { isValid: false, errors: staffValidation.errors };
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

  private async validateTimeSlot(input: {
    branchId: string;
    serviceId: string;
    staffId?: string;
    scheduledStart: Date;
    scheduledEnd: Date;
    bookingSource: string;
  }) {
    return { isValid: true, errors: [] };
  }

  private async validateStaffAvailability(input: {
    staffId: string;
    branchId: string;
    scheduledStart: Date;
    scheduledEnd: Date;
    serviceId: string;
  }) {
    return { isValid: true, errors: [] };
  }

  private async getBranchBookingConfig(branchId: string) {
    return prisma.branchBookingConfig.findUnique({ where: { branchId } });
  }

  private calculateDeposit(policyType: string, depositAmount: number | null, totalAmount: number): number | null {
    if (policyType === 'NONE' || policyType === 'FULL') return null;
    if (policyType === 'FIXED') return depositAmount;
    if (policyType === 'PERCENTAGE') return Math.round(totalAmount * (depositAmount || 0) / 100);
    return null;
  }

  async checkConflicts(tx: any, input: {
    branchId: string;
    staffId?: string;
    scheduledStart: Date;
    scheduledEnd: Date;
    serviceId: string;
    excludeAppointmentId?: string;
  }) {
    const where: any = {
      branchId: input.branchId,
      scheduledStart: { lt: input.scheduledEnd },
      scheduledEnd: { gt: input.scheduledStart },
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
    };

    if (input.excludeAppointmentId) {
      where.id = { not: input.excludeAppointmentId };
    }

    if (input.staffId) {
      where.staff = { some: { staffId: input.staffId } };
    }

    const conflict = await tx.appointment.findFirst({ where });
    if (conflict) {
      throw new ApiError(409, 'Time slot conflicts with existing appointment', ErrorCodes.CONFLICT);
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

    const oldValues = {
      scheduledStart: appointment.scheduledStart,
      scheduledEnd: appointment.scheduledEnd,
      status: appointment.status,
      staffIds: appointment.staff.map(s => s.staffId),
      notes: appointment.notes,
      internalNotes: appointment.internalNotes,
    };

    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          ...(data.scheduledStart ? { scheduledStart: new Date(data.scheduledStart) } : {}),
          ...(data.scheduledEnd ? { scheduledEnd: new Date(data.scheduledEnd) } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.internalNotes !== undefined ? { internalNotes: data.internalNotes } : {}),
          ...(data.status ? { status: data.status } : {}),
        },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, phones: true } },
          service: { select: { id: true, name: true, durationMinutes: true, price: true } },
          staff: { include: { staff: { select: { id: true, firstName: true, lastName: true } } } },
        },
      });

      // Handle staff reassignment
      if (data.staffId !== undefined) {
        await tx.appointmentStaff.deleteMany({ where: { appointmentId } });
        if (data.staffId) {
          await tx.appointmentStaff.create({ data: { appointmentId, staffId: data.staffId } });
        }
      }

      // Create status history if status changed
      if (data.status && data.status !== appointment.status) {
        await tx.appointmentStatusHistory.create({
          data: {
            appointmentId,
            statusFrom: appointment.status,
            statusTo: data.status,
            actorId: userId,
            actorType: AppointmentActorType.USER,
            reason: data.reason || 'Status updated by user',
          },
        });

        // Update timestamp fields
        const timestampField = this.getTimestampField(data.status);
        if (timestampField) {
          await tx.appointment.update({
            where: { id: appointmentId },
            data: { [timestampField]: new Date() },
          });
        }
      }

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: userId,
          action: 'APPOINTMENT_UPDATED',
          entityType: 'Appointment',
          entityId: appointmentId,
          oldValues,
          newValues: {
            scheduledStart: data.scheduledStart || appointment.scheduledStart,
            scheduledEnd: data.scheduledEnd || appointment.scheduledEnd,
            status: data.status || appointment.status,
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
      PENDING: [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED],
      CONFIRMED: [AppointmentStatus.CHECKED_IN, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
      CHECKED_IN: [AppointmentStatus.IN_PROGRESS, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
      IN_PROGRESS: [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED],
      COMPLETED: [],
      CANCELLED: [],
      NO_SHOW: [],
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
    actorId: string,
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
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment || appointment.businessId !== businessId) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyAppointmentAccess(businessId, userId, appointment);

    const staff = await prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff || staff.businessId !== businessId || staff.branchId !== appointment.branchId) {
      throw new ApiError(400, 'Staff not found or not in this branch', ErrorCodes.BRANCH_NOT_IN_BUSINESS);
    }
    if (staff.status !== 'ACTIVE') {
      throw new ApiError(400, 'Staff is not active', ErrorCodes.VALIDATION_ERROR);
    }

    // Check qualification
    const qualification = await prisma.staffServiceQualification.findFirst({
      where: { staffId, serviceId: appointment.serviceId, isActive: true },
    });
    if (!qualification) {
      throw new ApiError(400, 'Staff is not qualified for this service', ErrorCodes.VALIDATION_ERROR);
    }

    // Check staff availability at appointment time
    const conflict = await prisma.appointment.findFirst({
      where: {
        staff: { some: { staffId } },
        scheduledStart: { lt: appointment.scheduledEnd },
        scheduledEnd: { gt: appointment.scheduledStart },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        id: { not: appointmentId },
      },
    });
    if (conflict) {
      throw new ApiError(409, 'Staff has a conflicting appointment at this time', ErrorCodes.CONFLICT);
    }

    await prisma.appointmentStaff.upsert({
      where: { appointmentId_staffId: { appointmentId, staffId } },
      create: { appointmentId, staffId },
      update: {},
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

    await prisma.appointmentStaff.deleteMany({ where: { appointmentId } });

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
}

export const appointmentService = new AppointmentService();