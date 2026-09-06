import { DateTime } from 'luxon';
import {
  TimeInterval,
  createInterval,
  intersectIntervals,
  mergeIntervals,
  subtractIntervals,
  normalizeIntervals,
} from './interval.utils';
import { AvailabilityRepository } from './availability.repository';

const availabilityRepository = new AvailabilityRepository();

/**
 * Converts a DB Time(0) DateTime (date part is irrelevant) to a
 * wall-clock time on the specific date in the branch timezone.
 */
function timeOnDate(dbTime: DateTime, date: DateTime, timezone: string): DateTime {
  // DB @db.Time(0) gives a DateTime with only the time portion meaningful.
  return date.setZone(timezone).set({
    hour: dbTime.hour,
    minute: dbTime.minute,
    second: 0,
    millisecond: 0,
  });
}

/**
 * Calculates the branch's effective operating intervals for a given date.
 * Respects date overrides. Returns intervals as DateTimes in the branch timezone.
 */
export async function getBranchOperatingIntervals(
  branchId: string,
  date: DateTime,
  timezone: string
): Promise<TimeInterval[]> {
  const raw = await availabilityRepository.getBranchOperatingHours(branchId, date);

  if (raw.isClosed || raw.intervals.length === 0) {
    return [];
  }

  const intervals: TimeInterval[] = [];
  for (const iv of raw.intervals) {
    try {
      const dbStart = DateTime.fromJSDate(iv.startTime ?? (iv as any).intervalStart);
      const dbEnd = DateTime.fromJSDate(iv.endTime ?? (iv as any).intervalEnd);
      const start = timeOnDate(dbStart, date, timezone);
      const end = timeOnDate(dbEnd, date, timezone);
      if (start < end) {
        intervals.push(createInterval(start, end));
      }
    } catch (_) {
      // skip invalid intervals
    }
  }

  return normalizeIntervals(intervals);
}

/**
 * Calculates a staff member's effective working intervals for a given date.
 * Falls back to branch operating intervals if no staff schedule is configured.
 * Date-specific overrides take precedence over weekly schedules.
 */
export async function getStaffWorkingIntervals(
  staffId: string,
  branchId: string,
  date: DateTime,
  timezone: string,
  branchIntervals: TimeInterval[]
): Promise<TimeInterval[]> {
  const schedule = await availabilityRepository.getStaffSchedule(staffId, date);

  if (!schedule) {
    // No schedule configured → use branch operating hours
    return branchIntervals;
  }

  if (!schedule.isWorking) {
    return [];
  }

  if (schedule.intervals.length === 0) {
    return [];
  }

  const staffIntervals: TimeInterval[] = [];
  for (const iv of schedule.intervals) {
    try {
      const dbStart = DateTime.fromJSDate(iv.intervalStart);
      const dbEnd = DateTime.fromJSDate(iv.intervalEnd);
      const start = timeOnDate(dbStart, date, timezone);
      const end = timeOnDate(dbEnd, date, timezone);
      if (start < end) {
        staffIntervals.push(createInterval(start, end));
      }
    } catch (_) {
      // skip invalid intervals
    }
  }

  const normalizedStaffIntervals = normalizeIntervals(staffIntervals);

  // Staff must never be available outside branch operating hours
  const clipped: TimeInterval[] = [];
  for (const staffInterval of normalizedStaffIntervals) {
    for (const branchInterval of branchIntervals) {
      const intersection = intersectIntervals(staffInterval, branchInterval);
      if (intersection) clipped.push(intersection);
    }
  }

  return normalizeIntervals(clipped);
}

/**
 * Retrieves effective break intervals for a staff member on a given date.
 * Date-specific break overrides replace recurring breaks entirely.
 */
export async function getStaffBreakIntervals(
  staffId: string,
  date: DateTime,
  timezone: string
): Promise<TimeInterval[]> {
  const breaksData = await availabilityRepository.getStaffBreaks(staffId, date);

  if (breaksData.intervals.length === 0) {
    return [];
  }

  const intervals: TimeInterval[] = [];
  for (const iv of breaksData.intervals) {
    try {
      const isWeeklyBreak = 'breakStart' in iv;
      const dbStart = DateTime.fromJSDate(isWeeklyBreak ? (iv as any).breakStart : (iv as any).breakStart);
      const dbEnd = DateTime.fromJSDate(isWeeklyBreak ? (iv as any).breakEnd : (iv as any).breakEnd);
      const start = timeOnDate(dbStart, date, timezone);
      const end = timeOnDate(dbEnd, date, timezone);
      if (start < end) {
        intervals.push(createInterval(start, end));
      }
    } catch (_) {
      // skip invalid intervals
    }
  }

  return normalizeIntervals(intervals);
}

/**
 * Retrieves time-off intervals for a staff member on a given date.
 */
export async function getStaffTimeOffIntervals(
  staffId: string,
  date: DateTime,
  timezone: string
): Promise<TimeInterval[]> {
  const timeOffRecords = await availabilityRepository.getStaffTimeOff(staffId, date);

  if (timeOffRecords.length === 0) return [];

  const dayStart = date.startOf('day');
  const dayEnd = date.endOf('day');

  const intervals: TimeInterval[] = [];
  for (const to of timeOffRecords) {
    if (to.allDay) {
      // Use the full date range
      intervals.push(createInterval(dayStart, dayEnd.plus({ milliseconds: 1 })));
    } else if (to.intervalStart && to.intervalEnd) {
      const start = timeOnDate(DateTime.fromJSDate(to.intervalStart), date, timezone);
      const end = timeOnDate(DateTime.fromJSDate(to.intervalEnd), date, timezone);
      if (start < end) {
        intervals.push(createInterval(start, end));
      }
    }
  }

  return normalizeIntervals(intervals);
}

/**
 * Calculates the final effective available intervals for a staff member on a given date.
 * Formula: intersect(branchIntervals, staffIntervals) - breaks - timeOff - appointments
 */
export async function getStaffEffectiveIntervals(
  staffId: string,
  branchId: string,
  date: DateTime,
  timezone: string
): Promise<TimeInterval[]> {
  const branchIntervals = await getBranchOperatingIntervals(branchId, date, timezone);
  if (branchIntervals.length === 0) return [];

  const staffIntervals = await getStaffWorkingIntervals(staffId, branchId, date, timezone, branchIntervals);
  if (staffIntervals.length === 0) return [];

  const [breakIntervals, timeOffIntervals, appointmentIntervals] = await Promise.all([
    getStaffBreakIntervals(staffId, date, timezone),
    getStaffTimeOffIntervals(staffId, date, timezone),
    availabilityRepository.getStaffBusyIntervalsFromAppointments(staffId, date, timezone),
  ]);

  const allBlocking: TimeInterval[] = [...breakIntervals, ...timeOffIntervals];

  // Subtract blocking intervals from each working interval
  let available = staffIntervals;
  for (const blocking of allBlocking) {
    const next: TimeInterval[] = [];
    for (const avail of available) {
      next.push(...subtractIntervals(avail, [blocking]));
    }
    available = next;
  }

  return normalizeIntervals(available);
}
