# Appointment Confirmation / Reminder / Follow-up API

Base path: `/api/v1/businesses/:businessId`

All staff endpoints require `authenticate` + `requireBusinessMembership` (member of the target business).

## 0. Development-only confirmation link

For local development, when SMS delivery is not configured, an authenticated staff member can request a fresh customer action link:

`POST /api/v1/businesses/:businessId/appointments/:appointmentId/confirmation-link`

This endpoint is disabled in production and returns `404`. It does not send an SMS.

### Response

```json
{
  "success": true,
  "data": {
    "token": "opaque-token-value",
    "confirmationUrl": "http://localhost:5173/appointments/confirm/opaque-token-value"
  }
}
```

The frontend can open `confirmationUrl` directly, or use `token` with the customer endpoints below.

---

## 1. Get appointment details (incl. reminder/follow-up state)

`GET /api/v1/businesses/:businessId/appointments/:appointmentId`

Returns the standard appointment object plus:

| Field | Type | Description |
|---|---|---|
| `needsFollowUp` | `boolean` | Whether an OPEN staff follow-up is required (deadline passed without customer confirmation). |
| `followUp` | object \| null | Current OPEN follow-up for this appointment, if any. |
| `followUp.id` | `string` | Follow-up id. |
| `followUp.status` | `OPEN` \| `RESOLVED` | Current status. |
| `followUp.outcome` | `CONFIRMED` \| `CANCELLED` \| `RESCHEDULED` \| null | Outcome once resolved. |
| `followUp.outcomeNote` | `string` \| null | Staff note attached to the outcome. |
| `followUp.staffId` | `string` \| null | Staff member who claimed/resolved it. |
| `followUp.createdAt` | `string` (ISO) | When the follow-up was raised. |
| `followUp.resolvedAt` | `string` (ISO) \| null | When it was resolved. |
| `followUp.newStartTime` | `string` (ISO) \| null | New start time if outcome was RESCHEDULED. |
| `reminders` | array | Reminder history for this appointment (see reminder history endpoint). |

---

## 2. Reminder history

`GET /api/v1/businesses/:businessId/appointments/:appointmentId/reminders`

Returns the full reminder timeline for an appointment.

### Response shape

```json
{
  "reminders": [
    {
      "id": "string",
      "type": "ack_first_prompt" | "ack_second_prompt" | "ack_deadline",
      "status": "PENDING" | "CLAIMED" | "SENT" | "FAILED" | "SKIPPED",
      "scheduleVersion": 0,
      "scheduledAt": "ISO",
      "dueAt": "ISO",
      "leasedAt": "ISO | null",
      "leasedUntil": "ISO | null",
      "claimedByWorkerId": "string | null",
      "sentAt": "ISO | null",
      "completedAt": "ISO | null",
      "lastError": "string | null",
      "providerMessageId": "string | null",
      "attempts": [
        {
          "id": "string",
          "deliveredAt": "ISO",
          "status": "SENT" | "FAILED" | "PENDING",
          "providerMessageId": "string | null",
          "error": "string | null"
        }
      ]
    }
  ]
}
```

- `type`: the reminder kind.
- `status`: current processing state.
- `attempts`: delivery attempt log (usually one SENT attempt per reminder).

---

## 3. Staff follow-up list

`GET /api/v1/businesses/:businessId/appointment-follow-ups`

List appointment follow-ups for the business.

### Query parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `branchId` | `string` | — | Filter to a specific branch. |
| `status` | `OPEN` \| `RESOLVED` | — | Filter by status. |
| `page` | `number` | `1` | Page number. |
| `limit` | `number` | `20` | Items per page. |

### Response shape

```json
{
  "followUps": [
    {
      "id": "string",
      "appointmentId": "string",
      "appointment": { /* appointment summary */ },
      "status": "OPEN" | "RESOLVED",
      "outcome": "CONFIRMED" | "CANCELLED" | "RESCHEDULED" | null,
      "outcomeNote": "string | null",
      "staffId": "string | null",
      "staffName": "string | null",
      "createdAt": "ISO",
      "resolvedAt": "ISO | null",
      "newStartTime": "ISO | null"
    }
  ],
  "total": 0,
  "page": 1,
  "limit": 20,
  "hasMore": false
}
```

---

## 4. Resolve a follow-up

`PATCH /api/v1/businesses/:businessId/appointment-follow-ups/:followUpId`

Atomically claim the follow-up (must be OPEN) and resolve it with one of the allowed outcomes.

### Request body

```json
{
  "outcome": "CONFIRMED" | "CANCELLED" | "RESCHEDULED",
  "note": "string",
  "newStartTime": "ISO string (optional, required when outcome=RESCHEDULED)",
  "staffId": "string (optional; defaults to the authenticated staff member)"
}
```

### Behavior

- Fails with an error if the follow-up is not OPEN.
- Claims the record atomically; on successful transition it is marked RESOLVED with `resolvedAt`, `outcome`, `outcomeNote`, `staffId`.
- `CONFIRMED`: confirms attendance via the existing appointment confirmation path.
- `CANCELLED`: cancels the appointment via the existing cancellation path.
- `RESCHEDULED`: reschedules the appointment. Requires `newStartTime`; bumps the reminder schedule version, cancels old reminder jobs, creates new ones for the new time, and re-evaluates whether a new follow-up is needed.
- The claim is rolled back if the underlying appointment transition fails.

### Response

Returns the updated follow-up object (same shape as in the list/endpoint 3).

---

## 5. Reopen a follow-up

`POST /api/v1/businesses/:businessId/appointment-follow-ups/:followUpId/reopen`

Reopens a RESOLVED follow-up as OPEN. A new row is created so the original resolution and its history are preserved. Rejects with an error if the follow-up is already OPEN.

### Response

Returns the newly created OPEN follow-up object.

---

## Reminder / follow-up business rules (summary)

- Reminders are only scheduled for **CONFIRMED** appointments on branches with `customerConfirmationEnabled=true`.
- First prompt default: 24h before start; second prompt: 3h before start; deadline: 2h before start.
- The second reminder is never scheduled less than 1h before start, and never before the deadline.
- No catch-up reminders: if the deadline has already passed at schedule time, a staff follow-up is raised immediately.
- The deadline is only a staff follow-up trigger; it never auto-cancels an appointment and never blocks a late customer confirmation.
- Reminder schedule version bumps on every reschedule so stale worker jobs are skipped.
- Staff follow-up outcomes are limited to `CONFIRMED`, `CANCELLED`, `RESCHEDULED` (there is no `UNREACHABLE` outcome).

---

## Customer-facing confirmation flow (context)

Customer actions go through an opaque appointment action token (not the raw link), accessed via the customer confirmation endpoints:

- `GET /api/v1/appointments/confirm/:token` — view appointment details with a server-computed `actions` policy (`viewOnly`, `canConfirm`, `canCancel`, `canReschedule`).
- `POST /api/v1/appointments/confirm/:token/confirm` — confirm from PENDING to CONFIRMED (when allowed).
- `POST /api/v1/appointments/confirm/:token/cancel` — cancel.
- `POST /api/v1/appointments/confirm/:token/reschedule` — reschedule (with a new time).

These are documented in the customer confirmation flow, not repeated here.

=======================================


The frontend does **not request the token separately**.

The token is embedded in the SMS link generated by the backend:

```text
https://frontend.example.com/appointments/confirm/TOKEN
```

When the customer clicks it, the frontend route captures `TOKEN` from the URL.

### React example

```tsx
import { useParams } from 'react-router-dom';

function AppointmentConfirmationPage() {
  const { token } = useParams<{ token: string }>();

  // token is now available
  console.log(token);

  // Call the backend using this token
}
```

Then call:

```http
GET /api/v1/public/appointments/confirm/{token}
```

For example:

```ts
const response = await fetch(
  `${API_URL}/api/v1/public/appointments/confirm/${token}`
);

const result = await response.json();
```

The frontend uses the same `token` for actions:

```ts
await fetch(
  `${API_URL}/api/v1/public/appointments/confirm/${token}/confirm`,
  { method: 'POST' }
);
```

```ts
await fetch(
  `${API_URL}/api/v1/public/appointments/confirm/${token}/cancel`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Cannot attend' })
  }
);
```

```ts
await fetch(
  `${API_URL}/api/v1/public/appointments/confirm/${token}/reschedule`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      newStartTime: '2026-10-15T10:00:00.000Z'
    })
  }
);
```

The important distinction is:

```text
Backend generates token
Backend puts token into SMS URL
Customer clicks URL
Frontend extracts token from route
Frontend sends token back to backend
```

The backend stores only a hash of the token, so the raw token cannot later be retrieved from the database. It must be delivered when the SMS link is created.

Also, your current documentation says:

```text
/api/v1/appointments/confirm/:token
```

but the actual route is mounted under `/public`, so the correct backend path is:

```text
/api/v1/public/appointments/confirm/:token
```

Created 3 todos
