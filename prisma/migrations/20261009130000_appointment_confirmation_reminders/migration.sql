-- Appointment confirmation / reminder / staff follow-up workflow.
--
-- This migration is written idempotently (IF NOT EXISTS) because the production
-- database's Prisma migration history is already drifted from prisma/migrations
-- (pre-existing: the database has migrations that are not present locally and
-- vice versa). Additive DDL applied with `prisma db execute --file` is safe to
-- re-run and does not depend on `prisma migrate deploy` succeeding.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "ReminderJobType" AS ENUM ('FIRST_REMINDER', 'SECOND_REMINDER', 'DEADLINE_FOLLOWUP');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ReminderJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ReminderDeliveryStatus" AS ENUM ('SUCCESS', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "FollowUpStatus" AS ENUM ('OPEN', 'RESOLVED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "FollowUpOutcome" AS ENUM ('CONFIRMED', 'CANCELLED', 'RESCHEDULED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- Appointment.reminderScheduleVersion
-- ---------------------------------------------------------------------------

ALTER TABLE "Appointment"
  ADD COLUMN IF NOT EXISTS "reminderScheduleVersion" INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- BranchBookingConfig: second acknowledgement reminder default (3h before start)
-- Existing rows keep their explicitly configured value; only the column default
-- for newly created branch configs changes. Validation is enforced in code.
-- ---------------------------------------------------------------------------

ALTER TABLE "BranchBookingConfig"
  ALTER COLUMN "sameDayConfirmationReminderHours" SET DEFAULT 3;

-- ---------------------------------------------------------------------------
-- AppointmentActionToken
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "AppointmentActionToken" (
  "id"            TEXT NOT NULL,
  "businessId"    TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "tokenHash"     TEXT NOT NULL,
  "expiresAt"     TIMESTAMP(3) NOT NULL,
  "revokedAt"     TIMESTAMP(3),
  "lastUsedAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppointmentActionToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppointmentActionToken_tokenHash_key"
  ON "AppointmentActionToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "AppointmentActionToken_appointmentId_idx"
  ON "AppointmentActionToken"("appointmentId");
CREATE INDEX IF NOT EXISTS "AppointmentActionToken_expiresAt_idx"
  ON "AppointmentActionToken"("expiresAt");
CREATE INDEX IF NOT EXISTS "AppointmentActionToken_businessId_idx"
  ON "AppointmentActionToken"("businessId");

DO $$ BEGIN
  ALTER TABLE "AppointmentActionToken"
    ADD CONSTRAINT "AppointmentActionToken_appointmentId_fkey"
    FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- AppointmentReminder
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "AppointmentReminder" (
  "id"                TEXT NOT NULL,
  "appointmentId"     TEXT NOT NULL,
  "businessId"        TEXT NOT NULL,
  "branchId"          TEXT NOT NULL,
  "type"              "ReminderJobType" NOT NULL,
  "status"            "ReminderJobStatus" NOT NULL DEFAULT 'PENDING',
  "scheduledFor"      TIMESTAMP(3) NOT NULL,
  "scheduleVersion"   INTEGER NOT NULL,
  "attemptCount"      INTEGER NOT NULL DEFAULT 0,
  "maxAttempts"       INTEGER NOT NULL DEFAULT 5,
  "nextAttemptAt"     TIMESTAMP(3) NOT NULL,
  "claimedAt"         TIMESTAMP(3),
  "claimedBy"         TEXT,
  "leaseExpiresAt"    TIMESTAMP(3),
  "lastError"         TEXT,
  "sentAt"            TIMESTAMP(3),
  "completedAt"       TIMESTAMP(3),
  "providerMessageId" TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppointmentReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppointmentReminder_appointmentId_type_scheduleVersion_key"
  ON "AppointmentReminder"("appointmentId", "type", "scheduleVersion");
CREATE INDEX IF NOT EXISTS "AppointmentReminder_status_nextAttemptAt_idx"
  ON "AppointmentReminder"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "AppointmentReminder_status_leaseExpiresAt_idx"
  ON "AppointmentReminder"("status", "leaseExpiresAt");
CREATE INDEX IF NOT EXISTS "AppointmentReminder_appointmentId_idx"
  ON "AppointmentReminder"("appointmentId");
CREATE INDEX IF NOT EXISTS "AppointmentReminder_branchId_idx"
  ON "AppointmentReminder"("branchId");

DO $$ BEGIN
  ALTER TABLE "AppointmentReminder"
    ADD CONSTRAINT "AppointmentReminder_appointmentId_fkey"
    FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- ReminderDeliveryAttempt
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "ReminderDeliveryAttempt" (
  "id"                TEXT NOT NULL,
  "reminderId"        TEXT NOT NULL,
  "attemptNumber"     INTEGER NOT NULL,
  "status"            "ReminderDeliveryStatus" NOT NULL,
  "errorMessage"      TEXT,
  "providerMessageId" TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReminderDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ReminderDeliveryAttempt_reminderId_idx"
  ON "ReminderDeliveryAttempt"("reminderId");

DO $$ BEGIN
  ALTER TABLE "ReminderDeliveryAttempt"
    ADD CONSTRAINT "ReminderDeliveryAttempt_reminderId_fkey"
    FOREIGN KEY ("reminderId") REFERENCES "AppointmentReminder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- AppointmentFollowUp
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "AppointmentFollowUp" (
  "id"              TEXT NOT NULL,
  "appointmentId"   TEXT NOT NULL,
  "businessId"      TEXT NOT NULL,
  "branchId"        TEXT NOT NULL,
  "scheduleVersion" INTEGER NOT NULL,
  "status"          "FollowUpStatus" NOT NULL DEFAULT 'OPEN',
  "reason"          TEXT NOT NULL,
  "deadlineAt"      TIMESTAMP(3) NOT NULL,
  "outcome"         "FollowUpOutcome",
  "handledById"     TEXT,
  "handledAt"       TIMESTAMP(3),
  "note"            TEXT,
  "resolvedVia"     TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppointmentFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AppointmentFollowUp_businessId_status_idx"
  ON "AppointmentFollowUp"("businessId", "status");
CREATE INDEX IF NOT EXISTS "AppointmentFollowUp_branchId_status_idx"
  ON "AppointmentFollowUp"("branchId", "status");
CREATE INDEX IF NOT EXISTS "AppointmentFollowUp_appointmentId_idx"
  ON "AppointmentFollowUp"("appointmentId");
CREATE INDEX IF NOT EXISTS "AppointmentFollowUp_status_deadlineAt_idx"
  ON "AppointmentFollowUp"("status", "deadlineAt");

-- Database-level guarantee: at most one OPEN follow-up per appointment.
-- This is what makes concurrent deadline processing safe.
CREATE UNIQUE INDEX IF NOT EXISTS "AppointmentFollowUp_open_per_appointment_key"
  ON "AppointmentFollowUp"("appointmentId") WHERE "status" = 'OPEN';

DO $$ BEGIN
  ALTER TABLE "AppointmentFollowUp"
    ADD CONSTRAINT "AppointmentFollowUp_appointmentId_fkey"
    FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
