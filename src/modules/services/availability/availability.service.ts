import { DateTime } from 'luxon';
import { prisma } from '../../../libs/prisma';
import { ApiError } from '../../../utils/api-error';
import { EmployeeAssignmentMode } from '@prisma/client';
import {
  ServiceBranchConfig,
  AvailabilityValidationResult,
  ServiceBranchConfigInput,
  EffectiveServiceConfig,
  GetAvailableSlotsInput,
  AvailabilityResponse,
  AvailableSlotResponse,
  ValidateSlotInput,
  SlotValidationResponse,
  ValidationReasonCode,
} from './availability.types';
import { availabilityRepository } from './availability.repository';
import {
  getBranchOperatingIntervals,
  getStaffEffectiveIntervals,
} from './staff-availability.service';
import { generateSlots, isSlotFeasible } from './slot-generator';
import { Prisma } from '@prisma/client';

export class AvailabilityService {
  // ─────────────────────────────────────────────────────────────
  // PART 1 METHODS — retained from existing implementation
  // ─────────────────────────────────────────────────────────────

  async resolveServiceBranchConfig(
    serviceId: string,
    branchId: string
  ): Promise<ServiceBranchConfig | null> {
    const assignment = await prisma.serviceBranchAssignment.findUnique({
      where: { serviceId_branchId: { serviceId, branchId } },
      include: {
        service: { include: { category: true } },
        branch: true,
      },
    });

    if (!assignment || !assignment.isActive) return null;
    if (!assignment.service || assignment.service.status !== 'ACTIVE') return null;
    if (!assignment.branch || !assignment.branch.isActive) return null;
    if (!assignment.service.category || assignment.service.category.status !== 'ACTIVE') return null;

    const catBranch = await prisma.serviceCategoryBranchAssignment.findUnique({
      where: { categoryId_branchId: { categoryId: assignment.service.categoryId, branchId } },
    });
    if (!catBranch || !catBranch.isActive) return null;

    return {
      serviceId: assignment.serviceId,
      branchId: assignment.branchId,
      isActive: assignment.isActive,
      effectiveDurationMinutes: assignment.durationMinutes ?? assignment.service.durationMinutes,
      effectivePrice: assignment.price ? Number(assignment.price) : Number(assignment.service.price),
      bufferMinutes: assignment.bufferMinutes,
      employeeAssignmentMode: assignment.service.employeeAssignmentMode,
      showPriceToCustomer: assignment.service.showPriceToCustomer,
      depositPolicyType: assignment.service.depositPolicyType,
      depositAmount: assignment.service.depositAmount ? Number(assignment.service.depositAmount) : null,
    };
  }

  async validateServiceAtBranch(serviceId: string, branchId: string): Promise<AvailabilityValidationResult> {
    const config = await this.resolveServiceBranchConfig(serviceId, branchId);
    if (!config) return { isValid: false, errors: ['Service is not available at this branch'] };
    if (config.effectiveDurationMinutes <= 0) return { isValid: false, errors: ['Service duration must be positive'] };
    if (config.effectivePrice < 0) return { isValid: false, errors: ['Service price cannot be negative'] };
    if (config.bufferMinutes < 0) return { isValid: false, errors: ['Buffer minutes cannot be negative'] };

    const [service, branch] = await Promise.all([
      prisma.service.findUnique({ where: { id: serviceId }, include: { category: true, branchAssignments: true } }),
      prisma.branch.findUnique({ where: { id: branchId } }),
    ]);
    const business = branch ? await prisma.business.findUnique({ where: { id: branch.businessId } }) : null;

    return { isValid: true, errors: [], service, branch, business, effectiveConfig: config };
  }

  async getBookingBlockMinutes(serviceId: string, branchId: string): Promise<number | null> {
    const config = await this.resolveServiceBranchConfig(serviceId, branchId);
    if (!config) return null;
    return config.effectiveDurationMinutes + config.bufferMinutes;
  }

  async upsertServiceBranchConfig(input: ServiceBranchConfigInput, userId: string) {
    const [service, branch] = await Promise.all([
      prisma.service.findUnique({ where: { id: input.serviceId }, include: { category: true } }),
      prisma.branch.findUnique({ where: { id: input.branchId } }),
    ]);

    if (!service) throw ApiError.notFound('Service not found');
    if (!branch) throw ApiError.notFound('Branch not found');
    if (service.businessId !== branch.businessId) throw ApiError.badRequest('Service and branch must belong to the same business');
    if (!branch.isActive) throw ApiError.badRequest('Branch is not active');
    if (service.status !== 'ACTIVE') throw ApiError.badRequest('Service is not active');

    const catBranch = await prisma.serviceCategoryBranchAssignment.findUnique({
      where: { categoryId_branchId: { categoryId: service.categoryId, branchId: input.branchId } },
    });
    if (!catBranch || !catBranch.isActive) throw ApiError.badRequest('Service category is not active at this branch');
    if (input.durationMinutes !== undefined && input.durationMinutes !== null && input.durationMinutes <= 0) throw ApiError.badRequest('Duration must be positive');
    if (input.price !== undefined && input.price !== null && input.price < 0) throw ApiError.badRequest('Price cannot be negative');
    if (input.bufferMinutes !== undefined && input.bufferMinutes < 0) throw ApiError.badRequest('Buffer minutes cannot be negative');

    const existing = await prisma.serviceBranchAssignment.findUnique({
      where: { serviceId_branchId: { serviceId: input.serviceId, branchId: input.branchId } },
    });
    const isNew = !existing;

    const updated = await prisma.serviceBranchAssignment.upsert({
      where: { serviceId_branchId: { serviceId: input.serviceId, branchId: input.branchId } },
      create: {
        serviceId: input.serviceId,
        branchId: input.branchId,
        isActive: input.isActive ?? true,
        durationMinutes: input.durationMinutes,
        price: input.price ? new Prisma.Decimal(input.price) : null,
        bufferMinutes: input.bufferMinutes ?? 0,
      },
      update: {
        isActive: input.isActive,
        durationMinutes: input.durationMinutes,
        price: input.price ? new Prisma.Decimal(input.price) : null,
        bufferMinutes: input.bufferMinutes,
      },
      include: { branch: true, service: { include: { category: true } } },
    });

    return { config: this.mapToConfig(updated), isNew };
  }

  async getEffectiveServiceConfig(serviceId: string, branchId: string): Promise<EffectiveServiceConfig | null> {
    const config = await this.resolveServiceBranchConfig(serviceId, branchId);
    if (!config) return null;
    const service = await prisma.service.findUnique({ where: { id: serviceId }, include: { category: true } });
    if (!service) return null;

    return {
      serviceId: service.id,
      branchId,
      name: service.name,
      durationMinutes: config.effectiveDurationMinutes,
      price: config.effectivePrice,
      bufferMinutes: config.bufferMinutes,
      employeeAssignmentMode: config.employeeAssignmentMode,
      showPriceToCustomer: config.showPriceToCustomer,
      depositPolicyType: config.depositPolicyType,
      depositAmount: config.depositAmount,
      isActive: config.isActive,
    };
  }

  async getAvailableServicesAtBranch(branchId: string, categoryId?: string) {
    return prisma.service.findMany({
      where: {
        status: 'ACTIVE',
        ...(categoryId ? { categoryId } : {}),
        category: {
          status: 'ACTIVE',
          branchAssignments: { some: { branchId, isActive: true, branch: { isActive: true } } },
        },
        branchAssignments: { some: { branchId, isActive: true } },
      },
      include: {
        category: { select: { id: true, name: true, description: true } },
        branchAssignments: { where: { branchId }, include: { branch: { select: { id: true, name: true } } } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getServicesWithEffectiveConfig(branchId: string, categoryId?: string) {
    const services = await this.getAvailableServicesAtBranch(branchId, categoryId);
    return Promise.all(
      services.map(async (service) => {
        const config = await this.resolveServiceBranchConfig(service.id, branchId);
        const branchAssignment = service.branchAssignments.find((ba) => ba.branchId === branchId);
        return {
          ...service,
          effectiveDurationMinutes: config?.effectiveDurationMinutes ?? service.durationMinutes,
          effectivePrice: config?.effectivePrice ?? Number(service.price),
          bufferMinutes: config?.bufferMinutes ?? 0,
          branchAssignment,
        };
      })
    );
  }

  // ─────────────────────────────────────────────────────────────
  // AVAILABILITY ENGINE — Core Methods
  // ─────────────────────────────────────────────────────────────

  /**
   * Main entry point: get all available slots for a service at a branch on a date.
   */
  async getAvailableSlots(input: GetAvailableSlotsInput): Promise<AvailabilityResponse> {
    const { businessId, branchId, serviceId, date, staffId, source = 'PUBLIC' } = input;

    // ── 1. Validate Entities ──────────────────────────────────────
    const [business, branch] = await Promise.all([
      prisma.business.findUnique({ where: { id: businessId } }),
      prisma.branch.findUnique({ where: { id: branchId } }),
    ]);

    if (!business || business.status !== 'ACTIVE') {
      throw ApiError.notFound('Business not found or inactive');
    }
    if (!branch || branch.businessId !== businessId) {
      throw ApiError.notFound('Branch not found in this business');
    }
    if (!branch.isActive) {
      throw ApiError.badRequest('Branch is not active');
    }

    const timezone = branch.timezone;
    const serviceConfig = await this.resolveServiceBranchConfig(serviceId, branchId);
    if (!serviceConfig) {
      throw ApiError.badRequest('Service is not available at this branch');
    }

    // ── 2. Check Online Booking Policy ───────────────────────────
    const bookingConfig = await availabilityRepository.getBranchBookingConfig(branchId);
    if (source === 'PUBLIC' && bookingConfig && !bookingConfig.onlineBookingEnabled) {
      return { date, branchId, serviceId, timezone, availableSlots: [] };
    }

    // ── 3. Parse date in branch timezone ─────────────────────────
    const localDate = DateTime.fromISO(date, { zone: timezone });
    if (!localDate.isValid) {
      throw ApiError.badRequest('Invalid date format. Use YYYY-MM-DD.');
    }

    // ── 4. Enforce booking window policies ───────────────────────
    const now = DateTime.now().setZone(timezone);
    console.log(`Now in branch timezone: ${now.toISO()} | Requested date: ${localDate.toISODate()}`);
    const dayStart = localDate.startOf('day');
    const dayEnd = localDate.endOf('day');

    if (bookingConfig) {
      const earliestAllowedTime = now.plus({ minutes: bookingConfig.minimumAdvanceBookingMinutes });
      const latestAllowedDate = now.plus({ days: bookingConfig.maximumAdvanceBookingDays });

      if (dayEnd < earliestAllowedTime) {
        return { date, branchId, serviceId, timezone, availableSlots: [] };
      }
      if (dayStart > latestAllowedDate) {
        return { date, branchId, serviceId, timezone, availableSlots: [] };
      }
    }

    const { effectiveDurationMinutes, bufferMinutes } = serviceConfig;
    const eligibleStaff = await this.getEligibleStaff(businessId, branchId, serviceId, staffId);

    if (eligibleStaff.length === 0) {
      return { date, branchId, serviceId, timezone, availableSlots: [] };
    }

    // Merge each staff member's slots by start time so callers can choose a
    // staff member after selecting a service slot.
    const slotsByStart = new Map<string, AvailableSlotResponse>();

    for (const staff of eligibleStaff) {
      const staffSlots = await this.buildSlotsForStaff(
        staff,
        branchId,
        localDate,
        timezone,
        effectiveDurationMinutes,
        bufferMinutes,
        bookingConfig,
        now
      );

      for (const slot of staffSlots) {
        const existingSlot = slotsByStart.get(slot.startTime);
        if (existingSlot) {
          existingSlot.staff.push(...slot.staff);
        } else {
          slotsByStart.set(slot.startTime, slot);
        }
      }
    }

    const availableSlots = Array.from(slotsByStart.values()).sort((a, b) =>
      a.startTime.localeCompare(b.startTime)
    );

    return { date, branchId, serviceId, timezone, availableSlots };
  }


  /**
   * Validates whether a specific slot is available.
   * Returns structured results suitable for manager override decisions.
   */
  async validateSlot(input: ValidateSlotInput): Promise<SlotValidationResponse> {
    const { businessId, branchId, serviceId, staffId, startTime, source = 'PUBLIC' } = input;

    if (!staffId) {
      return { valid: false, overrideAllowed: false, conflictType: 'STAFF_NOT_QUALIFIED', reason: 'staffId is required for MVP' };
    }

    // ── Hard validation: entity existence & relationships ────────
    const [business, branch, service, staff] = await Promise.all([
      prisma.business.findUnique({ where: { id: businessId } }),
      prisma.branch.findUnique({ where: { id: branchId } }),
      prisma.service.findUnique({ where: { id: serviceId }, include: { category: true } }),
      prisma.staff.findUnique({ where: { id: staffId } }),
    ]);

    if (!business || business.status !== 'ACTIVE') {
      return { valid: false, overrideAllowed: false, conflictType: 'BUSINESS_INACTIVE', reason: 'Business not found or inactive' };
    }
    if (!branch || branch.businessId !== businessId || !branch.isActive) {
      return { valid: false, overrideAllowed: false, conflictType: 'BRANCH_CLOSED', reason: 'Branch not found, not in this business, or inactive' };
    }
    if (!service || service.businessId !== businessId || service.status !== 'ACTIVE') {
      return { valid: false, overrideAllowed: false, conflictType: 'SERVICE_NOT_OFFERED', reason: 'Service not found, not in this business, or inactive' };
    }
    if (!staff || staff.businessId !== businessId || staff.status !== 'ACTIVE') {
      return { valid: false, overrideAllowed: false, conflictType: 'STAFF_INACTIVE', reason: 'Staff not found, not in this business, or inactive' };
    }
    if (staff.branchId !== branchId) {
      return { valid: false, overrideAllowed: false, conflictType: 'STAFF_NOT_QUALIFIED', reason: 'Staff does not belong to this branch' };
    }

    const serviceConfig = await this.resolveServiceBranchConfig(serviceId, branchId);
    if (!serviceConfig) {
      return { valid: false, overrideAllowed: false, conflictType: 'SERVICE_NOT_OFFERED', reason: 'Service not available at this branch' };
    }

    const qualification = await prisma.staffServiceQualification.findFirst({
      where: { staffId, serviceId, isActive: true },
    });
    if (!qualification) {
      return { valid: false, overrideAllowed: false, conflictType: 'STAFF_NOT_QUALIFIED', reason: 'Staff is not qualified for this service' };
    }

    // ── Policy checks ─────────────────────────────────────────────
    const timezone = branch.timezone;
    const requestedStart = DateTime.fromISO(startTime).setZone(timezone);
    if (!requestedStart.isValid) {
      return { valid: false, overrideAllowed: false, conflictType: 'INVALID_START_TIME', reason: 'Invalid startTime format' };
    }

    const now = DateTime.now().setZone(timezone);
    const bookingConfig = await availabilityRepository.getBranchBookingConfig(branchId);

    if (source === 'PUBLIC' && bookingConfig && !bookingConfig.onlineBookingEnabled) {
      return { valid: false, overrideAllowed: false, conflictType: 'SLOT_OUTSIDE_BRANCH_HOURS', reason: 'Online booking is disabled' };
    }

    // Advance-booking windows apply to public/online booking only.
    // Internal walk-in / operator bookings must still be able to start at current branch time.
    if (source === 'PUBLIC' && bookingConfig) {
      const earliestAllowed = now.plus({ minutes: bookingConfig.minimumAdvanceBookingMinutes });
      const latestAllowed = now.plus({ days: bookingConfig.maximumAdvanceBookingDays });

      if (requestedStart < earliestAllowed) {
        return { valid: false, overrideAllowed: false, conflictType: 'MIN_ADVANCE_VIOLATION', reason: 'Slot is too soon to book' };
      }
      if (requestedStart > latestAllowed) {
        return { valid: false, overrideAllowed: false, conflictType: 'MAX_ADVANCE_VIOLATION', reason: 'Slot is too far in the future to book' };
      }
    }

    // ── Availability checks (soft — override may be allowed) ─────
    const localDate = requestedStart.startOf('day');
    const branchIntervals = await getBranchOperatingIntervals(branchId, localDate, timezone);
    if (branchIntervals.length === 0) {
      return { valid: false, overrideAllowed: false, conflictType: 'BRANCH_CLOSED', reason: 'Branch is closed on this date' };
    }

    console.log(`Branch operating intervals for ${branchId} on ${localDate.toISODate()}:`, branchIntervals.map(iv => ({ start: iv.start.toISO(), end: iv.end.toISO() })));

    const isFeasibleInBranch = isSlotFeasible(
      requestedStart,
      serviceConfig.effectiveDurationMinutes,
      serviceConfig.bufferMinutes,
      branchIntervals
    );
    if (!isFeasibleInBranch) {
      return { valid: false, overrideAllowed: false, conflictType: 'SLOT_OUTSIDE_BRANCH_HOURS', reason: 'Slot falls outside branch operating hours' };
    }

    // Staff effective intervals
    const staffIntervals = await getStaffEffectiveIntervals(
      staffId,
      branchId,
      localDate,
      timezone,
      input.excludeAppointmentId
    );

    console.log(`Staff effective intervals for ${staffId} on ${localDate.toISODate()}:`, staffIntervals.map(iv => ({ start: iv.start.toISO(), end: iv.end.toISO() })));
    if (staffIntervals.length === 0) {
      return { valid: false, overrideAllowed: true, conflictType: 'STAFF_NOT_WORKING', reason: 'Staff has no availability on this date' };
    }

    const isFeasibleForStaff = isSlotFeasible(
      requestedStart,
      serviceConfig.effectiveDurationMinutes,
      serviceConfig.bufferMinutes,
      staffIntervals
    );
    if (!isFeasibleForStaff) {
      // Determine if blocked by breaks/time off or just schedule
      const { getStaffBreakIntervals, getStaffTimeOffIntervals, getBranchOperatingIntervals: boi } = await import('./staff-availability.service');
      const [breakIntervals, timeOffIntervals] = await Promise.all([
        getStaffBreakIntervals(staffId, localDate, timezone),
        getStaffTimeOffIntervals(staffId, localDate, timezone),
      ]);

      console.log(`Break intervals for staff ${staffId} on ${localDate.toISODate()}:`, breakIntervals.map(iv => ({ start: iv.start.toISO(), end: iv.end.toISO() })));
      console.log(`Time off intervals for staff ${staffId} on ${localDate.toISODate()}:`, timeOffIntervals.map(iv => ({ start: iv.start.toISO(), end: iv.end.toISO() })));

      const reservedEnd = requestedStart.plus({ minutes: serviceConfig.effectiveDurationMinutes + serviceConfig.bufferMinutes });
      const slotInterval = { start: requestedStart, end: reservedEnd };

      const blockedByTimeOff = timeOffIntervals.some((iv) =>
        iv.start < slotInterval.end && slotInterval.start < iv.end
      );
      if (blockedByTimeOff) {
        return { valid: false, overrideAllowed: true, conflictType: 'STAFF_TIME_OFF', reason: 'Staff has time off during this slot' };
      }

      const blockedByBreak = breakIntervals.some((iv) =>
        iv.start < slotInterval.end && slotInterval.start < iv.end
      );
      if (blockedByBreak) {
        return { valid: false, overrideAllowed: true, conflictType: 'STAFF_ON_BREAK', reason: 'Staff is on break during this slot' };
      }

      return { valid: false, overrideAllowed: true, conflictType: 'STAFF_NOT_WORKING', reason: 'Staff is not working during this slot' };
    }

    return { valid: true };
  }

  /**
   * Returns eligible staff for a service at a branch.
   * If staffId is provided, only returns that staff member if eligible.
   */
  async getEligibleStaff(businessId: string, branchId: string, serviceId: string, staffId?: string) {
    const where: any = {
      businessId,
      branchId,
      status: 'ACTIVE',
      serviceQualifications: { some: { serviceId, isActive: true } },
    };
    if (staffId) where.id = staffId;

    return prisma.staff.findMany({
      where,
      select: { id: true, firstName: true, lastName: true },
      orderBy: { id: 'asc' }, // Deterministic
    });
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────

  private async buildSlotsForStaff(
    staff: { id: string; firstName: string; lastName: string },
    branchId: string,
    localDate: DateTime,
    timezone: string,
    durationMin: number,
    bufferMin: number,
    bookingConfig: any,
    now: DateTime
  ): Promise<AvailableSlotResponse[]> {
    const effectiveIntervals = await getStaffEffectiveIntervals(
      staff.id,
      branchId,
      localDate,
      timezone
    );

    console.log(`Effective intervals for staff ${staff.id} on ${localDate.toISODate()}:`, effectiveIntervals.map(iv => ({ start: iv.start.toISO(), end: iv.end.toISO() })));

    if (effectiveIntervals.length === 0) return [];

    let candidates = generateSlots(effectiveIntervals, durationMin, bufferMin);

    // Enforce minimum advance booking at the slot level
    if (bookingConfig) {
      const earliestAllowed = now.plus({ minutes: bookingConfig.minimumAdvanceBookingMinutes });
      candidates = candidates.filter((slot) => slot.startTime >= earliestAllowed);
    }

    return candidates.map((slot) => ({
      startTime: slot.startTime.toISO()!,
      serviceEndTime: slot.serviceEndTime.toISO()!,
      reservedEndTime: slot.reservedEndTime.toISO()!,
      staff: [{ id: staff.id, firstName: staff.firstName, lastName: staff.lastName }],
    }));
  }

  private mapToConfig(assignment: any): ServiceBranchConfig {
    const service = assignment.service;
    return {
      serviceId: assignment.serviceId,
      branchId: assignment.branchId,
      isActive: assignment.isActive,
      effectiveDurationMinutes: assignment.durationMinutes ?? service.durationMinutes,
      effectivePrice: assignment.price ? Number(assignment.price) : Number(service.price),
      bufferMinutes: assignment.bufferMinutes,
      employeeAssignmentMode: service.employeeAssignmentMode,
      showPriceToCustomer: service.showPriceToCustomer,
      depositPolicyType: service.depositPolicyType,
      depositAmount: service.depositAmount ? Number(service.depositAmount) : null,
    };
  }
}

export const availabilityService = new AvailabilityService();