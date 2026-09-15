import { AppointmentStatus } from '@prisma/client';

/**
 * Appointment statuses that occupy a staff member's calendar.
 * CANCELLED / NO_SHOW / EXPIRED appointments free the staff member up again.
 *
 * COMPLETED is included on purpose: a completed appointment still blocks its
 * *actual* working window (including the post-service buffer), which is what
 * makes early release free the staff member earlier rather than instantly.
 */
export const BUSY_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.PENDING,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_PROGRESS,
  AppointmentStatus.COMPLETED,
];

/**
 * The minimum an appointment must expose to derive its operational busy window.
 * Deliberately structural so both the availability repository (Prisma include
 * with `extensions`) and ad-hoc objects (a prospective booking) can be passed in.
 */
export interface AppointmentBusySource {
  scheduledStart: Date;
  scheduledEnd: Date;
  status?: AppointmentStatus | string | null;
  actualEnd?: Date | null;
  /** Extensions ordered most-recent-first; only the latest one is significant. */
  extensions?: Array<{ extendedUntil: Date }> | null;
}

export interface AppointmentBusyWindow {
  /** Always the original scheduledStart — extensions/release never move the start. */
  start: Date;
  /** When the work is operationally expected to end (extension or actual end). */
  effectiveEnd: Date;
  /** effectiveEnd plus the service buffer. The single source of buffer truth. */
  reservedEnd: Date;
}

/**
 * Resolves when an appointment operationally stops occupying its staff member.
 *
 * Precedence:
 *  1. A completed appointment with a recorded actualEnd — the real finish time.
 *     This is what makes an early release hand the staff member back sooner (and
 *     also what makes an overrun block longer than scheduled).
 *  2. The latest extension's extendedUntil, when it pushes past scheduledEnd.
 *  3. The original scheduledEnd.
 *
 * Never returns a time at or before scheduledStart, so a nonsensical actualEnd
 * (e.g. data created before this feature existed) can never produce an
 * inverted interval.
 */
export function getEffectiveAppointmentEnd(appointment: AppointmentBusySource): Date {
  if (
    appointment.status === AppointmentStatus.COMPLETED &&
    appointment.actualEnd &&
    appointment.actualEnd.getTime() > appointment.scheduledStart.getTime()
  ) {
    return appointment.actualEnd;
  }

  const latestExtension = appointment.extensions?.[0];
  if (latestExtension && latestExtension.extendedUntil.getTime() > appointment.scheduledEnd.getTime()) {
    return latestExtension.extendedUntil;
  }

  return appointment.scheduledEnd;
}

/**
 * Single source of truth for "when is this staff member busy for this appointment".
 *
 * Used by every availability/conflict consumer (public availability, slot
 * validation, appointment creation, rescheduling, staff reassignment, extension
 * conflict checks) so an extension or early release is honoured consistently.
 *
 * The buffer is applied exactly once, to the effective end.
 */
export function getAppointmentBusyWindow(
  appointment: AppointmentBusySource,
  bufferMinutes = 0
): AppointmentBusyWindow {
  const start = appointment.scheduledStart;
  const effectiveEnd = getEffectiveAppointmentEnd(appointment);
  const buffer = Number.isFinite(bufferMinutes) && bufferMinutes > 0 ? bufferMinutes : 0;
  const reservedEnd = new Date(effectiveEnd.getTime() + buffer * 60_000);

  return { start, effectiveEnd, reservedEnd };
}

/** True when two busy windows share any time range (touching edges do not overlap). */
export function busyWindowsOverlap(a: AppointmentBusyWindow, b: AppointmentBusyWindow): boolean {
  return a.start < b.reservedEnd && b.start < a.reservedEnd;
}
