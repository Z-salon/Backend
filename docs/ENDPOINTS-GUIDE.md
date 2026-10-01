# Z-Salon API — Endpoint Guide

**Modules covered:** Branch Management · Customers · Appointments (Admin side) · Availability · Service Usage · Appointment Payments · Payment Receipts · Refunds · Customer Appointments (Customer side) · Public Booking

Everything below is derived from the routes, validation schemas and services in `src/`.
Where code and Swagger annotations disagree, **the code wins**.

---

## 0. Conventions

### 0.1 Base URL

```
{host}/api/v1
```

- `API_PREFIX` defaults to `/api/v1` (env var, see `.env.example`).
- Examples in this document assume `http://localhost:3000/api/v1`.
- Health check (no prefix): `GET /health` → `{ "success": true, "message": "OK", "timestamp": "<ISO>" }`

### 0.2 Authentication — what every request needs

| Token | Where | How to get it |
| --- | --- | --- |
| **Access token** (JWT) | Header `Authorization: Bearer <accessToken>` | `POST /auth/login` (or `POST /auth/register/verify`, `POST /auth/login/complete`) — returned in the response body |
| **Refresh token** | httpOnly cookie `refreshToken` (30 days) | Set automatically by login/register/complete responses. Client must send cookies (`credentials: 'include'`). Use `POST /auth/refresh` to rotate. |
| **OTP verification token** | Request body `verificationToken` | `POST /auth/otp/request` → `POST /auth/otp/verify` (used for **public booking**, not for admin APIs) |

- Access token contains `userId` + `sessionId`. Every request re-validates the session in the DB, so logout/revocation takes effect immediately.
- Access token lifetime: **15 min** (`JWT_ACCESS_EXPIRES_IN`). Refresh: **30 days**.

**Authorization layers** (each can reject with 401/403):

1. `authenticate` — valid, non-revoked session; user is `ACTIVE`.
2. `requireBusinessMembership` — caller is an `ACTIVE` `BusinessMember` of `:businessId` and the business is `ACTIVE`.
3. `requirePermission('CODE')` / `requireBranchAccess('branchId')` — role permission + branch scoping. **Note:** many appointment/payment permission checks are currently **commented out** in code, so in practice membership is the effective gate on those routes. Branch routes still enforce `BRANCH_CREATE` / `BRANCH_VIEW` etc.

### 0.3 Standard response envelope

Success:

```json
{
  "success": true,
  "message": "Appointment created successfully",
  "data": { ... },
  "code": null
}
```

List endpoints return `{ success, message, data: { data: [...], meta: { total, page, limit, totalPages } } }` or `{ success, data: [...], meta: {...} }` depending on the module (shown per endpoint below).

Error:

```json
{
  "success": false,
  "message": "Time slot conflict",
  "code": "CONFLICT",
  "details": [{ "field": "scheduledStart", "message": "..." }]
}
```

Common codes: `VALIDATION_ERROR` (400), `UNAUTHORIZED`/`INVALID_TOKEN`/`TOKEN_EXPIRED` (401), `FORBIDDEN`/`NOT_BUSINESS_MEMBER`/`INSUFFICIENT_PERMISSIONS` (403), `NOT_FOUND` (404), `CONFLICT` (409), `OTP_INVALID` (400), `INTERNAL_ERROR` (500).

### 0.4 ⏰ Time Handling (IMPORTANT — read before integrating)

| Aspect | Rule |
| --- | --- |
| **Format on the wire** | All datetimes are **ISO 8601 with offset**, e.g. `2026-09-23T14:30:00.000+03:00`. Users are in Ethiopia → **GMT+3 (Africa/Addis_Ababa)** in examples. |
| **Request input** | `scheduledStart`, `newStartTime`, `startTime`, `actualEnd`, `startDate`/`endDate` filters: Zod validates `z.string().datetime()` — i.e. **ISO 8601 required**. A bare local string like `2026-09-23 14:30` is rejected. Send either full UTC (`2026-09-23T11:30:00Z`) or ISO with offset (`2026-09-23T14:30:00+03:00`) — both are the same instant. |
| **Availability `date` param** | Plain calendar date **`YYYY-MM-DD`** (no time, no zone). It is interpreted **in the branch timezone**. |
| **Server-side interpretation** | The server stores/compares in UTC internally but computes availability, booking windows, and "now" using the **branch's IANA timezone** (`branch.timezone`, e.g. `Africa/Addis_Ababa`, default when creating a business). A "9:00 slot" is 9:00 **branch-local**, regardless of caller's device zone. |
| **Responses** | Prisma serializes `DateTime` as ISO 8601 **UTC** (`Z`). Availability endpoints additionally echo `timezone: "Africa/Addis_Ababa"` and slot times as ISO **with the branch's offset** (`+03:00`), so clients can render local wall-clock directly. |
| **Duration / scheduledEnd** | Client-supplied `scheduledEnd` is **ignored** — the server derives it from the service's effective duration for the branch. |
| **Actual (operational) times** | `actualStart`/`actualEnd` are recorded separately and **never** modify `scheduledStart`/`scheduledEnd`. |
| **Currency** | Amounts are decimal numbers in the business currency (default `ETB`). |

**Client rule of thumb:** always send full ISO strings; treat the `timezone` field returned by availability/branch endpoints as authoritative for display.

### 0.5 IDs

All resource IDs are UUID strings (`uuid` v4-ish, e.g. `550e8400-e29b-41d4-a716-446655440000`).

---

## 1. Quick auth setup (needed before anything else)

### 1.1 Login (staff/admin user)

`POST /auth/login`

```json
// body
{ "phone": "+251911000000", "password": "Str0ngPass1" }
```

Response 200:

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "<jwt>",
    "user": { "id": "…", "phone": "+251911000000", "status": "ACTIVE" }
  }
}
```

- Sets httpOnly `refreshToken` cookie.
- Use `accessToken` as `Authorization: Bearer …` for all endpoints below.
- Optional header `x-device-name: Postman` labels the session.

**Alternative OTP login:** `POST /auth/otp/request` `{ "phone": "+251911000000", "purpose": "LOGIN" }` → `POST /auth/otp/verify` `{ "phone": "…", "otp": "123456", "purpose": "LOGIN" }` → returns `{ verificationToken }` → `POST /auth/login/complete` `{ "verificationToken": "…" }` → same token response.

> The OTP service stores codes server-side; in development the SMS provider may be mocked — check server logs for the code. OTP: 4–8 digits, expires in 5 min, max 5 attempts, 60 s resend cooldown.

---

## 2. Branch Management (Admin side)

**All endpoints require:** `Authorization: Bearer <accessToken>` + active business membership. Branch-scoped routes additionally enforce branch access scope. Create/list use permission codes (`BRANCH_CREATE`, `BRANCH_VIEW`/`BUSINESS_VIEW`).

### 2.1 Create a branch

`POST /businesses/:businessId/branches`

| | |
| --- | --- |
| Auth | Bearer + membership + `BRANCH_CREATE` |
| Body | `name` (1–100, required), `address` (1–500, required), `timezone` (optional IANA, **defaults to business timezone**) |

```json
{
  "name": "Bole Branch",
  "address": "Bole Road, Addis Ababa",
  "timezone": "Africa/Addis_Ababa"
}
```

**Logic:** validates the IANA timezone (`Intl.DateTimeFormat`), enforces unique branch name per business (409 on duplicate), creates branch + default `BranchBookingConfig`, writes audit log `BRANCH_CREATED`.

**Response 201:** `{ success, message, data: { id, businessId, name, address, timezone, isActive, createdAt, … } }`

Errors: 400 invalid input/timezone · 401 · 403 not member/no permission · 404 business not found · 409 duplicate name.

### 2.2 List branches of a business

`GET /businesses/:businessId/branches` — Bearer + membership + (`BRANCH_VIEW` or `BUSINESS_VIEW`).
**Response 200:** `{ success, message, data: [ {branch}, … ] }`

### 2.3 Get branch details

`GET /:businessId/branches/:branchId` — Bearer + membership + branch access.
**Response 200:** `{ success, message, data: { …branch } }` — 404 if branch not in this business.

### 2.4 Update branch

`PATCH /:businessId/branches/:branchId` — Bearer + membership + branch access.
Body (all optional, at least one required): `name`, `address`, `timezone`, `isActive`.

```json
{ "isActive": false }
```

**Logic:** re-validates timezone when changed; 409 if new name duplicates another branch; audit `BRANCH_UPDATED`.
**Response 200:** updated branch.

### 2.5 Weekly working hours

`GET /:businessId/branches/:branchId/weekly-hours`
`PUT  /:businessId/branches/:branchId/weekly-hours`

PUT body — **exactly 7 day entries**, `dayOfWeek` 0=Sunday…6=Saturday:

```json
{
  "days": [
    { "dayOfWeek": 0, "isClosed": true,  "intervals": [] },
    { "dayOfWeek": 1, "isClosed": false, "intervals": [ { "start": "09:00", "end": "13:00" }, { "start": "14:00", "end": "18:00" } ] },
    { "dayOfWeek": 2, "isClosed": false, "intervals": [ { "start": "09:00", "end": "18:00" } ] },
    { "dayOfWeek": 3, "isClosed": false, "intervals": [ { "start": "09:00", "end": "18:00" } ] },
    { "dayOfWeek": 4, "isClosed": false, "intervals": [ { "start": "09:00", "end": "18:00" } ] },
    { "dayOfWeek": 5, "isClosed": false, "intervals": [ { "start": "09:00", "end": "18:00" } ] },
    { "dayOfWeek": 6, "isClosed": false, "intervals": [ { "start": "09:00", "end": "17:00" } ] }
  ]
}
```

**⏰ Times are local `HH:mm` (24h) wall-clock in the branch timezone.** Replaces the whole week (create-or-replace semantics).
**Response 200:** the saved weekly-hours record.

### 2.6 Date overrides (holidays / special days)

| Endpoint | Purpose |
| --- | --- |
| `POST /:businessId/branches/:branchId/date-overrides` | Create override for a date |
| `GET  /:businessId/branches/:branchId/date-overrides` | List; query: `from`, `to` (`YYYY-MM-DD`), `upcoming` (bool) |
| `PATCH /:businessId/branches/:branchId/date-overrides/:overrideId` | Update |
| `DELETE /:businessId/branches/:branchId/date-overrides/:overrideId` | Delete |

Create/update body:

```json
{ "date": "2026-09-27", "isClosed": true, "intervals": [] }
```

```json
{ "date": "2026-09-28", "isClosed": false, "intervals": [ { "start": "10:00", "end": "15:00" } ] }
```

**⏰ `date` is a branch-local calendar date; `intervals` are branch-local `HH:mm`.** An override with `isClosed: true` blocks the whole day; with intervals it *replaces* the weekly hours for that date. 409 if an override already exists for that date.

**Response 200/201:** the override record `{ id, branchId, date, isClosed, intervals, … }`.

### 2.7 Booking configuration

`GET  /:businessId/branches/:branchId/booking-config`
`PATCH /:businessId/branches/:branchId/booking-config`

PATCH body (all optional):

```json
{
  "onlineBookingEnabled": true,
  "walkInEnabled": true,
  "bookingApprovalRequired": false,
  "minimumAdvanceBookingMinutes": 30,
  "maximumAdvanceBookingDays": 60,
  "cancellationWindowMinutes": 120,
  "reschedulingEnabled": true,
  "bookingBufferMinutes": 10,
  "waitlistEnabled": false
}
```

**Logic:** these values drive the availability engine and policy checks — see §4 and §5.
**Response 200:** `{ …, onlineBookingEnabled, walkInEnabled, minimumAdvanceBookingMinutes, maximumAdvanceBookingDays, cancellationWindowMinutes, customerCancellationEnabled, customerCancellationPolicy, refundDeadlineHours, customerConfirmationEnabled, … }`

---

## 3. Customers (Admin side)

**All endpoints require:** Bearer + business membership (membership is re-checked inside services too).

> 🔎 **Walk-in workflow (high-level, Admin side):** a walk-in first needs a **customer**. If the person is already registered → **search by phone** (3.1 / 3.4). If not → **create the customer** (3.2) (or use the combined *match-or-create* endpoint 3.4 which does both in one call). Then create the walk-in appointment (§5.2).

### 3.1 Match customer by phone (search only)

`POST /businesses/:businessId/customers/match`

```json
{ "phone": "+251912345678" }
```

**Logic:** phone is normalized (E.164) and looked up against `CustomerPhone` unique per business. Read-only — creates nothing.

**Response 200:**

```json
{ "matched": true,  "customer": { "id": "…", "firstName": "Sara", "lastName": "Bekele", "status": "ACTIVE", "phones": [ … ] } }
```
or `{ "matched": false, "customer": null }`

### 3.2 Create customer

`POST /businesses/:businessId/customers`

```json
{
  "firstName": "Sara",
  "lastName": "Bekele",
  "phones": [ { "phone": "+251912345678", "isPrimary": true } ]
}
```

**Logic:** only one phone may be `isPrimary` (400 `MULTIPLE_PRIMARY_PHONES` otherwise); phones normalized + deduplicated per business (409 on duplicate phone); audit `CUSTOMER_CREATED`.

**Response 201:** `{ success, data: { id, businessId, firstName, lastName, status: "ACTIVE", phones: [ { id, phone, isPrimary } ], createdAt } }`

### 3.3 List / get / update customers

| Endpoint | Notes |
| --- | --- |
| `GET /businesses/:businessId/customers` | Query: `q` (free text), `phone`, `status` (`ACTIVE`/`ARCHIVED`), `page` (default 1), `limit` (default 20, max 100) |
| `GET /customers/:customerId` | Auth only; membership resolved internally from the customer record |
| `PATCH /customers/:customerId` | Body: `firstName`, `lastName` (either/both) |
| `PATCH /customers/:customerId/archive` | Soft-archive (status → `ARCHIVED`); archived customers can't book |

**Response 200/201:** `{ success, data: { customer } }` — list adds `meta: { total, page, limit, totalPages }`.

### 3.4 Phone management

| Endpoint | Body | Notes |
| --- | --- | --- |
| `POST /customers/:customerId/phones` | `{ "phone": "+2519…", "isPrimary": false }` | 400 invalid phone, 409 duplicate |
| `DELETE /customers/:customerId/phones/:phoneId` | — | |
| `PATCH /customers/:customerId/phones/:phoneId/primary` | — | Switches the primary flag |

### 3.5 Match-or-create (used by walk-in / phone booking flow)

Two convenient endpoints on the appointment router (§5.1) do the "search, else register" step in one call:

- `POST /businesses/:businessId/appointments/match-customer` — body `{ phone, firstName?, lastName? }`. **Finds the customer by phone; if absent, creates one** with the given names.
  Response 200: `{ success, message: "Customer created" | "Customer found", data: { customerId, isNew, … } }`
- `POST /businesses/:businessId/appointments/match-customer-phone` — body `{ phone }`. **Lookup only**; returns `{ matched: true, customerId, customer }` or `{ matched: false }`.

---

## 4. Availability (Admin & Customer side)

**Auth:** `optionalAuth` — endpoints work **without a token** (public browsing) and enrich context when a token is present. `source=PUBLIC` applies online-booking policy; `source=INTERNAL` relaxes advance-booking windows for admin/walk-in use.

### 4.1 Available slots for a day (filterable by staff)

`GET /businesses/:businessId/availability`

Query params (**all interpreted in branch timezone**):

| Param | Required | Notes |
| --- | --- | --- |
| `branchId` | ✅ | |
| `serviceId` | ✅ | must be offered at the branch |
| `date` | ✅ | **`YYYY-MM-DD`** (branch-local calendar date) |
| `staffId` | — | filter to a single staff member |
| `source` | — | `PUBLIC` (default) or `INTERNAL` |

Example: `GET /businesses/:businessId/availability?branchId=…&serviceId=…&date=2026-09-24&staffId=…`

**Logic (availability engine):**

1. Validates business/branch/service (service must have a `ServiceBranchConfig` for that branch).
2. If `source=PUBLIC` and `onlineBookingEnabled=false` → returns empty slots.
3. Enforces booking window: `minimumAdvanceBookingMinutes` / `maximumAdvanceBookingDays` from branch booking config (measured "now" **in branch timezone**; PUBLIC only).
4. Finds eligible staff (qualified for the service, active, in the branch).
5. For each staff member computes **effective intervals** = weekly hours ∩ date overrides − staff schedule overrides − breaks − time off − busy appointment windows (including their buffers and any extensions).
6. Generates slots of `effectiveDurationMinutes + bufferMinutes`, merges duplicates across staff by start time so each slot lists available staff.

**Response 200:**

```json
{
  "success": true,
  "data": {
    "date": "2026-09-24",
    "branchId": "…",
    "serviceId": "…",
    "timezone": "Africa/Addis_Ababa",
    "availableSlots": [
      {
        "startTime": "2026-09-24T09:00:00.000+03:00",
        "serviceEndTime": "2026-09-24T09:45:00.000+03:00",
        "reservedEndTime": "2026-09-24T09:55:00.000+03:00",
        "staff": [ { "id": "…", "firstName": "Hana", "lastName": "Tadesse" } ]
      }
    ]
  }
}
```

**⏰ `startTime`/`serviceEndTime`/`reservedEndTime` are ISO strings **with the branch's UTC offset** (+03:00). `reservedEndTime` includes the buffer. Empty day → `availableSlots: []` (also returned when policy blocks the day — the endpoint does not error).

### 4.2 Operating intervals for a branch date

`GET /businesses/:businessId/branches/:branchId/operating-intervals?date=YYYY-MM-DD`

**Response 200:** `{ success, data: { businessId, branchId, date, timezone, intervals: [ { "start": "<ISO+03:00>", "end": "<ISO+03:00>" } ] } }` — the merged branch hours for that date after overrides. Empty array = closed.

### 4.3 Effective intervals for one staff member

`GET /businesses/:businessId/branches/:branchId/staff/:staffId/effective-intervals?date=YYYY-MM-DD`

**Response 200:** `{ success, data: { businessId, branchId, staffId, date, timezone, intervals: [ … ] } }` — staff's bookable windows after breaks, time off and existing appointments.

### 4.4 Validate a slot

`POST /businesses/:businessId/availability/validate`

```json
{
  "branchId": "…",
  "serviceId": "…",
  "staffId": "…",
  "startTime": "2026-09-24T09:00:00.000+03:00",
  "source": "PUBLIC"
}
```

**⏰ `startTime` is full ISO 8601 (UTC or with offset).** `excludeAppointmentId` is supported internally (used when rescheduling).

**Response 200 (always 200 — check the body):**

```json
{ "valid": true, "overrideAllowed": false }
```

```json
{ "valid": false, "overrideAllowed": true, "conflictType": "STAFF_ON_BREAK", "reason": "Staff is on break during this slot" }
```

`conflictType` ∈ `BRANCH_CLOSED`, `SERVICE_NOT_OFFERED`, `STAFF_INACTIVE`, `STAFF_NOT_QUALIFIED`, `STAFF_NOT_WORKING`, `STAFF_ON_BREAK`, `STAFF_TIME_OFF`, `SLOT_OUTSIDE_BRANCH_HOURS`, `SLOT_CONFLICT`, `MIN_ADVANCE_VIOLATION`, `MAX_ADVANCE_VIOLATION`, `INVALID_START_TIME`, `BUSINESS_INACTIVE`.
`overrideAllowed: true` means the conflict is *soft* (schedule/break/conflict) and a manager could override; hard failures (branch closed, not qualified, policy violation) never allow override.

---

## 5. Appointments — Admin side

**All endpoints require:** Bearer + business membership (appointment-level routes verify membership/branch scope inside the service).

> 🧭 **The two admin booking paths:**
> - **Walk-in** → customer walks in: match-or-create customer (§3.5) → `POST …/appointments/walk-in`. Status starts at **`CHECKED_IN`**; `scheduledStart` defaults to **now in branch timezone** if omitted.
> - **Phone / staff booking** → customer calls or front desk books on their behalf: match-or-create customer → `POST …/appointments/staff-booking` with `bookingSource: "PHONE" | "STAFF"`. Status starts at **`CONFIRMED`**, unless the service requires a **deposit** — then the request must carry verified `paymentMethodId` + `amount` or it's rejected with 400.
> - (A third, **customer self-service online** path exists — see §11.)
>
> **After arrival:** change status via §5.6 (check-in → in-progress → completed) — walk-ins are already checked in. Running late? **extend** (§5.7). Finished early? **complete with `actualEnd`** or reassign staff (§5.8). Customer never arrived? **no-show** (§5.9). Customer wants a different time? **reschedule** (§5.4) — staff can do it *for* the customer.

### 5.1 Create — walk-in

`POST /businesses/:businessId/appointments/walk-in`

| Field | Required | Notes |
| --- | --- | --- |
| `branchId`, `customerId`, `serviceId`, `staffId` | ✅ | staff must be active, in this branch, **qualified for the service** |
| `scheduledStart` | — | ISO 8601; **defaults to now in branch timezone** |
| `scheduledEnd` | — | accepted but **ignored** (server computes from service duration) |
| `notes`, `internalNotes` | — | ≤ 1000 chars each |

```json
{
  "branchId": "…", "customerId": "…", "serviceId": "…", "staffId": "…",
  "scheduledStart": "2026-09-23T14:30:00.000+03:00"
}
```

**Logic:** validates everything, checks branch `walkInEnabled`, runs conflict detection (staff/branch), sets `status=CHECKED_IN` + `checkedInAt`, creates `AppointmentStaff` link and status-history entry, records `totalAmount` from effective service price. Audit `APPOINTMENT_CREATED`.

**Response 201:**

```json
{
  "success": true,
  "message": "Walk-in appointment created successfully",
  "data": {
    "id": "…", "businessId": "…", "branchId": "…", "customerId": "…",
    "service": { "id": "…", "name": "Haircut", "durationMinutes": 45, "price": "400" },
    "staff": [ { "staffId": "…", "firstName": "Hana", "lastName": "Tadesse" } ],
    "scheduledStart": "2026-09-23T11:30:00.000Z",
    "scheduledEnd": "2026-09-23T12:15:00.000Z",
    "status": "CHECKED_IN",
    "bookingSource": "WALK_IN",
    "totalAmount": "400",
    "depositAmount": null,
    "notes": null, "internalNotes": null,
    "checkedInAt": "2026-09-23T11:30:00.000Z"
  }
}
```

**⏰ note:** request may carry `+03:00`; response datetimes are UTC `Z` (see §0.4).

Errors: 400 (`VALIDATION_ERROR` — join of all validation errors, e.g. *"Staff is not qualified for this service"*), 404 business/branch/customer/service/staff missing, 409 time slot conflict.

### 5.2 Create — phone / staff booking

`POST /businesses/:businessId/appointments/staff-booking`

Body = same as walk-in **plus**:

| Field | Required | Notes |
| --- | --- | --- |
| `bookingSource` | ✅ (default `STAFF`) | `"STAFF"` or `"PHONE"` |
| `scheduledStart` | ✅ | future ISO time; advance-window policy applies (INTERNAL source) |
| `paymentMethodId`, `amount`, `paymentReference` | — | **required by the service (not the schema) when the service has a deposit policy** — a `PAID` `AppointmentPayment` is recorded atomically with the booking |

```json
{
  "branchId": "…", "customerId": "…", "serviceId": "…", "staffId": "…",
  "scheduledStart": "2026-09-24T10:00:00.000+03:00",
  "bookingSource": "PHONE",
  "notes": "Requested deep treatment"
}
```

**Logic:** validates; slot validation runs with `source=INTERNAL` (walk-in/phone can start "now"); status starts **`CONFIRMED`** (+`confirmedAt`), or the request 400s if a deposit is required and no verified payment is supplied; sends confirmation SMS (best effort).

**Response 201:** same shape as §5.1 with `status: "CONFIRMED"`, `bookingSource: "PHONE"`.

### 5.3 Get / list / update appointments

| Endpoint | Notes |
| --- | --- |
| `GET /businesses/:businessId/appointments/:appointmentId` | Single appointment (auth only on this route; access verified in service) |
| `GET /businesses/:businessId/appointments` | Filters: `branchId`, `customerId`, `serviceId`, `staffId`, `status` (`PENDING`, `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`, `EXPIRED`), `bookingSource` (`ONLINE`, `STAFF`, `PHONE`, `WALK_IN`), `startDate`, `endDate` (ISO datetimes), `page`, `limit` (≤100). Non-admin/owner members are auto-scoped to their allowed branches. |
| `PATCH /businesses/:businessId/appointments/:appointmentId` | **Notes-only update** in current code: `{ "notes": "…", "internalNotes": "…" }` (nullable). Schedule changes must use **reschedule** (§5.4); staff changes use **assign staff** (§5.8). |

List response: `{ success, message, data: { data: [appointment…], meta: { total, page, limit, totalPages } } }`.

### 5.4 Reschedule (admin/staff, incl. on behalf of a customer)

`PATCH /businesses/:businessId/appointments/:appointmentId/reschedule`

```json
{
  "newStartTime": "2026-09-25T15:00:00.000+03:00",
  "reason": "Customer called to move it later",
  "staffId": "…"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `newStartTime` | ✅ | ISO 8601 |
| `reason` | — | ≤ 500 chars, stored in status history |
| `staffId` | — | also move to another (qualified) staff member |

**Logic:** blocked for `COMPLETED`/`CANCELLED`/`NO_SHOW`/`EXPIRED` (400); new end = start + effective service duration; validates the new slot with `excludeAppointmentId` (409 on conflict); updates `scheduledStart`/`scheduledEnd`; writes history `statusFrom→statusTo` with the reason; audit `APPOINTMENT_RESCHEDULED`.

**Response 200:** updated appointment.

### 5.5 Change the booked service

`PATCH /businesses/:businessId/appointments/:appointmentId/service`

```json
{ "serviceId": "…" }
```

**Logic:** new service must be offered at the branch; recomputes duration & end time and re-validates the slot (409 if it no longer fits); updates `totalAmount`.

**Response 200:** updated appointment.

### 5.6 Status transitions (the appointment lifecycle)

`PATCH /businesses/:businessId/appointments/:appointmentId/status`

```json
{ "status": "IN_PROGRESS", "reason": "Started the haircut" }
```

```json
{ "status": "COMPLETED", "actualEnd": "2026-09-23T12:05:00.000+03:00" }
```

**Allowed transitions (state machine, enforced server-side):**

```
PENDING ──► CONFIRMED | CANCELLED | EXPIRED
CONFIRMED ──► CHECKED_IN | CANCELLED | NO_SHOW
CHECKED_IN ──► IN_PROGRESS | CANCELLED | NO_SHOW
IN_PROGRESS ──► COMPLETED | CANCELLED
COMPLETED / CANCELLED / NO_SHOW / EXPIRED ──► (terminal)
```

| Field | Notes |
| --- | --- |
| `status` | ✅ one of the enum values |
| `reason` | optional, stored in history |
| `actualEnd` | **only for `COMPLETED`** — ISO datetime of the real finish. Must be after `scheduledStart`. Defaults to *now* when omitted. Stored as `actualEnd` and **releases the staff member early** (their busy window shrinks). `scheduledStart`/`scheduledEnd` are never modified. |

**Logic:** sets the matching timestamp field (`confirmedAt`, `checkedInAt`, `inProgressAt`, `completedAt`, `cancelledAt`, `noShowAt`); `IN_PROGRESS` records `actualStart`; invalid transitions → 400 `Cannot transition from X to Y`.

**Response 200:** updated appointment with new status + timestamps.

### 5.7 Extend an in-progress appointment (work takes longer)

`POST /businesses/:businessId/appointments/:appointmentId/extend`

```json
{ "extensionMinutes": 30, "reason": "Customer added a beard trim" }
```

| Field | Rules |
| --- | --- |
| `extensionMinutes` | integer 1–480, required |
| `reason` | optional ≤ 500 |

**Logic:** appointment must be **`IN_PROGRESS`** and have a staff member (else 400). The service duration and `scheduledStart`/`scheduledEnd` are **never modified** — the extension only widens the staff member's *effective busy window* used by availability, slot validation and conflict detection (returned via `extensions`). Rejected with **409** if it would overlap the staff member's next appointment — the other appointment is never auto-moved.

**Response 200:** updated appointment including extension info.

### 5.8 Assign / reassign staff (incl. early release path)

| Endpoint | Body | Notes |
| --- | --- | --- |
| `POST /businesses/:businessId/appointments/:appointmentId/staff` | `{ "staffId": "…" }` | **Replaces** the current assignment. Validates: active, same branch, qualified for the service, slot free for the new staff (409 otherwise). |
| `DELETE /appointments/:appointmentId/staff` | — | **Currently always returns 400** — *"Appointments must have exactly one staff member. Use staff assignment to reassign instead of unassigning."* Early release is achieved by completing with `actualEnd` (§5.6), not by unassigning. |
| `POST /businesses/:businessId/appointments/:appointmentId/confirm-attendance` | — | Staff manually confirms the customer showed up (sets `confirmationStatus=CONFIRMED`); 400 if already confirmed. |

### 5.9 No-show (customer never arrived)

`POST /businesses/:businessId/appointments/:appointmentId/no-show`

Body (optional): `{ "reason": "Did not arrive" }`

**Logic:** only **`CONFIRMED`** appointments can become `NO_SHOW` (a `CHECKED_IN` customer physically arrived — 400 otherwise). Sets `status=NO_SHOW` + `noShowAt`, history reason defaults to *"Customer did not show up"*.

**Response 200:** updated appointment.

### 5.10 Cancel (admin) + create refund request

`POST /businesses/:businessId/appointments/:appointmentId/cancel`

```json
{ "reason": "Customer can't make it", "refund": true, "refundAmount": 200 }
```

| Field | Notes |
| --- | --- |
| `reason` | optional |
| `refund` | `true` to create a refund request |
| `refundAmount` | optional; **defaults to the full PAID amount** for the appointment; capped at the paid total (400 if exceeded) |

**Logic:** blocked for terminal statuses (400). If `refund=true`, sums `AppointmentPayment` rows with `status=PAID`, creates a **`RefundRequest` with status `PENDING`** for the verified amount (goes through the approval flow §8), writes history + audit `APPOINTMENT_CANCELLED_BY_BUSINESS`.

**Response 200:** cancelled appointment.

### 5.11 Status history

`GET /appointments/:appointmentId/status-history`

**Response 200:** `{ success, message, data: [ { id, appointmentId, statusFrom, statusTo, actorId, actorType: "USER"|"SYSTEM", reason, transitionTimestamp, actor: { id, phone } } ] }` (ascending).

---

## 6. Service Usage (Admin side — record what was actually done)

Recorded **after** the customer receives the service: what service was performed and which products were consumed. Allowed only for appointments in **`CHECKED_IN`, `IN_PROGRESS`, `COMPLETED`** (400 otherwise).

### 6.1 Add service usage

`POST /businesses/:businessId/appointments/:id/service-usages`

```json
{
  "serviceId": "…",
  "serviceName": "Haircut + Beard",
  "serviceDetails": "Scissor cut, fade, beard shaping",
  "productsUsed": [
    { "name": "Argan Oil", "quantity": 2, "unit": "ml" }
  ],
  "notes": "Customer prefers short sides"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `serviceName` | ✅ | trimmed, non-empty |
| `serviceId` | — | UUID, links to the catalog service |
| `serviceDetails` | — | free text |
| `productsUsed` | — | JSON array, e.g. `[{ name, quantity, unit }]` |
| `notes` | — | free text |

**Logic:** validates appointment belongs to the business; creates `ServiceUsage` linked to appointment/branch/`recordedById`.

**Response 201:** `{ success, message: "Service usage recorded", data: { id, appointmentId, businessId, branchId, serviceId, serviceName, serviceDetails, productsUsed, notes, recordedById, recordedAt } }`

### 6.2 List / update / delete

| Endpoint | Notes |
| --- | --- |
| `GET /businesses/:businessId/appointments/:id/service-usages` | Ascending by `recordedAt`; includes `recordedBy: { id, phone }` |
| `PATCH /businesses/:businessId/service-usages/:usageId` | Body: any of `serviceName`, `serviceDetails`, `productsUsed`, `notes` |
| `DELETE /businesses/:businessId/service-usages/:usageId` | Hard delete |

Responses: 200 with the record(s) / `{ success, message: "Service usage deleted", data: null }`.

---

## 7. Appointment Payments & Receipts (Admin side)

Money actually received, recorded by staff. A **payment method** must exist first (`POST /businesses/:businessId/payment-methods`, name/type required; `GET …/payment-methods` to list).

### 7.1 Record a payment

`POST /businesses/:businessId/appointments/:id/payments`

```json
{
  "paymentMethodId": "…",
  "amount": 400,
  "reference": "CBE-TXN-88123",
  "notes": "Paid at counter"
}
```

**Logic:** appointment must belong to the business (404 otherwise); payment method must belong to the business and be active (400); amount > 0 (400). Creates `AppointmentPayment` with **`status=PAID`** + `paidAt=now`; audit `APPOINTMENT_PAYMENT_RECORDED`.

**Response 201:**

```json
{
  "success": true,
  "message": "Payment recorded successfully",
  "data": {
    "id": "…", "appointmentId": "…", "businessId": "…", "branchId": "…",
    "paymentMethodId": "…", "paymentMethod": { "name": "Telebirr", "type": "MOBILE_MONEY" },
    "amount": "400", "status": "PAID", "reference": "CBE-TXN-88123", "notes": "Paid at counter",
    "recordedById": "…", "paidAt": "2026-09-23T12:20:00.000Z"
  }
}
```

### 7.2 List payments / void

| Endpoint | Notes |
| --- | --- |
| `GET /businesses/:businessId/appointments/:id/payments` | Ascending by `paidAt`; includes `paymentMethod`, `recordedBy` |
| `PATCH /businesses/:businessId/payments/:paymentId/void` | Body `{ "reason": "…" }` (**required**). Only `PAID` payments can be voided (400 otherwise). Status → `VOIDED`. |

### 7.3 Payment receipts (customer-submitted proof → admin review)

Flow: customer pays via transfer/bank, uploads a receipt image (URL), admin verifies → appointment auto-confirms and a `PAID` payment is recorded.

| Endpoint | Side | Notes |
| --- | --- | --- |
| `GET /businesses/:businessId/payment-methods/public` | customer | Active methods w/ account name/number & instructions (auth required, no membership) |
| `POST /customer/appointments/:id/receipt` | customer | See §11.3 |
| `GET /customer/appointments/:id/receipt` | customer | See §11.3 |
| `GET /businesses/:businessId/receipts/pending?branchId=…` | admin | Queue of receipts awaiting review |
| `GET /businesses/:businessId/appointments/:id/receipt` | admin | Receipt for one appointment |
| `PATCH /businesses/:businessId/appointments/:id/receipt/verify` | admin | Approve / reject — see below |

**Verify receipt** `PATCH …/receipt/verify`

```json
{ "action": "APPROVE", "verifiedAmount": 400 }
```

```json
{ "action": "REJECT", "rejectionReason": "Amount does not match transfer" }
```

**Logic:** exactly one `PENDING` receipt required (400/409 otherwise); can't approve for `CANCELLED`/`EXPIRED`/`COMPLETED`/`NO_SHOW` appointments; **APPROVE** → receipt `APPROVED`, creates `AppointmentPayment (PAID, reference "Receipt: <receiptId>")` using `verifiedAmount` or the submitted/expected amount, and **atomically confirms** a `PENDING` appointment (`status=CONFIRMED`); **REJECT** → receipt `REJECTED` with the reason (required).

**Response 200:** updated receipt `{ id, status: "APPROVED"|"REJECTED", reviewedAt, reviewedById, … }`.

---

## 8. Refunds (Admin side)

Refund requests are **created automatically** when a cancelled appointment has money to return:
- customer cancels within policy → refund request for the policy-computed amount (§11.2), or
- staff cancels with `refund: true` → refund request for the given/paid amount (§5.10).

Admins then review the queue. Statuses: `PENDING → APPROVED | REJECTED` (idempotent approve; rejected requests can't be approved and vice-versa).

### 8.1 List refund requests

`GET /businesses/:businessId/refund-requests`

Query: `status` (`PENDING` | `APPROVED` | `REJECTED`), `page` (1), `limit` (20).

**Response 200:**

```json
{
  "success": true,
  "data": [
    {
      "id": "…",
      "appointmentId": "…",
      "paymentId": null,
      "requestedAmount": "200",
      "approvedAmount": null,
      "status": "PENDING",
      "reason": "Customer cancellation",
      "requestedAt": "2026-09-23T12:30:00.000Z",
      "reviewedAt": null,
      "reviewedBy": null,
      "appointment": { "id": "…", "scheduledStart": "2026-09-24T07:00:00.000Z",
                       "customer": { "id": "…", "firstName": "Sara", "lastName": "Bekele" } }
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}
```

### 8.2 Get one

`GET /businesses/:businessId/refund-requests/:refundRequestId` — includes primary customer phone. 404 if not in this business.

### 8.3 Approve

`POST /businesses/:businessId/refund-requests/:refundRequestId/approve` — no body.

**Logic:** idempotent (approving twice returns the same record); `REJECTED` → 400. Sets `status=APPROVED`, `approvedAmount=requestedAmount`, `reviewedAt`, `reviewedById`. Sends an approval SMS to the customer (best effort).

**Response 200:** `{ success, message: "Refund approved", data: { …refund with approvedAmount } }`

### 8.4 Reject

`POST /businesses/:businessId/refund-requests/:refundRequestId/reject`

```json
{ "rejectionReason": "Service was already fully delivered" }
```

**Logic:** `APPROVED` → 400. Sets `status=REJECTED` + reviewer fields. Sends rejection SMS (best effort).

**Response 200:** `{ success, message: "Refund rejected", data: { … } }`

---

## 9. Customer Appointments (Customer side)

**Auth:** the customer logs in with the same `/auth/login` (phone + password) — customers are `User` records whose phone matches a `CustomerPhone` of the business. All routes are prefixed `/customer`. The server resolves *which customer record(s)* belong to the authenticated user; a user can only ever see/act on their own appointments.

### 9.1 List my appointments

`GET /customer/appointments`

Query: `status`, `startDate`, `endDate` (ISO datetimes), `page` (1), `limit` (≤100, default 20). `EXPIRED` appointments are hidden.

**Response 200:**

```json
{
  "success": true,
  "data": [
    {
      "id": "…",
      "business": { "id": "…", "name": "Z Salon", "logoUrl": null },
      "branch":   { "id": "…", "name": "Bole Branch", "address": "Bole Road" },
      "service":  { "id": "…", "name": "Haircut", "durationMinutes": 45, "price": "400" },
      "staff":    [ { "staffId": "…", "firstName": "Hana", "lastName": "Tadesse" } ],
      "scheduledStart": "2026-09-24T07:00:00.000Z",
      "scheduledEnd":   "2026-09-24T07:45:00.000Z",
      "status": "CONFIRMED",
      "notes": null
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}
```

### 9.2 Get one / history

| Endpoint | Response |
| --- | --- |
| `GET /customer/appointments/:appointmentId` | Same shape as above; 404 unless it's the caller's appointment |
| `GET /customer/appointments/:appointmentId/history` | Status-history entries for the appointment (same shape as §5.11) |

### 9.3 Reschedule my appointment

`PATCH /customer/appointments/:appointmentId/reschedule`

```json
{ "newStartTime": "2026-09-25T16:00:00.000+03:00", "reason": "Work meeting" }
```

**Logic:** blocked for `COMPLETED`/`CANCELLED`/`NO_SHOW`/`EXPIRED` (400); **branch must have `reschedulingEnabled=true`** (400 otherwise); new time must respect `minimumAdvanceBookingMinutes` / `maximumAdvanceBookingDays` (400); slot re-validated as `PUBLIC` with `excludeAppointmentId` (409 on conflict); keeps the same staff unless `staffId` supplied.

**Response 200:** updated appointment.

### 9.4 Cancel my appointment (may trigger a refund request)

`POST /customer/appointments/:appointmentId/cancel`

```json
{ "reason": "Something came up" }
```

**Logic (policy-driven refund engine):**

1. Terminal statuses blocked (400).
2. Branch must have `customerCancellationEnabled=true` (400 otherwise).
3. **Cancellation window:** `minutesUntilStart < cancellationWindowMinutes` → 400 *"Cannot cancel within N minutes of the appointment."*
4. Refundability of money already paid (`PAID` payments summed):
   - `customerCancellationPolicy = ALWAYS` → refund the full paid amount;
   - `= BEFORE_DEADLINE` → refund only if `hoursUntilStart ≥ refundDeadlineHours`;
   - otherwise (e.g. `NEVER`) → no refund.
5. Sets `CANCELLED` + `cancelledAt`, writes history, and — if refundable > 0 — creates a **`PENDING` RefundRequest** for the admin queue (§8).
6. Sends cancellation SMS (best effort).

**Response 200:** cancelled appointment. **Admin continues in §8.**

### 9.5 Payment receipts (customer side)

`GET /businesses/:businessId/payment-methods/public` first to show the customer where to pay.

**Submit** `POST /customer/appointments/:id/receipt`

```json
{
  "paymentMethodId": "…",
  "submittedAmount": 400,
  "receiptImageUrl": "https://res.cloudinary.com/demo/image/upload/receipt.jpg",
  "receiptImagePublicId": "receipt",
  "customerNote": "Sent via Telebirr"
}
```

- Only for **`PENDING`** appointments (deposit required / approval required bookings) — 400 otherwise.
- One active receipt per appointment: a `PENDING`/`APPROVED` receipt already present → **409**.
- Image must be a real URL (Cloudinary upload happens client-side); `receiptImagePublicId` required for deletion on reject.

**Response 201:** receipt with `status: "PENDING"` → admin verifies (§7.3).

**Check status** `GET /customer/appointments/:id/receipt` → 200 receipt or 404.

---

## 10. Public booking (no account — OTP-verified)

For a booking website/app where the visitor may not have a user account. Two steps, **no bearer token**.

### 10.1 Get an OTP verification token

```
POST /auth/otp/request   { "phone": "+251912345678", "purpose": "PHONE_VERIFICATION" }
POST /auth/otp/verify    { "phone": "+251912345678", "otp": "123456", "purpose": "PHONE_VERIFICATION" }
→ { "success": true, "data": { "verificationToken": "…" } }
```

### 10.2 Create the booking

`POST /public/businesses/:businessId/bookings`

```json
{
  "verificationToken": "…",
  "firstName": "Sara", "lastName": "Bekele", "phone": "+251912345678",
  "branchId": "…", "serviceId": "…", "staffId": "…",
  "scheduledStart": "2026-09-24T09:00:00.000+03:00",
  "notes": "Window seat please"
}
```

**Logic:** consumes the verification token (purpose `PHONE_VERIFICATION`; phone must match, else 400 `OTP_INVALID`); find-or-create customer; runs the standard creation validation with `source=PUBLIC` → online-booking policy applies (`onlineBookingEnabled`, advance windows, staff must be `CUSTOMER_CHOOSES`-eligible). Status starts `PENDING` if a deposit/approval is required, else `CONFIRMED`.

**Response 201:** appointment (same shape as §5.1). Errors: 400 invalid input/OTP · 409 slot unavailable.

### 10.3 Submit a receipt for a pending public booking

`POST /public/businesses/:businessId/appointments/:appointmentId/payment-receipts`

Body: same fields as §9.5 (`paymentMethodId`, `submittedAmount`, `receiptImageUrl`, `receiptImagePublicId`, `customerNote`). Authenticated by the fact that the booking is `PENDING` + phone was OTP-verified at booking time. Admin then verifies via §7.3.

### 10.4 Confirmation links (SMS)

Customers also receive tokenized links (no auth):

| Endpoint | Purpose |
| --- | --- |
| `GET /public/appointments/confirm/:token` | View appointment from an SMS token |
| `POST /public/appointments/confirm/:token/confirm` | Customer confirms |
| `POST /public/appointments/confirm/:token/cancel` | Customer cancels (body `{ "reason": "…" }` optional) |
| `POST /public/appointments/confirm/:token/reschedule` | Customer reschedules (body `{ "newStartTime": "<ISO>" }` required) |

---

## 11. End-to-end workflow walkthroughs

### 11.1 Walk-in (admin side) — *“first register the customer if not registered, else search”*

```
1. Customer walks in.
2. POST /businesses/:b/appointments/match-customer      { phone, firstName, lastName }
      → found?  data.isNew = false, use data.customerId
      → absent? customer is created → data.customerId
   (or two-step: match-customer-phone → if matched:false → POST /businesses/:b/customers)
3. POST /businesses/:b/appointments/walk-in             { branchId, customerId, serviceId, staffId }
      → status CHECKED_IN, scheduledStart = now (branch tz) if omitted
4. (optional) POST …/:appointmentId/status              { "status": "IN_PROGRESS" }
5. Service runs long → POST …/:appointmentId/extend     { "extensionMinutes": 30 }
   …or finish early → POST …/:appointmentId/status      { "status": "COMPLETED", "actualEnd": "<ISO>" }
6. POST …/:appointmentId/service-usages                 (record services + products used)
7. POST …/:appointmentId/payments                       (record money received)
```

### 11.2 Phone / staff booking (admin side)

```
1. Phone rings → match-or-create customer (§11.1 step 2)
2. POST …/appointments/staff-booking  { …, bookingSource: "PHONE", scheduledStart: future ISO }
      → status CONFIRMED (400 if deposit required and no verifiedPayment supplied)
3. Customer wants a different time → PATCH …/reschedule  { newStartTime }
4. Customer arrives → POST …/status { "status": "CHECKED_IN" } → …/status { "status": "IN_PROGRESS" }
   Didn't arrive? → POST …/no-show
5. Finish → …/status { "status": "COMPLETED" } → service-usages → payments (§11.1 steps 6–7)
6. Cancellation with money owed → POST …/cancel { refund: true } → RefundRequest PENDING → approve/reject (§8)
```

### 11.3 Online booking (customer side, with account)

```
1. Browse slots → GET /businesses/:b/availability?branchId&serviceId&date (optionally staffId)
2. Validate before booking → POST /businesses/:b/availability/validate
3. POST /businesses/:b/appointments   (customerId = own, staffId required)
      → status PENDING (deposit/approval required) or CONFIRMED
4. If PENDING: GET /businesses/:b/payment-methods/public → pay outside the app →
   POST /customer/appointments/:id/receipt  → admin approves (§7.3) → auto-CONFIRMED
5. Manage from the phone: GET /customer/appointments, PATCH …/reschedule, POST …/cancel
```

### 11.4 Public booking (no account)

```
1. otp/request (PHONE_VERIFICATION) → otp/verify → verificationToken
2. POST /public/businesses/:b/bookings  → appointment created, find-or-created customer
3. If PENDING → POST /public/businesses/:b/appointments/:id/payment-receipts
4. SMS confirmation link: /public/appointments/confirm/:token[/confirm|/cancel|/reschedule]
```

### 11.5 Refund lifecycle

```
Customer cancels in policy (§9.4) or staff cancels with refund (§5.10)
   → RefundRequest(PENDING, requestedAmount)
Admin: GET …/refund-requests?status=PENDING
   → POST …/:id/approve   (approvedAmount = requestedAmount, SMS to customer)
   → POST …/:id/reject    { rejectionReason }
```

---

## 12. Feedback (Admin + Customer side)

Private-by-default feedback for a completed appointment. **OWNER/ADMIN only** for all admin endpoints; `BRANCH_MANAGER` and `STAFF` are denied. Feedback is never publicly visible.

**Lifecycle:** an appointment reaching `COMPLETED` creates exactly one `FeedbackRequest` (idempotent, `UNIQUE(appointment_id)`) **if** the business setting `feedbackEnabled = true`. The customer receives a link `«FRONTEND_URL»/feedback/{raw_token}` (SMS, best-effort). The raw token is never stored or logged — only its SHA-256 hash is persisted. Requests expire **7 days** after creation.

**Status machine:** `PENDING → SUBMITTED` | `PENDING → EXPIRED`. `SUBMITTED`/`EXPIRED` are terminal in the MVP.

### 12.1 Business setting — `feedbackEnabled`

Toggle via the existing business-configuration endpoint (`PATCH /api/v1/businesses/{businessId}` with `{ "feedbackEnabled": false }`, OWNER/ADMIN). When `false`, no new requests or notifications are created. Already-created, non-expired requests **remain submittable**.

### 12.2 Customer — fetch the feedback form (no auth)

`GET /api/v1/feedback/{token}` — the token is the authorization mechanism.

Returns only enabled categories and nothing identifying the customer:

```json
{
  "success": true,
  "message": "Feedback form retrieved",
  "data": {
    "request_id": "uuid",
    "expires_at": "2026-10-02T10:00:00.000Z",
    "business": { "id": "uuid", "name": "Salon" },
    "categories": [
      { "id": "uuid", "name": "Service Quality", "description": "…", "type": "RATING", "rating_scale_min": 1, "rating_scale_max": 5, "sort_order": 1 }
    ]
  }
}
```

Errors: `404 FEEDBACK_REQUEST_NOT_FOUND` (unknown token) · `410 FEEDBACK_REQUEST_EXPIRED` (expired; request marked `EXPIRED`) · `409 FEEDBACK_ALREADY_SUBMITTED` · `409 FEEDBACK_NOT_AVAILABLE` (appointment no longer `COMPLETED`).

### 12.3 Customer — submit feedback (no auth)

`POST /api/v1/feedback/submit`

```json
{
  "token": "secure-token",
  "is_anonymous": false,
  "responses": [
    { "category_id": "uuid", "rating_value": 5 },
    { "category_id": "uuid", "text_response": "Great service!" },
    { "category_id": "uuid", "boolean_response": true }
  ]
}
```

Rules:

- Each `category_id` must belong to **this business** and be **enabled**. Otherwise `422 FEEDBACK_CATEGORY_INVALID` / `422 FEEDBACK_CATEGORY_DISABLED`.
- Response type must match the category: `RATING` → `rating_value` within `[rating_scale_min, rating_scale_max]`; `TEXT` → `text_response`; `BOOLEAN` → `boolean_response`. Wrong/missing values → `400 FEEDBACK_RESPONSE_INVALID`.
- One answer per category per submission (`400` on duplicates). Answering a subset of enabled categories is allowed.
- The submission, its responses, and `PENDING → SUBMITTED` are written in **one transaction**; concurrent submissions of the same token yield exactly one submission (the other gets `409`).

Response (201): `{ "submission_id", "is_anonymous", "submitted_at" }`. No customer fields are returned.

### 12.4 Admin — list feedback

`GET /api/v1/businesses/{businessId}/feedback` — auth + business membership. OWNER/ADMIN only.

Query: `page`, `limit` (≤100), `from_date`, `to_date` (ISO, filtered on `submitted_at`), `branch_id`, `category_id`, `is_anonymous`.

Each item (identified): `id`, `is_anonymous`, `submitted_at`, `customer { id, first_name, last_name, phone }`, `appointment { id, scheduled_start, scheduled_end, status, branch, service, staff[] }`, `responses[]`.

Each item (**anonymous**): `customer: null`, `appointment: null` — all identifying context is omitted server-side.

### 12.5 Admin — feedback detail

`GET /api/v1/businesses/{businessId}/feedback/{submissionId}` — same privacy rules as the list; records a `FEEDBACK_VIEWED` audit event (no customer identity in metadata).

### 12.6 Admin — category management

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/v1/businesses/{businessId}/feedback-categories` | Create (`name`, `type`, optional scale/description/sort_order). |
| `GET` | `/api/v1/businesses/{businessId}/feedback-categories` | List **including disabled** categories (`response_count` included). |
| `PATCH` | `/api/v1/feedback-categories/{categoryId}` | Update or disable (`isEnabled: false`). No delete. |

Validation: `RATING` requires integer `ratingScaleMin < ratingScaleMax` within `0..10`; `TEXT`/`BOOLEAN` require the scale to be `null`. Names are unique per business (`409` otherwise). Once a category has responses its `type`/scale are immutable (`409 FEEDBACK_CATEGORY_IMMUTABLE`); historical responses always survive disabling.

### 12.7 Audit events

`FEEDBACK_REQUEST_CREATED`, `FEEDBACK_SUBMITTED`, `FEEDBACK_CATEGORY_CREATED`, `FEEDBACK_CATEGORY_UPDATED`, `FEEDBACK_CATEGORY_DISABLED`, `FEEDBACK_VIEWED`. Raw tokens and customer contact details are never written to audit metadata.

---

## 13. Status & enum reference

**AppointmentStatus:** `PENDING → CONFIRMED → CHECKED_IN → IN_PROGRESS → COMPLETED`, plus `CANCELLED`, `NO_SHOW`, `EXPIRED` (terminal: COMPLETED, CANCELLED, NO_SHOW, EXPIRED).

**BookingSource:** `ONLINE` (customer, authenticated) · `STAFF` (front desk) · `PHONE` (phone booking) · `WALK_IN`.

**Initial status by source:** WALK_IN → `CHECKED_IN` · PHONE/STAFF → `CONFIRMED` · ONLINE → `CONFIRMED`, or `PENDING` when `depositRequired || bookingApprovalRequired`.

**RefundRequestStatus:** `PENDING | APPROVED | REJECTED`. **PaymentStatus:** `PAID | VOIDED`. **ReceiptStatus:** `PENDING | APPROVED | REJECTED`. **CustomerConfirmationStatus:** `PENDING | CONFIRMED | DECLINED | EXPIRED`. **ActorType:** `USER | SYSTEM`.

**Conflict types (availability validate):** see §4.4.

**Feedback:** `FeedbackCategoryType` = `RATING | TEXT | BOOLEAN`. `FeedbackRequestStatus` = `PENDING | SUBMITTED | EXPIRED`.

---

*Generated from source: `src/routes/index.ts`, module routes/validation/services under `src/modules/*`, `prisma/schema.prisma`. Companion Postman collection: `docs/Z-Salon-API.postman_collection.json`.*
