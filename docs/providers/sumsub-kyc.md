# Sumsub KYC Provider Integration

## Overview

Sumsub identity verification integration for VIP90.bet. Automates KYC (Know Your Customer) verification with document capture, liveness detection, and AML screening.

**Provider:** Sumsub
**Type:** Identity Verification (KYC)
**Coverage:** 220+ countries
**Pricing:** $0.80-$2.50 per verification (volume discounts at 50k+/month)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Client (React)                       │
│  ┌─────────────┐  ┌──────────────────────────────────┐ │
│  │  Admin Panel │  │  User KYC Page (/kyc)            │ │
│  │  /admin/kyc  │  │  - Status display                 │ │
│  │  - Toggle    │  │  - Sumsub WebSDK integration      │ │
│  │  - Provider  │  │  - Real-time socket updates        │ │
│  │  - Config    │  └──────────────────────────────────┘ │
│  └─────────────┘                                        │
└───────────────────────┬─────────────────────────────────┘
                        │ REST API
┌───────────────────────▼─────────────────────────────────┐
│                    Server (Express)                      │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────┐ │
│  │ KYC Routes    │  │ KYC Config  │  │ Sumsub Service │ │
│  │ /api/kyc/*    │  │ (Setting    │  │ (HMAC-SHA256   │ │
│  │              │  │  model)     │  │  API client)   │ │
│  └──────┬───────┘  └─────────────┘  └───────┬────────┘ │
│         │                                    │          │
│  ┌──────▼────────────────────────────────────▼───────┐  │
│  │              Webhook Handler                       │  │
│  │  POST /api/webhook/sumsub                          │  │
│  │  - HMAC signature verification                     │  │
│  │  - applicantReviewed → approve/reject              │  │
│  │  - applicantPending → update status                │  │
│  └───────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTPS
┌───────────────────────▼─────────────────────────────────┐
│                  Sumsub API                             │
│  api.sumsub.com                                         │
│  - POST /resources/applicants                           │
│  - POST /resources/accessTokens/sdk                     │
│  - GET  /resources/applicants/{id}/review               │
│  - Webhooks: applicantReviewed, applicantPending        │
└─────────────────────────────────────────────────────────┘
```

## Files

| File | Purpose |
|---|---|
| `server/src/config/kyc.js` | KYC config store (DB-first, env fallback, 30s TTL cache) |
| `server/src/services/sumsubService.js` | Sumsub API client (HMAC-SHA256 auth) |
| `server/src/routes/kyc.js` | KYC routes (`GET /status`, `POST /init-session`) |
| `server/src/routes/sumsubWebhook.js` | Webhook handler (HMAC verify, approve/reject) |
| `server/src/services/kyc.js` | KYC service (provider branching added) |
| `server/src/models/User.js` | User model (`sumsubApplicantId`, `kycProvider` fields) |
| `server/src/models/KycDocument.js` | KycDocument model (`under_review` status added) |
| `server/src/controllers/admin.js` | Admin KYC settings controllers |
| `server/src/routes/admin.js` | Admin KYC settings routes |
| `server/src/app.js` | Route mounting (`/api/kyc`, `/api/webhook/sumsub`) |
| `client/src/pages/Kyc.jsx` | User KYC page (status + Sumsub WebSDK) |
| `client/src/pages/admin/KycSettings.jsx` | Admin KYC settings page |
| `client/src/App.jsx` | Client routes (`/kyc`, `/admin/kyc-settings`) |

## Configuration

### Environment Variables (.env)

```bash
# Sumsub API credentials (sandbox or production)
SUMSUB_APP_TOKEN=your_app_token
SUMSUB_SECRET_KEY=your_secret_key
SUMSUB_LEVEL_NAME=basic-kyc-level
SUMSUB_WEBHOOK_SECRET=your_webhook_secret
```

### Admin Panel Settings

Accessible at `/admin/kyc-settings`:

| Key | Default | Description |
|---|---|---|
| `KYC_ENABLED` | `true` | Enable/disable entire KYC system |
| `KYC_PROVIDER` | `manual` | `manual` (admin review) or `sumsub` (automated) |
| `SUMSUB_APP_TOKEN` | `''` | Sumsub API application token |
| `SUMSUB_SECRET_KEY` | `''` | Sumsub HMAC secret key |
| `SUMSUB_LEVEL_NAME` | `basic-kyc-level` | Sumsub verification level |
| `SUMSUB_WEBHOOK_SECRET` | `''` | Webhook signature verification secret |

**Source Priority:** DB (admin panel) → `.env` → defaults

## API Endpoints

### User Routes (`/api/kyc`)

#### GET /api/kyc/status
Returns current user's KYC status.

**Auth:** Required (Bearer token)

**Response:**
```json
{
  "userId": "64f1a2b3c4d5e6f7a8b9c0d1",
  "kycStatus": "not_started|pending|under_review|approved|rejected|expired",
  "kycVerified": false,
  "kycSubmittedAt": null,
  "kycApprovedAt": null,
  "kycRejectedAt": null,
  "kycRejectionReason": "",
  "kycRequiredFor": [],
  "documents": [],
  "provider": "manual|sumsub"
}
```

#### POST /api/kyc/init-session
Initialize Sumsub KYC session. Creates applicant and returns SDK token.

**Auth:** Required (Bearer token)

**Request Body:**
```json
{
  "country": "TUR"  // optional, ISO 3166-1 alpha-3
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "applicantId": "5c9e177b0a975a6eeccf5960"
}
```

**Errors:**
- `400 PROVIDER_NOT_SUMSUB` — KYC provider is not Sumsub
- `400 KYC_DISABLED` — KYC is disabled
- `400 ALREADY_APPROVED` — User already verified

### Webhook Route

#### POST /api/webhook/sumsub
Sumsub webhook endpoint. No auth header — verified via HMAC signature.

**Headers:**
- `X-App-Signature: sha256=<hmac_hex>`

**Payload:**
```json
{
  "type": "applicantReviewed|applicantPending|...",
  "payload": {
    "externalUserId": "user_mongo_id",
    "reviewResult": {
      "reviewAnswer": "GREEN|RED"
    }
  }
}
```

**Events Handled:**
- `applicantReviewed` + `GREEN` → User KYC approved
- `applicantReviewed` + `RED` → User KYC rejected
- `applicantPending` → User KYC status set to pending

### Admin Routes (`/api/admin`)

#### GET /api/admin/kyc-settings
Returns all KYC configuration keys with source badges.

**Auth:** Required (Admin)

**Response:**
```json
{
  "settings": [
    {
      "key": "KYC_ENABLED",
      "value": "true",
      "rawValue": "true",
      "source": "default",
      "secret": false
    },
    {
      "key": "SUMSUB_APP_TOKEN",
      "value": "app_…9f3a",
      "rawValue": "app_t_1234567890abcdef",
      "source": "db",
      "secret": true
    }
  ]
}
```

#### PUT /api/admin/kyc-settings
Update KYC configuration.

**Auth:** Required (Admin)

**Request Body:**
```json
{
  "settings": {
    "KYC_ENABLED": "true",
    "KYC_PROVIDER": "sumsub",
    "SUMSUB_APP_TOKEN": "app_t_new_token",
    "SUMSUB_SECRET_KEY": "sec_new_secret"
  }
}
```

#### POST /api/admin/kyc-settings/test
Test Sumsub API connection.

**Auth:** Required (Admin)

**Response:**
```json
{
  "ok": true,
  "message": "Sumsub baglanti basarili"
}
```

## User Model Fields

Added to `server/src/models/User.js`:

```javascript
sumsubApplicantId: { type: String, default: null, sparse: true },
kycProvider: { type: String, enum: ['manual', 'sumsub'], default: 'manual' }
```

## KYC Status Flow

```
                    ┌──────────────┐
                    │ not_started  │
                    └──────┬───────┘
                           │
              ┌────────────┴────────────┐
              │ User starts KYC         │
              ▼                         ▼
    ┌─────────────┐           ┌─────────────────┐
    │   pending   │           │   pending       │
    │  (manual)   │           │   (sumsub)      │
    └──────┬──────┘           └────────┬────────┘
           │                           │
    ┌──────▼──────┐           ┌────────▼────────┐
    │ under_review│           │ WebSDK flow     │
    │  (admin)    │           │ Document+liveness│
    └──────┬──────┘           └────────┬────────┘
           │                           │
           │                    ┌──────▼──────┐
           │                    │  pending    │
           │                    │ (webhook)   │
           │                    └──────┬──────┘
           │                           │
    ┌──────▼───────────────────────────▼──────┐
    │         Review Result                    │
    │    ┌───────────┴───────────┐             │
    │    ▼                       ▼             │
    │ ┌──────────┐        ┌──────────┐         │
    │ │ approved │        │ rejected │         │
    │ └──────────┘        └──────────┘         │
    └──────────────────────────────────────────┘
           │                       │
           ▼                       ▼
    ┌──────────┐           ┌──────────────┐
    │ expired  │           │ resubmit     │
    │ (1 year) │           │ (new session)│
    └──────────┘           └──────────────┘
```

## HMAC Signature Verification

Sumsub requires HMAC-SHA256 signatures for API requests:

```javascript
import crypto from 'crypto';

function hmacSignature(secretKey, ts, method, urlPath, body = '') {
  const payload = ts + method + urlPath + body;
  return crypto.createHmac('sha256', secretKey).update(payload).digest('hex');
}

// Headers sent with every request:
{
  'X-App-Token': appToken,
  'X-App-Access-Sig': `sha256=${signature}`,
  'X-App-Access-Ts': unixTimestamp,
}
```

## WebSDK Integration

The client loads Sumsub's WebSDK from CDN:

```javascript
// 1. Load SDK script
const script = document.createElement('script');
script.src = 'https://cdn.sumsub.com/websdk/resources/sumsub-websdk.js';
document.head.appendChild(script);

// 2. Initialize with token from POST /api/kyc/init-session
window.SumSub(token, 'sumsub-websdk-anchor', {
  lang: 'tr',
  onReady: () => console.log('SDK ready'),
  onComplete: () => console.log('Verification complete'),
  onError: (err) => console.error('SDK error:', err),
});
```

## Testing

### Unit Tests

```bash
# Run Sumsub-specific tests
node --test server/test/sumsub.test.js

# Run all KYC tests (including existing manual flow)
node --test server/test/kyc.test.js
```

**Test Coverage:**
- `sumsub.test.js`: 14 tests — config store, provider branching, HMAC signatures
- `kyc.test.js`: 23 tests — manual KYC flow, requirements, admin operations

### Sandbox Mode

1. Create Sumsub account at https://cockpit.sumsub.com
2. Enable Sandbox mode in dashboard
3. Copy API token and secret key to `.env` or admin panel
4. Set `KYC_PROVIDER=sumsub` in admin panel
5. Test with sandbox documents (Sumsub provides test IDs)

## Deployment Checklist

- [ ] Sumsub account created (sandbox + production)
- [ ] API credentials configured (`.env` or admin panel)
- [ ] Webhook URL configured in Sumsub dashboard: `https://your-domain.com/api/webhook/sumsub`
- [ ] Webhook secret configured in Sumsub dashboard
- [ ] Verification level created in Sumsub dashboard
- [ ] `SUMSUB_LEVEL_NAME` matches level name in Sumsub dashboard
- [ ] KYC enabled in admin panel (`/admin/kyc-settings`)
- [ ] Provider set to `sumsub` in admin panel
- [ ] Production API credentials swapped (replace sandbox keys)
- [ ] Webhook signature verification enabled in production
