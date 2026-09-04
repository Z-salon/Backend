import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { auditLogService } from '../../business/services/audit-log.service';
import { staffService } from './staff.service';

export interface IntervalInput {
  start: string;
  end: string;
}

export class StaffScheduleService {
  private parseTime(timeStr: string): Date {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const d = new Date(1970, 0, 1);
    d.setUTCHours(hours, minutes, 0, 0);
    return d;
  }

  private formatTime(d: Date): string {
    return d.toISOString().substring(11, 16);
  }

  async updateWeeklyHours(
    businessId: string,
    staffId: string,
    userId: string,
    dayOfWeek: number,
    isWorking: boolean,
    intervals: IntervalInput[],
  ) {
    const auth = await staffService.getMembershipAndUserRoles(businessId, userId);
    const staff = await staffService.getStaffById(businessId, staffId);

    if (!auth.isOwnerOrAdmin && auth.isBranchManager && !auth.allowedBranchIds.has(staff.branchId)) {
      throw ApiError.forbidden('Cannot manage schedules for staff outside authorized branch', ErrorCodes.FORBIDDEN);
    }

    return prisma.$transaction(async (tx) => {
      const existing = await tx.staffWeeklyScheduleDay.findUnique({
        where: { staffId_dayOfWeek: { staffId, dayOfWeek } },
        include: { intervals: true },
      });

      let scheduleDay;
      if (existing) {
        scheduleDay = await tx.staffWeeklyScheduleDay.update({
          where: { id: existing.id },
          data: { isWorking },
        });
        await tx.staffWeeklyHours.deleteMany({ where: { scheduleDayId: existing.id } });
      } else {
        scheduleDay = await tx.staffWeeklyScheduleDay.create({
          data: { staffId, dayOfWeek, isWorking },
        });
      }

      if (isWorking && intervals.length > 0) {
        await tx.staffWeeklyHours.createMany({
          data: intervals.map(i => ({
            scheduleDayId: scheduleDay.id,
            intervalStart: this.parseTime(i.start),
            intervalEnd: this.parseTime(i.end),
          })),
        });
      }

      const updated = await tx.staffWeeklyScheduleDay.findUnique({
        where: { id: scheduleDay.id },
        include: { intervals: true },
      });

      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'STAFF_WEEKLY_SCHEDULE_UPDATED',
        entityType: 'StaffWeeklyScheduleDay',
        entityId: scheduleDay.id,
        oldValues: existing
          ? { dayOfWeek: existing.dayOfWeek, isWorking: existing.isWorking, intervalCount: existing.intervals.length }
          : undefined,
        newValues: { dayOfWeek, isWorking, intervalCount: intervals.length },
      }, tx);

      return updated;
    });
  }

  async getWeeklyHours(businessId: string, staffId: string, userId: string) {
    const auth = await staffService.getMembershipAndUserRoles(businessId, userId);
    const staff = await staffService.getStaffById(businessId, staffId);

    if (!auth.isOwnerOrAdmin && auth.isBranchManager && !auth.allowedBranchIds.has(staff.branchId)) {
      throw ApiError.forbidden('Cannot view schedules for staff outside authorized branch', ErrorCodes.FORBIDDEN);
    }

    const configuredDays = await prisma.staffWeeklyScheduleDay.findMany({
      where: { staffId },
      include: { intervals: true },
      orderBy: { dayOfWeek: 'asc' },
    });

    const response = [];
    for (let i = 0; i < 7; i++) {
      const config = configuredDays.find(d => d.dayOfWeek === i);
      if (config) {
        response.push({
          day: i,
          configured: true,
          isWorking: config.isWorking,
          intervals: config.intervals.map(inv => ({
            start: this.formatTime(inv.intervalStart),
            end: this.formatTime(inv.intervalEnd),
          })),
        });
      } else {
        response.push({ day: i, configured: false, source: 'BRANCH_HOURS' });
      }
    }
    return response;
  }

  async getWeeklyBreaks(businessId: string, staffId: string, userId: string) {
    const auth = await staffService.getMembershipAndUserRoles(businessId, userId);
    const staff = await staffService.getStaffById(businessId, staffId);

    if (!auth.isOwnerOrAdmin && auth.isBranchManager && !auth.allowedBranchIds.has(staff.branchId)) {
      throw ApiError.forbidden('Cannot view breaks for staff outside authorized branch', ErrorCodes.FORBIDDEN);
    }

    const breaks = await prisma.staffWeeklyBreak.findMany({
      where: { staffId },
      orderBy: [{ dayOfWeek: 'asc' }, { breakStart: 'asc' }],
    });

    return breaks.map(b => ({
      id: b.id,
      dayOfWeek: b.dayOfWeek,
      start: this.formatTime(b.breakStart),
      end: this.formatTime(b.breakEnd),
    }));
  }

  async createWeeklyBreak(businessId: string, staffId: string, userId: string, dayOfWeek: number, start: string, end: string) {
    const auth = await staffService.getMembershipAndUserRoles(businessId, userId);
    const staff = await staffService.getStaffById(businessId, staffId);

    if (!auth.isOwnerOrAdmin && auth.isBranchManager && !auth.allowedBranchIds.has(staff.branchId)) {
      throw ApiError.forbidden('Cannot manage breaks for staff outside authorized branch', ErrorCodes.FORBIDDEN);
    }

    return prisma.$transaction(async (tx) => {
      const newBreak = await tx.staffWeeklyBreak.create({
        data: { staffId, dayOfWeek, breakStart: this.parseTime(start), breakEnd: this.parseTime(end) },
      });

      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'STAFF_WEEKLY_BREAK_CREATED',
        entityType: 'StaffWeeklyBreak',
        entityId: newBreak.id,
        newValues: { staffId, dayOfWeek, start, end },
      }, tx);

      return { id: newBreak.id, dayOfWeek: newBreak.dayOfWeek, start, end };
    });
  }

  async updateWeeklyBreak(businessId: string, staffId: string, userId: string, breakId: string, start?: string, end?: string) {
    const auth = await staffService.getMembershipAndUserRoles(businessId, userId);
    const staff = await staffService.getStaffById(businessId, staffId);

    if (!auth.isOwnerOrAdmin && auth.isBranchManager && !auth.allowedBranchIds.has(staff.branchId)) {
      throw ApiError.forbidden('Cannot manage breaks for staff outside authorized branch', ErrorCodes.FORBIDDEN);
    }

    const existing = await prisma.staffWeeklyBreak.findFirst({ where: { id: breakId, staffId } });
    if (!existing) throw ApiError.notFound('Break not found', ErrorCodes.NOT_FOUND);

    const data: any = {};
    if (start) data.breakStart = this.parseTime(start);
    if (end) data.breakEnd = this.parseTime(end);

    return prisma.$transaction(async (tx) => {
      const updated = await tx.staffWeeklyBreak.update({ where: { id: breakId }, data });

      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'STAFF_WEEKLY_BREAK_UPDATED',
        entityType: 'StaffWeeklyBreak',
        entityId: breakId,
        oldValues: { start: this.formatTime(existing.breakStart), end: this.formatTime(existing.breakEnd) },
        newValues: { start: start ?? this.formatTime(existing.breakStart), end: end ?? this.formatTime(existing.breakEnd) },
      }, tx);

      return { id: updated.id, dayOfWeek: updated.dayOfWeek, start: this.formatTime(updated.breakStart), end: this.formatTime(updated.breakEnd) };
    });
  }

  async deleteWeeklyBreak(businessId: string, staffId: string, userId: string, breakId: string) {
    const auth = await staffService.getMembershipAndUserRoles(businessId, userId);
    const staff = await staffService.getStaffById(businessId, staffId);

    if (!auth.isOwnerOrAdmin && auth.isBranchManager && !auth.allowedBranchIds.has(staff.branchId)) {
      throw ApiError.forbidden('Cannot manage breaks for staff outside authorized branch', ErrorCodes.FORBIDDEN);
    }

    const existing = await prisma.staffWeeklyBreak.findFirst({ where: { id: breakId, staffId } });
    if (!existing) return;

    return prisma.$transaction(async (tx) => {
      await tx.staffWeeklyBreak.delete({ where: { id: breakId } });
      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'STAFF_WEEKLY_BREAK_DELETED',
        entityType: 'StaffWeeklyBreak',
        entityId: breakId,
        oldValues: { dayOfWeek: existing.dayOfWeek, start: this.formatTime(existing.breakStart), end: this.formatTime(existing.breakEnd) },
      }, tx);
    });
  }

  async getScheduleOverrides(businessId: string, staffId: string, userId: string, from?: string, to?: string) {
    const auth = await staffService.getMembershipAndUserRoles(businessId, userId);
    const staff = await staffService.getStaffById(businessId, staffId);

    if (!auth.isOwnerOrAdmin && auth.isBranchManager && !auth.allowedBranchIds.has(staff.branchId)) {
      throw ApiError.forbidden('Cannot view schedule overrides outside authorized branch', ErrorCodes.FORBIDDEN);
    }

    const where: any = { staffId };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const overrides = await prisma.staffScheduleOverride.findMany({
      where,
      include: { intervals: true },
      orderBy: { date: 'asc' },
    });

    return overrides.map(o => ({
      id: o.id,
      date: o.date.toISOString().substring(0, 10),
      isWorking: o.isWorking,
      intervals: o.intervals.map(inv => ({
        start: this.formatTime(inv.intervalStart),
        end: this.formatTime(inv.intervalEnd),
      })),
    }));
  }

  async updateScheduleOverride(businessId: string, staffId: string, userId: string, date: string, isWorking: boolean, intervals: IntervalInput[]) {
    const auth = await staffService.getMembershipAndUserRoles(businessId, userId);
    const staff = await staffService.getStaffById(businessId, staffId);

    if (!auth.isOwnerOrAdmin && auth.isBranchManager && !auth.allowedBranchIds.has(staff.branchId)) {
      throw ApiError.forbidden('Cannot manage schedule overrides outside authorized branch', ErrorCodes.FORBIDDEN);
    }

    const parsedDate = new Date(date);

    return prisma.$transaction(async (tx) => {
      const existing = await tx.staffScheduleOverride.findUnique({
        where: { staffId_date: { staffId, date: parsedDate } },
        include: { intervals: true },
      });

      let override;
      if (existing) {
        override = await tx.staffScheduleOverride.update({ where: { id: existing.id }, data: { isWorking } });
        await tx.staffScheduleOverrideInterval.deleteMany({ where: { overrideId: existing.id } });
      } else {
        override = await tx.staffScheduleOverride.create({ data: { staffId, date: parsedDate, isWorking } });
      }

      if (isWorking && intervals.length > 0) {
        await tx.staffScheduleOverrideInterval.createMany({
          data: intervals.map(i => ({
            overrideId: override.id,
            intervalStart: this.parseTime(i.start),
            intervalEnd: this.parseTime(i.end),
          })),
        });
      }

      const updated = await tx.staffScheduleOverride.findUnique({
        where: { id: override.id },
        include: { intervals: true },
      });

      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: existing ? 'STAFF_SCHEDULE_OVERRIDE_UPDATED' : 'STAFF_SCHEDULE_OVERRIDE_CREATED',
        entityType: 'StaffScheduleOverride',
        entityId: override.id,
        oldValues: existing ? { date, isWorking: existing.isWorking } : undefined,
        newValues: { date, isWorking, intervalCount: intervals.length },
      }, tx);

      return updated;
    });
  }

  async deleteScheduleOverride(businessId: string, staffId: string, userId: string, date: string) {
    const auth = await staffService.getMembershipAndUserRoles(businessId, userId);
    const staff = await staffService.getStaffById(businessId, staffId);

    if (!auth.isOwnerOrAdmin && auth.isBranchManager && !auth.allowedBranchIds.has(staff.branchId)) {
      throw ApiError.forbidden('Cannot manage schedule overrides outside authorized branch', ErrorCodes.FORBIDDEN);
    }

    const parsedDate = new Date(date);
    const existing = await prisma.staffScheduleOverride.findUnique({
      where: { staffId_date: { staffId, date: parsedDate } },
    });
    if (!existing) return;

    return prisma.$transaction(async (tx) => {
      await tx.staffScheduleOverride.delete({ where: { id: existing.id } });
      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'STAFF_SCHEDULE_OVERRIDE_DELETED',
        entityType: 'StaffScheduleOverride',
        entityId: existing.id,
        oldValues: { date, isWorking: existing.isWorking },
      }, tx);
    });
  }

  async getBreakOverrides(businessId: string, staffId: string, userId: string, from?: string, to?: string) {
    const auth = await staffService.getMembershipAndUserRoles(businessId, userId);
    const staff = await staffService.getStaffById(businessId, staffId);

    if (!auth.isOwnerOrAdmin && auth.isBranchManager && !auth.allowedBranchIds.has(staff.branchId)) {
      throw ApiError.forbidden('Cannot view break overrides outside authorized branch', ErrorCodes.FORBIDDEN);
    }

    const where: any = { staffId };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const overrides = await prisma.staffBreakOverride.findMany({
      where,
      include: { intervals: true },
      orderBy: { date: 'asc' },
    });

    return overrides.map(o => ({
      id: o.id,
      date: o.date.toISOString().substring(0, 10),
      intervals: o.intervals.map(inv => ({
        start: this.formatTime(inv.breakStart),
        end: this.formatTime(inv.breakEnd),
      })),
    }));
  }

  async updateBreakOverride(businessId: string, staffId: string, userId: string, date: string, intervals: IntervalInput[]) {
    const auth = await staffService.getMembershipAndUserRoles(businessId, userId);
    const staff = await staffService.getStaffById(businessId, staffId);

    if (!auth.isOwnerOrAdmin && auth.isBranchManager && !auth.allowedBranchIds.has(staff.branchId)) {
      throw ApiError.forbidden('Cannot manage break overrides outside authorized branch', ErrorCodes.FORBIDDEN);
    }

    const parsedDate = new Date(date);

    return prisma.$transaction(async (tx) => {
      const existing = await tx.staffBreakOverride.findUnique({
        where: { staffId_date: { staffId, date: parsedDate } },
        include: { intervals: true },
      });

      let override;
      if (existing) {
        override = existing;
        await tx.staffBreakOverrideInterval.deleteMany({ where: { overrideId: existing.id } });
      } else {
        override = await tx.staffBreakOverride.create({ data: { staffId, date: parsedDate } });
      }

      if (intervals.length > 0) {
        await tx.staffBreakOverrideInterval.createMany({
          data: intervals.map(i => ({
            overrideId: override.id,
            breakStart: this.parseTime(i.start),
            breakEnd: this.parseTime(i.end),
          })),
        });
      }

      const updated = await tx.staffBreakOverride.findUnique({
        where: { id: override.id },
        include: { intervals: true },
      });

      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: existing ? 'STAFF_BREAK_OVERRIDE_UPDATED' : 'STAFF_BREAK_OVERRIDE_CREATED',
        entityType: 'StaffBreakOverride',
        entityId: override.id,
        oldValues: existing ? { date } : undefined,
        newValues: { date, intervalCount: intervals.length },
      }, tx);

      return updated;
    });
  }

  async deleteBreakOverride(businessId: string, staffId: string, userId: string, date: string) {
    const auth = await staffService.getMembershipAndUserRoles(businessId, userId);
    const staff = await staffService.getStaffById(businessId, staffId);

    if (!auth.isOwnerOrAdmin && auth.isBranchManager && !auth.allowedBranchIds.has(staff.branchId)) {
      throw ApiError.forbidden('Cannot manage break overrides outside authorized branch', ErrorCodes.FORBIDDEN);
    }

    const parsedDate = new Date(date);
    const existing = await prisma.staffBreakOverride.findUnique({
      where: { staffId_date: { staffId, date: parsedDate } },
    });
    if (!existing) return;

    return prisma.$transaction(async (tx) => {
      await tx.staffBreakOverride.delete({ where: { id: existing.id } });
      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'STAFF_BREAK_OVERRIDE_DELETED',
        entityType: 'StaffBreakOverride',
        entityId: existing.id,
        oldValues: { date },
      }, tx);
    });
  }
}

export const staffScheduleService = new StaffScheduleService();
