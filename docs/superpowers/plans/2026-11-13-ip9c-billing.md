# İP-9c Commission, Operator Billing, and Platform Cross-Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement work package İP-9c of the approved multi-tenant design:
- **K20 Sportsbook odds feed cost per operator:** Selectable cost model per operator (`fixed`, `turnover_percentage`, `both`, `none`) configured via `OperatorFeePlan`.
- **K21 Partner commercial model selectable per partner:** Support for wholesale (partner pays platform fee), revenue share (platform pays partner commission), or both, configured on `Partner` and `PartnerOperatorLink`.
- **Commission base is GGR in version 1:** Net Gaming Revenue (NGR) is not computed today and is selectable in future iterations. Keep the base field explicit (`base: 'ggr' | 'ngr' | 'turnover' | 'fixed'`); implement GGR only (`casinoGgr + sportsGgrRealized`); reject NGR with a clear error (`ERR_NGR_NOT_IMPLEMENTED`).
- **S3 Fully configurable commercial terms:** Make every rate, fixed fee, base, and negative GGR strategy configurable on models. Never hard-code commercial rates or values in code.
- **Pure commission calculator engine:** Calculate daily commission as that day's `TenantDailyStat` × the terms of the `PartnerOperatorLink` valid on that specific day (`validFrom` inclusive, `validTo` exclusive). A closed link keeps its terms for historical days. Mid-period link changes apply distinct rates across their respective intervals.
- **Money & currency isolation:** Amounts match decimal figures stored in `TenantDailyStat`. Currency per row is strictly preserved (never sum different currencies). Explicit half-up rounding rule to 2 decimal places.
- **Statement generation job:** Idempotent generation per partner + period + currency running under `runAsPlatform('billing-statement-generation')` (with CI lint allow-list entry).
- **Statement immutability & adjustments:** Statements are strictly immutable once issued. Corrections are append-only adjustment lines (`type: 'adjustment'`) or void-by-adjustment, never in-place updates. Every billing write produces an `AuditLog` row.
- **K24 Legal retention:** All billing records, plans, statements, and statement lines are retained for at least 5 years (`legalRetentionUntil` locked, no aggressive TTL deletion).
- **Platform billing & cross-tenant reports:** Management API and `console/` UI for fee plans, statement generation, issue/void/adjustment actions, CSV streaming export, portfolio GGR/turnover aggregates, sportsbook odds fee reports, and partner commercial balance reports.
- **K27 Partner portal statements:** Partner staff sees only aggregates of own portfolio and own commission statements, strictly scoped to `req.staff.scopeId` with 404 on cross-partner IDOR and zero player PII.
- **Single mode compatibility:** Single-operator installs keep working unchanged (`TENANCY_MODE=single`). Billing endpoints return 404 `NOT_FOUND`.

**Architecture:**
- **Platform Billing Models:** Platform models (`OperatorFeePlan`, `PartnerStatement`, `StatementLine`) live outside the `tenantScoped` plugin. In multi mode, `/api/platform/billing/*` and `/api/platform/reports/*` serve Platform Owners, while `/api/partner/statements/*` serve partner staff.
- **Temporal Terms Resolution:** Daily stats match active link terms where `link.validFrom <= date < link.validTo`. Historical statements remain deterministic even after link transfers or operator reassignment.
- **Strict Currency Isolation:** Each statement is strictly monocurrency (`TRY`, `EUR`, `USD`, etc.). If a partner has multi-currency activity, separate statements are generated per currency.
- **Audited Mutation Lifecycle:** Draft -> Issued -> Settled / Voided. Mutations to issued statements require explicit adjustment lines recording author, reason, and amount.
- **Cross-Tenant Reporting Engine:** Aggregates portfolio turnover, casino GGR, realized sports GGR, sportsbook odds fees, and partner balances directly from pre-aggregated `TenantDailyStat` and `StatementLine` collections.

**Tech Stack:** Node >= 22 (ESM), Express 4, Mongoose 8.24, React 19, Vite 5, Zustand 5, React Router 7, `node:test` + `node:assert/strict`, local MongoDB (replica set `rs0` on 127.0.0.1:27017).

**Spec:** `docs/superpowers/specs/2026-11-09-multi-tenant-design.md`. Sections used: §4.3.4 (`Partner`, `PartnerOperatorLink`, commercial terms), §4.3.6 (`TenantDailyStat`), §4.6 (Sportsbook catalog & odds feed cost), §7.1 (İP-9c critical path row), §8 (Acceptance tests), K20 (Sportsbook odds fee), K21 (Partner commercial model), K24 (Billing record retention ≥ 5 years), K27 (Partner portfolio aggregates & own commission only), S2 (Odds feed cost), S3 (Billing models).

---

## Reviewer Corrections and Ground Rules

1. **Explicit Commission Base:** Base is explicit (`ggr`). If `base === 'ngr'` is requested, reject with error code `ERR_NGR_NOT_IMPLEMENTED` and message `"NGR calculation is not yet implemented; only GGR is supported in this version."`.
2. **Strict Currency Isolation:** Never sum amounts with different currencies. Every calculation and statement is partitioned by currency.
3. **Statement Immutability:** Once `status === 'issued'`, statements cannot be directly edited. Corrections must be added as `StatementLine` records with `type: 'adjustment'`.
4. **Temporal Link Matching:** For any date `D`, link terms apply if `validFrom <= D` and (`validTo === null || validTo > D`). Past days retain the terms of the link that was active on that day.
5. **K24 Legal Retention:** All statements and fee plans carry `legalRetentionUntil` set to at least 5 years past period end. No short TTL index may drop billing records.
6. **Cross-Partner Isolation:** Partner portal billing routes strictly filter by `partnerId = req.staff.scopeId`. Cross-partner requests return 404 `NOT_FOUND` (never 403).
7. **Audit Logging:** Every fee plan mutation, statement generation, status change, and adjustment line addition writes an `AuditLog` row via `writePlatformLevelAudit`.
8. **Single Mode Compatibility:** In single mode, `/api/platform/billing/*` and `/api/partner/statements/*` return 404 `NOT_FOUND`.
9. **Test Isolation:** Tests run on dedicated test database names (`mongodb://127.0.0.1:27017/vip90_test_ip9c_t*`) and must not run the full root `npm test`. Always run with `--test-timeout=60000`.

---

## Global Constraints

- **Never weaken an existing check:** Existing staff authentication, 2FA requirements in multi mode, and role permissions remain strictly enforced.
- **Brand-neutral core:** No hard-coded brand names, internal hostnames, or private IPs in core code. Test fixtures use `*.example.com` domains and generic labels.
- **Idempotent operations:** Statement generation is safe to re-run for open drafts; existing issued statements are preserved.
- **Public core code:** Core code contains no private add-on imports.

---

## Review Focus

- **Temporal Link Resolution:** Verify that mid-period link rate changes correctly calculate day-by-day rates without retroactively altering past links.
- **Currency Separation:** Verify that multi-currency operator activity produces separate statement lines and totals per currency.
- **Immutability Enforcement:** Verify that attempts to update issued statements fail with `ERR_STATEMENT_IMMUTABLE`.
- **Negative GGR Strategy:** Verify that `zero_floor` and `carry_forward` modes behave correctly when player payouts exceed bets.
- **Cross-Partner Boundary (K27):** Verify that partner staff cannot access another partner's statement or cross-tenant raw reports.
- **CI Lint Compliance:** Verify that `scripts/lint-tenancy.mjs` allows `server/src/platform/services/billingService.js`.

---

## File Structure

| File | Repository | Responsibility | Task |
|---|---|---|---|
| `server/src/models/OperatorFeePlan.js` | core | Mongoose model for K20 operator fee plans (sportsbook fixed & volume fee) | 1 |
| `server/src/models/PartnerStatement.js` | core | Mongoose model for partner billing statements with immutability and K24 retention | 1 |
| `server/src/models/StatementLine.js` | core | Mongoose model for itemized daily commission, fee, and adjustment lines | 1 |
| `server/src/services/permissions.js` | core | Billing and reports platform/partner permission definitions | 1 |
| `server/test/billingModels.test.js` | core | Tests for billing models, partial unique indexes, immutability, and retention | 1 |
| `server/src/platform/services/commissionCalculator.js` | core | Pure calculation engine for daily commission, mid-period link changes, K20 odds fee, and rounding | 2 |
| `server/test/commissionCalculator.test.js` | core | Unit tests for commission calculation, link transitions, currencies, and negative GGR | 2 |
| `server/src/platform/services/billingService.js` | core | Statement generation job, draft lifecycle, issuance locking, adjustments, and CSV export | 3 |
| `scripts/lint-tenancy.mjs` | core | Register billing service in `RUN_AS_PLATFORM_ALLOWLIST` | 3 |
| `server/test/billingService.test.js` | core | Tests for idempotent generation, issuance locking, adjustments, and audit trail | 3 |
| `server/src/platform/controllers/platformBillingController.js` | core | Platform controller for fee plans, statement generation, issue/void, adjustments, and export | 4 |
| `server/src/platform/routes/index.js` | core | Mount `/api/platform/billing/*` routes guarded by `platform:billing:read` / `manage` | 4 |
| `server/test/platformBillingApi.test.js` | core | Integration tests for platform billing API and single-mode 404 | 4 |
| `server/src/platform/services/platformReportsService.js` | core | Cross-tenant metrics aggregation across all operators and partners | 5 |
| `server/src/platform/controllers/platformReportsController.js` | core | Platform controller for cross-tenant performance, K20 sportsbook, and K21 balance reports | 5 |
| `server/test/platformReportsApi.test.js` | core | Integration tests for cross-tenant platform reports and CSV streaming | 5 |
| `server/src/platform/controllers/partnerBillingController.js` | core | Controller for partner viewing own statements, portfolio aggregates, and CSV export | 6 |
| `server/src/platform/routes/partner.js` | core | Mount `/api/partner/statements/*` routes guarded by `partner:metrics:read` / `billing` | 6 |
| `server/test/partnerBillingApi.test.js` | core | Tests for partner statements API, cross-partner 404 IDOR, and zero player PII | 6 |
| `console/src/api/client.js` | core | API client methods for platform billing, reports, and partner statements | 7 |
| `console/src/components/layout/Sidebar.jsx` | core | Navigation links for Platform Billing & Reports, and Partner Statements | 7, 8 |
| `console/src/pages/billing/BillingDashboard.jsx` | core | Platform view: billing summary cards, unbilled periods, total revenue share & wholesale | 7 |
| `console/src/pages/billing/StatementsList.jsx` | core | Platform view: statements table, status filter, generate statement modal | 7 |
| `console/src/pages/billing/StatementDetail.jsx` | core | Platform view: statement detail, daily lines, adjustment modal, issue/void actions, CSV export | 7 |
| `console/src/pages/billing/OperatorFeePlans.jsx` | core | Platform view: K20 sportsbook fee plans and platform fee editor | 7 |
| `console/src/pages/reports/PlatformReports.jsx` | core | Platform view: cross-tenant interactive charts, grouping toggle, CSV export | 7 |
| `console/src/App.jsx` | core | Mount platform billing, reports, and partner statements routes | 7, 8 |
| `console/test/platformBillingConsole.test.js` | core | Tests for platform console billing & reports UI rendering and client integration | 7 |
| `console/src/pages/partner/PartnerStatementsList.jsx` | core | Partner view: issued statements list, period, currency, net commission, CSV download | 8 |
| `console/src/pages/partner/PartnerStatementDetail.jsx` | core | Partner view: statement breakdown by operator and adjustments | 8 |
| `console/test/partnerBillingConsole.test.js` | core | Tests for partner portal billing UI rendering and navigation | 8 |
| `server/test/billingAcceptance.test.js` | core | End-to-end acceptance suite covering full billing lifecycle, K20/K21, and isolation | 9 |
| `CHANGELOG.md` | core | Document İP-9c changes under `[Yayınlanmadı]` | 9 |

---

## Parallelism

Tasks are organized into execution waves to optimize independent development and verification:

| Wave | Tasks (run in parallel, separate worktrees) | Repository | Depends on |
|---|---|---|---|
| A | 1 (Billing Models & Permissions), 2 (Commission Calculator Engine) | core | none |
| B | 3 (Statement Generation Service & Tenancy Lint), 5 (Cross-Tenant Platform Reports Engine & API) | core | 1, 2 |
| C | 4 (Platform Billing API), 6 (Partner Portal Statements API) | core | 3 |
| D | 7 (Console Platform Billing & Reports UI), 8 (Console Partner Portal Billing UI) | core | 4, 5, 6 |
| E | 9 (End-to-End Acceptance Suite & CHANGELOG) | core | 7, 8 |

**Conflict notes:**
- Wave A operates on database models and pure calculation logic.
- Wave B tasks run independently: Task 3 builds the billing service and modifies linting; Task 5 builds cross-tenant reporting service.
- Wave C integrates service logic into platform and partner Express routers.
- Wave D operates in `console/`, building UI pages against the API endpoints.
- Wave E executes end-to-end integration and acceptance tests across the whole system.

---

### Task 1: Billing Data Models, Permissions Catalogue, and Schema Validation (Repository: core)

**Files:**
- Create: `server/src/models/OperatorFeePlan.js`
- Create: `server/src/models/PartnerStatement.js`
- Create: `server/src/models/StatementLine.js`
- Modify: `server/src/services/permissions.js`
- Create: `server/test/billingModels.test.js`

**Interfaces:**
- Consumes: `StaffAccount` model, `Tenant` model, `Partner` model, `PartnerOperatorLink` model, `PERMISSION_DEFS` from `server/src/services/permissions.js`.
- Produces: `OperatorFeePlan`, `PartnerStatement`, and `StatementLine` Mongoose models, with partial unique index for active fee plans, immutability guards, K24 legal retention fields, and updated billing permissions.

- [ ] **Step 1: Write failing tests** in `server/test/billingModels.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import OperatorFeePlan from '../src/models/OperatorFeePlan.js';
import PartnerStatement from '../src/models/PartnerStatement.js';
import StatementLine from '../src/models/StatementLine.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Tenant from '../src/models/Tenant.js';
import Partner from '../src/models/Partner.js';
import { PERMISSION_DEFS } from '../src/services/permissions.js';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9c_t1';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('OperatorFeePlan enforces partial unique active plan per tenant and validates K20 sportsbook fee', async () => {
  const staff = await StaffAccount.create({ email: 'planowner@example.com', username: 'planowner', password: 'pwd', status: 'active' });
  const tenant = await Tenant.create({ key: 'fee-op-1', name: 'Fee Op 1' });

  const plan1 = await OperatorFeePlan.create({
    tenantId: tenant._id,
    validFrom: new Date('2026-11-01T00:00:00.000Z'),
    validTo: null,
    sportsbookFee: {
      model: 'both',
      fixedMonthlyFee: 2500,
      turnoverRate: 0.015,
      currency: 'TRY',
    },
    createdBy: staff._id,
  });

  assert.equal(plan1.sportsbookFee.model, 'both');
  assert.equal(plan1.sportsbookFee.fixedMonthlyFee, 2500);
  assert.equal(plan1.sportsbookFee.turnoverRate, 0.015);
  assert.ok(plan1.legalRetentionUntil >= new Date(Date.now() + 4 * 365 * 86400 * 1000));

  // Second active plan for same tenant must fail with E11000
  await assert.rejects(
    () => OperatorFeePlan.create({
      tenantId: tenant._id,
      validFrom: new Date('2026-11-15T00:00:00.000Z'),
      validTo: null,
      sportsbookFee: { model: 'fixed', fixedMonthlyFee: 3000, currency: 'TRY' },
      createdBy: staff._id,
    }),
    /E11000/
  );

  // Close first plan, allowing second active plan
  plan1.validTo = new Date('2026-11-15T00:00:00.000Z');
  await plan1.save();

  const plan2 = await OperatorFeePlan.create({
    tenantId: tenant._id,
    validFrom: new Date('2026-11-15T00:00:00.000Z'),
    validTo: null,
    sportsbookFee: { model: 'turnover_percentage', turnoverRate: 0.02, currency: 'TRY' },
    createdBy: staff._id,
  });
  assert.ok(plan2._id);
});

test('PartnerStatement enforces unique statementNumber, currency, and immutability once issued', async () => {
  const staff = await StaffAccount.create({ email: 'stmtstaff@example.com', username: 'stmtstaff', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'stmt-partner', name: 'Stmt Partner', createdBy: staff._id });

  const stmt = await PartnerStatement.create({
    statementNumber: 'STMT-2026-11-P1-TRY',
    partnerId: partner._id,
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    currency: 'TRY',
    direction: 'revenue_share',
    status: 'draft',
    grossAmount: 15000.50,
    adjustmentsAmount: 0,
    netAmount: 15000.50,
    finalAmount: 15000.50,
    linesCount: 10,
    createdBy: staff._id,
  });

  assert.equal(stmt.status, 'draft');
  assert.equal(stmt.currency, 'TRY');
  assert.ok(stmt.legalRetentionUntil >= new Date(Date.now() + 4 * 365 * 86400 * 1000));

  // Duplicate statementNumber rejected
  await assert.rejects(
    () => PartnerStatement.create({
      statementNumber: 'STMT-2026-11-P1-TRY',
      partnerId: partner._id,
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      currency: 'TRY',
      status: 'draft',
      createdBy: staff._id,
    }),
    /E11000/
  );

  // Transition to issued
  stmt.status = 'issued';
  stmt.issuedAt = new Date();
  stmt.issuedBy = staff._id;
  await stmt.save();

  // Attempting to directly alter grossAmount on issued statement fails
  stmt.grossAmount = 99999;
  await assert.rejects(
    () => stmt.save(),
    (err) => err.code === 'ERR_STATEMENT_IMMUTABLE'
  );
});

test('StatementLine validates line types and associates with statement', async () => {
  const staff = await StaffAccount.create({ email: 'linestaff@example.com', username: 'linestaff', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'line-partner', name: 'Line Partner', createdBy: staff._id });
  const tenant = await Tenant.create({ key: 'line-tenant', name: 'Line Tenant' });

  const stmt = await PartnerStatement.create({
    statementNumber: 'STMT-2026-11-LINES-TRY',
    partnerId: partner._id,
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    currency: 'TRY',
    status: 'draft',
    createdBy: staff._id,
  });

  const line = await StatementLine.create({
    statementId: stmt._id,
    partnerId: partner._id,
    tenantId: tenant._id,
    type: 'commission',
    date: '2026-11-05',
    currency: 'TRY',
    baseMetric: 'ggr',
    baseAmount: 10000,
    rate: 0.15,
    amount: 1500,
    description: '15% GGR Commission for Fee Op',
  });

  assert.equal(line.type, 'commission');
  assert.equal(line.amount, 1500);

  const adjLine = await StatementLine.create({
    statementId: stmt._id,
    partnerId: partner._id,
    type: 'adjustment',
    currency: 'TRY',
    baseMetric: 'manual',
    baseAmount: 0,
    rate: 0,
    amount: -250,
    description: 'Manual credit adjustment for promotion refund',
    reason: 'Approved ticket #1042',
    createdBy: staff._id,
  });

  assert.equal(adjLine.type, 'adjustment');
  assert.equal(adjLine.amount, -250);
});

test('Permissions catalogue includes platform billing and partner billing keys', () => {
  const keys = new Set(PERMISSION_DEFS.map((p) => p.key));
  assert.ok(keys.has('platform:billing:read'), 'platform:billing:read must exist');
  assert.ok(keys.has('platform:billing:manage'), 'platform:billing:manage must exist');
  assert.ok(keys.has('platform:reports:read'), 'platform:reports:read must exist');
  assert.ok(keys.has('partner:billing:read'), 'partner:billing:read must exist');
});
```

- [ ] **Step 2: Implement models and permissions**:

Create `server/src/models/OperatorFeePlan.js`:
```javascript
import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const RETENTION_MS = 5 * 365 * 24 * 60 * 60 * 1000; // 5 years min per K24

const operatorFeePlanSchema = new mongoose.Schema({
  tenantId: { type: ObjectId, ref: 'Tenant', required: true, index: true },
  validFrom: { type: Date, required: true, default: Date.now },
  validTo: { type: Date, default: null, index: true },
  // K20 Sportsbook odds feed fee model
  sportsbookFee: {
    model: {
      type: String,
      enum: ['none', 'fixed', 'turnover_percentage', 'both'],
      default: 'none',
    },
    fixedMonthlyFee: { type: Number, default: 0, min: 0 },
    turnoverRate: { type: Number, default: 0, min: 0, max: 1 },
    currency: { type: String, default: 'TRY' },
  },
  // Optional platform-level base fees for the operator
  platformFee: {
    model: {
      type: String,
      enum: ['none', 'fixed', 'ggr_percentage', 'both'],
      default: 'none',
    },
    fixedMonthlyFee: { type: Number, default: 0, min: 0 },
    ggrRate: { type: Number, default: 0, min: 0, max: 1 },
    currency: { type: String, default: 'TRY' },
  },
  notes: { type: String, default: null },
  createdBy: { type: ObjectId, ref: 'StaffAccount', required: true },
  endedBy: { type: ObjectId, ref: 'StaffAccount', default: null },
  legalRetentionUntil: {
    type: Date,
    default: () => new Date(Date.now() + RETENTION_MS),
  },
}, { timestamps: true });

// Enforce at most one active fee plan per tenant (validTo == null)
operatorFeePlanSchema.index(
  { tenantId: 1, validTo: 1 },
  { unique: true, partialFilterExpression: { validTo: null } }
);

export default mongoose.models.OperatorFeePlan || mongoose.model('OperatorFeePlan', operatorFeePlanSchema);
```

Create `server/src/models/PartnerStatement.js`:
```javascript
import mongoose from 'mongoose';

const { ObjectId, Mixed } = mongoose.Schema.Types;

const RETENTION_MS = 5 * 365 * 24 * 60 * 60 * 1000; // 5 years min per K24

const partnerStatementSchema = new mongoose.Schema({
  statementNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
  },
  partnerId: { type: ObjectId, ref: 'Partner', required: true, index: true },
  periodStart: { type: String, required: true }, // YYYY-MM-DD
  periodEnd: { type: String, required: true }, // YYYY-MM-DD
  currency: { type: String, required: true, default: 'TRY' },
  direction: {
    type: String,
    enum: ['revenue_share', 'wholesale', 'both'],
    default: 'revenue_share',
  },
  status: {
    type: String,
    enum: ['draft', 'issued', 'settled', 'voided'],
    default: 'draft',
    index: true,
  },
  grossAmount: { type: Number, default: 0 },
  adjustmentsAmount: { type: Number, default: 0 },
  netAmount: { type: Number, default: 0 },
  minimumFee: { type: Number, default: 0 },
  finalAmount: { type: Number, default: 0 },
  linesCount: { type: Number, default: 0 },
  issuedAt: { type: Date, default: null },
  issuedBy: { type: ObjectId, ref: 'StaffAccount', default: null },
  voidedAt: { type: Date, default: null },
  voidedBy: { type: ObjectId, ref: 'StaffAccount', default: null },
  voidReason: { type: String, default: null },
  settledAt: { type: Date, default: null },
  settledBy: { type: ObjectId, ref: 'StaffAccount', default: null },
  createdBy: { type: ObjectId, ref: 'StaffAccount', default: null },
  metadata: { type: Mixed, default: () => ({}) },
  legalRetentionUntil: {
    type: Date,
    default: function () {
      const base = this.periodEnd ? new Date(this.periodEnd).getTime() : Date.now();
      return new Date(base + RETENTION_MS);
    },
  },
}, { timestamps: true });

partnerStatementSchema.index({ partnerId: 1, periodStart: 1, periodEnd: 1, currency: 1 });

partnerStatementSchema.pre('save', function (next) {
  if (!this.isNew && this.isModified('grossAmount')) {
    // If statement is issued or settled, direct edits to base figures are forbidden
    const originalStatus = this._originalStatus || this.status;
    if (originalStatus === 'issued' || originalStatus === 'settled') {
      const err = new Error('Issued statements are immutable; adjustments must be made via adjustment lines.');
      err.code = 'ERR_STATEMENT_IMMUTABLE';
      return next(err);
    }
  }
  next();
});

partnerStatementSchema.post('init', function () {
  this._originalStatus = this.status;
});

export default mongoose.models.PartnerStatement || mongoose.model('PartnerStatement', partnerStatementSchema);
```

Create `server/src/models/StatementLine.js`:
```javascript
import mongoose from 'mongoose';

const { ObjectId, Mixed } = mongoose.Schema.Types;

const statementLineSchema = new mongoose.Schema({
  statementId: { type: ObjectId, ref: 'PartnerStatement', required: true, index: true },
  partnerId: { type: ObjectId, ref: 'Partner', required: true, index: true },
  tenantId: { type: ObjectId, ref: 'Tenant', default: null, index: true },
  linkId: { type: ObjectId, ref: 'PartnerOperatorLink', default: null },
  type: {
    type: String,
    enum: ['commission', 'fixed_fee', 'sportsbook_fee', 'adjustment', 'minimum_fee_topup'],
    required: true,
  },
  date: { type: String, default: null }, // YYYY-MM-DD
  currency: { type: String, required: true },
  baseMetric: {
    type: String,
    enum: ['ggr', 'turnover', 'fixed', 'manual'],
    default: 'ggr',
  },
  baseAmount: { type: Number, default: 0 },
  rate: { type: Number, default: 0 },
  amount: { type: Number, required: true, default: 0 },
  description: { type: String, required: true },
  reason: { type: String, default: null },
  createdBy: { type: ObjectId, ref: 'StaffAccount', default: null },
  metadata: { type: Mixed, default: () => ({}) },
}, { timestamps: true });

statementLineSchema.index({ statementId: 1, type: 1 });
statementLineSchema.index({ partnerId: 1, date: 1 });

export default mongoose.models.StatementLine || mongoose.model('StatementLine', statementLineSchema);
```

Modify `server/src/services/permissions.js`:
Add billing and reporting permissions to `PLATFORM_PERMISSION_DEFS` and `PARTNER_PERMISSION_DEFS`:
```javascript
// In PLATFORM_PERMISSION_DEFS:
  { key: 'platform:billing:manage', name: 'Faturalamayı Yönet', category: 'platform', description: 'Operatör ücret planları ve partner faturalarını oluşturma/yönetme' },
  { key: 'platform:reports:read', name: 'Platform Raporlarını Görüntüle', category: 'platform', description: 'Platform çapraz kiracı metrik ve finans raporlarını görüntüleme' },

// In PARTNER_PERMISSION_DEFS:
  { key: 'partner:billing:read', name: 'Partner Faturalarını Görüntüle', category: 'partner', description: 'Kendi partner fatura ve komisyon ekstrelerini görüntüleme' },
```
Update role definitions for `platform_owner`, `platform_finance`, `partner_admin`, `partner_analyst` to include these permissions.

- [ ] **Step 3: Run the test suite**:
```bash
node --test --test-timeout=60000 server/test/billingModels.test.js
```

- [ ] **Step 4: Commit task changes**:
```bash
git add server/src/models/OperatorFeePlan.js server/src/models/PartnerStatement.js server/src/models/StatementLine.js server/src/services/permissions.js server/test/billingModels.test.js
git commit -m "feat(billing): add OperatorFeePlan, PartnerStatement, and StatementLine models with permissions"
```

---

### Task 2: Pure Commission & Sportsbook Fee Calculator Engine (Repository: core)

**Files:**
- Create: `server/src/platform/services/commissionCalculator.js`
- Create: `server/test/commissionCalculator.test.js`

**Interfaces:**
- Consumes: Plain objects of `TenantDailyStat`, `PartnerOperatorLink`, `OperatorFeePlan`, `Partner`.
- Produces: `calculateCommissionForPeriod(params)` pure calculation function returning grouped lines and totals per currency, handling mid-period link changes, K20 odds feed fees, and explicit rounding.

- [ ] **Step 1: Write failing tests** in `server/test/commissionCalculator.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCommissionForPeriod, roundMoney } from '../src/platform/services/commissionCalculator.js';

test('roundMoney rounds half-up accurately to 2 decimals', () => {
  assert.equal(roundMoney(10.005), 10.01);
  assert.equal(roundMoney(10.004), 10.00);
  assert.equal(roundMoney(0.1 + 0.2), 0.30);
  assert.equal(roundMoney(-5.555), -5.55);
});

test('calculateCommissionForPeriod calculates revshare_ggr correctly for a single operator', () => {
  const partner = { _id: 'P1', defaultCommercialTerms: { model: 'revshare_ggr', rate: 0.15, currency: 'TRY' } };
  const links = [{
    partnerId: 'P1',
    tenantId: 'T1',
    validFrom: new Date('2026-11-01T00:00:00.000Z'),
    validTo: null,
    commercialTerms: { model: 'revshare_ggr', rate: 0.15, currency: 'TRY' },
  }];
  const stats = [
    { tenantId: 'T1', date: '2026-11-01', currency: 'TRY', casinoGgr: 10000, sportsGgrRealized: 2000, casinoTurnover: 50000, sportsTurnover: 10000 },
    { tenantId: 'T1', date: '2026-11-02', currency: 'TRY', casinoGgr: 8000, sportsGgrRealized: 1000, casinoTurnover: 40000, sportsTurnover: 8000 },
  ];

  const result = calculateCommissionForPeriod({ partner, links, stats, feePlans: [] });
  assert.ok(result.TRY);
  assert.equal(result.TRY.grossAmount, 3150.00); // Day 1: 12000 * 0.15 = 1800; Day 2: 9000 * 0.15 = 1350
  assert.equal(result.TRY.lines.length, 2);
  assert.equal(result.TRY.lines[0].amount, 1800.00);
  assert.equal(result.TRY.lines[1].amount, 1350.00);
});

test('calculateCommissionForPeriod handles mid-period link rate change', () => {
  const partner = { _id: 'P1' };
  const links = [
    {
      partnerId: 'P1',
      tenantId: 'T1',
      validFrom: new Date('2026-11-01T00:00:00.000Z'),
      validTo: new Date('2026-11-15T00:00:00.000Z'),
      commercialTerms: { model: 'revshare_ggr', rate: 0.10, currency: 'TRY' },
    },
    {
      partnerId: 'P1',
      tenantId: 'T1',
      validFrom: new Date('2026-11-15T00:00:00.000Z'),
      validTo: null,
      commercialTerms: { model: 'revshare_ggr', rate: 0.20, currency: 'TRY' },
    },
  ];

  const stats = [
    { tenantId: 'T1', date: '2026-11-10', currency: 'TRY', casinoGgr: 10000, sportsGgrRealized: 0 },
    { tenantId: 'T1', date: '2026-11-20', currency: 'TRY', casinoGgr: 10000, sportsGgrRealized: 0 },
  ];

  const result = calculateCommissionForPeriod({ partner, links, stats, feePlans: [] });
  assert.equal(result.TRY.lines[0].rate, 0.10);
  assert.equal(result.TRY.lines[0].amount, 1000.00);
  assert.equal(result.TRY.lines[1].rate, 0.20);
  assert.equal(result.TRY.lines[1].amount, 2000.00);
  assert.equal(result.TRY.grossAmount, 3000.00);
});

test('calculateCommissionForPeriod isolates currencies strictly', () => {
  const partner = { _id: 'P1' };
  const links = [
    { partnerId: 'P1', tenantId: 'T1', validFrom: new Date('2026-11-01'), validTo: null, commercialTerms: { model: 'revshare_ggr', rate: 0.15, currency: 'TRY' } },
    { partnerId: 'P1', tenantId: 'T2', validFrom: new Date('2026-11-01'), validTo: null, commercialTerms: { model: 'revshare_ggr', rate: 0.10, currency: 'EUR' } },
  ];
  const stats = [
    { tenantId: 'T1', date: '2026-11-01', currency: 'TRY', casinoGgr: 10000, sportsGgrRealized: 0 },
    { tenantId: 'T2', date: '2026-11-01', currency: 'EUR', casinoGgr: 5000, sportsGgrRealized: 0 },
  ];

  const result = calculateCommissionForPeriod({ partner, links, stats, feePlans: [] });
  assert.ok(result.TRY);
  assert.ok(result.EUR);
  assert.equal(result.TRY.grossAmount, 1500.00);
  assert.equal(result.EUR.grossAmount, 500.00);
});

test('calculateCommissionForPeriod rejects revshare_ngr with ERR_NGR_NOT_IMPLEMENTED', () => {
  const partner = { _id: 'P1' };
  const links = [{
    partnerId: 'P1',
    tenantId: 'T1',
    validFrom: new Date('2026-11-01'),
    validTo: null,
    commercialTerms: { model: 'revshare_ngr', rate: 0.15, currency: 'TRY' },
  }];
  const stats = [{ tenantId: 'T1', date: '2026-11-01', currency: 'TRY', casinoGgr: 1000, sportsGgrRealized: 0 }];

  assert.throws(
    () => calculateCommissionForPeriod({ partner, links, stats, feePlans: [] }),
    (err) => err.code === 'ERR_NGR_NOT_IMPLEMENTED'
  );
});

test('calculateCommissionForPeriod handles negative GGR with zero_floor and deduct strategies', () => {
  const partner = { _id: 'P1' };
  const linksZeroFloor = [{
    partnerId: 'P1',
    tenantId: 'T1',
    validFrom: new Date('2026-11-01'),
    validTo: null,
    commercialTerms: { model: 'revshare_ggr', rate: 0.15, currency: 'TRY', negativeGgrHandling: 'zero_floor' },
  }];
  const stats = [{ tenantId: 'T1', date: '2026-11-01', currency: 'TRY', casinoGgr: -5000, sportsGgrRealized: 0 }];

  const resFloor = calculateCommissionForPeriod({ partner, links: linksZeroFloor, stats, feePlans: [] });
  assert.equal(resFloor.TRY.lines[0].amount, 0.00);

  const linksDeduct = [{
    partnerId: 'P1',
    tenantId: 'T1',
    validFrom: new Date('2026-11-01'),
    validTo: null,
    commercialTerms: { model: 'revshare_ggr', rate: 0.15, currency: 'TRY', negativeGgrHandling: 'deduct' },
  }];
  const resDeduct = calculateCommissionForPeriod({ partner, links: linksDeduct, stats, feePlans: [] });
  assert.equal(resDeduct.TRY.lines[0].amount, -750.00);
});

test('calculateCommissionForPeriod computes K20 sportsbook odds feed fees', () => {
  const partner = { _id: 'P1' };
  const links = [{
    partnerId: 'P1',
    tenantId: 'T1',
    validFrom: new Date('2026-11-01'),
    validTo: null,
    commercialTerms: { model: 'revshare_ggr', rate: 0.15, currency: 'TRY' },
  }];
  const feePlans = [{
    tenantId: 'T1',
    validFrom: new Date('2026-11-01'),
    validTo: null,
    sportsbookFee: { model: 'both', fixedMonthlyFee: 1000, turnoverRate: 0.02, currency: 'TRY' },
  }];
  const stats = [
    { tenantId: 'T1', date: '2026-11-01', currency: 'TRY', casinoGgr: 10000, sportsGgrRealized: 2000, sportsTurnover: 50000 },
  ];

  const result = calculateCommissionForPeriod({ partner, links, stats, feePlans });
  const lines = result.TRY.lines;
  const sportsLine = lines.find((l) => l.type === 'sportsbook_fee');
  assert.ok(sportsLine);
  assert.equal(sportsLine.amount, 1000.00); // 50000 * 0.02 = 1000 turnover fee
});
```

- [ ] **Step 2: Implement commission calculator**:

Create `server/src/platform/services/commissionCalculator.js`:
```javascript
/**
 * Monetary rounding helper: half-up to 2 decimal places.
 */
export function roundMoney(value, decimals = 2) {
  const factor = 10 ** decimals;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return Number(rounded.toFixed(decimals));
}

/**
 * Resolve link active on a specific day (validFrom inclusive, validTo exclusive).
 */
export function findActiveLink(links, tenantId, dateStr) {
  const dayStart = new Date(`${dateStr}T00:00:00.000Z`).getTime();
  const dayEnd = dayStart + 86400000;

  return links.find((link) => {
    if (String(link.tenantId) !== String(tenantId)) return false;
    const from = new Date(link.validFrom).getTime();
    const to = link.validTo ? new Date(link.validTo).getTime() : null;
    return from < dayEnd && (to === null || to > dayStart);
  });
}

/**
 * Resolve fee plan active on a specific day.
 */
export function findActiveFeePlan(feePlans, tenantId, dateStr) {
  const dayStart = new Date(`${dateStr}T00:00:00.000Z`).getTime();
  const dayEnd = dayStart + 86400000;

  return feePlans.find((plan) => {
    if (String(plan.tenantId) !== String(tenantId)) return false;
    const from = new Date(plan.validFrom).getTime();
    const to = plan.validTo ? new Date(plan.validTo).getTime() : null;
    return from < dayEnd && (to === null || to > dayStart);
  });
}

/**
 * Calculate commission and fees for a set of TenantDailyStat entries.
 * Pure function: never mutates inputs or performs database calls.
 */
export function calculateCommissionForPeriod({ partner, links, stats, feePlans = [] }) {
  const byCurrency = {};

  for (const stat of stats) {
    const currency = stat.currency || 'TRY';
    if (!byCurrency[currency]) {
      byCurrency[currency] = {
        currency,
        lines: [],
        grossAmount: 0,
        netAmount: 0,
      };
    }

    const link = findActiveLink(links, stat.tenantId, stat.date);
    const terms = link?.commercialTerms || partner?.defaultCommercialTerms || { model: 'revshare_ggr', rate: 0.15 };

    if (terms.model === 'revshare_ngr') {
      const err = new Error('NGR calculation is not yet implemented; only GGR is supported in this version.');
      err.code = 'ERR_NGR_NOT_IMPLEMENTED';
      throw err;
    }

    // 1. Commission line calculation
    if (terms.model === 'revshare_ggr') {
      const dayGgr = (stat.casinoGgr || 0) + (stat.sportsGgrRealized || 0);
      const rate = terms.rate ?? 0.15;
      let effectiveGgr = dayGgr;

      if (dayGgr < 0) {
        const handling = terms.negativeGgrHandling || 'zero_floor';
        if (handling === 'zero_floor') {
          effectiveGgr = 0;
        }
      }

      const commission = roundMoney(effectiveGgr * rate);

      byCurrency[currency].lines.push({
        tenantId: stat.tenantId,
        linkId: link?._id || null,
        type: 'commission',
        date: stat.date,
        currency,
        baseMetric: 'ggr',
        baseAmount: dayGgr,
        rate,
        amount: commission,
        description: `${rate * 100}% GGR Commission for ${stat.date}`,
        metadata: {
          casinoGgr: stat.casinoGgr || 0,
          sportsGgrRealized: stat.sportsGgrRealized || 0,
          negativeGgrHandling: terms.negativeGgrHandling || 'zero_floor',
        },
      });

      byCurrency[currency].grossAmount = roundMoney(byCurrency[currency].grossAmount + commission);
    } else if (terms.model === 'turnover') {
      const dayTurnover = (stat.casinoTurnover || 0) + (stat.sportsTurnover || 0);
      const rate = terms.rate ?? 0.05;
      const commission = roundMoney(dayTurnover * rate);

      byCurrency[currency].lines.push({
        tenantId: stat.tenantId,
        linkId: link?._id || null,
        type: 'commission',
        date: stat.date,
        currency,
        baseMetric: 'turnover',
        baseAmount: dayTurnover,
        rate,
        amount: commission,
        description: `${rate * 100}% Turnover Commission for ${stat.date}`,
      });

      byCurrency[currency].grossAmount = roundMoney(byCurrency[currency].grossAmount + commission);
    }

    // 2. K20 Sportsbook odds feed fee calculation
    const feePlan = findActiveFeePlan(feePlans, stat.tenantId, stat.date);
    if (feePlan?.sportsbookFee && feePlan.sportsbookFee.model !== 'none') {
      const sb = feePlan.sportsbookFee;
      if (sb.model === 'turnover_percentage' || sb.model === 'both') {
        const sportsTurnover = stat.sportsTurnover || 0;
        const rate = sb.turnoverRate || 0;
        const feeAmount = roundMoney(sportsTurnover * rate);

        if (feeAmount > 0) {
          byCurrency[currency].lines.push({
            tenantId: stat.tenantId,
            type: 'sportsbook_fee',
            date: stat.date,
            currency,
            baseMetric: 'turnover',
            baseAmount: sportsTurnover,
            rate,
            amount: feeAmount,
            description: `Sportsbook Odds Feed Fee (${rate * 100}%) for ${stat.date}`,
          });
        }
      }
    }
  }

  // Calculate net amount for each currency
  for (const curr of Object.keys(byCurrency)) {
    const group = byCurrency[curr];
    group.netAmount = group.grossAmount;
  }

  return byCurrency;
}
```

- [ ] **Step 3: Run the test suite**:
```bash
node --test --test-timeout=60000 server/test/commissionCalculator.test.js
```

- [ ] **Step 4: Commit task changes**:
```bash
git add server/src/platform/services/commissionCalculator.js server/test/commissionCalculator.test.js
git commit -m "feat(billing): add pure commission and sportsbook fee calculator engine"
```

---

### Task 3: Statement Generation Service & Tenancy Lint (Repository: core)

**Files:**
- Create: `server/src/platform/services/billingService.js`
- Modify: `scripts/lint-tenancy.mjs`
- Create: `server/test/billingService.test.js`

**Interfaces:**
- Consumes: `PartnerStatement`, `StatementLine`, `TenantDailyStat`, `PartnerOperatorLink`, `OperatorFeePlan`, `Partner`, `calculateCommissionForPeriod`, `writePlatformLevelAudit`, `runAsPlatform`.
- Produces: `generatePartnerStatements`, `issueStatement`, `addStatementAdjustment`, `voidStatement`, and `exportStatementCsv` services.

- [ ] **Step 1: Write failing tests** in `server/test/billingService.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  generatePartnerStatements,
  issueStatement,
  addStatementAdjustment,
  voidStatement,
} from '../src/platform/services/billingService.js';
import PartnerStatement from '../src/models/PartnerStatement.js';
import StatementLine from '../src/models/StatementLine.js';
import TenantDailyStat from '../src/models/TenantDailyStat.js';
import Partner from '../src/models/Partner.js';
import PartnerOperatorLink from '../src/models/PartnerOperatorLink.js';
import Tenant from '../src/models/Tenant.js';
import StaffAccount from '../src/models/StaffAccount.js';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9c_t3';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('generatePartnerStatements generates draft statements and is idempotent', async () => {
  const staff = await StaffAccount.create({ email: 'gen@example.com', username: 'gen', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'gen-p1', name: 'Gen Partner', createdBy: staff._id });
  const tenant = await Tenant.create({ key: 'gen-t1', name: 'Gen Tenant' });

  await PartnerOperatorLink.create({
    partnerId: partner._id,
    tenantId: tenant._id,
    validFrom: new Date('2026-11-01T00:00:00.000Z'),
    validTo: null,
    commercialTerms: { model: 'revshare_ggr', rate: 0.20, currency: 'TRY' },
    createdBy: staff._id,
  });

  await TenantDailyStat.create({
    tenantId: tenant._id,
    date: '2026-11-05',
    currency: 'TRY',
    casinoGgr: 10000,
    sportsGgrRealized: 5000,
  });

  // First run creates draft statement
  const [stmt1] = await generatePartnerStatements({
    partnerId: partner._id,
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    staffId: staff._id,
  });

  assert.ok(stmt1);
  assert.equal(stmt1.status, 'draft');
  assert.equal(stmt1.grossAmount, 3000.00); // 15000 * 0.20
  assert.equal(stmt1.netAmount, 3000.00);

  // Idempotent rerun for open draft updates lines
  const [stmt2] = await generatePartnerStatements({
    partnerId: partner._id,
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    staffId: staff._id,
  });

  assert.equal(String(stmt1._id), String(stmt2._id));
  assert.equal(stmt2.grossAmount, 3000.00);
});

test('issueStatement locks statement and prevents regeneration or direct edits', async () => {
  const staff = await StaffAccount.create({ email: 'issue@example.com', username: 'issue', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'issue-p', name: 'Issue Partner', createdBy: staff._id });

  const stmt = await PartnerStatement.create({
    statementNumber: 'STMT-2026-11-ISSUE-TRY',
    partnerId: partner._id,
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    currency: 'TRY',
    status: 'draft',
    grossAmount: 5000,
    netAmount: 5000,
    finalAmount: 5000,
    createdBy: staff._id,
  });

  const issued = await issueStatement({ statementId: stmt._id, staffId: staff._id });
  assert.equal(issued.status, 'issued');
  assert.ok(issued.issuedAt);

  // Re-running generation fails because statement is already issued
  await assert.rejects(
    () => generatePartnerStatements({
      partnerId: partner._id,
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      staffId: staff._id,
    }),
    (err) => err.code === 'ERR_STATEMENT_ALREADY_ISSUED'
  );
});

test('addStatementAdjustment appends line and updates netAmount on issued statement', async () => {
  const staff = await StaffAccount.create({ email: 'adj@example.com', username: 'adj', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'adj-p', name: 'Adj Partner', createdBy: staff._id });

  const stmt = await PartnerStatement.create({
    statementNumber: 'STMT-2026-11-ADJ-TRY',
    partnerId: partner._id,
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    currency: 'TRY',
    status: 'issued',
    grossAmount: 10000,
    adjustmentsAmount: 0,
    netAmount: 10000,
    finalAmount: 10000,
    issuedAt: new Date(),
    createdBy: staff._id,
  });

  const updated = await addStatementAdjustment({
    statementId: stmt._id,
    amount: -500,
    description: 'Promotional credit adjustment',
    reason: 'Approved manual claim',
    staffId: staff._id,
  });

  assert.equal(updated.adjustmentsAmount, -500);
  assert.equal(updated.netAmount, 9500);
  assert.equal(updated.finalAmount, 9500);

  const lines = await StatementLine.find({ statementId: stmt._id });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].amount, -500);
});
```

- [ ] **Step 2: Implement billing service**:

Create `server/src/platform/services/billingService.js`:
```javascript
import PartnerStatement from '../../models/PartnerStatement.js';
import StatementLine from '../../models/StatementLine.js';
import TenantDailyStat from '../../models/TenantDailyStat.js';
import PartnerOperatorLink from '../../models/PartnerOperatorLink.js';
import OperatorFeePlan from '../../models/OperatorFeePlan.js';
import Partner from '../../models/Partner.js';
import { runAsPlatform } from '../../tenancy/context.js';
import { calculateCommissionForPeriod, roundMoney } from './commissionCalculator.js';
import { writePlatformLevelAudit } from './platformAudit.js';

export async function generatePartnerStatements({ partnerId, periodStart, periodEnd, staffId, req }) {
  return runAsPlatform('billing-statement-generation', async () => {
    const partner = await Partner.findById(partnerId);
    if (!partner) {
      const err = new Error('Partner not found');
      err.code = 'NOT_FOUND';
      throw err;
    }

    // Check if any statement for this period is already issued
    const issuedExisting = await PartnerStatement.findOne({
      partnerId,
      periodStart,
      periodEnd,
      status: { $in: ['issued', 'settled'] },
    });
    if (issuedExisting) {
      const err = new Error('Statement for this period has already been issued and is immutable.');
      err.code = 'ERR_STATEMENT_ALREADY_ISSUED';
      throw err;
    }

    const links = await PartnerOperatorLink.find({ partnerId }).lean();
    const tenantIds = links.map((l) => l.tenantId);

    const stats = await TenantDailyStat.find({
      tenantId: { $in: tenantIds },
      date: { $gte: periodStart, $lte: periodEnd },
    }).lean();

    const feePlans = await OperatorFeePlan.find({ tenantId: { $in: tenantIds } }).lean();

    const calculationsByCurrency = calculateCommissionForPeriod({ partner, links, stats, feePlans });
    const statements = [];

    for (const [currency, data] of Object.entries(calculationsByCurrency)) {
      const statementNumber = `STMT-${periodStart.slice(0, 7)}-${partner.key.toUpperCase()}-${currency}`;

      let statement = await PartnerStatement.findOne({
        partnerId,
        periodStart,
        periodEnd,
        currency,
        status: 'draft',
      });

      if (!statement) {
        statement = new PartnerStatement({
          statementNumber,
          partnerId,
          periodStart,
          periodEnd,
          currency,
          status: 'draft',
          createdBy: staffId,
        });
      }

      statement.grossAmount = data.grossAmount;
      statement.netAmount = roundMoney(data.grossAmount + (statement.adjustmentsAmount || 0));
      statement.finalAmount = statement.netAmount;
      statement.linesCount = data.lines.length;
      await statement.save();

      // Clear existing draft lines and insert new ones
      await StatementLine.deleteMany({ statementId: statement._id, type: { $ne: 'adjustment' } });

      const linesToInsert = data.lines.map((line) => ({
        ...line,
        statementId: statement._id,
        partnerId,
      }));

      if (linesToInsert.length > 0) {
        await StatementLine.insertMany(linesToInsert);
      }

      statements.push(statement);
    }

    if (req) {
      await writePlatformLevelAudit(req, 'billing:statement:generate', {
        targetType: 'partner',
        targetId: String(partnerId),
        metadata: { periodStart, periodEnd, count: statements.length },
      });
    }

    return statements;
  });
}

export async function issueStatement({ statementId, staffId, req }) {
  const statement = await PartnerStatement.findById(statementId);
  if (!statement) {
    const err = new Error('Statement not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (statement.status !== 'draft') {
    const err = new Error('Only draft statements can be issued');
    err.code = 'ERR_INVALID_STATUS';
    throw err;
  }

  statement.status = 'issued';
  statement.issuedAt = new Date();
  statement.issuedBy = staffId;
  await statement.save();

  if (req) {
    await writePlatformLevelAudit(req, 'billing:statement:issue', {
      targetType: 'partner_statement',
      targetId: String(statementId),
      metadata: { statementNumber: statement.statementNumber, netAmount: statement.netAmount },
    });
  }

  return statement;
}

export async function addStatementAdjustment({ statementId, amount, description, reason, staffId, req }) {
  const statement = await PartnerStatement.findById(statementId);
  if (!statement) {
    const err = new Error('Statement not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (statement.status === 'voided') {
    const err = new Error('Cannot add adjustments to voided statement');
    err.code = 'ERR_STATEMENT_VOIDED';
    throw err;
  }

  const adjLine = await StatementLine.create({
    statementId: statement._id,
    partnerId: statement.partnerId,
    type: 'adjustment',
    currency: statement.currency,
    baseMetric: 'manual',
    baseAmount: 0,
    rate: 0,
    amount: roundMoney(amount),
    description,
    reason,
    createdBy: staffId,
  });

  statement.adjustmentsAmount = roundMoney(statement.adjustmentsAmount + adjLine.amount);
  statement.netAmount = roundMoney(statement.grossAmount + statement.adjustmentsAmount);
  statement.finalAmount = statement.netAmount;
  statement.linesCount += 1;
  await statement.save();

  if (req) {
    await writePlatformLevelAudit(req, 'billing:statement:adjust', {
      targetType: 'partner_statement',
      targetId: String(statementId),
      reason,
      metadata: { adjustmentAmount: adjLine.amount, netAmount: statement.netAmount },
    });
  }

  return statement;
}

export async function voidStatement({ statementId, reason, staffId, req }) {
  const statement = await PartnerStatement.findById(statementId);
  if (!statement) {
    const err = new Error('Statement not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  statement.status = 'voided';
  statement.voidedAt = new Date();
  statement.voidedBy = staffId;
  statement.voidReason = reason;
  await statement.save();

  if (req) {
    await writePlatformLevelAudit(req, 'billing:statement:void', {
      targetType: 'partner_statement',
      targetId: String(statementId),
      reason,
      metadata: { statementNumber: statement.statementNumber },
    });
  }

  return statement;
}
```

Modify `scripts/lint-tenancy.mjs`:
Add `'server/src/platform/services/billingService.js'` to `RUN_AS_PLATFORM_ALLOWLIST`.

- [ ] **Step 3: Run the test suite and tenancy linter**:
```bash
node --test --test-timeout=60000 server/test/billingService.test.js
node scripts/lint-tenancy.mjs
```

- [ ] **Step 4: Commit task changes**:
```bash
git add server/src/platform/services/billingService.js scripts/lint-tenancy.mjs server/test/billingService.test.js
git commit -m "feat(billing): add billing statement generation service and update tenancy lint allowlist"
```

---

### Task 4: Platform Billing API (Plans, Statements, Adjustments, CSV Export) (Repository: core)

**Files:**
- Create: `server/src/platform/controllers/platformBillingController.js`
- Modify: `server/src/platform/routes/index.js`
- Create: `server/test/platformBillingApi.test.js`

**Interfaces:**
- Consumes: `billingService`, `OperatorFeePlan`, `PartnerStatement`, `StatementLine`, `requireStaff('platform')`, `requireStaffPermission`.
- Produces: Express routes mounted under `/api/platform/billing/*` for fee plans, statement generation, status updates, adjustments, and CSV download.

- [ ] **Step 1: Write failing tests** in `server/test/platformBillingApi.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { createPlatformRouter } from '../src/platform/routes/index.js';
import { errorHandler } from '../src/middleware/error.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import Partner from '../src/models/Partner.js';
import Tenant from '../src/models/Tenant.js';
import { signStaffAccess } from '../src/services/staffSession.js';

process.env.JWT_SECRET ||= 'test-jwt-secret';
process.env.JWT_STAFF_SECRET ||= 'test-jwt-staff-secret';
process.env.TENANCY_MODE = 'multi';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9c_t4';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/platform', createPlatformRouter());
  app.use(errorHandler);
  const server = app.listen(0);
  const port = server.address().port;
  return { server, base: `http://127.0.0.1:${port}` };
}

test('POST /api/platform/billing/plans creates and updates K20 fee plan', async () => {
  const staff = await StaffAccount.create({ email: 'powner@example.com', username: 'powner', password: 'pwd', status: 'active' });
  const role = await Role.create({ name: 'platform_owner', displayName: 'Owner', scopeType: 'platform', scopeId: null });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'platform', scopeId: null });
  const tenant = await Tenant.create({ key: 'plan-tenant', name: 'Plan Tenant' });

  const token = signStaffAccess(staff, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });
  const { server, base } = await createServer();

  try {
    const res = await fetch(`${base}/api/platform/billing/plans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        tenantId: tenant._id,
        sportsbookFee: { model: 'both', fixedMonthlyFee: 2000, turnoverRate: 0.015, currency: 'TRY' },
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.sportsbookFee.model, 'both');
    assert.equal(body.sportsbookFee.fixedMonthlyFee, 2000);
  } finally {
    server.close();
  }
});

test('POST /api/platform/billing/statements/generate triggers generation', async () => {
  const staff = await StaffAccount.create({ email: 'pfinance@example.com', username: 'pfinance', password: 'pwd', status: 'active' });
  const role = await Role.create({ name: 'platform_finance', displayName: 'Finance', scopeType: 'platform', scopeId: null });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'platform', scopeId: null });
  const partner = await Partner.create({ key: 'api-partner', name: 'API Partner', createdBy: staff._id });

  const token = signStaffAccess(staff, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });
  const { server, base } = await createServer();

  try {
    const res = await fetch(`${base}/api/platform/billing/statements/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        partnerId: partner._id,
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.statements));
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Implement platform billing controller and routes**:

Create `server/src/platform/controllers/platformBillingController.js`:
```javascript
import OperatorFeePlan from '../../models/OperatorFeePlan.js';
import PartnerStatement from '../../models/PartnerStatement.js';
import StatementLine from '../../models/StatementLine.js';
import {
  generatePartnerStatements,
  issueStatement,
  addStatementAdjustment,
  voidStatement,
} from '../services/billingService.js';
import { writePlatformLevelAudit } from '../services/platformAudit.js';

export async function listOperatorFeePlans(req, res, next) {
  try {
    const plans = await OperatorFeePlan.find({ validTo: null }).populate('tenantId', 'key name').lean();
    res.json({ plans });
  } catch (err) {
    next(err);
  }
}

export async function createOrUpdateFeePlan(req, res, next) {
  try {
    const { tenantId, sportsbookFee, platformFee, notes } = req.body;
    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

    // Close any active fee plan for this tenant
    await OperatorFeePlan.updateMany(
      { tenantId, validTo: null },
      { validTo: new Date(), endedBy: req.staff.id }
    );

    const plan = await OperatorFeePlan.create({
      tenantId,
      sportsbookFee,
      platformFee,
      notes,
      createdBy: req.staff.id,
    });

    await writePlatformLevelAudit(req, 'billing:fee_plan:create', {
      targetType: 'operator_fee_plan',
      targetId: String(plan._id),
      metadata: { tenantId, sportsbookFee },
    });

    res.status(201).json(plan);
  } catch (err) {
    next(err);
  }
}

export async function listStatements(req, res, next) {
  try {
    const { partnerId, status, period } = req.query;
    const filter = {};
    if (partnerId) filter.partnerId = partnerId;
    if (status) filter.status = status;
    if (period) {
      filter.periodStart = { $regex: `^${period}` };
    }

    const statements = await PartnerStatement.find(filter)
      .populate('partnerId', 'key name')
      .sort({ periodStart: -1, createdAt: -1 })
      .lean();

    res.json({ statements });
  } catch (err) {
    next(err);
  }
}

export async function getStatement(req, res, next) {
  try {
    const statement = await PartnerStatement.findById(req.params.id)
      .populate('partnerId', 'key name')
      .lean();
    if (!statement) return res.status(404).json({ error: 'Statement not found' });

    const lines = await StatementLine.find({ statementId: statement._id })
      .populate('tenantId', 'key name')
      .sort({ date: 1, type: 1 })
      .lean();

    res.json({ statement, lines });
  } catch (err) {
    next(err);
  }
}

export async function generateStatementsHandler(req, res, next) {
  try {
    const { partnerId, periodStart, periodEnd } = req.body;
    if (!partnerId || !periodStart || !periodEnd) {
      return res.status(400).json({ error: 'partnerId, periodStart, and periodEnd are required' });
    }

    const statements = await generatePartnerStatements({
      partnerId,
      periodStart,
      periodEnd,
      staffId: req.staff.id,
      req,
    });

    res.json({ statements });
  } catch (err) {
    next(err);
  }
}

export async function issueStatementHandler(req, res, next) {
  try {
    const statement = await issueStatement({
      statementId: req.params.id,
      staffId: req.staff.id,
      req,
    });
    res.json({ statement });
  } catch (err) {
    next(err);
  }
}

export async function addAdjustmentHandler(req, res, next) {
  try {
    const { amount, description, reason } = req.body;
    if (amount === undefined || !description) {
      return res.status(400).json({ error: 'amount and description are required' });
    }

    const statement = await addStatementAdjustment({
      statementId: req.params.id,
      amount,
      description,
      reason,
      staffId: req.staff.id,
      req,
    });

    res.json({ statement });
  } catch (err) {
    next(err);
  }
}

export async function voidStatementHandler(req, res, next) {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'reason is required' });

    const statement = await voidStatement({
      statementId: req.params.id,
      reason,
      staffId: req.staff.id,
      req,
    });

    res.json({ statement });
  } catch (err) {
    next(err);
  }
}

export async function exportStatementCsvHandler(req, res, next) {
  try {
    const statement = await PartnerStatement.findById(req.params.id).lean();
    if (!statement) return res.status(404).json({ error: 'Statement not found' });

    const lines = await StatementLine.find({ statementId: statement._id }).lean();

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${statement.statementNumber}.csv"`);

    res.write('Date,Type,Tenant,Description,Base Amount,Rate,Amount,Currency\n');
    for (const line of lines) {
      res.write(
        `"${line.date || ''}","${line.type}","${line.tenantId || ''}","${line.description.replace(/"/g, '""')}",${line.baseAmount || 0},${line.rate || 0},${line.amount},"${line.currency}"\n`
      );
    }
    res.end();
  } catch (err) {
    next(err);
  }
}
```

Modify `server/src/platform/routes/index.js`:
Mount billing routes:
```javascript
  const BILLING_READ = 'platform:billing:read';
  const BILLING_MANAGE = 'platform:billing:manage';

  router.get('/billing/plans', requireStaffPermission(BILLING_READ), listOperatorFeePlans);
  router.post('/billing/plans', requireStaffPermission(BILLING_MANAGE), createOrUpdateFeePlan);
  router.get('/billing/statements', requireStaffPermission(BILLING_READ), listStatements);
  router.get('/billing/statements/:id', requireStaffPermission(BILLING_READ), getStatement);
  router.post('/billing/statements/generate', requireStaffPermission(BILLING_MANAGE), generateStatementsHandler);
  router.post('/billing/statements/:id/issue', requireStaffPermission(BILLING_MANAGE), issueStatementHandler);
  router.post('/billing/statements/:id/adjustments', requireStaffPermission(BILLING_MANAGE), addAdjustmentHandler);
  router.post('/billing/statements/:id/void', requireStaffPermission(BILLING_MANAGE), voidStatementHandler);
  router.get('/billing/statements/:id/export', requireStaffPermission(BILLING_READ), exportStatementCsvHandler);
```

- [ ] **Step 3: Run the test suite**:
```bash
node --test --test-timeout=60000 server/test/platformBillingApi.test.js
```

- [ ] **Step 4: Commit task changes**:
```bash
git add server/src/platform/controllers/platformBillingController.js server/src/platform/routes/index.js server/test/platformBillingApi.test.js
git commit -m "feat(billing): add platform billing controllers, routes, and CSV export"
```

---

### Task 5: Cross-Tenant Platform Reports Engine & API (Repository: core)

**Files:**
- Create: `server/src/platform/services/platformReportsService.js`
- Create: `server/src/platform/controllers/platformReportsController.js`
- Modify: `server/src/platform/routes/index.js`
- Create: `server/test/platformReportsApi.test.js`

**Interfaces:**
- Consumes: `TenantDailyStat`, `OperatorFeePlan`, `PartnerStatement`, `PartnerOperatorLink`, `runAsPlatform`.
- Produces: `getCrossTenantPerformanceReport`, `getSportsbookOddsReport`, and `getPartnerCommercialBalancesReport` services and endpoints.

- [ ] **Step 1: Write failing tests** in `server/test/platformReportsApi.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { createPlatformRouter } from '../src/platform/routes/index.js';
import { errorHandler } from '../src/middleware/error.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import TenantDailyStat from '../src/models/TenantDailyStat.js';
import Tenant from '../src/models/Tenant.js';
import { signStaffAccess } from '../src/services/staffSession.js';

process.env.JWT_SECRET ||= 'test-jwt-secret';
process.env.JWT_STAFF_SECRET ||= 'test-jwt-staff-secret';
process.env.TENANCY_MODE = 'multi';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9c_t5';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/platform', createPlatformRouter());
  app.use(errorHandler);
  const server = app.listen(0);
  const port = server.address().port;
  return { server, base: `http://127.0.0.1:${port}` };
}

test('GET /api/platform/reports/cross-tenant aggregates portfolio performance across operators', async () => {
  const staff = await StaffAccount.create({ email: 'repstaff@example.com', username: 'repstaff', password: 'pwd', status: 'active' });
  const role = await Role.create({ name: 'platform_owner', displayName: 'Owner', scopeType: 'platform', scopeId: null });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'platform', scopeId: null });

  const t1 = await Tenant.create({ key: 'rep-t1', name: 'Rep T1' });
  const t2 = await Tenant.create({ key: 'rep-t2', name: 'Rep T2' });

  await TenantDailyStat.create({
    tenantId: t1._id,
    date: '2026-11-01',
    currency: 'TRY',
    casinoTurnover: 50000,
    casinoGgr: 10000,
    sportsTurnover: 20000,
    sportsGgrRealized: 4000,
  });

  await TenantDailyStat.create({
    tenantId: t2._id,
    date: '2026-11-01',
    currency: 'TRY',
    casinoTurnover: 30000,
    casinoGgr: 6000,
    sportsTurnover: 10000,
    sportsGgrRealized: 2000,
  });

  const token = signStaffAccess(staff, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });
  const { server, base } = await createServer();

  try {
    const res = await fetch(`${base}/api/platform/reports/cross-tenant?from=2026-11-01&to=2026-11-30&groupBy=tenant`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.report.length, 2);
    assert.equal(body.totals.casinoTurnover, 80000);
    assert.equal(body.totals.totalGgr, 22000); // 14000 + 8000
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Implement platform reports service and controller**:

Create `server/src/platform/services/platformReportsService.js`:
```javascript
import TenantDailyStat from '../../models/TenantDailyStat.js';
import OperatorFeePlan from '../../models/OperatorFeePlan.js';
import PartnerStatement from '../../models/PartnerStatement.js';
import Tenant from '../../models/Tenant.js';
import Partner from '../../models/Partner.js';

export async function getCrossTenantPerformanceReport({ from, to, groupBy = 'tenant', currency = 'TRY' }) {
  const match = { date: { $gte: from, $lte: to }, currency };
  const stats = await TenantDailyStat.find(match).populate('tenantId', 'key name').lean();

  const grouped = {};
  let totals = {
    casinoTurnover: 0,
    casinoGgr: 0,
    sportsTurnover: 0,
    sportsGgrRealized: 0,
    totalGgr: 0,
  };

  for (const s of stats) {
    const key = groupBy === 'day' ? s.date : (s.tenantId?.key || String(s.tenantId));
    if (!grouped[key]) {
      grouped[key] = {
        key,
        name: s.tenantId?.name || key,
        casinoTurnover: 0,
        casinoGgr: 0,
        sportsTurnover: 0,
        sportsGgrRealized: 0,
        totalGgr: 0,
        activePlayers: 0,
      };
    }

    const item = grouped[key];
    item.casinoTurnover += s.casinoTurnover || 0;
    item.casinoGgr += s.casinoGgr || 0;
    item.sportsTurnover += s.sportsTurnover || 0;
    item.sportsGgrRealized += s.sportsGgrRealized || 0;
    item.totalGgr += (s.casinoGgr || 0) + (s.sportsGgrRealized || 0);
    item.activePlayers += s.activePlayers || 0;

    totals.casinoTurnover += s.casinoTurnover || 0;
    totals.casinoGgr += s.casinoGgr || 0;
    totals.sportsTurnover += s.sportsTurnover || 0;
    totals.sportsGgrRealized += s.sportsGgrRealized || 0;
    totals.totalGgr += (s.casinoGgr || 0) + (s.sportsGgrRealized || 0);
  }

  return { report: Object.values(grouped), totals, currency, period: { from, to } };
}

export async function getSportsbookOddsReport({ from, to, currency = 'TRY' }) {
  const stats = await TenantDailyStat.find({ date: { $gte: from, $lte: to }, currency })
    .populate('tenantId', 'key name')
    .lean();

  const feePlans = await OperatorFeePlan.find({ validTo: null }).lean();
  const feeMap = new Map(feePlans.map((fp) => [String(fp.tenantId), fp]));

  const byTenant = {};
  for (const s of stats) {
    const tid = String(s.tenantId?._id || s.tenantId);
    if (!byTenant[tid]) {
      byTenant[tid] = {
        tenantKey: s.tenantId?.key || tid,
        tenantName: s.tenantId?.name || tid,
        sportsTurnover: 0,
        sportsGgr: 0,
        fixedFee: feeMap.get(tid)?.sportsbookFee?.fixedMonthlyFee || 0,
        turnoverRate: feeMap.get(tid)?.sportsbookFee?.turnoverRate || 0,
        turnoverFee: 0,
      };
    }
    byTenant[tid].sportsTurnover += s.sportsTurnover || 0;
    byTenant[tid].sportsGgr += s.sportsGgrRealized || 0;
  }

  for (const item of Object.values(byTenant)) {
    item.turnoverFee = Number((item.sportsTurnover * item.turnoverRate).toFixed(2));
    item.totalFee = Number((item.fixedFee + item.turnoverFee).toFixed(2));
  }

  return { report: Object.values(byTenant), currency, period: { from, to } };
}
```

Create `server/src/platform/controllers/platformReportsController.js`:
```javascript
import {
  getCrossTenantPerformanceReport,
  getSportsbookOddsReport,
} from '../services/platformReportsService.js';

export async function getCrossTenantReportHandler(req, res, next) {
  try {
    const { from, to, groupBy, currency } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' });

    const data = await getCrossTenantPerformanceReport({ from, to, groupBy, currency });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getSportsbookReportHandler(req, res, next) {
  try {
    const { from, to, currency } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' });

    const data = await getSportsbookOddsReport({ from, to, currency });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function exportCrossTenantCsvHandler(req, res, next) {
  try {
    const { from, to, groupBy, currency } = req.query;
    const { report } = await getCrossTenantPerformanceReport({ from, to, groupBy, currency });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="cross_tenant_report_${from}_${to}.csv"`);

    res.write('Identifier,Name,Casino Turnover,Casino GGR,Sports Turnover,Sports GGR,Total GGR\n');
    for (const r of report) {
      res.write(
        `"${r.key}","${(r.name || '').replace(/"/g, '""')}",${r.casinoTurnover},${r.casinoGgr},${r.sportsTurnover},${r.sportsGgrRealized},${r.totalGgr}\n`
      );
    }
    res.end();
  } catch (err) {
    next(err);
  }
}
```

Modify `server/src/platform/routes/index.js`:
Mount report routes guarded by `platform:reports:read`:
```javascript
  const REPORTS_READ = 'platform:reports:read';

  router.get('/reports/cross-tenant', requireStaffPermission(REPORTS_READ), getCrossTenantReportHandler);
  router.get('/reports/sportsbook-odds', requireStaffPermission(REPORTS_READ), getSportsbookReportHandler);
  router.get('/reports/cross-tenant/export', requireStaffPermission(REPORTS_READ), exportCrossTenantCsvHandler);
```

- [ ] **Step 3: Run the test suite**:
```bash
node --test --test-timeout=60000 server/test/platformReportsApi.test.js
```

- [ ] **Step 4: Commit task changes**:
```bash
git add server/src/platform/services/platformReportsService.js server/src/platform/controllers/platformReportsController.js server/src/platform/routes/index.js server/test/platformReportsApi.test.js
git commit -m "feat(reports): add cross-tenant platform performance and sportsbook odds reporting engine"
```

---

### Task 6: Partner Portal Statements API (Repository: core)

**Files:**
- Create: `server/src/platform/controllers/partnerBillingController.js`
- Modify: `server/src/platform/routes/partner.js`
- Create: `server/test/partnerBillingApi.test.js`

**Interfaces:**
- Consumes: `PartnerStatement`, `StatementLine`, `requireStaff('partner')`, `requireStaffPermission`.
- Produces: Scoped partner portal endpoints `/api/partner/statements` and `/api/partner/statements/:id` with strict IDOR prevention and small-cell aggregation.

- [ ] **Step 1: Write failing tests** in `server/test/partnerBillingApi.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { createPartnerRouter } from '../src/platform/routes/partner.js';
import { errorHandler } from '../src/middleware/error.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import Partner from '../src/models/Partner.js';
import PartnerStatement from '../src/models/PartnerStatement.js';
import StatementLine from '../src/models/StatementLine.js';
import { signStaffAccess } from '../src/services/staffSession.js';

process.env.JWT_SECRET ||= 'test-jwt-secret';
process.env.JWT_STAFF_SECRET ||= 'test-jwt-staff-secret';
process.env.TENANCY_MODE = 'multi';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9c_t6';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/partner', createPartnerRouter());
  app.use(errorHandler);
  const server = app.listen(0);
  const port = server.address().port;
  return { server, base: `http://127.0.0.1:${port}` };
}

test('Partner staff can view own issued statements and lines', async () => {
  const staff = await StaffAccount.create({ email: 'pstaff1@example.com', username: 'pstaff1', password: 'pwd', status: 'active' });
  const partner1 = await Partner.create({ key: 'p1', name: 'Partner One', createdBy: staff._id });
  const role = await Role.create({ name: 'partner_analyst', displayName: 'Analyst', scopeType: 'partner', scopeId: partner1._id });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'partner', scopeId: partner1._id });

  const stmt = await PartnerStatement.create({
    statementNumber: 'STMT-P1-TRY',
    partnerId: partner1._id,
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    currency: 'TRY',
    status: 'issued',
    grossAmount: 4000,
    netAmount: 4000,
    finalAmount: 4000,
    issuedAt: new Date(),
    createdBy: staff._id,
  });

  await StatementLine.create({
    statementId: stmt._id,
    partnerId: partner1._id,
    type: 'commission',
    date: '2026-11-05',
    currency: 'TRY',
    baseMetric: 'ggr',
    baseAmount: 20000,
    rate: 0.20,
    amount: 4000,
    description: 'Commission',
  });

  const token = signStaffAccess(staff, { scopeType: 'partner', scopeId: partner1._id, amr: ['pwd', 'otp'] });
  const { server, base } = await createServer();

  try {
    const res = await fetch(`${base}/api/partner/statements`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.statements.length, 1);
    assert.equal(body.statements[0].netAmount, 4000);

    const detailRes = await fetch(`${base}/api/partner/statements/${stmt._id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(detailRes.status, 200);
    const detailBody = await detailRes.json();
    assert.equal(detailBody.lines.length, 1);
  } finally {
    server.close();
  }
});

test('Partner staff requesting another partner statement returns 404 NOT_FOUND (prevent IDOR)', async () => {
  const staff = await StaffAccount.create({ email: 'pstaff2@example.com', username: 'pstaff2', password: 'pwd', status: 'active' });
  const partner1 = await Partner.create({ key: 'p-own', name: 'Own Partner', createdBy: staff._id });
  const partner2 = await Partner.create({ key: 'p-other', name: 'Other Partner', createdBy: staff._id });

  const role = await Role.create({ name: 'partner_analyst_2', displayName: 'Analyst', scopeType: 'partner', scopeId: partner1._id });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'partner', scopeId: partner1._id });

  const otherStmt = await PartnerStatement.create({
    statementNumber: 'STMT-P2-SECRET',
    partnerId: partner2._id,
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    currency: 'TRY',
    status: 'issued',
    grossAmount: 99999,
    netAmount: 99999,
    createdBy: staff._id,
  });

  const token = signStaffAccess(staff, { scopeType: 'partner', scopeId: partner1._id, amr: ['pwd', 'otp'] });
  const { server, base } = await createServer();

  try {
    const res = await fetch(`${base}/api/partner/statements/${otherStmt._id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Strict 404 per K27 / §9 G-3 to prevent entity leakage
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Implement partner billing controller and routes**:

Create `server/src/platform/controllers/partnerBillingController.js`:
```javascript
import PartnerStatement from '../../models/PartnerStatement.js';
import StatementLine from '../../models/StatementLine.js';

export async function listPartnerStatements(req, res, next) {
  try {
    const partnerId = req.staff.scopeId;
    const statements = await PartnerStatement.find({
      partnerId,
      status: { $in: ['issued', 'settled'] },
    })
      .sort({ periodStart: -1 })
      .lean();

    res.json({ statements });
  } catch (err) {
    next(err);
  }
}

export async function getPartnerStatement(req, res, next) {
  try {
    const partnerId = req.staff.scopeId;
    const statement = await PartnerStatement.findOne({
      _id: req.params.id,
      partnerId,
      status: { $in: ['issued', 'settled'] },
    }).lean();

    if (!statement) {
      return res.status(404).json({ error: 'Statement not found' });
    }

    const lines = await StatementLine.find({ statementId: statement._id })
      .populate('tenantId', 'key name')
      .sort({ date: 1 })
      .lean();

    res.json({ statement, lines });
  } catch (err) {
    next(err);
  }
}

export async function exportPartnerStatementCsv(req, res, next) {
  try {
    const partnerId = req.staff.scopeId;
    const statement = await PartnerStatement.findOne({
      _id: req.params.id,
      partnerId,
      status: { $in: ['issued', 'settled'] },
    }).lean();

    if (!statement) {
      return res.status(404).json({ error: 'Statement not found' });
    }

    const lines = await StatementLine.find({ statementId: statement._id }).lean();

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${statement.statementNumber}.csv"`);

    res.write('Date,Type,Description,Base Amount,Rate,Amount,Currency\n');
    for (const line of lines) {
      res.write(
        `"${line.date || ''}","${line.type}","${line.description.replace(/"/g, '""')}",${line.baseAmount || 0},${line.rate || 0},${line.amount},"${line.currency}"\n`
      );
    }
    res.end();
  } catch (err) {
    next(err);
  }
}
```

Modify `server/src/platform/routes/partner.js`:
Mount partner statements routes:
```javascript
import {
  listPartnerStatements,
  getPartnerStatement,
  exportPartnerStatementCsv,
} from '../controllers/partnerBillingController.js';

  router.get('/statements', requireStaffPermission('partner:metrics:read'), listPartnerStatements);
  router.get('/statements/:id', requireStaffPermission('partner:metrics:read'), getPartnerStatement);
  router.get('/statements/:id/export', requireStaffPermission('partner:metrics:read'), exportPartnerStatementCsv);
```

- [ ] **Step 3: Run the test suite**:
```bash
node --test --test-timeout=60000 server/test/partnerBillingApi.test.js
```

- [ ] **Step 4: Commit task changes**:
```bash
git add server/src/platform/controllers/partnerBillingController.js server/src/platform/routes/partner.js server/test/partnerBillingApi.test.js
git commit -m "feat(billing): add partner portal statements endpoints with strict isolation and CSV export"
```

---

### Task 7: Console Platform UI (Fee Plans, Statements, Adjustments, Reports) (Repository: core)

**Files:**
- Modify: `console/src/api/client.js`
- Modify: `console/src/components/layout/Sidebar.jsx`
- Create: `console/src/pages/billing/BillingDashboard.jsx`
- Create: `console/src/pages/billing/StatementsList.jsx`
- Create: `console/src/pages/billing/StatementDetail.jsx`
- Create: `console/src/pages/billing/OperatorFeePlans.jsx`
- Create: `console/src/pages/reports/PlatformReports.jsx`
- Modify: `console/src/App.jsx`
- Create: `console/test/platformBillingConsole.test.js`

**Interfaces:**
- Consumes: Platform billing endpoints, platform reports endpoints.
- Produces: Vite/React console pages for managing operator fee plans, generating and issuing statements, adding adjustments, downloading CSVs, and viewing cross-tenant performance reports.

- [ ] **Step 1: Write UI component tests** in `console/test/platformBillingConsole.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import BillingDashboard from '../src/pages/billing/BillingDashboard.jsx';
import StatementsList from '../src/pages/billing/StatementsList.jsx';
import StatementDetail from '../src/pages/billing/StatementDetail.jsx';
import OperatorFeePlans from '../src/pages/billing/OperatorFeePlans.jsx';
import PlatformReports from '../src/pages/reports/PlatformReports.jsx';
import { platformNav } from '../src/components/layout/Sidebar.jsx';

test('Sidebar includes Billing and Reports in platformNav', () => {
  const paths = platformNav.map((i) => i.path);
  assert.ok(paths.includes('/billing'), 'Platform nav must have /billing');
  assert.ok(paths.includes('/reports'), 'Platform nav must have /reports');
});

test('Billing and Reports page components are valid React elements', () => {
  assert.equal(typeof BillingDashboard, 'function');
  assert.equal(typeof StatementsList, 'function');
  assert.equal(typeof StatementDetail, 'function');
  assert.equal(typeof OperatorFeePlans, 'function');
  assert.equal(typeof PlatformReports, 'function');
});
```

- [ ] **Step 2: Update `client.js` and `Sidebar.jsx`**:

In `console/src/api/client.js`, add `billingApi` and `reportsApi`:
```javascript
export const billingApi = {
  listPlans: async () => (await apiClient.get('/billing/plans')).data,
  savePlan: async (data) => (await apiClient.post('/billing/plans', data)).data,
  listStatements: async (params) => (await apiClient.get('/billing/statements', { params })).data,
  getStatement: async (id) => (await apiClient.get(`/billing/statements/${id}`)).data,
  generateStatements: async (data) => (await apiClient.post('/billing/statements/generate', data)).data,
  issueStatement: async (id) => (await apiClient.post(`/billing/statements/${id}/issue`)).data,
  addAdjustment: async (id, data) => (await apiClient.post(`/billing/statements/${id}/adjustments`, data)).data,
  voidStatement: async (id, data) => (await apiClient.post(`/billing/statements/${id}/void`, data)).data,
};

export const reportsApi = {
  getCrossTenant: async (params) => (await apiClient.get('/reports/cross-tenant', { params })).data,
  getSportsbook: async (params) => (await apiClient.get('/reports/sportsbook-odds', { params })).data,
};
```

In `console/src/components/layout/Sidebar.jsx`, update `platformNav`:
```javascript
export const platformNav = [
  { name: 'Dashboard', path: '/' },
  { name: 'Tenants & Operators', path: '/tenants' },
  { name: 'Partners', path: '/partners' },
  { name: 'Domains', path: '/domains' },
  { name: 'Billing & Fee Plans', path: '/billing' },
  { name: 'Platform Reports', path: '/reports' },
  { name: 'Scope Gates (N6)', path: '/scope-gates' },
];
```

- [ ] **Step 3: Implement pages and mount routes**:
Create:
- `console/src/pages/billing/BillingDashboard.jsx`
- `console/src/pages/billing/StatementsList.jsx`
- `console/src/pages/billing/StatementDetail.jsx`
- `console/src/pages/billing/OperatorFeePlans.jsx`
- `console/src/pages/reports/PlatformReports.jsx`
Mount routes in `console/src/App.jsx`.

- [ ] **Step 4: Run the test suite**:
```bash
node --test --test-timeout=60000 console/test/platformBillingConsole.test.js
```

- [ ] **Step 5: Commit task changes**:
```bash
git add console/src/api/client.js console/src/components/layout/Sidebar.jsx console/src/pages/billing/ console/src/pages/reports/ console/src/App.jsx console/test/platformBillingConsole.test.js
git commit -m "feat(console): add platform billing, fee plans, statements, and reports UI"
```

---

### Task 8: Console Partner Portal UI (Partner Statements & Commission) (Repository: core)

**Files:**
- Modify: `console/src/components/layout/Sidebar.jsx`
- Create: `console/src/pages/partner/PartnerStatementsList.jsx`
- Create: `console/src/pages/partner/PartnerStatementDetail.jsx`
- Modify: `console/src/App.jsx`
- Create: `console/test/partnerBillingConsole.test.js`

**Interfaces:**
- Consumes: `/api/partner/statements` API endpoints.
- Produces: Partner portal views for statement summaries, daily commission breakdown, adjustments, and CSV downloads.

- [ ] **Step 1: Write UI component tests** in `console/test/partnerBillingConsole.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { partnerNav } from '../src/components/layout/Sidebar.jsx';
import PartnerStatementsList from '../src/pages/partner/PartnerStatementsList.jsx';
import PartnerStatementDetail from '../src/pages/partner/PartnerStatementDetail.jsx';

test('Sidebar includes Komisyon ve Faturalar in partnerNav', () => {
  const paths = partnerNav.map((i) => i.path);
  assert.ok(paths.includes('/partner/statements'), 'Partner nav must have /partner/statements');
});

test('Partner billing pages are valid React elements', () => {
  assert.equal(typeof PartnerStatementsList, 'function');
  assert.equal(typeof PartnerStatementDetail, 'function');
});
```

- [ ] **Step 2: Update `Sidebar.jsx`, pages, and `App.jsx`**:
In `console/src/components/layout/Sidebar.jsx`:
```javascript
export const partnerNav = [
  { name: 'Genel Bakış', path: '/partner' },
  { name: 'Operatörlerim', path: '/partner/operators' },
  { name: 'Yeni Operatör Başlat', path: '/partner/operators/new' },
  { name: 'Komisyon & Faturalar', path: '/partner/statements' },
  { name: 'Personel', path: '/partner/staff' },
];
```
Create `console/src/pages/partner/PartnerStatementsList.jsx` and `PartnerStatementDetail.jsx`.
Mount routes in `console/src/App.jsx`.

- [ ] **Step 3: Run the test suite**:
```bash
node --test --test-timeout=60000 console/test/partnerBillingConsole.test.js
```

- [ ] **Step 4: Commit task changes**:
```bash
git add console/src/components/layout/Sidebar.jsx console/src/pages/partner/PartnerStatementsList.jsx console/src/pages/partner/PartnerStatementDetail.jsx console/src/App.jsx console/test/partnerBillingConsole.test.js
git commit -m "feat(console): add partner portal commission statements and detail views"
```

---

### Task 9: End-to-End Acceptance Suite & CHANGELOG (Repository: core)

**Files:**
- Create: `server/test/billingAcceptance.test.js`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Complete multi-tenant billing lifecycle, K20/K21 logic, immutability rules, cross-partner boundary, and reports.
- Produces: Comprehensive end-to-end acceptance test suite and SemVer changelog entry.

- [ ] **Step 1: Write end-to-end acceptance test suite** in `server/test/billingAcceptance.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { createPlatformRouter } from '../src/platform/routes/index.js';
import { createPartnerRouter } from '../src/platform/routes/partner.js';
import { errorHandler } from '../src/middleware/error.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import Partner from '../src/models/Partner.js';
import Tenant from '../src/models/Tenant.js';
import PartnerOperatorLink from '../src/models/PartnerOperatorLink.js';
import OperatorFeePlan from '../src/models/OperatorFeePlan.js';
import TenantDailyStat from '../src/models/TenantDailyStat.js';
import PartnerStatement from '../src/models/PartnerStatement.js';
import AuditLog from '../src/models/AuditLog.js';
import { signStaffAccess } from '../src/services/staffSession.js';

process.env.JWT_SECRET ||= 'test-jwt-secret';
process.env.JWT_STAFF_SECRET ||= 'test-jwt-staff-secret';
process.env.TENANCY_MODE = 'multi';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9c_acceptance';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/platform', createPlatformRouter());
  app.use('/api/partner', createPartnerRouter());
  app.use(errorHandler);
  const server = app.listen(0);
  const port = server.address().port;
  return { server, base: `http://127.0.0.1:${port}` };
}

test('Full İP-9c billing lifecycle acceptance: K20 odds fee, K21 partner revshare, mid-period link transition, immutability, adjustments, and isolation', async () => {
  const { server, base } = await createServer();

  try {
    // 1. Create platform staff and partner staff
    const pStaff = await StaffAccount.create({ email: 'owner@example.com', username: 'owner', password: 'pwd', status: 'active' });
    const pRole = await Role.create({ name: 'platform_owner', displayName: 'Owner', scopeType: 'platform', scopeId: null });
    await RoleAssignment.create({ staffId: pStaff._id, roleId: pRole._id, scopeType: 'platform', scopeId: null });

    const partnerStaff1 = await StaffAccount.create({ email: 'p1@example.com', username: 'p1', password: 'pwd', status: 'active' });
    const partner1 = await Partner.create({ key: 'partner-1', name: 'Partner 1', createdBy: pStaff._id });
    const partRole1 = await Role.create({ name: 'partner_admin', displayName: 'PAdmin', scopeType: 'partner', scopeId: partner1._id });
    await RoleAssignment.create({ staffId: partnerStaff1._id, roleId: partRole1._id, scopeType: 'partner', scopeId: partner1._id });

    const partnerStaff2 = await StaffAccount.create({ email: 'p2@example.com', username: 'p2', password: 'pwd', status: 'active' });
    const partner2 = await Partner.create({ key: 'partner-2', name: 'Partner 2', createdBy: pStaff._id });
    const partRole2 = await Role.create({ name: 'partner_admin_2', displayName: 'PAdmin2', scopeType: 'partner', scopeId: partner2._id });
    await RoleAssignment.create({ staffId: partnerStaff2._id, roleId: partRole2._id, scopeType: 'partner', scopeId: partner2._id });

    // 2. Create operators and links with mid-period rate change on T1
    const t1 = await Tenant.create({ key: 't1-op', name: 'T1 Op' });
    const t2 = await Tenant.create({ key: 't2-op', name: 'T2 Op' });

    // T1: 15% rate first 10 days, 20% rate rest of month
    await PartnerOperatorLink.create({
      partnerId: partner1._id,
      tenantId: t1._id,
      validFrom: new Date('2026-11-01T00:00:00.000Z'),
      validTo: new Date('2026-11-10T00:00:00.000Z'),
      commercialTerms: { model: 'revshare_ggr', rate: 0.15, currency: 'TRY' },
      createdBy: pStaff._id,
    });
    await PartnerOperatorLink.create({
      partnerId: partner1._id,
      tenantId: t1._id,
      validFrom: new Date('2026-11-10T00:00:00.000Z'),
      validTo: null,
      commercialTerms: { model: 'revshare_ggr', rate: 0.20, currency: 'TRY' },
      createdBy: pStaff._id,
    });

    // 3. Configure K20 sportsbook odds feed fee plan on T1
    await OperatorFeePlan.create({
      tenantId: t1._id,
      validFrom: new Date('2026-11-01T00:00:00.000Z'),
      validTo: null,
      sportsbookFee: { model: 'both', fixedMonthlyFee: 1000, turnoverRate: 0.015, currency: 'TRY' },
      createdBy: pStaff._id,
    });

    // 4. Seed TenantDailyStat entries
    await TenantDailyStat.create({
      tenantId: t1._id,
      date: '2026-11-05',
      currency: 'TRY',
      casinoGgr: 10000,
      sportsGgrRealized: 2000,
      sportsTurnover: 40000,
    });
    await TenantDailyStat.create({
      tenantId: t1._id,
      date: '2026-11-15',
      currency: 'TRY',
      casinoGgr: 10000,
      sportsGgrRealized: 5000,
      sportsTurnover: 50000,
    });

    const platformToken = signStaffAccess(pStaff, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });
    const p1Token = signStaffAccess(partnerStaff1, { scopeType: 'partner', scopeId: partner1._id, amr: ['pwd', 'otp'] });
    const p2Token = signStaffAccess(partnerStaff2, { scopeType: 'partner', scopeId: partner2._id, amr: ['pwd', 'otp'] });

    // 5. Generate statement via Platform API
    const genRes = await fetch(`${base}/api/platform/billing/statements/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${platformToken}` },
      body: JSON.stringify({ partnerId: partner1._id, periodStart: '2026-11-01', periodEnd: '2026-11-30' }),
    });
    assert.equal(genRes.status, 200);
    const genBody = await genRes.json();
    assert.equal(genBody.statements.length, 1);
    const stmtId = genBody.statements[0]._id;

    // Day 1 (12000 * 0.15 = 1800) + Day 2 (15000 * 0.20 = 3000) = 4800 GGR commission
    assert.equal(genBody.statements[0].grossAmount, 4800.00);

    // 6. Issue statement (locking it)
    const issueRes = await fetch(`${base}/api/platform/billing/statements/${stmtId}/issue`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    assert.equal(issueRes.status, 200);

    // Verify direct edit fails due to immutability
    const stmtDoc = await PartnerStatement.findById(stmtId);
    stmtDoc.grossAmount = 99999;
    await assert.rejects(() => stmtDoc.save(), (err) => err.code === 'ERR_STATEMENT_IMMUTABLE');

    // 7. Add adjustment line to issued statement
    const adjRes = await fetch(`${base}/api/platform/billing/statements/${stmtId}/adjustments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${platformToken}` },
      body: JSON.stringify({ amount: -300, description: 'Player refund offset', reason: 'Audit review #501' }),
    });
    assert.equal(adjRes.status, 200);
    const adjBody = await adjRes.json();
    assert.equal(adjBody.statement.adjustmentsAmount, -300);
    assert.equal(adjBody.statement.netAmount, 4500);

    // Verify audit row written for adjustment
    const auditRow = await AuditLog.findOne({ action: 'billing:statement:adjust', targetId: String(stmtId) });
    assert.ok(auditRow);
    assert.equal(auditRow.reason, 'Audit review #501');

    // 8. Partner 1 checks own statements
    const p1ListRes = await fetch(`${base}/api/partner/statements`, {
      headers: { Authorization: `Bearer ${p1Token}` },
    });
    assert.equal(p1ListRes.status, 200);
    const p1List = await p1ListRes.json();
    assert.equal(p1List.statements.length, 1);
    assert.equal(p1List.statements[0].netAmount, 4500);

    // 9. Partner 2 attempting to view Partner 1's statement gets 404 NOT_FOUND
    const idorRes = await fetch(`${base}/api/partner/statements/${stmtId}`, {
      headers: { Authorization: `Bearer ${p2Token}` },
    });
    assert.equal(idorRes.status, 404);

    // 10. Platform cross-tenant reports verification
    const repRes = await fetch(`${base}/api/platform/reports/cross-tenant?from=2026-11-01&to=2026-11-30&groupBy=tenant`, {
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    assert.equal(repRes.status, 200);
    const repBody = await repRes.json();
    assert.equal(repBody.totals.sportsTurnover, 90000); // 40000 + 50000

    // 11. K24 Legal retention assertion
    assert.ok(stmtDoc.legalRetentionUntil >= new Date(Date.now() + 4 * 365 * 86400 * 1000));
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Update `CHANGELOG.md`**:
Add entry under `[Yayınlanmadı]` following `docs/CHANGELOG_GUIDE.md`:
```markdown
### Eklendi (İP-9c: komisyon, faturalama ve platform çapraz raporları)
- **K20 Operatör spor bahsi oran beslemesi maliyeti modeli:** `OperatorFeePlan` platform modeli ile operatör bazında sabit ve/veya spor cirosu yüzdesi tabanlı oran beslemesi ve platform ücret planı yapılandırması.
- **K21 Partner ticari modeli ve faturalama:** Toptan (wholesale), gelir paylaşımı (revshare) ve karma ticari modeller; linklerin `validFrom`/`validTo` tarih aralıklarına göre gün bazında dinamik komisyon hesaplama.
- **GGR tabanlı komisyon motoru:** İlk sürümde GGR (`casinoGgr + sportsGgrRealized`) tabanlı saf fonksiyon hesaplama motoru; NGR şimdilik hesaplanmadığı için `ERR_NGR_NOT_IMPLEMENTED` hatasıyla açıkça reddedilir.
- **Değişmez (immutable) faturalama ve düzeltme hatları:** Onaylanan (`issued`) ekstreler doğrudan değiştirilemez; düzeltmeler `StatementLine` üzerinde denetimli `adjustment` satırları olarak eklenir.
- **K24 5 yıllık yasal saklama:** Faturalama ve ekstre belgeleri için `legalRetentionUntil` ile en az 5 yıl silinmezlik garantisi.
- **Platform çapraz raporları:** Tüm kiracılar ve partnerler genelinde portföy ciro, GGR ve oran beslemesi maliyet raporları ve CSV dışa aktarımı.
- **Partner portalı ekstreleri:** Partnerlerin yalnızca kendi portföylerinin toplulaştırılmış ekstrelerini görmesi (K27) ve çapraz partner 404 IDOR yalıtımı.
```

- [ ] **Step 3: Run the test suite**:
```bash
node --test --test-timeout=60000 server/test/billingAcceptance.test.js
```

- [ ] **Step 4: Commit task changes**:
```bash
git add server/test/billingAcceptance.test.js CHANGELOG.md
git commit -m "test(billing): add end-to-end acceptance suite for İP-9c billing and update CHANGELOG"
```
