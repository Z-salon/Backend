# Z-Salon API — Finance, Expense & Refunds Endpoints

**Modules covered:** Expense (categories, ledger, payments, void) · Finance Reports · Refunds (admin queue) · Appointment payment state (per-appointment financials) · Customer outstanding.

Everything below is derived from the routes, validation schemas and services in `src/`. Where code and Swagger annotations disagree, **the code wins**.

---

## 0. Conventions

### 0.1 Base URL

```
{host}/api/v1
```

All finance/expense endpoints live under `/api/v1/businesses/:businessId/...`.

### 0.2 Authentication

| Token | Where | How to get it |
| --- | --- | --- |
| Access token (JWT) | `Authorization: Bearer <accessToken>` | `POST /auth/login` — returned in response body |
| Refresh token | httpOnly cookie `refreshToken` | Set automatically by login; rotate with `POST /auth/refresh` |

- Access token contains `userId` + `sessionId`; every request re-validates the session in the DB.
- Access token lifetime **15 min**, refresh **30 days**.

Authorization layers (each can reject with 401/403):

1. `authenticate` — valid, non-revoked session; user is `ACTIVE`.
2. `requireBusinessMembership` — caller is `ACTIVE` `BusinessMember` of `:businessId`.
3. Permission codes (`FINANCE_VIEW`, `FINANCE_VIEW_REPORTS`, `REPORT_VIEW`, `FINANCE_RECORD_EXPENSE`) + branch scope (Owner/Admin or BUSINESS = all branches; BRANCH scope = own branch only).

### 0.3 Standard response envelope

Success:

```json
{ "success": true, "message": "...", "data": { ... }, "code": null }
```

Error:

```json
{
  "success": false,
  "message": "Time slot conflict",
  "code": "CONFLICT",
  "details": [{ "field": "scheduledStart", "message": "..." }]
}
```

Common codes: `VALIDATION_ERROR` (400), `UNAUTHORIZED`/`INVALID_TOKEN`/`TOKEN_EXPIRED` (401), `FORBIDDEN`/`NOT_BUSINESS_MEMBER`/`INSUFFICIENT_PERMISSIONS` (403), `NOT_FOUND` (404), `CONFLICT` (409), `INTERNAL_ERROR` (500).

### 0.4 ⏰ Time Handling (IMPORTANT)

| Aspect | Rule |
| --- | --- |
| Wire format | ISO 8601 with offset, e.g. `2026-10-15T14:30:00.000+03:00` (Ethiopia = GMT+3 / `Africa/Addis_Ababa`) |
| Request input | `from`/`to` accept **either** full ISO datetime **or** plain `YYYY-MM-DD`. Date-only bounds span **whole days in the business timezone** (`startOf('day')` → `endOf('day')`). |
| Responses | Prisma serializes `DateTime` as ISO 8601 UTC (`Z`). |
| Currency | Decimal amounts, serialized as 2-dp strings via `money()` (`toFixed(2)`). |

Client rule of thumb: always send full ISO strings; for date-only boundaries assume the business timezone.

### 0.5 IDs

All resource IDs are UUID strings.

### 0.6 Money model (the 4 reports you will actually read)

| Concept | Definition | Formula |
| --- | --- | --- |
| `totalRevenue` | Earned = final agreed amount of **COMPLETED** appointments (`completedAt` inclusive) | `SUM(finalAgreedAmount)` |
| `totalPaymentsCollected` | Verified payments (PAID / PARTIALLY_REFUNDED / REFUNDED), `paidAt` inclusive | `SUM(amount)` |
| `totalRefunds` | Completed refund requests, `completedAt` inclusive | `SUM(approvedAmount)` |
| `totalOutstanding` | **Current snapshot** = `GREATEST(finalAgreedAmount − verifiedPaid, 0)` over finalized appointments | DB raw SQL |
| `totalExpenses` | Incurred = `SUM(amount)` of non-VOIDED expenses, `expenseDate` inclusive | — |
| `totalExpensesPaid` / `totalExpensesUnpaid` | Cash basis | `SUM(amountPaid)` / `incurred − paid` |
| `netOperatingResult` | **Accrual** result | `revenue − incurredExpenses` |
| `netCashMovement` | **Cash** result, labeled separately | `(collected − completedRefunds) − expensesPaid` |

Rules that matter:

- Refunded money **never** reduces `paid` and never becomes customer debt — it lives on its own ledger.
- Pending/rejected receipts never create an `AppointmentPayment`, so they never count as collected.
- Voided payments are excluded from collected (and never affect revenue/outstanding).
- Net operating ≠ net cash. Do not mix the two.
- Database-side aggregation on every report (no client-side loops over rows).
- `getOutstandingReport` returns only rows with `outstanding > 0` (pagination by DB `COUNT(*)` + `LIMIT/OFFSET`).

---

## 1. Expense — Categories

### 1.1 Create category

`POST /businesses/:businessId/expense-categories`

Auth: Bearer + membership + `FINANCE_RECORD_EXPENSE`.

**Request body**

```json
{
  "name": "Rent",
  "description": "Studio rent",
  "isActive": true
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | ✅ | 1–100 chars; must be unique per business |
| `description` | string | — | max 1000 chars |
| `isActive` | boolean | — | defaults `true` |

**Responses**

- `201` `{ success, message, data: { id, businessId, name, description, isActive, createdAt } }`
- `400` invalid input
- `403` no `FINANCE_RECORD_EXPENSE`
- `409` duplicate name

### 1.2 List categories

`GET /businesses/:businessId/expense-categories`

Auth: Bearer + membership + view finance.

| Query | Type | Notes |
| --- | --- | --- |
| `includeInactive` | boolean | list inactive categories too |

**Response 200**

```json
{
  "success": true,
  "data": [
    {
      "id": "…",
      "businessId": "…",
      "name": "Rent",
      "description": null,
      "isActive": true,
      "createdAt": "2026-10-05T10:00:00.000Z"
    }
  ]
}
```

### 1.3 Update / deactivate category

`PATCH /businesses/:businessId/expense-categories/:categoryId`

Auth: Bearer + membership + `FINANCE_RECORD_EXPENSE`.

**Request body** (at least one field required)

```json
{ "name": "Rent Updated", "description": "Studio rent", "isActive": false }
```

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | must be unique when changed |
| `description` | string | max 1000 |
| `isActive` | boolean | — |

**Responses**: `200` updated category · `400` empty body / duplicate name / missing category · `403` · `404`.

---

## 2. Expense — Ledger

### 2.1 Record an expense

`POST /businesses/:businessId/expenses`

Auth: Bearer + membership + `FINANCE_RECORD_EXPENSE`.

**Request body**

```json
{
  "branchId": "550e8400-e29b-41d4-a716-446655440000",
  "categoryId": "550e8400-e29b-41d4-a716-446655440001",
  "amount": 500,
  "amountPaid": 500,
  "expenseDate": "2026-10-05T10:00:00.000+03:00",
  "dueDate": "2026-10-12",
  "vendor": "Ethiopia Utilities",
  "receiptNumber": "REC-1001",
  "description": "Monthly utilities",
  "notes": "Paid by bank transfer",
  "paymentMethodId": "550e8400-e29b-41d4-a716-446655440002"
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `branchId` | UUID | ✅ | validated against caller's scope |
| `categoryId` | UUID | ✅ | belongs to the business |
| `amount` | number \| string | ✅ | must be > 0 |
| `amountPaid` | number \| string | — | 0 if unpaid; cannot exceed `amount` |
| `expenseDate` | ISO date/datetime | — | defaults to now; inclusive in reports |
| `dueDate` | ISO date/datetime | — | nullable |
| `vendor` | string | — | max 255 |
| `receiptNumber` | string | — | max 100 |
| `notes` | string | — | max 2000 |
| `paymentMethodId` | UUID | — | optional, belongs to the business |

**Derived status** (server-authored):

| `amountPaid` vs `amount` | `status` |
| --- | --- |
| `0` | `UNPAID` |
| `>= amount` | `PAID` |
| in between | `PARTIALLY_PAID` |

**Responses**

- `201` `{ success, message: "Expense created", data: { id, businessId, branchId, categoryId, category: { id, name }, branch: { id, name }, amount, amountPaid, status, expenseDate, dueDate, paidAt, paymentMethod, createdById, createdAt, updatedAt } }`
- `400` invalid branch/category/amount / paymentMethod / `amountPaid > amount`
- `403` no `FINANCE_RECORD_EXPENSE`
- `404` business/role not found

Audit log: `EXPENSE_CREATED`.

### 2.2 List expenses

`GET /businesses/:businessId/expenses`

Auth: Bearer + membership + view finance.

| Query | Type | Notes |
| --- | --- | --- |
| `from` | ISO date/datetime | inclusive; business timezone |
| `to` | ISO date/datetime | inclusive |
| `branchId` | UUID | optional; validated against scope (empty = member has no branch → 0 results) |
| `categoryId` | UUID | — |
| `status` | enum `UNPAID\|PARTIALLY_PAID\|PAID\|VOIDED` | — |
| `page` | integer | default 1 |
| `limit` | integer | default 20, max 100 |

**Response 200**

```json
{
  "success": true,
  "data": [
    {
      "id": "…",
      "businessId": "…",
      "branchId": "…",
      "categoryId": "…",
      "amount": "500.00",
      "amountPaid": "500.00",
      "status": "PAID",
      "description": null,
      "vendor": null,
      "receiptNumber": null,
      "notes": null,
      "expenseDate": "2026-10-05T07:00:00.000Z",
      "dueDate": null,
      "paidAt": "2026-10-05T07:00:00.000Z",
      "voidedAt": null,
      "voidReason": null,
      "createdById": "…",
      "category": { "id": "…", "name": "Rent" },
      "branch": { "id": "…", "name": "B1" },
      "paymentMethod": { "id": "…", "name": "Bank Transfer", "type": "BANK_TRANSFER" },
      "createdBy": { "id": "…", "phone": "+251…" },
      "createdAt": "…",
      "updatedAt": "…"
    }
  ],
  "meta": { "total": 2, "page": 1, "limit": 20, "totalPages": 1 }
}
```

### 2.3 Get a single expense

`GET /businesses/:businessId/expenses/:expenseId`

Auth: Bearer + membership + view finance.

**Response 200** — same shape as the list row.

- `404` not found / not in this business

### 2.4 Update an expense

`PATCH /businesses/:businessId/expenses/:expenseId`

Auth: Bearer + membership + `FINANCE_RECORD_EXPENSE`.

**Request body** (at least one field)

```json
{
  "amount": 750,
  "description": "Updated rent description",
  "expenseDate": "2026-10-06T10:00:00.000+03:00",
  "dueDate": "2026-10-20",
  "categoryId": "550e8400-e29b-41d4-a716-446655440003",
  "paymentMethodId": "550e8400-e29b-41d4-a716-446655440002"
}
```

**Rules**

- Cannot update a `VOIDED` expense (`400`).
- `amount` cannot go below `amountPaid` already recorded.
- Changing `status` is derived from the new `amount` vs `amountPaid`.
- `amountPaid` itself is **not** settable via this route — use `POST …/payments`.

**Responses**: `200` updated expense · `400` · `403` · `404`.

Audit log: `EXPENSE_UPDATED`.

### 2.5 Record cash paid against an expense

`POST /businesses/:businessId/expenses/:expenseId/payments`

Auth: Bearer + membership + `FINANCE_RECORD_EXPENSE`.

**Request body**

```json
{
  "amount": 100,
  "paidAt": "2026-10-05T11:30:00.000+03:00",
  "paymentMethodId": "550e8400-e29b-41d4-a716-446655440002"
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `amount` | number \| string | > 0; cannot push `amountPaid` past `amount` |
| `paidAt` | ISO date/datetime | defaults to now |
| `paymentMethodId` | UUID | optional |

**Derived status**: `UNPAID` → `PARTIALLY_PAID` → `PAID` as `amountPaid` catches up.

**Responses**

- `200` `{ success, message: "Expense payment recorded", data: { …updated expense } }`
- `400` void status, payment amount invalid, overpay
- `403` · `404`

Audit log: `EXPENSE_PAYMENT_RECORDED`.

### 2.6 Void an expense

`POST /businesses/:businessId/expenses/:expenseId/void`

Auth: Bearer + membership + `FINANCE_RECORD_EXPENSE`.

**Request body**

```json
{ "reason": "Duplicate entry" }
```

| Field | Type | Notes |
| --- | --- | --- |
| `reason` | string | max 500 |

**Effect**

- Soft delete: `status = VOIDED`, `voidedAt`, `voidReason`.
- Non-voided expenses only; repeating the call is **idempotent** and returns the record.
- Excluded from all finance reports (`status <> 'VOIDED'`).
- Existing `amountPaid` is preserved but no longer counts toward `totalExpensesPaid`.

**Responses**: `200` `{ success, message: "Expense voided", data: { …voided expense } }` · `400` already voided / voiding a voided record is fine (idempotent) · `403` · `404`.

Audit log: `EXPENSE_VOIDED`.

---

## 3. Finance Reports (GET-only)

Base: `GET /api/v1/businesses/:businessId/finance/{report}`

Common queries: `from`, `to` (ISO date or datetime; date-only spans the whole day in the business timezone), `branchId` (optional; validated against caller scope).

Authentication: Bearer + `requireBusinessMembership` + one of `FINANCE_VIEW`, `FINANCE_VIEW_REPORTS`, `REPORT_VIEW`.

Status field shown when relevant:

```
PENDING → APPROVED → COMPLETED   (REJECTED is a dead-end; each transition is idempotent)
```

---

### 3.1 Summary

`GET /businesses/:businessId/finance/summary`

**Response 200**

```json
{
  "success": true,
  "message": "Financial summary retrieved",
  "data": {
    "period": {
      "from": "2026-10-15T00:00:00.000+03:00",
      "to": "2026-10-15T23:59:59.999+03:00",
      "timezone": "Africa/Addis_Ababa"
    },
    "filters": {
      "branchId": null,
      "allBranches": true
    },
    "summary": {
      "totalRevenue": "4000.00",
      "totalPaymentsCollected": "3300.00",
      "totalRefunds": "500.00",
      "totalOutstanding": "1100.00",
      "totalExpenses": "800.00",
      "totalExpensesPaid": "500.00",
      "totalExpensesUnpaid": "300.00",
      "netOperatingResult": "3200.00",
      "netCashMovement": "2300.00",
      "revenueBasis": "EARNED",
      "transactionCount": 3,
      "appointmentCount": 3,
      "expenseCount": 2
    },
    "breakdowns": {
      "byBranch": [
        {
          "branchId": "…",
          "branchName": "B1",
          "revenue": "2000.00",
          "collected": "1300.00",
          "refunds": "0.00",
          "expenses": "500.00",
          "expensesPaid": "500.00",
          "netOperatingResult": "1500.00"
        }
      ],
      "byService": [
        { "serviceId": "…", "serviceName": "Trim", "amount": "4000.00", "count": 3 }
      ],
      "byPaymentMethod": [
        { "paymentMethodId": "…", "paymentMethodName": "Telebirr", "paymentMethodType": "MOBILE_MONEY", "amount": "3300.00", "count": 3 }
      ],
      "byExpenseCategory": [
        {
          "categoryId": "…",
          "categoryName": "Rent",
          "amount": "500.00",
          "amountPaid": "500.00",
          "count": 1
        }
      ],
      "byDate": [
        {
          "date": "2026-10-15",
          "revenue": "4000.00",
          "collected": "3300.00",
          "refunds": "500.00",
          "expenses": "800.00"
        }
      ]
    }
  }
}
```

### 3.2 Revenue

`GET /businesses/:businessId/finance/revenue`

**Response 200**

```json
{
  "success": true,
  "message": "Revenue report retrieved",
  "data": {
    "period": { "from": "…", "to": "…", "timezone": "…" },
    "filters": { "branchId": null },
    "totalRevenue": "4000.00",
    "appointmentCount": 3,
    "breakdowns": {
      "byBranch": [{ "branchId": "…", "branchName": "B1", "revenue": "2000.00", "count": 2 }],
      "byService": [{ "serviceId": "…", "serviceName": "Trim", "amount": "4000.00", "count": 3 }],
      "byDate": [{ "date": "2026-10-15", "revenue": "4000.00" }]
    }
  }
}
```

### 3.3 Collections

`GET /businesses/:businessId/finance/collections`

**Response 200**

```json
{
  "success": true,
  "message": "Collection report retrieved",
  "data": {
    "period": { "from": "…", "to": "…", "timezone": "…" },
    "filters": { "branchId": null },
    "totalCollected": "3300.00",
    "totalRefunds": "500.00",
    "netCollected": "2800.00",
    "transactionCount": 3,
    "breakdowns": {
      "byPaymentMethod": [{ "paymentMethodId": "…", "paymentMethodName": "Telebirr", "paymentMethodType": "MOBILE_MONEY", "amount": "3300.00", "count": 3 }],
      "byBranch": [{ "branchId": "…", "branchName": "B1", "collected": "1300.00", "refunds": "0.00" }],
      "byRecordedBy": [{ "recordedById": "…", "recordedByPhone": "+251…", "amount": "3300.00", "count": 3 }],
      "byDate": [{ "date": "2026-10-15", "collected": "3300.00" }]
    }
  }
}
```

### 3.4 Refunds

`GET /businesses/:businessId/finance/refunds`

Only **COMPLETED** refunds are cash out (`completedRefundAmount` / `completedRefundCount`). `requestedAmount` is reported per status for the queue view.

**Response 200**

```json
{
  "success": true,
  "message": "Refund report retrieved",
  "data": {
    "period": { "from": "…", "to": "…", "timezone": "…" },
    "filters": { "branchId": null },
    "completedRefundAmount": "500.00",
    "completedRefundCount": 1,
    "byStatus": {
      "PENDING": { "count": 0, "requestedAmount": "0.00", "approvedAmount": "0.00" },
      "APPROVED": { "count": 0, "requestedAmount": "0.00", "approvedAmount": "0.00" },
      "REJECTED": { "count": 0, "requestedAmount": "0.00", "approvedAmount": "0.00" },
      "COMPLETED": { "count": 1, "requestedAmount": "500.00", "approvedAmount": "500.00" }
    },
    "byBranch": [{ "branchId": "…", "branchName": "B1", "amount": "500.00", "count": 1 }]
  }
}
```

### 3.5 Outstanding

`GET /businesses/:businessId/finance/outstanding`

Current snapshot of what customers owe. Rows only where `outstanding > 0`.

**Response 200**

```json
{
  "success": true,
  "message": "Outstanding report retrieved",
  "data": {
    "asOf": "2026-10-05T10:00:00.000Z",
    "filters": { "branchId": null },
    "totalOutstanding": "1100.00",
    "appointments": [
      {
        "appointmentId": "…",
        "branchId": "…",
        "customerId": "…",
        "customerName": "Abebe Kebede",
        "status": "COMPLETED",
        "scheduledStart": "2026-10-15T07:00:00.000Z",
        "originalAmount": "1000.00",
        "finalAgreedAmount": "1000.00",
        "verifiedPaid": "300.00",
        "outstanding": "700.00"
      }
    ],
    "meta": { "total": 2, "page": 1, "limit": 20, "totalPages": 1 }
  }
}
```

- `page` default 1 · `limit` default 20, max 100.
- `outstanding` = `GREATEST(finalAgreedAmount − SUM(verified paid), 0)`; verified paid includes `PAID`, `PARTIALLY_REFUNDED`, `REFUNDED` payments.
- Reuses the canonical per-appointment `getAppointmentFinancials` for each row.

### 3.6 Expenses

`GET /businesses/:businessId/finance/expenses`

**Response 200**

```json
{
  "success": true,
  "message": "Expense report retrieved",
  "data": {
    "period": { "from": "…", "to": "…", "timezone": "…" },
    "filters": { "branchId": null },
    "totalExpenses": "800.00",
    "totalExpensesPaid": "500.00",
    "totalExpensesUnpaid": "300.00",
    "expenseCount": 2,
    "breakdowns": {
      "byCategory": [
        { "categoryId": "…", "categoryName": "Rent", "amount": "500.00", "amountPaid": "500.00", "count": 1 }
      ],
      "byBranch": [
        { "branchId": "…", "branchName": "B1", "amount": "500.00", "amountPaid": "500.00", "count": 1 }
      ],
      "byDate": [
        { "date": "2026-10-15", "expenses": "800.00", "expensesPaid": "500.00" }
      ]
    }
  }
}
```

---

## 4. Refunds (admin queue — payment module)

Base: `GET /api/v1/businesses/:businessId/refund-requests`

Refund request statuses live in `src/modules/payment/services/refund-request.service.ts` (canon: `PENDING → APPROVED → COMPLETED`; `REJECTED` is a dead end). The **report** (`GET …/finance/refunds`) only counts `COMPLETED` as cash out.

> Note: `POST …/refund-requests` creates a request manually. In the normal flow requests are created automatically when an appointment is cancelled with `refund: true` (§5.10) or by the customer cancellation policy (§9). The admin queue below is the full CRUD surface.

### 4.1 List

`GET /businesses/:businessId/refund-requests`

| Query | Type | Notes |
| --- | --- | --- |
| `status` | `PENDING\|APPROVED\|REJECTED\|COMPLETED` | filter |
| `page` | integer | default 1 |
| `limit` | integer | default 20 |

**Response 200**

```json
{
  "success": true,
  "message": "Refund requests retrieved",
  "data": [
    {
      "id": "…",
      "appointmentId": "…",
      "paymentId": null,
      "requestedAmount": "200.00",
      "approvedAmount": null,
      "status": "PENDING",
      "reason": "Customer cancellation",
      "requestedAt": "2026-10-05T10:00:00.000Z",
      "reviewedAt": null,
      "reviewedBy": null,
      "completedAt": null,
      "completedBy": null,
      "appointment": {
        "id": "…",
        "scheduledStart": "2026-10-05T07:00:00.000Z",
        "branchId": "…",
        "customer": { "id": "…", "firstName": "Abebe", "lastName": "Kebede" }
      }
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}
```

### 4.2 Get one

`GET /businesses/:businessId/refund-requests/:refundRequestId`

Auth: Bearer + membership + optional branch scope.

**Response 200**

Same row shape as the list, plus `reviewedBy`/`completedBy` and the full appointment + primary customer phone.

- `404` not in this business

### 4.3 Approve

`POST /businesses/:businessId/refund-requests/:refundRequestId/approve`

Auth: Bearer + membership + branch scope.

No body.

**Logic**

- Idempotent: approving an already `APPROVED` request returns the current record.
- `PENDING → APPROVED`: sets `approvedAmount` (defaults to `requestedAmount`), `reviewedAt`, `reviewedById`, sends an approval SMS (best effort).
- `REJECTED → 400`; already `COMPLETED` → 400.
- Runs under a row lock on the appointment payments; re-checks the refundable balance before commit.

**Response 200**

```json
{
  "success": true,
  "message": "Refund approved",
  "data": {
    "id": "…",
    "appointmentId": "…",
    "paymentId": null,
    "requestedAmount": "200.00",
    "approvedAmount": "200.00",
    "status": "APPROVED",
    "reason": "…",
    "requestedAt": "…",
    "reviewedAt": "…",
    "reviewedBy": { "id": "…", "phone": "+251…" },
    "completedAt": null,
    "completedBy": null,
    "appointment": { … }
  }
}
```

### 4.4 Reject

`POST /businesses/:businessId/refund-requests/:refundRequestId/reject`

Auth: Bearer + membership + branch scope.

**Request body**

```json
{ "rejectionReason": "Service was already fully delivered" }
```

| Field | Type | Notes |
| --- | --- | --- |
| `rejectionReason` | string | required |

**Logic**

- `APPROVED → REJECTED`: sets `status`, `reviewedAt`, `reviewedById`, reason; sends rejection SMS (best effort).
- `REJECTED → 400` (idempotent); already `COMPLETED` → 400.

**Response 200**

```json
{
  "success": true,
  "message": "Refund rejected",
  "data": { "…same row shape as list…", "reviewedAt": "…", "reviewedBy": { "id": "…", "phone": "+251…" } }
}
```

### 4.5 Get refundable balance

`GET /businesses/:businessId/appointments/:appointmentId/refundable`

Auth: Bearer + membership + branch scope.

**Response 200**

```json
{
  "success": true,
  "message": "Refundable amount retrieved",
  "data": {
    "appointmentId": "…",
    "originalAmount": "1000.00",
    "finalAgreedAmount": "1000.00",
    "finalized": true,
    "verifiedPaid": "300.00",
    "outstanding": "700.00",
    "refunded": "0.00",
    "refundReserved": "0.00",
    "refundable": "700.00",
    "policyType": "PARTIAL_REFUND",
    "refundPercentage": 50
  }
}
```

- `refundable` = `policyRefundCap(policyType, refundPercentage, verifiedPaid) − refunded − refundReserved`.
- Policy resolution order: appointment override → appointment creation-time snapshot → branch booking config.
- Inherits the same permission/branch scope as the refund routes.

### 4.6 Create a refund request (manual)

`POST /businesses/:businessId/refund-requests`

Auth: Bearer + membership + branch scope.

**Request body**

```json
{
  "appointmentId": "550e8400-e29b-41d4-a716-446655440000",
  "amount": 200,
  "paymentId": "550e8400-e29b-41d4-a716-446655440001",
  "reason": "Customer cancellation"
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `appointmentId` | UUID | ✅ required |
| `amount` | number | optional; defaults to the full refundable balance |
| `paymentId` | UUID | optional; the `AppointmentPayment` this refund is tied to |
| `reason` | string | optional |

**Validation**

- Appointment must belong to the business; caller must have branch scope.
- Refund policy must not be `NO_REFUND` (override → snapshot → branch config).
- Status must be `CANCELLED`, `NO_SHOWN` or `COMPLETED`.
- `requestedAmount` must be `> 0` and `<= refundable`.
- `paymentId`, if given, must belong to the appointment and not be `VOIDED`.

**Responses**

- `201` `{ success, message: "Refund request created", data: { …refundRequest } }`
- `400` policy / eligibility / amount
- `403` · `404`

### 4.7 Complete a refund (money moved out)

`POST /businesses/:businessId/refund-requests/:refundRequestId/complete`

Auth: Bearer + membership + branch scope.

**Request body**

```json
{
  "amount": 200,
  "reference": "TB-PAY-88123",
  "note": "Transferred to account 12345"
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `amount` | number | optional; defaults to `approvedAmount` |
| `reference` | string | optional — your transfer reference |
| `note` | string | optional |

**Logic**

- Only `APPROVED` requests can be completed; `COMPLETED` is idempotent.
- `amount` cannot exceed `approvedAmount`.
- Moves money: applies the amount to the appointment's verified payments (oldest first), sets `status = COMPLETED`, `completedAt`, `completedById`.

**Response 200**

```json
{
  "success": true,
  "message": "Refund completed",
  "data": { "…same row shape as list…", "status": "COMPLETED", "completedAt": "…", "completedBy": { "id": "…", "phone": "+251…" } }
}
```

---

## 5. Reference — canonical money helpers (`src/modules/payment/services/payment-finance.helpers.ts`)

These are the functions every endpoint and report shares. Never re-implement this logic.

| Export | Signature | Role |
| --- | --- | --- |
| `toDecimal` | `(value) → Prisma.Decimal` | serialize null/undefined → `0`; decimal-safe |
| `VERIFIED_PAYMENT_STATUSES` | `AppointmentPaymentStatus[]` | `PAID | PARTIALLY_REFUNDED | REFUNDED` — "money really received" |
| `ACTIVE_REFUND_STATUSES` | `RefundRequestStatus[]` | `PENDING | APPROVED` — money reserved, not yet out |
| `lockAppointmentPayments` | `(db, appointmentId)` | row lock + select, prevents double-refund races |
| `getVerifiedPaidTotal` | `(db, appointmentId) → Decimal` | sum of verified payments |
| `getRefundedTotal` | `(db, appointmentId) → Decimal` | sum of `refundedAmount` on COMPLETED refunds |
| `getActiveRefundReservations` | `(db, appointmentId, exclude?)` | sum of `approvedAmount ?? requestedAmount` across PENDING/APPROVED |
| `policyRefundCap` | `(policyType, percentage, verifiedPaid) → Decimal` | `NO_REFUND → 0` · `FULL_REFUND → verifiedPaid` · `PARTIAL_REFUND → verifiedPaid × pct/100` |
| `resolveEffectiveRefundPolicy` | `(appointment, branchPolicy) → { policyType, refundPercentage, refundDeadlineHours, isOverridden }` | override → snapshot → branch config |
| `getEffectiveRefundPolicyForFinancials` | `(db, appointmentId) → { policyType, refundPercentage }` | canonical policy resolver |
| `getAppointmentFinancials` | `(db, appointmentId, options?) → AppointmentFinancials` | **one calculation** for outstanding/refundable/verifiedPaid/refunded/refundReserved |

`AppointmentFinancials`:

```
{
  appointmentId,
  originalAmount,          // totalAmount
  finalAgreedAmount,       // null if not finalized
  finalized: boolean,
  verifiedPaid,
  outstanding,             // GREATEST(finalAgreedAmount − verifiedPaid, 0)
  refunded,
  refundReserved,
  refundable,              // cap − refunded − reserved, floor 0
}
```

---

## 6. Reference — canonical refund lifecycle

| Status | What it means | Money movement |
| --- | --- | --- |
| `PENDING` | Requested, awaiting review | None |
| `APPROVED` | Authorized; admin must `complete` to move money | `approvedAmount` reserved on the appointment's refundable balance (never counted as paid/refunded) |
| `COMPLETED` | Confirmed transfer out of Z-Salon | Money moved to the appointment's payments (`refundedAmount` on each payment); the completed refund amount **never** reduces `paid` or becomes customer debt |
| `REJECTED` | Dead end; can't approve/reject twice | None |

Money rules:

- Refunded money lives on its own ledger (`AppointmentPayment.refundedAmount` + `RefundRequest`). It does **not** reduce `paid` and does **not** increase `outstanding`.
- Eligible appointment statuses: `CANCELLED`, `NO_SHOW`, `COMPLETED`.
- Only `COMPLETED` counts as a refund report entry and as a cash outflow.
- `APPROVED` does **not** move money. `complete` does, and is idempotent.

---

## 7. Key endpoint cross-reference

| Domain | Endpoint | Controller / Service |
| --- | --- | --- |
| Expense categories | `POST …/expense-categories` · `GET …/expense-categories` · `PATCH …/expense-categories/:id` | `expense-category.controller` / `expense-category.service` |
| Expense ledger | `POST …/expenses` · `GET …/expenses` · `GET …/expenses/:id` · `PATCH …/expenses/:id` · `POST …/expenses/:id/payments` · `POST …/expenses/:id/void` | `expense.controller` / `expense.service` |
| Reports (GET) | `…/finance/summary` · `…/finance/revenue` · `…/finance/collections` · `…/finance/refunds` · `…/finance/outstanding` · `…/finance/expenses` | `finance-report.controller` / `finance-report.service` |
| Refunds (CRUD) | `GET …/refund-requests` · `GET …/refund-requests/:id` · `POST …/refund-requests/:id/approve` · `POST …/refund-requests/:id/reject` · `GET …/appointments/:id/refundable` · `POST …/refund-requests` · `POST …/refund-requests/:id/complete` | `refund-request.controller` / `refund-request.service` |
| Canonical money | `GET …/appointments/:id/financials` · `GET …/customers/:customerId/outstanding` | `appointment-payment.controller` / `appointment-payment.service` |

---

## 8. Example sessions

### A. Owner views the full finance picture for one month

```
GET /businesses/{businessId}/finance/summary?from=2026-09-01&to=2026-09-30
```

### B. Branch manager sees only their branch

```
GET /businesses/{businessId}/finance/outstanding?branchId={theirBranchId}
GET /businesses/{businessId}/finance/expenses?from=2026-09-01&to=2026-09-30
```

### C. Admin approves a refund then confirms the transfer

```
POST /businesses/{businessId}/refund-requests/{refundRequestId}/approve
POST /businesses/{businessId}/refund-requests/{refundRequestId}/complete
{ "amount": 200, "reference": "TB-PAY-88123", "note": "Transferred" }
```

### D. Record and pay down an expense

```
POST /businesses/{businessId}/expenses                    { "branchId": "…", "categoryId": "…", "amount": 500 }
POST /businesses/{businessId}/expenses/{expenseId}/payments { "amount": 100 }
POST /businesses/{businessId}/expenses/{expenseId}/payments { "amount": 400 }   → status becomes PAID
```

### E. Customer owes money — see the outstanding balance

```
GET /businesses/{businessId}/customers/{customerId}/outstanding
```

---

## 9. Tests

`tests/finance-report.test.ts` — 40 checks covering revenue/collected/refunds/outstanding/expenses, date boundaries, manager isolation, voided-pending exclusions, paid/unpaid split, expense lifecycle (PAID / PARTIALLY_PAID / overpay rejection), plus the untouched baselines `tests/finance-refund.test.ts` (37) and `tests/refund-policy-override.test.ts` (28).

Run:

```
npx ts-node --transpile-only tests/finance-report.test.ts
```

(Tests hit the remote Neon DB, so they are intentionally slow; type-check and schema validation stay fast.)

```
npx tsc --noEmit
npx prisma validate
```
