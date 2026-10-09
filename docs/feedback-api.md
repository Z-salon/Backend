# Z-Salon Feedback Module — API Reference

> Complete API reference for the customer feedback system. Covers public
> customer-facing endpoints, admin management endpoints, feedback categories,
> business settings, and request lifecycle management.

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Public (Customer-Facing) Endpoints](#public-customer-facing-endpoints)
   - [GET /api/v1/feedback/:token](#get-apiv1feedbacktoken)
   - [POST /api/v1/feedback/submit](#post-apiv1feedbacksubmit)
4. [Admin Endpoints](#admin-endpoints)
   - [Feedback Settings](#feedback-settings)
     - [GET /api/v1/businesses/:businessId/feedback/settings](#get-settings)
     - [PATCH /api/v1/businesses/:businessId/feedback/settings](#patch-settings)
   - [Feedback Categories](#feedback-categories)
     - [POST /api/v1/businesses/:businessId/feedback-categories](#post-categories)
     - [GET /api/v1/businesses/:businessId/feedback-categories](#get-categories)
     - [PATCH /api/v1/feedback-categories/:categoryId](#patch-category)
   - [Feedback Requests (per Appointment)](#feedback-requests)
     - [GET /api/v1/businesses/:businessId/appointments/:appointmentId/feedback-request](#get-request)
     - [POST /api/v1/businesses/:businessId/appointments/:appointmentId/feedback-request](#post-request)
     - [POST …/feedback-request/revoke](#post-revoke)
   - [Feedback Inbox](#feedback-inbox)
     - [GET /api/v1/businesses/:businessId/feedback](#get-feedback-list)
     - [GET /api/v1/businesses/:businessId/feedback/:submissionId](#get-feedback-detail)
5. [Data Models & Enums](#data-models--enums)
6. [Error Codes](#error-codes)
7. [Security & Privacy](#security--privacy)

---

## Overview

The feedback module enables salon businesses to collect structured customer
feedback after completed appointments. The flow is:

```
Appointment completed
  → FeedbackRequest created (with secure one-time token)
  → SMS/link sent to customer
  → Customer opens form (public endpoint, token = auth)
  → Customer submits feedback (one submission per request)
  → Admin reviews submissions in inbox
```

Key design principles:

- **One request per appointment** — enforced by a `UNIQUE(appointmentId)` constraint.
- **Token-based customer access** — no login required; the token IS the authorization.
- **Hash-only token storage** — raw tokens are never stored in plaintext. An AES-256-GCM encrypted copy is kept for admin link retrieval.
- **Privacy-first anonymous mode** — when `is_anonymous=true`, the admin API never serializes customer or appointment context.
- **Idempotent operations** — request generation, submission (with idempotency keys), and revocation are all safe to retry.

---

## Authentication

| Endpoint type | Auth mechanism |
| --- | --- |
| **Public** (`/feedback/*`) | Token in URL path or request body. No bearer token required. |
| **Admin** (`/businesses/:businessId/*`) | `Authorization: Bearer <access_token>` + active business membership with `OWNER` or `ADMIN` system role (or explicit `FEEDBACK_VIEW` / `FEEDBACK_MANAGE` permission). |

Admin endpoints additionally require the `requireBusinessMembership` middleware,
which validates the caller belongs to the specified business.

### Permission Matrix

| Action | OWNER | ADMIN | BRANCH_MANAGER | STAFF |
| --- | :---: | :---: | :---: | :---: |
| View feedback settings | ✅ | ✅ | ❌ | ❌ |
| Update feedback settings | ✅ | ✅ | ❌ | ❌ |
| Create/update categories | ✅ | ✅ | ❌ | ❌ |
| List categories | ✅ | ✅ | ❌ | ❌ |
| View feedback request | ✅ | ✅ | ❌ | ❌ |
| Ensure/revoke request | ✅ | ✅ | ❌ | ❌ |
| List/view submissions | ✅ | ✅ | ❌ | ❌ |

> Custom roles can be granted `FEEDBACK_VIEW` or `FEEDBACK_MANAGE` permissions
> to extend access beyond OWNER/ADMIN. `FEEDBACK_MANAGE` implies `FEEDBACK_VIEW`.

---

## Public (Customer-Facing) Endpoints

### GET /api/v1/feedback/:token

Retrieve the feedback form for a given token. Returns enabled categories only.

**Parameters:**

| Name | In | Type | Required | Description |
| --- | --- | --- | :---: | --- |
| `token` | path | `string` | ✅ | The raw feedback token from the customer link |

**Success Response (200):**

```json
{
  "success": true,
  "message": "Feedback form retrieved",
  "data": {
    "request_id": "uuid",
    "expires_at": "2026-10-22T10:00:00.000Z",
    "business": {
      "id": "uuid",
      "name": "Z-Salon Downtown"
    },
    "categories": [
      {
        "id": "uuid",
        "name": "Service Quality",
        "description": "How satisfied were you with the service?",
        "type": "RATING",
        "rating_scale_min": 1,
        "rating_scale_max": 5,
        "sort_order": 1
      },
      {
        "id": "uuid",
        "name": "Comments",
        "description": null,
        "type": "TEXT",
        "rating_scale_min": null,
        "rating_scale_max": null,
        "sort_order": 2
      }
    ]
  }
}
```

**Error Responses:**

| Status | Code | Condition |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Empty or missing token |
| 404 | `FEEDBACK_REQUEST_NOT_FOUND` | No request matches the token hash |
| 409 | `FEEDBACK_ALREADY_SUBMITTED` | Feedback was already submitted |
| 409 | `FEEDBACK_NOT_AVAILABLE` | Appointment is no longer COMPLETED |
| 410 | `FEEDBACK_REQUEST_EXPIRED` | Token has expired |
| 410 | `FEEDBACK_REQUEST_REVOKED` | Request was revoked by admin |

> **Privacy:** The form response never includes customer identity, appointment details,
> branch, staff, or any internal business IDs beyond the category IDs.

---

### POST /api/v1/feedback/submit

Submit customer feedback. Creates one `FeedbackSubmission` and its `FeedbackResponse` records atomically, then marks the request as `SUBMITTED`.

**Request Body:**

```json
{
  "token": "abc123...",
  "is_anonymous": false,
  "idempotency_key": "client-generated-uuid",
  "responses": [
    {
      "category_id": "uuid",
      "rating_value": 5
    },
    {
      "category_id": "uuid",
      "text_response": "Excellent service, very professional!"
    },
    {
      "category_id": "uuid",
      "boolean_response": true
    }
  ]
}
```

| Field | Type | Required | Description |
| --- | --- | :---: | --- |
| `token` | `string` | ✅ | Raw feedback token |
| `is_anonymous` | `boolean` | ❌ | Default `false`. When `true`, admin views will not show customer/appointment context. |
| `idempotency_key` | `string` | ❌ | Client-generated unique key for safe retries (max 200 chars) |
| `responses` | `array` | ✅ | At least 1, max 50 response objects |
| `responses[].category_id` | `string (uuid)` | ✅ | ID of the feedback category |
| `responses[].rating_value` | `integer` | Conditional | Required for `RATING` categories. Must be within `[ratingScaleMin, ratingScaleMax]` |
| `responses[].text_response` | `string` | Conditional | Required for `TEXT` categories. Non-empty, max 5000 chars |
| `responses[].boolean_response` | `boolean` | Conditional | Required for `BOOLEAN` categories |

**Headers (optional):**

| Header | Description |
| --- | --- |
| `Idempotency-Key` | Alternative to the body field; header takes precedence |

**Success Response (201):**

```json
{
  "success": true,
  "message": "Feedback submitted successfully",
  "data": {
    "submission_id": "uuid",
    "is_anonymous": false,
    "submitted_at": "2026-10-15T14:30:00.000Z"
  }
}
```

**Idempotent Replay (200-equivalent via 201):**

If the same `idempotency_key` is sent with an identical payload, the original
submission is returned without creating a duplicate.

**Error Responses:**

| Status | Code | Condition |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Missing token, empty responses, duplicate category in one submission |
| 400 | `FEEDBACK_RESPONSE_INVALID` | Wrong value type for the category (e.g., `rating_value` on a TEXT category) |
| 404 | `FEEDBACK_REQUEST_NOT_FOUND` | Token hash not found |
| 409 | `FEEDBACK_ALREADY_SUBMITTED` | Request already has a submission |
| 409 | `FEEDBACK_NOT_AVAILABLE` | Appointment no longer COMPLETED |
| 410 | `FEEDBACK_REQUEST_EXPIRED` | Token expired |
| 410 | `FEEDBACK_REQUEST_REVOKED` | Request was revoked |
| 422 | `FEEDBACK_CATEGORY_INVALID` | Category does not belong to this business |
| 422 | `FEEDBACK_CATEGORY_DISABLED` | Category is disabled |
| 422 | `IDEMPOTENCY_CONFLICT` | Same idempotency key reused with different payload |

---

## Admin Endpoints

All admin endpoints require `Authorization: Bearer <token>` and valid business membership.

---

### Feedback Settings

<a id="get-settings"></a>

#### GET /api/v1/businesses/:businessId/feedback/settings

Retrieve the current feedback configuration for the business.

**Permission:** `FEEDBACK_VIEW` (OWNER/ADMIN)

**Success Response (200):**

```json
{
  "success": true,
  "message": "Feedback settings retrieved",
  "data": {
    "business_id": "uuid",
    "feedback_enabled": true,
    "feedback_expiry_mode": "DAYS_7",
    "feedback_custom_expiry_days": null
  }
}
```

---

<a id="patch-settings"></a>

#### PATCH /api/v1/businesses/:businessId/feedback/settings

Update feedback configuration.

**Permission:** `FEEDBACK_MANAGE` (OWNER/ADMIN)

**Request Body:**

```json
{
  "feedbackEnabled": true,
  "feedbackExpiryMode": "CUSTOM",
  "feedbackCustomExpiryDays": 14
}
```

| Field | Type | Required | Description |
| --- | --- | :---: | --- |
| `feedbackEnabled` | `boolean` | ❌ | Master switch for feedback generation |
| `feedbackExpiryMode` | `FeedbackExpiryMode` | ❌ | One of: `DAYS_7`, `DAYS_15`, `DAYS_30`, `CUSTOM`, `NEVER` |
| `feedbackCustomExpiryDays` | `integer \| null` | Conditional | Required when mode is `CUSTOM` (1–365). Set to `null` for other modes. |

**Validation Rules:**

- At least one field must be provided.
- `CUSTOM` mode requires `feedbackCustomExpiryDays` between 1 and 365.
- `NEVER` mode means tokens never expire (no `expiresAt`).
- Changing settings does **not** retroactively modify existing feedback requests.

**Success Response (200):**

```json
{
  "success": true,
  "message": "Feedback settings updated",
  "data": {
    "business_id": "uuid",
    "feedback_enabled": true,
    "feedback_expiry_mode": "CUSTOM",
    "feedback_custom_expiry_days": 14
  }
}
```

---

### Feedback Categories

<a id="post-categories"></a>

#### POST /api/v1/businesses/:businessId/feedback-categories

Create a new feedback category (question dimension).

**Permission:** `FEEDBACK_MANAGE` (OWNER/ADMIN)

**Request Body:**

```json
{
  "name": "Service Quality",
  "description": "Rate the quality of service received",
  "type": "RATING",
  "ratingScaleMin": 1,
  "ratingScaleMax": 5,
  "isEnabled": true,
  "sortOrder": 1
}
```

| Field | Type | Required | Description |
| --- | --- | :---: | --- |
| `name` | `string` | ✅ | Category name (unique per business, max 100 chars) |
| `description` | `string \| null` | ❌ | Optional description (max 1000 chars) |
| `type` | `FeedbackCategoryType` | ✅ | `RATING`, `TEXT`, or `BOOLEAN` |
| `ratingScaleMin` | `integer \| null` | Conditional | Required for `RATING` (0–10). Must be `null` for other types. |
| `ratingScaleMax` | `integer \| null` | Conditional | Required for `RATING` (0–10). Must be > `ratingScaleMin`. Must be `null` for other types. |
| `isEnabled` | `boolean` | ❌ | Default `true`. Disabled categories are hidden from customer forms. |
| `sortOrder` | `integer` | ❌ | Default `0`. Controls display order (0–1000). |

**Success Response (201):**

```json
{
  "success": true,
  "message": "Feedback category created",
  "data": {
    "id": "uuid",
    "name": "Service Quality",
    "description": "Rate the quality of service received",
    "type": "RATING",
    "rating_scale_min": 1,
    "rating_scale_max": 5,
    "is_enabled": true,
    "sort_order": 1,
    "response_count": 0,
    "created_at": "2026-10-09T10:00:00.000Z",
    "updated_at": "2026-10-09T10:00:00.000Z"
  }
}
```

**Error Responses:**

| Status | Code | Condition |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Missing name/type |
| 400 | `FEEDBACK_CATEGORY_INVALID` | Invalid rating scale config or scale on non-RATING type |
| 409 | `FEEDBACK_CATEGORY_DUPLICATE` | Category name already exists for this business |

---

<a id="get-categories"></a>

#### GET /api/v1/businesses/:businessId/feedback-categories

List all categories (including disabled) for admin management.

**Permission:** `FEEDBACK_VIEW` (OWNER/ADMIN)

**Success Response (200):**

```json
{
  "success": true,
  "message": "Feedback categories retrieved",
  "data": [
    {
      "id": "uuid",
      "name": "Service Quality",
      "description": "How satisfied were you?",
      "type": "RATING",
      "rating_scale_min": 1,
      "rating_scale_max": 5,
      "is_enabled": true,
      "sort_order": 1,
      "response_count": 42,
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

---

<a id="patch-category"></a>

#### PATCH /api/v1/feedback-categories/:categoryId

Update or disable a feedback category.

**Permission:** `FEEDBACK_MANAGE` (OWNER/ADMIN)

> **Immutability rule:** If a category already has responses, its `type`,
> `ratingScaleMin`, and `ratingScaleMax` cannot be changed (409).
> Categories are never deleted — they are disabled via `isEnabled: false`.

**Request Body (partial update):**

```json
{
  "name": "Updated Name",
  "isEnabled": false
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Feedback category updated",
  "data": { "..." }
}
```

**Error Responses:**

| Status | Code | Condition |
| --- | --- | --- |
| 404 | `FEEDBACK_CATEGORY_NOT_FOUND` | Category not found |
| 409 | `FEEDBACK_CATEGORY_DUPLICATE` | New name conflicts with existing category |
| 409 | `FEEDBACK_CATEGORY_IMMUTABLE` | Attempting to change type/scale on a category that has responses |

---

### Feedback Requests

<a id="get-request"></a>

#### GET /api/v1/businesses/:businessId/appointments/:appointmentId/feedback-request

Get the feedback request status, shareable link, and QR code for an appointment.

**Permission:** `FEEDBACK_VIEW` (OWNER/ADMIN), branch-scoped

> **Important:** This endpoint is read-only. It never creates a new request or
> rotates existing tokens.

**Success Response (200):**

```json
{
  "success": true,
  "message": "Appointment feedback request retrieved",
  "data": {
    "id": "uuid",
    "appointment_id": "uuid",
    "customer_id": "uuid",
    "status": "PENDING",
    "sent_at": "2026-10-15T10:00:00.000Z",
    "expires_at": "2026-10-22T10:00:00.000Z",
    "url": "https://salon.example.com/feedback/abc123...",
    "qr_code_url": "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=...",
    "is_submitted": false,
    "is_revoked": false,
    "is_expired": false,
    "submission": null,
    "created_at": "...",
    "updated_at": "..."
  }
}
```

When the request has been submitted:

```json
{
  "data": {
    "status": "SUBMITTED",
    "is_submitted": true,
    "submission": {
      "id": "uuid",
      "submitted_at": "2026-10-16T14:00:00.000Z",
      "is_anonymous": false
    }
  }
}
```

---

<a id="post-request"></a>

#### POST /api/v1/businesses/:businessId/appointments/:appointmentId/feedback-request

Ensure a feedback request exists for a completed appointment (idempotent create).

**Permission:** `FEEDBACK_MANAGE` (OWNER/ADMIN)

If a request already exists, returns it without creating a duplicate.
If no request exists, generates one with a new token and sends an SMS notification.

**Preconditions:**

- Appointment must be `COMPLETED`
- Appointment must have a customer
- Business `feedbackEnabled` must be `true`

**Success Response (200):** Same shape as the GET endpoint above.

---

<a id="post-revoke"></a>

#### POST /api/v1/businesses/:businessId/appointments/:appointmentId/feedback-request/revoke

Revoke an active feedback request. The customer can no longer view the form or submit feedback.

**Permission:** `FEEDBACK_MANAGE` (OWNER/ADMIN), branch-scoped

**Behavior:**

- `PENDING` or `EXPIRED` → transitions to `REVOKED`
- Already `REVOKED` → idempotent (returns the same result)
- `SUBMITTED` → rejected with 409

**Success Response (200):**

```json
{
  "success": true,
  "message": "Appointment feedback request revoked",
  "data": {
    "id": "uuid",
    "appointment_id": "uuid",
    "status": "REVOKED",
    "updated_at": "..."
  }
}
```

**Error Responses:**

| Status | Code | Condition |
| --- | --- | --- |
| 404 | `APPOINTMENT_NOT_FOUND` | Appointment not found in business |
| 404 | `FEEDBACK_REQUEST_NOT_FOUND` | No request for this appointment |
| 409 | `CONFLICT` | Request already submitted |

---

### Feedback Inbox

<a id="get-feedback-list"></a>

#### GET /api/v1/businesses/:businessId/feedback

Paginated list of feedback submissions with filtering.

**Permission:** `FEEDBACK_VIEW` (OWNER/ADMIN), branch-scoped

**Query Parameters:**

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `page` | `integer` | `1` | Page number (1-based) |
| `limit` | `integer` | `20` | Page size (max 100) |
| `from_date` | `ISO 8601` | — | Filter: submitted on or after |
| `to_date` | `ISO 8601` | — | Filter: submitted on or before |
| `branch_id` | `uuid` | — | Filter by branch |
| `category_id` | `uuid` | — | Filter: has response for this category |
| `is_anonymous` | `boolean` | — | Filter: anonymous submissions only |

**Success Response (200):**

```json
{
  "success": true,
  "message": "Feedback retrieved",
  "data": [
    {
      "id": "uuid",
      "is_anonymous": false,
      "submitted_at": "2026-10-15T14:30:00.000Z",
      "responses": [
        {
          "id": "uuid",
          "category": {
            "id": "uuid",
            "name": "Service Quality",
            "type": "RATING"
          },
          "rating_value": 5,
          "text_response": null,
          "boolean_response": null,
          "answered_at": "2026-10-15T14:30:00.000Z"
        }
      ],
      "customer": {
        "id": "uuid",
        "first_name": "Jane",
        "last_name": "Doe",
        "phone": "+251900000010"
      },
      "appointment": {
        "id": "uuid",
        "scheduled_start": "...",
        "scheduled_end": "...",
        "status": "COMPLETED",
        "branch": { "id": "uuid", "name": "Downtown" },
        "service": { "id": "uuid", "name": "Haircut" },
        "staff": [{ "id": "uuid", "first_name": "John", "last_name": "Smith" }]
      }
    }
  ],
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

> **Anonymous submissions** have `customer: null` and `appointment: null`. No
> identifying information is ever serialized for anonymous feedback.

---

<a id="get-feedback-detail"></a>

#### GET /api/v1/businesses/:businessId/feedback/:submissionId

Get a single feedback submission with full detail.

**Permission:** `FEEDBACK_VIEW` (OWNER/ADMIN), branch-scoped

Same response shape as a single item in the list. An audit log entry
(`FEEDBACK_VIEWED`) is recorded without customer identity.

---

## Data Models & Enums

### FeedbackCategoryType

```
RATING    — Integer within [ratingScaleMin, ratingScaleMax]
TEXT      — Free-text string (max 5000 chars)
BOOLEAN   — true / false
```

### FeedbackExpiryMode

```
DAYS_7    — Token expires 7 days after appointment completion
DAYS_15   — 15 days
DAYS_30   — 30 days
CUSTOM    — Configurable via feedbackCustomExpiryDays (1–365)
NEVER     — Token never expires (expiresAt = null)
```

### FeedbackRequestStatus

```
PENDING   — Awaiting customer submission
SUBMITTED — Feedback received
EXPIRED   — Token expired (lazy transition on access)
REVOKED   — Revoked by admin
```

### State Transitions

```
PENDING → SUBMITTED   (customer submits)
PENDING → EXPIRED     (lazy: checked on form/submit access)
PENDING → REVOKED     (admin revokes)
EXPIRED → REVOKED     (admin revokes)
```

Terminal states: `SUBMITTED`, `REVOKED`. Once in a terminal state, no further transitions are allowed.

### Expiration Calculation

Expiration is calculated as:

```
expiresAt = appointmentCompletionTimestamp + expiryModeDays
```

Where `appointmentCompletionTimestamp` is `completedAt ?? actualEnd ?? now()`.

This means an appointment completed 3 days ago with `DAYS_7` mode will have
~4 days remaining, not 7.

---

## Error Codes

| Code | HTTP | Description |
| --- | :---: | --- |
| `FEEDBACK_NOT_FOUND` | 404 | Feedback submission not found |
| `FEEDBACK_REQUEST_NOT_FOUND` | 404 | Feedback request not found |
| `FEEDBACK_REQUEST_EXPIRED` | 410 | Token has expired |
| `FEEDBACK_REQUEST_REVOKED` | 410 | Request was revoked by admin |
| `FEEDBACK_ALREADY_SUBMITTED` | 409 | Feedback already submitted for this request |
| `FEEDBACK_NOT_AVAILABLE` | 400/409 | Appointment not eligible (not completed, no customer) |
| `FEEDBACK_DISABLED` | 400 | Business has feedback disabled |
| `FEEDBACK_CATEGORY_NOT_FOUND` | 404 | Category not found |
| `FEEDBACK_CATEGORY_DUPLICATE` | 409 | Duplicate category name |
| `FEEDBACK_CATEGORY_INVALID` | 400 | Invalid category configuration |
| `FEEDBACK_CATEGORY_DISABLED` | 422 | Category is disabled |
| `FEEDBACK_CATEGORY_IMMUTABLE` | 409 | Category has responses; type/scale cannot change |
| `FEEDBACK_RESPONSE_INVALID` | 400 | Response value doesn't match category type |
| `IDEMPOTENCY_CONFLICT` | 422 | Idempotency key reused with different payload |
| `VALIDATION_ERROR` | 400 | General validation failure |
| `NOT_BUSINESS_MEMBER` | 403 | Caller is not a member of the business |
| `INSUFFICIENT_PERMISSIONS` | 403 | Caller lacks required permission |
| `FORBIDDEN` | 403 | Branch access denied |

---

## Security & Privacy

### Token Security

| Concern | Approach |
| --- | --- |
| Token generation | 32 random bytes → 64-char hex string (`crypto.randomBytes`) |
| Storage (lookup) | SHA-256 hash stored in `tokenHash` (unique indexed) |
| Storage (admin retrieval) | AES-256-GCM encrypted copy in `encryptedToken` |
| Encryption key | Derived via SHA-256 from `FEEDBACK_TOKEN_SECRET` (or `JWT_SECRET` fallback) |
| Plaintext persistence | **Never.** Raw token exists only in memory during generation + SMS delivery |

### Anonymous Submissions

When `is_anonymous=true`:

- The `toAdminFeedbackResponse` mapper unconditionally returns `customer: null` and `appointment: null`.
- The audit log (`FEEDBACK_VIEWED`) records `isAnonymous: true` without customer identity.
- No identifying information (customer ID, name, phone, appointment details, branch, staff) is ever serialized in the API response.

### Audit Trail

All significant feedback events are recorded as audit log entries:

| Action | Trigger |
| --- | --- |
| `FEEDBACK_REQUEST_CREATED` | New request generated |
| `FEEDBACK_SUBMITTED` | Customer submits feedback |
| `FEEDBACK_VIEWED` | Admin views a submission |
| `FEEDBACK_REQUEST_REVOKED` | Admin revokes a request |
| `FEEDBACK_CATEGORY_CREATED` | New category created |
| `FEEDBACK_CATEGORY_UPDATED` | Category updated |
| `FEEDBACK_CATEGORY_DISABLED` | Category disabled |
| `BUSINESS_SETTINGS_UPDATED` | Feedback settings changed |

### Concurrency Safety

- **Request generation:** `UNIQUE(appointmentId)` constraint + P2002 catch → at most one request per appointment.
- **Submission:** `updateMany({ where: { id, status: 'PENDING' } })` inside a transaction → at most one submission per request. Concurrent submissions result in one success + one 409.
- **Idempotency keys:** Replay detection compares `idempotencyKey` + `requestPayloadHash` to distinguish safe retries from conflicting payloads.

### Environment Variables

| Variable | Required | Description |
| --- | :---: | --- |
| `FEEDBACK_TOKEN_SECRET` | ❌ | AES encryption key source. Falls back to `JWT_SECRET`. |
| `FRONTEND_URL` | ❌ | Base URL for feedback links (default: `http://localhost:3000`) |
