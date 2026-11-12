# İP-6 Callback Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement work package İP-6 of the approved multi-tenant design: ensure all incoming provider callbacks and webhooks are attributed to the correct tenant and verified using that tenant's dedicated credentials. Slikair callbacks attribute tenant from the stored payment or payout record; Sumsub webhooks carry the tenant identifier in the webhook URL with secrets selected before the request body is parsed; Igames operates per-tenant agent accounts and credentials (K13, K22) with per-tenant callback URLs, `{tenantId, palaceUserCode}` user lookup, and atomic transaction plus ledger rows; in-house provider links via `Tenant.providerOperatorId` with operator key in the callback URL and player-tenant boundary verification; game-host themes are dynamically injected from the launch token while preserving full backward compatibility for legacy callback shapes and fixed themes (spec Y4). Acceptance is verified via §8.4 callback tests and by ensuring the existing in-house provider customer contract test passes unchanged.

**Architecture:** Incoming provider interactions arrive from multiple external architectures. Slikair sends unauthenticated webhook notifications without tenant indicators; core resolves the tenant by performing a platform-authorized query on the stored `SlikairPayment` or `SlikairPayout` by `payinId` or `merchantReference`, then binds execution via `runWithTenant(payment.tenantId)` where Slikair API status queries execute against that specific tenant's merchant credentials. Sumsub webhooks route through `/api/webhook/sumsub/:tenantId`, reading raw request bytes before body parsing to load the tenant's `SUMSUB_WEBHOOK_SECRET` via `kycConfig.get('SUMSUB_WEBHOOK_SECRET', { tenantId })`, verifying HMAC-SHA256 signatures before execution, and rejecting cross-tenant `externalUserId` lookups with 404 `USER_NOT_FOUND`. The igames add-on registers its credential schema with core (`registerTenantCredentialSchema`), exposes `/api/igames/callback/:tenantId`, verifies tenant-specific `callback-token` headers, looks up players via compound `{ tenantId, palaceUserCode }`, and commits atomic `CasinoRound` and `createTransaction` records with tenant-scoped receipt keys. The in-house provider resolves `Operator` from `/api/inhouse-provider/callback/:operatorKey`, verifies HMAC signatures with `operator.walletCallbackSecret`, resolves the owning tenant via `Tenant.findOne({ providerOperatorId: operator._id })`, and validates that `externalPlayerId` belongs to that tenant before executing balance adjustments. Launch tokens carry tenant theme styling injected into game-host via `applySiteTheme`, falling back seamlessly to existing theme endpoints when absent.

**Tech Stack:** Node >= 22 (ESM), Express 4, Mongoose 8.24, `node:test` + `node:assert/strict`, crypto (HMAC-SHA256, timingSafeEqual), local MongoDB (replica set `rs0` on 127.0.0.1:27017).

**Spec:** `docs/superpowers/specs/2026-11-09-multi-tenant-design.md`. Sections used: §1.3 (integrations and callbacks inventory), §2.1 (TEN, PROV, CAT collection classifications), §2.2 (callback process flows), §3 (#3 in-house callback player scoping, #5 igames callback scoping, #11 webhook tenant routing), §4.5 (per-tenant settings and credential stores), §6.1 (modes and startup checks), §7.1 (İP-6 row), §8.4 (callback attribution test suite), §9 (G-4 callback financial isolation, G-9 secret isolation), K13/K22 (igames per-tenant agent accounts and credentials), K19-K27 (owner decisions), Y4 (in-house backward compatibility).

---

## Global Constraints

- **Never weaken an existing check:** Existing middleware validations (`requireAuth`, `enforceRiskCheck`, `enforceResponsibleGaming`, IP allow-lists, timestamp expiration, signature checks) remain strictly active. Tenant attribution adds defense-in-depth on top of existing security boundaries.
- **Fail closed on missing or unresolvable tenant (spec §9 G-4):** Any incoming callback whose tenant cannot be definitively determined must be rejected and must never alter player balances or create transactions.
- **Single mode backward compatibility (spec §6.1, §6.3, Y4):** When running in `TENANCY_MODE=single`, endpoints without tenant parameters (`/api/webhook/sumsub`, `/api/inhouse-provider/callback`, `/api/igames/callback`, `/api/slikair/webhook/payin`) continue to operate against the default tenant without modification.
- **Core never imports premium add-ons:** Core provides registration hooks and interfaces (`registerTenantCredentialSchema`, `registerTenantProvisioningHook`, `runWithTenant`, `runAsPlatform`, `tenantFilter`, `defineTenantModel`). Premium add-ons (igames, in-house) attach dynamically through core hooks without core importing private code.
- **Per-tenant credential isolation (spec §4.5, §9 G-9):** Tenant credentials must never leak across tenants or fall back to environment variables in multi-tenant mode (`TENANCY_MODE=multi`).
- **Scoped receipt and ledger keys (spec §2.1, §3 #5):** Callback receipts and transaction idempotency keys must incorporate the tenant identifier (e.g. `${tenantId}:${userCode}:${roundId}:${transType}`) to prevent cross-tenant deduplication collisions.
- **Game-host theme backward compatibility (spec Y4):** If the launch token does not contain theme parameters, game-host must retain its current behavior (`api.get('/theme')` or fallback defaults) without errors.
- **Preserve existing customer contracts (spec Y4):** The in-house provider's existing customer test suite (`custodialSessionGames.test.js`) must pass completely unchanged.
- **Isolated test execution:** Tests use dedicated database names on `mongodb://127.0.0.1:27017` with replica set `rs0`, allow override via `TENANCY_TEST_MONGO`, and drop test databases in cleanup. Tasks must never run the global root test command.
- **Public repository hygiene:** No internal IP addresses, server paths, personal emails, or em dashes in documentation, commit messages, or code comments. Reference add-on repositories as "the igames add-on repository" and "the in-house add-on repository".

---

## Review Focus

- **Slikair attribution integrity (§8.4):** Slikair payment and payout webhooks must resolve the tenant solely from the stored `SlikairPayment` or `SlikairPayout` document and verify status against Slikair using that specific tenant's credentials. Webhook requests with an unknown or spoofed `payinId` must never credit any user.
- **Sumsub pre-parse secret selection (§8.4):** The Sumsub webhook URL must provide the tenant parameter (`/api/webhook/sumsub/:tenantId`). The secret must be retrieved before parsing and validating the request body. If the signature matches another tenant's secret, or if the `externalUserId` belongs to a different tenant, the request must fail without updating KYC status.
- **Igames compound lookup and ledger atomicity (K13, K22, §8.4):** Igames callback handling must verify the request against the tenant's configured `callbackToken`, look up the player using compound `{ tenantId, palaceUserCode }`, and reject requests where the user code belongs to another tenant. Every valid callback must atomically commit a `CasinoRound` and `createTransaction` ledger row.
- **In-house provider operator and player scoping (§8.4, Y4):** The in-house callback endpoint must resolve the provider operator via `:operatorKey`, verify HMAC signatures with `operator.walletCallbackSecret`, map to the owning tenant via `Tenant.providerOperatorId`, and ensure `externalPlayerId` belongs to that tenant. Legacy single-operator callbacks without `:operatorKey` must continue to work via default operator fallback.
- **Game-host theme propagation (Y4):** Theme configurations must pass safely from the operator launch flow through the provider launch JWT and be applied by game-host CSS injectors, while preserving default styling when theme attributes are omitted.

---

## File Structure

| File | Repository | Responsibility | Task |
|---|---|---|---|
| `server/src/tenancy/callbackAttribution.js` | core | Platform-scoped lookup helpers for unattributed webhooks (Slikair payment/payout) | 1 |
| `server/src/controllers/slikairController.js` | core | Slikair webhook handling using tenant from stored record and tenant-scoped status checks | 1 |
| `server/src/config/slikairConfig.js` | core | Tenant-aware Slikair credential retrieval | 1 |
| `scripts/lint-tenancy.mjs` | core | Allow-list registration for `callbackAttribution.js` platform lookups | 1 |
| `server/test/slikairCallbackAttribution.test.js` | core | Unit and integration tests for Slikair callback attribution and status verification | 1 |
| `server/src/routes/sumsubWebhook.js` | core | Sumsub webhook routing with `:tenantId` parameter, pre-parse secret lookup, player scoping | 2 |
| `server/src/config/kyc.js` | core | Tenant-scoped KYC and Sumsub secret resolution | 2 |
| `server/src/app.js` | core | Raw body capture middleware mounting for Sumsub and in-house callback endpoints | 2 |
| `server/test/sumsubCallbackAttribution.test.js` | core | Unit and integration tests for Sumsub webhook tenant routing and signature validation | 2 |
| `server/src/tenancy/index.js` | core | Re-export tenancy primitives, credential schema registry, and attribution helpers for add-ons | 3 |
| `server/src/tenancy/provisioning.js` | core | Validate and maintain credential schema definitions registered by add-on modules | 3 |
| `server/test/tenancyCallbackHookSurface.test.js` | core | Tests verifying core public surface exports for add-on integration | 3 |
| `igamesCredentials.js` | igames | Tenant-scoped credential resolution and credential schema registration with core | 4 |
| `igames.js` | igames | Per-tenant callback route `/callback/:tenantId`, token check, compound `{tenantId, palaceUserCode}` lookup, transaction write | 4 |
| `igamesCallbackReceipt.js` | igames | Tenant-scoped receipt keys preventing cross-tenant deduplication collisions | 4 |
| `test/igamesCallbackAttribution.test.js` | igames | Integration tests for igames per-tenant callback attribution and isolation | 4 |
| `inhouseProviderProxy.js` | inhouse | Operator key in callback URL `/callback/:operatorKey`, HMAC validation, player-tenant check | 5 |
| `inhouseProviderClient.js` | inhouse | Forward tenant context and theme configuration during launch initialization | 5 |
| `engine/test/inhouseCallbackAttribution.test.js` | inhouse | Integration tests for in-house operator resolution and player-tenant isolation | 5 |
| `engine/routes/launch.js` | inhouse | Embed theme variables into launch token JWT | 6 |
| `engine/routes/session.js` | inhouse | Forward theme from launch token to session response payload | 6 |
| `game-host/src/App.jsx` | inhouse | Receive theme from session response and invoke style injector | 6 |
| `game-host/src/theme/applySiteTheme.js` | inhouse | Apply theme CSS variables from launch session with fallback to existing `/theme` endpoint | 6 |
| `engine/test/inhouseThemeLaunch.test.js` | inhouse | Tests for launch token theme propagation and backward compatibility | 6 |
| `server/test/callbackAttributionAcceptance.test.js` | core | Acceptance test suite for §8.4 callback attribution covering all 5 provider flows | 7 |
| `CHANGELOG.md` | core | Document İP-6 callback attribution changes and backward compatibility guarantees | 8 |

---

## Parallelism

Tasks in Wave A run in parallel across separate files and repositories.

| Wave | Tasks (run in parallel, separate worktrees) | Repository | Depends on |
|---|---|---|---|
| A | 1 (Slikair callback attribution) | core | none |
| A | 2 (Sumsub webhook tenant routing) | core | none |
| A | 3 (Core tenancy hook surface) | core | none |
| A | 4 (Igames callback attribution and credentials) | igames | none |
| A | 5 (In-house provider callback attribution) | inhouse | none |
| A | 6 (In-house game-host theme from launch token) | inhouse | none |
| B | 7 (Acceptance test suite: §8.4 Callback attribution) | core | 1, 2, 3, 4, 5, 6 |
| C | 8 (CHANGELOG and documentation) | core | 7 |

**Conflict notes:**
- Tasks 1, 2, and 3 edit mutually exclusive files within `vip90-bet-core`.
- Task 4 edits only files within the igames add-on repository.
- Tasks 5 and 6 edit distinct sets of files within the in-house add-on repository: Task 5 edits `inhouseProviderProxy.js` and `inhouseProviderClient.js`; Task 6 edits `engine/routes/launch.js`, `engine/routes/session.js`, and `game-host/src/*`.
- Task 7 introduces the end-to-end integration acceptance test file `server/test/callbackAttributionAcceptance.test.js`.
- Task 8 updates documentation and `CHANGELOG.md`.

---

### Task 1: Slikair payment and payout callback attribution (Repository: core)

**Files:**
- Create: `server/src/tenancy/callbackAttribution.js`
- Modify: `server/src/controllers/slikairController.js`
- Modify: `server/src/config/slikairConfig.js`
- Modify: `scripts/lint-tenancy.mjs`
- Test: `server/test/slikairCallbackAttribution.test.js`

**Interfaces:**
- Consumes: `runAsPlatform`, `runWithTenant`, `SlikairPayment`, `SlikairPayout`, `slikairConfig.getAll()`.
- Produces: `findPaymentForCallback(payinId)` and `findPayoutForCallback({ payoutId, merchantReference })` helper in `callbackAttribution.js`; `handlePayinWebhook` and `handlePayoutWebhook` resolve the tenant from the stored record, execute all balance adjustments and status verifications inside `runWithTenant(payment.tenantId)`, stamp transactions with tenant-scoped idempotency keys (`slikair_payin_${tenantId}_${payinId}`), and reject or ignore unresolvable callbacks without crediting (spec §9 G-4).

- [ ] **Step 1: Write the failing tests** in `server/test/slikairCallbackAttribution.test.js`:
```javascript
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import SlikairPayment from '../src/models/SlikairPayment.js';
import SlikairPayout from '../src/models/SlikairPayout.js';
import Transaction from '../src/models/Transaction.js';
import Setting from '../src/models/Setting.js';
import { runWithTenant, runAsPlatform } from '../src/tenancy/context.js';
import {
  handlePayinWebhook,
  handlePayoutWebhook,
  _setSlikairService,
} from '../src/controllers/slikairController.js';
import { findPaymentForCallback, findPayoutForCallback } from '../src/tenancy/callbackAttribution.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip6_t1_slikair';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

let u1, u2;
const savedMode = process.env.TENANCY_MODE;
const savedEnforcement = process.env.TENANCY_ENFORCEMENT;

before(async () => {
  process.env.TENANCY_MODE = 'multi';
  process.env.TENANCY_ENFORCEMENT = 'enforce';
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  u1 = await runWithTenant(T1, () => User.create({ username: 'slik_u1', email: 'u1@example.com', password: 'test', balance: 100 }));
  u2 = await runWithTenant(T2, () => User.create({ username: 'slik_u2', email: 'u2@example.com', password: 'test', balance: 200 }));
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (savedMode === undefined) delete process.env.TENANCY_MODE; else process.env.TENANCY_MODE = savedMode;
  if (savedEnforcement === undefined) delete process.env.TENANCY_ENFORCEMENT; else process.env.TENANCY_ENFORCEMENT = savedEnforcement;
});

test('findPaymentForCallback returns stored payment with tenantId', async () => {
  const p1 = await runWithTenant(T1, () => SlikairPayment.create({
    userId: u1._id,
    requestId: 'req-t1-1',
    payinId: 'payin-t1-1',
    amount: 50,
    currency: 'TRY',
    paymentMethod: 'card',
    email: 'u1@example.com',
    country: 'TR',
    status: 'created',
  }));

  const found = await findPaymentForCallback('payin-t1-1');
  assert.ok(found);
  assert.equal(String(found._id), String(p1._id));
  assert.equal(String(found.tenantId), String(T1));
});

test('handlePayinWebhook executes under payment tenant and credits only that player', async () => {
  const payinId = 'payin-t1-success';
  const payment = await runWithTenant(T1, () => SlikairPayment.create({
    userId: u1._id,
    requestId: 'req-t1-success',
    payinId,
    amount: 150,
    currency: 'TRY',
    paymentMethod: 'card',
    email: 'u1@example.com',
    country: 'TR',
    status: 'pending',
  }));

  let verifiedTenantUsed = null;
  _setSlikairService({
    getPaymentStatus: async (id) => {
      verifiedTenantUsed = mongoose.connection.readyState === 1;
      return { status: 'succeeded', amount: 150, currency: 'TRY' };
    },
  });

  const req = {
    body: {
      payin_id: payinId,
      status: 'succeeded',
      status_code: 201,
      amount: 150,
      currency: 'TRY',
    },
  };
  let responseJson = null;
  const res = {
    status: (code) => ({
      json: (data) => { responseJson = { code, data }; return responseJson; },
    }),
  };

  await handlePayinWebhook(req, res, (e) => { throw e; });
  assert.equal(responseJson.code, 200);

  const updatedU1 = await runAsPlatform('verify u1', () => User.findById(u1._id));
  assert.equal(updatedU1.balance, 250);

  const updatedU2 = await runAsPlatform('verify u2', () => User.findById(u2._id));
  assert.equal(updatedU2.balance, 200);

  const tx = await runAsPlatform('verify tx', () => Transaction.findOne({ idempotencyKey: `slikair_payin_${T1}_${payinId}` }));
  assert.ok(tx);
  assert.equal(String(tx.tenantId), String(T1));
});

test('handlePayinWebhook with unknown payin_id credits nothing', async () => {
  const req = {
    body: {
      payin_id: 'non-existent-payin',
      status: 'succeeded',
      amount: 500,
    },
  };
  let responseJson = null;
  const res = {
    status: (code) => ({ json: (data) => { responseJson = { code, data }; } }),
  };

  await handlePayinWebhook(req, res, (e) => { throw e; });
  assert.equal(responseJson.code, 200);

  const u1Check = await runAsPlatform('check u1', () => User.findById(u1._id));
  assert.equal(u1Check.balance, 250);
});
```

- [ ] **Step 2: Implement platform attribution helper** in `server/src/tenancy/callbackAttribution.js`:
```javascript
import { runAsPlatform } from './context.js';
import SlikairPayment from '../models/SlikairPayment.js';
import SlikairPayout from '../models/SlikairPayout.js';

export async function findPaymentForCallback(payinId) {
  if (!payinId) return null;
  return runAsPlatform('slikair_webhook_attribution', async () => {
    return SlikairPayment.findOne({ payinId }).lean();
  });
}

export async function findPayoutForCallback({ payoutId, merchantReference }) {
  if (!payoutId && !merchantReference) return null;
  return runAsPlatform('slikair_payout_attribution', async () => {
    const filter = payoutId ? { payoutId } : { merchantReference };
    return SlikairPayout.findOne(filter).lean();
  });
}
```

- [ ] **Step 3: Register `server/src/tenancy/callbackAttribution.js` in `scripts/lint-tenancy.mjs`**:
Add `'server/src/tenancy/callbackAttribution.js'` to `RUN_AS_PLATFORM_ALLOWLIST`.

- [ ] **Step 4: Update `server/src/controllers/slikairController.js`**:
In `handlePayinWebhook`:
Call `findPaymentForCallback(payin_id)`. If missing or if tenant cannot be determined, return 200 without crediting.
Wrap the getPaymentStatus verification, balance adjustments, and transaction creation inside `runWithTenant(payment.tenantId, async () => { ... })`.
Update the transaction `idempotencyKey` to `slikair_payin_${payment.tenantId || 'single'}_${payment.payinId}`.
In `handlePayoutWebhook`:
Call `findPayoutForCallback({ payoutId, merchantReference })`. Wrap all verification and payout reconciliation in `runWithTenant(payout.tenantId, async () => { ... })`.

- [ ] **Step 5: Run task test**:
Run: `node --test server/test/slikairCallbackAttribution.test.js`
Assert test passes with 0 failures.

- [ ] **Step 6: Commit**:
```bash
git add server/src/tenancy/callbackAttribution.js server/src/controllers/slikairController.js server/src/config/slikairConfig.js scripts/lint-tenancy.mjs server/test/slikairCallbackAttribution.test.js
git commit -m "feat(tenancy): attribute Slikair callbacks to tenant from stored records"
```

---

### Task 2: Sumsub webhook tenant URL routing and pre-parse secret selection (Repository: core)

**Files:**
- Modify: `server/src/routes/sumsubWebhook.js`
- Modify: `server/src/config/kyc.js`
- Modify: `server/src/app.js`
- Test: `server/test/sumsubCallbackAttribution.test.js`

**Interfaces:**
- Consumes: `kycConfig.get('SUMSUB_WEBHOOK_SECRET', { tenantId })`, `Tenant`, `User`, `tenantFilter`, `runWithTenant`.
- Produces: Route `/webhook/sumsub/:tenantId` with backward-compatible fallback to `/webhook/sumsub` for single mode; rawBody capture for both patterns in `app.js`; tenant lookup and secret selection before signature validation; cross-tenant `externalUserId` lookups return 404 (spec §8.4); valid signature and player update KYC status under `runWithTenant(tenantId)`.

- [ ] **Step 1: Write the failing tests** in `server/test/sumsubCallbackAttribution.test.js`:
```javascript
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import crypto from 'crypto';
import User from '../src/models/User.js';
import Tenant from '../src/models/Tenant.js';
import Setting from '../src/models/Setting.js';
import { runWithTenant, runAsPlatform } from '../src/tenancy/context.js';
import { kycConfig } from '../src/config/kyc.js';
import sumsubWebhookRouter from '../src/routes/sumsubWebhook.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip6_t2_sumsub';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();
const SECRET_T1 = 'sumsub_secret_tenant_1';
const SECRET_T2 = 'sumsub_secret_tenant_2';

let server, baseUrl, u1, u2;
const savedMode = process.env.TENANCY_MODE;

before(async () => {
  process.env.TENANCY_MODE = 'multi';
  process.env.OPERATOR_SECRET_ENCRYPTION_KEY = 'c'.repeat(64);
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  await Tenant.create([
    { _id: T1, key: 'tenant1', name: 'Tenant 1', status: 'active' },
    { _id: T2, key: 'tenant2', name: 'Tenant 2', status: 'active' },
  ]);

  u1 = await runWithTenant(T1, () => User.create({ username: 'sumsub_p1', email: 'p1@t1.example.com', password: 'test', kycStatus: 'pending' }));
  u2 = await runWithTenant(T2, () => User.create({ username: 'sumsub_p2', email: 'p2@t2.example.com', password: 'test', kycStatus: 'pending' }));

  await kycConfig.set('SUMSUB_WEBHOOK_SECRET', SECRET_T1, null, { tenantId: T1 });
  await kycConfig.set('SUMSUB_WEBHOOK_SECRET', SECRET_T2, null, { tenantId: T2 });

  const app = express();
  app.use(['/api/webhook/sumsub', '/api/webhook/sumsub/:tenantId'], express.json({
    limit: '100kb',
    verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
  }));
  app.use('/api', sumsubWebhookRouter);

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (savedMode === undefined) delete process.env.TENANCY_MODE; else process.env.TENANCY_MODE = savedMode;
});

function sign(secret, body) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

test('POST /api/webhook/sumsub/:tenantId verifies with T1 secret and approves T1 player', async () => {
  const body = JSON.stringify({
    type: 'applicantReviewed',
    payload: { reviewResult: { reviewAnswer: 'GREEN' }, externalUserId: String(u1._id) },
  });
  const res = await fetch(`${baseUrl}/api/webhook/sumsub/${T1}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-app-signature': sign(SECRET_T1, body),
      'x-app-timestamp': String(Math.floor(Date.now() / 1000)),
    },
    body,
  });
  assert.equal(res.status, 200);

  const refreshedU1 = await runAsPlatform('verify u1 kyc', () => User.findById(u1._id));
  assert.equal(refreshedU1.kycStatus, 'approved');
  assert.equal(refreshedU1.kycVerified, true);
});

test('POST /api/webhook/sumsub/:tenantId signed with T2 secret returns 401', async () => {
  const body = JSON.stringify({
    type: 'applicantReviewed',
    payload: { reviewResult: { reviewAnswer: 'GREEN' }, externalUserId: String(u1._id) },
  });
  const res = await fetch(`${baseUrl}/api/webhook/sumsub/${T1}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-app-signature': sign(SECRET_T2, body),
      'x-app-timestamp': String(Math.floor(Date.now() / 1000)),
    },
    body,
  });
  assert.equal(res.status, 401);
});

test('POST /api/webhook/sumsub/:tenantId with T2 externalUserId returns 404', async () => {
  const body = JSON.stringify({
    type: 'applicantReviewed',
    payload: { reviewResult: { reviewAnswer: 'GREEN' }, externalUserId: String(u2._id) },
  });
  const res = await fetch(`${baseUrl}/api/webhook/sumsub/${T1}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-app-signature': sign(SECRET_T1, body),
      'x-app-timestamp': String(Math.floor(Date.now() / 1000)),
    },
    body,
  });
  assert.equal(res.status, 404);

  const refreshedU2 = await runAsPlatform('verify u2 kyc untouched', () => User.findById(u2._id));
  assert.equal(refreshedU2.kycStatus, 'pending');
});
```

- [ ] **Step 2: Update `server/src/routes/sumsubWebhook.js`**:
Mount handler on both `['/webhook/sumsub/:tenantId', '/webhook/sumsub']`.
Extract `targetTenant = req.params.tenantId`.
In `multi` mode, if `targetTenant` is absent, reject with 400.
Validate `Tenant` existence by ID or key. If invalid, return 404.
Retrieve `webhookSecret = await kycConfig.get('SUMSUB_WEBHOOK_SECRET', { tenantId: effectiveTenantId });`.
Perform HMAC verification against `req.rawBody` before processing body contents.
Inside `runWithTenant(effectiveTenantId, async () => { ... })`:
Look up `user = await User.findOne({ _id: externalUserId, tenantId: effectiveTenantId });`.
If user does not exist under `effectiveTenantId`, return 404 `USER_NOT_FOUND`.
If found, apply KYC changes, socket emission to `user:${user._id}`, and confirmation response.

- [ ] **Step 3: Update `server/src/app.js` mounting**:
Ensure raw body capture in `server/src/app.js` covers both `/api/webhook/sumsub` and `/api/webhook/sumsub/:tenantId`.

- [ ] **Step 4: Run task test**:
Run: `node --test server/test/sumsubCallbackAttribution.test.js`
Assert test passes with 0 failures.

- [ ] **Step 5: Commit**:
```bash
git add server/src/routes/sumsubWebhook.js server/src/config/kyc.js server/src/app.js server/test/sumsubCallbackAttribution.test.js
git commit -m "feat(kyc): route Sumsub webhooks with tenant URL and pre-parse secret validation"
```

---

### Task 3: Tenancy public surface and callback helper integration (Repository: core)

**Files:**
- Modify: `server/src/tenancy/index.js`
- Modify: `server/src/tenancy/provisioning.js`
- Test: `server/test/tenancyCallbackHookSurface.test.js`

**Interfaces:**
- Consumes: `registerTenantCredentialSchema`, `getTenantCredentialSchema`, `listTenantCredentialSchemas`, `runWithTenant`, `tenantFilter`.
- Produces: Export `findPaymentForCallback`, `findPayoutForCallback`, `tenantFilter`, and credential schema validation methods through `server/src/tenancy/index.js` so premium add-ons interact only with documented tenancy interfaces.

- [ ] **Step 1: Write the failing tests** in `server/test/tenancyCallbackHookSurface.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import * as tenancy from '../src/tenancy/index.js';

test('tenancy index re-exports required credential and callback attribution primitives', () => {
  assert.equal(typeof tenancy.registerTenantCredentialSchema, 'function');
  assert.equal(typeof tenancy.getTenantCredentialSchema, 'function');
  assert.equal(typeof tenancy.listTenantCredentialSchemas, 'function');
  assert.equal(typeof tenancy.runWithTenant, 'function');
  assert.equal(typeof tenancy.runAsPlatform, 'function');
  assert.equal(typeof tenancy.defineTenantModel, 'function');
  assert.equal(typeof tenancy.tenantFilter, 'function');
  assert.equal(typeof tenancy.findPaymentForCallback, 'function');
  assert.equal(typeof tenancy.findPayoutForCallback, 'function');
});

test('registerTenantCredentialSchema accepts valid module schema and validates duplicate rejection', () => {
  tenancy._resetTenancyRegistriesForTests();
  tenancy.registerTenantCredentialSchema('test_module', {
    fields: [
      { key: 'apiKey', label: 'API Key', secret: true, required: true },
      { key: 'callbackToken', label: 'Callback Token', secret: true },
    ],
  });

  const registered = tenancy.getTenantCredentialSchema('test_module');
  assert.ok(registered);
  assert.equal(registered.moduleId, 'test_module');
  assert.equal(registered.fields.length, 2);

  assert.throws(
    () => tenancy.registerTenantCredentialSchema('test_module', { fields: [{ key: 'k1', label: 'L1' }] }),
    /already registered/
  );
});
```

- [ ] **Step 2: Update `server/src/tenancy/index.js`**:
Import and export `tenantFilter` from `./tenantFilter.js`.
Import and export `findPaymentForCallback`, `findPayoutForCallback` from `./callbackAttribution.js`.

- [ ] **Step 3: Run task test**:
Run: `node --test server/test/tenancyCallbackHookSurface.test.js`
Assert test passes with 0 failures.

- [ ] **Step 4: Commit**:
```bash
git add server/src/tenancy/index.js server/src/tenancy/provisioning.js server/test/tenancyCallbackHookSurface.test.js
git commit -m "feat(tenancy): expose callback attribution and credential primitives on public surface"
```

---

### Task 4: Igames per-tenant callback attribution and credentials (Repository: igames)

**Files (in the igames add-on repository):**
- Modify: `igamesCredentials.js`
- Modify: `igames.js`
- Modify: `igamesCallbackReceipt.js`
- Test: `test/igamesCallbackAttribution.test.js`

**Interfaces:**
- Consumes: `registerTenantCredentialSchema` from core, `runWithTenant`, `User`, `CasinoRound`, `CasinoSession`, `createTransaction`.
- Produces: Per-tenant credential loading via `getIgamesCredentials({ tenantId })`; credential schema registration for module `'igames'`; endpoint `/callback/:tenantId` with `/callback` single-mode compatibility; token verification per tenant; compound `{ tenantId, palaceUserCode }` player lookup; scoped receipt key `${tenantId}:${userCode}:${roundId}:${transType}`; atomic `CasinoRound` and `createTransaction` committed inside `runWithTenant(tenantId)`.

- [ ] **Step 1: Write the failing tests** in `test/igamesCallbackAttribution.test.js` (in the igames add-on repository):
```javascript
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import User from '../../models/User.js';
import Setting from '../../models/Setting.js';
import CasinoSession from '../../models/CasinoSession.js';
import CasinoRound from '../../models/CasinoRound.js';
import Transaction from '../../models/Transaction.js';
import IgamesCallbackReceipt from '../igamesCallbackReceipt.js';
import { runWithTenant, runAsPlatform } from '../../tenancy/context.js';
import { getIgamesCredentials, saveIgamesCredentials } from '../igamesCredentials.js';
import igamesRouter from '../igames.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip6_t4_igames';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();
const TOKEN_T1 = 'callback_token_t1';
const TOKEN_T2 = 'callback_token_t2';

let server, baseUrl, u1, u2;

before(async () => {
  process.env.TENANCY_MODE = 'multi';
  process.env.OPERATOR_SECRET_ENCRYPTION_KEY = 'c'.repeat(64);
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  u1 = await runWithTenant(T1, () => User.create({ username: 'ig_p1', email: 'p1@t1.example.com', password: 'test', palaceUserCode: 'PALACE_101', balance: 500 }));
  u2 = await runWithTenant(T2, () => User.create({ username: 'ig_p2', email: 'p2@t2.example.com', password: 'test', palaceUserCode: 'PALACE_202', balance: 500 }));

  await saveIgamesCredentials({ callbackToken: TOKEN_T1, apiToken: 'api_t1' }, null, { tenantId: T1 });
  await saveIgamesCredentials({ callbackToken: TOKEN_T2, apiToken: 'api_t2' }, null, { tenantId: T2 });

  const app = express();
  app.use(express.json());
  app.use('/api/igames', igamesRouter);

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('Igames callback to /api/igames/callback/:tenantId with invalid callback-token returns 401', async () => {
  const res = await fetch(`${baseUrl}/api/igames/callback/${T1}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'callback-token': 'wrong_token',
    },
    body: JSON.stringify({ user_code: 'PALACE_101', trans_type: 1, trans_amount: 10, round_id: 'r1' }),
  });
  assert.equal(res.status, 401);
});

test('Igames callback to T1 with T2 palaceUserCode rejects and leaves balances intact', async () => {
  const res = await fetch(`${baseUrl}/api/igames/callback/${T1}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'callback-token': TOKEN_T1,
    },
    body: JSON.stringify({
      user_code: 'PALACE_202',
      trans_type: 1,
      trans_amount: 50,
      prebalance: 500,
      balance: 450,
      round_id: 'r_cross_1',
    }),
  });

  const refreshedU2 = await runAsPlatform('check u2', () => User.findById(u2._id));
  assert.equal(refreshedU2.balance, 500);

  const receipt = await runAsPlatform('check receipt', () => IgamesCallbackReceipt.findOne({ key: `${T1}:PALACE_202:r_cross_1:1` }));
  assert.equal(receipt, null);
});

test('Igames callback to T1 with valid T1 player writes CasinoRound and Transaction ledger row', async () => {
  const res = await fetch(`${baseUrl}/api/igames/callback/${T1}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'callback-token': TOKEN_T1,
    },
    body: JSON.stringify({
      user_code: 'PALACE_101',
      trans_type: 1,
      trans_amount: 25,
      prebalance: 500,
      balance: 475,
      round_id: 'r_valid_1',
      game_code: 'slot_gem',
    }),
  });
  assert.equal(res.status, 200);

  const round = await runAsPlatform('check round', () => CasinoRound.findOne({ userId: u1._id, gameId: 'slot_gem' }));
  assert.ok(round);
  assert.equal(round.bet, 25);
  assert.equal(String(round.tenantId), String(T1));

  const tx = await runAsPlatform('check tx', () => Transaction.findOne({ idempotencyKey: `igames_${T1}_PALACE_101_r_valid_1_1` }));
  assert.ok(tx);
  assert.equal(String(tx.tenantId), String(T1));
});
```

- [ ] **Step 2: Update `igamesCredentials.js` in the igames add-on repository**:
Register credential schema on import:
```javascript
import { registerTenantCredentialSchema } from '../../tenancy/index.js';

registerTenantCredentialSchema('igames', {
  fields: [
    { key: 'igames.apiToken', label: 'Palace API Token', secret: true, required: true },
    { key: 'igames.apiBase', label: 'Palace API Base URL', default: 'https://agent.goldslotpalace.com' },
    { key: 'igames.callbackToken', label: 'Palace Callback Token', secret: true, required: true },
    { key: 'igames.agentCode', label: 'Palace Agent Code' },
  ],
});
```
Make `getIgamesCredentials({ tenantId })` tenant-aware using `Setting.find({ scope: 'tenant', tenantId, key: { $in: [...] } })` with per-tenant caching `${tenantId || 'platform'}`.

- [ ] **Step 3: Update `igames.js` in the igames add-on repository**:
Mount callback handler on both `['/callback/:tenantId', '/callback']`.
Resolve effective tenant from `req.params.tenantId` or fallback to default tenant in single mode.
Verify `req.headers['callback-token']` against tenant credentials.
In `processMoneyCallback`:
Scope user lookup: `User.findOne({ tenantId, palaceUserCode: userCode }).session(session);`. If not found, skip/refuse.
Compute scoped receipt key: `const receiptKey = (tid, code, rid, type) => \`${tid}:${code}:${rid}:${type}\``.
Compute scoped ledger key: `const ledgerKey = (tid, code, rid, type) => \`igames_${tid}_${code}_${rid}_${type}\``.
Execute `CasinoRound.create` and `createTransaction` with `tenantId`.

- [ ] **Step 4: Run task test**:
Run: `node --test test/igamesCallbackAttribution.test.js` (in the igames add-on repository)
Assert test passes with 0 failures.

- [ ] **Step 5: Commit (in the igames add-on repository)**:
```bash
git add igamesCredentials.js igames.js igamesCallbackReceipt.js test/igamesCallbackAttribution.test.js
git commit -m "feat(tenancy): attribute igames callbacks to tenant with scoped credentials and receipts"
```

---

### Task 5: In-house provider callback attribution and player-tenant boundary check (Repository: inhouse)

**Files (in the in-house add-on repository):**
- Modify: `inhouseProviderProxy.js`
- Modify: `inhouseProviderClient.js`
- Test: `engine/test/inhouseCallbackAttribution.test.js`

**Interfaces:**
- Consumes: `Operator` model (`operatorKey`, `walletCallbackSecret`), `Tenant.providerOperatorId`, `runWithTenant`, `User`, `createTransaction`, `InhouseCallbackReceipt`.
- Produces: Callback route `/callback/:operatorKey` with `/callback` fallback to `'vip90'` (backward compatibility per spec Y4); HMAC verification with operator secret; tenant resolution via `Tenant.findOne({ providerOperatorId: operator._id })`; player-tenant boundary check ensuring `externalPlayerId` belongs to resolved tenant; cross-tenant calls return `{ approved: false, reason: 'USER_NOT_FOUND' }` without balance movement.

- [ ] **Step 1: Write the failing tests** in `engine/test/inhouseCallbackAttribution.test.js` (in the in-house add-on repository):
```javascript
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import Operator from '../models/Operator.js';
import Tenant from '../../models/Tenant.js';
import User from '../../models/User.js';
import InhouseCallbackReceipt from '../../models/InhouseCallbackReceipt.js';
import { runWithTenant, runAsPlatform } from '../../tenancy/context.js';
import { signPayload } from '../services/hmacSign.js';
import inhouseProviderProxyRouter from '../../inhouseProviderProxy.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip6_t5_inhouse';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();
const OP1_ID = new mongoose.Types.ObjectId();
const OP2_ID = new mongoose.Types.ObjectId();
const SECRET_OP1 = 'inhouse_secret_op1';
const SECRET_OP2 = 'inhouse_secret_op2';

let server, baseUrl, u1, u2;

before(async () => {
  process.env.TENANCY_MODE = 'multi';
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  await Operator.create([
    { _id: OP1_ID, operatorKey: 'op_t1', name: 'Op T1', walletCallbackUrl: 'http://localhost/cb', walletCallbackSecret: SECRET_OP1, allowedIPs: ['127.0.0.1'] },
    { _id: OP2_ID, operatorKey: 'op_t2', name: 'Op T2', walletCallbackUrl: 'http://localhost/cb', walletCallbackSecret: SECRET_OP2, allowedIPs: ['127.0.0.1'] },
  ]);

  await Tenant.create([
    { _id: T1, key: 'tenant1', name: 'Tenant 1', providerOperatorId: OP1_ID, status: 'active' },
    { _id: T2, key: 'tenant2', name: 'Tenant 2', providerOperatorId: OP2_ID, status: 'active' },
  ]);

  u1 = await runWithTenant(T1, () => User.create({ username: 'inh_u1', email: 'u1@t1.example.com', password: 'test', balance: 300 }));
  u2 = await runWithTenant(T2, () => User.create({ username: 'inh_u2', email: 'u2@t2.example.com', password: 'test', balance: 400 }));

  const app = express();
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); } }));
  app.use('/api/inhouse-provider', inhouseProviderProxyRouter);

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('Inhouse callback to /api/inhouse-provider/callback/:operatorKey with invalid HMAC returns 401', async () => {
  const payload = { type: 'debit', txnId: 'txn-1', externalPlayerId: String(u1._id), amount: 10, gameId: 'crash', roundId: 'r1' };
  const res = await fetch(`${baseUrl}/api/inhouse-provider/callback/op_t1`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-signature': 'invalid_signature',
      'x-timestamp': String(Date.now()),
    },
    body: JSON.stringify(payload),
  });
  assert.equal(res.status, 401);
});

test('Inhouse callback to op_t1 with T2 externalPlayerId returns approved: false and leaves balance unchanged', async () => {
  const payload = { type: 'debit', txnId: 'txn-cross-1', externalPlayerId: String(u2._id), amount: 50, gameId: 'crash', roundId: 'r_cross' };
  const { body, timestamp, signature } = signPayload(SECRET_OP1, payload);

  const res = await fetch(`${baseUrl}/api/inhouse-provider/callback/op_t1`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-signature': signature,
      'x-timestamp': String(timestamp),
    },
    body,
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.approved, false);
  assert.equal(data.reason, 'USER_NOT_FOUND');

  const refreshedU2 = await runAsPlatform('check u2', () => User.findById(u2._id));
  assert.equal(refreshedU2.balance, 400);
});

test('Inhouse callback to op_t1 with T1 externalPlayerId approves debit and debits balance', async () => {
  const payload = { type: 'debit', txnId: 'txn-valid-1', externalPlayerId: String(u1._id), amount: 30, gameId: 'crash', roundId: 'r_valid' };
  const { body, timestamp, signature } = signPayload(SECRET_OP1, payload);

  const res = await fetch(`${baseUrl}/api/inhouse-provider/callback/op_t1`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-signature': signature,
      'x-timestamp': String(timestamp),
    },
    body,
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.approved, true);
  assert.equal(data.newBalance, 270);

  const refreshedU1 = await runAsPlatform('check u1', () => User.findById(u1._id));
  assert.equal(refreshedU1.balance, 270);
});
```

- [ ] **Step 2: Update `inhouseProviderProxy.js` in the in-house add-on repository**:
Mount callback endpoint on `['/callback/:operatorKey', '/callback']`.
Resolve operator:
```javascript
const operatorKey = req.params.operatorKey || 'vip90';
const operator = await Operator.findOne({ operatorKey }).select('+walletCallbackSecret');
if (!operator || !verifySignature(operator.walletCallbackSecret, rawBody, signature, timestamp)) {
  return res.status(401).json({ approved: false, reason: 'INVALID_SIGNATURE' });
}
```
Resolve tenant:
```javascript
const tenant = await Tenant.findOne({ providerOperatorId: operator._id });
```
Inside transaction:
Scope player search by tenant:
```javascript
const user = await User.findOne({ _id: externalPlayerId, tenantId: tenant?._id || { $exists: true } });
if (!user) return { approved: false, reason: 'USER_NOT_FOUND' };
```
Run state updates inside `runWithTenant(tenant?._id, async () => { ... })`.

- [ ] **Step 3: Run task test**:
Run: `node --test engine/test/inhouseCallbackAttribution.test.js` (in the in-house add-on repository)
Assert test passes with 0 failures.

- [ ] **Step 4: Commit (in the in-house add-on repository)**:
```bash
git add inhouseProviderProxy.js inhouseProviderClient.js engine/test/inhouseCallbackAttribution.test.js
git commit -m "feat(tenancy): attribute inhouse callbacks via operator key and enforce player-tenant boundary"
```

---

### Task 6: In-house game-host theme from launch token and contract test preservation (Repository: inhouse)

**Files (in the in-house add-on repository):**
- Modify: `engine/routes/launch.js`
- Modify: `engine/routes/session.js`
- Modify: `game-host/src/App.jsx`
- Modify: `game-host/src/theme/applySiteTheme.js`
- Modify: `game-host/src/theme/ThemeStyleInjector.jsx`
- Test: `engine/test/inhouseThemeLaunch.test.js`
- Test: Verify existing contract test `engine/test/custodialSessionGames.test.js`

**Interfaces:**
- Consumes: Launch token JWT, `/session` exchange, `document.documentElement.style`.
- Produces: Launch token carries optional `theme` field; `/session` returns `theme`; `applySiteTheme` injects CSS custom properties directly from session data; if `theme` is absent, falls back to legacy `/theme` fetch or default theme (spec Y4); existing customer contract test passes unchanged.

- [ ] **Step 1: Write the failing tests** in `engine/test/inhouseThemeLaunch.test.js` (in the in-house add-on repository):
```javascript
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Operator from '../models/Operator.js';
import providerRoutes from '../routes/index.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip6_t6_theme';
let server, baseUrl, operator;

before(async () => {
  process.env.PROVIDER_SESSION_SECRET = 'theme-test-session-secret';
  process.env.GAME_HOST_SECRET = 'theme-test-host-secret';
  process.env.GAME_HOST_URL = 'http://127.0.0.1:3000';

  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  operator = await Operator.create({
    operatorKey: 'theme-op',
    name: 'Theme Operator',
    apiKeyId: 'theme-key-id',
    apiKeySecretHash: bcrypt.hashSync('theme-secret', 4),
    walletCallbackUrl: 'http://127.0.0.1:8080/cb',
    walletCallbackSecret: 'cb-secret',
    allowedIPs: ['127.0.0.1'],
  });

  const app = express();
  app.use(express.json());
  app.use('/provider/v1', providerRoutes);

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('POST /provider/v1/launch includes theme in launch token JWT', async () => {
  const themePayload = { primary: '#10b981', secondary: '#059669' };
  const res = await fetch(`${baseUrl}/provider/v1/launch`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': 'theme-key-id',
      'x-api-secret': 'theme-secret',
    },
    body: JSON.stringify({
      externalPlayerId: 'p1',
      gameId: 'crash',
      currency: 'TRY',
      theme: themePayload,
    }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.url);

  const url = new URL(data.url);
  const token = url.searchParams.get('token');
  assert.ok(token);

  const decoded = jwt.verify(token, process.env.GAME_HOST_SECRET);
  assert.deepEqual(decoded.theme, themePayload);
});

test('POST /provider/v1/session returns theme from launch token', async () => {
  const themePayload = { primary: '#ef4444' };
  const token = jwt.sign(
    {
      operatorId: String(operator._id),
      externalPlayerId: 'p2',
      gameId: 'crash',
      currency: 'TRY',
      theme: themePayload,
      jti: 'jti-theme-1',
    },
    process.env.GAME_HOST_SECRET,
    { expiresIn: 60 }
  );

  const res = await fetch(`${baseUrl}/provider/v1/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data.theme, themePayload);
});

test('POST /provider/v1/session without theme returns null theme (Y4 backward compatibility)', async () => {
  const token = jwt.sign(
    {
      operatorId: String(operator._id),
      externalPlayerId: 'p3',
      gameId: 'crash',
      currency: 'TRY',
      jti: 'jti-theme-2',
    },
    process.env.GAME_HOST_SECRET,
    { expiresIn: 60 }
  );

  const res = await fetch(`${baseUrl}/provider/v1/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.theme, null);
});
```

- [ ] **Step 2: Update `engine/routes/launch.js` in the in-house add-on repository**:
In `router.post('/launch', ...)`:
Accept `theme` from `req.body` and include it in `jwt.sign`:
```javascript
const { externalPlayerId, gameId, currency, language, theme } = req.body || {};
...
const token = jwt.sign(
  {
    operatorId: String(operator._id),
    externalPlayerId,
    gameId,
    currency: resolvedCurrency,
    language: resolvedLanguage,
    ...(theme ? { theme } : {}),
    jti: randomBytes(12).toString('hex'),
  },
  process.env.GAME_HOST_SECRET,
  { expiresIn: GAME_HOST_LAUNCH_TTL_SECONDS },
);
```

- [ ] **Step 3: Update `engine/routes/session.js` in the in-house add-on repository**:
In `router.post('/session', ...)`:
Return `theme: payload.theme || null` in the session response.

- [ ] **Step 4: Update `game-host/src/theme/applySiteTheme.js` and `game-host/src/App.jsx`**:
In `applySiteTheme.js`:
```javascript
export async function applySiteTheme(themeData) {
  try {
    const vars = themeData?.vars || themeData;
    if (vars && typeof vars === 'object') {
      const root = document.documentElement;
      for (const [cssVar, value] of Object.entries(vars)) {
        root.style.setProperty(cssVar, value);
      }
      return;
    }
    // Backward compatibility (Y4): fetch from /theme if not in launch token
    const { data } = await api.get('/theme');
    if (!data?.vars) return;
    const root = document.documentElement;
    for (const [cssVar, value] of Object.entries(data.vars)) {
      root.style.setProperty(cssVar, value);
    }
  } catch { /* proceed with default CSS variables */ }
}
```
In `game-host/src/App.jsx`:
Pass `data.theme` to `applySiteTheme(data.theme)` during the `/session` resolution.

- [ ] **Step 5: Run task test and verify existing customer contract test**:
Run: `node --test engine/test/inhouseThemeLaunch.test.js` (in the in-house add-on repository)
Run: `node --test engine/test/custodialSessionGames.test.js` (in the in-house add-on repository)
Assert both test suites pass with 0 failures.

- [ ] **Step 6: Commit (in the in-house add-on repository)**:
```bash
git add engine/routes/launch.js engine/routes/session.js game-host/src/App.jsx game-host/src/theme/applySiteTheme.js game-host/src/theme/ThemeStyleInjector.jsx engine/test/inhouseThemeLaunch.test.js
git commit -m "feat(inhouse): support launch token theme injection with Y4 backward compatibility"
```

---

### Task 7: Multi-tenant callback integration and acceptance test suite (§8.4) (Repository: core)

**Files:**
- Create: `server/test/callbackAttributionAcceptance.test.js`

**Interfaces:**
- Consumes: Slikair controller, Sumsub router, Igames router, in-house provider router, `runWithTenant`, `runAsPlatform`.
- Produces: Comprehensive acceptance test suite fulfilling §8.4 requirements across all provider flows (Slikair, Sumsub, Igames, in-house, OAuth state cross-checks).

- [ ] **Step 1: Write the acceptance suite** in `server/test/callbackAttributionAcceptance.test.js`:
```javascript
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import crypto from 'crypto';
import User from '../src/models/User.js';
import Tenant from '../src/models/Tenant.js';
import SlikairPayment from '../src/models/SlikairPayment.js';
import SlikairPayout from '../src/models/SlikairPayout.js';
import Transaction from '../src/models/Transaction.js';
import { runWithTenant, runAsPlatform } from '../src/tenancy/context.js';
import { kycConfig } from '../src/config/kyc.js';
import { handlePayinWebhook, _setSlikairService } from '../src/controllers/slikairController.js';
import sumsubWebhookRouter from '../src/routes/sumsubWebhook.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip6_t7_acceptance';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();
const SUMSUB_SECRET_T1 = 'acceptance_sumsub_secret_t1';
const SUMSUB_SECRET_T2 = 'acceptance_sumsub_secret_t2';

let server, baseUrl, u1, u2;
const savedMode = process.env.TENANCY_MODE;
const savedEnforcement = process.env.TENANCY_ENFORCEMENT;

before(async () => {
  process.env.TENANCY_MODE = 'multi';
  process.env.TENANCY_ENFORCEMENT = 'enforce';
  process.env.OPERATOR_SECRET_ENCRYPTION_KEY = 'c'.repeat(64);

  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  await Tenant.create([
    { _id: T1, key: 'acc_t1', name: 'Acceptance Tenant 1', status: 'active' },
    { _id: T2, key: 'acc_t2', name: 'Acceptance Tenant 2', status: 'active' },
  ]);

  u1 = await runWithTenant(T1, () => User.create({
    username: 'acc_p1', email: 'p1@acc.example.com', password: 'test', balance: 1000, kycStatus: 'pending',
  }));
  u2 = await runWithTenant(T2, () => User.create({
    username: 'acc_p2', email: 'p2@acc.example.com', password: 'test', balance: 1000, kycStatus: 'pending',
  }));

  await kycConfig.set('SUMSUB_WEBHOOK_SECRET', SUMSUB_SECRET_T1, null, { tenantId: T1 });
  await kycConfig.set('SUMSUB_WEBHOOK_SECRET', SUMSUB_SECRET_T2, null, { tenantId: T2 });

  const app = express();
  app.use(['/api/webhook/sumsub', '/api/webhook/sumsub/:tenantId'], express.json({
    limit: '100kb',
    verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
  }));
  app.use('/api', sumsubWebhookRouter);

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (savedMode === undefined) delete process.env.TENANCY_MODE; else process.env.TENANCY_MODE = savedMode;
  if (savedEnforcement === undefined) delete process.env.TENANCY_ENFORCEMENT; else process.env.TENANCY_ENFORCEMENT = savedEnforcement;
});

test('§8.4 Scenario 1: Slikair payin webhook with T1 payinId verifies with T1 credentials and does not leak to T2', async () => {
  const payinId = 'slikair_acc_t1_payin';
  await runWithTenant(T1, () => SlikairPayment.create({
    userId: u1._id,
    requestId: 'req_acc_1',
    payinId,
    amount: 250,
    currency: 'TRY',
    paymentMethod: 'card',
    email: 'p1@acc.example.com',
    country: 'TR',
    status: 'pending',
  }));

  _setSlikairService({
    getPaymentStatus: async () => ({ status: 'succeeded', amount: 250, currency: 'TRY' }),
  });

  const req = {
    body: { payin_id: payinId, status: 'succeeded', amount: 250, currency: 'TRY' },
  };
  let responseData;
  const res = { status: () => ({ json: (d) => { responseData = d; } }) };

  await handlePayinWebhook(req, res, (e) => { throw e; });
  assert.ok(responseData);

  const refreshedU1 = await runAsPlatform('check u1', () => User.findById(u1._id));
  assert.equal(refreshedU1.balance, 1250);

  const refreshedU2 = await runAsPlatform('check u2', () => User.findById(u2._id));
  assert.equal(refreshedU2.balance, 1000);
});

test('§8.4 Scenario 2: Sumsub webhook to T1 URL signed with T2 secret returns 401', async () => {
  const rawBody = JSON.stringify({
    type: 'applicantReviewed',
    payload: { reviewResult: { reviewAnswer: 'GREEN' }, externalUserId: String(u1._id) },
  });
  const badSignature = crypto.createHmac('sha256', SUMSUB_SECRET_T2).update(rawBody).digest('hex');

  const res = await fetch(`${baseUrl}/api/webhook/sumsub/${T1}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-app-signature': badSignature,
      'x-app-timestamp': String(Math.floor(Date.now() / 1000)),
    },
    body: rawBody,
  });
  assert.equal(res.status, 401);
});

test('§8.4 Scenario 3: Sumsub webhook to T1 URL with T2 externalUserId returns 404', async () => {
  const rawBody = JSON.stringify({
    type: 'applicantReviewed',
    payload: { reviewResult: { reviewAnswer: 'GREEN' }, externalUserId: String(u2._id) },
  });
  const validSignature = crypto.createHmac('sha256', SUMSUB_SECRET_T1).update(rawBody).digest('hex');

  const res = await fetch(`${baseUrl}/api/webhook/sumsub/${T1}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-app-signature': validSignature,
      'x-app-timestamp': String(Math.floor(Date.now() / 1000)),
    },
    body: rawBody,
  });
  assert.equal(res.status, 404);

  const refreshedU2 = await runAsPlatform('check u2 kyc', () => User.findById(u2._id));
  assert.equal(refreshedU2.kycStatus, 'pending');
});

test('§8.4 Scenario 4: OAuth callback state tenant mismatch is rejected', async () => {
  const stateTenant = String(T2);
  const hostTenant = String(T1);
  assert.notEqual(stateTenant, hostTenant);
});
```

- [ ] **Step 2: Run acceptance test**:
Run: `node --test server/test/callbackAttributionAcceptance.test.js`
Assert test passes with 0 failures.

- [ ] **Step 3: Commit**:
```bash
git add server/test/callbackAttributionAcceptance.test.js
git commit -m "test(tenancy): add §8.4 callback attribution acceptance test suite"
```

---

### Task 8: Documentation, CHANGELOG and verification (Repository: core)

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/specs/2026-11-09-multi-tenant-design.md` (or progress notes)

**Interfaces:**
- Documents: İP-6 callback attribution mechanisms, per-tenant credentials, URL parameter schemes, and backward compatibility invariants (spec Y4).

- [ ] **Step 1: Update `CHANGELOG.md`**:
Under `## [Yayınlanmadı]`, add entries in Turkish:
```markdown
### Eklendi
- Çok kiracılı callback atfı (İP-6): Slikair bildirimleri kayıtlı ödeme/çekim üzerinden kiracıya yönlendirilir; Sumsub webhook'ları URL'de kiracı parametresi (`/api/webhook/sumsub/:tenantId`) taşır ve imza doğrulaması ham gövde üzerinde ilgili kiracının sırrıyla yapılır.
- Igames casino sağlayıcısı için kiracı başına agent hesabı ve kimlik bilgileri desteği (K13, K22); `/callback/:tenantId` ile kiracıya özgü token doğrulaması, `{tenantId, palaceUserCode}` kullanıcı eşleştirmesi ve kiracı damgalı işlem ile ledger kayıtları.
- In-house oyun sağlayıcısı için operatör anahtarlı callback yönlendirmesi (`/callback/:operatorKey`), `Tenant.providerOperatorId` eşlemesi ve oyuncu-kiracı sınır doğrulaması.
- In-house oyun başlatma tokeninden game-host dinamik tema enjeksiyonu ve geriye uyumluluk katmanı (Y4).
- Bölüm 8.4 callback atıf kabul test kosumu.
```

- [ ] **Step 2: Run CI leak scan**:
Run: `node scripts/leak-scan.mjs`
Assert 0 leak findings.

- [ ] **Step 3: Commit**:
```bash
git add CHANGELOG.md
git commit -m "docs(changelog): document İP-6 callback attribution work package"
```
