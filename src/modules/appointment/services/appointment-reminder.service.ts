import {
  AppointmentStatus,
  CustomerConfirmationStatus,
  Prisma,
  ReminderJobStatus,
  ReminderJobType,
} from '@prisma/client';
import { prisma } from '../../../libs/prisma';

type Db = Prisma.TransactionClient | typeof prisma;

/** Operational statuses in which an appointment is eligible for acknowledgement. */
const ACKNOWLEDGEMENT_ELIGIBLE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.CONFIRMED,
];

/** Statuses in which an appointment is no longer eligible for any reminders. */
const INELIGIBLE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED,
  AppointmentStatus.COMPLETED,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.EXPIRED,
];

/** Minimum lead time (hours) permitted for the second reminder before start. */
export const MIN_SECOND_REMINDER_HOURS = 1;

export type ConfirmationConfig = {
  enabled: boolean;
  firstReminderHours: number;
  secondReminderHours: number;
  deadlineHours: number;
};

export type ReminderScheduleEntry = {
  type: ReminderJobType;
  scheduledFor: Date;
};

export type ScheduleResult = {
  scheduleVersion: number;
  scheduled: ReminderScheduleEntry[];
  skippedReason?: string;
  followUpCreated?: boolean;
};

/**
 * Reads and normalizes the branch confirmation configuration.
 * Invalid legacy rows are corrected for computation only (never persisted here)
 * so the second reminder always lands before the deadline with a positive
 * response window and never less than MIN_SECOND_REMINDER_HOURS before start.
 */
export function normalizeConfirmationConfig(config?: {
  customerConfirmationEnabled?: boolean;
  confirmationReminderHours?: number | null;
  sameDayConfirmationReminderHours?: number | null;
  confirmationDeadlineHours?: number | null;
} | null): ConfirmationConfig {
  const enabled = config?.customerConfirmationEnabled ?? false;

  const deadlineHours = Math.max(0, config?.confirmationDeadlineHours ?? 2);
  let secondReminderHours = config?.sameDayConfirmationReminderHours ?? 3;
  if (secondReminderHours < MIN_SECOND_REMINDER_HOURS) {
    secondReminderHours = MIN_SECOND_REMINDER_HOURS;
  }
  if (secondReminderHours <= deadlineHours) {
    secondReminderHours = deadlineHours + 1;
  }
  let firstReminderHours = config?.confirmationReminderHours ?? 24;
  if (firstReminderHours < secondReminderHours) {
    firstReminderHours = secondReminderHours;
  }

  return { enabled, firstReminderHours, secondReminderHours, deadlineHours };
}

function hoursBefore(date: Date, hours: number): Date {
  return new Date(date.getTime() - hours * 60 * 60 * 1000);
}

/**
 * Builds the reminder schedule for an appointment start instant using the
 * no-catch-up rules:
 * - both reminders scheduled when both instants are in the future
 * - only the second reminder when the first instant already passed
 * - nothing when the second reminder instant already passed (never send late)
 * - the deadline job is always scheduled at its instant if still in the future
 */
export function buildReminderSchedule(
  scheduledStart: Date,
  config: ConfirmationConfig,
  now: Date = new Date()
): { schedule: ReminderScheduleEntry[]; deadlineAt: Date; deadlinePassed: boolean } {
  const firstAt = hoursBefore(scheduledStart, config.firstReminderHours);
  const secondAt = hoursBefore(scheduledStart, config.secondReminderHours);
  const deadlineAt = hoursBefore(scheduledStart, config.deadlineHours);

  const schedule: ReminderScheduleEntry[] = [];
  if (firstAt.getTime() > now.getTime()) {
    schedule.push({ type: ReminderJobType.FIRST_REMINDER, scheduledFor: firstAt });
  }
  if (secondAt.getTime() > now.getTime()) {
    schedule.push({ type: ReminderJobType.SECOND_REMINDER, scheduledFor: secondAt });
  }
  if (deadlineAt.getTime() > now.getTime()) {
    schedule.push({ type: ReminderJobType.DEADLINE_FOLLOWUP, scheduledFor: deadlineAt });
  }

  return { schedule, deadlineAt, deadlinePassed: deadlineAt.getTime() <= now.getTime() };
}

export class AppointmentReminderService {
  async getConfirmationConfig(
    db: Db,
    branchId: string
  ): Promise<ConfirmationConfig> {
    const config = await db.branchBookingConfig.findUnique({ where: { branchId } });
    return normalizeConfirmationConfig(config);
  }

  private isAcknowledgeEligible(appointment: {
    status: AppointmentStatus;
    confirmationStatus: CustomerConfirmationStatus;
  }, config: ConfirmationConfig): boolean {
    return (
      config.enabled &&
      ACKNOWLEDGEMENT_ELIGIBLE_STATUSES.includes(appointment.status) &&
      appointment.confirmationStatus !== CustomerConfirmationStatus.CONFIRMED
    );
  }

  /**
   * (Re)build the reminder schedule for an appointment. Bumps the schedule
   * version, cancels any pending jobs from the previous schedule, and creates
   * jobs for the new schedule. Must run inside the transaction that changed the
   * appointment where practical.
   */
  async scheduleForAppointment(
    db: Db,
    appointmentId: string,
    options?: { now?: Date; reason?: string }
  ): Promise<ScheduleResult> {
    const now = options?.now ?? new Date();

    const appointment = await db.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        branchId: true,
        businessId: true,
        status: true,
        confirmationStatus: true,
        scheduledStart: true,
        reminderScheduleVersion: true,
      },
    });

    if (!appointment) {
      return { scheduleVersion: 0, scheduled: [], skippedReason: 'NOT_FOUND' };
    }

    // If the appointment is already ineligible, make sure nothing pending remains.
    if (INELIGIBLE_STATUSES.includes(appointment.status)) {
      await this.cancelPendingReminders(db, appointmentId, options?.reason ?? 'Appointment ineligible');
      await this.cancelOpenFollowUps(db, appointmentId, options?.reason ?? 'Appointment ineligible');
      return {
        scheduleVersion: appointment.reminderScheduleVersion,
        scheduled: [],
        skippedReason: `STATUS_${appointment.status}`,
      };
    }

    const config = await this.getConfirmationConfig(db, appointment.branchId);

    // Always bump the version and cancel the previous schedule so a reschedule
    // can never deliver a stale reminder.
    const updated = await db.appointment.update({
      where: { id: appointmentId },
      data: { reminderScheduleVersion: { increment: 1 } },
      select: { reminderScheduleVersion: true },
    });
    const scheduleVersion = updated.reminderScheduleVersion;

    await db.appointmentReminder.updateMany({
      where: {
        appointmentId,
        status: { in: [ReminderJobStatus.PENDING, ReminderJobStatus.PROCESSING] },
      },
      data: {
        status: ReminderJobStatus.CANCELLED,
        completedAt: now,
        lastError: options?.reason ?? 'Superseded by a new schedule',
      },
    });

    if (!this.isAcknowledgeEligible(appointment, config)) {
      return {
        scheduleVersion,
        scheduled: [],
        skippedReason: !config.enabled
          ? 'CUSTOMER_CONFIRMATION_DISABLED'
          : appointment.confirmationStatus === CustomerConfirmationStatus.CONFIRMED
            ? 'ALREADY_CONFIRMED'
            : `STATUS_${appointment.status}`,
      };
    }

    const { schedule, deadlineAt, deadlinePassed } = buildReminderSchedule(
      appointment.scheduledStart,
      config,
      now
    );

    if (schedule.length > 0) {
      await db.appointmentReminder.createMany({
        data: schedule.map((entry) => ({
          appointmentId,
          businessId: appointment.businessId,
          branchId: appointment.branchId,
          type: entry.type,
          status: ReminderJobStatus.PENDING,
          scheduledFor: entry.scheduledFor,
          nextAttemptAt: entry.scheduledFor,
          scheduleVersion,
          maxAttempts: 5,
        })),
        skipDuplicates: true,
      });
    }

    let followUpCreated = false;
    if (deadlinePassed) {
      // The deadline already elapsed at (re)schedule time. Do not send a catch-up
      // reminder, but do raise the staff follow-up now.
      followUpCreated = await this.ensureFollowUp(db, appointmentId, deadlineAt);
    }

    return { scheduleVersion, scheduled: schedule, followUpCreated };
  }

  /**
   * Cancel unsent reminder jobs for an appointment (customer confirmed,
   * cancelled, rescheduled, or otherwise ineligible). Sent history is preserved.
   */
  async cancelPendingReminders(
    db: Db,
    appointmentId: string,
    reason: string
  ): Promise<number> {
    const result = await db.appointmentReminder.updateMany({
      where: {
        appointmentId,
        status: { in: [ReminderJobStatus.PENDING, ReminderJobStatus.PROCESSING] },
      },
      data: {
        status: ReminderJobStatus.CANCELLED,
        completedAt: new Date(),
        lastError: reason.slice(0, 500),
      },
    });
    return result.count;
  }

  /**
   * Reconcile when the customer acknowledges: cancel remaining reminders and
   * resolve any open follow-up.
   */
  async onCustomerConfirmed(
    db: Db,
    appointmentId: string,
    source: 'CUSTOMER_TOKEN' | 'STAFF' | 'CUSTOMER_APP'
  ): Promise<void> {
    await this.cancelPendingReminders(db, appointmentId, 'Customer confirmed the appointment');
    await db.appointmentFollowUp.updateMany({
      where: { appointmentId, status: 'OPEN' },
      data: {
        status: 'RESOLVED',
        outcome: 'CONFIRMED',
        resolvedVia: 'CUSTOMER',
        handledAt: new Date(),
        note: `Resolved automatically: customer confirmed via ${source}`,
      },
    });
  }

  /** Reconcile when an appointment becomes ineligible (cancelled/expired/etc). */
  async onAppointmentIneligible(
    db: Db,
    appointmentId: string,
    reason: string
  ): Promise<void> {
    await this.cancelPendingReminders(db, appointmentId, reason);
    await this.cancelOpenFollowUps(db, appointmentId, reason);
  }

  /** Cancel open follow-ups (e.g. the customer cancelled or rescheduled). */
  async cancelOpenFollowUps(db: Db, appointmentId: string, reason: string): Promise<number> {
    const result = await db.appointmentFollowUp.updateMany({
      where: { appointmentId, status: 'OPEN' },
      data: {
        status: 'CANCELLED',
        handledAt: new Date(),
        note: reason.slice(0, 500),
      },
    });
    return result.count;
  }

  /**
   * Create (or keep) exactly one OPEN follow-up for an appointment schedule.
   * Idempotent: the partial unique index on (appointmentId) WHERE status='OPEN'
   * makes concurrent creation safe; on conflict the existing row is returned.
   */
  async ensureFollowUp(
    db: Db,
    appointmentId: string,
    deadlineAt: Date
  ): Promise<boolean> {
    const appointment = await db.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        businessId: true,
        branchId: true,
        status: true,
        confirmationStatus: true,
        reminderScheduleVersion: true,
      },
    });

    if (!appointment) return false;

    if (INELIGIBLE_STATUSES.includes(appointment.status)) return false;
    if (appointment.confirmationStatus === CustomerConfirmationStatus.CONFIRMED) return false;

    const config = await this.getConfirmationConfig(db, appointment.branchId);
    if (!config.enabled) return false;

    const existingOpen = await db.appointmentFollowUp.findFirst({
      where: { appointmentId, status: 'OPEN' },
      select: { id: true },
    });
    if (existingOpen) return false;

    try {
      await db.appointmentFollowUp.create({
        data: {
          appointmentId,
          businessId: appointment.businessId,
          branchId: appointment.branchId,
          scheduleVersion: appointment.reminderScheduleVersion,
          status: 'OPEN',
          reason: 'Customer did not respond by the confirmation response deadline',
          deadlineAt,
        },
      });
      return true;
    } catch (error) {
      // Unique violation => another worker created it first. That is success.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return false;
      }
      throw error;
    }
  }
}

export const appointmentReminderService = new AppointmentReminderService();
