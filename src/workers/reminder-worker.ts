import { randomUUID } from 'crypto';
import {
  AppointmentStatus,
  CustomerConfirmationStatus,
  ReminderDeliveryStatus,
  ReminderJobStatus,
  ReminderJobType,
} from '@prisma/client';
import { prisma } from '../libs/prisma';
import { config } from '../config/env';
import { appointmentReminderService } from '../modules/appointment/services/appointment-reminder.service';
import { appointmentActionTokenService } from '../modules/appointment/services/appointment-action-token.service';
import { appointmentExpirationService } from '../modules/appointment/services/appointment-expiration.service';
import {
  buildConfirmationUrl,
  sendAcknowledgementReminderSms,
} from '../modules/auth/sms/sms.service';

/**
 * Durable appointment reminder worker.
 *
 * PostgreSQL is the source of truth. The worker polls due `AppointmentReminder`
 * rows, atomically claims a batch with FOR UPDATE SKIP LOCKED (so multiple
 * workers never process the same active job), commits the claim, then performs
 * the external SMS call outside any transaction. Crashed claims are recovered
 * after their lease expires.
 *
 * Run with: `npm run start:worker` (production) / `npm run start:worker:dev`.
 */

const WORKER_ID = config.reminderWorker.workerId || `worker-${randomUUID()}`;
const POLL_MS = config.reminderWorker.pollIntervalMs;
const BATCH_SIZE = config.reminderWorker.batchSize;
const LEASE_SECONDS = config.reminderWorker.leaseSeconds;
const RETRY_BASE_SECONDS = config.reminderWorker.retryBaseSeconds;
const RETRY_MAX_SECONDS = config.reminderWorker.retryMaxSeconds;
const DEFAULT_MAX_ATTEMPTS = config.reminderWorker.maxAttempts;

interface ClaimedReminder {
  id: string;
  appointmentId: string;
  businessId: string;
  branchId: string;
  type: ReminderJobType;
  status: ReminderJobStatus;
  scheduledFor: Date;
  scheduleVersion: number;
  attemptCount: number;
  maxAttempts: number;
}

let running = true;

function log(event: string, data: Record<string, unknown> = {}): void {
  // Structured, non-secret log line. Never log tokens, URLs, or phone numbers.
  console.log(JSON.stringify({ ts: new Date().toISOString(), worker: WORKER_ID, event, ...data }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoffMs(attempt: number): number {
  const base = RETRY_BASE_SECONDS * 1000;
  const raw = Math.min(base * Math.pow(2, Math.max(0, attempt - 1)), RETRY_MAX_SECONDS * 1000);
  const jitter = raw * 0.2 * (Math.random() * 2 - 1); // +/-20%
  return Math.max(1000, Math.round(raw + jitter));
}

/** Classify a provider error so permanent failures are not retried forever. */
function classifyError(error: unknown): 'TRANSIENT' | 'PERMANENT' {
  const err = error as any;
  if (err?.permanent === true) return 'PERMANENT';

  const status = err?.status ?? err?.statusCode ?? err?.response?.status;
  if (typeof status === 'number') {
    if (status === 429 || status >= 500) return 'TRANSIENT';
    if (status >= 400) return 'PERMANENT';
  }

  const code = String(err?.code ?? '');
  if (
    ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'EPIPE', 'EHOSTUNREACH'].includes(code)
  ) {
    return 'TRANSIENT';
  }

  // Unknown errors are retried, but bounded by maxAttempts.
  return 'TRANSIENT';
}

export async function claimDueJobs(limit: number): Promise<ClaimedReminder[]> {
  const leaseExpiresAt = new Date(Date.now() + LEASE_SECONDS * 1000);
  return prisma.$queryRaw<ClaimedReminder[]>`
    UPDATE "AppointmentReminder"
    SET "status" = 'PROCESSING',
        "claimedAt" = now(),
        "claimedBy" = ${WORKER_ID},
        "leaseExpiresAt" = ${leaseExpiresAt},
        "updatedAt" = now()
    WHERE "id" IN (
      SELECT "id" FROM "AppointmentReminder"
      WHERE ("status" = 'PENDING' AND "nextAttemptAt" <= now())
         OR ("status" = 'PROCESSING' AND "leaseExpiresAt" IS NOT NULL AND "leaseExpiresAt" < now())
      ORDER BY "nextAttemptAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    RETURNING *;
  `;
}

/** Move a claimed job to a terminal status. Conditional on our claim. */
async function finalizeJob(
  job: ClaimedReminder,
  status: ReminderJobStatus,
  data: { lastError?: string; providerMessageId?: string | null } = {}
): Promise<void> {
  await prisma.appointmentReminder.updateMany({
    where: { id: job.id, claimedBy: WORKER_ID, status: ReminderJobStatus.PROCESSING },
    data: {
      status,
      completedAt: new Date(),
      lastError: data.lastError?.slice(0, 500) ?? null,
      ...(status === ReminderJobStatus.SENT ? { sentAt: new Date() } : {}),
      ...(data.providerMessageId ? { providerMessageId: data.providerMessageId } : {}),
      claimedAt: null,
      claimedBy: null,
      leaseExpiresAt: null,
    },
  });
}

type EligibilityResult =
  | { eligible: true; appointment: any; phone: string | null; branchName: string; timezone: string }
  | { eligible: false; reason: string };

async function checkEligibility(job: ClaimedReminder): Promise<EligibilityResult> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: job.appointmentId },
    include: {
      customer: { include: { phones: { where: { isPrimary: true }, take: 1 } } },
      branch: { select: { name: true, timezone: true, bookingConfig: true } },
      business: { select: { name: true } },
    },
  });

  if (!appointment) return { eligible: false, reason: 'APPOINTMENT_NOT_FOUND' };

  // Stale job detection: a reschedule bumps reminderScheduleVersion and cancels
  // the old jobs, so a version mismatch must never be delivered.
  if (appointment.reminderScheduleVersion !== job.scheduleVersion) {
    return { eligible: false, reason: 'STALE_SCHEDULE_VERSION' };
  }

  if (appointment.status !== AppointmentStatus.CONFIRMED) {
    return { eligible: false, reason: `STATUS_${appointment.status}` };
  }
  if (appointment.confirmationStatus === CustomerConfirmationStatus.CONFIRMED) {
    return { eligible: false, reason: 'ALREADY_CONFIRMED' };
  }
  const customerConfirmationEnabled = appointment.branch.bookingConfig?.customerConfirmationEnabled ?? false;
  if (!customerConfirmationEnabled) {
    return { eligible: false, reason: 'CUSTOMER_CONFIRMATION_DISABLED' };
  }

  return {
    eligible: true,
    appointment,
    phone: appointment.customer.phones[0]?.phone ?? null,
    branchName: appointment.branch.name || appointment.business.name,
    timezone: appointment.branch.timezone,
  };
}

export async function processJob(job: ClaimedReminder): Promise<void> {
  const eligibility = await checkEligibility(job);

  if (!eligibility.eligible) {
    await finalizeJob(job, ReminderJobStatus.SKIPPED, { lastError: eligibility.reason });
    log('job_skipped', { id: job.id, type: job.type, reason: eligibility.reason });
    return;
  }

  const { appointment, phone, branchName, timezone } = eligibility;

  if (job.type === ReminderJobType.DEADLINE_FOLLOWUP) {
    const deadlineAt = new Date(
      appointment.scheduledStart.getTime() -
        (appointment.branch.bookingConfig?.confirmationDeadlineHours ?? 2) * 60 * 60 * 1000
    );
    const created = await appointmentReminderService.ensureFollowUp(prisma, appointment.id, deadlineAt);
    await finalizeJob(job, ReminderJobStatus.SENT);
    log('deadline_processed', { id: job.id, appointmentId: appointment.id, followUpCreated: created });
    return;
  }

  if (!phone) {
    // Permanent condition: no deliverable recipient. Do not retry.
    await finalizeJob(job, ReminderJobStatus.FAILED, { lastError: 'NO_CUSTOMER_PHONE' });
    log('job_failed_permanent', { id: job.id, reason: 'NO_CUSTOMER_PHONE' });
    return;
  }

  // Issue a fresh, short-lived-capable self-service link for this message.
  const token = await appointmentActionTokenService.issueToken(prisma, {
    id: appointment.id,
    businessId: appointment.businessId,
    scheduledEnd: appointment.scheduledEnd,
  });
  const url = buildConfirmationUrl(config.frontendUrl, token);

  try {
    await sendAcknowledgementReminderSms(
      phone,
      url,
      appointment.scheduledStart,
      timezone,
      branchName,
      job.type === ReminderJobType.FIRST_REMINDER ? 'FIRST' : 'SECOND'
    );

    await prisma.$transaction([
      prisma.reminderDeliveryAttempt.create({
        data: {
          reminderId: job.id,
          attemptNumber: job.attemptCount + 1,
          status: ReminderDeliveryStatus.SUCCESS,
        },
      }),
      prisma.appointmentReminder.updateMany({
        where: { id: job.id, claimedBy: WORKER_ID, status: ReminderJobStatus.PROCESSING },
        data: {
          status: ReminderJobStatus.SENT,
          sentAt: new Date(),
          completedAt: new Date(),
          attemptCount: job.attemptCount + 1,
          claimedAt: null,
          claimedBy: null,
          leaseExpiresAt: null,
          lastError: null,
        },
      }),
    ]);

    log('job_sent', { id: job.id, type: job.type });
  } catch (error) {
    const kind = classifyError(error);
    const attempt = job.attemptCount + 1;
    const maxAttempts = job.maxAttempts || DEFAULT_MAX_ATTEMPTS;
    const message = error instanceof Error ? error.message : String(error);
    const terminal = kind === 'PERMANENT' || attempt >= maxAttempts;

    await prisma.$transaction([
      prisma.reminderDeliveryAttempt.create({
        data: {
          reminderId: job.id,
          attemptNumber: attempt,
          status: ReminderDeliveryStatus.FAILED,
          errorMessage: message.slice(0, 500),
        },
      }),
      prisma.appointmentReminder.updateMany({
        where: { id: job.id, claimedBy: WORKER_ID, status: ReminderJobStatus.PROCESSING },
        data: terminal
          ? {
              status: ReminderJobStatus.FAILED,
              attemptCount: attempt,
              completedAt: new Date(),
              lastError: message.slice(0, 500),
              claimedAt: null,
              claimedBy: null,
              leaseExpiresAt: null,
            }
          : {
              status: ReminderJobStatus.PENDING,
              attemptCount: attempt,
              nextAttemptAt: new Date(Date.now() + computeBackoffMs(attempt)),
              lastError: message.slice(0, 500),
              claimedAt: null,
              claimedBy: null,
              leaseExpiresAt: null,
            },
      }),
    ]);

    log(terminal ? 'job_failed' : 'job_retry_scheduled', {
      id: job.id,
      type: job.type,
      attempt,
      kind,
      error: message.slice(0, 200),
    });
  }
}

let lastExpirationRun = 0;
let lastCleanupRun = 0;

async function tick(): Promise<number> {
  const jobs = await claimDueJobs(BATCH_SIZE);
  for (const job of jobs) {
    if (!running) break;
    try {
      await processJob(job);
    } catch (error) {
      // Never let one job kill the loop; release the claim for recovery.
      log('job_error', { id: job.id, error: error instanceof Error ? error.message : String(error) });
      await prisma.appointmentReminder
        .updateMany({
          where: { id: job.id, claimedBy: WORKER_ID, status: ReminderJobStatus.PROCESSING },
          data: {
            status: ReminderJobStatus.PENDING,
            claimedAt: null,
            claimedBy: null,
            leaseExpiresAt: null,
          },
        })
        .catch(() => undefined);
    }
  }
  return jobs.length;
}

async function maybeRunExpiration(): Promise<void> {
  if (!config.reminderWorker.runExpiration) return;
  const intervalMs = config.reminderWorker.expirationIntervalMinutes * 60 * 1000;
  if (Date.now() - lastExpirationRun < intervalMs) return;
  lastExpirationRun = Date.now();
  try {
    const count = await appointmentExpirationService.expireStalePendingAppointments();
    if (count > 0) log('expired_pending_appointments', { count });
  } catch (error) {
    log('expiration_error', { error: error instanceof Error ? error.message : String(error) });
  }
}

async function maybeCleanupTokens(): Promise<void> {
  const intervalMs = 24 * 60 * 60 * 1000;
  if (Date.now() - lastCleanupRun < intervalMs) return;
  lastCleanupRun = Date.now();
  try {
    const removed = await appointmentActionTokenService.deleteExpiredTokens(30);
    if (removed > 0) log('expired_action_tokens_removed', { removed });
  } catch (error) {
    log('token_cleanup_error', { error: error instanceof Error ? error.message : String(error) });
  }
}

async function loop(): Promise<void> {
  log('worker_started', {
    pollIntervalMs: POLL_MS,
    batchSize: BATCH_SIZE,
    leaseSeconds: LEASE_SECONDS,
    runExpiration: config.reminderWorker.runExpiration,
  });

  while (running) {
    try {
      const processed = await tick();
      await maybeRunExpiration();
      await maybeCleanupTokens();
      if (processed === 0) await sleep(POLL_MS);
    } catch (error) {
      log('tick_error', { error: error instanceof Error ? error.message : String(error) });
      await sleep(POLL_MS);
    }
  }

  // Graceful shutdown: release any claims held by this worker so another worker
  // can process them immediately rather than waiting for lease expiry.
  try {
    const released = await prisma.appointmentReminder.updateMany({
      where: { claimedBy: WORKER_ID, status: ReminderJobStatus.PROCESSING },
      data: {
        status: ReminderJobStatus.PENDING,
        claimedAt: null,
        claimedBy: null,
        leaseExpiresAt: null,
      },
    });
    log('worker_stopped', { releasedClaims: released.count });
  } catch (error) {
    log('shutdown_error', { error: error instanceof Error ? error.message : String(error) });
  }
}

export async function startReminderWorker(): Promise<void> {
  process.on('SIGINT', () => {
    log('shutdown_signal', { signal: 'SIGINT' });
    running = false;
  });
  process.on('SIGTERM', () => {
    log('shutdown_signal', { signal: 'SIGTERM' });
    running = false;
  });

  await loop();
  await prisma.$disconnect();
}

if (require.main === module) {
  startReminderWorker()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Reminder worker crashed:', error);
      process.exit(1);
    });
}
