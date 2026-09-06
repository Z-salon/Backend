import { prisma } from '../../../libs/prisma';
import { auditLogService } from './audit-log.service';
import { ApiError, ErrorCodes } from '../../../utils/api-error';

export interface BranchCreateInput {
  name: string;
  address: string;
  timezone?: string;
}

export interface BranchUpdateInput {
  name?: string;
  address?: string | null;
  timezone?: string;
  isActive?: boolean;
}

export interface WeeklyHoursInput {
  days: Array<{
    dayOfWeek: number;
    isClosed: boolean;
    intervals: Array<{ start: string; end: string }>;
  }>;
}

export interface DateOverrideCreateInput {
  date: string;
  isClosed: boolean;
  intervals: Array<{ start: string; end: string }>;
}

export interface DateOverrideUpdateInput {
  date?: string;
  isClosed?: boolean;
  intervals?: Array<{ start: string; end: string }>;
}

export interface BookingConfigUpdateInput {
  onlineBookingEnabled?: boolean;
  walkInEnabled?: boolean;
  bookingApprovalRequired?: boolean;
  minimumAdvanceBookingMinutes?: number;
  maximumAdvanceBookingDays?: number;
  cancellationWindowMinutes?: number;
  reschedulingEnabled?: boolean;
  bookingBufferMinutes?: number;
  waitlistEnabled?: boolean;
}

export interface BranchResponse {
  id: string;
  businessId: string;
  name: string;
  address: string | null;
  timezone: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BranchWithDetails extends BranchResponse {
  weeklySchedules?: Array<{
    id: string;
    dayOfWeek: number;
    isClosed: boolean;
    intervals: Array<{ id: string; startTime: string; endTime: string }>;
  }>;
  dateOverrides?: Array<{
    id: string;
    date: Date;
    isClosed: boolean;
    intervals: Array<{ id: string; startTime: string; endTime: string }>;
  }>;
  bookingConfig?: {
    onlineBookingEnabled: boolean;
    walkInEnabled: boolean;
    bookingApprovalRequired: boolean;
    minimumAdvanceBookingMinutes: number;
    maximumAdvanceBookingDays: number;
    cancellationWindowMinutes: number;
    reschedulingEnabled: boolean;
    bookingBufferMinutes: number;
    waitlistEnabled: boolean;
  };
}

const SYSTEM_ROLES = ['OWNER', 'ADMIN'];
const BRANCH_MANAGER_ROLE = 'BRANCH_MANAGER';

export class BranchService {
  async createBranch(
    businessId: string,
    userId: string,
    input: BranchCreateInput
  ): Promise<BranchResponse> {
    const membership = await this.verifyMembershipAndPermission(businessId, userId, SYSTEM_ROLES);

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new ApiError(404, 'Business not found', ErrorCodes.BUSINESS_NOT_FOUND);
    }

    const existingBranch = await prisma.branch.findFirst({
      where: { businessId, name: input.name },
    });

    if (existingBranch) {
      throw new ApiError(409, 'Branch with this name already exists in this business', ErrorCodes.CONFLICT);
    }

    const timezone = input.timezone || business.timezone;
    this.validateTimezone(timezone);

    const branch = await prisma.$transaction(async (tx) => {
      const created = await tx.branch.create({
        data: {
          businessId,
          name: input.name,
          address: input.address,
          timezone,
          isActive: true,
        },
      });

      await tx.branchBookingConfig.create({
        data: {
          branchId: created.id,
        },
      });

      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'BRANCH_CREATED',
        entityType: 'Branch',
        entityId: created.id,
        newValues: { name: input.name, address: input.address, timezone },
      }, tx);

      return created;
    });

    return this.mapBranchToResponse(branch);
  }

  async getBusinessBranches(businessId: string, userId: string): Promise<BranchResponse[]> {
    const membership = await prisma.businessMember.findFirst({
      where: { businessId, userId, status: 'ACTIVE' },
      include: {
        userRoles: { include: { role: true } },
      },
    });

    if (!membership) {
      throw new ApiError(403, 'Not a member of this business', ErrorCodes.NOT_BUSINESS_MEMBER);
    }

    const roleSystemKeys = membership.userRoles.map(ur => ur.role.systemKey).filter((key): key is string => Boolean(key));
    const hasBusinessScope = roleSystemKeys.some(key => SYSTEM_ROLES.includes(key));

    if (hasBusinessScope) {
      const branches = await prisma.branch.findMany({
        where: { businessId },
        orderBy: { createdAt: 'asc' },
      });
      return branches.map(this.mapBranchToResponse);
    }

    const branchManagerRoles = membership.userRoles.filter(ur => ur.role.systemKey === BRANCH_MANAGER_ROLE);
    const allowedBranchIds = new Set(
      branchManagerRoles.flatMap((ur: any) => ur.branches.map((b: any) => b.branchId))
    );

    const branches = await prisma.branch.findMany({
      where: {
        businessId,
        id: { in: Array.from(allowedBranchIds) },
      },
      orderBy: { createdAt: 'asc' },
    });

    return branches.map(this.mapBranchToResponse);
  }

  async getBranch(branchId: string, userId: string): Promise<BranchWithDetails> {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      include: {
        weeklySchedules: {
          include: { intervals: true },
          orderBy: { dayOfWeek: 'asc' },
        },
        dateOverrides: {
          include: { intervals: true },
          orderBy: { date: 'asc' },
        },
        bookingConfig: true,
        business: true,
      },
    });

    if (!branch) {
      throw new ApiError(404, 'Branch not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyBranchAccess(branch.businessId, userId, branchId);

    return this.mapBranchToDetailedResponse(branch);
  }

  async updateBranch(
    branchId: string,
    userId: string,
    input: BranchUpdateInput
  ): Promise<BranchResponse> {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      include: { business: true },
    });

    if (!branch) {
      throw new ApiError(404, 'Branch not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyBranchAccessWithRole(branch.businessId, userId, branchId);

    const changes: Record<string, any> = {};
    const oldValues: Record<string, any> = {};

    if (input.name !== undefined && input.name !== branch.name) {
      const existing = await prisma.branch.findFirst({
        where: { businessId: branch.businessId, name: input.name, id: { not: branchId } },
      });
      if (existing) {
        throw new ApiError(409, 'Branch with this name already exists', ErrorCodes.CONFLICT);
      }
      changes.name = input.name;
      oldValues.name = branch.name;
    }

    if (input.address !== undefined && input.address !== branch.address) {
      changes.address = input.address;
      oldValues.address = branch.address;
    }

    if (input.timezone !== undefined && input.timezone !== branch.timezone) {
      this.validateTimezone(input.timezone);
      changes.timezone = input.timezone;
      oldValues.timezone = branch.timezone;
    }

    if (input.isActive !== undefined && input.isActive !== branch.isActive) {
      if (!input.isActive) {
        await this.validateDeactivationAllowed(branch);
      }
      changes.isActive = input.isActive;
      oldValues.isActive = branch.isActive;
    }

    if (Object.keys(changes).length === 0) {
      return this.mapBranchToResponse(branch);
    }

    const updatedBranch = await prisma.$transaction(async (tx) => {
      const updated = await tx.branch.update({
        where: { id: branchId },
        data: changes,
      });

      const newValues: Record<string, any> = {};
      for (const field of Object.keys(changes)) {
        newValues[field] = changes[field];
      }

      await auditLogService.createAuditLog({
        businessId: branch.businessId,
        actorId: userId,
        action: 'BRANCH_UPDATED',
        entityType: 'Branch',
        entityId: branchId,
        oldValues,
        newValues,
      }, tx);

      return updated;
    });

    return this.mapBranchToResponse(updatedBranch);
  }

  async getWeeklyHours(branchId: string, userId: string) {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new ApiError(404, 'Branch not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyBranchAccess(branch.businessId, userId, branchId);

    const schedules = await prisma.branchWeeklySchedule.findMany({
      where: { branchId },
      include: { intervals: { orderBy: { startTime: 'asc' } } },
      orderBy: { dayOfWeek: 'asc' },
    });

    return schedules.map(s => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      isClosed: s.isClosed,
      intervals: s.intervals.map(i => ({
        id: i.id,
        startTime: i.startTime.toISOString().substr(11, 5),
        endTime: i.endTime.toISOString().substr(11, 5),
      })),
    }));
  }

  async updateWeeklyHours(
    branchId: string,
    userId: string,
    input: WeeklyHoursInput
  ) {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new ApiError(404, 'Branch not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyBranchAccessWithRole(branch.businessId, userId, branchId);

    const oldSchedules = await prisma.branchWeeklySchedule.findMany({
      where: { branchId },
      include: { intervals: true },
    });

    await prisma.$transaction(async (tx) => {
  // 1. Delete existing intervals
  await tx.branchWeeklyHourInterval.deleteMany({
    where: {
      weeklySchedule: {
        branchId,
      },
    },
  });

  // 2. Delete existing schedules
  await tx.branchWeeklySchedule.deleteMany({
    where: {
      branchId,
    },
  });

  // 3. Create all schedules at once
  await tx.branchWeeklySchedule.createMany({
    data: input.days.map((day) => ({
      branchId,
      dayOfWeek: day.dayOfWeek,
      isClosed: day.isClosed,
    })),
  });

  // 4. Fetch created schedules to get their IDs
  const createdSchedules = await tx.branchWeeklySchedule.findMany({
    where: { branchId },
    select: {
      id: true,
      dayOfWeek: true,
    },
  });

  const scheduleIdByDay = new Map(
    createdSchedules.map((schedule) => [
      schedule.dayOfWeek,
      schedule.id,
    ])
  );

  // 5. Prepare ALL intervals
  const intervals = input.days.flatMap((day) => {
    if (day.isClosed || day.intervals.length === 0) {
      return [];
    }

    const weeklyScheduleId = scheduleIdByDay.get(day.dayOfWeek);

    if (!weeklyScheduleId) {
      throw new Error(
        `Schedule not found for day: ${day.dayOfWeek}`
      );
    }

    return day.intervals.map((interval) => ({
      weeklyScheduleId,
      startTime: new Date(
        `2000-01-01T${interval.start}:00.000Z`
      ),
      endTime: new Date(
        `2000-01-01T${interval.end}:00.000Z`
      ),
    }));
  });

  // 6. Insert all intervals in ONE query
  if (intervals.length > 0) {
    await tx.branchWeeklyHourInterval.createMany({
      data: intervals,
    });
  }

  // 7. Audit log
  await auditLogService.createAuditLog(
    {
      businessId: branch.businessId,
      actorId: userId,
      action: 'WEEKLY_HOURS_UPDATED',
      entityType: 'BranchWeeklySchedule',
      entityId: branchId,
      oldValues: { schedules: oldSchedules },
      newValues: { schedules: input.days },
    },
    tx
  );
});

  
    return this.getWeeklyHours(branchId, userId);
  }

  async createDateOverride(
    branchId: string,
    userId: string,
    input: DateOverrideCreateInput
  ) {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new ApiError(404, 'Branch not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyBranchAccessWithRole(branch.businessId, userId, branchId);

    const overrideDate = new Date(input.date);
    if (isNaN(overrideDate.getTime())) {
      throw new ApiError(400, 'Invalid date format', ErrorCodes.VALIDATION_ERROR);
    }

    const existing = await prisma.branchDateOverride.findUnique({
      where: { branchId_date: { branchId, date: overrideDate } },
    });

    if (existing) {
      throw new ApiError(409, 'Date override already exists for this date', ErrorCodes.CONFLICT);
    }

    const override = await prisma.$transaction(async (tx) => {
      const created = await tx.branchDateOverride.create({
        data: {
          branchId,
          date: overrideDate,
          isClosed: input.isClosed,
        },
      });

      if (!input.isClosed && input.intervals.length > 0) {
        await tx.branchDateOverrideInterval.createMany({
          data: input.intervals.map(i => ({
            overrideId: created.id,
            startTime: new Date(`2000-01-01T${i.start}:00.000Z`),
            endTime: new Date(`2000-01-01T${i.end}:00.000Z`),
          })),
        });
      }

      await auditLogService.createAuditLog({
        businessId: branch.businessId,
        actorId: userId,
        action: 'DATE_OVERRIDE_CREATED',
        entityType: 'BranchDateOverride',
        entityId: created.id,
        newValues: { date: input.date, isClosed: input.isClosed, intervals: input.intervals },
      }, tx);

      return created;
    });

    return this.getDateOverrideById(override.id, userId);
  }

  async getDateOverrides(
    branchId: string,
    userId: string,
    options?: { from?: Date; to?: Date; upcoming?: boolean }
  ) {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new ApiError(404, 'Branch not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyBranchAccess(branch.businessId, userId, branchId);

    const where: any = { branchId };

    if (options?.from || options?.to || options?.upcoming) {
      where.date = {};
      if (options.upcoming) {
        where.date.gte = new Date();
      }
      if (options.from) {
        where.date.gte = options.from;
      }
      if (options.to) {
        where.date.lte = options.to;
      }
    }

    const overrides = await prisma.branchDateOverride.findMany({
      where,
      include: { intervals: { orderBy: { startTime: 'asc' } } },
      orderBy: { date: 'asc' },
    });

    return overrides.map(o => ({
      id: o.id,
      date: o.date,
      isClosed: o.isClosed,
      intervals: o.intervals.map(i => ({
        id: i.id,
        startTime: i.startTime.toISOString().substr(11, 5),
        endTime: i.endTime.toISOString().substr(11, 5),
      })),
    }));
  }

  async updateDateOverride(
    branchId: string,
    userId: string,
    overrideId: string,
    input: DateOverrideUpdateInput
  ) {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new ApiError(404, 'Branch not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyBranchAccessWithRole(branch.businessId, userId, branchId);

    const override = await prisma.branchDateOverride.findUnique({
      where: { id: overrideId, branchId },
      include: { intervals: true },
    });

    if (!override) {
      throw new ApiError(404, 'Date override not found', ErrorCodes.NOT_FOUND);
    }

    const changes: Record<string, any> = {};
    const oldValues: Record<string, any> = {};

    if (input.date !== undefined) {
      const newDate = new Date(input.date);
      if (isNaN(newDate.getTime())) {
        throw new ApiError(400, 'Invalid date format', ErrorCodes.VALIDATION_ERROR);
      }
      if (newDate.getTime() !== override.date.getTime()) {
        const existing = await prisma.branchDateOverride.findUnique({
          where: { branchId_date: { branchId, date: newDate } },
        });
        if (existing && existing.id !== overrideId) {
          throw new ApiError(409, 'Date override already exists for this date', ErrorCodes.CONFLICT);
        }
        changes.date = newDate;
        oldValues.date = override.date;
      }
    }

    if (input.isClosed !== undefined && input.isClosed !== override.isClosed) {
      changes.isClosed = input.isClosed;
      oldValues.isClosed = override.isClosed;
    }

    if (Object.keys(changes).length === 0 && !input.intervals) {
      return this.getDateOverrideById(overrideId, userId);
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (input.intervals !== undefined) {
        await tx.branchDateOverrideInterval.deleteMany({
          where: { overrideId },
        });

        if (!changes.isClosed && input.intervals && input.intervals.length > 0) {
          await tx.branchDateOverrideInterval.createMany({
            data: input.intervals.map(i => ({
              overrideId,
              startTime: new Date(`2000-01-01T${i.start}:00.000Z`),
              endTime: new Date(`2000-01-01T${i.end}:00.000Z`),
            })),
          });
        }
      }

      const updated = await tx.branchDateOverride.update({
        where: { id: overrideId },
        data: changes,
      });

      const newValues: Record<string, any> = { ...changes };
      if (input.intervals !== undefined) {
        newValues.intervals = input.intervals;
      }

      await auditLogService.createAuditLog({
        businessId: branch.businessId,
        actorId: userId,
        action: 'DATE_OVERRIDE_UPDATED',
        entityType: 'BranchDateOverride',
        entityId: overrideId,
        oldValues: { ...oldValues, intervals: override.intervals },
        newValues,
      }, tx);

      return updated;
    });

    return this.getDateOverrideById(overrideId, userId);
  }

  async deleteDateOverride(branchId: string, userId: string, overrideId: string) {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new ApiError(404, 'Branch not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyBranchAccessWithRole(branch.businessId, userId, branchId);

    const override = await prisma.branchDateOverride.findUnique({
      where: { id: overrideId, branchId },
    });

    if (!override) {
      throw new ApiError(404, 'Date override not found', ErrorCodes.NOT_FOUND);
    }

    await prisma.$transaction(async (tx) => {
      await tx.branchDateOverrideInterval.deleteMany({
        where: { overrideId },
      });

      await tx.branchDateOverride.delete({
        where: { id: overrideId },
      });

      await auditLogService.createAuditLog({
        businessId: branch.businessId,
        actorId: userId,
        action: 'DATE_OVERRIDE_DELETED',
        entityType: 'BranchDateOverride',
        entityId: overrideId,
        oldValues: { date: override.date, isClosed: override.isClosed },
      }, tx);
    });

    return { success: true };
  }

  async getBookingConfig(branchId: string, userId: string) {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new ApiError(404, 'Branch not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyBranchAccess(branch.businessId, userId, branchId);

    let config = await prisma.branchBookingConfig.findUnique({
      where: { branchId },
    });

    if (!config) {
      config = await prisma.branchBookingConfig.create({
        data: { branchId },
      });
    }

    return config;
  }

  async updateBookingConfig(
    branchId: string,
    userId: string,
    input: BookingConfigUpdateInput
  ) {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new ApiError(404, 'Branch not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyBranchAccessWithRole(branch.businessId, userId, branchId);

    const config = await prisma.branchBookingConfig.findUnique({
      where: { branchId },
    });

    if (!config) {
      throw new ApiError(404, 'Booking configuration not found', ErrorCodes.NOT_FOUND);
    }

    const changes: Record<string, any> = {};
    const oldValues: Record<string, any> = {};

    for (const field of Object.keys(input)) {
      const value = (input as any)[field];
      if (value !== undefined && value !== (config as any)[field]) {
        changes[field] = value;
        oldValues[field] = (config as any)[field];
      }
    }

    if (Object.keys(changes).length === 0) {
      return config;
    }

    if (changes.minimumAdvanceBookingMinutes !== undefined && changes.minimumAdvanceBookingMinutes < 0) {
      throw new ApiError(400, 'Minimum advance booking minutes cannot be negative', ErrorCodes.VALIDATION_ERROR);
    }
    if (changes.maximumAdvanceBookingDays !== undefined && changes.maximumAdvanceBookingDays < 1) {
      throw new ApiError(400, 'Maximum advance booking days must be at least 1', ErrorCodes.VALIDATION_ERROR);
    }
    if (changes.cancellationWindowMinutes !== undefined && changes.cancellationWindowMinutes < 0) {
      throw new ApiError(400, 'Cancellation window minutes cannot be negative', ErrorCodes.VALIDATION_ERROR);
    }
    if (changes.bookingBufferMinutes !== undefined && changes.bookingBufferMinutes < 0) {
      throw new ApiError(400, 'Booking buffer minutes cannot be negative', ErrorCodes.VALIDATION_ERROR);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.branchBookingConfig.update({
        where: { branchId },
        data: changes,
      });

      const newValues: Record<string, any> = {};
      for (const field of Object.keys(changes)) {
        newValues[field] = changes[field];
      }

      await auditLogService.createAuditLog({
        businessId: branch.businessId,
        actorId: userId,
        action: 'BOOKING_CONFIG_UPDATED',
        entityType: 'BranchBookingConfig',
        entityId: branchId,
        oldValues,
        newValues,
      }, tx);

      return updated;
    });

    return updated;
  }

  private async verifyMembershipAndPermission(
    businessId: string,
    userId: string,
    allowedSystemKeys: string[]
  ) {
    const membership = await prisma.businessMember.findFirst({
      where: { businessId, userId, status: 'ACTIVE' },
      include: {
        userRoles: { include: { role: true } },
        business: true,
      },
    });

    if (!membership) {
      throw new ApiError(403, 'Not a member of this business', ErrorCodes.NOT_BUSINESS_MEMBER);
    }

    if (membership.business.status !== 'ACTIVE') {
      throw new ApiError(403, 'Business is not active', ErrorCodes.BUSINESS_SUSPENDED);
    }

    const roleSystemKeys = membership.userRoles.map(ur => ur.role.systemKey).filter((key): key is string => Boolean(key));
    const hasPermission = roleSystemKeys.some(key => allowedSystemKeys.includes(key));

    if (!hasPermission) {
      throw new ApiError(403, 'Insufficient permissions', ErrorCodes.INSUFFICIENT_PERMISSIONS);
    }

    return membership;
  }

  private async verifyBranchAccess(businessId: string, userId: string, branchId: string) {
    const membership = await prisma.businessMember.findFirst({
      where: { businessId, userId, status: 'ACTIVE' },
      include: {
        userRoles: { include: { role: true, branches: true } },
      },
    });

    if (!membership) {
      throw new ApiError(403, 'Not a member of this business', ErrorCodes.NOT_BUSINESS_MEMBER);
    }

    const roleSystemKeys = membership.userRoles.map(ur => ur.role.systemKey).filter((key): key is string => Boolean(key));
    const hasBusinessScope = roleSystemKeys.some(key => SYSTEM_ROLES.includes(key));

    if (hasBusinessScope) return;

    const allowedBranchIds = new Set(
      membership.userRoles
        .filter(ur => ur.scopeType === 'BRANCH')
        .flatMap(ur => ur.branches.map(b => b.branchId))
    );

    if (!allowedBranchIds.has(branchId)) {
      throw new ApiError(403, 'Access denied to this branch', ErrorCodes.FORBIDDEN);
    }
  }

  private async verifyBranchAccessWithRole(businessId: string, userId: string, branchId: string) {
    await this.verifyBranchAccess(businessId, userId, branchId);

    const membership = await prisma.businessMember.findFirst({
      where: { businessId, userId, status: 'ACTIVE' },
      include: { userRoles: { include: { role: true } } },
    });

    const roleSystemKeys = membership!.userRoles.map(ur => ur.role.systemKey).filter((key): key is string => Boolean(key));
    const hasBusinessScope = roleSystemKeys.some(key => SYSTEM_ROLES.includes(key));

    if (!hasBusinessScope) {
      const isBranchManager = roleSystemKeys.some(key => key === BRANCH_MANAGER_ROLE);
      if (!isBranchManager) {
        throw new ApiError(403, 'Insufficient permissions', ErrorCodes.INSUFFICIENT_PERMISSIONS);
      }
    }
  }

  private async validateDeactivationAllowed(branch: any) {
    const activeBranches = await prisma.branch.count({
      where: { businessId: branch.businessId, isActive: true },
    });

    if (activeBranches <= 1) {
      throw new ApiError(400, 'Cannot deactivate the last active branch', ErrorCodes.INVALID_SCOPE_CONFIGURATION);
    }
  }

  private async getDateOverrideById(overrideId: string, userId: string) {
    const override = await prisma.branchDateOverride.findUnique({
      where: { id: overrideId },
      include: { intervals: { orderBy: { startTime: 'asc' } } },
    });

    if (!override) {
      throw new ApiError(404, 'Date override not found', ErrorCodes.NOT_FOUND);
    }

    return {
      id: override.id,
      date: override.date,
      isClosed: override.isClosed,
      intervals: override.intervals.map(i => ({
        id: i.id,
        startTime: i.startTime.toISOString().substr(11, 5),
        endTime: i.endTime.toISOString().substr(11, 5),
      })),
    };
  }

  private validateTimezone(timezone: string) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
      throw new ApiError(400, 'Invalid timezone. Must be a valid IANA timezone identifier.', ErrorCodes.VALIDATION_ERROR);
    }
  }

  private mapBranchToResponse(branch: any): BranchResponse {
    return {
      id: branch.id,
      businessId: branch.businessId,
      name: branch.name,
      address: branch.address ?? null,
      timezone: branch.timezone,
      isActive: branch.isActive,
      createdAt: branch.createdAt,
      updatedAt: branch.updatedAt,
    };
  }

  private mapBranchToDetailedResponse(branch: any): BranchWithDetails {
    return {
      ...this.mapBranchToResponse(branch),
      weeklySchedules: branch.weeklySchedules?.map((s: any) => ({
        id: s.id,
        dayOfWeek: s.dayOfWeek,
        isClosed: s.isClosed,
        intervals: s.intervals?.map((i: any) => ({
          id: i.id,
          startTime: i.startTime.toISOString().substr(11, 5),
          endTime: i.endTime.toISOString().substr(11, 5),
        })) || [],
      })) || [],
      dateOverrides: branch.dateOverrides?.map((o: any) => ({
        id: o.id,
        date: o.date,
        isClosed: o.isClosed,
        intervals: o.intervals?.map((i: any) => ({
          id: i.id,
          startTime: i.startTime.toISOString().substr(11, 5),
          endTime: i.endTime.toISOString().substr(11, 5),
        })) || [],
      })) || [],
      bookingConfig: branch.bookingConfig ? {
        onlineBookingEnabled: branch.bookingConfig.onlineBookingEnabled,
        walkInEnabled: branch.bookingConfig.walkInEnabled,
        bookingApprovalRequired: branch.bookingConfig.bookingApprovalRequired,
        minimumAdvanceBookingMinutes: branch.bookingConfig.minimumAdvanceBookingMinutes,
        maximumAdvanceBookingDays: branch.bookingConfig.maximumAdvanceBookingDays,
        cancellationWindowMinutes: branch.bookingConfig.cancellationWindowMinutes,
        reschedulingEnabled: branch.bookingConfig.reschedulingEnabled,
        bookingBufferMinutes: branch.bookingConfig.bookingBufferMinutes,
        waitlistEnabled: branch.bookingConfig.waitlistEnabled,
      } : undefined,
    };
  }
}

export const branchService = new BranchService();