# Z-Salon Backend — Integration Guide

Reference for integrating against the Z-Salon REST API. Covers **Auth**, **Business
Configuration**, **Payment Methods**, **Branch Management**, **Branch Working Hours**,
**Branch Booking Configuration**, **Service Categories** and **Services**.

Everything here is derived from the routes, validation schemas and services in `src/`.
Where the Swagger annotations and the code disagree, the **code wins** and the
discrepancy is called out explicitly.

---

## 1. Conventions

### Base URL

```
{host}/api/v1
```

`/api/v1` is the `API_PREFIX` env value. Examples below use the full path.

Health check (no prefix): `GET /health` → `{ success: true, message: "OK", timestamp }`

### Authentication

Most endpoints require a **Bearer access token**:

```http
Authorization: Bearer <accessToken>
```

The token is a JWT containing `userId` and `sessionId`. Beyond signature validation,
every request re-checks the session in the database, so a token stops working
immediately after logout / session revoke. Maximum session lifetime is 30 days.

The **refresh token is not returned in the body** — it is set as an httpOnly cookie
named `refreshToken` (30 days, `sameSite=lax`, `secure` in production) by
`/auth/login`, `/auth/login/complete`, `/auth/register/verify`. Your client must
therefore allow cookies (`credentials: 'include'` in fetch / `withCredentials` in axios).

Optional headers understood by auth endpoints:

| Header | Used by | Purpose |
| --- | --- | --- |
| `x-device-name` | login, login/complete, register/verify | Labels the session in `GET /auth/sessions` |
| `user-agent` | same | Recorded on the session |
| (client IP) | same | Recorded on the session |

### Authorization layers

Endpoints in this guide stack three checks (each returns 401/403):

1. `authenticate` — valid, non-revoked session + `ACTIVE` user.
2. `requireBusinessMembership` — the caller is an `ACTIVE` `BusinessMember` of the
   `:businessId` in the path, and the business itself is `ACTIVE`.
   → 403 `NOT_BUSINESS_MEMBER`, `MEMBER_STATUS_INVALID` or `BUSINESS_SUSPENDED`.
3. `requirePermission('CODE')` / `requireAnyPermission([...])` — one of the caller's
   active roles holds the permission code.
   → 403 `INSUFFICIENT_PERMISSIONS` with `details: { permission }`.

`requireBranchAccess('branchId')` additionally enforces *branch scope*: a user whose
roles are `BUSINESS`-scoped can reach any branch in the business; a user with only
`BRANCH`-scoped roles can only reach branches explicitly attached to their role.
→ 404 if the branch does not exist in the business, 403 `FORBIDDEN` if out of scope.

Some services layer an extra role check on top (notably "only `OWNER`" for payment
methods). Those are documented per endpoint.

### Default system roles

Created automatically for every new business:

| `systemKey` | Notes |
| --- | --- |
| `OWNER` | All permissions |
| `ADMIN` | All permissions except `FINANCE_REFUND`, `FINANCE_ADJUSTMENT` |
| `BRANCH_MANAGER` | Bookings, customers, staff view/schedule, service view, branch view |
| `RECEPTIONIST` | Bookings + customers + service/staff view |

### Response envelope

**Success** (`utils/api-response.ts`):

```json
{
  "success": true,
  "message": "Human readable message",
  "data": { },
  "code": undefined
}
```

`data` is omitted entirely when the endpoint returns nothing.

**Error** (thrown `ApiError`, rendered by `error-handler.ts`):

```json
{
  "success": false,
  "message": "Appointment not found",
  "code": "APPOINTMENT_NOT_FOUND",
  "details": { }
}
```

`details` is omitted when absent.

> **Note:** some controllers (and the `bodyValidator` middleware) bypass the envelope.
> See "Validation errors" and the per-endpoint notes.

### Validation errors — two different shapes

**Body validation middleware** (`bodyValidator`, runs before the controller) returns
HTTP **400** with a bare `errors` array and **no `success`/`code` fields**:

```json
{
  "errors": [
    "name: Category name is required",
    "branchIds: At least one branch is required"
  ]
}
```

Each entry is `"<fieldPath>: <message>"`.

**Zod errors thrown inside a service** return HTTP **400** in the standard envelope:

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [{ "field": "price", "message": "Price must be greater than or equal to 0" }]
}
```

### Other error codes you will see

| HTTP | `code` | Cause |
| --- | --- | --- |
| 400 | `BAD_REQUEST`, `VALIDATION_ERROR`, `BRANCH_NOT_IN_BUSINESS`, `INVALID_REFERENCE` | Bad input / cross-business reference |
| 401 | `UNAUTHORIZED`, `SESSION_REVOKED`, `SESSION_EXPIRED`, `TOKEN_EXPIRED`, `INVALID_TOKEN` | Auth problem |
| 403 | `FORBIDDEN`, `NOT_BUSINESS_MEMBER`, `BUSINESS_SUSPENDED`, `INSUFFICIENT_PERMISSIONS`, `USER_SUSPENDED`, `MEMBER_STATUS_INVALID` | Authz problem |
| 404 | `NOT_FOUND` | Missing resource (also the fallback for unknown routes) |
| 409 | `CONFLICT`, `DUPLICATE_ENTRY` | Unique constraint / duplicate name |
| 500 | `INTERNAL_ERROR`, `DATABASE_ERROR` | Server fault |

`P2002` (Prisma unique violation) is mapped to 409 `DUPLICATE_ENTRY`.

### `strict()` bodies

Several update schemas are `.strict()`. **Sending an unknown field is a 400.** Affected:
`businessUpdate`, `businessBranding`, `branchCreate`, `branchUpdate`, `weekly hours`,
`date overrides`, `booking config`, `branch phone`. Do not send `id`, `createdAt`, etc.

### Common enum values

```text
OtpPurpose            LOGIN | REGISTRATION | PASSWORD_RESET | PHONE_VERIFICATION
                      | INVITATION_ACCEPTANCE | PHONE_CHANGE
UserStatus            PENDING_VERIFICATION | ACTIVE | SUSPENDED
MemberStatus          INVITED | ACTIVE | SUSPENDED | REMOVED
RoleScopeType         BUSINESS | BRANCH
ServiceCategoryStatus ACTIVE | INACTIVE
ServiceStatus         ACTIVE | INACTIVE
EmployeeAssignmentMode CUSTOMER_CHOOSES | SALON_ASSIGNS | ANY_AVAILABLE
DepositPolicyType     NONE | FIXED | PERCENTAGE | FULL
RefundPolicyType      NO_REFUND | FULL_REFUND | PERCENTAGE_REFUND
```

### Format rules

| Field | Rule |
| --- | --- |
| Phone | E.164: `^\+[1-9]\d{1,14}$` (e.g. `+2519XXXXXXXX`). Normalized server-side. |
| Password | ≥ 8 chars, must contain lowercase, uppercase and a digit |
| OTP | 4–8 digits (`^\d{4,8}$`) |
| Time (working hours) | `HH:mm`, 24-hour (`^([01]\d|2[0-3]):([0-5]\d)$`) |
| Date (overrides) | `YYYY-MM-DD` |
| UUID | all `*Id` path/body params |
| Color | hex `#RGB` or `#RRGGBB` |
| Timezone | IANA identifier, validated against `Intl.DateTimeFormat` |

---

## 2. Auth

Base path: `/api/v1/auth`

### 2.1 `POST /auth/otp/request` — public

Request an OTP. Always returns 200 to avoid phone-number enumeration.

```json
{ "phone": "+251911223344", "purpose": "LOGIN" }
```

`purpose` optional (default `LOGIN`), one of the `OtpPurpose` values.

```json
{ "success": true, "message": "If this phone number is eligible, a verification code has been sent." }
```

### 2.2 `POST /auth/otp/verify` — public

```json
{ "phone": "+251911223344", "otp": "123456", "purpose": "LOGIN" }
```

```json
{
  "success": true,
  "message": "OTP verified successfully",
  "data": { "verificationToken": "v1.a1b2c3..." }
}
```

Errors: 400 `OTP_INVALID`, `OTP_EXPIRED`, `OTP_MAX_ATTEMPTS`; 429 `OTP_RATE_LIMITED`.

### 2.3 `POST /auth/register` — public (business owner signup, step 1)

```json
{
  "phone": "+251911223344",
  "password": "Str0ngPass",
  "business": {
    "name": "Bella Salon",
    "currency": "ETB",
    "timezone": "Africa/Addis_Ababa"
  }
}
```

* `business.name` 1–100 chars (required)
* `business.currency` exactly 3 chars (default `ETB`)
* `business.timezone` default `Africa/Addis_Ababa`

Returns **201**, no `data`. An OTP for `PHONE_VERIFICATION` is sent.

Errors: 409 `USER_ALREADY_EXISTS` if the phone is already registered.

### 2.4 `POST /auth/register/{invitationToken}/invitation` — public

Step 1 of accepting a team invitation for an already-invited phone.

```json
{ "password": "Str0ngPass" }
```

Returns **201**, no `data`; OTP is sent to the invited phone.
Errors: 400 `INVITATION_EXPIRED` / `INVITATION_REVOKED` / `INVITATION_ALREADY_ACCEPTED`.

### 2.5 `POST /auth/register/verify` — public (step 2, completes onboarding)

```json
{ "phone": "+251911223344", "otp": "123456" }
```

On success the server creates the `User`, the `Business`, a `Main Branch`, its booking
config, the membership, and the default system roles, then logs the user in.

```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "accessToken": "eyJhbGciOi...",
    "user": {
      "id": "3f1c...",
      "phone": "+251911223344",
      "phoneVerifiedAt": "2026-09-16T09:12:44.000Z"
    }
  }
}
```

Sets the `refreshToken` cookie.

### 2.6 `POST /auth/login` — public

```json
{ "phone": "+251911223344", "password": "Str0ngPass" }
```

Success is identical in shape to 2.5 (`message: "Login successful"`). Sets the
`refreshToken` cookie.

Errors: 401 `INVALID_CREDENTIALS`, 403 `PHONE_NOT_VERIFIED` (status
`PENDING_VERIFICATION`), 403 `USER_SUSPENDED`.

### 2.7 `POST /auth/login/complete` — public

Complete a passwordless/OTP login using a token from 2.2 with `purpose: "LOGIN"`.

```json
{ "verificationToken": "v1.a1b2c3..." }
```

Same response as login. Sets the `refreshToken` cookie.

### 2.8 Password reset flow

| Method | Path | Auth | Body | Notes |
| --- | --- | --- | --- | --- |
| POST | `/auth/password/forgot` | public | `{ "phone": "+251..." }` | Sends `PASSWORD_RESET` OTP |
| POST | `/auth/password/reset/verify` | public | `{ "phone", "otp" }` | → `data: { passwordResetToken }` |
| POST | `/auth/password/reset` | public | `{ "passwordResetToken", "newPassword" }` | Revokes sessions |

`newPassword` follows the password rules.

### 2.9 `POST /auth/password/change` — **Bearer required**

```json
{ "currentPassword": "0ldPass1", "newPassword": "N3wPass99" }
```

```json
{ "success": true, "message": "Password changed successfully" }
```

### 2.10 Phone change

| Method | Path | Auth | Body |
| --- | --- | --- | --- |
| POST | `/auth/phone/change/request` | Bearer | `{ "currentPassword": "...", "newPhone": "+251..." }` |
| POST | `/auth/phone/change/verify` | Bearer | `{ "newPhone": "+251...", "otp": "123456" }` |

### 2.11 `POST /auth/otp/resend` — public

Same body as `/auth/otp/request`. Cooldown applies (`OTP_RESEND_COOLDOWN`).

### 2.12 `POST /auth/refresh` — cookie only

No body, no Authorization header. Reads the `refreshToken` cookie, rotates it and
returns a fresh access token.

```json
{ "success": true, "message": "Token refreshed", "data": { "accessToken": "eyJhbGciOi..." } }
```

Sets a new `refreshToken` cookie. 401 `UNAUTHORIZED` if the cookie is missing/invalid.

### 2.13 Logout

| Method | Path | Auth | Effect |
| --- | --- | --- | --- |
| POST | `/auth/logout` | Bearer | Revokes current session, clears cookie |
| POST | `/auth/logout-all` | Bearer | Revokes every session of the user, clears cookie |

### 2.14 `GET /auth/me` — Bearer required

```json
{
  "success": true,
  "message": "User profile retrieved",
  "data": {
    "id": "3f1c...",
    "phone": "+251911223344",
    "phoneVerifiedAt": "2026-09-16T09:12:44.000Z",
    "status": "ACTIVE",
    "createdAt": "2026-09-16T09:12:44.000Z",
    "memberships": [
      {
        "id": "m1...",
        "businessId": "b1...",
        "status": "ACTIVE",
        "business": {
          "id": "b1...",
          "name": "Bella Salon",
          "currency": "ETB",
          "timezone": "Africa/Addis_Ababa",
          "status": "ACTIVE"
        },
        "userRoles": [
          {
            "scopeType": "BUSINESS",
            "role": { "id": "r1...", "name": "Owner", "systemKey": "OWNER" },
            "branches": []
          }
        ]
      }
    ]
  }
}
```

Use this on app boot to resolve `businessId`, role and branch scope.

### 2.15 Sessions

| Method | Path | Auth | Response `data` |
| --- | --- | --- | --- |
| GET | `/auth/sessions` | Bearer | array of `{ id, deviceName, userAgent, ipAddress, createdAt, lastUsedAt, expiresAt, currentSession }` |
| DELETE | `/auth/sessions/{sessionId}` | Bearer | — |

---

## 3. Business Configuration

### 3.1 `GET /api/v1/businesses/me` — Bearer required

No `requireBusinessMembership` middleware; the service resolves the caller's first
`ACTIVE` membership and requires a role whose `systemKey` is `OWNER`, `ADMIN` or
`BRANCH_MANAGER` (else 403 `INSUFFICIENT_PERMISSIONS`, 404 `BUSINESS_NOT_FOUND` if no
active membership).

```json
{
  "success": true,
  "message": "Business configuration retrieved",
  "data": {
    "id": "b1...",
    "name": "Bella Salon",
    "slug": "bella-salon-m1a2b3",
    "currency": "ETB",
    "timezone": "Africa/Addis_Ababa",
    "status": "ACTIVE",
    "branch": {
      "id": "br1...",
      "name": "Main Branch",
      "address": "Bole Road",
      "email": null,
      "timezone": "Africa/Addis_Ababa",
      "phones": [
        { "id": "p1...", "phone": "+251911223344", "label": "Front desk", "isPrimary": true, "isActive": true }
      ]
    },
    "createdAt": "2026-09-16T09:12:44.000Z",
    "updatedAt": "2026-09-16T09:12:44.000Z"
  }
}
```

`branch` is the **first active branch** (oldest by `createdAt`); if the business has no
active branch it returns a placeholder `{ id: "", name: "Main Branch", phones: [] }`.

### 3.2 `PATCH /api/v1/businesses/{businessId}` — Bearer required

**Auth:** membership + `BUSINESS_UPDATE`.
**Body (`.strict()`, at least one field):**

| Field | Type | Rules |
| --- | --- | --- |
| `name` | string | 1–100 |
| `currency` | string | exactly 3 chars; validated against an ISO-4217 allow-list (ETB, USD, EUR, GBP, KES, NGN, ZAR, …) |
| `timezone` | string | valid IANA identifier |

```json
{ "message": "Business configuration updated", "data": { "id": "b1...", "name": "Bella Salon", "slug": "...", "currency": "ETB", "timezone": "Africa/Addis_Ababa", "status": "ACTIVE", "branch": { }, "createdAt": "...", "updatedAt": "..." } }
```

Unchanged fields are ignored (no write, no audit entry). Errors: 400
`VALIDATION_ERROR` for bad currency/timezone; 403 `INSUFFICIENT_PERMISSIONS` for
non-Owner/Admin roles.

### 3.3 `GET /api/v1/businesses/{businessId}/branding` — **public, no auth**

Storefront-style payload: branding + active branches with phones + active categories
with sample works.

```json
{
  "success": true,
  "message": "Business branding retrieved",
  "data": {
    "logoUrl": "https://cdn.example.com/logo.png",
    "coverImageUrl": null,
    "primaryColor": "#FF5722",
    "secondaryColor": "#212121",
    "description": "Hair & beauty",
    "aboutUs": "Since 2015...",
    "website": "https://bella.example.com",
    "facebookUrl": null, "instagramUrl": null, "telegramUrl": null, "tiktokUrl": null,
    "branches": [
      {
        "id": "br1...", "name": "Main Branch", "address": "Bole Road",
        "email": null, "timezone": "Africa/Addis_Ababa",
        "phones": [{ "id": "p1...", "phone": "+251911223344", "label": "Front desk", "isPrimary": true, "isActive": true }]
      }
    ],
    "serviceCategories": [
      {
        "id": "c1...", "name": "Hair", "description": "Cuts & styling",
        "sampleWorks": [{ "id": "sw1...", "url": "https://...", "name": "Balayage", "description": null, "serviceCategoryId": "c1..." }]
      }
    ]
  }
}
```

404 `BUSINESS_NOT_FOUND` if the id is unknown.

### 3.4 `PATCH /api/v1/businesses/{businessId}/branding` — Bearer required

**Auth:** membership + `BUSINESS_MANAGE_BRANDING` (Owner/Admin by default).
**Body (`.strict()`, at least one field)** — all nullable, all clearable with `null`:

| Field | Type | Rules |
| --- | --- | --- |
| `logoUrl`, `coverImageUrl` | string (URL) | valid URL |
| `primaryColor`, `secondaryColor` | string | `#RGB` or `#RRGGBB` |
| `description` | string | ≤ 1000 |
| `aboutUs` | string | ≤ 5000 |
| `website`, `facebookUrl`, `instagramUrl`, `telegramUrl`, `tiktokUrl` | string (URL) | valid URL |

> `address`, `phone` and `email` exist on the `BrandingUpdateInput` **service**
> interface but were **removed from `businessBrandingSchema`**, and the body is
> `.strict()` — sending any of them returns 400. Put addresses on branches (§5) and
> contact numbers on branch phones (§5.5).

Returns the same object as §3.2.

---

## 4. Payment Methods

Payment methods describe *how* a customer can pay (cash, bank transfer, mobile money).
They are referenced by payment receipts and appointment payments.

> **Mounting note:** these routes are declared in
> `src/modules/appointment/routes/appointment.routes.ts`. The similarly-named
> `src/modules/payment/routes/payment-method.routes.ts` is **not mounted** in
> `src/routes/index.ts` — it is dead code. Integrate against the paths below.

### 4.1 `GET /api/v1/businesses/{businessId}/payment-methods/public` — Bearer required

**Auth:** any valid session (no membership check) — this is the customer-facing list.
Only `isActive: true` methods are returned, ordered by `displayOrder`.

```json
{
  "success": true,
  "message": "Payment methods retrieved",
  "data": [
    {
      "id": "pm1...",
      "name": "Telebirr",
      "type": "MOBILE_MONEY",
      "accountName": "Bella Salon PLC",
      "accountNumber": "0911223344",
      "instructions": "Send payment then upload the screenshot"
    }
  ]
}
```

This projection deliberately omits `isActive`, `displayOrder`, `businessId` and
timestamps.

### 4.2 `POST /api/v1/businesses/{businessId}/payment-methods` — Bearer required

**Auth:** membership, **and** the service additionally requires a role with
`systemKey === 'OWNER'`. Admins and Branch Managers get
`403 "Insufficient permissions to manage payment methods"`.

⚠️ **No Zod validation on this body** — it is passed straight to Prisma. Field-level
rules below are the documented convention, not enforced by a schema; a wrong type or an
unknown field surfaces as a Prisma error (400 `VALIDATION_ERROR` / 500).

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `name` | ✅ | string | No length enforcement in code |
| `type` | ✅ | string | Documented enum: `CASH` \| `BANK_TRANSFER` \| `MOBILE_MONEY` (the batch endpoint also documents `CARD` \| `OTHER`). The DB column is a free-form `String`, so **validate it client-side** |
| `accountName` | ❌ | string | Shown to the customer |
| `accountNumber` | ❌ | string | Shown to the customer |
| `instructions` | ❌ | string | Free text shown to the customer |
| `isActive` | ❌ | boolean | Default `true` |
| `displayOrder` | ❌ | integer | Default `0`, ascending sort |

> **Do not send `businessId` in the body.** The object is spread *after* the path-derived
> `businessId`, so a body value would override it.

```json
{
  "name": "Telebirr",
  "type": "MOBILE_MONEY",
  "accountName": "Bella Salon PLC",
  "accountNumber": "0911223344",
  "instructions": "Send payment then upload the screenshot",
  "isActive": true,
  "displayOrder": 1
}
```

**201** returns the created row:

```json
{
  "success": true,
  "message": "Payment method created successfully",
  "data": {
    "id": "pm1...", "businessId": "b1...", "name": "Telebirr", "type": "MOBILE_MONEY",
    "accountName": "Bella Salon PLC", "accountNumber": "0911223344",
    "instructions": "Send payment then upload the screenshot",
    "isActive": true, "displayOrder": 1,
    "createdAt": "2026-09-16T09:30:00.000Z", "updatedAt": "2026-09-16T09:30:00.000Z"
  }
}
```

Errors: 403 not an active member / not OWNER, 404 business not found (via membership
middleware).

### 4.3 `GET /api/v1/businesses/{businessId}/payment-methods` — Bearer required

**Auth:** membership (any active member may list).

| Query param | Type | Notes |
| --- | --- | --- |
| `active` | boolean | Only the literal string `"true"` filters to active methods |

Returns the **full** rows (including `isActive`, `displayOrder`, timestamps), ordered by
`displayOrder` ascending.

```json
{ "success": true, "message": "Payment methods retrieved successfully", "data": [ { "id": "pm1...", "businessId": "b1...", "name": "Telebirr", "type": "MOBILE_MONEY", "accountName": "...", "accountNumber": "...", "instructions": "...", "isActive": true, "displayOrder": 1, "createdAt": "...", "updatedAt": "..." } ] }
```

### 4.4 `PATCH /api/v1/businesses/{businessId}/payment-methods/{id}` — Bearer required

**Auth:** membership + `OWNER`. The method must belong to `businessId` (else 404).

⚠️ Again **no schema validation** — the body goes straight into `prisma.paymentMethod.update`,
so it accepts any `PaymentMethod` column and a typo surfaces as a Prisma error. Follow
the §4.2 field list. Do not send `businessId` or `id`.

```json
{ "name": "Telebirr (personal)", "isActive": false, "displayOrder": 5 }
```

Returns the updated row:

```json
{ "success": true, "message": "Payment method updated successfully", "data": { "id": "pm1...", "businessId": "b1...", "name": "Telebirr (personal)", "type": "MOBILE_MONEY", "isActive": false, "displayOrder": 5, "createdAt": "...", "updatedAt": "...", "accountName": "...", "accountNumber": "...", "instructions": "..." } }
```

Errors: 403 not OWNER, 404 `NOT_FOUND` (unknown id or belongs to another business).

### 4.5 `DELETE /api/v1/businesses/{businessId}/payment-methods/{id}` — Bearer required

**Auth:** membership + `OWNER`.

**A method that has ever been used in a receipt cannot be deleted** — 400
`"Cannot delete a payment method that has been used. Please deactivate it instead."`
Use §4.4 with `{ "isActive": false }` instead. Deactivating hides it from the public
list (§4.1) but keeps history intact.

```json
{ "success": true, "message": "Payment method deleted successfully", "data": null }
```

Errors: 403 not OWNER, 404 not found.

### 4.6 `POST /api/v1/businesses/{businessId}/payment-methods/batch` — Bearer required

**Auth:** membership + Owner/Admin (`verifyOwnerOrAdmin`).

⚠️ **No schema validation** — always send a non-empty `items` array, otherwise the
service throws on `input.items.length` (500).

```json
{
  "items": [
    { "name": "Cash", "type": "CASH", "isActive": true, "displayOrder": 0 },
    { "name": "CBE Account", "type": "BANK_TRANSFER", "accountName": "Bella Salon", "accountNumber": "1000123456789", "displayOrder": 1 },
    { "name": "Telebirr", "type": "MOBILE_MONEY", "accountNumber": "0911223344", "instructions": "Send to this number", "displayOrder": 2 }
  ]
}
```

Rules:

* at most **50** items (`MAX_BATCH_SIZE = 50`) → 400 `VALIDATION_ERROR`
* duplicate `name` **within the batch** → 400 (code `CONFLICT`), message
  `"Duplicate payment method name: <name>"`
* a `name` that **already exists** for the business → 409 `CONFLICT`
* `type` documented enum here is wider: `CASH` \| `CARD` \| `MOBILE_MONEY` \|
  `BANK_TRANSFER` \| `OTHER`
* `isActive` defaults `true`, `displayOrder` defaults `0`

Returns **201** with the created rows (same shape as §4.3 `data` array). Audited as
`PAYMENT_METHODS_BATCH_CREATED`.

---

## 5. Branch Management

> **Path note:** create/list use `/businesses/{businessId}/branches`; get/update and all
> nested resources use the shorter `/{businessId}/branches/{branchId}`. Both are mounted
> under `/api/v1`.

### 5.1 `POST /api/v1/businesses/{businessId}/branches` — Bearer required

**Auth:** membership + `BRANCH_CREATE`.
**Body (`.strict()`):**

| Field | Required | Rules |
| --- | --- | --- |
| `name` | ✅ | 1–100, unique per business |
| `address` | ✅ | 1–500 |
| `timezone` | ❌ | IANA; defaults to the business timezone |

```json
{ "name": "Piassa Branch", "address": "Piassa, Addis Ababa", "timezone": "Africa/Addis_Ababa" }
```

**201** response `data`:

```json
{
  "id": "br2...",
  "businessId": "b1...",
  "name": "Piassa Branch",
  "address": "Piassa, Addis Ababa",
  "email": null,
  "timezone": "Africa/Addis_Ababa",
  "isActive": true,
  "phones": [],
  "createdAt": "2026-09-16T09:20:00.000Z",
  "updatedAt": "2026-09-16T09:20:00.000Z"
}
```

Side effect: a `BranchBookingConfig` is created with defaults, and a `BRANCH_CREATED`
audit entry is written.
Errors: 409 `CONFLICT` (duplicate name), 400 `VALIDATION_ERROR` (bad timezone).

### 5.2 `GET /api/v1/businesses/{businessId}/branches` — Bearer required

**Auth:** membership + `BRANCH_VIEW` **or** `BUSINESS_VIEW`.

Returns **all** branches (active and inactive) for Owner/Admin. A user holding only
`BRANCH_MANAGER` gets only the branches attached to their role.

`data` is an array of objects shaped like §5.1.

### 5.3 `GET /api/v1/{businessId}/branches/{branchId}` — Bearer required

**Auth:** membership + branch scope. Returns the branch **plus** weekly schedules, date
overrides, booking config and phones:

```json
{
  "id": "br2...", "businessId": "b1...", "name": "Piassa Branch",
  "address": "Piassa", "email": null, "timezone": "Africa/Addis_Ababa", "isActive": true,
  "phones": [],
  "weeklySchedules": [
    { "id": "w0...", "dayOfWeek": 0, "isClosed": true, "intervals": [] },
    { "id": "w1...", "dayOfWeek": 1, "isClosed": false, "intervals": [{ "id": "i1...", "startTime": "09:00", "endTime": "18:00" }] }
  ],
  "dateOverrides": [
    { "id": "o1...", "date": "2026-12-25T00:00:00.000Z", "isClosed": true, "intervals": [] }
  ],
  "bookingConfig": {
    "onlineBookingEnabled": true, "walkInEnabled": true, "bookingApprovalRequired": false,
    "minimumAdvanceBookingMinutes": 120, "maximumAdvanceBookingDays": 30,
    "cancellationWindowMinutes": 60, "reschedulingEnabled": true,
    "bookingBufferMinutes": 0, "waitlistEnabled": false
  },
  "createdAt": "...", "updatedAt": "..."
}
```

`bookingConfig` here is a **flat subset** (no `cancellation`/`confirmation` groups) —
use §7 for the full configuration. Times are `HH:mm` strings. 404 if the branch is not
in the business.

### 5.4 `PATCH /api/v1/{businessId}/branches/{branchId}` — Bearer required

**Auth:** membership + branch scope + Owner/Admin **or** `BRANCH_MANAGER` for that branch.
**Body (`.strict()`, at least one):**

| Field | Type | Rules |
| --- | --- | --- |
| `name` | string | 1–100, unique per business |
| `address` | string \| null | ≤ 500 |
| `timezone` | string | IANA |
| `isActive` | boolean | `false` is rejected for the **last** active branch (400 `INVALID_SCOPE_CONFIGURATION`) |

Returns the §5.1 branch object. Errors: 409 duplicate name, 404 not found.

### 5.5 Branch phones

| Method | Path | Auth | Body |
| --- | --- | --- | --- |
| POST | `/businesses/{businessId}/branches/{branchId}/phones` | membership + branch scope | `{ "phoneNumber": "+251911223344", "label": "Front desk", "isPrimary": false }` |
| GET | `.../phones` | membership + branch scope | — |
| PATCH | `.../phones/{phoneId}` | membership + branch scope | `{ "phoneNumber"?, "label"?, "isPrimary"?, "isActive"? }` (`.strict()`, ≥1) |
| POST | `.../phones/{phoneId}/set-primary` | membership + branch scope | — |
| DELETE | `.../phones/{phoneId}` | membership + branch scope | — |

`phoneNumber` must be E.164; `label` ≤ 50. `phoneNumber` is unique per branch, and only
one phone per branch can be primary. Response objects carry
`{ id, phone, label, isPrimary, isActive }` (note: exposed as `phone`, not `phoneNumber`).

---

## 6. Branch Working Hours

### 6.1 `GET /api/v1/{businessId}/branches/{branchId}/weekly-hours` — Bearer required

Returns an array of 7 (or fewer, if never configured) entries:

```json
[
  { "id": "w0...", "dayOfWeek": 0, "isClosed": true, "intervals": [] },
  { "id": "w1...", "dayOfWeek": 1, "isClosed": false,
    "intervals": [
      { "id": "i1...", "startTime": "09:00", "endTime": "13:00" },
      { "id": "i2...", "startTime": "14:00", "endTime": "18:00" }
    ] }
]
```

`dayOfWeek`: `0` = Sunday … `6` = Saturday. Times are `HH:mm` strings (the DB stores
them as `2000-01-01THH:mm:00Z`, the API strips the date part).

### 6.2 `PUT /api/v1/{businessId}/branches/{branchId}/weekly-hours` — Bearer required

**Auth:** membership + branch scope + Owner/Admin or `BRANCH_MANAGER`.
**Body (`.strict()`)** — full replace of the week:

```json
{
  "days": [
    { "dayOfWeek": 0, "isClosed": true,  "intervals": [] },
    { "dayOfWeek": 1, "isClosed": false, "intervals": [{ "start": "09:00", "end": "13:00" }, { "start": "14:00", "end": "18:00" }] },
    { "dayOfWeek": 2, "isClosed": false, "intervals": [{ "start": "09:00", "end": "18:00" }] },
    { "dayOfWeek": 3, "isClosed": false, "intervals": [{ "start": "09:00", "end": "18:00" }] },
    { "dayOfWeek": 4, "isClosed": false, "intervals": [{ "start": "09:00", "end": "18:00" }] },
    { "dayOfWeek": 5, "isClosed": false, "intervals": [{ "start": "09:00", "end": "18:00" }] },
    { "dayOfWeek": 6, "isClosed": false, "intervals": [{ "start": "10:00", "end": "16:00" }] }
  ]
}
```

Rules enforced:

* exactly **7 entries** (`length(7)`) covering **7 unique** `dayOfWeek` values 0–6
* `isClosed: true` ⇒ `intervals` must be **empty**
* `isClosed: false` ⇒ at least **one** interval
* intervals within a day **must not overlap**; they need not be sorted
* `start`/`end` must match `HH:mm`; `start < end` is not validated — send sane data
* `isClosed` defaults to `false`, `intervals` to `[]` if omitted

This is a destructive replace: existing schedules and intervals are deleted in the same
transaction, then recreated. Response is identical to §6.1. An audit entry
(`WEEKLY_HOURS_UPDATED`) is written.

> If the controller's `PUT` returns 400 with a bare `{ errors: [...] }` on the
> day-coverage rule, check the payload has all seven days.

### 6.3 Date overrides (holidays / one-off hours)

| Method | Path | Auth | Body |
| --- | --- | --- | --- |
| POST | `/{businessId}/branches/{branchId}/date-overrides` | membership + branch scope | see below |
| GET | `/{businessId}/branches/{branchId}/date-overrides` | membership + branch scope | query: `from`, `to`, `upcoming=true` |
| PATCH | `/{businessId}/branches/{branchId}/date-overrides/{overrideId}` | membership + branch scope | partial |
| DELETE | `/{businessId}/branches/{branchId}/date-overrides/{overrideId}` | membership + branch scope | — |

**Create body** (`.strict()`):

```json
{
  "date": "2026-12-25",
  "isClosed": true,
  "intervals": []
}
```

Or an open day with custom hours:

```json
{
  "date": "2026-12-24",
  "isClosed": false,
  "intervals": [{ "start": "09:00", "end": "14:00" }]
}
```

* `date` must be `YYYY-MM-DD`
* `isClosed: true` ⇒ empty intervals; `isClosed: false` ⇒ ≥ 1 interval; intervals must not overlap
* one override per branch per `date` → 409 `CONFLICT` if it already exists

**Update body** (`.strict()`, at least one field): `date?`, `isClosed?`, `intervals?`.
Changing `date` to one that already has an override → 409.

**List response `data`:**

```json
[
  { "id": "o1...", "date": "2026-12-25T00:00:00.000Z", "isClosed": true, "intervals": [] }
]
```

`upcoming=true` filters to `date >= now`; `from`/`to` are ISO dates bounding the range.

---

## 7. Branch Booking Configuration

### 7.1 `GET /api/v1/{businessId}/branches/{branchId}/booking-config` — Bearer required

**Auth:** membership + branch scope. This is the **canonical** booking configuration
shape (grouped into three sections):

```json
{
  "success": true,
  "message": "Booking configuration retrieved successfully",
  "data": {
    "booking": {
      "onlineBookingEnabled": true,
      "walkInEnabled": true,
      "bookingApprovalRequired": false,
      "minimumAdvanceBookingMinutes": 120,
      "maximumAdvanceBookingDays": 30,
      "bookingBufferMinutes": 0,
      "waitlistEnabled": false
    },
    "cancellation": {
      "cancellationWindowMinutes": 60,
      "reschedulingEnabled": true,
      "customerCancellationEnabled": true,
      "customerCancellationPolicy": "BEFORE_DEADLINE",
      "refundPolicyType": "NO_REFUND",
      "refundPercentage": null,
      "refundDeadlineHours": 24
    },
    "confirmation": {
      "customerConfirmationEnabled": true,
      "confirmationReminderHours": 24,
      "confirmationDeadlineHours": 2,
      "sameDayConfirmationReminderHours": 1,
      "pendingAppointmentExpirationMinutes": 30
    }
  }
}
```

If no config row exists for the branch, one is created with defaults and returned.

### 7.2 `PATCH /api/v1/{businessId}/branches/{branchId}/booking-config` — Bearer required

**Auth:** membership + branch scope + Owner/Admin or `BRANCH_MANAGER`.

⚠️ **The body must use the same nested `booking` / `cancellation` / `confirmation`
groups as the GET response** — a flat body of top-level field names is rejected by the
`.strict()` schema. Omitted sections are left untouched.

```json
{
  "booking": {
    "onlineBookingEnabled": false,
    "minimumAdvanceBookingMinutes": 240,
    "bookingBufferMinutes": 15
  },
  "cancellation": {
    "refundPolicyType": "PERCENTAGE_REFUND",
    "refundPercentage": 50,
    "refundDeadlineHours": 48
  },
  "confirmation": {
    "customerConfirmationEnabled": true,
    "confirmationDeadlineHours": 4
  }
}
```

| Group | Field | Type | Rules / default |
| --- | --- | --- | --- |
| `booking` | `onlineBookingEnabled` | boolean | default `true` |
| | `walkInEnabled` | boolean | default `true` |
| | `bookingApprovalRequired` | boolean | default `false` |
| | `minimumAdvanceBookingMinutes` | int | ≥ 0, default `120` |
| | `maximumAdvanceBookingDays` | int | ≥ 1, default `30` |
| | `bookingBufferMinutes` | int | ≥ 0, default `0` |
| | `waitlistEnabled` | boolean | default `false` |
| `cancellation` | `cancellationWindowMinutes` | int | ≥ 0, default `60` |
| | `reschedulingEnabled` | boolean | default `true` |
| | `customerCancellationEnabled` | boolean | default `true` |
| | `customerCancellationPolicy` | string | default `"BEFORE_DEADLINE"` |
| | `refundPolicyType` | enum | `NO_REFUND` \| `FULL_REFUND` \| `PERCENTAGE_REFUND`, default `NO_REFUND` |
| | `refundPercentage` | int \| null | 0–100 |
| | `refundDeadlineHours` | int | ≥ 0, default `24` |
| `confirmation` | `customerConfirmationEnabled` | boolean | default `true` |
| | `confirmationReminderHours` | int | ≥ 0, default `24` |
| | `confirmationDeadlineHours` | int | ≥ 0, default `2` |
| | `sameDayConfirmationReminderHours` | int | ≥ 0, default `1` |
| | `pendingAppointmentExpirationMinutes` | int | ≥ 0, default `30` |

Returns the full grouped config (same as §7.1). A `BOOKING_CONFIG_UPDATED` audit entry is
written. Validation errors return 400 `VALIDATION_ERROR`.

> Swagger for this route shows a **flat** body — ignore it, the middleware is what
> actually runs.

---

## 8. Service Categories

Base path: `/api/v1`.

**Auth pattern:** create/update require **Owner or Admin** (`verifyOwnerOrAdmin`, 403
`INSUFFICIENT_PERMISSIONS` otherwise) plus membership. Read endpoints require only a
valid session; branch-scoped users see only categories assigned to their branches.

### 8.1 `POST /api/v1/businesses/{businessId}/service-categories` — Bearer required

**Body:**

| Field | Required | Rules |
| --- | --- | --- |
| `name` | ✅ | 1–250, trimmed, unique per business |
| `description` | ❌ | string |
| `branchIds` | ✅ | ≥ 1 UUIDs, **no duplicates**; all must belong to the business and be active |

```json
{
  "name": "Hair",
  "description": "Cuts, coloring and styling",
  "branchIds": ["br1...", "br2..."]
}
```

**201** response `data`:

```json
{
  "id": "c1...",
  "businessId": "b1...",
  "name": "Hair",
  "description": "Cuts, coloring and styling",
  "status": "ACTIVE",
  "branchAssignments": [
    { "id": "a1...", "categoryId": "c1...", "branchId": "br1...", "isActive": true,
      "branch": { "id": "br1...", "name": "Main Branch", "isActive": true } }
  ],
  "createdAt": "...", "updatedAt": "..."
}
```

Errors: 409 duplicate name, 400 `BRANCH_NOT_IN_BUSINESS`, 400 for an inactive branch,
403 for non-Owner/Admin.

### 8.2 `GET /api/v1/businesses/{businessId}/service-categories` — Bearer required

Query parameters:

| Param | Type | Notes |
| --- | --- | --- |
| `branchId` | uuid | Filter to categories assigned to this branch |
| `status` | `ACTIVE` \| `INACTIVE` | Explicit status filter |
| `includeInactive` | boolean | Ignored for non-Owner/Admin, who always see everything unless `status` is set |

`data` is an array of categories, each including `branchAssignments` (with nested
`branch`) and a `services` summary array: `{ id, name, durationMinutes, price, status }`,
ordered by name.

### 8.3 `GET /api/v1/service-categories/{categoryId}` — Bearer required

Full category with branch assignments. 403 `FORBIDDEN` if the category belongs to a
business the caller can't access.

### 8.4 `PATCH /api/v1/service-categories/{categoryId}` — Bearer required

Owner/Admin only.

```json
{ "name": "Hair & Beauty", "description": null, "status": "INACTIVE" }
```

| Field | Rules |
| --- | --- |
| `name` | 1–250, unique per business |
| `description` | string or `null` to clear |
| `status` | `ACTIVE` \| `INACTIVE` |

All optional. Errors: 409 duplicate name, 404 not found.

### 8.5 Category ↔ branch assignment

| Method | Path | Auth | Body | Notes |
| --- | --- | --- | --- | --- |
| POST | `/service-categories/{categoryId}/branches` | Bearer | `{ "branchId": "br3..." }` | 201; 409 if already active; 400 `BRANCH_NOT_IN_BUSINESS` / inactive branch |
| GET | `/service-categories/{categoryId}/branches` | Bearer | — | List assignments |
| PATCH | `/service-categories/{categoryId}/branches/{branchId}` | Bearer | `{ "isActive": true }` | Toggle; `isActive` **required** |

### 8.6 Sample works

| Method | Path | Auth | Body |
| --- | --- | --- | --- |
| POST | `/service-categories/{categoryId}/sample-works` | Bearer | `{ "name": "Balayage", "url": "https://...", "description": "…" }` |
| DELETE | `/sample-works/{sampleWorkId}` | Bearer | — |

`name` required (1–250), `url` required and must be a valid URL, `description` ≤ 1000.

---

## 9. Services

Base path: `/api/v1`.

**Auth pattern:** create/update/assign require **Owner or Admin** plus membership; read
endpoints require a valid session.

### 9.1 `POST /api/v1/businesses/{businessId}/services` — Bearer required

**Body:**

| Field | Required | Rules |
| --- | --- | --- |
| `categoryId` | ✅ | UUID; must exist, belong to the business, and be `ACTIVE` |
| `name` | ✅ | 1–250, trimmed |
| `description` | ❌ | string |
| `durationMinutes` | ✅ | integer > 0 |
| `price` | ✅ | number or numeric string, ≥ 0 (sent to `Decimal(12,2)`) |
| `employeeAssignmentMode` | ✅ | `CUSTOMER_CHOOSES` \| `SALON_ASSIGNS` \| `ANY_AVAILABLE` |
| `showPriceToCustomer` | ❌ | boolean, default `true` |
| `depositPolicyType` | ❌ | `NONE` (default) \| `FIXED` \| `PERCENTAGE` \| `FULL` |
| `depositAmount` | ❌ | number/string or `null`; must satisfy the deposit rules below |
| `branchIds` | ✅ | ≥ 1 UUIDs, **no duplicates**; must belong to the business and be active |

**Deposit rules** (enforced in `validateDepositPolicy`):

* `NONE` / `FULL` → `depositAmount` must be omitted, `null` or `0`
* `FIXED` → required, `> 0`, and `<= price`
* `PERCENTAGE` → required, `> 0`, and `<= 100`

```json
{
  "categoryId": "c1...",
  "name": "Haircut & Blow Dry",
  "description": "Wash, cut and blow dry",
  "durationMinutes": 60,
  "price": 800,
  "employeeAssignmentMode": "CUSTOMER_CHOOSES",
  "showPriceToCustomer": true,
  "depositPolicyType": "PERCENTAGE",
  "depositAmount": 20,
  "branchIds": ["br1...", "br2..."]
}
```

**201** response `data` (service with `category` + `branchAssignments[].branch`):

```json
{
  "id": "s1...",
  "businessId": "b1...",
  "categoryId": "c1...",
  "name": "Haircut & Blow Dry",
  "description": "Wash, cut and blow dry",
  "durationMinutes": 60,
  "price": "800",
  "employeeAssignmentMode": "CUSTOMER_CHOOSES",
  "showPriceToCustomer": true,
  "depositPolicyType": "PERCENTAGE",
  "depositAmount": "20",
  "status": "ACTIVE",
  "category": { "id": "c1...", "name": "Hair", "status": "ACTIVE" },
  "branchAssignments": [
    { "id": "sa1...", "serviceId": "s1...", "branchId": "br1...", "isActive": true,
      "durationMinutes": null, "price": null, "bufferMinutes": 0,
      "branch": { "id": "br1...", "name": "Main Branch", "isActive": true } }
  ],
  "createdAt": "...", "updatedAt": "..."
}
```

`price` / `depositAmount` are Prisma `Decimal` values and serialize as **strings**.
`SERVICE_CREATED` is audited. Errors: 400 `VALIDATION_ERROR`, 400
`BRANCH_NOT_IN_BUSINESS`, 403 non-Owner/Admin.

### 9.2 `GET /api/v1/businesses/{businessId}/services` — Bearer required

Query parameters:

| Param | Type | Notes |
| --- | --- | --- |
| `branchId` | uuid | Only services assigned to this branch |
| `categoryId` | uuid | Filter by category |
| `status` | `ACTIVE` \| `INACTIVE` | Defaults to `ACTIVE` for non-Owner/Admin |

`data` is an array of services (same shape as §9.1), ordered by `name`. Owner/Admin see
inactive services and branches; branch-scoped users see only services whose
**assignment and category assignment** are both active in their branches.

### 9.3 `GET /api/v1/services/{serviceId}` — Bearer required

Single service with `category` (including `businessId`) and branch assignments.
403 `FORBIDDEN` if not accessible to the caller, 404 `NOT_FOUND` if missing.

### 9.4 `PATCH /api/v1/services/{serviceId}` — Bearer required

Owner/Admin only. All fields optional; same rules as create, plus `status`:

```json
{
  "name": "Haircut",
  "durationMinutes": 45,
  "price": 700,
  "categoryId": "c2...",
  "status": "INACTIVE"
}
```

| Field | Rules |
| --- | --- |
| `categoryId` | must exist, belong to the same business, and be `ACTIVE` |
| `name` | 1–250 |
| `description` | string or `null` |
| `durationMinutes` | integer > 0 |
| `price` | ≥ 0 |
| `employeeAssignmentMode` | enum |
| `showPriceToCustomer` | boolean |
| `depositPolicyType` / `depositAmount` | deposit rules re-validated |
| `status` | `ACTIVE` \| `INACTIVE` |

Returns the updated service. Audited as `SERVICE_UPDATED`.

### 9.5 Service ↔ branch assignment

| Method | Path | Auth | Body | Notes |
| --- | --- | --- | --- | --- |
| POST | `/services/{serviceId}/branches` | Owner/Admin | `{ "branchId": "br3..." }` | 201; 409 if already active at that branch; 400 if branch inactive or category not active there |
| GET | `/services/{serviceId}/branches` | Bearer | — | List assignments |
| PATCH | `/services/{serviceId}/branches/{branchId}` | Owner/Admin | `{ "isActive": true }` | Toggle activation |
| PATCH | `/services/{serviceId}/branches/{branchId}/config` | Owner/Admin | see below | Branch-specific overrides |
| GET | `/services/{serviceId}/branches/{branchId}/effective-config` | Bearer | — | Resolved config |

**`.../{branchId}/config` body** — validated by the *same* `updateServiceBranchAssignmentSchema`
as the toggle, so **`isActive` is required** here too (Swagger lists it as optional;
it is not):

```json
{
  "isActive": true,
  "durationMinutes": 75,
  "price": 900,
  "bufferMinutes": 10
}
```

| Field | Rules |
| --- | --- |
| `isActive` | **required** boolean |
| `durationMinutes` | integer > 0 or `null` (null = inherit the service duration) |
| `price` | ≥ 0 or `null` (null = inherit the service price) |
| `bufferMinutes` | integer ≥ 0, default `0` |

**`effective-config` response** — duration/price are *resolved* (branch override, else
service value):

```json
{
  "success": true,
  "message": "Effective service configuration retrieved successfully",
  "data": {
    "serviceId": "s1...",
    "branchId": "br1...",
    "name": "Haircut & Blow Dry",
    "durationMinutes": 75,
    "price": 900,
    "bufferMinutes": 10,
    "employeeAssignmentMode": "CUSTOMER_CHOOSES",
    "showPriceToCustomer": true,
    "depositPolicyType": "PERCENTAGE",
    "depositAmount": 20,
    "isActive": true
  }
}
```

The effective booking block used by availability is
`durationMinutes + bufferMinutes`. 404 if the service is not available at that branch.

---

## 10. End-to-end integration flow

```text
1.  POST /auth/register                   → OTP to owner's phone
2.  POST /auth/register/verify            → accessToken + refreshToken cookie, business + Main Branch created
3.  GET  /auth/me                         → cache businessId, role, branch scope
4.  GET  /businesses/me                   → confirm business config (name, currency, timezone)
5.  PATCH /businesses/{businessId}/branding  → logo, colors, contact/social
6.  POST /businesses/{businessId}/branches   → additional branches (booking config auto-created)
7.  PUT  /{businessId}/branches/{id}/weekly-hours  → open hours
8.  POST /{businessId}/branches/{id}/date-overrides → holidays
9.  PATCH /{businessId}/branches/{id}/booking-config → online booking, buffers, cancellation, refunds, confirmation
10. POST /businesses/{businessId}/service-categories → categories (+ branchIds)
11. POST /businesses/{businessId}/services            → services (+ branchIds)
12. PATCH /services/{id}/branches/{branchId}/config   → optional per-branch price/duration/buffer
13. POST /businesses/{businessId}/payment-methods     → payment methods customers can use
```

Token hygiene: refresh with `POST /auth/refresh` on 401, and on logout call both
`POST /auth/logout` and clear local state — the server checks the session row on every
request, so a revoked token fails immediately.

---

## 11. Implementation notes & known gaps

These are behaviours worth knowing before you integrate; they are observations about the
current code, not requests to change it.

1. **`bodyValidator` errors bypass the success/error envelope** and return
   `{ errors: ["field: message"] }` with HTTP 400. Handle both shapes in your client.
2. **Swagger is stale in places.** Notably:
   * `PATCH .../booking-config` documents a flat body; the real schema requires nested
     `booking` / `cancellation` / `confirmation` groups.
   * `PATCH .../branches/{branchId}/config` documents `isActive` as optional; it is required.
   * Swagger for `PATCH /businesses/{businessId}/branding` lists `address`, `phone` and
     `email`; the schema no longer accepts them (`.strict()` → 400).
   * Payment-method routes are documented twice (see note 4).
3. **Payment method `type`** is a plain `String` column with **no enum constraint** in the
   database. Swagger documents `CASH | BANK_TRANSFER | MOBILE_MONEY`; the API will accept
   any string. Validate it on your side.
4. **`src/modules/payment/routes/payment-method.routes.ts` is not mounted** in
   `src/routes/index.ts`. The working endpoints are the ones declared in
   `src/modules/appointment/routes/appointment.routes.ts`, documented in §4. The
   unmounted file is dead code — don't integrate against it.
5. **Payment method writes require `OWNER`**, not just membership — the permission check
   is hard-coded to `systemKey === 'OWNER'` (the richer permission codes are commented
   out). Admins and Branch Managers get 403.
6. **Branch `email` is never settable** through the branch API (no field in the create or
   update schema), though it is returned in responses.
7. **`GET /businesses/{businessId}/branding` is fully public** — no auth, no membership
   check. Treat it as storefront data when deciding what to put in branding fields.
8. **`PATCH .../weekly-hours` is a full replace**, not a merge. Always send all 7 days.
9. **Deleting the last active branch** or (per business config) other last-resort
   deactivations is blocked with 400 `INVALID_SCOPE_CONFIGURATION`.
10. **Currency is allow-listed** (~27 ISO 4217 codes, mostly African currencies + the
    majors). A valid ISO code outside the list returns 400.
11. **`Decimal` fields (`price`, `depositAmount`) serialize as strings** in JSON. Parse
    them before doing arithmetic.
12. **Times are timezone-naive `HH:mm` strings.** Branch/business timezone applies; do not
    assume UTC.
