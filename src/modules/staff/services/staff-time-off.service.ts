import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { auditLogService } from '../../business/services/audit-log.service';
import { staffService } from './staff.service';

export interface TimeOffInput {
  date: string;
  allDay: boolean;
  start?: string;
  end?: string;
  reason?: string;
}

export class StaffTimeOffService {
  private parseTime(timeStr: string): Date {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const d = new Date(1970, 0, 1);
    d.setUTCHours(hours, minutes, 0, 0);
    return d;
  }

  private formatTime(d: Date): string {
    return d.toISOString().substring(11, 16);
  }

  async createTimeOff(businessId: string, staffId: string, userId: string, data: TimeOffInput) {
    const auth = await staffService.getMembershipAndUserRoles(businessId, userId);
    const staff = await staffService.getStaffById(businessId, staffId);

    if (!auth.isOwnerOrAdmin && auth.isBranchManager && !auth.allowedBranchIds.has(staff.branchId)) {
      throw ApiError.forbidden('Cannot manage time off for staff outside authorized branch', ErrorCodes.FORBIDDEN);
    }

    return prisma.$transaction(async (tx) => {
      const timeOff = await tx.staffTimeOff.create({
        data: {
          staffId,
          date: new Date(data.date),
          allDay: data.allDay,
          intervalStart: data.allDay ? null : this.parseTime(data.start!),
          intervalEnd: data.allDay ? null : this.parseTime(data.end!),
          reason: data.reason,
        },
      });

      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'STAFF_TIME_OFF_CREATED',
        entityType: 'StaffTimeOff',
        entityId: timeOff.id,
        newValues: { staffId, date: data.date, allDay: data.allDay, start: data.start, end: data.end },
      }, tx);

      return {
        id: timeOff.id,
        date: timeOff.date.toISOString().substring(0, 10),
        allDay: timeOff.allDay,
        start: timeOff.intervalStart ? this.formatTime(timeOff.intervalStart) : null,
        end: timeOff.intervalEnd ? this.formatTime(timeOff.intervalEnd) : null,
        reason: timeOff.reason,
      };
    });
  }

  async getTimeOffs(businessId: string, staffId: string, userId: string, from?: string, to?: string) {
    const auth = await staffService.getMembershipAndUserRoles(businessId, userId);
    const staff = await staffService.getStaffById(businessId, staffId);

    if (!auth.isOwnerOrAdmin && auth.isBranchManager && !auth.allowedBranchIds.has(staff.branchId)) {
      throw ApiError.forbidden('Cannot view time off for staff outside authorized branch', ErrorCodes.FORBIDDEN);
    }

    const where: any = { staffId };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const timeOffs = await prisma.staffTimeOff.findMany({ where, orderBy: { date: 'asc' } });

    return timeOffs.map(t => ({
      id: t.id,
      date: t.date.toISOString().substring(0, 10),
      allDay: t.allDay,
      start: t.intervalStart ? this.formatTime(t.intervalStart) : null,
      end: t.intervalEnd ? this.formatTime(t.intervalEnd) : null,
      reason: t.reason,
    }));
  }

  async updateTimeOff(businessId: string, staffId: string, userId: string, timeOffId: string, data: Partial<TimeOffInput>) {
    const auth = await staffService.getMembershipAndUserRoles(businessId, userId);
    const staff = await staffService.getStaffById(businessId, staffId);

    if (!auth.isOwnerOrAdmin && auth.isBranchManager && !auth.allowedBranchIds.has(staff.branchId)) {
      throw ApiError.forbidden('Cannot manage time off for staff outside authorized branch', ErrorCodes.FORBIDDEN);
    }

    const existing = await prisma.staffTimeOff.findFirst({ where: { id: timeOffId, staffId } });
    if (!existing) throw ApiError.notFound('Time off not found', ErrorCodes.NOT_FOUND);

    const updateData: any = {};
    if (data.allDay !== undefined) updateData.allDay = data.allDay;
    if (data.reason !== undefined) updateData.reason = data.reason;

    const isAllDay = data.allDay !== undefined ? data.allDay : existing.allDay;
    if (isAllDay) {
      updateData.intervalStart = null;
      updateData.intervalEnd = null;
    } else {
      if (data.start) updateData.intervalStart = this.parseTime(data.start);
      if (data.end) updateData.intervalEnd = this.parseTime(data.end);
      if (!isAllDay && existing.allDay && (!data.start || !data.end)) {
        throw ApiError.badRequest('Start and end times are required for partial day time off', ErrorCodes.VALIDATION_ERROR);
      }
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.staffTimeOff.update({ where: { id: timeOffId }, data: updateData });

      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'STAFF_TIME_OFF_UPDATED',
        entityType: 'StaffTimeOff',
        entityId: timeOffId,
        oldValues: {
          date: existing.date.toISOString().substring(0, 10),
          allDay: existing.allDay,
          start: existing.intervalStart ? this.formatTime(existing.intervalStart) : null,
          end: existing.intervalEnd ? this.formatTime(existing.intervalEnd) : null,
        },
        newValues: {
          allDay: updated.allDay,
          start: updated.intervalStart ? this.formatTime(updated.intervalStart) : null,
          end: updated.intervalEnd ? this.formatTime(updated.intervalEnd) : null,
        },
      }, tx);

      return {
        id: updated.id,
        date: updated.date.toISOString().substring(0, 10),
        allDay: updated.allDay,
        start: updated.intervalStart ? this.formatTime(updated.intervalStart) : null,
        end: updated.intervalEnd ? this.formatTime(updated.intervalEnd) : null,
        reason: updated.reason,
      };
    });
  }

  async deleteTimeOff(businessId: string, staffId: string, userId: string, timeOffId: string) {
    const auth = await staffService.getMembershipAndUserRoles(businessId, userId);
    const staff = await staffService.getStaffById(businessId, staffId);

    if (!auth.isOwnerOrAdmin && auth.isBranchManager && !auth.allowedBranchIds.has(staff.branchId)) {
      throw ApiError.forbidden('Cannot manage time off for staff outside authorized branch', ErrorCodes.FORBIDDEN);
    }

    const existing = await prisma.staffTimeOff.findFirst({ where: { id: timeOffId, staffId } });
    if (!existing) return;

    return prisma.$transaction(async (tx) => {
      await tx.staffTimeOff.delete({ where: { id: timeOffId } });
      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'STAFF_TIME_OFF_DELETED',
        entityType: 'StaffTimeOff',
        entityId: timeOffId,
        oldValues: { date: existing.date.toISOString().substring(0, 10), allDay: existing.allDay },
      }, tx);
    });
  }
}

export const staffTimeOffService = new StaffTimeOffService();
