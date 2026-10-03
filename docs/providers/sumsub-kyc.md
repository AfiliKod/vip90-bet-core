# Sumsub KYC Provider Integration

## Overview

Sumsub identity verification integration for VIP90.bet. Automates KYC (Know Your Customer) verification with document capture, liveness detection, and AML screening.

**Provider:** Sumsub (3rd-party)
**Type:** Identity Verification (KYC)
**Coverage:** 220+ countries
**Pricing:** $0.80-$2.50 per verification (volume discounts at 50k+/month)
**Website:** https://sumsub.com

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Client (React)                       │
│  ┌──────────────────┐  ┌──────────────────────────────┐ │
│  │  Admin Panel      │  │  User KYC Page (/kyc)        │ │
│  │  Settings>Modules │  │  - Status display             │ │
│  │  - Toggle KYC     │  │  - Sumsub WebSDK integration  │ │
│  │  (KYC card)       │  │  - Real-time socket updates    │ │
│  │    settings       │  └──────────────────────────────┘ │
│  │  - Provider select│                                  │
│  │  - API config     │  ┌──────────────────────────────┐ │
│  │  Compliance>KYC   │  │  Admin KYC Review (KYC tab)  │ │
│  │  - Review docs    │  │  - Submission list             │ │
│  └──────────────────┘  │  - Approve/reject              │ │
│                         └──────────────────────────────┘ │
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
│  │  - applicantReviewed -> approve/reject             │  │
│  │  - applicantPending -> update status               │  │
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

## How It Works

### User Flow

1. User navigates to `/kyc`
2. If provider is `sumsub`, "KYC Dogrulamasini Baslat" button is shown
3. User clicks button -> `POST /api/kyc/init-session`
4. Server creates Sumsub applicant, generates SDK token
5. Sumsub WebSDK loads from CDN and opens in-page
6. User submits documents + liveness check via Sumsub SDK
7. Sumsub reviews (automated + manual if needed)
8. Webhook fires: `applicantReviewed` with GREEN/RED
9. Server updates `kycStatus` and `kycVerified` on User model
10. Real-time socket event `kyc:status` sent to user
11. Email notification sent (approval or rejection with reason)

### Admin Flow

1. Admin navigates to **Settings → Modules** (`/admin/platform?tab=modules`) -> toggles "KYC Identity Verification" on (new installations start with it off)
2. Admin opens the KYC card on the same Modules tab (the old `/admin/module-settings` path redirects there) -> KYC settings
3. Selects "Sumsub" as provider
4. Enters API credentials (App Token, Secret Key, Level Name, Webhook Secret)
5. Clicks "Baglanti Testi" to verify credentials
6. Configures webhook URL in Sumsub dashboard: `https://domain.com/api/webhook/sumsub`
7. Switches to production credentials when ready

## Registration & Going Live

### Step 1: Create Sumsub Account

1. Go to https://cockpit.sumsub.com and sign up
2. Complete business registration (company name, industry, expected volume)
3. Wait for account approval (usually 1-2 business days)

### Step 2: Sandbox Testing

1. In Sumsub dashboard, enable **Sandbox mode**
2. Go to **Settings -> API Keys** and copy:
   - **App Token** (starts with `app_t_`)
   - **Secret Key** (starts with `sec_`)
3. Go to **Settings -> Webhooks** and set:
   - **URL:** `https://your-domain.com/api/webhook/sumsub`
   - **Secret:** Generate and copy
4. Go to **Settings -> Verification Levels** and create:
   - Level name: `basic-kyc-level` (or match `SUMSUB_LEVEL_NAME`)
5. Enter credentials in the KYC card under **Settings → Modules**
6. Test with sandbox test documents provided by Sumsub

### Step 3: Production

1. In Sumsub dashboard, switch to **Production mode**
2. Generate new **production** API keys (different from sandbox)
3. Update credentials in VIP90.bet admin panel
4. Update webhook URL to production domain
5. Configure webhook secret for production
6. Set `KYC_PROVIDER=sumsub` and `KYC_ENABLED=true`

### Step 4: Compliance

- Sumsub handles AML screening automatically
- Review rejected cases in Sumsub dashboard
- Set up webhook notifications for rejected applications
- Monitor verification success rates in Sumsub analytics

## Files

| File | Purpose |
|------|---------|
| `server/src/config/kyc.js` | KYC config store (DB-first, env fallback, 30s TTL cache) |
| `server/src/services/sumsubService.js` | Sumsub API client (HMAC-SHA256 auth) |
| `server/src/routes/kyc.js` | KYC routes (`GET /status`, `POST /init-session`, `POST /documents`) |
| `server/src/routes/sumsubWebhook.js` | Webhook handler (HMAC verify, approve/reject) |
| `server/src/services/kyc.js` | KYC service (dual provider branching) |
| `server/src/models/User.js` | User model (`sumsubApplicantId`, `kycProvider` fields) |
| `server/src/models/KycDocument.js` | KycDocument model |
| `server/src/controllers/admin.js` | Admin KYC settings + review controllers |
| `server/src/routes/admin.js` | Admin KYC settings + review routes |
| `server/src/modules/registry.js` | `kyc-verification` module definition |
| `server/src/app.js` | Route mounting (`/api/kyc`, `/api/webhook/sumsub`) |
| `client/src/pages/Kyc.jsx` | User KYC page (status + Sumsub WebSDK) |
| `client/src/pages/admin/Modules.jsx` | KYC card body (`KycSettingsBody`) in Settings → Modules |
| `client/src/pages/admin/KycReview.jsx` | Admin KYC review page |
| `client/src/App.jsx` | Client routes (`/kyc`, `/admin/kyc`) |

## Configuration

### Environment Variables (.env)

```bash
# Sumsub API credentials (sandbox or production)
SUMSUB_APP_TOKEN=app_t_your_token
SUMSUB_SECRET_KEY=sec_your_secret_key
SUMSUB_LEVEL_NAME=basic-kyc-level
SUMSUB_WEBHOOK_SECRET=whsec_your_webhook_secret
```

### Admin Panel Settings

Accessible under **Settings → Modules** -> KYC card:

| Key | Default | Description |
|-----|---------|-------------|
| `KYC_ENABLED` | `true` | Enable/disable entire KYC system |
| `KYC_PROVIDER` | `manual` | `manual` (admin review) or `sumsub` (automated) |
| `SUMSUB_APP_TOKEN` | `''` | Sumsub API application token |
| `SUMSUB_SECRET_KEY` | `''` | Sumsub HMAC secret key |
| `SUMSUB_LEVEL_NAME` | `basic-kyc-level` | Sumsub verification level |
| `SUMSUB_WEBHOOK_SECRET` | `''` | Webhook signature verification secret |

**Source Priority:** DB (admin panel) -> `.env` -> defaults

## API Endpoints

### User Routes (`/api/kyc`)

Module-gated: requires `kyc-verification` module enabled.

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
  "provider": "manual|sumsub",
  "enabled": true
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

Sumsub webhook endpoint. No auth header — verified via HMAC signature. Not module-gated (Sumsub server calls this directly).

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
- `applicantReviewed` + `GREEN` -> User KYC approved, email sent
- `applicantReviewed` + `RED` -> User KYC rejected with reason, email sent
- `applicantPending` -> User KYC status set to pending

### Admin Routes (`/api/admin`)

#### GET /api/admin/kyc-settings
Returns all KYC configuration keys with source badges.

#### PUT /api/admin/kyc-settings
Update KYC configuration.

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

#### GET /api/admin/kyc/submissions
List KYC submissions with filtering and pagination.

**Query params:** `status`, `page`, `limit`, `search`

#### GET /api/admin/kyc/stats
KYC statistics (by status, recent submissions, approved today).

#### GET /api/admin/kyc/submissions/:id
Get user KYC detail with documents.

#### POST /api/admin/kyc/submissions/:id/approve
Approve KYC submission.

#### POST /api/admin/kyc/submissions/:id/reject
Reject KYC submission.

**Request Body:** `{ "reason": "Document quality too low" }`

#### POST /api/admin/kyc/submissions/:id/under-review
Set KYC status to under_review.

## User Model Fields

Added to `server/src/models/User.js`:

```javascript
kycProvider: { type: String, enum: ['manual', 'sumsub'], default: 'manual' },
sumsubApplicantId: { type: String, default: null, sparse: true },
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

# Run all KYC tests (including manual flow)
node --test server/test/kyc.test.js
```

**Test Coverage:**
- `sumsub.test.js`: 14 tests — config store, provider branching, HMAC signatures
- `kyc.test.js`: 23 tests — manual KYC flow, requirements, admin operations

### Sandbox Mode

1. Create Sumsub account at https://cockpit.sumsub.com
2. Enable Sandbox mode in dashboard
3. Copy API token and secret key to the KYC card under **Settings → Modules**
4. Set provider to `sumsub`
5. Test with sandbox documents (Sumsub provides test IDs)

## Deployment Checklist

- [ ] Sumsub account created (sandbox + production)
- [ ] API credentials configured (KYC card under Settings → Modules)
- [ ] Webhook URL configured in Sumsub dashboard: `https://your-domain.com/api/webhook/sumsub`
- [ ] Webhook secret configured in Sumsub dashboard
- [ ] Verification level created in Sumsub dashboard
- [ ] `SUMSUB_LEVEL_NAME` matches level name in Sumsub dashboard
- [ ] `kyc-verification` module enabled in admin panel (Settings → Modules)
- [ ] Provider set to `sumsub` in admin panel
- [ ] Production API credentials swapped (replace sandbox keys)
- [ ] Webhook signature verification enabled in production
