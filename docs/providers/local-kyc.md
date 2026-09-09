# Local (Manual) KYC Service

## Overview

Built-in document-based KYC (Know Your Customer) system for VIP90.bet. Users upload identity documents through the platform, and administrators review and approve/reject them manually.

**Type:** Manual Document Review
**Cost:** Free (no third-party fees)
**Review Time:** Manual (depends on admin availability)
**Coverage:** Any country (manual review handles all document types)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Client (React)                       │
│  ┌──────────────────┐  ┌──────────────────────────────┐ │
│  │  Admin Panel      │  │  User KYC Page (/kyc)        │ │
│  │  /admin/modules   │  │  - Status display             │ │
│  │  - Toggle KYC     │  │  - Document upload form       │ │
│  │  /admin/module-   │  │  - Drag & drop support        │ │
│  │    settings       │  │  - Document type selection     │ │
│  │  - Provider select│  │  - File preview                │ │
│  │  /admin/kyc       │  │  - Real-time socket updates    │ │
│  │  - Review docs    │  └──────────────────────────────┘ │
│  │  - Approve/reject │                                  │
│  └──────────────────┘  ┌──────────────────────────────┐ │
│                         │  Admin KYC Review (/admin/kyc)│ │
│                         │  - Submission list             │ │
│                         │  - Document viewer             │ │
│                         │  - Approve/reject with reason  │ │
│                         └──────────────────────────────┘ │
└───────────────────────┬─────────────────────────────────┘
                        │ REST API
┌───────────────────────▼─────────────────────────────────┐
│                    Server (Express)                      │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────┐ │
│  │ KYC Routes    │  │ KYC Config  │  │ KYC Service    │ │
│  │ /api/kyc/*    │  │ (Setting    │  │ (kyc.js)       │ │
│  │              │  │  model)     │  │                │ │
│  └──────┬───────┘  └─────────────┘  └───────┬────────┘ │
│         │                                    │          │
│  ┌──────▼────────────────────────────────────▼───────┐  │
│  │              File Upload Handler                   │  │
│  │  POST /api/kyc/documents (multer)                 │  │
│  │  - JPEG, PNG, WebP, PDF                           │  │
│  │  - Max 10MB per file, max 6 files                 │  │
│  │  - Stored in server/uploads/kyc/                   │  │
│  └───────────────────────────────────────────────────┘  │
│         │                                               │
│  ┌──────▼──────────────────────────────────────────┐    │
│  │              Notification System                  │    │
│  │  - Socket event: kyc:status                      │    │
│  │  - Email: approval/rejection with reason         │    │
│  └─────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

## How It Works

### User Flow

1. User navigates to `/kyc`
2. If provider is `manual`, document upload form is shown
3. User selects document type (identity card, passport, etc.)
4. User drags & drops or clicks to select files (max 6, 10MB each)
5. User clicks "Belge Yukle" button
6. Files uploaded via `POST /api/kyc/documents` (multipart form)
7. Server creates KycDocument records and sets `kycStatus: pending`
8. Admin reviews documents in `/admin/kyc`
9. Admin approves or rejects with reason
10. Real-time socket event `kyc:status` sent to user
11. Email notification sent (approval or rejection with reason)

### Admin Flow

1. Admin navigates to `/admin/modules` -> toggles "KYC Kimlik Dogrulama" on
2. Admin navigates to `/admin/module-settings` -> KYC Settings section
3. Selects "Manuel" as provider
4. Users can now submit documents
5. Admin navigates to `/admin/kyc` to review submissions
6. Clicks on a submission to see detail
7. Views uploaded documents (opens in new tab)
8. Approves or rejects with reason

## Accepted Document Types

| Type | Code | Description |
|------|------|-------------|
| Kimlik Karti | `identity_card` | Turkish national ID card |
| Pasaport | `passport` | Passport |
| Ehliyet | `drivers_license` | Driver's license |
| Fatura | `utility_bill` | Utility bill (electricity, water, gas) |
| Banka Ozeti | `bank_statement` | Bank statement |
| Kimlikle Selfie | `selfie_with_id` | Selfie holding ID document |

## Supported File Formats

- **Images:** JPEG, PNG, WebP, HEIC
- **Documents:** PDF
- **Max Size:** 10MB per file
- **Max Files:** 6 per submission

## Files

| File | Purpose |
|------|---------|
| `server/src/services/kyc.js` | KYC service layer (submit, approve, reject, etc.) |
| `server/src/models/KycDocument.js` | KycDocument model |
| `server/src/routes/kyc.js` | KYC routes (`GET /status`, `POST /documents`) |
| `server/src/middleware/upload.js` | Multer config for file uploads |
| `server/src/config/kyc.js` | KYC config store |
| `server/src/controllers/admin.js` | Admin KYC review controllers |
| `server/src/routes/admin.js` | Admin KYC review routes |
| `server/src/validators/kyc.js` | KYC validation schemas |
| `server/src/modules/registry.js` | `kyc-verification` module definition |
| `server/src/app.js` | Route mounting + static uploads |
| `client/src/pages/Kyc.jsx` | User KYC page (upload form) |
| `client/src/pages/admin/ModuleSettings.jsx` | KYC Settings section |
| `client/src/pages/admin/KycReview.jsx` | Admin KYC review page |
| `client/src/App.jsx` | Client routes |
| `server/uploads/kyc/` | File storage directory |

## Configuration

### Admin Panel Settings

Accessible at `/admin/module-settings` -> KYC section:

| Key | Default | Description |
|-----|---------|-------------|
| `KYC_ENABLED` | `true` | Enable/disable entire KYC system |
| `KYC_PROVIDER` | `manual` | `manual` (admin review) or `sumsub` (automated) |

### File Upload Config

In `server/src/middleware/upload.js`:

```javascript
const KYC_ALLOWED = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'application/pdf',
]);

const KYC_MAX_SIZE = 10 * 1024 * 1024; // 10 MB
```

### Static File Serving

In `server/src/app.js`:

```javascript
app.use('/uploads/kyc', express.static(join(__dirname, '../uploads/kyc'), {
  maxAge: '1d',
  index: false,
}));
```

## API Endpoints

### User Routes (`/api/kyc`)

Module-gated: requires `kyc-verification` module enabled.

#### GET /api/kyc/status

Returns current user's KYC status and documents.

**Auth:** Required (Bearer token)

**Response:**
```json
{
  "userId": "64f1a2b3c4d5e6f7a8b9c0d1",
  "kycStatus": "not_started|pending|under_review|approved|rejected|expired",
  "kycVerified": false,
  "kycSubmittedAt": "2026-09-07T10:00:00.000Z",
  "kycApprovedAt": null,
  "kycRejectedAt": null,
  "kycRejectionReason": "",
  "kycRequiredFor": [],
  "documents": [
    {
      "_id": "...",
      "documentType": "identity_card",
      "fileName": "front.jpg",
      "fileSize": 1024000,
      "mimeType": "image/jpeg",
      "fileUrl": "/uploads/kyc/1694073600000-a1b2c3d4.jpg",
      "status": "pending",
      "createdAt": "2026-09-07T10:00:00.000Z"
    }
  ],
  "provider": "manual",
  "enabled": true
}
```

#### POST /api/kyc/documents

Upload KYC documents for review.

**Auth:** Required (Bearer token)
**Content-Type:** multipart/form-data

**Form Fields:**
- `documents` (file, max 6): The files to upload
- `documentType` (string): One of `identity_card`, `passport`, `drivers_license`, `utility_bill`, `bank_statement`, `selfie_with_id`
- `country` (string, optional): ISO 3166-1 alpha-3 country code
- `documentNumber` (string, optional): Document number

**Response:**
```json
{
  "documents": [
    {
      "userId": "...",
      "documentType": "identity_card",
      "fileName": "front.jpg",
      "fileSize": 1024000,
      "mimeType": "image/jpeg",
      "fileUrl": "/uploads/kyc/1694073600000-a1b2c3d4.jpg",
      "status": "pending",
      "metadata": { "country": "TUR" },
      "_id": "...",
      "createdAt": "2026-09-07T10:00:00.000Z"
    }
  ],
  "count": 1
}
```

**Errors:**
- `400 NO_FILES` — No files uploaded
- `400 PROVIDER_NOT_MANUAL` — KYC provider is not manual
- `400 KYC_DISABLED` — KYC is disabled
- `400 KYC_SUBMISSION_IN_PROGRESS` — Already has pending submission

### Admin Routes (`/api/admin`)

#### GET /api/admin/kyc/submissions

List KYC submissions with filtering and pagination.

**Query params:**
- `status` (string, optional): Filter by status
- `page` (number, default 1): Page number
- `limit` (number, default 20): Items per page
- `search` (string, optional): Search by username or email

**Response:**
```json
{
  "submissions": [
    {
      "_id": "...",
      "username": "ahmet",
      "email": "ahmet@example.com",
      "kycStatus": "pending",
      "kycSubmittedAt": "2026-09-07T10:00:00.000Z",
      "docCounts": { "pending": 2, "approved": 0, "rejected": 0 }
    }
  ],
  "total": 15,
  "page": 1,
  "pages": 1
}
```

#### GET /api/admin/kyc/stats

KYC statistics.

**Response:**
```json
{
  "byStatus": [
    { "_id": "pending", "count": 5 },
    { "_id": "approved", "count": 120 },
    { "_id": "rejected", "count": 8 }
  ],
  "recentSubmissions": [...],
  "approvedToday": 3
}
```

#### GET /api/admin/kyc/submissions/:id

Get user KYC detail with documents.

**Response:**
```json
{
  "user": {
    "_id": "...",
    "username": "ahmet",
    "email": "ahmet@example.com",
    "kycStatus": "pending",
    "kycSubmittedAt": "2026-09-07T10:00:00.000Z",
    "kycProvider": "manual"
  },
  "documents": [
    {
      "_id": "...",
      "documentType": "identity_card",
      "fileName": "front.jpg",
      "fileUrl": "/uploads/kyc/1694073600000-a1b2c3d4.jpg",
      "status": "pending",
      "createdAt": "2026-09-07T10:00:00.000Z"
    }
  ]
}
```

#### POST /api/admin/kyc/submissions/:id/approve

Approve KYC submission. All pending documents become approved.

**Auth:** Required (Admin)

**Request Body:**
```json
{
  "notes": "Documents verified successfully"
}
```

#### POST /api/admin/kyc/submissions/:id/reject

Reject KYC submission. All pending documents become rejected.

**Auth:** Required (Admin)

**Request Body:**
```json
{
  "reason": "Document quality too low — please resubmit clearer photos"
}
```

**Errors:**
- `400 REASON_REQUIRED` — Rejection reason is required

#### POST /api/admin/kyc/submissions/:id/under-review

Set KYC status to under_review (signals admin has started reviewing).

**Auth:** Required (Admin)

## KycDocument Model

```javascript
{
  userId: ObjectId (ref: User, required, index),
  documentType: String (enum: [identity_card, passport, drivers_license,
                               utility_bill, bank_statement, selfie_with_id]),
  fileName: String (required),
  fileSize: Number (required),
  mimeType: String (required),
  fileUrl: String (required),
  status: String (enum: [pending, approved, rejected], default: pending),
  reviewedBy: ObjectId (ref: User),
  reviewedAt: Date,
  rejectionReason: String,
  metadata: Mixed,
  timestamps: true
}
```

## KYC Service Functions

In `server/src/services/kyc.js`:

| Function | Description |
|----------|-------------|
| `submitKycDocuments(userId, documents)` | Create KycDocument records, set user status to pending |
| `getUserKycStatus(userId)` | Get full KYC status + document list |
| `approveKyc(userId, adminId, opts)` | Approve all pending docs + user, send email, emit socket |
| `rejectKyc(userId, adminId, reason, opts)` | Reject all pending docs + user, send email, emit socket |
| `setKycUnderReview(userId, adminId)` | Transition status to under_review |
| `checkKycRequired(userId, action, amount)` | Check if KYC needed for a feature |
| `requireKyc(action, getAmount)` | Express middleware for KYC enforcement |
| `getAllKycSubmissions(opts)` | Admin: paginated list with doc counts |
| `getKycStats()` | Admin: stats by status |
| `expireOldKyc()` | Cron: expire 1-year-old approvals |

## KYC Requirements

Built-in requirements for specific actions:

```javascript
const KYC_REQUIREMENTS = {
  withdrawal: { required: true, minAmount: 100 },
  high_stakes_bet: { required: true, minAmount: 1000 },
  casino_access: { required: false },
  agent_transfer: { required: true },
  profile_change: { required: false },
};
```

## Notifications

### Socket Events

```javascript
// Sent to user when KYC status changes
socket.emit('kyc:status', { status: 'approved' });
socket.emit('kyc:status', { status: 'rejected', reason: 'Document unclear' });

// Sent to admins when new submission arrives
socket.to('role:admin').emit('kyc:new_submission', { userId, docCount });
```

### Emails

**Approval:**
```
Subject: KYC Onaylandi
Body: Kimlik dogrulama belgeleriniz incelendi ve onaylandi.
```

**Rejection:**
```
Subject: KYC Reddedildi
Body: Kimlik dogrulama belgeleriniz reddedildi.
       Sebep: {reason}
       Lutfen dogru belgeleri yeniden yukleyin.
```

## Testing

```bash
# Run KYC service tests
node --test server/test/kyc.test.js
```

**Test Coverage:** 23 tests covering:
- Document submission
- Status retrieval
- Approval flow
- Rejection flow
- Under review transition
- KYC requirements checking
- Admin operations
- Stats and submissions list

## Deployment Checklist

- [ ] `kyc-verification` module enabled in admin panel (`/admin/modules`)
- [ ] Provider set to `manual` in admin panel
- [ ] `uploads/kyc/` directory exists and is writable
- [ ] Static file serving configured for `/uploads/kyc`
- [ ] Admin trained on review process at `/admin/kyc`
- [ ] Email notifications configured (SMTP)
- [ ] Socket.io configured for real-time updates
