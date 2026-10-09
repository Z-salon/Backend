# Z-Salon Appointment Reminder and Customer Self-Service Workflow Audit

**Audit date:** 2026-10-09  
**Scope:** Existing `src/`, `prisma/`, `tests/`, deployment configuration, and related documentation.  
**Constraint:** Inspection and reporting only. No application, Prisma, migration, or production configuration changes were made.

## 1. Executive Summary

The repository contains a partial customer self-service confirmation feature, but not an operational appointment-reminder system. Online appointments that are immediately `CONFIRMED` and have `customerConfirmationEnabled` set receive one best-effort confirmation-request SMS during appointment creation. The configured reminder fields are stored and returned by the branch API, but no code schedules or sends reminders at `confirmationReminderHours` or `sameDayConfirmationReminderHours`. The only registered background job is pending-appointment expiration, and it is disabled in server startup.

The token link can retrieve, confirm, cancel, and reschedule an appointment without an account. Backend validation exists for most actions, and cancellation/refund calculations are covered comparatively well by the existing financial tests. However, the token is a bearer JWT containing only an appointment ID, is not stored or revocable, and its calculated expiry is forced to at least one hour even when the confirmation deadline has passed. Customer confirmation changes `confirmationStatus` only; it does not change appointment `status`, create a status history entry, cancel any future reminder, or create an admin follow-up signal. There is no confirmation-deadline enforcement or outstanding-confirmation query.

The highest risks are:

1. **Critical:** The server comments out `registerScheduledJobs()`, so even pending expiration does not run in the normal startup path. Reminder delivery has no registered implementation at all.
2. **High:** The configured confirmation deadline is not enforced. A token can remain valid after the deadline because TTL is clamped to 3,600 seconds.
3. **High:** Cancellation and rescheduling work through the public link, but appointment changes do not reconcile reminders because no reminder records or jobs exist. Concurrent availability checks and updates are also not serialized as one reservation operation.
4. **High:** Production SMS is not implemented. `getSmsProvider()` always returns `ConsoleSmsProvider`, which silently skips messages when `NODE_ENV=production`.
5. **Medium:** The branch configuration validator accepts `PERCENTAGE_REFUND`, while the Prisma enum and financial engine use `PARTIAL_REFUND`; a valid-looking percentage policy therefore cannot be written through that API.

## 2. Current Architecture

### Relevant files and symbols

- Appointment creation and initial status: [src/modules/appointment/services/appointment.service.ts](../../src/modules/appointment/services/appointment.service.ts), `createAppointment`, `validateAppointmentCreation`.
- Customer token workflow: [src/modules/appointment/services/customer-confirmation.service.ts](../../src/modules/appointment/services/customer-confirmation.service.ts), `sendConfirmationRequest`, `getAppointmentFromToken`, `confirmAppointment`, `cancelAppointment`, `rescheduleAppointment`.
- Public routes: [src/modules/appointment/routes/customer-confirmation.routes.ts](../../src/modules/appointment/routes/customer-confirmation.routes.ts), mounted under `/public` by [src/routes/index.ts](../../src/routes/index.ts).
- Token implementation: [src/libs/jwt.ts](../../src/libs/jwt.ts), `generateCustomerActionToken` and `verifyCustomerActionToken`.
- SMS integration/templates: [src/modules/auth/sms/sms.service.ts](../../src/modules/auth/sms/sms.service.ts), [src/modules/auth/sms/console-sms.provider.ts](../../src/modules/auth/sms/console-sms.provider.ts), and [src/modules/auth/sms/sms.types.ts](../../src/modules/auth/sms/sms.types.ts).
- Customer cancellation/rescheduling: [src/modules/customer/services/customer-appointment.service.ts](../../src/modules/customer/services/customer-appointment.service.ts), `cancelAppointment`, `rescheduleCustomerAppointment`.
- Availability and conflict checks: [src/modules/services/availability/availability.service.ts](../../src/modules/services/availability/availability.service.ts) and `appointmentService.checkConflicts`.
- Expiration job: [src/modules/appointment/services/appointment-expiration.service.ts](../../src/modules/appointment/services/appointment-expiration.service.ts), registered by [src/config/scheduler.ts](../../src/config/scheduler.ts).
- Startup: [src/app.ts](../../src/app.ts), where both `connectRedis()` and `registerScheduledJobs()` are commented out.
- Branch configuration: [src/modules/business/services/branch.service.ts](../../src/modules/business/services/branch.service.ts), `getBookingConfig`, `updateBookingConfig`, and [src/validation/auth.schemas.ts](../../src/validation/auth.schemas.ts), `branchBookingConfigUpdateSchema`.
- Refund calculation and processing: [src/modules/payment/services/refund-policy.service.ts](../../src/modules/payment/services/refund-policy.service.ts), [src/modules/payment/services/payment-finance.helpers.ts](../../src/modules/payment/services/payment-finance.helpers.ts), and [src/modules/payment/services/refund-request.service.ts](../../src/modules/payment/services/refund-request.service.ts).
- Data model: [prisma/schema.prisma](../../prisma/schema.prisma), especially `BranchBookingConfig`, `Appointment`, `AppointmentStatusHistory`, `RefundRequest`, `AppointmentPayment`, and `CustomerConfirmationStatus`.

### Actual flow

1. Online booking calls `createAppointment`. `bookingApprovalRequired` or a deposit makes the appointment `PENDING`; otherwise it is `CONFIRMED`. A confirmed appointment gets `confirmedAt`, but customer confirmation remains `PENDING` by default.
2. For an online, immediately confirmed appointment with `customerConfirmationEnabled=true`, `sendConfirmationRequest` creates a signed JWT and immediately calls `sendConfirmationRequestSms`. There is no database write for the token or message.
3. The link is `FRONTEND_URL/appointments/confirm/{token}`. The API routes are `/api/v1/public/appointments/confirm/:token` and the three POST actions beneath it.
4. A GET verifies the JWT and returns selected appointment, business, branch, service, and first-name staff details. It has no state-changing side effect.
5. Confirming updates `confirmationStatus`, `customerConfirmedAt`, and `confirmationMethod`, but leaves appointment `status` unchanged and does not create status history.
6. Cancellation delegates to the authenticated-customer cancellation implementation after deriving `businessId` and `customerId` from the appointment. It checks branch cancellation enablement and cancellation window, calculates a refund request amount, then transactionally cancels and optionally creates a `PENDING` refund request.
7. Rescheduling retains the appointment ID, validates branch rescheduling enablement, service duration, branch availability, staff availability, advance windows, and conflicts, then updates the scheduled times and writes an audit/status-history record with the same status before and after.
8. `AppointmentExpirationService` polls stale `PENDING` appointments every five minutes when registered, excluding appointments with a pending receipt, and transitions them to `EXPIRED`. Startup currently does not register it.

### Data and configuration findings

`BranchBookingConfig` has these defaults: `bookingApprovalRequired=false`, minimum advance `120` minutes, maximum advance `30` days, cancellation window `60` minutes, pending expiration `30` minutes, customer confirmation enabled, confirmation reminder `24` hours, confirmation deadline `2` hours, same-day reminder `1` hour, `NO_REFUND`, and refund deadline `24` hours. The two reminder timing fields are not read by any scheduler or SMS workflow.

There is no `AppointmentReminder`, notification/outbox, SMS delivery-attempt, queue-job, or action-token model in the Prisma schema. `AppointmentStatusHistory` and `AuditLog` provide history for several appointment/refund changes, but no SMS lifecycle or confirmation follow-up record.

## 3. Feature Audit Matrix

| Requirement | Status | Evidence and assessment |
| --- | --- | --- |
| Appointment creation and initial status transitions | IMPLEMENTED AND VERIFIED | `createAppointment` derives `PENDING`, `CONFIRMED`, or `CHECKED_IN` from booking source, approval, and deposit rules; invariant tests pass 48/48 in transpile-only execution. |
| Staff/receptionist appointment confirmation | PARTIALLY IMPLEMENTED | `transitionStatus` permits `PENDING -> CONFIRMED`; `confirmAttendance` separately sets `confirmationStatus=CONFIRMED` with `confirmationMethod=STAFF`. These are distinct, but staff attendance confirmation has no history/audit transaction and does not reconcile reminders. |
| Customer token generation | PARTIALLY IMPLEMENTED | `generateCustomerActionToken` signs `{sub: appointmentId,type:'customer_action'}` with the access secret. It is unpredictable if the secret is strong, but raw token material is not stored, revocation is impossible, and the same access secret is reused. |
| Token storage, invalidation, and one-time use | MISSING | No token model, hash, jti, revocation field, or invalidation operation exists. The bearer token can be reused until JWT expiry; action methods are not one-time. |
| Token retrieval safety and response minimization | PARTIALLY IMPLEMENTED | GET is read-only and selects limited fields, but it exposes business phone, branch address/timezone, service price, total amount, and staff first name to anyone possessing the bearer token. |
| Customer confirm/cancel/reschedule routes | IMPLEMENTED AND VERIFIED | Four public routes are mounted under `/public`; token verification and action-specific backend checks exist. There are no dedicated tests for these routes or token actions. |
| Confirmation changes appointment state | IMPLEMENTED BUT INCORRECT | Customer and staff confirmation update `confirmationStatus`, not appointment `status`; this may be intentional separation, but a customer-confirmed `PENDING` appointment remains operationally pending and can still expire. No explicit business rule reconciles the two states. |
| Configurable reminder intervals | IMPLEMENTED BUT INCORRECT | `confirmationReminderHours` and `sameDayConfirmationReminderHours` exist with defaults and API read/write plumbing, but no code consumes them to schedule or send SMS. |
| Reminder due-time calculation and persistence | MISSING | No reminder due-time calculation, persisted schedule, queue, or polling query exists. |
| Reminder eligibility and duplicate prevention | MISSING | No reminder processor excludes cancelled/completed appointments, tracks sent state, uses an idempotency key, or handles multiple workers/retries. |
| Reminder cancellation/rescheduling | MISSING | Cancellation and rescheduling update appointments but have no reminder records/jobs to cancel or move. |
| Time-zone handling for reminders/SMS | IMPLEMENTED BUT INCORRECT | Appointment dates are stored as `Date`, availability uses branch timezone/Luxon, but SMS templates use `toLocaleString()` without an explicit branch timezone. Confirmation SMS uses UTC ISO strings. |
| SMS provider integration | IMPLEMENTED BUT INCORRECT | Provider abstraction exists, but `createSmsProvider()` always returns `ConsoleSmsProvider`; production logs a warning and returns without sending. There are no provider IDs, delivery callbacks, retries, rate-limit handling, or delivery records. |
| SMS content and public URL | PARTIALLY IMPLEMENTED | Confirmation-request text includes local runtime time and a URL built from `FRONTEND_URL`; it omits business/branch/service context and does not state a confirmation deadline. The configured reminder templates do not exist. |
| Confirmation deadline enforcement | IMPLEMENTED BUT INCORRECT | `confirmationDeadlineHours` affects nominal JWT expiry, but `Math.max(...,3600)` keeps a token valid at least one hour after the deadline. No action checks the deadline and no expired confirmation state is written. |
| Admin visibility of unconfirmed appointments | MISSING | No outstanding-confirmation query, alert, dashboard indicator, branch notification, or follow-up-call workflow was found. Appointment listing can filter operational status, not customer confirmation status. |
| Pending appointment expiration | PARTIALLY IMPLEMENTED | The service performs a transactional status/history update and excludes pending payment receipts, but scheduler registration is commented out in `startServer`; no recovery/leader coordination exists. |
| Customer cancellation window | IMPLEMENTED AND VERIFIED | `customerAppointmentService.cancelAppointment` reads the appointment branch config and rejects when minutes to start are below `cancellationWindowMinutes`. Refund-policy tests cover the related policy calculations. |
| Refund policy and eligibility calculation | IMPLEMENTED AND VERIFIED | Effective policy resolution and financial balances are centralized; `NO_REFUND`, full, partial, deadline, overrides, reservations, and payment locks are covered by 28/28 refund-policy checks run transpile-only. |
| Refund request creation and approval | IMPLEMENTED AND VERIFIED | Customer cancellation creates a `PENDING` request in the same transaction as cancellation when refundable amount is positive; admin approval/completion are distinct and financial operations lock payment rows. |
| Refund policy configuration update | IMPLEMENTED BUT INCORRECT | Prisma uses `RefundPolicyType.PARTIAL_REFUND`, while `branchBookingConfigUpdateSchema` and `BranchBookingConfigUpdateInput` accept `PERCENTAGE_REFUND`. The API contract cannot consistently configure the stored partial policy. |
| Cancellation reminder invalidation | MISSING | No reminder state exists and cancellation only sends a best-effort cancellation SMS. |
| Customer rescheduling availability and identity | PARTIALLY IMPLEMENTED | Public rescheduling retains the same appointment ID and validates branch/service/staff availability and conflicts. It performs pre-transaction checks, then updates separately; there is no database-level slot reservation or retry/idempotency control. |
| Rescheduling reminder reconciliation | MISSING | No reminders are cancelled, superseded, or recreated; no confirmation deadline is recalculated; no post-commit reschedule SMS is sent (the authenticated path contains a placeholder). |
| Concurrent action consistency | IMPLEMENTED BUT INCORRECT | Cancellation/refund accounting has locks, but confirm/reschedule/cancel first read and then update without conditional version/status predicates. Concurrent public/staff actions can race, and availability checks are outside the update transaction. |
| Audit history | PARTIALLY IMPLEMENTED | Appointment status/history and business audit logs exist for creation, rescheduling, cancellation, and refund actions. Customer confirmation itself does not create a status-history or audit-log entry. |
| Worker persistence/recovery/monitoring | MISSING | No durable job store, worker process, health metric, retry policy, delivery state, or scheduler health signal exists. Redis is configured but connection/startup is commented out and no queue consumer is present. |
| Tenant/branch safety | IMPLEMENTED AND VERIFIED for traced action paths | Public token resolves one appointment ID and customer cancellation/rescheduling add business/customer predicates before mutation; branch config is read from that appointment. Cross-tenant token behavior is not covered by a dedicated test. |

## 4. Current End-to-End Flows

### Appointment creation and current SMS behavior

1. Public booking verifies an OTP, finds/creates the customer, and calls `createAppointment`.
2. The service validates business, branch, customer, service, staff, windows, and conflicts inside the creation path.
3. The appointment is created transactionally with a status and refund-policy fields.
4. Only an online appointment that starts immediately `CONFIRMED` and has customer confirmation enabled triggers `sendConfirmationRequest`.
5. That method computes a JWT expiry from the confirmation deadline and immediately calls the SMS abstraction. No future reminder is scheduled.
6. Other confirmed appointments receive a generic “appointment is confirmed” SMS; pending appointments receive neither a reminder nor customer action link from this path.

### Reminder delivery and customer confirmation

There is no current reminder-delivery flow. The configured 24-hour and one-hour values are inert. If a request SMS was sent, the customer opens the frontend URL, the frontend calls the public GET endpoint, and a POST action verifies the same JWT. Confirmation records `confirmationStatus=CONFIRMED`, timestamp, and method only. It does not transition operational status, notify staff, or cancel future messages.

### Customer cancellation and refund

1. The token is verified and the appointment is loaded.
2. The shared customer cancellation path checks terminal status, branch enablement, and the cancellation window.
3. The effective refund policy resolves appointment override, appointment fields, then branch fallback; paid and reserved amounts are calculated.
4. A transaction sets `CANCELLED`, writes status history/audit, and creates one `PENDING` refund request when the calculated amount is positive.
5. A best-effort cancellation SMS is sent after commit. Refund approval and completion are separate staff actions; approval does not mean money was returned.

### Customer rescheduling and reminder reconciliation

1. The token path derives the appointment’s business/customer IDs and delegates to `rescheduleForCustomer`.
2. The service checks status, `reschedulingEnabled`, assigned staff, service duration, branch hours/time off, and conflicts.
3. A transaction updates the same appointment’s start/end and writes same-status history plus audit data.
4. No reminder state is updated because no reminder state exists. No customer reschedule SMS is sent from the public path.

### Unconfirmed follow-up

No automated or query-backed follow-up flow exists. Staff can list appointments by operational status, but the repository has no dedicated confirmation-status filter, deadline job, alert record, or “needs call” status.

## 5. Issues and Recommendations

### Critical

- **Background processing is disabled.** `startServer` comments out `registerScheduledJobs`; even the implemented pending-expiration service will not execute in a normal server process. Re-enable the existing job only after confirming deployment runs one scheduler instance or add a clear worker ownership mechanism.
- **No production SMS delivery.** The provider factory always selects a console provider, which intentionally does nothing in production. Add the approved provider implementation and configuration, then record provider acceptance/failure separately from delivery.
- **Bearer token lifetime does not enforce the confirmation deadline.** Remove the minimum one-hour extension or add an explicit deadline check in every customer action, according to the product decision for late confirmation/cancellation/rescheduling. Store only a hash or revocation state if links must be invalidated.

### High

- **Reminder configuration has no execution path.** Implement the smallest durable reminder record/worker consistent with the chosen deployment model, with due time, appointment ID, branch/business scope, eligible status, attempt count, provider result, and an idempotency key. Reconcile it transactionally or through an outbox when appointment times/statuses change.
- **Confirmation and operational status can diverge indefinitely.** Define whether customer confirmation is an acknowledgement only or should approve a pending booking. Then enforce the chosen transition and add status-history/audit behavior.
- **No admin follow-up visibility.** Add a query/report based on `confirmationStatus`, appointment start, and deadline, plus a clear policy for appointments with no response. Do not infer confirmation from SMS acceptance.
- **Public mutations are not concurrency-safe at the appointment boundary.** Use conditional updates/versioning and perform the availability reservation under a transaction or database locking strategy. Keep the existing payment locks for financial operations.
- **Rescheduling leaves stale customer information.** Add a post-commit notification and define whether the original token remains valid and whether confirmation/deadline is reset.

### Medium

- **Refund policy enum mismatch.** Align the API schema and service input with `PARTIAL_REFUND` or deliberately migrate the enum/API contract; add an endpoint-level configuration test.
- **SMS times are ambiguous.** Format all customer messages in the appointment branch timezone and include business/branch/service context and the applicable deadline.
- **Operational visibility is incomplete.** Add structured notification attempt records and dashboards/queries for queued, accepted, delivered, failed, and action-taken states. Do not log raw action tokens or full message bodies in production.
- **Action response does not explicitly communicate current allowed actions.** The GET payload exposes status fields, but the backend does not return a policy-derived action set or deadline. The frontend must not be the only enforcement layer.

### Low

- Add dedicated API documentation and tests for public confirmation actions, failure responses, expiry boundaries, and provider behavior.
- Remove or update comments and documentation that describe configurable reminders as if they are scheduled today.

## 6. Test Results

Commands executed:

| Command | Result |
| --- | --- |
| `npm run build` | **Passed.** TypeScript compilation completed successfully. |
| `npx ts-node tests/refund-policy-override.test.ts` | **Did not execute.** `ts-node` stopped on existing nullable `feedback-request.service.ts` errors at lines 158 and 328. |
| `npx ts-node tests/availability-engine.test.ts` | **Did not execute.** `ts-node` stopped on existing test typing errors where `staff` is typed as an array but accessed as an object at lines 429, 437, and 480. |
| `npx ts-node tests/appointment-invariants.test.ts` | **Did not execute** for the same unrelated feedback nullable-type errors. |
| `npx ts-node --transpile-only tests/refund-policy-override.test.ts` | **Passed: 28/28.** Database-backed refund policy, deadline, override, and duplicate-reservation checks executed. |
| `npx ts-node --transpile-only tests/appointment-invariants.test.ts` | **Passed: 48/48.** Database-backed appointment and availability invariants executed. |
| `npx ts-node --transpile-only tests/availability-engine.test.ts` | **Failed at check 70, “Slot includes staff info.”** Runtime response supplies staff as an array while the test expects an object; the suite stopped after 69 successful checks. |

There is no `test` script in `package.json`. No existing tests cover configurable reminder intervals, due-time scheduling, duplicate/retry behavior, cancellation/reschedule reminder reconciliation, public token expiry/revocation, confirmation deadlines, admin follow-up, SMS provider failure/recovery, or scheduler startup. The passing refund tests do not prove the public token cancellation route itself.

## 7. Recommended Implementation Plan

### Essential fixes

1. Decide and document the meaning of `confirmationStatus`, `AppointmentStatus`, and the confirmation deadline, including late responses and no-response handling.
2. Fix the configuration enum contract and add endpoint tests for all booking, confirmation, and refund settings.
3. Implement real SMS provider configuration and a durable notification/outbox record with idempotent attempts and safe structured logging.
4. Implement the reminder worker using the existing branch timing fields, with explicit UTC storage and branch-timezone display. Make startup/deployment ownership and recovery behavior explicit.
5. Reconcile reminder records on appointment cancellation, rescheduling, expiration, staff confirmation, and customer confirmation.
6. Add the admin outstanding-confirmation view/alert and failure visibility.
7. Enforce token deadlines and choose whether tokens are revocable/rotated; add cross-tenant, expiry, replay, and concurrent-action tests.
8. Make appointment mutation/reservation concurrency-safe and add post-commit reschedule/cancellation notifications.

### Optional enhancements

1. Add delivery-provider webhooks for delivered/failed distinction.
2. Add a customer-facing action policy/deadline response and richer, branch-localized SMS templates.
3. Add scheduler/worker health metrics and an operational retry dashboard.
4. Add a normal test script and resolve the unrelated type errors so the suites can run without `--transpile-only`.

## 8. Open Decisions

1. Does customer confirmation merely acknowledge an already-booked appointment, or should it transition a `PENDING` booking to operational `CONFIRMED`?
2. What happens when the customer does not respond by `confirmationDeadlineHours`: retain, expire, cancel, or require staff approval?
3. Should a late token permit confirmation, cancellation, and rescheduling independently, or should all public actions be blocked after the deadline?
4. After rescheduling, should the customer confirmation deadline reset relative to the new start time, and should a new reminder be sent immediately if the new time is inside a configured offset?
5. Should existing action links remain valid after rescheduling, or should the system issue a new link and revoke the old one?
6. Which production SMS provider and delivery-status contract are approved for deployment?
