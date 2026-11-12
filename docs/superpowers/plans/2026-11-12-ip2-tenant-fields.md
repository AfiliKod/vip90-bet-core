# İP-2 Tenant Fields, Backfill and Compound Indexes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement work package İP-2 of the approved multi-tenant design: add `tenantId` field to all TEN collections (with `required: false` during transition per G2 and `immutable: true`), apply `defineTenantModel` and `tenantScoped` plugin, stamp `tenantId` from ambient context, add `currency` field where required by K14, add compound indexes from §2.1 while preserving existing global unique indexes in single mode, implement the G3 resumable 10k-batched backfill migration (`0005_tenancy_backfill_tenant_id`), implement the G4 online compound index build migration (`0006_tenancy_compound_indexes`), and verify with §8.2 unique-index and §8.6 migration tests.

**Architecture:** Tenant-owned models in `server/src/models/` adopt `defineTenantModel(name, schema)` (replacing direct `mongoose.model(name, schema)` calls). Schema definitions include `tenantId: { type: ObjectId, ref: 'Tenant', required: false, index: true, immutable: true }` and compound indexes from spec §2.1. Schemas enforce `{ autoIndex: false }` to prevent blocking index builds on server boot. Existing global unique indexes remain in single mode. Money-bearing records receive `currency: { type: String, default: 'TRY' }` per K14. The G3 migration (`server/migrations/0005_tenancy_backfill_tenant_id.js` + `server/src/tenancy/backfill.js`) backfills legacy unassigned documents to the default tenant in 10,000-document batches, recording progress in the `Migration` record per collection, verifying `countDocuments({ $or: [{ tenantId: null }, { tenantId: { $exists: false } }] }) === 0`, and includes `transactions_dedupe_archive`. The G4 migration (`server/migrations/0006_tenancy_compound_indexes.js` + `server/src/tenancy/indexBuilder.js`) builds compound indexes online; `listIndexes` shows both old global unique and new compound unique indexes. `syncIndexes` is strictly prohibited.

**Tech Stack:** Node >= 22 (ESM), Express 4, Mongoose 8.24, `node:test` + `node:assert/strict`, local MongoDB (replica set `rs0` on 127.0.0.1:27017).

**Spec:** `docs/superpowers/specs/2026-11-09-multi-tenant-design.md` (Turkish; upstream copy in `core-ipu`). Sections used: §2.1 (TEN/TEN-BRAND/PLAT/CAT/PROV model classes, mechanisms F and U), §4.2, §4.3.2, §4.3.7, §4.4 (fields, indexes, immutable tenantId, defineTenantModel), §6.3 (G2, G3, G4), §7.1 (İP-2 row), §8.2 (unique index test suite), §8.6 (migration and backfill verification).

---

## Global Constraints

- **Premium add-on models are not in core.** Core never imports premium.
  > [!NOTE]
  > **Not in core:** `[inhouse]` models (`Operator`, `OpenRound`, `PlayerSeedPair`, `ProviderRound`, `WalletCallbackOutbox`) and `[igames]` models (`IgamesCallbackReceipt`) live in private repositories (`vip90-bet-inhouse`, `vip90-bet-igames`). Their `tenantId` fields and provider-specific indexes are maintained in their respective submodules (or mapped via `Tenant.providerOperatorId`). Core provides `server/src/tenancy/index.js` exports (`defineTenantModel`, `registerTenantCollection`, `tenantScoped`) so premium add-ons register themselves when loaded.
- Model name is `Tenant`, field name is `tenantId`. Never `Operator` or `operatorId` for the tenant (§4.2, R2). `GameSettings.operatorId` remains untouched as it refers to provider B2B customers (`Tenant.providerOperatorId`).
- `tenantId` definition in İP-2 (G2): `{ type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true }`. Transition phase requires `required: false`; `required: true` enforcement is activated in İP-8.
- Special nullable tenant models: `RiskRule` allows `tenantId: null` for platform templates (§2.1); `AuditLog` and `AdminAction` allow `tenantId: null` for platform-wide operations (§4.3.7).
- Global unique indexes remain active in single mode (§6.3 G4). Never drop legacy global unique indexes in single mode.
- Never call `syncIndexes()`: drops indexes not explicitly declared in the Mongoose schema, breaking unmanaged and partial indexes (§6.3 notes).
- AutoIndex false-safe handling: schemas set `{ autoIndex: false }` or models register with `autoIndex: false` so that production and test booting does not trigger synchronous blocking index builds before backfill.
- Currency field (K14): every money-bearing record (`Bet`, `CasinoRound`, `CasinoSession`, `InhousePlaySession`, `BankDepositRequest`, `CryptoDeposit`, `ReferralCommission`) receives `currency: { type: String, default: 'TRY', uppercase: true, trim: true }` (or keeps existing `'EUR'`/`'TRY'` on `Transaction`, `SlikairPayment`, `SlikairPayout`).
- G3 backfill batching: 10,000 documents per batch, resumable via `Migration{name:'tenancy-002-backfill-tenant-id'}.progress[collName] = { lastId, processed, status }`. Validates zero unassigned documents at completion. Includes `transactions_dedupe_archive` if the collection exists.
- G4 compound indexes: built online before application traffic; `listIndexes` shows both legacy global unique and new compound unique indexes.
- Test databases: tests use dedicated database names (`vip90_test_ip2_*` on `mongodb://127.0.0.1:27017`), never reading `MONGODB_URI`. Allow override only via `TENANCY_TEST_MONGO`. Drop test databases in `after()`.
- New code comments in English. CHANGELOG entries in Turkish under `## [Yayınlanmadı]` (`docs/CHANGELOG_GUIDE.md`).
- Commits add files by explicit path. Never `git add -A` or `git add .`.

---

## Review Focus

- **Zero data loss on existing records:** Adding `tenantId: { required: false }` and `currency: { default: 'TRY' }` must not alter existing document contents or invalidate legacy documents.
- **Idempotent, crash-safe backfill (G3):** Simulating a process kill (SIGTERM) halfway through batch 2 must write progress to `Migration.progress`. Restarting resumes from `lastId` without duplicate work or errors.
- **Dual index coexistence (G4):** MongoDB must maintain both old global unique (e.g. `username_1`) and new compound unique (e.g. `tenantId_1_username_1`). No index drops; `listIndexes()` verifies dual presence.
- **Context stamping & immutability:** Documents saved or inserted inside `runWithTenant(t, ...)` automatically receive `tenantId: t`. Post-save attempts to modify `doc.tenantId` throw or are discarded.
- **Platform operations bypass:** Platform tasks running inside `runAsPlatform(reason, ...)` can query and save documents across all tenants or with `tenantId: null` without triggering `TenantScopeError`.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `server/src/models/User.js`, `LoginAttempt.js`, `KycDocument.js` | Players/Auth TEN models: `tenantId`, compound unique indexes, `defineTenantModel` | 1 |
| `server/test/models/playersAuthTenancy.test.js` | Unit tests for Players/Auth TEN models | 1 |
| `server/src/models/Transaction.js`, `Bet.js`, `CasinoRound.js`, `CasinoSession.js`, `InhousePlaySession.js`, `BankDepositRequest.js`, `CryptoDeposit.js`, `SlikairPayment.js`, `SlikairPayout.js`, `InhouseCallbackReceipt.js` | Money/Gaming TEN models: `tenantId`, `currency` (K14), compound indexes, `defineTenantModel` | 2 |
| `server/test/models/moneyTenancy.test.js` | Unit tests for Money/Gaming TEN models | 2 |
| `server/src/models/BonusWagering.js`, `CasinoPromoGrant.js`, `ReferralCommission.js`, `ReferralTree.js`, `Agent.js` | Bonus/Referral/Agent TEN models: `tenantId`, `currency`, compound unique indexes, `defineTenantModel` | 3 |
| `server/test/models/bonusReferralAgentTenancy.test.js` | Unit tests for Bonus/Referral/Agent TEN models | 3 |
| `server/src/models/ChatRoom.js`, `ChatMessage.js`, `ChatRain.js`, `ChatTip.js`, `Ticket.js`, `ActivityEvent.js` | Chat/Support/Activity TEN models: `tenantId`, compound unique indexes, `defineTenantModel` | 4 |
| `server/test/models/chatSupportActivityTenancy.test.js` | Unit tests for Chat/Support/Activity TEN models | 4 |
| `server/src/models/Brand.js`, `StaticPage.js`, `Promotion.js`, `VipLevel.js`, `PlayerSegment.js`, `SmsTemplate.js`, `SmsSender.js`, `SmsLog.js`, `SystemMailTemplate.js`, `SystemMailLog.js` | Brand/Content/Messaging TEN models: `tenantId`, `brandId`, compound unique indexes, `defineTenantModel` | 5 |
| `server/test/models/brandContentMarketingTenancy.test.js` | Unit tests for Brand/Content/Messaging TEN models | 5 |
| `server/src/models/RiskProfile.js`, `RiskSignal.js`, `RiskFinding.js`, `RiskEvaluation.js`, `RiskRule.js`, `AuditLog.js`, `AdminAction.js`, `Reconciliation.js` | Risk/Audit/Operations TEN models: nullable platform scopes, compound indexes, `defineTenantModel` | 6 |
| `server/test/models/riskAuditOperationsTenancy.test.js` | Unit tests for Risk/Audit/Operations TEN models | 6 |
| `server/src/models/Migration.js` | Add `progress: { type: Mixed, default: {} }` for resumable migrations | 7 |
| `server/src/tenancy/backfill.js` | G3 backfill logic: 10k batching, cursor pagination, resumable progress, zero-count check | 7 |
| `server/migrations/0005_tenancy_backfill_tenant_id.js` | G3 migration runner contract (`tenancy-002-backfill-tenant-id`, version 1.2.0) | 7 |
| `server/test/tenancyBackfill.test.js` | Unit & resume tests for G3 backfill | 7 |
| `server/src/tenancy/indexBuilder.js` | G4 compound index builder: online creation, dual-index preservation, syncIndexes avoided | 8 |
| `server/migrations/0006_tenancy_compound_indexes.js` | G4 migration runner contract (`tenancy-003-compound-indexes`, version 1.2.0) | 8 |
| `server/test/tenancyIndexBuilder.test.js` | Unit tests for G4 index builder | 8 |
| `server/test/tenancyUniqueIndexes.test.js` | §8.2 Unique index integration suite (cross-tenant allow, same-tenant collision, global uniques) | 9 |
| `server/test/tenancyMigrationG2G4.test.js` | §8.6 Migration upgrade integration suite (legacy DB fixture, G1-G4 run, idempotency, counts) | 9 |
| `CHANGELOG.md` | Turkish changelog entry under `## [Yayınlanmadı]` | 10 |
| `docs/product/02-yapilandirma.md` | Document G2-G4 migrations, backfill procedure, compound index specs, currency field | 10 |
| `AGENTS.md` | Update model definition guidelines and indexing rules for tenant models | 10 |

---

## Parallelism

Tasks in the same wave run in parallel in separate worktrees without touching the same files.

| Wave | Tasks (run in parallel, separate worktrees) | Depends on |
|---|---|---|
| A | 1 (Players/Auth models), 2 (Money models), 3 (Bonus/Referral/Agent models), 4 (Chat/Support/Activity models), 5 (Brand/Content/Messaging models), 6 (Risk/Audit/Reconciliation models) | none |
| B | 7 (G3 Backfill migration), 8 (G4 Index-build migration) | 1, 2, 3, 4, 5, 6 |
| C | 9 (Integration tests: §8.2 unique indexes + §8.6 migration upgrade) | 7, 8 |
| D | 10 (CHANGELOG, docs, AGENTS.md) | 9 |

**Conflict notes:**
- Tasks 1 through 6 edit mutually exclusive model files in `server/src/models/` and have dedicated test files.
- Task 7 touches `server/src/models/Migration.js` and creates `server/src/tenancy/backfill.js` + `server/migrations/0005_tenancy_backfill_tenant_id.js`.
- Task 8 creates `server/src/tenancy/indexBuilder.js` + `server/migrations/0006_tenancy_compound_indexes.js`.
- Task 9 creates integration test files consuming models and migrations.
- Task 10 edits documentation and `CHANGELOG.md`.

---

### Task 1: TEN models: Players & Auth domain (`User`, `LoginAttempt`, `KycDocument`)

**Files:**
- Modify: `server/src/models/User.js`
- Modify: `server/src/models/LoginAttempt.js`
- Modify: `server/src/models/KycDocument.js`
- Test: `server/test/models/playersAuthTenancy.test.js`

**Interfaces:**
- Consumes: `defineTenantModel` (`server/src/tenancy/models.js` or `server/src/tenancy/index.js`), `tenantContext`, `runWithTenant`, `runAsPlatform`.
- Produces:
  - `User`: schema with `tenantId: { type: ObjectId, ref: 'Tenant', required: false, index: true, immutable: true }`; compound unique indexes `{ tenantId: 1, username: 1 }`, `{ tenantId: 1, email: 1 }`, `{ tenantId: 1, phone: 1 }`, `{ tenantId: 1, walletAddress: 1 }`, `{ tenantId: 1, googleId: 1 }`, `{ tenantId: 1, telegramId: 1 }`, `{ tenantId: 1, palaceUserCode: 1 }` (all with `sparse: true` or partial filters matching legacy fields); retains existing global unique indexes; compiled via `defineTenantModel('User', schema)`.
  - `LoginAttempt`: schema with `tenantId`; compound index `{ tenantId: 1, username: 1, ip: 1 }`, `{ tenantId: 1, createdAt: -1 }`; compiled via `defineTenantModel('LoginAttempt', schema)`.
  - `KycDocument`: schema with `tenantId`; compound indexes `{ tenantId: 1, userId: 1, documentType: 1 }`, `{ tenantId: 1, userId: 1, status: 1 }`, `{ tenantId: 1, status: 1, createdAt: -1 }`; compiled via `defineTenantModel('KycDocument', schema)`.
  - All schemas specify `{ autoIndex: false }`.

- [ ] **Step 1: Write the failing tests** in `server/test/models/playersAuthTenancy.test.js`:
```js
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import LoginAttempt from '../../src/models/LoginAttempt.js';
import KycDocument from '../../src/models/KycDocument.js';
import { runWithTenant, runAsPlatform } from '../../src/tenancy/context.js';
import { isTenantCollection } from '../../src/tenancy/tenantScoped.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip2_players';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('Players & Auth models are registered as tenant collections', () => {
  assert.ok(isTenantCollection('users'));
  assert.ok(isTenantCollection('loginattempts'));
  assert.ok(isTenantCollection('kycdocuments'));
});

test('User schema has tenantId with immutable property and autoIndex false', () => {
  const path = User.schema.path('tenantId');
  assert.ok(path);
  assert.equal(path.options.immutable, true);
  assert.equal(path.options.required, false);
  assert.equal(User.schema.options.autoIndex, false);
});

test('stamps tenantId from ambient context on User creation', async () => {
  const user = await runWithTenant(T1, () =>
    User.create({ username: 'player_t1', email: 'p1@test.com' })
  );
  assert.equal(String(user.tenantId), String(T1));
  assert.throws(() => { user.tenantId = T2; }, /immutable/);
});

test('LoginAttempt and KycDocument stamp tenantId from ambient context', async () => {
  const login = await runWithTenant(T1, () =>
    LoginAttempt.create({ username: 'player_t1', success: true })
  );
  assert.equal(String(login.tenantId), String(T1));

  const kyc = await runWithTenant(T1, () =>
    KycDocument.create({
      userId: new mongoose.Types.ObjectId(),
      documentType: 'passport',
      fileName: 'pass.jpg',
      fileSize: 1024,
      mimeType: 'image/jpeg',
    })
  );
  assert.equal(String(kyc.tenantId), String(T1));
});
```

- [ ] **Step 2: Update model definitions in `User.js`, `LoginAttempt.js`, and `KycDocument.js`**:
  - Add `tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true }`.
  - Add compound indexes:
    - In `User.js`:
      ```js
      schema.set('autoIndex', false);
      schema.index({ tenantId: 1, username: 1 }, { unique: true });
      schema.index({ tenantId: 1, email: 1 }, { unique: true });
      schema.index({ tenantId: 1, walletAddress: 1 }, { unique: true, sparse: true });
      schema.index({ tenantId: 1, phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } });
      schema.index({ tenantId: 1, googleId: 1 }, { unique: true, sparse: true });
      schema.index({ tenantId: 1, telegramId: 1 }, { unique: true, sparse: true });
      schema.index({ tenantId: 1, palaceUserCode: 1 }, { unique: true, sparse: true });
      schema.index({ tenantId: 1, createdAt: -1 });
      schema.index({ tenantId: 1, lastLoginAt: -1 });
      schema.index({ tenantId: 1, isBot: 1, 'botProfile.currentState': 1 });
      schema.index({ tenantId: 1, cryptoDepositIndex: 1 }, { sparse: true });
      ```
    - In `LoginAttempt.js`:
      ```js
      schema.set('autoIndex', false);
      schema.index({ tenantId: 1, username: 1, ip: 1 });
      schema.index({ tenantId: 1, createdAt: -1 });
      schema.index({ tenantId: 1, userId: 1, createdAt: -1 });
      ```
    - In `KycDocument.js`:
      ```js
      schema.set('autoIndex', false);
      schema.index({ tenantId: 1, userId: 1, documentType: 1 });
      schema.index({ tenantId: 1, userId: 1, status: 1 });
      schema.index({ tenantId: 1, status: 1, createdAt: -1 });
      ```
  - Export using `defineTenantModel`:
    `export default defineTenantModel('User', schema);`
    `export default defineTenantModel('LoginAttempt', schema);`
    `export default defineTenantModel('KycDocument', schema);`

- [ ] **Step 3: Run the test:**
```bash
node --test server/test/models/playersAuthTenancy.test.js
```
Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 4: Commit:**
```bash
git add server/src/models/User.js server/src/models/LoginAttempt.js server/src/models/KycDocument.js server/test/models/playersAuthTenancy.test.js
git commit -m "feat(tenancy): add tenantId and compound indexes to Players and Auth models"
```

---

### Task 2: TEN models: Money & Gaming Transactions domain

**Files:**
- Modify: `server/src/models/Transaction.js`
- Modify: `server/src/models/Bet.js`
- Modify: `server/src/models/CasinoRound.js`
- Modify: `server/src/models/CasinoSession.js`
- Modify: `server/src/models/InhousePlaySession.js`
- Modify: `server/src/models/BankDepositRequest.js`
- Modify: `server/src/models/CryptoDeposit.js`
- Modify: `server/src/models/SlikairPayment.js`
- Modify: `server/src/models/SlikairPayout.js`
- Modify: `server/src/models/InhouseCallbackReceipt.js`
- Test: `server/test/models/moneyTenancy.test.js`

**Interfaces:**
- Consumes: `defineTenantModel`, `tenantContext`, `runWithTenant`.
- Produces:
  - All 10 models updated with `tenantId: { type: ObjectId, ref: 'Tenant', required: false, index: true, immutable: true }` and `{ autoIndex: false }`.
  - Added `currency: { type: String, default: 'TRY', uppercase: true, trim: true }` to `Bet`, `CasinoRound`, `CasinoSession`, `InhousePlaySession`, `BankDepositRequest`, `CryptoDeposit` (preserving existing currency on `Transaction`, `SlikairPayment`, `SlikairPayout`) per K14.
  - Global uniques preserved: `Transaction.idempotencyKey`, `CryptoDeposit.txHash`, `SlikairPayment.requestId`, `InhouseCallbackReceipt.txnId`.
  - Compound query indexes prefixed with `tenantId`.
  - Registered via `defineTenantModel`.

- [ ] **Step 1: Write the failing tests** in `server/test/models/moneyTenancy.test.js`:
```js
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Transaction from '../../src/models/Transaction.js';
import Bet from '../../src/models/Bet.js';
import CasinoRound from '../../src/models/CasinoRound.js';
import CasinoSession from '../../src/models/CasinoSession.js';
import InhousePlaySession from '../../src/models/InhousePlaySession.js';
import BankDepositRequest from '../../src/models/BankDepositRequest.js';
import CryptoDeposit from '../../src/models/CryptoDeposit.js';
import SlikairPayment from '../../src/models/SlikairPayment.js';
import SlikairPayout from '../../src/models/SlikairPayout.js';
import InhouseCallbackReceipt from '../../src/models/InhouseCallbackReceipt.js';
import { runWithTenant } from '../../src/tenancy/context.js';
import { isTenantCollection } from '../../src/tenancy/tenantScoped.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip2_money';
const T1 = new mongoose.Types.ObjectId();

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('Money models are registered as tenant collections', () => {
  const colls = ['transactions', 'bets', 'casinorounds', 'casinosessions', 'inhouseplaysessions',
                 'bankdepositrequests', 'cryptodeposits', 'slikairpayments', 'slikairpayouts', 'inhousecallbackreceipts'];
  for (const c of colls) assert.ok(isTenantCollection(c), `expected ${c} to be tenant collection`);
});

test('Bet, CasinoRound, and CryptoDeposit have currency field defaulting to TRY (K14)', async () => {
  const bet = await runWithTenant(T1, () =>
    Bet.create({
      userId: new mongoose.Types.ObjectId(),
      selections: [{ eventId: new mongoose.Types.ObjectId(), oddValue: 1.85 }],
      type: 'single',
      stake: 50,
      totalOdds: 1.85,
      potentialWin: 92.5,
    })
  );
  assert.equal(bet.currency, 'TRY');
  assert.equal(String(bet.tenantId), String(T1));

  const round = await runWithTenant(T1, () =>
    CasinoRound.create({
      userId: new mongoose.Types.ObjectId(),
      gameId: 'crash',
      bet: 10,
      payout: 20,
      net: 10,
      balanceBefore: 100,
      balanceAfter: 110,
    })
  );
  assert.equal(round.currency, 'TRY');
  assert.equal(String(round.tenantId), String(T1));

  const crypto = await runWithTenant(T1, () =>
    CryptoDeposit.create({
      userId: new mongoose.Types.ObjectId(),
      txHash: '0xabc123',
      toAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      usdtAmount: 100,
      creditedTRY: 3400,
    })
  );
  assert.equal(crypto.currency, 'TRY');
  assert.equal(String(crypto.tenantId), String(T1));
});
```

- [ ] **Step 2: Update model definitions in all 10 files**:
  - Add `tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true }` and `schema.set('autoIndex', false);`.
  - Add `currency: { type: String, default: 'TRY', uppercase: true, trim: true }` where missing (`Bet.js`, `CasinoRound.js`, `CasinoSession.js`, `InhousePlaySession.js`, `BankDepositRequest.js`, `CryptoDeposit.js`).
  - Add compound indexes:
    - `Transaction`: `{ tenantId: 1, userId: 1, createdAt: -1 }`, `{ tenantId: 1, userId: 1, type: 1, createdAt: -1 }`, `{ tenantId: 1, type: 1, status: 1, createdAt: -1 }`, `{ tenantId: 1, createdAt: -1 }`, `{ tenantId: 1, currency: 1, createdAt: -1 }`. Retain global `idempotencyKey` unique index.
    - `Bet`: `{ tenantId: 1, userId: 1, createdAt: -1 }`, `{ tenantId: 1, userId: 1, status: 1, createdAt: -1 }`, `{ tenantId: 1, status: 1 }`, `{ tenantId: 1, createdAt: -1 }`, `{ tenantId: 1, 'selections.eventId': 1 }`.
    - `CasinoRound`: `{ tenantId: 1, userId: 1, createdAt: -1 }`, `{ tenantId: 1, gameId: 1, createdAt: -1 }`, `{ tenantId: 1, createdAt: -1 }`, `{ tenantId: 1, palaceUserCode: 1 }` (sparse: true).
    - `CasinoSession`: `{ tenantId: 1, userId: 1, status: 1 }`, `{ tenantId: 1, palaceUserCode: 1 }`, `{ tenantId: 1, status: 1, transferredAt: 1 }`.
    - `InhousePlaySession`: `{ tenantId: 1, userId: 1, status: 1, startedAt: -1 }`, `{ tenantId: 1, createdAt: -1 }`.
    - `BankDepositRequest`: `{ tenantId: 1, userId: 1, createdAt: -1 }`, `{ tenantId: 1, status: 1, createdAt: -1 }`.
    - `CryptoDeposit`: `{ tenantId: 1, userId: 1, createdAt: -1 }`, `{ tenantId: 1, toAddress: 1, status: 1 }`, `{ tenantId: 1, status: 1 }`. Retain global `txHash` unique index.
    - `SlikairPayment`: `{ tenantId: 1, userId: 1, createdAt: -1 }`, `{ tenantId: 1, payinId: 1 }`, `{ tenantId: 1, status: 1 }`. Retain global `requestId` unique index.
    - `SlikairPayout`: `{ tenantId: 1, userId: 1, createdAt: -1 }`, `{ tenantId: 1, payoutId: 1 }`, `{ tenantId: 1, status: 1 }`, `{ tenantId: 1, merchantReference: 1 }`.
    - `InhouseCallbackReceipt`: `{ tenantId: 1, operatorGameId: 1, createdAt: -1 }`. Retain global `txnId` unique index.
  - Export using `defineTenantModel('<ModelName>', schema)`.

- [ ] **Step 3: Run the test:**
```bash
node --test server/test/models/moneyTenancy.test.js
```
Expected: `# pass 2`, `# fail 0`.

- [ ] **Step 4: Commit:**
```bash
git add server/src/models/Transaction.js server/src/models/Bet.js server/src/models/CasinoRound.js server/src/models/CasinoSession.js server/src/models/InhousePlaySession.js server/src/models/BankDepositRequest.js server/src/models/CryptoDeposit.js server/src/models/SlikairPayment.js server/src/models/SlikairPayout.js server/src/models/InhouseCallbackReceipt.js server/test/models/moneyTenancy.test.js
git commit -m "feat(tenancy): add tenantId, currency and compound indexes to Money models"
```

---

### Task 3: TEN models: Bonus, Referral & Agent domain

**Files:**
- Modify: `server/src/models/BonusWagering.js`
- Modify: `server/src/models/CasinoPromoGrant.js`
- Modify: `server/src/models/ReferralCommission.js`
- Modify: `server/src/models/ReferralTree.js`
- Modify: `server/src/models/Agent.js`
- Test: `server/test/models/bonusReferralAgentTenancy.test.js`

**Interfaces:**
- Consumes: `defineTenantModel`, `tenantContext`, `runWithTenant`.
- Produces:
  - Models updated with `tenantId: { type: ObjectId, ref: 'Tenant', required: false, index: true, immutable: true }` and `{ autoIndex: false }`.
  - Added `currency: { type: String, default: 'TRY', uppercase: true, trim: true }` to `ReferralCommission` (K14).
  - Compound unique indexes:
    - `CasinoPromoGrant`: `{ tenantId: 1, callId: 1 }` (unique, sparse), `{ tenantId: 1, gplayId: 1 }` (unique, partialFilterExpression: `{ kind: 'bonusCall', status: 'pending' }`). Retains legacy unique indexes in single mode.
    - `ReferralTree`: `{ tenantId: 1, userId: 1 }` (unique). Retains legacy unique index in single mode.
    - `Agent`: `{ tenantId: 1, userId: 1 }`. Retains legacy unique `userId` index in single mode.
  - Registered via `defineTenantModel`.

- [ ] **Step 1: Write the failing tests** in `server/test/models/bonusReferralAgentTenancy.test.js`:
```js
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import BonusWagering from '../../src/models/BonusWagering.js';
import CasinoPromoGrant from '../../src/models/CasinoPromoGrant.js';
import ReferralCommission from '../../src/models/ReferralCommission.js';
import ReferralTree from '../../src/models/ReferralTree.js';
import Agent from '../../src/models/Agent.js';
import { runWithTenant } from '../../src/tenancy/context.js';
import { isTenantCollection } from '../../src/tenancy/tenantScoped.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip2_bonus';
const T1 = new mongoose.Types.ObjectId();

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('Bonus, Referral and Agent collections are registered as tenant collections', () => {
  for (const c of ['bonuswagerings', 'casinopromogrants', 'referralcommissions', 'referraltrees', 'agents']) {
    assert.ok(isTenantCollection(c), `expected ${c} to be tenant collection`);
  }
});

test('ReferralCommission has currency field defaulting to TRY (K14)', async () => {
  const comm = await runWithTenant(T1, () =>
    ReferralCommission.create({
      referrerId: new mongoose.Types.ObjectId(),
      bettorId: new mongoose.Types.ObjectId(),
      level: 1,
      houseProfit: 100,
      commissionAmount: 10,
      commissionRate: 10,
      source: 'sports',
    })
  );
  assert.equal(comm.currency, 'TRY');
  assert.equal(String(comm.tenantId), String(T1));
});

test('Agent and ReferralTree stamp tenantId from ambient context', async () => {
  const uid1 = new mongoose.Types.ObjectId();
  const tree = await runWithTenant(T1, () => ReferralTree.create({ userId: uid1 }));
  assert.equal(String(tree.tenantId), String(T1));

  const uid2 = new mongoose.Types.ObjectId();
  const agent = await runWithTenant(T1, () => Agent.create({ userId: uid2 }));
  assert.equal(String(agent.tenantId), String(T1));
});
```

- [ ] **Step 2: Update model definitions in all 5 files**:
  - Add `tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true }` and `schema.set('autoIndex', false);`.
  - Add `currency: { type: String, default: 'TRY', uppercase: true, trim: true }` to `ReferralCommission.js`.
  - Add compound indexes:
    - `BonusWagering`: `{ tenantId: 1, userId: 1, status: 1 }`, `{ tenantId: 1, status: 1, deadline: 1 }`.
    - `CasinoPromoGrant`: `{ tenantId: 1, callId: 1 }` (unique: true, sparse: true), `{ tenantId: 1, gplayId: 1 }` (unique: true, partialFilterExpression: { kind: 'bonusCall', status: 'pending' }), `{ tenantId: 1, kind: 1, createdAt: -1 }`, `{ tenantId: 1, user: 1, createdAt: -1 }`.
    - `ReferralCommission`: `{ tenantId: 1, referrerId: 1, status: 1, createdAt: -1 }`, `{ tenantId: 1, bettorId: 1, createdAt: -1 }`, `{ tenantId: 1, status: 1, createdAt: -1 }`.
    - `ReferralTree`: `{ tenantId: 1, userId: 1 }` (unique: true).
    - `Agent`: `{ tenantId: 1, userId: 1 }`, `{ tenantId: 1, isActive: 1 }`.
  - Export using `defineTenantModel('<ModelName>', schema)`.

- [ ] **Step 3: Run the test:**
```bash
node --test server/test/models/bonusReferralAgentTenancy.test.js
```
Expected: `# pass 3`, `# fail 0`.

- [ ] **Step 4: Commit:**
```bash
git add server/src/models/BonusWagering.js server/src/models/CasinoPromoGrant.js server/src/models/ReferralCommission.js server/src/models/ReferralTree.js server/src/models/Agent.js server/test/models/bonusReferralAgentTenancy.test.js
git commit -m "feat(tenancy): add tenantId, currency and compound indexes to Bonus, Referral and Agent models"
```

---

### Task 4: TEN models: Chat, Support & Activity domain

**Files:**
- Modify: `server/src/models/ChatRoom.js`
- Modify: `server/src/models/ChatMessage.js`
- Modify: `server/src/models/ChatRain.js`
- Modify: `server/src/models/ChatTip.js`
- Modify: `server/src/models/Ticket.js`
- Modify: `server/src/models/ActivityEvent.js`
- Test: `server/test/models/chatSupportActivityTenancy.test.js`

**Interfaces:**
- Consumes: `defineTenantModel`, `tenantContext`, `runWithTenant`.
- Produces:
  - Models updated with `tenantId: { type: ObjectId, ref: 'Tenant', required: false, index: true, immutable: true }` and `{ autoIndex: false }`.
  - Compound unique indexes:
    - `ChatRoom`: `{ tenantId: 1, name: 1 }` (unique), `{ tenantId: 1, slug: 1 }` (unique). Retains legacy global unique indexes in single mode.
  - Compound query indexes:
    - `ChatMessage`: `{ tenantId: 1, roomId: 1, createdAt: -1 }`, `{ tenantId: 1, userId: 1, createdAt: -1 }`.
    - `ChatRain`: `{ tenantId: 1, roomId: 1, status: 1 }`, `{ tenantId: 1, createdBy: 1, createdAt: -1 }`.
    - `ChatTip`: `{ tenantId: 1, fromUserId: 1, createdAt: -1 }`, `{ tenantId: 1, toUserId: 1, createdAt: -1 }`, `{ tenantId: 1, roomId: 1, createdAt: -1 }`.
    - `Ticket`: `{ tenantId: 1, userId: 1, createdAt: -1 }`, `{ tenantId: 1, status: 1, createdAt: -1 }`.
    - `ActivityEvent`: `{ tenantId: 1, type: 1, createdAt: -1 }`, `{ tenantId: 1, userId: 1, status: 1, type: 1, updatedAt: -1 }`, `{ tenantId: 1, createdAt: -1 }`.
  - Registered via `defineTenantModel`.

- [ ] **Step 1: Write the failing tests** in `server/test/models/chatSupportActivityTenancy.test.js`:
```js
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import ChatRoom from '../../src/models/ChatRoom.js';
import ChatMessage from '../../src/models/ChatMessage.js';
import Ticket from '../../src/models/Ticket.js';
import ActivityEvent from '../../src/models/ActivityEvent.js';
import { runWithTenant } from '../../src/tenancy/context.js';
import { isTenantCollection } from '../../src/tenancy/tenantScoped.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip2_chat';
const T1 = new mongoose.Types.ObjectId();

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('Chat, Support and Activity collections are registered as tenant collections', () => {
  for (const c of ['chatrooms', 'chatmessages', 'chatrains', 'chattips', 'tickets', 'activityevents']) {
    assert.ok(isTenantCollection(c), `expected ${c} to be tenant collection`);
  }
});

test('ChatRoom, Ticket and ActivityEvent stamp tenantId from ambient context', async () => {
  const room = await runWithTenant(T1, () =>
    ChatRoom.create({ name: 'General', slug: 'general' })
  );
  assert.equal(String(room.tenantId), String(T1));

  const ticket = await runWithTenant(T1, () =>
    Ticket.create({ userId: new mongoose.Types.ObjectId(), subject: 'Help' })
  );
  assert.equal(String(ticket.tenantId), String(T1));

  const activity = await runWithTenant(T1, () =>
    ActivityEvent.create({
      type: 'deposit',
      userId: new mongoose.Types.ObjectId(),
      status: 'completed',
      summary: 'Deposit 100 TRY',
    })
  );
  assert.equal(String(activity.tenantId), String(T1));
});
```

- [ ] **Step 2: Update model definitions in all 6 files**:
  - Add `tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true }` and `schema.set('autoIndex', false);`.
  - Add compound indexes:
    - `ChatRoom`: `{ tenantId: 1, name: 1 }` (unique: true), `{ tenantId: 1, slug: 1 }` (unique: true), `{ tenantId: 1, isActive: 1, isPublic: 1 }`.
    - `ChatMessage`: `{ tenantId: 1, roomId: 1, createdAt: -1 }`, `{ tenantId: 1, userId: 1, createdAt: -1 }`.
    - `ChatRain`: `{ tenantId: 1, roomId: 1, status: 1 }`, `{ tenantId: 1, createdBy: 1, createdAt: -1 }`.
    - `ChatTip`: `{ tenantId: 1, fromUserId: 1, createdAt: -1 }`, `{ tenantId: 1, toUserId: 1, createdAt: -1 }`, `{ tenantId: 1, roomId: 1, createdAt: -1 }`.
    - `Ticket`: `{ tenantId: 1, userId: 1, createdAt: -1 }`, `{ tenantId: 1, status: 1, createdAt: -1 }`.
    - `ActivityEvent`: `{ tenantId: 1, type: 1, createdAt: -1 }`, `{ tenantId: 1, userId: 1, status: 1, type: 1, updatedAt: -1 }`, `{ tenantId: 1, createdAt: -1 }`.
  - Export using `defineTenantModel('<ModelName>', schema)`.

- [ ] **Step 3: Run the test:**
```bash
node --test server/test/models/chatSupportActivityTenancy.test.js
```
Expected: `# pass 2`, `# fail 0`.

- [ ] **Step 4: Commit:**
```bash
git add server/src/models/ChatRoom.js server/src/models/ChatMessage.js server/src/models/ChatRain.js server/src/models/ChatTip.js server/src/models/Ticket.js server/src/models/ActivityEvent.js server/test/models/chatSupportActivityTenancy.test.js
git commit -m "feat(tenancy): add tenantId and compound indexes to Chat, Support and Activity models"
```

---

### Task 5: TEN models: Content, Brand & Marketing domain

**Files:**
- Modify: `server/src/models/Brand.js`
- Modify: `server/src/models/StaticPage.js`
- Modify: `server/src/models/Promotion.js`
- Modify: `server/src/models/VipLevel.js`
- Modify: `server/src/models/PlayerSegment.js`
- Modify: `server/src/models/SmsTemplate.js`
- Modify: `server/src/models/SmsSender.js`
- Modify: `server/src/models/SmsLog.js`
- Modify: `server/src/models/SystemMailTemplate.js`
- Modify: `server/src/models/SystemMailLog.js`
- Test: `server/test/models/brandContentMarketingTenancy.test.js`

**Interfaces:**
- Consumes: `defineTenantModel`, `tenantContext`, `runWithTenant`.
- Produces:
  - Models updated with `tenantId: { type: ObjectId, ref: 'Tenant', required: false, index: true, immutable: true }` and `{ autoIndex: false }`.
  - `StaticPage`: adds `brandId: { type: ObjectId, ref: 'Brand', default: null, index: true }` per §2.1 TEN-BRAND definition.
  - Compound unique indexes:
    - `Brand`: `{ tenantId: 1, slug: 1 }` (unique).
    - `StaticPage`: `{ tenantId: 1, brandId: 1, slug: 1 }` (unique).
    - `Promotion`: `{ tenantId: 1, title: 1 }` (or slug if defined).
    - `VipLevel`: `{ tenantId: 1, level: 1 }` (unique).
    - `PlayerSegment`: `{ tenantId: 1, slug: 1 }` (unique).
    - `SmsTemplate`: `{ tenantId: 1, key: 1 }` (unique).
    - `SystemMailTemplate`: `{ tenantId: 1, event: 1 }` (unique).
  - Registered via `defineTenantModel`.

- [ ] **Step 1: Write the failing tests** in `server/test/models/brandContentMarketingTenancy.test.js`:
```js
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Brand from '../../src/models/Brand.js';
import StaticPage from '../../src/models/StaticPage.js';
import VipLevel from '../../src/models/VipLevel.js';
import PlayerSegment from '../../src/models/PlayerSegment.js';
import SmsTemplate from '../../src/models/SmsTemplate.js';
import SystemMailTemplate from '../../src/models/SystemMailTemplate.js';
import { runWithTenant } from '../../src/tenancy/context.js';
import { isTenantCollection } from '../../src/tenancy/tenantScoped.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip2_content';
const T1 = new mongoose.Types.ObjectId();
const B1 = new mongoose.Types.ObjectId();

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('Brand and Marketing collections are registered as tenant collections', () => {
  for (const c of ['brands', 'staticpages', 'promotions', 'viplevels', 'playersegments',
                   'smstemplates', 'smssenders', 'smslogs', 'systemmailtemplates', 'systemmaillogs']) {
    assert.ok(isTenantCollection(c), `expected ${c} to be tenant collection`);
  }
});

test('StaticPage has tenantId and brandId for TEN-BRAND scope', async () => {
  const page = await runWithTenant(T1, () =>
    StaticPage.create({
      brandId: B1,
      slug: 'terms',
      category: 'legal',
      route: '/legal/terms',
      title: 'Terms of Service',
      footerColumn: 'legal',
    })
  );
  assert.equal(String(page.tenantId), String(T1));
  assert.equal(String(page.brandId), String(B1));
});

test('VipLevel, PlayerSegment, SmsTemplate and SystemMailTemplate stamp tenantId', async () => {
  const vip = await runWithTenant(T1, () => VipLevel.create({ level: 1, name: 'Bronze', xpRequired: 0 }));
  assert.equal(String(vip.tenantId), String(T1));

  const seg = await runWithTenant(T1, () => PlayerSegment.create({ name: 'High Rollers', slug: 'high-rollers' }));
  assert.equal(String(seg.tenantId), String(T1));

  const sms = await runWithTenant(T1, () => SmsTemplate.create({ key: 'welcome_sms', title: 'Welcome', body: 'Hi' }));
  assert.equal(String(sms.tenantId), String(T1));

  const mail = await runWithTenant(T1, () =>
    SystemMailTemplate.create({ event: 'welcome_mail', category: 'action', title: 'Welcome', body: 'Hi' })
  );
  assert.equal(String(mail.tenantId), String(T1));
});
```

- [ ] **Step 2: Update model definitions in all 10 files**:
  - Add `tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true }` and `schema.set('autoIndex', false);`.
  - In `StaticPage.js`: add `brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null, index: true }`.
  - Add compound indexes:
    - `Brand`: `{ tenantId: 1, slug: 1 }` (unique: true), `{ tenantId: 1, isActive: 1 }`.
    - `StaticPage`: `{ tenantId: 1, brandId: 1, slug: 1 }` (unique: true).
    - `Promotion`: `{ tenantId: 1, isActive: 1, claimedBy: 1 }`, `{ tenantId: 1, expiresAt: 1 }`.
    - `VipLevel`: `{ tenantId: 1, level: 1 }` (unique: true), `{ tenantId: 1, xpRequired: 1 }`.
    - `PlayerSegment`: `{ tenantId: 1, slug: 1 }` (unique: true).
    - `SmsTemplate`: `{ tenantId: 1, key: 1 }` (unique: true), `{ tenantId: 1, type: 1, isActive: 1 }`.
    - `SmsSender`: `{ tenantId: 1, provider: 1, senderNumber: 1 }`, `{ tenantId: 1, isActive: 1 }`.
    - `SmsLog`: `{ tenantId: 1, createdAt: -1 }`, `{ tenantId: 1, status: 1, createdAt: -1 }`.
    - `SystemMailTemplate`: `{ tenantId: 1, event: 1 }` (unique: true), `{ tenantId: 1, category: 1, enabled: 1 }`.
    - `SystemMailLog`: `{ tenantId: 1, sentAt: -1 }`, `{ tenantId: 1, trigger: 1, sentAt: -1 }`.
  - Export using `defineTenantModel('<ModelName>', schema)`.

- [ ] **Step 3: Run the test:**
```bash
node --test server/test/models/brandContentMarketingTenancy.test.js
```
Expected: `# pass 3`, `# fail 0`.

- [ ] **Step 4: Commit:**
```bash
git add server/src/models/Brand.js server/src/models/StaticPage.js server/src/models/Promotion.js server/src/models/VipLevel.js server/src/models/PlayerSegment.js server/src/models/SmsTemplate.js server/src/models/SmsSender.js server/src/models/SmsLog.js server/src/models/SystemMailTemplate.js server/src/models/SystemMailLog.js server/test/models/brandContentMarketingTenancy.test.js
git commit -m "feat(tenancy): add tenantId, brandId and compound indexes to Brand, Content and Marketing models"
```

---

### Task 6: TEN models: Risk, Audit & Operations domain

**Files:**
- Modify: `server/src/models/RiskProfile.js`
- Modify: `server/src/models/RiskSignal.js`
- Modify: `server/src/models/RiskFinding.js`
- Modify: `server/src/models/RiskEvaluation.js`
- Modify: `server/src/models/RiskRule.js`
- Modify: `server/src/models/AuditLog.js`
- Modify: `server/src/models/AdminAction.js`
- Modify: `server/src/models/Reconciliation.js`
- Test: `server/test/models/riskAuditOperationsTenancy.test.js`

**Interfaces:**
- Consumes: `defineTenantModel`, `tenantContext`, `runWithTenant`, `runAsPlatform`.
- Produces:
  - Models updated with `tenantId` (nullable where platform operations occur) and `{ autoIndex: false }`.
  - `RiskRule`: `tenantId: { type: ObjectId, ref: 'Tenant', default: null }`; partial unique indexes `{ tenantId: 1, name: 1 }` (when `tenantId != null`) and `{ name: 1 }` (when `tenantId == null` for platform templates) per §2.1.
  - `AuditLog` & `AdminAction`: add `tenantId` (null = platform), `actorScope: 'platform'|'partner'|'tenant'`, `onBehalfOfTenantId` per §4.3.7.
  - `Reconciliation`: exports `ReconciliationJob` and `ReconciliationItem` compiled via `defineTenantModel`.
  - Compound indexes matching §2.1 and §4.4.

- [ ] **Step 1: Write the failing tests** in `server/test/models/riskAuditOperationsTenancy.test.js`:
```js
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import RiskProfile from '../../src/models/RiskProfile.js';
import RiskRule from '../../src/models/RiskRule.js';
import AuditLog from '../../src/models/AuditLog.js';
import AdminAction from '../../src/models/AdminAction.js';
import { ReconciliationJob, ReconciliationItem } from '../../src/models/Reconciliation.js';
import { runWithTenant, runAsPlatform } from '../../src/tenancy/context.js';
import { isTenantCollection } from '../../src/tenancy/tenantScoped.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip2_risk';
const T1 = new mongoose.Types.ObjectId();

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('Risk, Audit and Reconciliation collections are registered as tenant collections', () => {
  for (const c of ['riskprofiles', 'risksignals', 'riskfindings', 'riskevaluations', 'riskrules',
                   'auditlogs', 'adminactions', 'reconciliationjobs', 'reconciliationitems']) {
    assert.ok(isTenantCollection(c), `expected ${c} to be tenant collection`);
  }
});

test('RiskRule supports platform templates (tenantId null) and tenant copies (tenantId set)', async () => {
  const template = await runAsPlatform('seed-rules', () =>
    RiskRule.create({ name: 'Max Daily Loss', category: 'financial', action: 'REVIEW', tenantId: null })
  );
  assert.equal(template.tenantId, null);

  const tenantRule = await runWithTenant(T1, () =>
    RiskRule.create({ name: 'Max Daily Loss', category: 'financial', action: 'REVIEW' })
  );
  assert.equal(String(tenantRule.tenantId), String(T1));
});

test('AuditLog supports platform logs and tenant logs', async () => {
  const platLog = await runAsPlatform('platform-admin', () =>
    AuditLog.create({
      actorType: 'system',
      actorUsername: 'platform_system',
      actorScope: 'platform',
      action: 'BOOT_CHECK',
      category: 'system',
      tenantId: null,
    })
  );
  assert.equal(platLog.tenantId, null);
  assert.equal(platLog.actorScope, 'platform');

  const tenantLog = await runWithTenant(T1, () =>
    AuditLog.create({
      actorType: 'admin',
      actorUsername: 'tenant_admin',
      actorScope: 'tenant',
      action: 'UPDATE_SETTINGS',
      category: 'system',
    })
  );
  assert.equal(String(tenantLog.tenantId), String(T1));
});
```

- [ ] **Step 2: Update model definitions in all 8 files**:
  - `RiskProfile.js`: `tenantId: { type: ObjectId, ref: 'Tenant', required: false, index: true, immutable: true }`. Index `{ tenantId: 1, playerId: 1 }` (unique: true), `{ tenantId: 1, brandId: 1 }`.
  - `RiskSignal.js`: `tenantId: { type: ObjectId, ref: 'Tenant', required: false, index: true }`. Index `{ tenantId: 1, playerId: 1, createdAt: -1 }`.
  - `RiskFinding.js`: `tenantId: { type: ObjectId, ref: 'Tenant', required: false, index: true }`. Index `{ tenantId: 1, playerId: 1, status: 1 }`.
  - `RiskEvaluation.js`: `tenantId: { type: ObjectId, ref: 'Tenant', required: false, index: true }`. Index `{ tenantId: 1, playerId: 1, createdAt: -1 }`.
  - `RiskRule.js`: `tenantId: { type: ObjectId, ref: 'Tenant', required: false, default: null, index: true }`. Index `{ tenantId: 1, name: 1 }` (unique: true, partialFilterExpression: { tenantId: { $type: 'objectId' } }), `{ name: 1 }` (unique: true, partialFilterExpression: { tenantId: null }).
  - `AuditLog.js`: `tenantId: { type: ObjectId, ref: 'Tenant', required: false, default: null, index: true }`, `actorScope: { type: String, enum: ['platform', 'partner', 'tenant'], default: 'tenant' }`, `actorStaffId: { type: ObjectId, ref: 'StaffAccount', default: null }`, `partnerId: { type: ObjectId, ref: 'Partner', default: null }`, `onBehalfOfTenantId: { type: ObjectId, ref: 'Tenant', default: null }`, `capability: { type: String, default: null }`, `grantId: { type: ObjectId, ref: 'PartnerGrant', default: null }`. Index `{ tenantId: 1, createdAt: -1 }`.
  - `AdminAction.js`: `tenantId: { type: ObjectId, ref: 'Tenant', required: false, default: null, index: true }`, `actorScope: { type: String, enum: ['platform', 'partner', 'tenant'], default: 'tenant' }`, `onBehalfOfTenantId: { type: ObjectId, ref: 'Tenant', default: null }`. Index `{ tenantId: 1, createdAt: -1 }`.
  - `Reconciliation.js`: export `ReconciliationJob = defineTenantModel('ReconciliationJob', reconciliationJobSchema)` and `ReconciliationItem = defineTenantModel('ReconciliationItem', reconciliationItemSchema)`. Add `tenantId` to both schemas. Index `{ tenantId: 1, status: 1, createdAt: -1 }` on Job; `{ tenantId: 1, jobId: 1, status: 1 }` on Item.
  - Set `schema.set('autoIndex', false);` on all schemas.

- [ ] **Step 3: Run the test:**
```bash
node --test server/test/models/riskAuditOperationsTenancy.test.js
```
Expected: `# pass 3`, `# fail 0`.

- [ ] **Step 4: Commit:**
```bash
git add server/src/models/RiskProfile.js server/src/models/RiskSignal.js server/src/models/RiskFinding.js server/src/models/RiskEvaluation.js server/src/models/RiskRule.js server/src/models/AuditLog.js server/src/models/AdminAction.js server/src/models/Reconciliation.js server/test/models/riskAuditOperationsTenancy.test.js
git commit -m "feat(tenancy): add tenantId and compound indexes to Risk, Audit and Operations models"
```

---

### Task 7: G3 Backfill Migration (`0005_tenancy_backfill_tenant_id.js` & `backfill.js`)

**Files:**
- Modify: `server/src/models/Migration.js` (add `progress: { type: mongoose.Schema.Types.Mixed, default: {} }`)
- Create: `server/src/tenancy/backfill.js`
- Create: `server/migrations/0005_tenancy_backfill_tenant_id.js`
- Test: `server/test/tenancyBackfill.test.js`

**Interfaces:**
- Consumes: `Tenant.findOne({ isDefault: true })`, `Migration`, `runAsPlatform`, `listTenantModelNames`, `mongoose.connection.db`.
- Produces:
  - `backfillTenantId({ batchSize = 10000, targetTenantId, onProgress } = {}) -> Promise<{ collections: Record<string, { total: number, updated: number }>, durationMs: number }>`
  - Migration record `Migration{name:'tenancy-002-backfill-tenant-id', version:'1.2.0'}`.
  - Backfills all TEN collections plus `transactions_dedupe_archive` in batches of 10,000 using cursor / `_id > lastId` pagination.
  - Stores progress per collection in the `Migration` document: `progress.<collection> = { lastId, processed, status: 'in_progress'|'completed' }`.
  - Asserts `countDocuments({ $or: [{ tenantId: null }, { tenantId: { $exists: false } }] }) === 0` for every collection at finish.

- [ ] **Step 1: Write the failing tests** in `server/test/tenancyBackfill.test.js`:
```js
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Tenant from '../../src/models/Tenant.js';
import Migration from '../../src/models/Migration.js';
import User from '../../src/models/User.js';
import Transaction from '../../src/models/Transaction.js';
import { backfillTenantId } from '../../src/tenancy/backfill.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip2_backfill';

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('backfill assigns default tenant to unassigned documents in batches and tracks progress', async () => {
  const defaultTenant = await Tenant.create({ key: 'default', name: 'Default', isDefault: true });

  // Seed raw documents without tenantId
  const rawUsers = Array.from({ length: 25 }, (_, i) => ({
    username: `legacy_user_${i}`,
    email: `legacy_${i}@test.com`,
  }));
  await User.collection.insertMany(rawUsers);

  // Run backfill with small batch size 10 to test multi-batch iteration
  const res = await backfillTenantId({
    batchSize: 10,
    targetTenantId: defaultTenant._id,
  });

  assert.equal(await User.countDocuments({ tenantId: defaultTenant._id }), 25);
  assert.equal(await User.countDocuments({ tenantId: null }), 0);

  const mig = await Migration.findOne({ name: 'tenancy-002-backfill-tenant-id' });
  assert.ok(mig);
  assert.equal(mig.progress.users.status, 'completed');
  assert.equal(mig.progress.users.processed, 25);
});
```

- [ ] **Step 2: Update `Migration.js` schema**:
  Add `progress: { type: mongoose.Schema.Types.Mixed, default: {} }`.

- [ ] **Step 3: Implement `server/src/tenancy/backfill.js`**:
```js
import mongoose from 'mongoose';
import Migration from '../models/Migration.js';
import Tenant from '../models/Tenant.js';
import { runAsPlatform } from './context.js';
import { listTenantCollections } from './tenantScoped.js';

export const BACKFILL_MIGRATION_NAME = 'tenancy-002-backfill-tenant-id';
export const DEFAULT_BATCH_SIZE = 10_000;

export async function backfillTenantId({
  batchSize = DEFAULT_BATCH_SIZE,
  targetTenantId = null,
  onProgress = null,
} = {}) {
  return runAsPlatform('backfill-tenant-id', async () => {
    const startMs = Date.now();
    let tenantId = targetTenantId;
    if (!tenantId) {
      const def = await Tenant.findOne({ isDefault: true }).select('_id').lean();
      if (!def) throw new Error('Cannot backfill without a default tenant (run G1 first)');
      tenantId = def._id;
    }

    const migrationDoc = await Migration.findOneAndUpdate(
      { name: BACKFILL_MIGRATION_NAME },
      { $setOnInsert: { name: BACKFILL_MIGRATION_NAME, version: '1.2.0' } },
      { upsert: true, new: true }
    );
    const progress = migrationDoc.progress || {};

    const db = mongoose.connection.db;
    const existingCollections = new Set((await db.listCollections().toArray()).map(c => c.name));

    // Registered tenant collections + optional dedupe archive
    const collectionsToProcess = new Set(listTenantCollections());
    if (existingCollections.has('transactions_dedupe_archive')) {
      collectionsToProcess.add('transactions_dedupe_archive');
    }

    const results = {};

    for (const collName of collectionsToProcess) {
      if (!existingCollections.has(collName)) continue;
      const coll = db.collection(collName);
      const collProgress = progress[collName] || { lastId: null, processed: 0, status: 'pending' };

      if (collProgress.status === 'completed') {
        results[collName] = { updated: collProgress.processed, status: 'completed' };
        continue;
      }

      let lastId = collProgress.lastId ? new mongoose.Types.ObjectId(collProgress.lastId) : null;
      let totalUpdated = collProgress.processed || 0;

      while (true) {
        const query = {
          $or: [{ tenantId: null }, { tenantId: { $exists: false } }],
        };
        if (lastId) query._id = { $gt: lastId };

        const batch = await coll.find(query, { projection: { _id: 1 } })
          .sort({ _id: 1 })
          .limit(batchSize)
          .toArray();

        if (batch.length === 0) break;

        const ids = batch.map(doc => doc._id);
        const updateRes = await coll.updateMany(
          { _id: { $in: ids } },
          { $set: { tenantId } }
        );

        totalUpdated += updateRes.modifiedCount;
        lastId = ids[ids.length - 1];

        // Persist checkpoint
        await Migration.updateOne(
          { name: BACKFILL_MIGRATION_NAME },
          {
            $set: {
              [`progress.${collName}`]: {
                lastId: String(lastId),
                processed: totalUpdated,
                status: 'in_progress',
                updatedAt: new Date(),
              },
            },
          }
        );

        if (onProgress) onProgress({ collection: collName, processed: totalUpdated });
        if (batch.length < batchSize) break;
      }

      // Verification check per collection
      const remainingUnassigned = await coll.countDocuments({
        $or: [{ tenantId: null }, { tenantId: { $exists: false } }],
      });
      if (remainingUnassigned > 0) {
        throw new Error(`Backfill verification failed: ${collName} has ${remainingUnassigned} unassigned documents remaining`);
      }

      await Migration.updateOne(
        { name: BACKFILL_MIGRATION_NAME },
        {
          $set: {
            [`progress.${collName}`]: {
              lastId: lastId ? String(lastId) : null,
              processed: totalUpdated,
              status: 'completed',
              completedAt: new Date(),
            },
          },
        }
      );

      results[collName] = { updated: totalUpdated, status: 'completed' };
    }

    return { collections: results, durationMs: Date.now() - startMs };
  });
}
```

- [ ] **Step 4: Implement `server/migrations/0005_tenancy_backfill_tenant_id.js`**:
```js
import { getTenancyMode } from '../src/config/tenancy.js';
import { backfillTenantId, BACKFILL_MIGRATION_NAME } from '../src/tenancy/backfill.js';

export default {
  name: BACKFILL_MIGRATION_NAME,
  version: '1.2.0',
  description: 'Backfill tenantId on all TEN collections (G3, spec §6.3)',
  async up() {
    if (getTenancyMode() === 'multi') return;
    await backfillTenantId();
  },
};
```

- [ ] **Step 5: Run the test:**
```bash
node --test server/test/tenancyBackfill.test.js
```
Expected: `# pass 1`, `# fail 0`.

- [ ] **Step 6: Commit:**
```bash
git add server/src/models/Migration.js server/src/tenancy/backfill.js server/migrations/0005_tenancy_backfill_tenant_id.js server/test/tenancyBackfill.test.js
git commit -m "feat(tenancy): implement G3 backfill migration with 10k batching and resumable progress"
```

---

### Task 8: G4 Compound Index Build Migration (`0006_tenancy_compound_indexes.js` & `indexBuilder.js`)

**Files:**
- Create: `server/src/tenancy/indexBuilder.js`
- Create: `server/migrations/0006_tenancy_compound_indexes.js`
- Test: `server/test/tenancyIndexBuilder.test.js`

**Interfaces:**
- Consumes: registered tenant models, `mongoose.connection.db`, `runAsPlatform`.
- Produces:
  - `buildCompoundIndexes({ background = true } = {}) -> Promise<{ created: string[], preserved: string[] }>`
  - Migration record `Migration{name:'tenancy-003-compound-indexes', version:'1.2.0'}`.
  - Builds all compound indexes from spec §2.1 online using `createIndex(spec, { background: true })`.
  - Preserves legacy global unique indexes: calls `listIndexes()` to verify coexistence.
  - Never calls `syncIndexes()`.

- [ ] **Step 1: Write the failing tests** in `server/test/tenancyIndexBuilder.test.js`:
```js
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import { buildCompoundIndexes, INDEX_MIGRATION_NAME } from '../../src/tenancy/indexBuilder.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip2_indexes';

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('buildCompoundIndexes creates compound indexes while keeping legacy indexes', async () => {
  // Simulate legacy global index
  await User.collection.createIndex({ username: 1 }, { unique: true, name: 'username_1' });

  const res = await buildCompoundIndexes();
  assert.ok(res.created.length > 0);

  const indexes = await User.collection.listIndexes().toArray();
  const indexNames = indexes.map(i => i.name);

  // Both legacy global unique and new compound unique exist simultaneously
  assert.ok(indexNames.includes('username_1'), 'legacy username_1 index must be preserved');
  assert.ok(indexNames.some(n => n.includes('tenantId_1_username_1')), 'new compound index must exist');
});
```

- [ ] **Step 2: Implement `server/src/tenancy/indexBuilder.js`**:
```js
import mongoose from 'mongoose';
import { runAsPlatform } from './context.js';
import { listTenantModelNames, getTenantModel } from './models.js';

export const INDEX_MIGRATION_NAME = 'tenancy-003-compound-indexes';

export async function buildCompoundIndexes({ background = true } = {}) {
  return runAsPlatform('build-compound-indexes', async () => {
    const modelNames = listTenantModelNames();
    const created = [];
    const preserved = [];

    for (const name of modelNames) {
      const model = getTenantModel(name);
      const schemaIndexes = model.schema.indexes();
      const coll = model.collection;

      const existing = await coll.listIndexes().toArray();
      const existingKeyHashes = new Set(existing.map(idx => JSON.stringify(idx.key)));

      for (const [keySpec, options] of schemaIndexes) {
        const keyHash = JSON.stringify(keySpec);
        if (existingKeyHashes.has(keyHash)) {
          preserved.push(`${name}:${JSON.stringify(keySpec)}`);
          continue;
        }

        const opts = { ...options, background };
        await coll.createIndex(keySpec, opts);
        created.push(`${name}:${JSON.stringify(keySpec)}`);
      }
    }

    return { created, preserved };
  });
}
```

- [ ] **Step 3: Implement `server/migrations/0006_tenancy_compound_indexes.js`**:
```js
import { buildCompoundIndexes, INDEX_MIGRATION_NAME } from '../src/tenancy/indexBuilder.js';

export default {
  name: INDEX_MIGRATION_NAME,
  version: '1.2.0',
  description: 'Create compound tenant indexes online without dropping legacy unique indexes (G4, spec §6.3)',
  async up() {
    await buildCompoundIndexes({ background: true });
  },
};
```

- [ ] **Step 4: Run the test:**
```bash
node --test server/test/tenancyIndexBuilder.test.js
```
Expected: `# pass 1`, `# fail 0`.

- [ ] **Step 5: Commit:**
```bash
git add server/src/tenancy/indexBuilder.js server/migrations/0006_tenancy_compound_indexes.js server/test/tenancyIndexBuilder.test.js
git commit -m "feat(tenancy): implement G4 compound index builder migration preserving legacy indexes"
```

---

### Task 9: §8.2 Unique Index and §8.6 Migration Upgrade Integration Tests

**Files:**
- Create: `server/test/tenancyUniqueIndexes.test.js`
- Create: `server/test/tenancyMigrationG2G4.test.js`

**Interfaces:**
- Consumes: Tasks 1-8.
- Produces: Comprehensive test coverage validating:
  - Spec §8.2: cross-tenant duplicate allow, same-tenant duplicate collision (E11000), global unique preservation (`Domain.host`, `Transaction.idempotencyKey`, `CryptoDeposit.txHash`, `InhouseCallbackReceipt.txnId`), and verification that `syncIndexes` was never invoked.
  - Spec §8.6: legacy database migration rehearsal from pre-tenancy unassigned state through G1, G3 and G4; document count integrity; balance sum integrity; idempotency under multiple runs.

- [ ] **Step 1: Write §8.2 tests in `server/test/tenancyUniqueIndexes.test.js`**:
```js
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import Domain from '../../src/models/Domain.js';
import Transaction from '../../src/models/Transaction.js';
import CryptoDeposit from '../../src/models/CryptoDeposit.js';
import ChatRoom from '../../src/models/ChatRoom.js';
import VipLevel from '../../src/models/VipLevel.js';
import { runWithTenant } from '../../src/tenancy/context.js';
import { buildCompoundIndexes } from '../../src/tenancy/indexBuilder.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip2_unique_indexes';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  await buildCompoundIndexes({ background: false });
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('§8.2: same username/email can be registered in two different tenants', async () => {
  const u1 = await runWithTenant(T1, () =>
    User.create({ username: 'shared_player', email: 'shared@test.com' })
  );
  const u2 = await runWithTenant(T2, () =>
    User.create({ username: 'shared_player', email: 'shared@test.com' })
  );
  assert.equal(String(u1.tenantId), String(T1));
  assert.equal(String(u2.tenantId), String(T2));
});

test('§8.2: registering duplicate username in the same tenant fails with E11000', async () => {
  await assert.rejects(
    () => runWithTenant(T1, () => User.create({ username: 'shared_player', email: 'other@test.com' })),
    /E11000/
  );
});

test('§8.2: Domain.host remains globally unique across tenants', async () => {
  await Domain.create({ host: 'app.vip90.bet', tenantId: T1 });
  await assert.rejects(
    () => Domain.create({ host: 'app.vip90.bet', tenantId: T2 }),
    /E11000/
  );
});

test('§8.2: Transaction.idempotencyKey remains globally unique across tenants', async () => {
  await runWithTenant(T1, () =>
    Transaction.create({
      userId: new mongoose.Types.ObjectId(),
      type: 'deposit',
      amount: 100,
      balanceBefore: 0,
      balanceAfter: 100,
      idempotencyKey: 'idemp_unique_key_1',
    })
  );
  await assert.rejects(
    () => runWithTenant(T2, () =>
      Transaction.create({
        userId: new mongoose.Types.ObjectId(),
        type: 'deposit',
        amount: 50,
        balanceBefore: 0,
        balanceAfter: 50,
        idempotencyKey: 'idemp_unique_key_1',
      })
    ),
    /E11000/
  );
});

test('§8.2: ChatRoom and VipLevel compound uniques allow identical values across tenants', async () => {
  const r1 = await runWithTenant(T1, () => ChatRoom.create({ name: 'VIP Lounge', slug: 'vip-lounge' }));
  const r2 = await runWithTenant(T2, () => ChatRoom.create({ name: 'VIP Lounge', slug: 'vip-lounge' }));
  assert.notEqual(String(r1._id), String(r2._id));

  const v1 = await runWithTenant(T1, () => VipLevel.create({ level: 5, name: 'Gold', xpRequired: 5000 }));
  const v2 = await runWithTenant(T2, () => VipLevel.create({ level: 5, name: 'Gold', xpRequired: 5000 }));
  assert.notEqual(String(v1._id), String(v2._id));
});
```

- [ ] **Step 2: Write §8.6 migration tests in `server/test/tenancyMigrationG2G4.test.js`**:
```js
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Tenant from '../../src/models/Tenant.js';
import User from '../../src/models/User.js';
import Transaction from '../../src/models/Transaction.js';
import Bet from '../../src/models/Bet.js';
import { ensureDefaultTenant } from '../../src/tenancy/defaultTenant.js';
import { backfillTenantId } from '../../src/tenancy/backfill.js';
import { buildCompoundIndexes } from '../../src/tenancy/indexBuilder.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip2_migration_g2g4';

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('§8.6: legacy database upgrade rehearsal (G1 -> G3 -> G4)', async () => {
  // Step 1: Populate legacy pre-tenancy database
  const userDocs = Array.from({ length: 50 }, (_, i) => ({
    username: `mig_user_${i}`,
    email: `mig_${i}@test.com`,
  }));
  await User.collection.insertMany(userDocs);

  const txnDocs = Array.from({ length: 100 }, (_, i) => ({
    userId: new mongoose.Types.ObjectId(),
    type: 'deposit',
    amount: 100,
    balanceBefore: 0,
    balanceAfter: 100,
    currency: 'TRY',
  }));
  await Transaction.collection.insertMany(txnDocs);

  // Assert pre-migration baseline
  assert.equal(await User.countDocuments({ tenantId: { $exists: false } }), 50);
  assert.equal(await Transaction.countDocuments({ tenantId: { $exists: false } }), 100);

  // Step 2: Run G1 (default tenant creation)
  const defaultTenant = await ensureDefaultTenant();
  assert.ok(defaultTenant);

  // Step 3: Run G3 (backfill)
  await backfillTenantId({ batchSize: 20 });
  assert.equal(await User.countDocuments({ tenantId: null }), 0);
  assert.equal(await Transaction.countDocuments({ tenantId: null }), 0);
  assert.equal(await User.countDocuments({ tenantId: defaultTenant._id }), 50);
  assert.equal(await Transaction.countDocuments({ tenantId: defaultTenant._id }), 100);

  // Step 4: Run G4 (compound indexes)
  await buildCompoundIndexes({ background: false });
  const userIndexes = await User.collection.listIndexes().toArray();
  assert.ok(userIndexes.some(idx => idx.name.includes('tenantId')));

  // Step 5: Test idempotency (rerun backfill and index builder)
  await backfillTenantId({ batchSize: 20 });
  await buildCompoundIndexes({ background: false });
  assert.equal(await User.countDocuments({ tenantId: defaultTenant._id }), 50);
});
```

- [ ] **Step 3: Run the integration tests:**
```bash
node --test server/test/tenancyUniqueIndexes.test.js server/test/tenancyMigrationG2G4.test.js
```
Expected: `# pass 6`, `# fail 0`.

- [ ] **Step 4: Commit:**
```bash
git add server/test/tenancyUniqueIndexes.test.js server/test/tenancyMigrationG2G4.test.js
git commit -m "test(tenancy): add §8.2 unique index and §8.6 migration upgrade integration test suites"
```

---

### Task 10: Documentation & Turkish CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/product/02-yapilandirma.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: Tasks 1-9 artifacts, migration names, compound index definitions.
- Produces: Updated operator documentation, Turkish CHANGELOG entry under `## [Yayınlanmadı]`, and AGENTS.md instructions.

- [ ] **Step 1: Add the Turkish CHANGELOG entry directly under `## [Yayınlanmadı]`**:
```markdown
### İP-2: Kiracı alanları, damgalama, geri doldurma (G3) ve bileşik indeksler (G4)
**Kırılan Değişiklikler**
- Yok. Mevcut tek operatörlü kurulumlar varsayılan kiracı altında değişmeden çalışmaya devam eder; eski global unique indeksler yerinde korunur.
**Eklendi**
- Tüm TEN modellerine `tenantId` (ObjectId, Tenant ref, `immutable: true`, İP-2'de `required: false`) alanı eklendi ve `defineTenantModel` ile `tenantScoped` eklentisi bağlandı.
- Para kayıtlarına (`Bet`, `CasinoRound`, `CasinoSession`, `InhousePlaySession`, `BankDepositRequest`, `CryptoDeposit`, `ReferralCommission`) çoklu para birimi geleceğine hazırlık olarak `currency` alanı eklendi (K14; varsayılan 'TRY').
- Açılış/yükseltme geçişi `tenancy-002-backfill-tenant-id` (G3): 10.000'lik partiler halinde, kesilip devam ettirilebilir (resumable, `Migration.progress` kaydında) geri doldurma; tüm TEN koleksiyonlarında `tenantId: null` kontrolü sıfır olana kadar doğrulanır; `transactions_dedupe_archive` koleksiyonunu da kapsar.
- İndeks geçişi `tenancy-003-compound-indexes` (G4): Spec §2.1'deki tüm bileşik indeksleri (`{tenantId, username}`, `{tenantId, email}`, `{tenantId, slug}` vb.) Mongo 7 çevrimiçi derleme ile oluşturur; mevcut global unique indeksleri düşürmez (`listIndexes` iki indeksi de gösterir); `syncIndexes` kesinlikle kullanılmaz.
```

- [ ] **Step 2: Update `docs/product/02-yapilandirma.md`**:
  Add documentation under a new `### Tenancy Migrations and Indexes (İP-2)` subsection explaining G2, G3 backfill runner and batching, G4 compound index builder, and dual index coexistence.

- [ ] **Step 3: Update `AGENTS.md`**:
  Document that all TEN models MUST use `defineTenantModel(name, schema)`, schemas MUST include `tenantId: { immutable: true, required: false }`, schemas set `{ autoIndex: false }`, and index modifications must never invoke `syncIndexes()`.

- [ ] **Step 4: Verify formatting and run changelog check:**
```bash
grep -n "İP-2: Kiracı alanları" CHANGELOG.md
```
Expected: 1 match.

- [ ] **Step 5: Run full test regression:**
```bash
npm test --prefix server
```
Expected: All unit and tenancy tests pass.

- [ ] **Step 6: Commit:**
```bash
git add CHANGELOG.md docs/product/02-yapilandirma.md AGENTS.md
git commit -m "docs(tenancy): İP-2 changelog, operator configuration docs and model registration rules"
```

---

## Decisions this plan makes where the spec leaves room

1. **`required: false` on `tenantId` in İP-2 (G2):** Per §4.4 item 1 and §6.3 G2, `tenantId` is added without `required: true` so that existing unassigned documents do not fail validation before the G3 backfill runs. Strict requirement is enforced in İP-8.
2. **`autoIndex: false` on all TEN schemas:** To prevent Mongoose from automatically building indexes on server startup (which can cause duplicate key errors on un-backfilled databases or block startup on large tables), all TEN schemas declare `{ autoIndex: false }`. Compound indexes are explicitly created online by the G4 migration.
3. **Resumable checkpoint schema in `Migration.progress`:** `Migration.progress.<collection>` stores `{ lastId, processed, status, updatedAt }`. This allows the G3 backfill to survive crashes or restarts and resume from the exact last ObjectId without scanning already-migrated documents.
4. **Preservation of single-mode unique indexes:** Per §6.3 G4, legacy global unique indexes (`username_1`, `email_1`, etc.) are NOT dropped in single mode. Mongo 7 `listIndexes()` verifies the coexistence of both old global and new compound indexes.
5. **Currency defaults (K14):** In compliance with K14 and §4.3.2, all money-bearing records receive `currency: { type: String, default: 'TRY', uppercase: true, trim: true }`, ensuring future multi-currency readiness without altering existing single-currency application logic.
