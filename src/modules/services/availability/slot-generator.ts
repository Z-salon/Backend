import { DateTime } from 'luxon';
import { TimeInterval, createInterval } from './interval.utils';

export const SLOT_STEP_MINUTES = 15;

export interface SlotCandidate {
  startTime: DateTime;
  serviceEndTime: DateTime;
  reservedEndTime: DateTime;
}

/**
 * Generates all valid booking slots within a set of available intervals.
 *
 * A slot is valid when:
 *   - startTime is a multiple of SLOT_STEP_MINUTES within the interval
 *   - reservedEndTime (= startTime + duration + buffer) fits entirely inside the interval
 *
 * @param intervals     The effective available intervals (already accounting for breaks/time off)
 * @param durationMin   The service duration in minutes
 * @param bufferMin     The post-service buffer in minutes
 * @returns             Array of SlotCandidate objects
 */
export function generateSlots(
  intervals: TimeInterval[],
  durationMin: number,
  bufferMin: number
): SlotCandidate[] {
  const totalBlock = durationMin + bufferMin;
  const slots: SlotCandidate[] = [];

  for (const interval of intervals) {
    // Align the first candidate to the next clean SLOT_STEP_MINUTES boundary
    let current = alignToSlotStep(interval.start);

    while (current < interval.end) {
      const reservedEnd = current.plus({ minutes: totalBlock });

      if (reservedEnd <= interval.end) {
        slots.push({
          startTime: current,
          serviceEndTime: current.plus({ minutes: durationMin }),
          reservedEndTime: reservedEnd,
        });
      }

      current = current.plus({ minutes: SLOT_STEP_MINUTES });
    }
  }

  return slots;
}

/**
 * Rounds a DateTime up to the nearest SLOT_STEP_MINUTES boundary.
 * e.g., 09:03 → 09:15 (given step = 15)
 */
export function alignToSlotStep(dt: DateTime): DateTime {
  const minuteRemainder = dt.minute % SLOT_STEP_MINUTES;
  if (minuteRemainder === 0 && dt.second === 0 && dt.millisecond === 0) {
    return dt;
  }
  return dt
    .set({ second: 0, millisecond: 0 })
    .plus({ minutes: SLOT_STEP_MINUTES - minuteRemainder });
}

/**
 * Checks whether a specific start time falls within a set of available intervals
 * such that the full reserved block (duration + buffer) fits inside.
 */
export function isSlotFeasible(
  startTime: DateTime,
  durationMin: number,
  bufferMin: number,
  availableIntervals: TimeInterval[]
): boolean {
  const reservedEnd = startTime.plus({ minutes: durationMin + bufferMin });

  for (const interval of availableIntervals) {
    if (startTime >= interval.start && reservedEnd <= interval.end) {
      return true;
    }
  }

  return false;
}
