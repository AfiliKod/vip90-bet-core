# İP-5 Money Paths and Admin Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement work package İP-5 of the approved multi-tenant design: tenant-scope all money paths and admin endpoints by enforcing that every `:id` lookup returns 404 on cross-tenant requests (preventing IDOR and resource existence leakage per §9 G-3), enforce Slikair payout `userId` tenant membership checks, enforce promotion claim and wagering tenant isolation, enforce chat tip sender-recipient tenant matching (`sendTip` rejects cross-tenant recipients with 404 `RECIPIENT_NOT_FOUND`), scope admin reports and analytics to prevent cross-tenant data leaks and personal data exposure (§3 #13, §4.3), implement the `TenantDailyStat` pre-aggregated daily metrics model and aggregation service for partner and platform reporting (§4.3.6), set `TENANCY_ENFORCEMENT` default to `'log'` in single mode (G7), implement CI lint rules prohibiting `runAsPlatform` outside an allow-list and banning bare unscoped queries in controllers, and verify with the §8.3 money paths acceptance test suite.

**Architecture:** Ambient tenant context is resolved by `tenantHost` or `requireStaff` (`X-Tenant-Id` for platform staff, matching `payload.sid` for tenant staff) and bound to async execution via `runWithTenant`. In `enforce` mode (multi mode), all queries automatically append `{ tenantId }`. In `log` mode (the new default for single mode in İP-5 per G7), queries append `{ tenantId }` when ambient context is present and log warnings on unscoped queries without throwing `TenantScopeError`, preserving legacy single-tenant behavior. Beyond plugin query scoping, all controller handlers receiving an `:id` parameter (`req.params.id` or body `userId`) explicitly scope lookups by `tenantId: req.tenant.id` and return 404 `NOT_FOUND` (never 403, preventing resource enumeration across tenants). `sendTip` in `server/src/services/chat.js` validates that `fromUser` and `toUser` share the same `tenantId`, rejecting cross-tenant tips with 404 `RECIPIENT_NOT_FOUND`. `initiatePayout` in `server/src/controllers/slikairController.js` validates that `userId` belongs to `req.tenant.id` before debiting balance. `TenantDailyStat` (`server/src/models/TenantDailyStat.js`) stores pre-aggregated metrics per tenant, brand, date, and currency, populated by `server/src/services/tenantDailyStat.js` which strictly excludes bot, seed, and demo activity. Partner queries on `TenantDailyStat` apply small-cell suppression (`activePlayers < 5` mapped to `"<5"`) and expose zero PII. Linter `scripts/lint-tenancy.mjs` enforces the `runAsPlatform` allow-list and controller scoping rules.

**Tech Stack:** Node >= 22 (ESM), Express 4, Mongoose 8.24, `node:test` + `node:assert/strict`, local MongoDB (replica set `rs0` on 127.0.0.1:27017).

**Spec:** `docs/superpowers/specs/2026-11-09-multi-tenant-design.md` (canonical copy in `core-ipu`). Sections used: §1.1 (money flows, 46 paths, admin approvals), §2.1 (TEN, PLAT, PART models), §2.2 (flows table), §3 (isolation risk points 4, 6, 13), §4.3.6 (`TenantDailyStat` schema and partner metrics), §4.4 (tenantScoped plugin, `runAsPlatform` allow-list, `:id` scoping), §6.1 (modes and flags table), §6.3 G7 (`log` mode default in single mode), §7.1 (İP-5 row), §8.3 (money paths test suite), §9 (G-2 unscoped query prevention, G-3 IDOR 404, G-10 campaign and job isolation).

---

## Global Constraints

- **Never weaken an existing check:** All existing middleware protections (`requireAuth`, `requireStaff`, `requirePermission`, `enforceAdminIp`, `auditLog`, Zod schema validations) must remain in force. Tenant boundary checks add defense-in-depth on top of existing authorizations.
- **IDOR returns 404, never 403 (spec §9 G-3):** When a staff member or player of Tenant 1 queries an object ID belonging to Tenant 2, the endpoint must return 404 `NOT_FOUND` (or custom 404 code like `RECIPIENT_NOT_FOUND`). It must never return 403, ensuring that the existence of records in other tenants is never disclosed.
- **Single mode backward compatibility (spec §6.1, §6.3 G7):** In `TENANCY_MODE=single`, default `TENANCY_ENFORCEMENT` becomes `'log'`. In `log` mode, queries executed within ambient context append `{ tenantId: defaultTenantId }`. Unscoped queries increment `getScopeViolationStats().count` and log a warning, but do NOT throw `TenantScopeError`. Single-operator installs keep running unchanged without breaking.
- **Multi mode strict enforcement (spec §6.1):** In `TENANCY_MODE=multi`, `TENANCY_ENFORCEMENT` is strictly `'enforce'`. Any unscoped query on a tenant-owned collection throws `TenantScopeError`.
- **Slikair payout player ownership (spec §3 #4):** `POST /api/admin/slikair/payouts` must verify that the `userId` in `req.validated` belongs to `req.tenant.id`. If the player belongs to another tenant or does not exist, return 404 `NOT_FOUND`.
- **Chat tip tenant containment (spec §2.1, §3 #6, §8.3):** `sendTip` in `server/src/services/chat.js` must verify that `fromUser.tenantId` matches `toUser.tenantId` and `room.tenantId`. A cross-tenant tip must be rejected with 404 `RECIPIENT_NOT_FOUND` before any debit or credit occurs.
- **TenantDailyStat purity (spec §4.3.6):** Pre-aggregated daily metrics in `TenantDailyStat` must exclude `isSeed: true`, `isBot: true`, and demo activity (`DEMO_*`). Partner queries on `TenantDailyStat` must apply small-cell suppression (`activePlayers < 5` rendered as `"<5"`) and return zero PII.
- **`runAsPlatform` allow-list enforcement (spec §4.4 #5, §9 G-2):** `runAsPlatform` is restricted to authorized files: settlement loops, `TenantDailyStat` aggregation, ledger deduplication, provisioning, boot migrations, and test files. Any usage outside the documented allow-list is flagged as a CI failure by `scripts/lint-tenancy.mjs`.
- **Core never imports premium:** Public core provides hooks and interfaces; premium packages plug in via dynamic imports or hooks.
- **Test database isolation:** Tests use dedicated database names (`vip90_test_ip5_*` on `mongodb://127.0.0.1:27017`), never read `MONGODB_URI`, allow override via `TENANCY_TEST_MONGO`, and drop databases in `after()`.
- **Language and hygiene:** Code comments in English. CHANGELOG entries in Turkish under `## [Yayınlanmadı]`. Commits add files by explicit path (never `git add -A` or `git add .`). No em dashes in documentation or commit messages.

---

## Reviewer correction (2026-11-12): overrides every conflicting line below

1. **Task 1 (`log` default in single mode) is gated on G3.** `log` mode adds the tenant filter to queries run inside a
   tenant context, so documents without `tenantId` would disappear from single-mode reads. The effective single-mode
   default is `log` only when `Migration{name:'tenancy-002-backfill-tenant-id'}` is recorded as complete (all collections
   `completed`); otherwise it stays `off`. An explicit `TENANCY_ENFORCEMENT` env value still wins. The `log` warnings are
   rate-limited (at most one line per model+op per minute) so existing installs are not flooded.
2. **New Task 12 (wave B): platform staff are read-only on tenant routes (owner decision K23).** In
   `server/src/middleware/auth.js` `requireStaff`, a platform-scoped token on a tenant route may only use safe methods
   (GET, HEAD, OPTIONS); any other method answers 403 `PLATFORM_READ_ONLY` and writes an `AuditLog` row (actor, tenant,
   route, method). The time-limited, audited exception grant that re-enables writes is İP-9a work; until then there is
   no write path. Tests: platform GET on a tenant route 200; platform POST/PATCH/DELETE 403 + audit row; tenant staff
   unaffected. Files: `server/src/middleware/auth.js`, `server/test/platformReadOnly.test.js`. No other task edits auth.js.
3. **Use `tenantFilter(req, base)` from `server/src/tenancy/tenantFilter.js` for every id lookup.** It adds the
   tenant only in multi mode; single mode keeps today's query (one tenant, and a default-tenant filter would hide
   records the G3 backfill has not stamped). Never change existing status codes or error codes.
4. Every task runs the full root `npm test` at the end (fail 0) and never weakens an existing check; legacy unique
   indexes and İP-0 security tests stay untouched.

## Review Focus

- **Cross-tenant financial isolation (§8.3):** Any financial action (deposit approval, crypto withdrawal approval, manual payout, balance adjustment) initiated by Tenant 1 staff on a Tenant 2 record must return 404 and leave Tenant 2 balances and ledgers completely untouched.
- **Zero data leakage on IDOR attempts (G-3):** Passing an arbitrary valid ObjectId of another tenant to any admin or player endpoint returns 404, matching the response for a non-existent ObjectId.
- **Preserved single-mode execution (G7):** Running existing test suites with `TENANCY_MODE=single` and default `TENANCY_ENFORCEMENT` passes completely, verifying that `log` mode does not disrupt legacy workflows.
- **Partner privacy guarantees (G-6, §4.3.6):** Partner metric endpoints consume only `TenantDailyStat`, apply small-cell suppression when active players are under 5, and physically contain no player identifiers or contact information.
- **Strict lint enforcement (G-2):** CI lint runner fails if unauthorized `runAsPlatform` calls are introduced or if controllers bypass scoped model instances with bare collection calls.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `server/src/config/tenancy.js`, `server/src/tenancy/tenantScoped.js` | Update single mode enforcement default to `'log'`, maintain violation counters | 1 |
| `server/test/tenancyEnforcementDefault.test.js` | Unit tests for single mode `'log'` enforcement default and violation logging | 1 |
| `server/src/controllers/bank.js`, `server/src/controllers/slikairController.js` | Scope Bank deposits and Slikair payouts, enforce `userId` tenant check | 2 |
| `server/test/bankSlikairScope.test.js` | Tests for Bank and Slikair cross-tenant 404 IDOR containment | 2 |
| `server/src/controllers/promotions.js`, `server/src/controllers/playerSegment.js` | Scope promotion claim, wagering conversion, and Player Segment `:id` lookups | 3 |
| `server/test/promotionsSegmentScope.test.js` | Tests for promotions and player segments cross-tenant 404 IDOR containment | 3 |
| `server/src/services/chat.js`, `server/src/controllers/chat.js`, `server/src/controllers/ticket.js` | Enforce chat tip cross-tenant check, scope chat rooms, moderation, and tickets | 4 |
| `server/test/chatSupportScope.test.js` | Tests for chat tip cross-tenant rejection and support ticket scoping | 4 |
| `server/src/controllers/multiBrand.js`, `server/src/controllers/staticPages.js`, `server/src/controllers/smsTemplate.js`, `server/src/controllers/adminMailTemplates.js` | Scope Brand domains, static pages, SMS and email templates to tenant | 5 |
| `server/test/brandMessagingScope.test.js` | Tests for brand, page, and template cross-tenant 404 IDOR containment | 5 |
| `server/src/controllers/reconciliation.js`, `server/src/controllers/events.js`, `server/src/controllers/bets.js` | Scope reconciliation jobs, restrict manual event settle, scope bet lookups | 6 |
| `server/test/operationsBettingScope.test.js` | Tests for reconciliation, event settlement restrictions, and bet scoping | 6 |
| `server/src/controllers/admin.js`, `server/src/services/adminCounts.js`, `server/src/services/activityFeed.js` | Scope admin financial approvals, KYC, user management, and tenant analytics | 7 |
| `server/test/adminControllerScope.test.js` | Tests for admin controller endpoints, KYC, balance adjustments, and metrics | 7 |
| `server/src/models/TenantDailyStat.js`, `server/src/services/tenantDailyStat.js` | Pre-aggregated daily metrics model, aggregation worker, partner view | 8 |
| `server/test/tenantDailyStat.test.js` | Unit and aggregation tests for `TenantDailyStat` and partner small-cell suppression | 8 |
| `scripts/lint-tenancy.mjs`, `scripts/lint-tenancy.test.mjs`, `package.json`, `server/package.json` | CI linter for `runAsPlatform` allow-list and controller unscoped query check | 9 |
| `server/test/moneyPathsTenancy.test.js` | §8.3 Money paths acceptance suite: cross-tenant isolation across all 46 flows | 10 |
| `CHANGELOG.md`, `docs/product/02-yapilandirma.md`, `AGENTS.md` | Document İP-5 scoping invariants, `TenantDailyStat`, and `log` mode default | 11 |

---

## Parallelism

Tasks in the same wave run in parallel in separate worktrees without touching the same files.

| Wave | Tasks (run in parallel, separate worktrees) | Depends on |
|---|---|---|
| A | 1 (Enforcement default), 2 (Bank and Slikair scope), 3 (Promotions and Segments scope), 4 (Chat tip and Support scope), 5 (Brand and Messaging scope), 6 (Reconciliation and Betting scope) | none |
| B | 7 (Admin controller scope), 8 (TenantDailyStat metrics), 9 (Tenancy lint rules) | 1, 2, 3, 4, 5, 6 |
| C | 10 (Acceptance suite: §8.3 Money paths) | 7, 8, 9 |
| D | 11 (CHANGELOG, docs, AGENTS.md) | 10 |

**Conflict notes:**
- Tasks 1 through 6 edit mutually exclusive files across distinct controller and service domains.
- Task 7 edits `server/src/controllers/admin.js`, `server/src/services/adminCounts.js`, `server/src/services/activityFeed.js`.
- Task 8 creates `server/src/models/TenantDailyStat.js` and `server/src/services/tenantDailyStat.js`.
- Task 9 creates `scripts/lint-tenancy.mjs`, `scripts/lint-tenancy.test.mjs`, and registers scripts in `package.json`.
- Task 10 creates integration test `server/test/moneyPathsTenancy.test.js` consuming all scoped endpoints.
- Task 11 updates documentation and `CHANGELOG.md`.

---

### Task 1: Tenancy enforcement default and single-mode log mode (G7)

**Files:**
- Modify: `server/src/config/tenancy.js`
- Modify: `server/src/tenancy/tenantScoped.js`
- Test: `server/test/tenancyEnforcementDefault.test.js`

**Interfaces:**
- Consumes: `getTenancyMode`, `getTenancyEnforcement`, `readTenancyConfig`, `reportViolation`, `getScopeViolationStats`.
- Produces: Default enforcement in single mode changed from `'off'` to `'log'` per spec §6.1 / §6.3 G7; `reportViolation` in `log` mode logs warnings and increments violation counters without throwing.

- [ ] **Step 1: Write the failing tests** in `server/test/tenancyEnforcementDefault.test.js`:
```js
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { readTenancyConfig, getTenancyEnforcement } from '../src/config/tenancy.js';
import {
  reportViolation,
  getScopeViolationStats,
  resetScopeViolationStats,
} from '../src/tenancy/tenantScoped.js';
import { TenantScopeError } from '../src/tenancy/errors.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip5_t1_enforcement';

before(async () => {
  await mongoose.connect(TEST_DB);
});

after(async () => {
  await mongoose.disconnect();
});

test('default enforcement is log in single mode when unset', () => {
  const cfg = readTenancyConfig({ TENANCY_MODE: 'single' });
  assert.equal(cfg.enforcement, 'log');

  const cfgEmpty = readTenancyConfig({ TENANCY_MODE: 'single', TENANCY_ENFORCEMENT: '' });
  assert.equal(cfgEmpty.enforcement, 'log');
});

test('default enforcement is enforce in multi mode when unset', () => {
  const cfg = readTenancyConfig({ TENANCY_MODE: 'multi' });
  assert.equal(cfg.enforcement, 'enforce');
});

test('explicit TENANCY_ENFORCEMENT=off is respected in single mode', () => {
  const cfg = readTenancyConfig({ TENANCY_MODE: 'single', TENANCY_ENFORCEMENT: 'off' });
  assert.equal(cfg.enforcement, 'off');
});

test('invalid TENANCY_ENFORCEMENT falls back to log in single mode and records error', () => {
  const cfg = readTenancyConfig({ TENANCY_MODE: 'single', TENANCY_ENFORCEMENT: 'invalid_mode' });
  assert.equal(cfg.enforcement, 'log');
  assert.equal(cfg.errors.length, 1);
  assert.match(cfg.errors[0], /TENANCY_ENFORCEMENT must be "off", "log" or "enforce"/);
});

test('log mode counts violation and does not throw', () => {
  resetScopeViolationStats();
  const originalEnv = process.env.TENANCY_ENFORCEMENT;
  const originalMode = process.env.TENANCY_MODE;
  process.env.TENANCY_MODE = 'single';
  delete process.env.TENANCY_ENFORCEMENT;

  try {
    assert.doesNotThrow(() => {
      reportViolation({ model: 'User', op: 'find', reason: 'unscoped' });
    });
    const stats = getScopeViolationStats();
    assert.equal(stats.count, 1);
    assert.equal(stats.lastSample.model, 'User');
    assert.equal(stats.lastSample.op, 'find');
  } finally {
    process.env.TENANCY_ENFORCEMENT = originalEnv;
    process.env.TENANCY_MODE = originalMode;
    resetScopeViolationStats();
  }
});
```

- [ ] **Step 2: Update `server/src/config/tenancy.js`**:
Update default enforcement logic for single mode to `'log'`:
```js
  // Parse enforcement: unset -> single: 'log', multi: 'enforce'
  // empty -> default per mode; invalid -> mode default + error
  let enforcement;
  let enforcementErrors = [];

  if (!rawEnforcement) {
    enforcement = mode === 'single' ? 'log' : 'enforce';
  } else if (ENFORCEMENT_MODES_SET.has(rawEnforcement.toLowerCase())) {
    enforcement = rawEnforcement.toLowerCase();
  } else {
    enforcement = mode === 'single' ? 'log' : 'enforce';
    enforcementErrors.push(
      `TENANCY_ENFORCEMENT must be "off", "log" or "enforce" (got "${rawEnforcement}")`
    );
  }
```

- [ ] **Step 3: Run the tests**:
```bash
node --test server/test/tenancyEnforcementDefault.test.js
```

- [ ] **Step 4: Commit**:
```bash
git add server/src/config/tenancy.js server/src/tenancy/tenantScoped.js server/test/tenancyEnforcementDefault.test.js
git commit -m "feat(tenancy): default TENANCY_ENFORCEMENT to log in single mode (G7)"
```

---

### Task 2: Payment Gateway & Bank Scoping (`BankDepositRequest`, `SlikairPayment`, `SlikairPayout`)

**Files:**
- Modify: `server/src/controllers/bank.js`
- Modify: `server/src/controllers/slikairController.js`
- Test: `server/test/bankSlikairScope.test.js`

**Interfaces:**
- Consumes: `BankDepositRequest`, `SlikairPayment`, `SlikairPayout`, `User`, `createError`, `req.tenant`.
- Produces: Scoped deposit approvals, payout initiate player tenant validation (`userId` must belong to `req.tenant.id`), payment and payout lookups returning 404 on cross-tenant requests.

- [ ] **Step 1: Write the failing tests** in `server/test/bankSlikairScope.test.js`:
```js
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import BankDepositRequest from '../src/models/BankDepositRequest.js';
import SlikairPayment from '../src/models/SlikairPayment.js';
import SlikairPayout from '../src/models/SlikairPayout.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { approveDeposit, rejectDeposit } from '../src/controllers/bank.js';
import { initiatePayout, getPaymentById, getPayoutById } from '../src/controllers/slikairController.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip5_t2_bank_slikair';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

let u1, u2, bankReqT1, paymentT1, payoutT1;

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  u1 = await runWithTenant(T1, () => User.create({ username: 'player1_t1', email: 'p1@t1.com', balance: 500 }));
  u2 = await runWithTenant(T2, () => User.create({ username: 'player2_t2', email: 'p2@t2.com', balance: 500 }));

  bankReqT1 = await runWithTenant(T1, () => BankDepositRequest.create({
    userId: u1._id,
    amount: 100,
    bankName: 'Bank1',
    senderName: 'Sender1',
    status: 'pending',
  }));

  paymentT1 = await runWithTenant(T1, () => SlikairPayment.create({
    userId: u1._id,
    merchantReference: 'ref-pay-1',
    amount: 100,
    currency: 'TRY',
    status: 'created',
  }));

  payoutT1 = await runWithTenant(T1, () => SlikairPayout.create({
    userId: u1._id,
    merchantReference: 'ref-out-1',
    amount: 50,
    currency: 'TRY',
    method: 'bank',
    status: 'created',
  }));
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('T2 staff approving T1 bank deposit receives 404', async () => {
  const req = {
    params: { id: String(bankReqT1._id) },
    user: { id: new mongoose.Types.ObjectId() },
    tenant: { id: T2 },
  };
  const res = { json: () => assert.fail('should not succeed') };

  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => approveDeposit(req, res, (err) => { throw err; }),
      (err) => err.status === 404
    );
  });
});

test('T2 staff initiating Slikair payout with T1 player userId receives 404', async () => {
  const req = {
    validated: {
      userId: String(u1._id),
      amount: 100,
      currency: 'TRY',
      method: 'bank',
      country: 'TR',
      paymentDetails: {},
    },
    user: { id: new mongoose.Types.ObjectId() },
    tenant: { id: T2 },
  };
  const res = { status: () => ({ json: () => assert.fail('should not succeed') }) };

  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => initiatePayout(req, res, (err) => { throw err; }),
      (err) => err.status === 404
    );
  });

  // Verify u1 balance unchanged
  const refreshedU1 = await User.findById(u1._id);
  assert.equal(refreshedU1.balance, 500);
});

test('T2 staff querying T1 Slikair payment or payout by id receives 404', async () => {
  const reqPay = { params: { id: String(paymentT1._id) }, tenant: { id: T2 } };
  const reqOut = { params: { id: String(payoutT1._id) }, tenant: { id: T2 } };
  const res = { json: () => assert.fail('should not succeed') };

  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => getPaymentById(reqPay, res, (err) => { throw err; }),
      (err) => err.status === 404
    );
    await assert.rejects(
      async () => getPayoutById(reqOut, res, (err) => { throw err; }),
      (err) => err.status === 404
    );
  });
});
```

- [ ] **Step 2: Update `server/src/controllers/bank.js` and `server/src/controllers/slikairController.js`**:
In `bank.js`, ensure `approveDeposit` and `rejectDeposit` check tenantId:
```js
// In approveDeposit:
const tenantId = req.tenant?.id;
const filter = { _id: req.params.id };
if (tenantId) filter.tenantId = tenantId;
const record = await BankDepositRequest.findOne(filter).session(session);
if (!record) throw createError(404, 'NOT_FOUND', 'Talep bulunamadı');

// In rejectDeposit:
const tenantId = req.tenant?.id;
const filter = { _id: req.params.id, status: 'pending' };
if (tenantId) filter.tenantId = tenantId;
const record = await BankDepositRequest.findOneAndUpdate(filter, { ... }, { new: true });
if (!record) {
  const existsFilter = { _id: req.params.id };
  if (tenantId) existsFilter.tenantId = tenantId;
  const exists = await BankDepositRequest.exists(existsFilter);
  if (!exists) throw createError(404, 'NOT_FOUND', 'Talep bulunamadı');
  throw createError(400, 'INVALID_STATUS', 'Yalnızca beklemedeki talepler reddedilebilir');
}
```

In `slikairController.js`:
```js
// In initiatePayout:
const { userId, amount, currency, method, country, paymentDetails } = req.validated;
const tenantId = req.tenant?.id;
const userFilter = { _id: userId };
if (tenantId) userFilter.tenantId = tenantId;
const user = await User.findOne(userFilter);
if (!user) throw createError(404, 'NOT_FOUND', 'Kullanıcı bulunamadı');
```
And scope `getPaymentById` and `getPayoutById` by `tenantId`.

- [ ] **Step 3: Run the tests**:
```bash
node --test server/test/bankSlikairScope.test.js
```

- [ ] **Step 4: Commit**:
```bash
git add server/src/controllers/bank.js server/src/controllers/slikairController.js server/test/bankSlikairScope.test.js
git commit -m "feat(finance): scope bank approvals and slikair payout player lookups"
```

---

### Task 3: Promotions & Player Segments Scoping

**Files:**
- Modify: `server/src/controllers/promotions.js`
- Modify: `server/src/controllers/playerSegment.js`
- Test: `server/test/promotionsSegmentScope.test.js`

**Interfaces:**
- Consumes: `Promotion`, `PlayerSegment`, `BonusWagering`, `createError`, `req.tenant`.
- Produces: Scoped promotion listing and claiming (`:id` must match `tenantId`), Player Segment CRUD and player computation scoped to `tenantId`.

- [ ] **Step 1: Write the failing tests** in `server/test/promotionsSegmentScope.test.js`:
```js
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Promotion from '../src/models/Promotion.js';
import PlayerSegment from '../src/models/PlayerSegment.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { claim, list as listPromotions } from '../src/controllers/promotions.js';
import { getSegmentById, updateSegment, deleteSegment } from '../src/controllers/playerSegment.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip5_t3_promo_segment';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

let u2, promoT1, segmentT1;

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  u2 = await runWithTenant(T2, () => User.create({ username: 'player2_t2', email: 'p2@t2.com', balance: 0 }));

  promoT1 = await runWithTenant(T1, () => Promotion.create({
    title: 'T1 Welcome Bonus',
    amount: 100,
    isActive: true,
    wageringMultiplier: 30,
    claimedBy: [],
  }));

  segmentT1 = await runWithTenant(T1, () => PlayerSegment.create({
    name: 'T1 VIPs',
    slug: 't1-vips',
    rules: { minDeposit: 1000 },
  }));
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('T2 player claiming T1 promotion receives 404', async () => {
  const req = {
    params: { id: String(promoT1._id) },
    user: { id: String(u2._id) },
    tenant: { id: T2 },
    validated: { acceptedBonusTerms: true },
  };
  const res = { json: () => assert.fail('should not succeed') };

  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => claim(req, res, (err) => { throw err; }),
      (err) => err.status === 404
    );
  });
});

test('T2 staff accessing T1 player segment by id receives 404', async () => {
  const req = {
    params: { id: String(segmentT1._id) },
    tenant: { id: T2 },
    body: { name: 'Attempted Update' },
  };
  const res = { json: () => assert.fail('should not succeed') };

  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => getSegmentById(req, res, (err) => { throw err; }),
      (err) => err.status === 404
    );
    await assert.rejects(
      async () => updateSegment(req, res, (err) => { throw err; }),
      (err) => err.status === 404
    );
    await assert.rejects(
      async () => deleteSegment(req, res, (err) => { throw err; }),
      (err) => err.status === 404
    );
  });
});
```

- [ ] **Step 2: Update `server/src/controllers/promotions.js` and `server/src/controllers/playerSegment.js`**:
In `promotions.js`:
```js
// In list:
const filter = { isActive: true };
if (req.tenant?.id) filter.tenantId = req.tenant.id;
const promos = await Promotion.find(filter);

// In claim (inside transaction):
const tenantId = req.tenant?.id;
const promoFilter = { _id: req.params.id, isActive: true };
if (tenantId) promoFilter.tenantId = tenantId;
const claimed = await Promotion.findOne(promoFilter).session(session);
if (!claimed) throw createError(404, 'NOT_FOUND', 'Promosyon bulunamadı');
```
In `playerSegment.js`:
Update `getSegmentById`, `updateSegment`, `deleteSegment`, `computeSegmentPlayers`, `getSegmentPlayers`, and `getSegmentStats` to query by `{ _id: id, tenantId: req.tenant.id }`, throwing 404 when null.

- [ ] **Step 3: Run the tests**:
```bash
node --test server/test/promotionsSegmentScope.test.js
```

- [ ] **Step 4: Commit**:
```bash
git add server/src/controllers/promotions.js server/src/controllers/playerSegment.js server/test/promotionsSegmentScope.test.js
git commit -m "feat(marketing): scope promotion claims and player segment lookups"
```

---

### Task 4: Communication Scoping: Chat Tip Isolation, Chat Moderation, and Tickets

**Files:**
- Modify: `server/src/services/chat.js`
- Modify: `server/src/controllers/chat.js`
- Modify: `server/src/controllers/ticket.js`
- Test: `server/test/chatSupportScope.test.js`

**Interfaces:**
- Consumes: `ChatRoom`, `ChatMessage`, `ChatTip`, `Ticket`, `User`, `createError`, `req.tenant`.
- Produces: `sendTip` cross-tenant recipient rejection (`RECIPIENT_NOT_FOUND` 404), chat moderation `:id` scoping, support ticket `:id` scoping.

- [ ] **Step 1: Write the failing tests** in `server/test/chatSupportScope.test.js`:
```js
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import ChatRoom from '../src/models/ChatRoom.js';
import Ticket from '../src/models/Ticket.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { sendTip } from '../src/services/chat.js';
import { updateRoom, deleteMessage } from '../src/controllers/chat.js';
import { getTicketById } from '../src/controllers/ticket.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip5_t4_chat_support';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

let u1, u2, roomT1, ticketT1;

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  u1 = await runWithTenant(T1, () => User.create({ username: 'tipper_t1', email: 't1@chat.com', balance: 500 }));
  u2 = await runWithTenant(T2, () => User.create({ username: 'receiver_t2', email: 't2@chat.com', balance: 100 }));

  roomT1 = await runWithTenant(T1, () => ChatRoom.create({
    name: 'T1 Lounge',
    slug: 't1-lounge',
    isActive: true,
  }));

  ticketT1 = await runWithTenant(T1, () => Ticket.create({
    userId: u1._id,
    subject: 'Issue with T1',
    status: 'open',
  }));
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('sendTip rejects cross-tenant recipient with RECIPIENT_NOT_FOUND', async () => {
  await runWithTenant(T1, async () => {
    await assert.rejects(
      async () => sendTip(u1._id, u2._id, roomT1._id, 50, 'cross-tenant tip'),
      (err) => err.status === 404 && err.code === 'RECIPIENT_NOT_FOUND'
    );
  });

  // Verify balances untouched
  const refU1 = await User.findById(u1._id);
  const refU2 = await User.findById(u2._id);
  assert.equal(refU1.balance, 500);
  assert.equal(refU2.balance, 100);
});

test('T2 staff moderating T1 room or viewing T1 ticket receives 404', async () => {
  const reqRoom = { params: { id: String(roomT1._id) }, tenant: { id: T2 }, validated: { name: 'Renamed' } };
  const reqTicket = { params: { id: String(ticketT1._id) }, tenant: { id: T2 }, user: { id: new mongoose.Types.ObjectId() } };
  const res = { json: () => assert.fail('should not succeed') };

  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => updateRoom(reqRoom, res, (err) => { throw err; }),
      (err) => err.status === 404
    );
    await assert.rejects(
      async () => getTicketById(reqTicket, res, (err) => { throw err; }),
      (err) => err.status === 404
    );
  });
});
```

- [ ] **Step 2: Update `server/src/services/chat.js`, `server/src/controllers/chat.js`, and `server/src/controllers/ticket.js`**:
In `services/chat.js` `tipInSession`:
```js
  const fromUser = await User.findById(fromUserId).session(session);
  if (!fromUser) throw createError(404, 'SENDER_NOT_FOUND', 'Gönderen bulunamadı');

  const toUser = await User.findById(toUserId).select('username isActive tenantId').session(session);
  if (!toUser || toUser.isActive === false) throw createError(404, 'RECIPIENT_NOT_FOUND', 'Alıcı bulunamadı');

  // Multi-tenant check (§3 #6, §8.3): recipient must belong to the same tenant as sender
  if (fromUser.tenantId && toUser.tenantId && String(fromUser.tenantId) !== String(toUser.tenantId)) {
    throw createError(404, 'RECIPIENT_NOT_FOUND', 'Alıcı bulunamadı');
  }

  // Room must belong to the same tenant
  if (fromUser.tenantId && room.tenantId && String(fromUser.tenantId) !== String(room.tenantId)) {
    throw createError(404, 'NOT_FOUND', 'Oda bulunamadı');
  }
```
In `controllers/chat.js`:
Scope `updateRoom`, `deleteRoom`, `banUserFromRoom`, `unbanUserFromRoom`, `muteUserInRoom`, `unmuteUserInRoom`, `deleteMessage`, `getModerationHistory` by `tenantId: req.tenant.id`.
In `controllers/ticket.js`:
Scope `getTicketById`, `addMessage`, `updateStatus` by `tenantId: req.tenant.id`.

- [ ] **Step 3: Run the tests**:
```bash
node --test server/test/chatSupportScope.test.js
```

- [ ] **Step 4: Commit**:
```bash
git add server/src/services/chat.js server/src/controllers/chat.js server/src/controllers/ticket.js server/test/chatSupportScope.test.js
git commit -m "feat(chat): prevent cross-tenant tips and scope support tickets"
```

---

### Task 5: Brand, Static Pages & Messaging Scoping

**Files:**
- Modify: `server/src/controllers/multiBrand.js`
- Modify: `server/src/controllers/staticPages.js`
- Modify: `server/src/controllers/smsTemplate.js`
- Modify: `server/src/controllers/adminMailTemplates.js`
- Test: `server/test/brandMessagingScope.test.js`

**Interfaces:**
- Consumes: `Brand`, `StaticPage`, `SmsTemplate`, `SmsSender`, `SystemMailTemplate`, `createError`, `req.tenant`.
- Produces: Brand domain and config scoping, static page CRUD scoping, SMS and email template `:id` scoping.

- [ ] **Step 1: Write the failing tests** in `server/test/brandMessagingScope.test.js`:
```js
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Brand from '../src/models/Brand.js';
import StaticPage from '../src/models/StaticPage.js';
import SmsTemplate from '../src/models/SmsTemplate.js';
import SystemMailTemplate from '../src/models/SystemMailTemplate.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { getBrandById, updateBrand } from '../src/controllers/multiBrand.js';
import { getStaticPageById, updateStaticPage } from '../src/controllers/staticPages.js';
import { updateTemplate as updateSmsTemplate } from '../src/controllers/smsTemplate.js';
import { getTemplateById as getMailTemplateById } from '../src/controllers/adminMailTemplates.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip5_t5_brand_msg';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

let brandT1, pageT1, smsT1, mailT1;

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  brandT1 = await runWithTenant(T1, () => Brand.create({ name: 'Brand T1', slug: 'brand-t1', domains: [] }));
  pageT1 = await runWithTenant(T1, () => StaticPage.create({ title: 'About T1', slug: 'about-t1', content: 'Info' }));
  smsT1 = await runWithTenant(T1, () => SmsTemplate.create({ key: 'welcome_t1', name: 'Welcome', template: 'Hi' }));
  mailT1 = await runWithTenant(T1, () => SystemMailTemplate.create({ event: 'welcome_mail_t1', subject: 'Welcome', htmlContent: '<h1>Hi</h1>' }));
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('T2 staff querying T1 Brand, StaticPage, SmsTemplate, or SystemMailTemplate receives 404', async () => {
  const reqBrand = { params: { id: String(brandT1._id) }, tenant: { id: T2 }, body: {} };
  const reqPage = { params: { id: String(pageT1._id) }, tenant: { id: T2 }, body: {} };
  const reqSms = { params: { id: String(smsT1._id) }, tenant: { id: T2 }, validated: { template: 'Hacked' } };
  const reqMail = { params: { id: String(mailT1._id) }, tenant: { id: T2 } };
  const res = { json: () => assert.fail('should not succeed') };

  await runWithTenant(T2, async () => {
    await assert.rejects(async () => getBrandById(reqBrand, res, (e) => { throw e; }), (e) => e.status === 404);
    await assert.rejects(async () => getStaticPageById(reqPage, res, (e) => { throw e; }), (e) => e.status === 404);
    await assert.rejects(async () => updateSmsTemplate(reqSms, res, (e) => { throw e; }), (e) => e.status === 404);
    await assert.rejects(async () => getMailTemplateById(reqMail, res, (e) => { throw e; }), (e) => e.status === 404);
  });
});
```

- [ ] **Step 2: Update controllers in `multiBrand.js`, `staticPages.js`, `smsTemplate.js`, and `adminMailTemplates.js`**:
In each controller, wrap queries by `:id` with `{ _id: req.params.id, tenantId: req.tenant.id }`, returning 404 `NOT_FOUND` when the document is not found.

- [ ] **Step 3: Run the tests**:
```bash
node --test server/test/brandMessagingScope.test.js
```

- [ ] **Step 4: Commit**:
```bash
git add server/src/controllers/multiBrand.js server/src/controllers/staticPages.js server/src/controllers/smsTemplate.js server/src/controllers/adminMailTemplates.js server/test/brandMessagingScope.test.js
git commit -m "feat(branding): scope brand, static pages, sms and mail templates"
```

---

### Task 6: Operations, Event Settlement & Betting Scoping

**Files:**
- Modify: `server/src/controllers/reconciliation.js`
- Modify: `server/src/controllers/events.js`
- Modify: `server/src/controllers/bets.js`
- Test: `server/test/operationsBettingScope.test.js`

**Interfaces:**
- Consumes: `ReconciliationJob`, `Event`, `Bet`, `createError`, `req.tenant`.
- Produces: Scoped reconciliation jobs, manual sports settlement restricted to platform permission (`platform:events:settle` per §4.6, G-14), bet lookups scoped to player and tenant.

- [ ] **Step 1: Write the failing tests** in `server/test/operationsBettingScope.test.js`:
```js
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Event from '../src/models/Event.js';
import Bet from '../src/models/Bet.js';
import ReconciliationJob from '../src/models/ReconciliationJob.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { getReconciliationJob } from '../src/controllers/reconciliation.js';
import { settle as settleEvent } from '../src/controllers/events.js';
import { getBetById } from '../src/controllers/bets.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip5_t6_ops_betting';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

let jobT1, eventCAT, betT1;

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  jobT1 = await runWithTenant(T1, () => ReconciliationJob.create({
    provider: 'slikair',
    status: 'completed',
    date: '2026-11-12',
  }));

  eventCAT = await Event.create({
    name: 'Team A vs Team B',
    status: 'finished',
    sport: 'football',
  });

  betT1 = await runWithTenant(T1, () => Bet.create({
    userId: new mongoose.Types.ObjectId(),
    eventId: eventCAT._id,
    amount: 50,
    status: 'pending',
  }));
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('T2 staff accessing T1 reconciliation job receives 404', async () => {
  const req = { params: { id: String(jobT1._id) }, tenant: { id: T2 } };
  const res = { json: () => assert.fail('should not succeed') };

  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => getReconciliationJob(req, res, (e) => { throw e; }),
      (e) => e.status === 404
    );
  });
});

test('tenant staff attempting manual event settle receives 403 (requires platform permission)', async () => {
  const req = {
    params: { id: String(eventCAT._id) },
    staff: { scope: 'tenant', id: new mongoose.Types.ObjectId() },
    tenant: { id: T1 },
    body: { outcome: 'team_a' },
  };
  const res = { json: () => assert.fail('should not succeed') };

  await assert.rejects(
    async () => settleEvent(req, res, (e) => { throw e; }),
    (e) => e.status === 403 && e.code === 'FORBIDDEN'
  );
});

test('T2 player querying T1 bet receives 404', async () => {
  const req = {
    params: { id: String(betT1._id) },
    user: { id: new mongoose.Types.ObjectId() },
    tenant: { id: T2 },
  };
  const res = { json: () => assert.fail('should not succeed') };

  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => getBetById(req, res, (e) => { throw e; }),
      (e) => e.status === 404
    );
  });
});
```

- [ ] **Step 2: Update `server/src/controllers/reconciliation.js`, `server/src/controllers/events.js`, and `server/src/controllers/bets.js`**:
In `reconciliation.js`: Scope job retrieval and item lookups by `{ _id: req.params.id, tenantId: req.tenant.id }`.
In `events.js`: Settle endpoint enforces `req.staff?.scope === 'platform'` or permission `platform:events:settle`. Tenant-scoped staff is rejected with 403 `FORBIDDEN`.
In `bets.js`: Ensure `getBetById` filters by `{ _id: req.params.id, userId: req.user.id, tenantId: req.tenant.id }`.

- [ ] **Step 3: Run the tests**:
```bash
node --test server/test/operationsBettingScope.test.js
```

- [ ] **Step 4: Commit**:
```bash
git add server/src/controllers/reconciliation.js server/src/controllers/events.js server/src/controllers/bets.js server/test/operationsBettingScope.test.js
git commit -m "feat(betting): scope reconciliation, bets, and protect manual event settlement"
```

---

### Task 7: Admin Controller Scoping & Tenant Reports

**Files:**
- Modify: `server/src/controllers/admin.js`
- Modify: `server/src/services/adminCounts.js`
- Modify: `server/src/services/activityFeed.js`
- Test: `server/test/adminControllerScope.test.js`

**Interfaces:**
- Consumes: `Transaction`, `User`, `KycDocument`, `Bot`, `Role`, `createError`, `req.tenant`.
- Produces: Scoped admin financial actions (`updateBalance`, `approveCryptoDeposit`, `approveCryptoWithdrawal`, `rejectCryptoWithdrawal`, `resolveCryptoWithdrawal`), scoped player and KYC lookups, scoped admin queue counts and analytics reports.

- [ ] **Step 1: Write the failing tests** in `server/test/adminControllerScope.test.js`:
```js
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Transaction from '../src/models/Transaction.js';
import KycDocument from '../src/models/KycDocument.js';
import { runWithTenant } from '../src/tenancy/context.js';
import {
  updateBalance,
  approveCryptoDeposit,
  approveCryptoWithdrawal,
  getUser,
  getKycSubmissionDetail,
  getStats,
} from '../src/controllers/admin.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip5_t7_admin_ctrl';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

let u1, txDepT1, txWdT1, kycT1;

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  u1 = await runWithTenant(T1, () => User.create({ username: 'player_t1', email: 'p1@t1.com', balance: 200 }));

  txDepT1 = await runWithTenant(T1, () => Transaction.create({
    userId: u1._id,
    type: 'crypto_deposit',
    amount: 100,
    status: 'pending_approval',
    idempotencyKey: 't1_cdep_1',
  }));

  txWdT1 = await runWithTenant(T1, () => Transaction.create({
    userId: u1._id,
    type: 'crypto_withdraw',
    amount: -50,
    status: 'pending',
    idempotencyKey: 't1_cwd_1',
  }));

  kycT1 = await runWithTenant(T1, () => KycDocument.create({
    userId: u1._id,
    documentType: 'passport',
    fileName: 'pass.jpg',
    fileSize: 1024,
    mimeType: 'image/jpeg',
    status: 'pending',
  }));
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('T2 staff updating T1 player balance receives 404', async () => {
  const req = {
    params: { id: String(u1._id) },
    tenant: { id: T2 },
    body: { amount: 50, note: 'hacked credit' },
    user: { id: new mongoose.Types.ObjectId() },
  };
  const res = { json: () => assert.fail('should not succeed') };

  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => updateBalance(req, res, (e) => { throw e; }),
      (e) => e.status === 404
    );
  });
  const ref = await User.findById(u1._id);
  assert.equal(ref.balance, 200);
});

test('T2 staff approving T1 crypto deposit or withdrawal receives 404', async () => {
  const reqDep = { params: { id: String(txDepT1._id) }, tenant: { id: T2 }, user: { id: new mongoose.Types.ObjectId() } };
  const reqWd = { params: { id: String(txWdT1._id) }, tenant: { id: T2 }, user: { id: new mongoose.Types.ObjectId() } };
  const res = { json: () => assert.fail('should not succeed') };

  await runWithTenant(T2, async () => {
    await assert.rejects(async () => approveCryptoDeposit(reqDep, res, (e) => { throw e; }), (e) => e.status === 404);
    await assert.rejects(async () => approveCryptoWithdrawal(reqWd, res, (e) => { throw e; }), (e) => e.status === 404);
  });
});

test('T2 staff querying T1 user or KYC details receives 404', async () => {
  const reqUser = { params: { id: String(u1._id) }, tenant: { id: T2 } };
  const reqKyc = { params: { id: String(kycT1._id) }, tenant: { id: T2 } };
  const res = { json: () => assert.fail('should not succeed') };

  await runWithTenant(T2, async () => {
    await assert.rejects(async () => getUser(reqUser, res, (e) => { throw e; }), (e) => e.status === 404);
    await assert.rejects(async () => getKycSubmissionDetail(reqKyc, res, (e) => { throw e; }), (e) => e.status === 404);
  });
});
```

- [ ] **Step 2: Update `server/src/controllers/admin.js`, `server/src/services/adminCounts.js`, and `server/src/services/activityFeed.js`**:
In `controllers/admin.js`:
- Scope all `:id` lookups with `tenantId: req.tenant?.id`, returning 404 on mismatch.
- In `updateBalance`, verify `User.findOne({ _id: req.params.id, tenantId: req.tenant.id })`.
- In `approveCryptoDeposit`, `approveCryptoWithdrawal`, `rejectCryptoWithdrawal`, `resolveCryptoWithdrawal`, scope `Transaction` lookups with `tenantId: req.tenant.id`.
- In `getUser`, `updateUser`, `deleteUser`, `getKycSubmissionDetail`, `approveKycSubmission`, `rejectKycSubmission`, `setKycSubmissionUnderReview`, scope lookups with `tenantId: req.tenant.id`.
- In `getStats`, `getCasinoStats`, `getCryptoStats`, `getBankStats`, ensure all aggregates run inside `runWithTenant(req.tenant.id, ...)` or filter by `{ tenantId: req.tenant.id }`.
In `services/adminCounts.js`:
Pass `tenantId` (or read ambient tenant) so `countDocuments` queries are tenant-scoped.

- [ ] **Step 3: Run the tests**:
```bash
node --test server/test/adminControllerScope.test.js
```

- [ ] **Step 4: Commit**:
```bash
git add server/src/controllers/admin.js server/src/services/adminCounts.js server/src/services/activityFeed.js server/test/adminControllerScope.test.js
git commit -m "feat(admin): tenant-scope admin financial approvals, kyc and stats endpoints"
```

---

### Task 8: `TenantDailyStat` Pre-aggregated Metrics

**Files:**
- Create: `server/src/models/TenantDailyStat.js`
- Create: `server/src/services/tenantDailyStat.js`
- Test: `server/test/tenantDailyStat.test.js`

**Interfaces:**
- Consumes: `Transaction`, `Bet`, `CasinoRound`, `User`, `runAsPlatform`.
- Produces: `TenantDailyStat` model with compound unique index `{ tenantId: 1, brandId: 1, date: 1, currency: 1 }`, daily aggregation service excluding bots/demo, partner retrieval function with small-cell suppression (<5) and zero PII.

- [ ] **Step 1: Write the failing tests** in `server/test/tenantDailyStat.test.js`:
```js
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Transaction from '../src/models/Transaction.js';
import Bet from '../src/models/Bet.js';
import CasinoRound from '../src/models/CasinoRound.js';
import TenantDailyStat from '../src/models/TenantDailyStat.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { aggregateTenantDailyStat, getPartnerDailyMetrics } from '../src/services/tenantDailyStat.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip5_t8_daily_stats';
const T1 = new mongoose.Types.ObjectId();
const TODAY = '2026-11-12';

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  // Create real players
  const p1 = await runWithTenant(T1, () => User.create({ username: 'real_p1', email: 'p1@stat.com', createdAt: new Date('2026-11-12T01:00:00Z') }));
  const p2 = await runWithTenant(T1, () => User.create({ username: 'real_p2', email: 'p2@stat.com', createdAt: new Date('2026-11-12T02:00:00Z') }));
  // Create bot and seed players (must be excluded)
  const bot = await runWithTenant(T1, () => User.create({ username: 'bot_1', isBot: true, createdAt: new Date('2026-11-12T03:00:00Z') }));
  const seed = await runWithTenant(T1, () => User.create({ username: 'seed_1', isSeed: true, createdAt: new Date('2026-11-12T04:00:00Z') }));

  // Real deposits
  await runWithTenant(T1, () => Transaction.create({
    userId: p1._id,
    type: 'deposit',
    amount: 100,
    status: 'completed',
    currency: 'TRY',
    createdAt: new Date('2026-11-12T05:00:00Z'),
  }));
  // Bot deposit (must be excluded)
  await runWithTenant(T1, () => Transaction.create({
    userId: bot._id,
    type: 'deposit',
    amount: 9999,
    status: 'completed',
    currency: 'TRY',
    createdAt: new Date('2026-11-12T05:30:00Z'),
  }));

  // Real casino rounds
  await runWithTenant(T1, () => CasinoRound.create({
    userId: p1._id,
    bet: 50,
    payout: 20,
    net: -30,
    currency: 'TRY',
    createdAt: new Date('2026-11-12T06:00:00Z'),
  }));
  // Seed casino round (must be excluded)
  await runWithTenant(T1, () => CasinoRound.create({
    userId: seed._id,
    bet: 500,
    payout: 200,
    net: -300,
    isSeed: true,
    currency: 'TRY',
    createdAt: new Date('2026-11-12T06:30:00Z'),
  }));
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('aggregateTenantDailyStat computes correct figures and excludes bots/seeds', async () => {
  const stat = await aggregateTenantDailyStat(T1, TODAY, { currency: 'TRY' });
  assert.equal(stat.date, TODAY);
  assert.equal(stat.currency, 'TRY');
  assert.equal(stat.deposits, 100);
  assert.equal(stat.casinoTurnover, 50);
  assert.equal(stat.casinoGgr, 30);
  assert.equal(stat.newPlayers, 2); // p1 and p2 only
});

test('partner view applies small-cell suppression for activePlayers < 5 and excludes PII', async () => {
  const rows = await getPartnerDailyMetrics({ tenantId: T1, from: TODAY, to: TODAY });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].activePlayers, '<5');
  assert.equal(rows[0].deposits, 100);
  assert.equal(rows[0].email, undefined);
  assert.equal(rows[0].username, undefined);
});
```

- [ ] **Step 2: Implement `TenantDailyStat.js` and `tenantDailyStat.js`**:
In `server/src/models/TenantDailyStat.js`:
```js
import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const tenantDailyStatSchema = new mongoose.Schema({
  tenantId: { type: ObjectId, ref: 'Tenant', required: true, index: true },
  brandId: { type: ObjectId, ref: 'Brand', default: null },
  date: { type: String, required: true }, // YYYY-MM-DD
  currency: { type: String, required: true, default: 'TRY' },
  casinoTurnover: { type: Number, default: 0 },
  casinoGgr: { type: Number, default: 0 },
  sportsTurnover: { type: Number, default: 0 },
  sportsGgrRealized: { type: Number, default: 0 },
  bonusCost: { type: Number, default: 0 },
  deposits: { type: Number, default: 0 },
  withdrawals: { type: Number, default: 0 },
  activePlayers: { type: Number, default: 0 },
  newPlayers: { type: Number, default: 0 },
  depositors: { type: Number, default: 0 },
  ftd: { type: Number, default: 0 },
  computedAt: { type: Date, default: Date.now },
}, { timestamps: true });

tenantDailyStatSchema.index(
  { tenantId: 1, brandId: 1, date: 1, currency: 1 },
  { unique: true }
);

export default mongoose.model('TenantDailyStat', tenantDailyStatSchema);
```

In `server/src/services/tenantDailyStat.js`:
Implement `aggregateTenantDailyStat(tenantId, dateStr, options)` and `getPartnerDailyMetrics({ tenantId, from, to })` wrapping daily queries in `runAsPlatform('tenant-daily-stat-aggregation', ...)` with bot and seed exclusion filters (`isBot: { $ne: true }`, `isSeed: { $ne: true }`), upserting via `TenantDailyStat.findOneAndUpdate`, and formatting `activePlayers < 5 ? '<5' : String(activePlayers)`.

- [ ] **Step 3: Run the tests**:
```bash
node --test server/test/tenantDailyStat.test.js
```

- [ ] **Step 4: Commit**:
```bash
git add server/src/models/TenantDailyStat.js server/src/services/tenantDailyStat.js server/test/tenantDailyStat.test.js
git commit -m "feat(metrics): add TenantDailyStat model and aggregation worker with small-cell suppression"
```

---

### Task 9: Tenancy Lint Rules (`runAsPlatform` allow-list and controller unscoped queries)

**Files:**
- Create: `scripts/lint-tenancy.mjs`
- Create: `scripts/lint-tenancy.test.mjs`
- Modify: `package.json`
- Modify: `server/package.json`

**Interfaces:**
- Consumes: Node filesystem, AST/regex parsing of JavaScript files.
- Produces: CLI linter validating that `runAsPlatform` is strictly used in allowed files and that controllers do not make bare unscoped queries against tenant models.

- [ ] **Step 1: Write the failing tests** in `scripts/lint-tenancy.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRunAsPlatformUsage, checkControllerQueries } from './lint-tenancy.mjs';

test('checkRunAsPlatformUsage permits allow-listed files', () => {
  const code = "import { runAsPlatform } from './context.js'; runAsPlatform('test-reason', fn);";
  const allowedFile = 'server/src/services/tenantDailyStat.js';
  const errors = checkRunAsPlatformUsage(allowedFile, code);
  assert.equal(errors.length, 0);
});

test('checkRunAsPlatformUsage flags unauthorized file usage', () => {
  const code = "import { runAsPlatform } from '../tenancy/context.js'; runAsPlatform('leak', fn);";
  const forbiddenFile = 'server/src/controllers/promotions.js';
  const errors = checkRunAsPlatformUsage(forbiddenFile, code);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /runAsPlatform is not permitted in server\/src\/controllers\/promotions\.js/);
});

test('checkControllerQueries flags bare Model.collection access on tenant models', () => {
  const code = "const users = await User.collection.find({});";
  const file = 'server/src/controllers/testController.js';
  const errors = checkControllerQueries(file, code);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /bare collection access prohibited/);
});
```

- [ ] **Step 2: Implement `scripts/lint-tenancy.mjs`**:
```js
#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

export const RUN_AS_PLATFORM_ALLOWLIST = new Set([
  'server/src/services/settlement.js',
  'server/src/services/tenantDailyStat.js',
  'server/src/services/ledgerDedupe.js',
  'server/src/tenancy/provisioning.js',
  'server/src/tenancy/defaultTenant.js',
  'server/src/tenancy/staffMigration.js',
  'server/src/tenancy/settingsMigration.js',
  'server/src/tenancy/backfill.js',
  'server/src/tenancy/indexBuilder.js',
  'server/src/tenancy/context.js',
  'server/src/tenancy/index.js',
]);

export function checkRunAsPlatformUsage(filePath, content) {
  const norm = filePath.replace(/\\/g, '/');
  if (norm.startsWith('server/test/') || norm.startsWith('server/migrations/') || norm.startsWith('scripts/')) {
    return [];
  }
  if (!content.includes('runAsPlatform(')) return [];
  if (RUN_AS_PLATFORM_ALLOWLIST.has(norm)) return [];
  return [`runAsPlatform is not permitted in ${norm} (spec §4.4 #5)`];
}

export function checkControllerQueries(filePath, content) {
  const norm = filePath.replace(/\\/g, '/');
  if (!norm.includes('controllers/')) return [];
  const errors = [];
  if (/\.collection\.(find|update|delete|insert|bulkWrite)/.test(content)) {
    errors.push(`bare collection access prohibited in controller ${norm}`);
  }
  return errors;
}

export function runLint(rootDir = process.cwd()) {
  const allErrors = [];
  function walk(dir) {
    for (const f of readdirSync(dir)) {
      if (f === 'node_modules' || f === '.git' || f === 'dist' || f === 'coverage') continue;
      const full = join(dir, f);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (f.endsWith('.js') || f.endsWith('.mjs')) {
        const rel = relative(rootDir, full).replace(/\\/g, '/');
        const src = readFileSync(full, 'utf8');
        allErrors.push(...checkRunAsPlatformUsage(rel, src));
        allErrors.push(...checkControllerQueries(rel, src));
      }
    }
  }
  walk(rootDir);
  return allErrors;
}

if (process.argv[1] && process.argv[1].endsWith('lint-tenancy.mjs')) {
  const errs = runLint();
  if (errs.length > 0) {
    console.error('Tenancy lint errors found:');
    for (const err of errs) console.error('  - ' + err);
    process.exit(1);
  } else {
    console.log('Tenancy lint passed: 0 violations.');
    process.exit(0);
  }
}
```

Add `"lint:tenancy": "node scripts/lint-tenancy.mjs"` to `package.json`.

- [ ] **Step 3: Run the tests**:
```bash
node --test scripts/lint-tenancy.test.mjs
node scripts/lint-tenancy.mjs
```

- [ ] **Step 4: Commit**:
```bash
git add scripts/lint-tenancy.mjs scripts/lint-tenancy.test.mjs package.json server/package.json
git commit -m "feat(lint): add tenancy lint rules for runAsPlatform allowlist and controller queries"
```

---

### Task 10: §8.3 Money Paths Acceptance Test Suite

**Files:**
- Create: `server/test/moneyPathsTenancy.test.js`

**Interfaces:**
- Consumes: All scoped controllers, ledger service, `User`, `Transaction`, `BankDepositRequest`, `SlikairPayout`, `Promotion`, `ChatTip`.
- Produces: Integrated acceptance test suite covering cross-tenant financial isolation across the 46 money paths per spec §8.3.

- [ ] **Step 1: Write the acceptance suite** in `server/test/moneyPathsTenancy.test.js`:
```js
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Transaction from '../src/models/Transaction.js';
import BankDepositRequest from '../src/models/BankDepositRequest.js';
import SlikairPayout from '../src/models/SlikairPayout.js';
import Promotion from '../src/models/Promotion.js';
import BonusWagering from '../src/models/BonusWagering.js';
import ChatRoom from '../src/models/ChatRoom.js';
import ChatTip from '../src/models/ChatTip.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { approveDeposit } from '../src/controllers/bank.js';
import { updateBalance, approveCryptoDeposit, approveCryptoWithdrawal } from '../src/controllers/admin.js';
import { initiatePayout } from '../src/controllers/slikairController.js';
import { claim as claimPromotion } from '../src/controllers/promotions.js';
import { sendTip } from '../src/services/chat.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip5_t10_money_paths';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

let u1, u2, roomT1;

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  u1 = await runWithTenant(T1, () => User.create({ username: 'money_p1', email: 'm1@vip90.test', balance: 1000 }));
  u2 = await runWithTenant(T2, () => User.create({ username: 'money_p2', email: 'm2@vip90.test', balance: 500 }));

  roomT1 = await runWithTenant(T1, () => ChatRoom.create({ name: 'T1 Room', slug: 't1-room', isActive: true }));
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('§8.3 Flow 1: T1 Bank deposit approval credits T1 player; T2 admin approval returns 404', async () => {
  const reqBank = await runWithTenant(T1, () => BankDepositRequest.create({
    userId: u1._id,
    amount: 200,
    bankName: 'Bank A',
    senderName: 'P1',
    status: 'pending',
  }));

  // T2 admin attempt -> 404
  const reqCross = { params: { id: String(reqBank._id) }, tenant: { id: T2 }, user: { id: new mongoose.Types.ObjectId() } };
  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => approveDeposit(reqCross, { json: () => {} }, (e) => { throw e; }),
      (e) => e.status === 404
    );
  });

  // T1 admin approval -> 200
  const reqValid = { params: { id: String(reqBank._id) }, tenant: { id: T1 }, user: { id: new mongoose.Types.ObjectId() } };
  let approvedData;
  await runWithTenant(T1, async () => {
    await approveDeposit(reqValid, { json: (d) => { approvedData = d; } }, (e) => { throw e; });
  });

  const refreshedU1 = await User.findById(u1._id);
  assert.equal(refreshedU1.balance, 1200);

  const tx = await Transaction.findOne({ referenceId: reqBank._id });
  assert.ok(tx);
  assert.equal(String(tx.tenantId), String(T1));
  assert.equal(tx.amount, 200);
});

test('§8.3 Flow 2: Slikair payout with cross-tenant userId returns 404 and leaves balances untouched', async () => {
  const req = {
    validated: {
      userId: String(u1._id),
      amount: 150,
      currency: 'TRY',
      method: 'bank',
      country: 'TR',
      paymentDetails: {},
    },
    tenant: { id: T2 },
    user: { id: new mongoose.Types.ObjectId() },
  };

  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => initiatePayout(req, { status: () => ({ json: () => {} }) }, (e) => { throw e; }),
      (e) => e.status === 404
    );
  });

  const refreshedU1 = await User.findById(u1._id);
  assert.equal(refreshedU1.balance, 1200);
  const payoutCount = await SlikairPayout.countDocuments({ userId: u1._id });
  assert.equal(payoutCount, 0);
});

test('§8.3 Flow 3: Cross-tenant promotion claim returns 404; same-tenant claim writes ledger and wagering', async () => {
  const promo = await runWithTenant(T1, () => Promotion.create({
    title: 'T1 100% Reload',
    amount: 100,
    isActive: true,
    wageringMultiplier: 25,
    claimedBy: [],
  }));

  // T2 player claim -> 404
  const reqCross = {
    params: { id: String(promo._id) },
    user: { id: String(u2._id) },
    tenant: { id: T2 },
    validated: { acceptedBonusTerms: true },
  };
  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => claimPromotion(reqCross, { json: () => {} }, (e) => { throw e; }),
      (e) => e.status === 404
    );
  });

  // T1 player claim -> 200
  const reqValid = {
    params: { id: String(promo._id) },
    user: { id: String(u1._id) },
    tenant: { id: T1 },
    validated: { acceptedBonusTerms: true },
  };
  let claimData;
  await runWithTenant(T1, async () => {
    await claimPromotion(reqValid, { json: (d) => { claimData = d; } }, (e) => { throw e; });
  });

  assert.equal(claimData.wageringMultiplier, 25);
  const wagering = await BonusWagering.findOne({ promotionId: promo._id, userId: u1._id });
  assert.ok(wagering);
  assert.equal(String(wagering.tenantId), String(T1));
});

test('§8.3 Flow 4: Chat tip cross-tenant attempt returns 404 RECIPIENT_NOT_FOUND', async () => {
  await runWithTenant(T1, async () => {
    await assert.rejects(
      async () => sendTip(u1._id, u2._id, roomT1._id, 50, 'tip to T2 player'),
      (e) => e.status === 404 && e.code === 'RECIPIENT_NOT_FOUND'
    );
  });

  const tipCount = await ChatTip.countDocuments();
  assert.equal(tipCount, 0);
});

test('§8.3 Flow 5: Admin balance adjustment by cross-tenant staff returns 404', async () => {
  const reqCross = {
    params: { id: String(u1._id) },
    tenant: { id: T2 },
    body: { amount: 300, note: 'invalid adjustment' },
    user: { id: new mongoose.Types.ObjectId() },
  };
  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => updateBalance(reqCross, { json: () => {} }, (e) => { throw e; }),
      (e) => e.status === 404
    );
  });
});
```

- [ ] **Step 2: Run the test suite**:
```bash
node --test server/test/moneyPathsTenancy.test.js
```

- [ ] **Step 3: Commit**:
```bash
git add server/test/moneyPathsTenancy.test.js
git commit -m "test(acceptance): add §8.3 money paths multi-tenant isolation suite"
```

---

### Task 11: Documentation, AGENTS.md, and Changelog

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/product/02-yapilandirma.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: Completed İP-5 scoping rules, `TenantDailyStat` architecture, and `log` mode default.
- Produces: Updated documentation and Turkish entry in `CHANGELOG.md`.

- [ ] **Step 1: Update `CHANGELOG.md`** under `## [Yayınlanmadı]`:
```markdown
### Eklendi
- Çok kiracılı para ve yönetim uç noktaları yalıtımı (İP-5): tüm `:id` aramalarında kiracı kontrolü (G-3 IDOR koruması; başka kiracının kaydı 404 döner).
- Slikair payout başlatmada oyuncu `userId`'sinin kiracıya ait olduğunu doğrulayan güvenlik kontrolü (§3 #4).
- Sohbet bahşişinde (`sendTip`) alıcı ve gönderenin aynı kiracıda olduğunu doğrulayan kontrol (§3 #6; başka kiracıya bahşiş 404 `RECIPIENT_NOT_FOUND`).
- Partner ve platform raporlaması için bot ve demo verisi içermeyen `TenantDailyStat` günlük toplama modeli ve işi (§4.3.6).
- Partner metriklerinde 5'ten az aktif oyuncu için küçük hücre bastırma (`<5`) ve kişisel veri gizleme koruması.
- `scripts/lint-tenancy.mjs` ile `runAsPlatform` izin listesi ve controller kapsamsız sorgu lint kuralları.

### Değişti
- Tek kiracılı modda varsayılan `TENANCY_ENFORCEMENT` değeri `'off'`tan `'log'` moduna geçirildi (G7; kapsamsız sorgular loglanır, tek mod akışı kesilmez).
```

- [ ] **Step 2: Update `docs/product/02-yapilandirma.md` and `AGENTS.md`**:
Document the default `'log'` enforcement setting, `TenantDailyStat` metrics aggregation, and explicit `:id` tenant-scoping invariants for controllers.

- [ ] **Step 3: Run changelog and leak scans**:
```bash
node scripts/check-changelog.mjs
node scripts/leak-scan.mjs
```

- [ ] **Step 4: Commit**:
```bash
git add CHANGELOG.md docs/product/02-yapilandirma.md AGENTS.md
git commit -m "docs: document İP-5 money paths, admin scoping invariants, and TenantDailyStat"
```
