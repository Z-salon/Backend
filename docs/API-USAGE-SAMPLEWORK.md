# Z-Salon API — Service Usage & Category Sample Work

Reference for two related feature areas:

- **Service Usage** — staff record what service was actually performed (and which products were used) after an appointment.
- **Category Sample Work** — portfolio images/links attached to a **service category** (e.g. "Bridal Makeup" → 5 sample photos).

Derived from the routes, validation schemas and services in `src/`. Where Swagger and code disagree, **the code wins**.

---

## 0. Conventions

### 0.1 Base URL

```
{host}/api/v1
```

Examples assume `http://localhost:5173/api/v1`.

### 0.2 Authentication

Every endpoint below requires a valid JWT:

```
Authorization: Bearer <accessToken>
```

- **Service Usage** routes additionally require `requireBusinessMembership` on `:businessId`.
- **Sample Work** routes require an authenticated user; authorization is enforced in the service by business role:
  - **Add / Update / Delete** → only `OWNER` or `ADMIN`.
  - **Get / List** → any active business member; `BRANCH_MANAGER` is restricted to categories assigned to their branches.

### 0.3 Standard response envelope

```json
{ "success": true, "message": "…", "data": { } }
```

Errors:

```json
{ "success": false, "message": "…", "code": "NOT_FOUND", "details": null }
```

Common status codes: `400` invalid input · `401` authentication required · `403` insufficient permissions · `404` resource not found · `409` conflict.

---

## 1. Service Usage

Records a service history entry (and optional products used) against an appointment. Only allowed while the appointment is in **`CHECKED_IN`**, **`IN_PROGRESS`**, or **`COMPLETED`** — otherwise `400`.

### 1.1 Add service usage

`POST /businesses/:businessId/appointments/:id/service-usages`

**Path parameters**

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `businessId` | uuid | ✅ | Business that owns the appointment |
| `id` | uuid | ✅ | Appointment ID |

**Request body**

```json
{
  "serviceId": "8f2c…-uuid",
  "serviceName": "Haircut + Beard",
  "serviceDetails": "Scissor cut, fade, beard shaping",
  "productsUsed": [
    { "name": "Argan Oil", "quantity": 2, "unit": "ml" }
  ],
  "notes": "Customer prefers short sides"
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `serviceName` | string | ✅ | Trimmed; non-empty (400 if blank) |
| `serviceId` | uuid | — | Links to a catalog service |
| `serviceDetails` | string | — | Free text |
| `productsUsed` | array | — | JSON array, e.g. `[{ name, quantity, unit }]` |
| `notes` | string | — | Free text |

**Logic:** appointment must belong to `businessId` (404 otherwise); appointment status must be one of the allowed statuses (400); `branchId` and `recordedById` are derived from the appointment and caller.

**Response 201**

```json
{
  "success": true,
  "message": "Service usage recorded",
  "data": {
    "id": "…",
    "appointmentId": "…",
    "businessId": "…",
    "branchId": "…",
    "serviceId": "…",
    "serviceName": "Haircut + Beard",
    "serviceDetails": "Scissor cut, fade, beard shaping",
    "productsUsed": [{ "name": "Argan Oil", "quantity": 2, "unit": "ml" }],
    "notes": "Customer prefers short sides",
    "recordedById": "…",
    "recordedAt": "2026-10-03T09:12:00.000Z",
    "updatedAt": "2026-10-03T09:12:00.000Z"
  }
}
```

### 1.2 Get service usage for an appointment

`GET /businesses/:businessId/appointments/:id/service-usages`

**Path parameters:** same as 1.1.

**Logic:** appointment must belong to `businessId` (404 otherwise).

**Response 200** — array ascending by `recordedAt`, each item includes `recordedBy: { id, phone }`:

```json
{
  "success": true,
  "message": "Service usages retrieved",
  "data": [
    {
      "id": "…",
      "appointmentId": "…",
      "businessId": "…",
      "branchId": "…",
      "serviceId": "…",
      "serviceName": "Haircut + Beard",
      "serviceDetails": "…",
      "productsUsed": [],
      "notes": "…",
      "recordedById": "…",
      "recordedAt": "2026-10-03T09:12:00.000Z",
      "updatedAt": "2026-10-03T09:12:00.000Z",
      "recordedBy": { "id": "…", "phone": "+2519…" }
    }
  ]
}
```

### 1.3 Update service usage

`PATCH /businesses/:businessId/service-usages/:usageId`

**Path parameters**

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `businessId` | uuid | ✅ | Business that owns the record |
| `usageId` | uuid | ✅ | Service usage ID |

**Request body** — send any subset:

```json
{
  "serviceName": "Haircut + Beard + Wash",
  "serviceDetails": "Added scalp wash",
  "productsUsed": [{ "name": "Shampoo", "quantity": 1, "unit": "dose" }],
  "notes": "Customer happy"
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `serviceName` | string | — | Trimmed when provided |
| `serviceDetails` | string | — | Free text |
| `productsUsed` | array | — | Replaces the stored array |
| `notes` | string | — | Free text |

**Logic:** record must belong to `businessId` (404 otherwise). Only provided fields are changed.

**Response 200** — the updated record (same shape as 1.1, without `recordedBy`).

### 1.4 Delete service usage

`DELETE /businesses/:businessId/service-usages/:usageId`

**Logic:** record must belong to `businessId` (404 otherwise). Hard delete.

**Response 200**

```json
{ "success": true, "message": "Service usage deleted", "data": null }
```

---

## 2. Category Sample Work

Portfolio items (`name`, `url`, optional `description`, `publicId`) attached to a `ServiceCategory`. Uploaded images are expected to have been pushed to the image host first; `publicId` is the storage handle used to delete the asset when the sample work is removed or its `publicId` changes.

### 2.1 Add sample work

`POST /service-categories/:categoryId/sample-works`

**Path parameters**

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `categoryId` | uuid | ✅ | Target service category |

**Request body**

```json
{
  "name": "Bridal look — May 2026",
  "url": "https://cdn.example.com/sample-works/bridal-01.jpg",
  "publicId": "sample-works/bridal-01",
  "description": "Soft glam with gold accents"
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | ✅ | 1–250 chars, trimmed |
| `url` | string (uri) | ✅ | Must be a valid URL |
| `publicId` | string | ✅ | Non-empty; image-storage handle |
| `description` | string | — | Max 1000 chars |

**Logic:** category must exist (404); caller must be `OWNER`/`ADMIN` (403). Audit: `SAMPLE_WORK_ADDED`.

**Response 201**

```json
{
  "success": true,
  "message": "Sample work added successfully",
  "data": {
    "id": "…",
    "categoryId": "…",
    "name": "Bridal look — May 2026",
    "description": "Soft glam with gold accents",
    "url": "https://cdn.example.com/sample-works/bridal-01.jpg",
    "publicId": "sample-works/bridal-01",
    "createdAt": "2026-10-03T09:12:00.000Z",
    "updatedAt": "2026-10-03T09:12:00.000Z"
  }
}
```

### 2.2 List sample works for a category

`GET /service-categories/:categoryId/sample-works`

**Path parameters:** `categoryId` (uuid, required).

**Logic:** category must exist (404). Caller must be a member; `OWNER`/`ADMIN` see all, `BRANCH_MANAGER` only if the category is active in one of their branches (403 otherwise).

**Response 200** — array ordered by `createdAt` descending:

```json
{
  "success": true,
  "message": "Sample works retrieved successfully",
  "data": [
    {
      "id": "…",
      "categoryId": "…",
      "name": "Bridal look — May 2026",
      "description": "Soft glam with gold accents",
      "url": "https://cdn.example.com/sample-works/bridal-01.jpg",
      "publicId": "sample-works/bridal-01",
      "createdAt": "2026-10-03T09:12:00.000Z",
      "updatedAt": "2026-10-03T09:12:00.000Z"
    }
  ]
}
```

### 2.3 Get a single sample work

`GET /sample-works/:sampleWorkId`

**Path parameters:** `sampleWorkId` (uuid, required).

**Logic:** sample work must exist (404). Same membership/branch scoping as 2.2 (403 otherwise).

**Response 200**

```json
{
  "success": true,
  "message": "Sample work retrieved successfully",
  "data": {
    "id": "…",
    "categoryId": "…",
    "name": "Bridal look — May 2026",
    "description": "Soft glam with gold accents",
    "url": "https://cdn.example.com/sample-works/bridal-01.jpg",
    "publicId": "sample-works/bridal-01",
    "createdAt": "2026-10-03T09:12:00.000Z",
    "updatedAt": "2026-10-03T09:12:00.000Z"
  }
}
```

### 2.4 Update sample work

`PATCH /sample-works/:sampleWorkId`

**Path parameters:** `sampleWorkId` (uuid, required).

**Request body** — send any subset:

```json
{
  "name": "Bridal look — May 2026 (final)",
  "url": "https://cdn.example.com/sample-works/bridal-01-v2.jpg",
  "publicId": "sample-works/bridal-01-v2",
  "description": "Updated retouch"
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | — | 1–250 chars, trimmed |
| `url` | string (uri) | — | Valid URL |
| `publicId` | string | — | Non-empty |
| `description` | string \| null | — | Max 1000 chars; `null` clears it |

**Logic:** sample work must exist (404); caller must be `OWNER`/`ADMIN` (403). Only provided fields change. Audit: `SAMPLE_WORK_UPDATED`.

**Response 200** — the updated sample work (same shape as 2.3).

> Note: if you replace `publicId` to point at a newly uploaded image, the previous asset is **not** deleted automatically on update — only on delete (2.5). Clean up the old asset from your client if needed.

### 2.5 Delete sample work

`DELETE /sample-works/:sampleWorkId`

**Logic:** sample work must exist (404); caller must be `OWNER`/`ADMIN` (403). Deletes the row and best-effort deletes the stored image by `publicId`. Audit: `SAMPLE_WORK_REMOVED`.

**Response 200**

```json
{ "success": true, "message": "Sample work removed successfully", "data": {} }
```

---

## 3. Quick reference

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/businesses/:businessId/appointments/:id/service-usages` | Add service usage |
| `GET` | `/businesses/:businessId/appointments/:id/service-usages` | List service usage |
| `PATCH` | `/businesses/:businessId/service-usages/:usageId` | Update service usage |
| `DELETE` | `/businesses/:businessId/service-usages/:usageId` | Delete service usage |
| `POST` | `/service-categories/:categoryId/sample-works` | Add sample work |
| `GET` | `/service-categories/:categoryId/sample-works` | List sample works for a category |
| `GET` | `/sample-works/:sampleWorkId` | Get one sample work |
| `PATCH` | `/sample-works/:sampleWorkId` | Update sample work |
| `DELETE` | `/sample-works/:sampleWorkId` | Delete sample work |

### Related — appointment payments with multiple methods

`POST /businesses/:businessId/appointments/:id/payments` accepts **either** the single-method form or a `payments` array. Each array entry creates its own `AppointmentPayment` row in one transaction (e.g. 1000 cash + 1500 card → two rows):

```json
{
  "payments": [
    { "paymentMethodId": "…cash…", "amount": 1000 },
    { "paymentMethodId": "…card…", "amount": 1500 }
  ],
  "reference": "SPLIT-2026-0042",
  "notes": "Split tender"
}
```

**Response 201:** `{ success, message: "Payments recorded successfully", data: [ …one payment object per method… ] }`.
