import { prisma } from '../../../libs/prisma';
import { DateTime } from 'luxon';

export class AvailabilityRepository {
  async getBranchBookingConfig(branchId: string) {
    return prisma.branchBookingConfig.findUnique({
      where: { branchId },
    });
  }

  async getEligibleStaff(branchId: string, serviceId: string) {
    return prisma.staff.findMany({
      where: {
        branchId,
        status: 'ACTIVE',
        serviceQualifications: {
          some: {
            serviceId,
            isActive: true,
          },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
      orderBy: {
        id: 'asc', // Deterministic ordering
      },
    });
  }

  async getBranchOperatingHours(branchId: string, date: DateTime) {
    // Prisma @db.Date expects midnight UTC Date objects.
    // e.g., for "2026-10-22", we need 2026-10-22T00:00:00.000Z.
    const dateStr = date.toFormat('yyyy-MM-dd');
    const jsDate = new Date(`${dateStr}T00:00:00.000Z`);
    
    const luxonToJsDay = date.weekday === 7 ? 0 : date.weekday;

    // Fetch override first
    const dateOverride = await prisma.branchDateOverride.findUnique({
      where: {
        branchId_date: {
          branchId,
          date: jsDate,
        },
      },
      include: {
        intervals: {
          orderBy: { startTime: 'asc' },
        },
      },
    });

    if (dateOverride) {
      return {
        isOverride: true,
        isClosed: dateOverride.isClosed,
        intervals: dateOverride.intervals,
      };
    }

    // Fallback to weekly schedule
    const weeklySchedule = await prisma.branchWeeklySchedule.findUnique({
      where: {
        branchId_dayOfWeek: {
          branchId,
          dayOfWeek: luxonToJsDay,
        },
      },
      include: {
        intervals: {
          orderBy: { startTime: 'asc' },
        },
      },
    });

    if (weeklySchedule) {
      return {
        isOverride: false,
        isClosed: weeklySchedule.isClosed,
        intervals: weeklySchedule.intervals,
      };
    }

    // No configuration means closed
    return {
      isOverride: false,
      isClosed: true,
      intervals: [],
    };
  }

  async getStaffSchedule(staffId: string, date: DateTime) {
    const dateStr = date.toFormat('yyyy-MM-dd');
    const jsDate = new Date(`${dateStr}T00:00:00.000Z`);
    const luxonToJsDay = date.weekday === 7 ? 0 : date.weekday;

    const [override, weekly] = await Promise.all([
      prisma.staffScheduleOverride.findUnique({
        where: {
          staffId_date: {
            staffId,
            date: jsDate,
          },
        },
        include: {
          intervals: {
            orderBy: { intervalStart: 'asc' },
          },
        },
      }),
      prisma.staffWeeklyScheduleDay.findUnique({
        where: {
          staffId_dayOfWeek: {
            staffId,
            dayOfWeek: luxonToJsDay,
          },
        },
        include: {
          intervals: {
            orderBy: { intervalStart: 'asc' },
          },
        },
      }),
    ]);

    if (override) {
      return {
        isOverride: true,
        isWorking: override.isWorking,
        intervals: override.intervals,
      };
    }

    if (weekly) {
      return {
        isOverride: false,
        isWorking: weekly.isWorking,
        intervals: weekly.intervals,
      };
    }

    // No staff schedule config implies they follow branch hours (return null to signify fallback needed)
    return null;
  }

  async getStaffBreaks(staffId: string, date: DateTime) {
    const dateStr = date.toFormat('yyyy-MM-dd');
    const jsDate = new Date(`${dateStr}T00:00:00.000Z`);
    const luxonToJsDay = date.weekday === 7 ? 0 : date.weekday;

    const [override, weekly] = await Promise.all([
      prisma.staffBreakOverride.findUnique({
        where: {
          staffId_date: {
            staffId,
            date: jsDate,
          },
        },
        include: {
          intervals: {
            orderBy: { breakStart: 'asc' },
          },
        },
      }),
      prisma.staffWeeklyBreak.findMany({
        where: {
          staffId,
          dayOfWeek: luxonToJsDay,
        },
        orderBy: { breakStart: 'asc' },
      }),
    ]);

    if (override) {
      return {
        isOverride: true,
        intervals: override.intervals,
      };
    }

    return {
      isOverride: false,
      intervals: weekly,
    };
  }

  async getStaffTimeOff(staffId: string, date: DateTime) {
    const dateStr = date.toFormat('yyyy-MM-dd');
    const jsDate = new Date(`${dateStr}T00:00:00.000Z`);

    return prisma.staffTimeOff.findMany({
      where: {
        staffId,
        date: jsDate,
      },
    });
  }

  /**
   * Abstraction for future Appointment model integration.
   * Returns empty array for now.
   */
  async getStaffBusyIntervalsFromAppointments(staffId: string, date: DateTime, timezone: string) {
    // TODO: Implement when Appointment model exists
    // Should return blocking intervals (startTime, reservedEndTime)
    // where status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS')
    return [];
  }
}

export const availabilityRepository = new AvailabilityRepository();
