import { DateTime } from 'luxon';

export interface TimeInterval {
  start: DateTime;
  end: DateTime;
}

export interface DateTimeInterval {
  start: DateTime;
  end: DateTime;
}

/**
 * Creates a time interval from start and end DateTime objects.
 * Validates that start is before end.
 */
export function createInterval(start: DateTime, end: DateTime): TimeInterval {
  if (!start.isValid || !end.isValid) {
    throw new Error('Invalid DateTime provided for interval');
  }
  if (start >= end) {
    throw new Error('Interval start must be before end');
  }
  return { start, end };
}

/**
 * Checks if two intervals overlap.
 * Intervals overlap if they share any time range.
 */
export function intervalsOverlap(a: TimeInterval, b: TimeInterval): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Checks if interval a completely contains interval b.
 */
export function intervalContains(a: TimeInterval, b: TimeInterval): boolean {
  return a.start <= b.start && a.end >= b.end;
}

/**
 * Checks if two intervals are adjacent (end of one equals start of another).
 */
export function intervalsAreAdjacent(a: TimeInterval, b: TimeInterval): boolean {
  return a.end.equals(b.start) || b.end.equals(a.start);
}

/**
 * Merges overlapping or adjacent intervals.
 * Returns a new array of non-overlapping intervals sorted by start time.
 */
export function mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  if (intervals.length <= 1) return intervals;

  const sorted = [...intervals].sort((a, b) => a.start.diff(b.start).milliseconds);
  const merged: TimeInterval[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (intervalsOverlap(last, current) || intervalsAreAdjacent(last, current)) {
      merged[merged.length - 1] = createInterval(
        last.start,
        last.end > current.end ? last.end : current.end
      );
    } else {
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Subtracts interval 'subtract' from interval 'base'.
 * Returns an array of remaining intervals (0, 1, or 2 intervals).
 */
export function subtractInterval(base: TimeInterval, subtract: TimeInterval): TimeInterval[] {
  if (!intervalsOverlap(base, subtract)) {
    return [base];
  }

  const result: TimeInterval[] = [];

  if (base.start < subtract.start) {
    result.push(createInterval(base.start, subtract.start));
  }

  if (base.end > subtract.end) {
    result.push(createInterval(subtract.end, base.end));
  }

  return result;
}

/**
 * Subtracts multiple intervals from a base interval.
 */
export function subtractIntervals(base: TimeInterval, toSubtract: TimeInterval[]): TimeInterval[] {
  let remaining: TimeInterval[] = [base];

  for (const sub of toSubtract) {
    const nextRemaining: TimeInterval[] = [];
    for (const rem of remaining) {
      nextRemaining.push(...subtractInterval(rem, sub));
    }
    remaining = nextRemaining;
  }

  return remaining;
}

/**
 * Normalizes an array of intervals by sorting and merging overlapping/adjacent ones.
 */
export function normalizeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  return mergeIntervals(intervals);
}

/**
 * Validates that a duration in minutes is positive.
 */
export function validateDuration(minutes: number): void {
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw new Error('Duration must be a positive integer');
  }
}

/**
 * Validates that buffer minutes is non-negative.
 */
export function validateBuffer(minutes: number): void {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new Error('Buffer minutes must be a non-negative integer');
  }
}

/**
 * Creates a time interval from time strings (HH:mm) on a given date in a specific timezone.
 */
export function createTimeInterval(
  date: DateTime,
  startTime: string,
  endTime: string,
  zone: string
): TimeInterval {
  const start = date.setZone(zone).set({ hour: parseInt(startTime.split(':')[0]), minute: parseInt(startTime.split(':')[1]) });
  const end = date.setZone(zone).set({ hour: parseInt(endTime.split(':')[0]), minute: parseInt(endTime.split(':')[1]) });

  if (start >= end) {
    throw new Error('Start time must be before end time');
  }

  return createInterval(start, end);
}

/**
 * Converts a TimeInterval to a pair of ISO strings.
 */
export function intervalToISO(interval: TimeInterval): { start: string; end: string } {
  return {
    start: interval.start.toISO()!,
    end: interval.end.toISO()!,
  };
}

/**
 * Creates a DateTimeInterval from a start DateTime and duration in minutes.
 */
export function createIntervalFromDuration(start: DateTime, durationMinutes: number): TimeInterval {
  const end = start.plus({ minutes: durationMinutes });
  return createInterval(start, end);
}

/**
 * Gets the duration in minutes between two DateTime objects.
 */
export function getDurationMinutes(start: DateTime, end: DateTime): number {
  return end.diff(start, 'minutes').minutes;
}

/**
 * Checks if a DateTime falls within an interval (inclusive of start, exclusive of end).
 */
export function containsTime(interval: TimeInterval, time: DateTime): boolean {
  return time >= interval.start && time < interval.end;
}

/**
 * Splits an interval into fixed-size chunks.
 * Useful for generating time slots.
 */
export function splitInterval(interval: TimeInterval, chunkMinutes: number): TimeInterval[] {
  validateDuration(chunkMinutes);

  const chunks: TimeInterval[] = [];
  let current = interval.start;

  while (current < interval.end) {
    const chunkEnd = current.plus({ minutes: chunkMinutes });
    const end = chunkEnd > interval.end ? interval.end : chunkEnd;
    chunks.push(createInterval(current, end));
    current = chunkEnd;
  }

  return chunks;
}

/**
 * Finds the intersection of two intervals.
 * Returns null if they don't overlap.
 */
export function intersectIntervals(a: TimeInterval, b: TimeInterval): TimeInterval | null {
  if (!intervalsOverlap(a, b)) return null;

  const start = a.start > b.start ? a.start : b.start;
  const end = a.end < b.end ? a.end : b.end;

  return createInterval(start, end);
}

/**
 * Gets the union of multiple intervals (min start, max end).
 * Assumes intervals overlap or are adjacent.
 */
export function unionIntervals(intervals: TimeInterval[]): TimeInterval | null {
  if (intervals.length === 0) return null;
  if (intervals.length === 1) return intervals[0];

  const sorted = [...intervals].sort((a, b) => a.start.diff(b.start).milliseconds);
  let start = sorted[0].start;
  let end = sorted[0].end;

  for (let i = 1; i < sorted.length; i++) {
    if (intervalsOverlap({ start, end }, sorted[i]) || intervalsAreAdjacent({ start, end }, sorted[i])) {
      end = end > sorted[i].end ? end : sorted[i].end;
    } else {
      return null;
    }
  }

  return createInterval(start, end);
}