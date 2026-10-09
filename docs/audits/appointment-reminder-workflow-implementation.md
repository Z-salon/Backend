# Appointment Confirmation, Reminder, and Staff Follow-Up — Implementation Report

**Date:** 2026-10-09
**Scope:** Confirm the earlier audit, then implement the confirmation/reminder/staff
follow-up workflow end to end on the existing Node/TypeScript/Prisma/PostgreSQL backend.
**Status:** Implemented and verified against the database. **Not yet production-ready** for
real customer SMS (see §7).

---

## 1. Audit findings (confirmed before changing code)

The previous audit was accurate. Verified in this session:

- **Scheduler disabled.** [src/app.ts](../../src/app.ts) still had `connectRedis()` and
  `registerScheduledJobs()` commented out in `startServer`. `registerScheduledJobs` only ever
  ran the 5-minute pending-appointment expiration cron.
- **SMS provider.** `getSmsProvider()` / `createSmsProvider()` in
  [sms.service.ts](../../src/modules/auth/sms/sms.service.ts) still returned
  `ConsoleSmsProvider` unconditionally; in production the console provider logs a warning and
  sends nothing.
- **No reminder/outbox/follow-up durables.** The Prisma schema had no reminder-job, delivery
  attempt, follow-up, or persisted action-token model. `confirmationReminderHours` and
  `sameDayConfirmationReminderHours` were stored/returned but consumed by nothing.
- **Token.** The public link used a JWT signed with the **access-token secret**, stored
  nothing, was not revocable, and its TTL was clamped with `Math.max(ttl, 3600)`, so it
  outlived the response deadline.
- **Confirmation is acknowledgement-only.** `confirmAppointment` changed only
  `confirmationStatus` / `customerConfirmedAt` / `confirmationMethod` — correct separation,
  but it neither cancelled anything nor notified staff.
- **A latent FK defect blocked customer self-service.** `customerAppointmentService.cancelAppointment`
  and `appointmentService.rescheduleForCustomer` wrote the **Customer id** into
  `AppointmentStatusHistory.actorId` (a `User` FK) and `AuditLog.actorId`. Any real customer
  cancellation/reschedule through the link therefore failed with `P2003` (foreign key
  violation). This is pre-existing and was fixed (see §3).
- **Config default mismatch.** `sameDayConfirmationReminderHours` defaulted to `1`, not the
  intended `3`.

Baseline before changes: `npm run build` passed; `appointment-invariants` 48/48;
`availability-engine` still fails at check 70 (“Slot includes staff info”) — **unchanged and
still failing**, as the prior audit reported.

## 2. Business rules implemented

- Customer acknowledgement is **separate** from operational status. Confirming never moves a
  `PENDING` appointment to `CONFIRMED`.
- `PENDING` appointments (awaiting approval or prepayment) get **no acknowledgement reminders**,
  and their public link is **view-only** (confirm/cancel/reschedule rejected server-side).
- Reminders are scheduled only for `CONFIRMED` appointments with
  `customerConfirmationEnabled = true`, and only from actual appointment eligibility moments.
- Defaults: first reminder `start − 24h`, second `start − 3h`, deadline `start − 2h`, second
  reminder never less than `1h` before start.
- **No catch-up reminders**: a job is only created when its instant is still in the future.
  If the deadline already elapsed at schedule time, a staff follow-up is raised immediately
  instead.
- The deadline is a **staff follow-up trigger only** — never an automatic cancellation, and it
  never blocks a late customer confirmation.
- Staff outcomes are exactly **`CONFIRMED`, `CANCELLED`, `RESCHEDULED`** (no `UNREACHABLE`).
- All scheduled times are computed from the appointment start instant; timestamps are stored
  as UTC instants and customer messages are formatted in the **branch timezone** (Luxon).

## 3. What was implemented

### Models & migrations
- New enums: `ReminderJobType`, `ReminderJobStatus`, `ReminderDeliveryStatus`,
  `FollowUpStatus`, `FollowUpOutcome`.
- New models in [schema.prisma](../../prisma/schema.prisma):
  - `AppointmentActionToken` — SHA-256 hashed opaque tokens (unique hash), expiry, revocation.
  - `AppointmentReminder` — one durable job per `(appointmentId, type, scheduleVersion)`;
    status, `scheduledFor`, `nextAttemptAt`, `attemptCount`/`maxAttempts`, claim/lease fields,
    `lastError`, `sentAt`, `completedAt`, provider id.
  - `ReminderDeliveryAttempt` — durable per-attempt history.
  - `AppointmentFollowUp` — durable staff follow-up with a **partial unique index** on
    `(appointmentId) WHERE status = 'OPEN'` (one open follow-up per appointment).
- `Appointment.reminderScheduleVersion` — bumped on every (re)schedule; reminder jobs carry the
  version so stale jobs can never be delivered after a reschedule.
- `AuditLog.actorId` made nullable (system/customer-initiated actions have no staff `User`).
- `BranchBookingConfig.sameDayConfirmationReminderHours` column default changed `1 → 3`.
- Migrations (written idempotently, applied with `prisma db execute`):
  - [20261009130000_appointment_confirmation_reminders/migration.sql](../../prisma/migrations/20261009130000_appointment_confirmation_reminders/migration.sql)
  - [20261009131500_audit_log_actor_nullable/migration.sql](../../prisma/migrations/20261009131500_audit_log_actor_nullable/migration.sql)

### Services
- **New** [appointment-action-token.service.ts](../../src/modules/appointment/services/appointment-action-token.service.ts):
  CSPRNG 256-bit opaque tokens (`base64url`), only the hash stored, explicit expiry
  (`scheduledEnd + 24h`, min 1h), revocation on cancellation, expiry extension on reschedule,
  and a legacy-JWT fallback so previously issued links still resolve.
- **New** [appointment-reminder.service.ts](../../src/modules/appointment/services/appointment-reminder.service.ts):
  `normalizeConfirmationConfig`, `buildReminderSchedule` (pure, no-catch-up rules),
  `scheduleForAppointment` (bump version, cancel old, create new, raise follow-up if deadline
  passed), `cancelPendingReminders`, `onCustomerConfirmed`, `onAppointmentIneligible`,
  `cancelOpenFollowUps`, `ensureFollowUp` (idempotent, concurrency-safe).
- **New** [appointment-follow-up.service.ts](../../src/modules/appointment/services/appointment-follow-up.service.ts):
  branch-scoped `list`, `getForAppointment` (queue + indicator data), `resolve` (atomic claim,
  delegates to existing `confirmAttendance` / `cancelAppointment` / `rescheduleBusinessAppointment`),
  `reopen` (new row, history preserved), `getReminderHistory`.
- **Reworked** [customer-confirmation.service.ts](../../src/modules/appointment/services/customer-confirmation.service.ts):
  persisted-token resolution; minimal customer-safe payload (no internal ids / phone / payment
  details); server-computed `actions` policy (`viewOnly`, `canConfirm`, `canCancel`,
  `canReschedule`); atomic conditional confirmation + reconciliation; pending view-only
  enforcement; fresh details returned after reschedule; `dispatchBookingNotification`
  (pending-approval vs approval notification).
- **Wired** scheduling/reconciliation into existing lifecycle transactions:
  - `appointment.service.createAppointment` — schedules reminders in-transaction for ONLINE
    confirmed bookings; sends pending/approval notification post-commit (no immediate
    acknowledgement request).
  - `appointment.service.transitionStatus` — `PENDING → CONFIRMED` schedules reminders and sends
    the approval notification; `CANCELLED`/`NO_SHOW` reconciles and revokes the link.
  - `appointment.service.confirmAttendance` — transactional conditional acknowledgement +
    reminder/follow-up reconciliation.
  - `appointment.service.cancelAppointment` / `rescheduleBusinessAppointment` /
    `rescheduleForCustomer` — reconcile reminders, follow-ups, and token expiry.
  - `payment-receipt.service.verifyReceipt` — approval schedules reminders and sends the approval
    notification (falls back to the generic SMS when confirmation is disabled).
  - `customer-appointment.service.cancelAppointment` / `rescheduleAppointment` — reconcile
    reminders/follow-ups/tokens.
  - `appointment-expiration.service` — expiry reconciles and revokes links.
- **FK fix:** customer-initiated status history now uses `actorType = SYSTEM` with `actorId = null`,
  and audit logs for customer actions store `actorId = null`.

### Routes (staff)
New [appointment-follow-up.routes.ts](../../src/modules/appointment/routes/appointment-follow-up.routes.ts),
mounted in [routes/index.ts](../../src/routes/index.ts) with `authenticate` + `requireBusinessMembership`:
- `GET  /api/v1/businesses/:businessId/appointment-follow-ups` (filter `branchId`, `status`, paginated)
- `PATCH /api/v1/businesses/:businessId/appointment-follow-ups/:followUpId` (outcome + note)
- `POST /api/v1/businesses/:businessId/appointment-follow-ups/:followUpId/reopen`
- `GET  /api/v1/businesses/:businessId/appointments/:appointmentId/follow-up`
- `GET  /api/v1/businesses/:businessId/appointments/:appointmentId/reminders`

`GET /businesses/:businessId/appointments/:appointmentId` now also returns `needsFollowUp`,
`followUp`, and `reminders`.

### Worker
New [reminder-worker.ts](../../src/workers/reminder-worker.ts):
- Polls PostgreSQL (configurable interval); atomically claims a batch with
  `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING *` — the claim commits in its
  own statement before any SMS call.
- Recovers abandoned `PROCESSING` jobs whose lease expired; graceful shutdown releases claims.
- Re-checks appointment status, schedule version, branch confirmation config, and customer
  acknowledgement immediately before sending; marks ineligible jobs `SKIPPED` with a reason.
- Bounded retries with exponential backoff + jitter; permanent/no-recipient failures are
  terminal; every attempt recorded in `ReminderDeliveryAttempt`.
- Also runs the existing pending-appointment expiration job, so all background work lives in one
  durable process (no in-memory timers, no Redis/BullMQ).
- Structured JSON logs, no tokens/URLs/phone numbers.

### Configuration
- `src/config/env.ts`: `SMS_PROVIDER`, and the `REMINDER_WORKER_*` / `REMINDER_*` block.
- `branch.service.updateBookingConfig` now validates the merged config: second reminder ≥ 1h,
  second > deadline (positive response window), first ≥ second.
- `branchBookingConfigUpdateSchema`: `sameDayConfirmationReminderHours` min raised to 1.

## 4. How the worker is started

- **Local dev:** `npm run start:worker:dev` (ts-node).
- **Production:** `npm run start:worker` (compiles, then `node build/workers/reminder-worker.js`).
- Deploy it as a **separate always-on process** from the API (`npm start`). One or more replicas
  are safe because claiming uses `FOR UPDATE SKIP LOCKED`; set `REMINDER_WORKER_ID` if you want
  stable identity in logs. The API process itself does not run reminder work.

## 5. Environment variables & SMS provider

Added (see [.env.example](../../.env.example)): `SMS_PROVIDER` (only `console` implemented),
`REMINDER_WORKER_POLL_INTERVAL_MS` (30000), `REMINDER_WORKER_BATCH_SIZE` (20),
`REMINDER_WORKER_LEASE_SECONDS` (120), `REMINDER_MAX_ATTEMPTS` (5),
`REMINDER_RETRY_BASE_SECONDS` (60), `REMINDER_RETRY_MAX_SECONDS` (3600),
`REMINDER_WORKER_RUN_EXPIRATION` (true), `REMINDER_EXPIRATION_INTERVAL_MINUTES` (5),
optional `REMINDER_WORKER_ID`.

**SMS provider is still console-only.** `createSmsProvider()` logs a clear production error and
`ConsoleSmsProvider` no-ops in production. Reminder rows are still marked `SENT` by the worker
after the provider call returns — with the console provider this means “handed to the
provider”, not “delivered by SMS”. Implement a real provider before relying on delivery.

## 6. Migrations & deployment steps

1. `npm ci && npx prisma generate`
2. Apply the two new migrations. Because the production `_prisma_migrations` history is already
   drifted (pre-existing: the DB contains a migration absent locally and vice-versa), apply the
   additive DDL directly:
   ```
   npx prisma db execute --file prisma/migrations/20261009130000_appointment_confirmation_reminders/migration.sql --schema prisma/schema.prisma
   npx prisma db execute --file prisma/migrations/20261009131500_audit_log_actor_nullable/migration.sql --schema prisma/schema.prisma
   ```
   (`npx prisma migrate deploy` will not cleanly apply while the history is drifted; reconciling
   the history table is a separate, larger task and was intentionally left untouched.)
3. `npm run build`
4. Start/redeploy the API and, separately, the worker (`npm run start:worker`).

## 7. Tests run and exact results

All DB-backed suites were run with `npx ts-node --transpile-only tests/<file>` (the repo has no
`test` script and no Jest).

| Suite | Result |
| --- | --- |
| `npm run build` (tsc) | **Passed** |
| `tests/appointment-reminder-workflow.test.ts` (new) | **Passed: 46/46** |
| `tests/appointment-invariants.test.ts` | **Passed: 48/48** |
| `tests/customer-module.test.ts` | **Passed: 59/59** |
| `tests/refund-policy-override.test.ts` | **Passed: 28/28** |
| `tests/availability-engine.test.ts` | **Still fails at check 70** (“Slot includes staff info”) — pre-existing, unchanged, not concealed |
| `tests/finance-refund.test.ts` | Did **not complete** in this session — the remote Neon database latency made it exceed the run timeout on both attempts. It reached the refund section with all earlier checks passing; it must be re-run to completion before release. |

The new suite covers: config defaults/normalization/validation; both/second-only/no-catch-up
scheduling; deadline job timing; confirmation cancels reminders + is idempotent + does not change
operational status; pending is view-only and reminder-free; disabled branch schedules nothing;
reschedule bumps version and swaps jobs; cancellation cancels jobs and revokes the link; one
open follow-up at the deadline including 6-way concurrent `ensureFollowUp`; staff resolution and
idempotency; queue tenant scoping; concurrent claim partitioning with `SKIP LOCKED`; lease-expiry
recovery; permanent no-recipient failure; invalid-token rejection.

## 8. Remaining limitations / production prerequisites

- **Real SMS delivery is not enabled.** Only `ConsoleSmsProvider` exists. No provider message id,
  delivery receipt, or idempotency key is available yet.
- **Exactly-once delivery is not guaranteed.** Claim + send is at-least-once: if the provider
  accepts a message and the worker crashes before recording success, the job is retried after the
  lease expires and a duplicate message may be sent. A provider idempotency key would remove this.
- **Migration history drift** is pre-existing; the new migrations were applied additively, not via
  `migrate deploy`.
- **Rate limiting** on public token endpoints was **not** added — the repo has rate-limit config
  but no rate-limit middleware/dependency, and adding one was out of scope. Token endpoints rely
  on unguessable tokens and server-side state checks today.
- **`finance-refund` full run** outstanding (DB latency).
- The new tables are referenced by worker polling; make sure the worker is actually deployed or
  reminders accumulate as `PENDING` (visible via the reminder-history endpoint).

## 9. Decisions not implemented, and why

- **Did not make `PENDING` appointments cancellable via the token link.** The task requires the
  pending link to be view-only; the authenticated customer endpoint is unchanged. If pending
  self-service cancellation is later required, add an explicit policy rather than relaxing this.
- **Did not add a real SMS provider or webhook delivery status.** No vendor/contract is available;
  guessing one would be wrong. The abstraction is ready for a drop-in provider.
- **Did not rebuild the drifted Prisma migration history.** Doing so on a live database is a
  destructive/operational decision that needs explicit approval; the new changes are additive.
- **Did not change unrelated behavior** (e.g. the `availability-engine` check-70 failure, which is
  a test/response-shape mismatch outside this workflow).

## 10. Strictly preserved

Booking lifecycle (`PENDING`/`CONFIRMED`/`CHECKED_IN`/…), staff approval, prepayment verification,
cancellation window, refund policy/refund-request creation, rescheduling availability/conflict
checks, audit records, and the minimum-advance-booking rule were all reused rather than
reimplemented. A customer confirmation never changes operational status; a missed deadline never
cancels anything.
