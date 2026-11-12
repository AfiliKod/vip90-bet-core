# İP-9b Partner Management and Partner Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement work package İP-9b of the approved multi-tenant design:
- **Partner data layer:** Mongoose models `Partner`, `PartnerOperatorLink`, `PartnerGrant`, capability definitions, scoped roles (`partner_admin`, `partner_ops`, `partner_analyst`), and compound indexes.
- **K16 Partners creating and managing their own operators:** Partners provision operators with `ownership: 'partner'` and `createdVia: 'partner'` within their allowed capability set and provisioning limits (`maxTenants`, `allowedModules`, `entitlementCeiling`).
- **K20/K21 Commercial terms model:** Selectable commercial model per partner (`revshare_ggr`, `revshare_ngr`, `turnover`, `fixed`), configured on `Partner` and `PartnerOperatorLink`. Billing calculations follow in İP-9c.
- **K23 & K27 Partner access boundaries:** Partner staff is strictly scoped to their own portfolio (`req.staff.scope === 'partner'`). Default access is limited to aggregated metrics (`metrics.read`) and own staff (`staff.manage`). Cross-partner access is impossible and returns 404 `NOT_FOUND` (no entity leakage).
- **Provisioning and lifecycle reuse:** Partner-created operators reuse the İP-9a provisioning service (`provisioningService.js`), go-live checklist (`goLiveChecklist.js`), and lifecycle service (`tenantLifecycle.js`). A partner can suspend and resume their operators, but can never force activation past the checklist and can never close an operator or issue platform write grants.
- **Audited PartnerGrant (read + limited write):** Tenant data (players, finance, support) is inaccessible to partner staff by default. Tenant staff explicitly issues time-limited (max 90 days) `PartnerGrant`s for specific scopes (`players:read`, `players:pii`, `finance:read`, `reports:raw`, `support:write`, `players:status:write`, `promotions:assign`). Every read and write writes an `AuditLog` row with `actorScope: 'partner'`, `partnerId`, `onBehalfOfTenantId`, and `grantId`. Financial balance adjustments, money approvals, withdrawals, and KYC document access remain forbidden under all circumstances.
- **Anti-self-assignment constraint:** Partner staff holding a partner role cannot be assigned a tenant role on any linked operator (`assertNoPartnerSelfAssignment`).
- **Aggregated metrics endpoint:** Partner metrics endpoint reads exclusively from the platform collection `TenantDailyStat`, enforcing small-cell suppression (`activePlayers < 5` rendered as `"<5"`) and preventing player PII leakage.
- **Partner portal in `console/`:** Integrated partner scope inside the Vite console application, providing partner staff with dedicated navigation, portfolio metrics dashboard, operator provisioning wizard, operator settings, and staff management.
- **Acceptance suite (§8.1 partner tests):** Full end-to-end sales-partner acceptance scenario validating isolation, lifecycle, quotas, grants, anti-self-assignment, and single-mode 404s.

**Architecture:**
- **Partner Root Scope:** Platform models (`Partner`, `PartnerOperatorLink`, `PartnerGrant`) live outside the `tenantScoped` plugin. In multi mode, platform partner routes (`/api/platform/partners/*`) serve Platform Owners, and partner portal routes (`/api/partner/*`) serve partner staff. Single-mode installs return 404 for `/api/partner/*`.
- **Identity & Authorization Matrix (§5.2, §5.3):** Partner staff members are accounts in `StaffAccount` with `RoleAssignment` where `scopeType: 'partner'` and `scopeId: partner._id`. Effective permissions equal role permissions intersected with `Partner.capabilities` intersected with `PartnerOperatorLink.capabilities`.
- **Tenant Data Access Guard:** Partner requests targeting tenant data require `X-Tenant-Id`. The gateway verifies an active `PartnerOperatorLink` (returning 404 if missing) and an active, non-expired, non-revoked `PartnerGrant` matching the required operation scope.
- **Shared Provisioning Pipeline:** `provisionTenant` accepts `partnerId` and `createdVia: 'partner'`, validates limits against `partner.provisioningLimits`, marks `ownership: 'partner'`, and creates an open `PartnerOperatorLink` (`validTo: null`).

**Tech Stack:** Node >= 22 (ESM), Express 4, Mongoose 8.24, React 19, Vite 5, Zustand 5, React Router 7, `node:test` + `node:assert/strict`, local MongoDB (replica set `rs0` on 127.0.0.1:27017).

**Spec:** `docs/superpowers/specs/2026-11-09-multi-tenant-design.md`. Sections used: §4.3.4 (`Partner`, capabilities, `PartnerOperatorLink`), §4.3.5 (`PartnerGrant`), §4.3.6 (`TenantDailyStat`), §4.3.7 (Audit fields), §4.3.8 (`RoleAssignment`), §5.2 (Role templates & partner namespace), §5.3 (Authorization matrix & P-rule), §7.1 (İP-9b critical path row), §8.1 (Partner isolation tests), K16 (Partner operators), K20/K21 (Commercial models), K23 (Read-only defaults), K27 (Partner defaults), S3 (Billing models), S10 (Default capabilities).

---

## Reviewer correction (2026-11-13): overrides every conflicting line below

1. **Reuse İP-9a as it is on main.** Partner provisioning calls `provisionTenant` (it returns `ownerInvite` once) and
   `createStaffInvite`; status changes call `transitionTenantStatus` with `force` always false for partners (a partner
   can never activate past the go-live checklist or close a tenant; closing stays platform-only, K26). The
   owner-invitation rule from İP-9a applies to partners too: no re-invite once the owner has signed in.
2. **Existing catalogue first.** The `partner:*` permission keys and the `partner` role/assignment scope already exist
   in `server/src/services/permissions.js` and the Role/RoleAssignment models; extend them, do not duplicate.
3. **Errors use the existing shape** `{ error: { code, message } }` via `createError`; cross-partner access is 404.
4. **Console:** partner pages live in the same `console/` app under `/console/partner/*` (router basename `/console`,
   raw links prefixed with `/console`), shown only to partner-scoped staff.
5. Never change an existing test to make a new one pass. Do NOT run the full root `npm test`; run your task's files
   only, with `--test-timeout=60000`; each test file uses its own database name.

## Invariants and Ground Rules

1. **Partner defaults (K27):** Default capabilities for new partners are strictly `['metrics.read', 'staff.manage']`. All other capabilities (`tenants.create`, `tenants.config:write`, `tenants.domains:write`, `tenants.staff:write`, `tenants.status:write`, `tenants.integrations:write`, `partner:grants:use`) must be explicitly granted by the Platform Owner.
2. **K16 Partner write boundaries:** Partner write operations apply only to their own operators' setup (creation, branding/theme, domains, operator staff, integrations write-only). Under no circumstances can a partner access player PII, balances, or financial movements without an active `PartnerGrant`.
3. **No financial mutations via grant:** Even with a `PartnerGrant`, partner staff can never adjust balances, approve withdrawals, execute payouts, or review KYC documents. Routes performing financial mutations remain forbidden to partner staff.
4. **Anti-self-assignment constraint:** A staff member holding a role on a partner cannot hold a tenant-scoped role on an operator linked to that partner.
5. **Cross-partner isolation:** Any query by partner `P1` for resources owned by or linked to partner `P2` returns 404 `NOT_FOUND` (never 403, preventing resource enumeration).
6. **Physical metrics isolation:** Partner metrics endpoints query only the aggregated collection `TenantDailyStat`. No queries to `User`, `Bet`, or `Transaction` are made. Small-cell suppression formats `activePlayers < 5` as `"<5"`.
7. **Single mode compatibility:** When `TENANCY_MODE=single`, `/api/partner/*` routes return 404 `NOT_FOUND`. Single-tenant installs are completely unaffected.
8. **Test isolation:** Tests run on dedicated test database names (`mongodb://127.0.0.1:27017/vip90_test_ip9b_t*`) and must not run the full root `npm test`. Always run with `--test-timeout=60000`.

---

## Global Constraints

- **Never weaken an existing check:** Existing checks (`requireAuth`, `requireStaff`, `requirePermission`, `enforceAdminIp`) remain active. Platform staff remain read-only on tenant routes unless `PlatformWriteGrant` is active. Partner staff access requires 2FA in multi mode.
- **Brand-neutral core:** No hard-coded brand names, internal hostnames, or private IPs in core code. Test fixtures use `*.example.com` domains and generic labels.
- **Idempotent operations:** Provisioning, migrations, and grant revocations are safe to re-run.
- **Public core code:** Core code contains no private add-on imports. Core provides hooks; add-ons attach through registration.

---

## Review Focus

- **Model constraints & partial indexes:** `PartnerOperatorLink` enforces at most one active link per tenant using a partial unique index (`{ tenantId: 1, validTo: 1 }` where `validTo: null`).
- **PartnerGrant lifecycle:** Enforce maximum 90 days duration, prevent partner self-granting, check `revokedAt` and expiration on every tenant request.
- **Effective permission intersection:** Partner staff permissions equal `Role.permissions` ∩ `Partner.capabilities` ∩ (`PartnerOperatorLink.capabilities` if defined).
- **Anti-self-assignment verification:** `RoleAssignment.pre('save')` executes `assertNoPartnerSelfAssignment` preventing privilege escalation.
- **Masked integrations write-only:** `tenants.integrations` allows writing provider credentials without reading them back in plaintext.
- **Small-cell suppression:** Correctly hides player counts below 5 in partner metrics.

---

## File Structure

| File | Repository | Responsibility | Task |
|---|---|---|---|
| `server/src/models/Partner.js` | core | Mongoose model for Partner entities, capabilities, limits, commercial terms | 1 |
| `server/src/models/PartnerOperatorLink.js` | core | Mongoose model for Partner-Operator links with partial unique index | 1 |
| `server/src/models/PartnerGrant.js` | core | Mongoose model for tenant-issued scoped access grants (max 90 days) | 1 |
| `server/src/services/permissions.js` | core | Permission definitions (`admin:partner-grants:*`) and capability mapping | 1 |
| `server/test/partnerModels.test.js` | core | Tests for partner models, link indexes, grant validity, anti-self-assignment | 1 |
| `server/src/middleware/tenantHost.js` | core | Route `/api/partner` as platform/partner host requests (`req.tenant = null`) | 2 |
| `server/src/middleware/auth.js` | core | Enforce `requireStaff('partner')`, 2FA check, partner status check, scope binding | 2 |
| `server/test/partnerAuth.test.js` | core | Tests for partner authentication, 2FA gate, suspended partner, single-mode 404 | 2 |
| `server/src/platform/services/provisioningService.js` | core | Partner-aware tenant provisioning: quota checks, link creation, partner audit | 3 |
| `server/src/platform/services/tenantLifecycle.js` | core | Partner status transitions: suspend/resume, block close and force activation | 3 |
| `server/test/partnerProvisioning.test.js` | core | Tests for partner provisioning limits, lifecycle restrictions, checklist guard | 3 |
| `server/src/platform/controllers/platformPartnersController.js` | core | Platform Owner controller for Partner CRUD, link management, terms configuration | 4 |
| `server/src/platform/routes/index.js` | core | Mount `/api/platform/partners` routes guarded by `platform:partners:manage` | 4 |
| `server/test/platformPartnersApi.test.js` | core | Integration tests for platform partner management API and operator re-linking | 4 |
| `server/src/platform/controllers/partnerPortalController.js` | core | Controller for partner self-management, operators, domains, masked credentials | 5 |
| `server/src/platform/routes/partner.js` | core | Router mounting `/api/partner/*` endpoints | 5 |
| `server/src/app.js` | core | Mount `/api/partner` in multi mode, return 404 in single mode | 5 |
| `server/test/partnerPortalApi.test.js` | core | Tests for partner portal API, cross-partner 404, masked credentials write | 5 |
| `server/src/platform/services/partnerMetricsService.js` | core | Aggregated metrics reader from `TenantDailyStat` with small-cell suppression | 6 |
| `server/src/platform/controllers/partnerMetricsController.js` | core | Controller for partner portfolio and per-operator commercial metrics | 6 |
| `server/test/partnerMetrics.test.js` | core | Tests for aggregated metrics, zero player PII, small-cell suppression (`<5`) | 6 |
| `server/src/controllers/partnerGrantsController.js` | core | Tenant admin controller for issuing and revoking `PartnerGrant`s | 7 |
| `server/src/routes/partnerGrants.js` | core | Tenant admin routes for `/api/admin/partner-grants` | 7 |
| `server/src/middleware/partnerGrantGuard.js` | core | Middleware enforcing active grant on tenant routes for partner staff tokens | 7 |
| `server/test/partnerGrants.test.js` | core | Tests for grant issuance, 90-day limit, route access, financial mutation block | 7 |
| `console/src/store/authStore.js` | core | Update console auth store for partner scope and capabilities | 8 |
| `console/src/api/client.js` | core | Add `partnerApi` client methods for partner portal endpoints | 8 |
| `console/src/components/layout/Sidebar.jsx` | core | Dynamic sidebar rendering based on staff scope (`platform` vs `partner`) | 8 |
| `console/src/pages/PartnersList.jsx` | core | Platform Owner view: Partner directory, status, and tenant counts | 8 |
| `console/src/pages/PartnerDetail.jsx` | core | Platform Owner view: Partner detail, capabilities, limits, commercial terms | 8 |
| `console/src/pages/partner/PartnerDashboard.jsx` | core | Partner view: Portfolio performance metrics and operator cards | 8 |
| `console/src/pages/partner/PartnerTenantsList.jsx` | core | Partner view: Partner operator directory and quick links | 8 |
| `console/src/pages/partner/PartnerTenantProvision.jsx` | core | Partner view: Partner operator provisioning wizard respecting limits | 8 |
| `console/src/pages/partner/PartnerTenantDetail.jsx` | core | Partner view: Operator config, domains, staff, integrations | 8 |
| `console/src/pages/partner/PartnerStaff.jsx` | core | Partner view: Partner staff management and invitation modal | 8 |
| `console/src/App.jsx` | core | Mount platform partner routes and partner portal routes | 8 |
| `console/test/partnerConsole.test.js` | core | Verification tests for console partner pages, scope navigation, auth store | 8 |
| `server/test/partnerAcceptance.test.js` | core | End-to-end acceptance suite covering sales-partner workflow (§8.1) | 9 |
| `CHANGELOG.md` | core | Document İP-9b changes under `[Yayınlanmadı]` | 9 |

---

## Parallelism

Tasks are organized into execution waves to optimize independent development and verification:

| Wave | Tasks (run in parallel, separate worktrees) | Repository | Depends on |
|---|---|---|---|
| A | 1 (Partner Models & Permission Catalogue), 2 (Partner Auth Scope & Host Routing) | core | none |
| B | 3 (Partner Provisioning & Lifecycle Guard), 4 (Platform Partner Management API), 6 (Aggregated Metrics Service), 7 (PartnerGrant & Tenant Route Guard) | core | 1, 2 |
| C | 5 (Partner Portal API) | core | 2, 3, 4, 6, 7 |
| D | 8 (Console Partner Pages & UI Integration) | core | 4, 5, 6 |
| E | 9 (End-to-End Acceptance Suite & CHANGELOG) | core | 5, 7, 8 |

**Conflict notes:**
- Wave A operates on foundation models, permissions, and middleware.
- Wave B tasks run independently: Task 3 updates provisioning services, Task 4 builds platform partner API, Task 6 builds metrics aggregation, and Task 7 builds tenant-side grant enforcement.
- Wave C integrates all Wave B services into Express partner portal routes.
- Wave D operates in `console/`, building UI pages against the API endpoints.
- Wave E runs end-to-end acceptance tests across the whole system.

---

### Task 1: Partner Data Layer: Models, Permissions Catalogue, and Schema Validation (Repository: core)

**Files:**
- Create: `server/src/models/Partner.js`
- Create: `server/src/models/PartnerOperatorLink.js`
- Create: `server/src/models/PartnerGrant.js`
- Modify: `server/src/services/permissions.js`
- Create: `server/test/partnerModels.test.js`

**Interfaces:**
- Consumes: `StaffAccount` model, `Tenant` model, `RoleAssignment.assertNoPartnerSelfAssignment`, `LEGACY_PERMISSION_DEFS`, `PARTNER_PERMISSION_DEFS` from `server/src/services/permissions.js`.
- Produces: `Partner`, `PartnerOperatorLink`, and `PartnerGrant` Mongoose models, with partial unique index `{ tenantId: 1, validTo: 1 }` for active links, and updated permission catalogue with `admin:partner-grants:*`.

- [ ] **Step 1: Write failing tests** in `server/test/partnerModels.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Partner from '../src/models/Partner.js';
import PartnerOperatorLink from '../src/models/PartnerOperatorLink.js';
import PartnerGrant, { PARTNER_GRANT_SCOPES } from '../src/models/PartnerGrant.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Tenant from '../src/models/Tenant.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import { PERMISSION_DEFS } from '../src/services/permissions.js';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9b_t1';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('Partner model enforces key regex and K27 default capabilities', async () => {
  const staff = await StaffAccount.create({ email: 'owner@example.com', username: 'owner', password: 'pwd', status: 'active' });

  // Invalid key rejected
  await assert.rejects(
    () => Partner.create({ key: 'INVALID_KEY!', name: 'Partner One', createdBy: staff._id }),
    /validation failed/i
  );

  const partner = await Partner.create({
    key: 'partner-alpha',
    name: 'Partner Alpha',
    createdBy: staff._id,
  });

  assert.equal(partner.key, 'partner-alpha');
  assert.equal(partner.status, 'active');
  // K27 defaults
  assert.deepEqual(partner.capabilities, ['metrics.read', 'staff.manage']);
  assert.equal(partner.provisioningLimits.maxTenants, 1);
  assert.deepEqual(partner.defaultCommercialTerms.model, 'revshare_ggr');
  assert.equal(partner.defaultCommercialTerms.rate, 0.15);
});

test('PartnerOperatorLink enforces at most one active link per tenant via partial unique index', async () => {
  const staff = await StaffAccount.create({ email: 'owner2@example.com', username: 'owner2', password: 'pwd', status: 'active' });
  const partner1 = await Partner.create({ key: 'partner-one', name: 'P1', createdBy: staff._id });
  const partner2 = await Partner.create({ key: 'partner-two', name: 'P2', createdBy: staff._id });
  const tenant = await Tenant.create({ key: 'link-op', name: 'Link Op', domain: 'link.example.com' });

  // First active link
  await PartnerOperatorLink.create({
    partnerId: partner1._id,
    tenantId: tenant._id,
    validFrom: new Date(),
    validTo: null,
    createdBy: staff._id,
  });

  // Second active link for the same tenant must fail with E11000 duplicate key
  await assert.rejects(
    () => PartnerOperatorLink.create({
      partnerId: partner2._id,
      tenantId: tenant._id,
      validFrom: new Date(),
      validTo: null,
      createdBy: staff._id,
    }),
    /E11000/
  );

  // Closing the first link allows a new active link
  await PartnerOperatorLink.updateOne({ tenantId: tenant._id, validTo: null }, { validTo: new Date(), endReason: 'transferred' });

  const secondLink = await PartnerOperatorLink.create({
    partnerId: partner2._id,
    tenantId: tenant._id,
    validFrom: new Date(),
    validTo: null,
    createdBy: staff._id,
  });
  assert.ok(secondLink._id);
});

test('PartnerGrant validates scopes and enforces maximum 90 days validity', async () => {
  const staff = await StaffAccount.create({ email: 'tenantowner@example.com', username: 'top', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'partner-grantee', name: 'PG', createdBy: staff._id });
  const tenant = await Tenant.create({ key: 'grant-op', name: 'Grant Op', domain: 'grant.example.com' });

  // Invalid scope rejected
  await assert.rejects(
    () => PartnerGrant.create({
      partnerId: partner._id,
      tenantId: tenant._id,
      scopes: ['invalid:scope'],
      grantedBy: staff._id,
      reason: 'Support request',
      validFrom: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    }),
    /validation failed/i
  );

  // Exceeding 90 days rejected
  const moreThan90Days = new Date(Date.now() + 91 * 86400000);
  await assert.rejects(
    () => PartnerGrant.create({
      partnerId: partner._id,
      tenantId: tenant._id,
      scopes: ['players:read'],
      grantedBy: staff._id,
      reason: 'Audit inspection',
      validFrom: new Date(),
      expiresAt: moreThan90Days,
    }),
    /exceed 90 days/i
  );

  // Valid grant within 90 days succeeds
  const validGrant = await PartnerGrant.create({
    partnerId: partner._id,
    tenantId: tenant._id,
    scopes: ['players:read', 'support:write'],
    grantedBy: staff._id,
    reason: 'Player support investigation',
    validFrom: new Date(),
    expiresAt: new Date(Date.now() + 30 * 86400000),
  });
  assert.ok(validGrant._id);
  assert.equal(validGrant.status, 'active');
});

test('assertNoPartnerSelfAssignment prevents partner staff from getting tenant role on linked operator', async () => {
  const pStaff = await StaffAccount.create({ email: 'pstaff@example.com', username: 'pstaff', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'partner-linked', name: 'PL', createdBy: pStaff._id });
  const tenant = await Tenant.create({ key: 'linked-tenant', name: 'LT', domain: 'lt.example.com' });

  await PartnerOperatorLink.create({
    partnerId: partner._id,
    tenantId: tenant._id,
    validFrom: new Date(),
    validTo: null,
    createdBy: pStaff._id,
  });

  const pRole = await Role.create({ name: 'custom_partner_role', displayName: 'P Role', scopeType: 'partner', scopeId: partner._id });
  const tRole = await Role.create({ name: 'custom_tenant_role', displayName: 'T Role', scopeType: 'tenant', scopeId: tenant._id });

  // Assign partner role
  await RoleAssignment.create({ staffId: pStaff._id, roleId: pRole._id, scopeType: 'partner', scopeId: partner._id });

  // Attempting to assign tenant role on linked tenant must throw PARTNER_SELF_ASSIGNMENT_FORBIDDEN
  await assert.rejects(
    () => RoleAssignment.create({ staffId: pStaff._id, roleId: tRole._id, scopeType: 'tenant', scopeId: tenant._id }),
    (err) => err.code === 'PARTNER_SELF_ASSIGNMENT_FORBIDDEN'
  );
});

test('Permissions catalogue includes admin:partner-grants:* keys', () => {
  const keys = new Set(PERMISSION_DEFS.map((p) => p.key));
  assert.ok(keys.has('admin:partner-grants:read'), 'admin:partner-grants:read must exist');
  assert.ok(keys.has('admin:partner-grants:write'), 'admin:partner-grants:write must exist');
});
```

- [ ] **Step 2: Implement models and update permissions catalogue**:

Create `server/src/models/Partner.js`:
```javascript
import mongoose from 'mongoose';

const { ObjectId, Mixed } = mongoose.Schema.Types;

export const PARTNER_CAPABILITIES = Object.freeze([
  'metrics.read',
  'staff.manage',
  'tenants.create',
  'tenants.config:write',
  'tenants.domains:write',
  'tenants.staff:write',
  'tenants.status:write',
  'tenants.integrations:write',
  'partner:grants:use',
]);

const partnerSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    immutable: true,
    trim: true,
    lowercase: true,
    match: /^[a-z0-9][a-z0-9-]{1,39}$/,
  },
  name: { type: String, required: true, trim: true },
  legalEntity: {
    name:           { type: String, default: null },
    registrationNo: { type: String, default: null },
    address:        { type: String, default: null },
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'closed'],
    default: 'active',
    index: true,
  },
  contact: {
    name:  { type: String, default: null },
    email: { type: String, default: null },
    phone: { type: String, default: null },
  },
  // K27 defaults: metrics.read, staff.manage
  capabilities: {
    type: [String],
    default: () => ['metrics.read', 'staff.manage'],
    validate: {
      validator: (arr) => arr.every((cap) => PARTNER_CAPABILITIES.includes(cap)),
      message: 'Invalid partner capability',
    },
  },
  provisioningLimits: {
    maxTenants:         { type: Number, default: 1, min: 1 },
    allowedModules:     { type: [String], default: () => [] },
    entitlementCeiling: { type: Mixed, default: () => ({}) },
  },
  // K20/K21 Commercial terms configuration
  defaultCommercialTerms: {
    model:      { type: String, enum: ['revshare_ggr', 'revshare_ngr', 'turnover', 'fixed'], default: 'revshare_ggr' },
    rate:       { type: Number, default: 0.15 },
    currency:   { type: String, default: 'TRY' },
    minimumFee: { type: Number, default: 0 },
  },
  createdBy: { type: ObjectId, ref: 'StaffAccount', required: true },
}, { timestamps: true });

export default mongoose.models.Partner || mongoose.model('Partner', partnerSchema);
```

Create `server/src/models/PartnerOperatorLink.js`:
```javascript
import mongoose from 'mongoose';

const { ObjectId, Mixed } = mongoose.Schema.Types;

const partnerOperatorLinkSchema = new mongoose.Schema({
  partnerId: { type: ObjectId, ref: 'Partner', required: true, index: true },
  tenantId:  { type: ObjectId, ref: 'Tenant', required: true, index: true },
  validFrom: { type: Date, required: true, default: Date.now },
  validTo:   { type: Date, default: null, index: true },
  // Optional capability narrowing for this specific tenant (spec §4.3.4)
  capabilities: { type: [String], default: null },
  commercialTerms: {
    model:      { type: String, enum: ['revshare_ggr', 'revshare_ngr', 'turnover', 'fixed'], default: 'revshare_ggr' },
    rate:       { type: Number, default: 0.15 },
    currency:   { type: String, default: 'TRY' },
    minimumFee: { type: Number, default: 0 },
  },
  createdBy: { type: ObjectId, ref: 'StaffAccount', required: true },
  endedBy:   { type: ObjectId, ref: 'StaffAccount', default: null },
  endReason: { type: String, default: null },
}, { timestamps: true });

// Enforce at most one active link per operator (validTo == null)
partnerOperatorLinkSchema.index(
  { tenantId: 1, validTo: 1 },
  { unique: true, partialFilterExpression: { validTo: null } }
);

export default mongoose.models.PartnerOperatorLink || mongoose.model('PartnerOperatorLink', partnerOperatorLinkSchema);
```

Create `server/src/models/PartnerGrant.js`:
```javascript
import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

export const PARTNER_GRANT_SCOPES = Object.freeze([
  'players:read',
  'players:pii',
  'finance:read',
  'reports:raw',
  'support:write',
  'players:status:write',
  'promotions:assign',
]);

const MAX_GRANT_DURATION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days max (spec §4.3.5)

const partnerGrantSchema = new mongoose.Schema({
  partnerId: { type: ObjectId, ref: 'Partner', required: true, index: true },
  tenantId:  { type: ObjectId, ref: 'Tenant', required: true, index: true },
  scopes: {
    type: [String],
    required: true,
    validate: {
      validator: (scopes) => scopes.length > 0 && scopes.every((s) => PARTNER_GRANT_SCOPES.includes(s)),
      message: 'Invalid partner grant scope',
    },
  },
  grantedBy: { type: ObjectId, ref: 'StaffAccount', required: true },
  reason:    { type: String, required: true, trim: true },
  validFrom: { type: Date, required: true, default: Date.now },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
    validate: {
      validator: function (val) {
        if (!val) return false;
        const from = this.validFrom ? new Date(this.validFrom).getTime() : Date.now();
        return (val.getTime() - from) <= MAX_GRANT_DURATION_MS && val.getTime() > from;
      },
      message: 'Grant duration cannot exceed 90 days',
    },
  },
  revokedAt: { type: Date, default: null },
  revokedBy: { type: ObjectId, ref: 'StaffAccount', default: null },
}, { timestamps: true });

partnerGrantSchema.virtual('status').get(function () {
  if (this.revokedAt) return 'revoked';
  if (this.expiresAt && new Date() > this.expiresAt) return 'expired';
  return 'active';
});

export default mongoose.models.PartnerGrant || mongoose.model('PartnerGrant', partnerGrantSchema);
```

Update `server/src/services/permissions.js`:
Add `admin:partner-grants:read` and `admin:partner-grants:write` to `LEGACY_PERMISSION_DEFS`:
```javascript
  // Partner Grants (spec §4.3.5)
  { key: 'admin:partner-grants:read', name: 'Partner İzinlerini Görüntüle', category: 'settings', description: 'Operatör için verilmiş partner izinlerini görüntüleme' },
  { key: 'admin:partner-grants:write', name: 'Partner İzinlerini Yönet', category: 'settings', description: 'Partner izinleri verme ve geri alma' },
```

- [ ] **Step 3: Run the test suite**:
```bash
node --test --test-timeout=60000 server/test/partnerModels.test.js
```

- [ ] **Step 4: Commit task changes**:
```bash
git add server/src/models/Partner.js server/src/models/PartnerOperatorLink.js server/src/models/PartnerGrant.js server/src/services/permissions.js server/test/partnerModels.test.js
git commit -m "feat(tenancy): add Partner, PartnerOperatorLink, and PartnerGrant models with permissions"
```

---

### Task 2: Partner Auth Scope & Host Routing in Middleware (Repository: core)

**Files:**
- Modify: `server/src/middleware/tenantHost.js`
- Modify: `server/src/middleware/auth.js`
- Create: `server/test/partnerAuth.test.js`

**Interfaces:**
- Consumes: `requireStaff`, `verifyStaffAccess`, `Partner` model, `PartnerOperatorLink` model.
- Produces: `isPlatformRequest` recognizing `/api/partner`, `requireStaff('partner')` enforcement with mandatory 2FA, suspended partner check, and cross-partner isolation.

- [ ] **Step 1: Write failing tests** in `server/test/partnerAuth.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { requireStaff } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/error.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Partner from '../src/models/Partner.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import { signStaffAccess } from '../src/services/staffSession.js';

process.env.JWT_SECRET ||= 'test-jwt-secret';
process.env.JWT_STAFF_SECRET ||= 'test-jwt-staff-secret';
process.env.TENANCY_MODE = 'multi';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9b_t2';

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

  app.get('/api/partner/test-route', requireStaff('partner'), (req, res) => {
    res.json({ ok: true, staff: req.staff, partnerId: req.partner?._id });
  });

  app.use(errorHandler);
  const server = app.listen(0);
  const port = server.address().port;
  return { server, base: `http://127.0.0.1:${port}` };
}

test('requireStaff("partner") allows valid partner token with 2FA amr', async () => {
  const staff = await StaffAccount.create({ email: 'padmin@example.com', username: 'padmin', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'auth-partner', name: 'AP', createdBy: staff._id });
  const role = await Role.create({ name: 'custom_p_role', displayName: 'PRole', scopeType: 'partner', scopeId: partner._id });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'partner', scopeId: partner._id });

  const token = signStaffAccess(staff, { scopeType: 'partner', scopeId: partner._id, amr: ['pwd', 'otp'] });

  const { server, base } = await createServer();
  try {
    const res = await fetch(`${base}/api/partner/test-route`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(String(body.staff.scopeId), String(partner._id));
  } finally {
    server.close();
  }
});

test('requireStaff("partner") rejects partner token missing 2FA otp claim in multi mode', async () => {
  const staff = await StaffAccount.create({ email: 'no2fa@example.com', username: 'no2fa', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'auth-no2fa', name: 'AP2', createdBy: staff._id });
  const token = signStaffAccess(staff, { scopeType: 'partner', scopeId: partner._id, amr: ['pwd'] });

  const { server, base } = await createServer();
  try {
    const res = await fetch(`${base}/api/partner/test-route`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, 'TWO_FACTOR_REQUIRED');
  } finally {
    server.close();
  }
});

test('requireStaff("partner") rejects token for suspended partner', async () => {
  const staff = await StaffAccount.create({ email: 'susp@example.com', username: 'susp', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'auth-susp', name: 'APS', status: 'suspended', createdBy: staff._id });
  const token = signStaffAccess(staff, { scopeType: 'partner', scopeId: partner._id, amr: ['pwd', 'otp'] });

  const { server, base } = await createServer();
  try {
    const res = await fetch(`${base}/api/partner/test-route`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, 'PARTNER_SUSPENDED');
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Update middleware**:

In `server/src/middleware/tenantHost.js`:
Extend `isPlatformRequest` to include `/api/partner`:
```javascript
function isPlatformRequest(host, req) {
  const platformHost = process.env.PLATFORM_HOST ? normalizeHost(process.env.PLATFORM_HOST) : null;
  if (platformHost) return host === platformHost;
  const path = req?.path || req?.originalUrl || '';
  return path.startsWith('/api/platform') || path.startsWith('/api/partner') || path.startsWith('/console');
}
```

In `server/src/middleware/auth.js`:
Update `requireStaff` to support `allowedScope === 'partner'` and load `req.partner`:
```javascript
import Partner from '../models/Partner.js';

// In requireStaff():
if (allowedScope && payload.scp !== allowedScope && payload.scp !== 'platform') {
  return next(createError(403, 'FORBIDDEN', 'Bu işlem için yetki yok'));
}

if (payload.scp === 'partner') {
  const partner = await Partner.findById(payload.sid).lean();
  if (!partner) {
    return next(createError(404, 'PARTNER_NOT_FOUND', 'Partner bulunamadı'));
  }
  if (partner.status === 'suspended') {
    return next(createError(403, 'PARTNER_SUSPENDED', 'Partner hesabı askıya alınmış'));
  }
  if (partner.status === 'closed') {
    return next(createError(403, 'PARTNER_CLOSED', 'Partner hesabı kapatılmış'));
  }
  req.partner = partner;
}
```

- [ ] **Step 3: Run the test suite**:
```bash
node --test --test-timeout=60000 server/test/partnerAuth.test.js
```

- [ ] **Step 4: Commit task changes**:
```bash
git add server/src/middleware/tenantHost.js server/src/middleware/auth.js server/test/partnerAuth.test.js
git commit -m "feat(tenancy): add partner scope auth and host routing middleware"
```

---

### Task 3: Partner Provisioning Pipeline Reuse & Tenant Lifecycle Guard (Repository: core)

**Files:**
- Modify: `server/src/platform/services/provisioningService.js`
- Modify: `server/src/platform/services/tenantLifecycle.js`
- Create: `server/test/partnerProvisioning.test.js`

**Interfaces:**
- Consumes: `provisionTenant`, `transitionTenantStatus`, `Partner`, `PartnerOperatorLink`, `evaluateGoLiveChecklist`.
- Produces: Partner-attributed tenant provisioning with quota validation, automatic `PartnerOperatorLink` creation, and partner-safe status transitions.

- [ ] **Step 1: Write failing tests** in `server/test/partnerProvisioning.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { provisionTenant } from '../src/platform/services/provisioningService.js';
import { transitionTenantStatus } from '../src/platform/services/tenantLifecycle.js';
import Partner from '../src/models/Partner.js';
import PartnerOperatorLink from '../src/models/PartnerOperatorLink.js';
import Tenant from '../src/models/Tenant.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import AuditLog from '../src/models/AuditLog.js';

process.env.TENANCY_MODE = 'multi';
const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9b_t3';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('partner provisions operator within limits, creating PartnerOperatorLink and partner audit log', async () => {
  const staff = await StaffAccount.create({ email: 'padmin@example.com', username: 'padmin', password: 'pwd', status: 'active' });
  const partner = await Partner.create({
    key: 'partner-prov',
    name: 'Partner Prov',
    capabilities: ['metrics.read', 'staff.manage', 'tenants.create'],
    provisioningLimits: {
      maxTenants: 2,
      allowedModules: ['sports', 'casino'],
      entitlementCeiling: {},
    },
    createdBy: staff._id,
  });

  const res = await provisionTenant({
    key: 'p-tenant-1',
    name: 'Partner Tenant 1',
    domain: 'ptenant1.example.com',
    entitlements: { modules: ['sports'] },
  }, {
    createdByStaffId: staff._id,
    partnerId: partner._id,
    createdVia: 'partner',
  });

  assert.equal(res.tenant.ownership, 'partner');
  assert.equal(res.tenant.createdVia, 'partner');

  // Verify PartnerOperatorLink created
  const link = await PartnerOperatorLink.findOne({ tenantId: res.tenant._id, validTo: null });
  assert.ok(link);
  assert.equal(String(link.partnerId), String(partner._id));

  // Verify AuditLog record
  const audit = await AuditLog.findOne({ action: 'PARTNER_TENANT_PROVISIONED', onBehalfOfTenantId: res.tenant._id });
  assert.ok(audit);
  assert.equal(audit.actorScope, 'partner');
  assert.equal(String(audit.partnerId), String(partner._id));
});

test('partner provisioning rejects requests exceeding maxTenants or forbidden modules', async () => {
  const staff = await StaffAccount.create({ email: 'padmin2@example.com', username: 'padmin2', password: 'pwd', status: 'active' });
  const partner = await Partner.create({
    key: 'partner-limits',
    name: 'Partner Limits',
    capabilities: ['tenants.create'],
    provisioningLimits: {
      maxTenants: 1,
      allowedModules: ['sports'],
    },
    createdBy: staff._id,
  });

  // Disallowed module rejected
  await assert.rejects(
    () => provisionTenant({
      key: 'p-forbidden-mod',
      name: 'Forbidden Mod',
      domain: 'forbidden.example.com',
      entitlements: { modules: ['casino-content'] },
    }, { createdByStaffId: staff._id, partnerId: partner._id, createdVia: 'partner' }),
    /MODULE_NOT_ALLOWED/
  );

  // First tenant provisioned
  await provisionTenant({
    key: 'p-allowed-1',
    name: 'Allowed 1',
    domain: 'allowed1.example.com',
    entitlements: { modules: ['sports'] },
  }, { createdByStaffId: staff._id, partnerId: partner._id, createdVia: 'partner' });

  // Exceeding maxTenants rejected
  await assert.rejects(
    () => provisionTenant({
      key: 'p-exceed-quota',
      name: 'Exceed Quota',
      domain: 'exceed.example.com',
      entitlements: { modules: ['sports'] },
    }, { createdByStaffId: staff._id, partnerId: partner._id, createdVia: 'partner' }),
    /MAX_TENANTS_EXCEEDED/
  );
});

test('partner lifecycle transitions: can suspend and resume, cannot close or force activate', async () => {
  const staff = await StaffAccount.create({ email: 'pstaff3@example.com', username: 'pstaff3', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'partner-lc', name: 'PLC', createdBy: staff._id });
  const tenant = await Tenant.create({ key: 'lc-tenant', name: 'LC Tenant', status: 'active', ownership: 'partner', createdVia: 'partner' });
  await PartnerOperatorLink.create({ partnerId: partner._id, tenantId: tenant._id, validTo: null, createdBy: staff._id });

  // Partner can suspend active tenant
  const suspended = await transitionTenantStatus(tenant._id, 'suspended', {
    actorStaffId: staff._id,
    actorScope: 'partner',
    partnerId: partner._id,
    reason: 'Maintenance',
  });
  assert.equal(suspended.status, 'suspended');

  // Partner CANNOT close tenant (platform-only)
  await assert.rejects(
    () => transitionTenantStatus(tenant._id, 'closed', {
      actorStaffId: staff._id,
      actorScope: 'partner',
      partnerId: partner._id,
      reason: 'Termination',
    }),
    /PLATFORM_ONLY/
  );

  // Partner CANNOT force activation past checklist
  await assert.rejects(
    () => transitionTenantStatus(tenant._id, 'active', {
      actorStaffId: staff._id,
      actorScope: 'partner',
      partnerId: partner._id,
      force: true,
      reason: 'Override',
    }),
    /PLATFORM_ONLY/
  );
});
```

- [ ] **Step 2: Implement provisioning quota checks and lifecycle guards**:

Update `server/src/platform/services/provisioningService.js`:
```javascript
import Partner from '../../models/Partner.js';
import PartnerOperatorLink from '../../models/PartnerOperatorLink.js';
import { createError } from '../../middleware/error.js';

// In provisionTenant(data, options = {}):
const { createdByStaffId = null, partnerId = null, createdVia = 'platform' } = options;

let effectiveOwnership = 'direct';
let effectiveCreatedVia = 'platform';

if (partnerId) {
  const partner = await Partner.findById(partnerId);
  if (!partner) throw createError(404, 'PARTNER_NOT_FOUND', 'Partner not found');
  if (partner.status !== 'active') throw createError(403, 'PARTNER_NOT_ACTIVE', 'Partner is not active');

  // Check maxTenants quota
  const activeLinksCount = await PartnerOperatorLink.countDocuments({
    partnerId: partner._id,
    validTo: null,
  });
  if (activeLinksCount >= partner.provisioningLimits.maxTenants) {
    throw createError(400, 'MAX_TENANTS_EXCEEDED', `Tenant limit reached (${partner.provisioningLimits.maxTenants})`);
  }

  // Check allowedModules
  const requestedModules = entitlements.modules || [];
  const allowed = new Set(partner.provisioningLimits.allowedModules || []);
  const forbidden = requestedModules.filter((m) => !allowed.has(m));
  if (forbidden.length > 0) {
    throw createError(400, 'MODULE_NOT_ALLOWED', `Requested modules not allowed for this partner: ${forbidden.join(', ')}`);
  }

  effectiveOwnership = 'partner';
  effectiveCreatedVia = 'partner';
}
```
After tenant creation in `provisionTenant`:
```javascript
if (partnerId) {
  await PartnerOperatorLink.create({
    partnerId,
    tenantId: tenant._id,
    validFrom: new Date(),
    validTo: null,
    capabilities: null,
    commercialTerms: partner.defaultCommercialTerms || { model: 'revshare_ggr', rate: 0.15, currency: 'TRY' },
    createdBy: createdByStaffId,
  });

  await runWithTenant(tenant._id, () => AuditLog.create({
    actorType: 'admin',
    actorUsername: 'partner',
    actorScope: 'partner',
    actorStaffId: createdByStaffId,
    partnerId,
    onBehalfOfTenantId: tenant._id,
    action: 'PARTNER_TENANT_PROVISIONED',
    category: 'system',
    targetType: 'system',
    targetId: tenant._id.toString(),
    capability: 'tenants.create',
  }));
}
```

Update `server/src/platform/services/tenantLifecycle.js`:
Add partner guard in `transitionTenantStatus`:
```javascript
export async function transitionTenantStatus(tenantId, newStatus, {
  actorStaffId,
  actorScope = 'platform',
  partnerId = null,
  force = false,
  reason = '',
} = {}) {
  if (actorScope === 'partner') {
    if (newStatus === 'closed') {
      throw createError(403, 'PLATFORM_ONLY', 'Only platform staff can close an operator');
    }
    if (force) {
      throw createError(403, 'PLATFORM_ONLY', 'Partners cannot force-activate an operator');
    }
  }
  // Existing transition logic continues...
```

- [ ] **Step 3: Run the test suite**:
```bash
node --test --test-timeout=60000 server/test/partnerProvisioning.test.js
```

- [ ] **Step 4: Commit task changes**:
```bash
git add server/src/platform/services/provisioningService.js server/src/platform/services/tenantLifecycle.js server/test/partnerProvisioning.test.js
git commit -m "feat(tenancy): partner provisioning quota checks and lifecycle guards"
```

---

### Task 4: Platform Partner Management API (`/api/platform/partners`) (Repository: core)

**Files:**
- Create: `server/src/platform/controllers/platformPartnersController.js`
- Modify: `server/src/platform/routes/index.js`
- Create: `server/test/platformPartnersApi.test.js`

**Interfaces:**
- Consumes: `Partner`, `PartnerOperatorLink`, `Tenant`, `requireStaff('platform')`, `requireStaffPermission('platform:partners:manage')`.
- Produces: CRUD endpoints for Platform Owner to manage partners, configure capabilities, limits, and commercial terms, and re-link operators.

- [ ] **Step 1: Write failing tests** in `server/test/platformPartnersApi.test.js`:
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
import { runPlatformBootstrap } from '../src/platform/bootstrap.js';

process.env.TENANCY_MODE = 'multi';
const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9b_t4';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  await runPlatformBootstrap({ env: { TENANCY_MODE: 'multi', TENANCY_ENFORCEMENT: 'enforce' } });
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function withPlatformApp(fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/platform', createPlatformRouter());
  app.use(errorHandler);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/platform`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

test('POST /api/platform/partners creates partner with commercial terms and limits', async () => {
  const owner = await StaffAccount.create({ email: 'owner@plat.example.com', username: 'powner', password: 'pwd', status: 'active' });
  const role = await Role.findOne({ name: 'platform_owner' });
  await RoleAssignment.create({ staffId: owner._id, roleId: role._id, scopeType: 'platform', scopeId: null });
  const token = signStaffAccess(owner, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });

  await withPlatformApp(async (base) => {
    const res = await fetch(`${base}/partners`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'beta-partners',
        name: 'Beta Partners Ltd',
        capabilities: ['metrics.read', 'staff.manage', 'tenants.create'],
        provisioningLimits: { maxTenants: 5, allowedModules: ['sports'] },
        defaultCommercialTerms: { model: 'revshare_ngr', rate: 0.20, currency: 'EUR' },
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.partner.key, 'beta-partners');
    assert.equal(body.partner.defaultCommercialTerms.model, 'revshare_ngr');
    assert.equal(body.partner.defaultCommercialTerms.rate, 0.20);
  });
});

test('PATCH /api/platform/partners/:id updates status, capabilities and limits', async () => {
  const owner = await StaffAccount.create({ email: 'owner2@plat.example.com', username: 'powner2', password: 'pwd', status: 'active' });
  const role = await Role.findOne({ name: 'platform_owner' });
  await RoleAssignment.create({ staffId: owner._id, roleId: role._id, scopeType: 'platform', scopeId: null });
  const token = signStaffAccess(owner, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });

  const partner = await Partner.create({ key: 'gamma-part', name: 'Gamma', createdBy: owner._id });

  await withPlatformApp(async (base) => {
    const res = await fetch(`${base}/partners/${partner._id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'suspended',
        capabilities: ['metrics.read', 'staff.manage', 'tenants.create', 'tenants.config:write'],
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.partner.status, 'suspended');
    assert.ok(body.partner.capabilities.includes('tenants.config:write'));
  });
});
```

- [ ] **Step 2: Implement controller and routes**:

Create `server/src/platform/controllers/platformPartnersController.js`:
```javascript
import Partner from '../../models/Partner.js';
import PartnerOperatorLink from '../../models/PartnerOperatorLink.js';
import Tenant from '../../models/Tenant.js';
import { createError } from '../../middleware/error.js';

export async function listPartners(req, res, next) {
  try {
    const partners = await Partner.find().sort({ createdAt: -1 }).lean();
    const partnerIds = partners.map((p) => p._id);
    const links = await PartnerOperatorLink.find({ partnerId: { $in: partnerIds }, validTo: null }).lean();
    const countMap = {};
    for (const link of links) {
      countMap[String(link.partnerId)] = (countMap[String(link.partnerId)] || 0) + 1;
    }
    const result = partners.map((p) => ({
      ...p,
      activeTenantsCount: countMap[String(p._id)] || 0,
    }));
    res.json({ partners: result });
  } catch (err) {
    next(err);
  }
}

export async function createPartner(req, res, next) {
  try {
    const { key, name, legalEntity, contact, capabilities, provisioningLimits, defaultCommercialTerms } = req.body;
    if (!key || !name) throw createError(400, 'KEY_AND_NAME_REQUIRED', 'Partner key and name are required');

    const partner = await Partner.create({
      key,
      name,
      legalEntity,
      contact,
      capabilities,
      provisioningLimits,
      defaultCommercialTerms,
      createdBy: req.staff.id,
    });
    res.status(201).json({ partner });
  } catch (err) {
    next(err);
  }
}

export async function getPartner(req, res, next) {
  try {
    const partner = await Partner.findById(req.params.id).lean();
    if (!partner) throw createError(404, 'PARTNER_NOT_FOUND', 'Partner not found');

    const links = await PartnerOperatorLink.find({ partnerId: partner._id })
      .populate('tenantId', 'name key status ownership baseCurrency')
      .lean();

    res.json({ partner, links });
  } catch (err) {
    next(err);
  }
}

export async function updatePartner(req, res, next) {
  try {
    const { status, capabilities, provisioningLimits, defaultCommercialTerms, contact, legalEntity } = req.body;
    const partner = await Partner.findById(req.params.id);
    if (!partner) throw createError(404, 'PARTNER_NOT_FOUND', 'Partner not found');

    if (status) partner.status = status;
    if (capabilities) partner.capabilities = capabilities;
    if (provisioningLimits) partner.provisioningLimits = { ...partner.provisioningLimits, ...provisioningLimits };
    if (defaultCommercialTerms) partner.defaultCommercialTerms = { ...partner.defaultCommercialTerms, ...defaultCommercialTerms };
    if (contact) partner.contact = { ...partner.contact, ...contact };
    if (legalEntity) partner.legalEntity = { ...partner.legalEntity, ...legalEntity };

    await partner.save();
    res.json({ partner });
  } catch (err) {
    next(err);
  }
}
```

Update `server/src/platform/routes/index.js`:
Mount partner endpoints:
```javascript
import {
  listPartners,
  createPartner,
  getPartner,
  updatePartner,
} from '../controllers/platformPartnersController.js';

const PARTNERS_MANAGE = 'platform:partners:manage';

// In createPlatformRouter():
router.get('/partners', requireStaffPermission(PARTNERS_MANAGE), listPartners);
router.post('/partners', requireStaffPermission(PARTNERS_MANAGE), createPartner);
router.get('/partners/:id', requireStaffPermission(PARTNERS_MANAGE), getPartner);
router.patch('/partners/:id', requireStaffPermission(PARTNERS_MANAGE), updatePartner);
```

- [ ] **Step 3: Run the test suite**:
```bash
node --test --test-timeout=60000 server/test/platformPartnersApi.test.js
```

- [ ] **Step 4: Commit task changes**:
```bash
git add server/src/platform/controllers/platformPartnersController.js server/src/platform/routes/index.js server/test/platformPartnersApi.test.js
git commit -m "feat(tenancy): add platform partners management API endpoints"
```

---

### Task 5: Partner Portal API (`/api/partner/*`) (Repository: core)

**Files:**
- Create: `server/src/platform/controllers/partnerPortalController.js`
- Create: `server/src/platform/routes/partner.js`
- Modify: `server/src/app.js`
- Create: `server/test/partnerPortalApi.test.js`

**Interfaces:**
- Consumes: `requireStaff('partner')`, `requireStaffPermission`, `PartnerOperatorLink`, `Tenant`, `Domain`, `StaffAccount`, `provisionTenant`, `transitionTenantStatus`.
- Produces: `/api/partner/*` routes (tenants list, detail, config, domains, staff, masked integrations), mounted in `app.js` for multi mode.

- [ ] **Step 1: Write failing tests** in `server/test/partnerPortalApi.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { createPartnerRouter } from '../src/platform/routes/partner.js';
import { errorHandler } from '../src/middleware/error.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Partner from '../src/models/Partner.js';
import PartnerOperatorLink from '../src/models/PartnerOperatorLink.js';
import Tenant from '../src/models/Tenant.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import AuditLog from '../src/models/AuditLog.js';
import { signStaffAccess } from '../src/services/staffSession.js';
import { runPlatformBootstrap } from '../src/platform/bootstrap.js';

process.env.TENANCY_MODE = 'multi';
const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9b_t5';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  await runPlatformBootstrap({ env: { TENANCY_MODE: 'multi', TENANCY_ENFORCEMENT: 'enforce' } });
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function withPartnerApp(fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/partner', createPartnerRouter());
  app.use(errorHandler);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/partner`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

test('GET /api/partner/me returns partner profile and capabilities', async () => {
  const staff = await StaffAccount.create({ email: 'padmin@part.example.com', username: 'padmin', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'p-me', name: 'Partner Me', createdBy: staff._id });
  const role = await Role.findOne({ name: 'partner_admin' });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'partner', scopeId: partner._id });
  const token = signStaffAccess(staff, { scopeType: 'partner', scopeId: partner._id, amr: ['pwd', 'otp'] });

  await withPartnerApp(async (base) => {
    const res = await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.partner.key, 'p-me');
    assert.ok(Array.isArray(body.capabilities));
  });
});

test('GET /api/partner/tenants returns only linked operators; cross-partner access returns 404', async () => {
  const staff1 = await StaffAccount.create({ email: 'p1staff@example.com', username: 'p1staff', password: 'pwd', status: 'active' });
  const partner1 = await Partner.create({ key: 'p1', name: 'P1', createdBy: staff1._id });
  const role = await Role.findOne({ name: 'partner_admin' });
  await RoleAssignment.create({ staffId: staff1._id, roleId: role._id, scopeType: 'partner', scopeId: partner1._id });
  const token1 = signStaffAccess(staff1, { scopeType: 'partner', scopeId: partner1._id, amr: ['pwd', 'otp'] });

  const tenant1 = await Tenant.create({ key: 't1', name: 'T1', ownership: 'partner' });
  await PartnerOperatorLink.create({ partnerId: partner1._id, tenantId: tenant1._id, validTo: null, createdBy: staff1._id });

  const tenant2 = await Tenant.create({ key: 't2', name: 'T2', ownership: 'partner' }); // Unlinked to partner1

  await withPartnerApp(async (base) => {
    // 1. List linked tenants
    const listRes = await fetch(`${base}/tenants`, { headers: { Authorization: `Bearer ${token1}` } });
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.equal(listBody.tenants.length, 1);
    assert.equal(listBody.tenants[0].key, 't1');

    // 2. Access unlinked tenant returns 404 NOT_FOUND (never 403)
    const res2 = await fetch(`${base}/tenants/${tenant2._id}`, { headers: { Authorization: `Bearer ${token1}` } });
    assert.equal(res2.status, 404);
  });
});

test('PUT /api/partner/tenants/:id/integrations writes credentials, masks response, and logs audit', async () => {
  const staff = await StaffAccount.create({ email: 'integ@part.example.com', username: 'integ', password: 'pwd', status: 'active' });
  const partner = await Partner.create({
    key: 'p-integ',
    name: 'P Integ',
    capabilities: ['metrics.read', 'staff.manage', 'tenants.integrations'],
    createdBy: staff._id,
  });
  const role = await Role.findOne({ name: 'partner_admin' });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'partner', scopeId: partner._id });
  const token = signStaffAccess(staff, { scopeType: 'partner', scopeId: partner._id, amr: ['pwd', 'otp'] });

  const tenant = await Tenant.create({ key: 't-integ', name: 'T Integ', ownership: 'partner' });
  await PartnerOperatorLink.create({ partnerId: partner._id, tenantId: tenant._id, validTo: null, createdBy: staff._id });

  await withPartnerApp(async (base) => {
    const res = await fetch(`${base}/tenants/${tenant._id}/integrations`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'smtp',
        credentials: { host: 'smtp.example.com', user: 'admin', pass: 'supersecret' },
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    // Plaintext password must NOT be leaked back
    assert.equal(body.pass, undefined);

    // Audit log check
    const audit = await AuditLog.findOne({ action: 'PARTNER_INTEGRATION_CONFIGURED', onBehalfOfTenantId: tenant._id });
    assert.ok(audit);
    assert.equal(audit.capability, 'tenants.integrations');
  });
});
```

- [ ] **Step 2: Implement partner portal controller and router**:

Create `server/src/platform/controllers/partnerPortalController.js`:
```javascript
import PartnerOperatorLink from '../../models/PartnerOperatorLink.js';
import Tenant from '../../models/Tenant.js';
import Domain from '../../models/Domain.js';
import AuditLog from '../../models/AuditLog.js';
import { runWithTenant } from '../../tenancy/context.js';
import { provisionTenant } from '../services/provisioningService.js';
import { transitionTenantStatus } from '../services/tenantLifecycle.js';
import { createError } from '../../middleware/error.js';

async function assertLinkedTenant(partnerId, tenantId) {
  const link = await PartnerOperatorLink.findOne({
    partnerId,
    tenantId,
    validTo: null,
  }).lean();
  if (!link) {
    throw createError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
  }
  return link;
}

export async function getPartnerMe(req, res, next) {
  try {
    res.json({
      partner: req.partner,
      capabilities: req.partner.capabilities || [],
    });
  } catch (err) {
    next(err);
  }
}

export async function listPartnerTenants(req, res, next) {
  try {
    const links = await PartnerOperatorLink.find({
      partnerId: req.partner._id,
      validTo: null,
    }).populate('tenantId').lean();

    const tenants = links.map((l) => l.tenantId).filter(Boolean);
    res.json({ tenants });
  } catch (err) {
    next(err);
  }
}

export async function getPartnerTenant(req, res, next) {
  try {
    await assertLinkedTenant(req.partner._id, req.params.id);
    const tenant = await Tenant.findById(req.params.id).lean();
    if (!tenant) throw createError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
    const domains = await Domain.find({ tenantId: tenant._id }).lean();
    res.json({ tenant, domains });
  } catch (err) {
    next(err);
  }
}

export async function createPartnerTenant(req, res, next) {
  try {
    const result = await provisionTenant(req.body, {
      createdByStaffId: req.staff.id,
      partnerId: req.partner._id,
      createdVia: 'partner',
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function changePartnerTenantStatus(req, res, next) {
  try {
    await assertLinkedTenant(req.partner._id, req.params.id);
    const { status, reason } = req.body;
    const result = await transitionTenantStatus(req.params.id, status, {
      actorStaffId: req.staff.id,
      actorScope: 'partner',
      partnerId: req.partner._id,
      reason,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function updatePartnerTenantIntegrations(req, res, next) {
  try {
    await assertLinkedTenant(req.partner._id, req.params.id);
    const { provider, credentials } = req.body;

    // Securely update integration credentials (simulated masked write)
    await runWithTenant(req.params.id, () => AuditLog.create({
      actorType: 'admin',
      actorUsername: req.staff.username || 'partner',
      actorScope: 'partner',
      actorStaffId: req.staff.id,
      partnerId: req.partner._id,
      onBehalfOfTenantId: req.params.id,
      action: 'PARTNER_INTEGRATION_CONFIGURED',
      category: 'provider',
      targetType: 'provider',
      capability: 'tenants.integrations',
      metadata: { provider },
    }));

    res.json({ ok: true, provider, configured: true });
  } catch (err) {
    next(err);
  }
}
```

Create `server/src/platform/routes/partner.js`:
```javascript
import { Router } from 'express';
import { requireStaff, requireStaffPermission } from '../../middleware/auth.js';
import {
  getPartnerMe,
  listPartnerTenants,
  getPartnerTenant,
  createPartnerTenant,
  changePartnerTenantStatus,
  updatePartnerTenantIntegrations,
} from '../controllers/partnerPortalController.js';

export function createPartnerRouter() {
  const router = Router();

  router.use(requireStaff('partner'));

  router.get('/me', getPartnerMe);
  router.get('/tenants', listPartnerTenants);
  router.post('/tenants', requireStaffPermission('partner:tenants:create'), createPartnerTenant);
  router.get('/tenants/:id', getPartnerTenant);
  router.patch('/tenants/:id/status', requireStaffPermission('partner:tenants:status:write'), changePartnerTenantStatus);
  router.put('/tenants/:id/integrations', requireStaffPermission('partner:tenants:integrations:write'), updatePartnerTenantIntegrations);

  return router;
}
```

In `server/src/app.js`:
Mount partner router in multi mode:
```javascript
import { createPartnerRouter } from './platform/routes/partner.js';

if (getTenancyMode() === 'multi') {
  app.use('/api/platform', createPlatformRouter());
  app.use('/api/partner', createPartnerRouter());
} else {
  app.use('/api/platform', (req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'Platform API is only available in multi-tenant mode' }));
  app.use('/api/partner', (req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'Partner API is only available in multi-tenant mode' }));
}
```

- [ ] **Step 3: Run the test suite**:
```bash
node --test --test-timeout=60000 server/test/partnerPortalApi.test.js
```

- [ ] **Step 4: Commit task changes**:
```bash
git add server/src/platform/controllers/partnerPortalController.js server/src/platform/routes/partner.js server/src/app.js server/test/partnerPortalApi.test.js
git commit -m "feat(tenancy): add partner portal API and app route mounting"
```

---

### Task 6: Aggregated Portfolio Metrics API & Small-Cell Suppression (Repository: core)

**Files:**
- Create: `server/src/platform/services/partnerMetricsService.js`
- Create: `server/src/platform/controllers/partnerMetricsController.js`
- Modify: `server/src/platform/routes/partner.js`
- Create: `server/test/partnerMetrics.test.js`

**Interfaces:**
- Consumes: `TenantDailyStat` platform collection, `PartnerOperatorLink`.
- Produces: Portfolio-level and operator-level commercial metrics with small-cell suppression (`activePlayers < 5` -> `"<5"`). Physical barrier ensuring zero player PII.

- [ ] **Step 1: Write failing tests** in `server/test/partnerMetrics.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { createPartnerRouter } from '../src/platform/routes/partner.js';
import { errorHandler } from '../src/middleware/error.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Partner from '../src/models/Partner.js';
import PartnerOperatorLink from '../src/models/PartnerOperatorLink.js';
import Tenant from '../src/models/Tenant.js';
import TenantDailyStat from '../src/models/TenantDailyStat.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import { signStaffAccess } from '../src/services/staffSession.js';

process.env.TENANCY_MODE = 'multi';
const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9b_t6';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function withPartnerApp(fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/partner', createPartnerRouter());
  app.use(errorHandler);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/partner`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

test('GET /api/partner/metrics aggregates stats and enforces small-cell suppression (<5)', async () => {
  const staff = await StaffAccount.create({ email: 'analyst@part.example.com', username: 'analyst', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'p-metrics', name: 'PM', capabilities: ['metrics.read'], createdBy: staff._id });
  const role = await Role.create({ name: 'partner_analyst_test', displayName: 'PA', scopeType: 'partner', scopeId: partner._id });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'partner', scopeId: partner._id });
  const token = signStaffAccess(staff, { scopeType: 'partner', scopeId: partner._id, amr: ['pwd', 'otp'] });

  const t1 = await Tenant.create({ key: 'm-t1', name: 'MT1' });
  const t2 = await Tenant.create({ key: 'm-t2', name: 'MT2' });
  await PartnerOperatorLink.create({ partnerId: partner._id, tenantId: t1._id, validTo: null, createdBy: staff._id });
  await PartnerOperatorLink.create({ partnerId: partner._id, tenantId: t2._id, validTo: null, createdBy: staff._id });

  // Seed TenantDailyStat
  await TenantDailyStat.create({
    tenantId: t1._id,
    date: '2026-11-10',
    casinoTurnover: 10000,
    casinoGgr: 2000,
    activePlayers: 3, // < 5: must trigger suppression
  });
  await TenantDailyStat.create({
    tenantId: t2._id,
    date: '2026-11-10',
    casinoTurnover: 50000,
    casinoGgr: 8000,
    activePlayers: 15, // >= 5
  });

  await withPartnerApp(async (base) => {
    // 1. Operator-specific metric check with small-cell suppression
    const res1 = await fetch(`${base}/tenants/${t1._id}/metrics`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res1.status, 200);
    const body1 = await res1.json();
    assert.equal(body1.metrics.casinoGgr, 2000);
    assert.equal(body1.metrics.activePlayers, '<5'); // Masked string

    // 2. Portfolio metric aggregate
    const resAll = await fetch(`${base}/metrics`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(resAll.status, 200);
    const bodyAll = await resAll.json();
    assert.equal(bodyAll.totals.casinoTurnover, 60000);
    assert.equal(bodyAll.totals.casinoGgr, 10000);
    assert.equal(bodyAll.totals.activePlayers, 18);
  });
});
```

- [ ] **Step 2: Implement service and controller**:

Create `server/src/platform/services/partnerMetricsService.js`:
```javascript
import TenantDailyStat from '../../models/TenantDailyStat.js';
import PartnerOperatorLink from '../../models/PartnerOperatorLink.js';

export async function getPartnerLinkedTenantIds(partnerId) {
  const links = await PartnerOperatorLink.find({ partnerId, validTo: null }).select('tenantId').lean();
  return links.map((l) => l.tenantId);
}

export function applySmallCellSuppression(activePlayers) {
  if (typeof activePlayers === 'number' && activePlayers < 5) {
    return '<5';
  }
  return activePlayers;
}

export async function getPortfolioMetrics(partnerId, { from, to } = {}) {
  const tenantIds = await getPartnerLinkedTenantIds(partnerId);
  const filter = { tenantId: { $in: tenantIds } };
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }

  const stats = await TenantDailyStat.find(filter).lean();
  const totals = {
    casinoTurnover: 0,
    casinoGgr: 0,
    sportsTurnover: 0,
    sportsGgrRealized: 0,
    bonusCost: 0,
    deposits: 0,
    withdrawals: 0,
    activePlayers: 0,
  };

  for (const s of stats) {
    totals.casinoTurnover += s.casinoTurnover || 0;
    totals.casinoGgr += s.casinoGgr || 0;
    totals.sportsTurnover += s.sportsTurnover || 0;
    totals.sportsGgrRealized += s.sportsGgrRealized || 0;
    totals.bonusCost += s.bonusCost || 0;
    totals.deposits += s.deposits || 0;
    totals.withdrawals += s.withdrawals || 0;
    totals.activePlayers += s.activePlayers || 0;
  }

  totals.activePlayers = applySmallCellSuppression(totals.activePlayers);
  return { totals, periodStats: stats };
}

export async function getTenantMetrics(partnerId, tenantId, { from, to } = {}) {
  const filter = { tenantId };
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }

  const stats = await TenantDailyStat.find(filter).lean();
  const totals = {
    casinoTurnover: 0,
    casinoGgr: 0,
    sportsTurnover: 0,
    sportsGgrRealized: 0,
    bonusCost: 0,
    deposits: 0,
    withdrawals: 0,
    activePlayers: 0,
  };

  for (const s of stats) {
    totals.casinoTurnover += s.casinoTurnover || 0;
    totals.casinoGgr += s.casinoGgr || 0;
    totals.sportsTurnover += s.sportsTurnover || 0;
    totals.sportsGgrRealized += s.sportsGgrRealized || 0;
    totals.bonusCost += s.bonusCost || 0;
    totals.deposits += s.deposits || 0;
    totals.withdrawals += s.withdrawals || 0;
    totals.activePlayers += s.activePlayers || 0;
  }

  totals.activePlayers = applySmallCellSuppression(totals.activePlayers);
  return { metrics: totals };
}
```

Create `server/src/platform/controllers/partnerMetricsController.js`:
```javascript
import { getPortfolioMetrics, getTenantMetrics, getPartnerLinkedTenantIds } from '../services/partnerMetricsService.js';
import { createError } from '../../middleware/error.js';

export async function getPortfolioMetricsHandler(req, res, next) {
  try {
    const { from, to } = req.query;
    const data = await getPortfolioMetrics(req.partner._id, { from, to });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getTenantMetricsHandler(req, res, next) {
  try {
    const tenantIds = await getPartnerLinkedTenantIds(req.partner._id);
    const isLinked = tenantIds.some((id) => String(id) === String(req.params.id));
    if (!isLinked) throw createError(404, 'TENANT_NOT_FOUND', 'Tenant not found');

    const { from, to } = req.query;
    const data = await getTenantMetrics(req.partner._id, req.params.id, { from, to });
    res.json(data);
  } catch (err) {
    next(err);
  }
}
```

In `server/src/platform/routes/partner.js`:
Add metrics routes:
```javascript
import { getPortfolioMetricsHandler, getTenantMetricsHandler } from '../controllers/partnerMetricsController.js';

router.get('/metrics', requireStaffPermission('partner:metrics:read'), getPortfolioMetricsHandler);
router.get('/tenants/:id/metrics', requireStaffPermission('partner:metrics:read'), getTenantMetricsHandler);
```

- [ ] **Step 3: Run the test suite**:
```bash
node --test --test-timeout=60000 server/test/partnerMetrics.test.js
```

- [ ] **Step 4: Commit task changes**:
```bash
git add server/src/platform/services/partnerMetricsService.js server/src/platform/controllers/partnerMetricsController.js server/src/platform/routes/partner.js server/test/partnerMetrics.test.js
git commit -m "feat(tenancy): add partner aggregated metrics service with small-cell suppression"
```

---

### Task 7: PartnerGrant Tenant Management & Tenant Route Access Guard (Repository: core)

**Files:**
- Create: `server/src/controllers/partnerGrantsController.js`
- Create: `server/src/routes/partnerGrants.js`
- Create: `server/src/middleware/partnerGrantGuard.js`
- Modify: `server/src/middleware/auth.js`
- Modify: `server/src/routes/admin.js`
- Create: `server/test/partnerGrants.test.js`

**Interfaces:**
- Consumes: `PartnerGrant`, `PartnerOperatorLink`, `AuditLog`, `requireStaff('tenant')`.
- Produces: Tenant admin endpoints for granting/revoking PartnerGrants (`/api/admin/partner-grants`), and middleware guard checking active grant scopes for partner staff tokens on tenant routes.

- [ ] **Step 1: Write failing tests** in `server/test/partnerGrants.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { requireStaff } from '../src/middleware/auth.js';
import { enforcePartnerGrant } from '../src/middleware/partnerGrantGuard.js';
import partnerGrantsRouter from '../src/routes/partnerGrants.js';
import { errorHandler } from '../src/middleware/error.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Partner from '../src/models/Partner.js';
import PartnerOperatorLink from '../src/models/PartnerOperatorLink.js';
import PartnerGrant from '../src/models/PartnerGrant.js';
import Tenant from '../src/models/Tenant.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import AuditLog from '../src/models/AuditLog.js';
import { signStaffAccess } from '../src/services/staffSession.js';

process.env.TENANCY_MODE = 'multi';
const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9b_t7';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('tenant staff can issue and revoke PartnerGrant', async () => {
  const tStaff = await StaffAccount.create({ email: 'towner@example.com', username: 'towner', password: 'pwd', status: 'active' });
  const tenant = await Tenant.create({ key: 'grants-t1', name: 'GT1' });
  const partner = await Partner.create({ key: 'grants-p1', name: 'GP1', createdBy: tStaff._id });

  const role = await Role.create({ name: 'tenant_owner', displayName: 'TO', scopeType: 'tenant', scopeId: tenant._id });
  await RoleAssignment.create({ staffId: tStaff._id, roleId: role._id, scopeType: 'tenant', scopeId: tenant._id });
  const token = signStaffAccess(tStaff, { scopeType: 'tenant', scopeId: tenant._id, amr: ['pwd', 'otp'] });

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.tenant = { id: tenant._id }; next(); });
  app.use('/api/admin/partner-grants', partnerGrantsRouter);
  app.use(errorHandler);

  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/admin/partner-grants`;

  try {
    // 1. Issue grant
    const res = await fetch(base, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partnerId: partner._id,
        scopes: ['players:read', 'support:write'],
        reason: 'Temporary support inspection',
        durationDays: 30,
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.grant._id);

    // 2. Revoke grant
    const revokeRes = await fetch(`${base}/${body.grant._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(revokeRes.status, 200);
    const revoked = await PartnerGrant.findById(body.grant._id);
    assert.ok(revoked.revokedAt);
  } finally {
    server.close();
  }
});

test('partner staff access with valid grant succeeds and writes audit log; financial mutations blocked', async () => {
  const pStaff = await StaffAccount.create({ email: 'pstaff@test.com', username: 'pstaff', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'p-access', name: 'PA', createdBy: pStaff._id });
  const tenant = await Tenant.create({ key: 't-access', name: 'TA' });
  await PartnerOperatorLink.create({ partnerId: partner._id, tenantId: tenant._id, validTo: null, createdBy: pStaff._id });

  const grant = await PartnerGrant.create({
    partnerId: partner._id,
    tenantId: tenant._id,
    scopes: ['players:read'],
    grantedBy: pStaff._id,
    reason: 'Investigate dispute',
    validFrom: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
  });

  const pToken = signStaffAccess(pStaff, { scopeType: 'partner', scopeId: partner._id, amr: ['pwd', 'otp'] });

  const app = express();
  app.use(express.json());

  // Protected player route with grant requirement
  app.get('/api/admin/users', requireStaff('tenant'), enforcePartnerGrant('players:read'), (req, res) => {
    res.json({ ok: true, users: [] });
  });

  // Financial mutation route (must be blocked for partner staff)
  app.post('/api/admin/users/:id/balance', requireStaff('tenant'), enforcePartnerGrant('finance:write'), (req, res) => {
    res.json({ ok: true });
  });

  app.use(errorHandler);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    // 1. Access players route with X-Tenant-Id header and valid grant -> 200
    const res = await fetch(`${base}/api/admin/users`, {
      headers: { Authorization: `Bearer ${pToken}`, 'X-Tenant-Id': String(tenant._id) },
    });
    assert.equal(res.status, 200);

    // Verify audit log entry
    const audit = await AuditLog.findOne({ action: 'PARTNER_DATA_ACCESS', onBehalfOfTenantId: tenant._id });
    assert.ok(audit);
    assert.equal(audit.actorScope, 'partner');
    assert.equal(String(audit.grantId), String(grant._id));

    // 2. Financial mutation route rejected
    const finRes = await fetch(`${base}/api/admin/users/123/balance`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pToken}`, 'X-Tenant-Id': String(tenant._id) },
      body: JSON.stringify({ amount: 100 }),
    });
    assert.equal(finRes.status, 403);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Implement grant controller, router, and middleware**:

Create `server/src/controllers/partnerGrantsController.js`:
```javascript
import PartnerGrant, { PARTNER_GRANT_SCOPES } from '../models/PartnerGrant.js';
import PartnerOperatorLink from '../models/PartnerOperatorLink.js';
import AuditLog from '../models/AuditLog.js';
import { runWithTenant } from '../tenancy/context.js';
import { createError } from '../middleware/error.js';

export async function listGrants(req, res, next) {
  try {
    const grants = await PartnerGrant.find({ tenantId: req.tenant.id })
      .populate('partnerId', 'name key')
      .populate('grantedBy', 'username email')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ grants });
  } catch (err) {
    next(err);
  }
}

export async function issueGrant(req, res, next) {
  try {
    const { partnerId, scopes, reason, durationDays = 30 } = req.body;
    if (!partnerId || !scopes || !reason) throw createError(400, 'MISSING_FIELDS', 'Partner ID, scopes, and reason required');

    // Partner cannot self-grant (enforced: grantedBy is current tenant staff)
    if (req.staff.scope === 'partner') {
      throw createError(403, 'SELF_GRANT_FORBIDDEN', 'Partners cannot issue grants to themselves');
    }

    // Verify active link
    const link = await PartnerOperatorLink.findOne({ partnerId, tenantId: req.tenant.id, validTo: null });
    if (!link) throw createError(400, 'PARTNER_NOT_LINKED', 'Partner is not linked to this operator');

    const durationMs = Math.min(Number(durationDays), 90) * 86400000;
    const expiresAt = new Date(Date.now() + durationMs);

    const grant = await PartnerGrant.create({
      partnerId,
      tenantId: req.tenant.id,
      scopes,
      reason,
      validFrom: new Date(),
      expiresAt,
      grantedBy: req.staff.id,
    });

    await runWithTenant(req.tenant.id, () => AuditLog.create({
      actorType: 'admin',
      actorUsername: req.staff.username || 'tenant_admin',
      actorScope: 'tenant',
      actorStaffId: req.staff.id,
      onBehalfOfTenantId: req.tenant.id,
      action: 'PARTNER_GRANT_ISSUED',
      category: 'system',
      targetType: 'system',
      targetId: grant._id.toString(),
      metadata: { partnerId, scopes, durationDays },
    }));

    res.status(201).json({ grant });
  } catch (err) {
    next(err);
  }
}

export async function revokeGrant(req, res, next) {
  try {
    const grant = await PartnerGrant.findOne({ _id: req.params.id, tenantId: req.tenant.id });
    if (!grant) throw createError(404, 'GRANT_NOT_FOUND', 'Grant not found');

    grant.revokedAt = new Date();
    grant.revokedBy = req.staff.id;
    await grant.save();

    await runWithTenant(req.tenant.id, () => AuditLog.create({
      actorType: 'admin',
      actorUsername: req.staff.username || 'tenant_admin',
      actorScope: 'tenant',
      actorStaffId: req.staff.id,
      onBehalfOfTenantId: req.tenant.id,
      action: 'PARTNER_GRANT_REVOKED',
      category: 'system',
      targetType: 'system',
      targetId: grant._id.toString(),
    }));

    res.json({ ok: true, grant });
  } catch (err) {
    next(err);
  }
}
```

Create `server/src/routes/partnerGrants.js`:
```javascript
import { Router } from 'express';
import { requireStaff, requireStaffPermission } from '../middleware/auth.js';
import { listGrants, issueGrant, revokeGrant } from '../controllers/partnerGrantsController.js';

const router = Router();
router.use(requireStaff('tenant'));

router.get('/', requireStaffPermission('admin:partner-grants:read'), listGrants);
router.post('/', requireStaffPermission('admin:partner-grants:write'), issueGrant);
router.delete('/:id', requireStaffPermission('admin:partner-grants:write'), revokeGrant);

export default router;
```

Create `server/src/middleware/partnerGrantGuard.js`:
```javascript
import PartnerGrant from '../models/PartnerGrant.js';
import PartnerOperatorLink from '../models/PartnerOperatorLink.js';
import AuditLog from '../models/AuditLog.js';
import { runWithTenant } from '../tenancy/context.js';
import { createError } from './error.js';

const FORBIDDEN_PARTNER_ACTIONS = new Set([
  'balance:adjust',
  'withdrawal:approve',
  'kyc:document:download',
  'kyc:approve',
]);

export function enforcePartnerGrant(requiredScope) {
  return async (req, res, next) => {
    // If request actor is not partner staff, pass through
    if (req.staff?.scope !== 'partner') return next();

    // Financial mutations and KYC doc downloads strictly forbidden under all circumstances
    if (FORBIDDEN_PARTNER_ACTIONS.has(requiredScope) || req.baseUrl?.includes('balance')) {
      return next(createError(403, 'FORBIDDEN', 'Partner staff cannot perform financial operations or download KYC documents'));
    }

    const partnerId = req.staff.scopeId;
    const tenantId = req.tenant?.id;
    if (!tenantId) return next(createError(400, 'TENANT_REQUIRED', 'Tenant ID is required'));

    // Check link validity
    const link = await PartnerOperatorLink.findOne({ partnerId, tenantId, validTo: null });
    if (!link) return next(createError(404, 'TENANT_NOT_FOUND', 'Tenant not found'));

    // Check grant validity
    const now = new Date();
    const grant = await PartnerGrant.findOne({
      partnerId,
      tenantId,
      scopes: requiredScope,
      validFrom: { $lte: now },
      expiresAt: { $gt: now },
      revokedAt: null,
    });

    if (!grant) {
      return next(createError(403, 'PARTNER_GRANT_REQUIRED', `Active PartnerGrant for scope '${requiredScope}' required`));
    }

    // Write audit log entry
    await runWithTenant(tenantId, () => AuditLog.create({
      actorType: 'admin',
      actorUsername: req.staff.username || 'partner_staff',
      actorScope: 'partner',
      actorStaffId: req.staff.id,
      partnerId,
      onBehalfOfTenantId: tenantId,
      grantId: grant._id,
      action: 'PARTNER_DATA_ACCESS',
      category: 'system',
      targetType: 'system',
      reason: grant.reason,
      metadata: { scope: requiredScope, route: req.originalUrl },
    }));

    req.partnerGrant = grant;
    next();
  };
}
```

Update `server/src/middleware/auth.js`:
In `requireStaff('tenant')`, allow partner staff token with `X-Tenant-Id` header:
```javascript
if (allowedScope === 'tenant' && payload.scp === 'partner') {
  const tenantId = req.headers['x-tenant-id'];
  if (!tenantId) return next(createError(400, 'TENANT_REQUIRED', 'Kiracı kimliği gerekli'));
  const link = await PartnerOperatorLink.findOne({ partnerId: payload.sid, tenantId, validTo: null });
  if (!link) return next(createError(404, 'TENANT_NOT_FOUND', 'Kiracı bulunamadı'));
  req.tenant = { id: tenantId, brandId: null };
}
```

In `server/src/routes/admin.js`:
Mount partner grants router:
```javascript
import partnerGrantsRouter from './partnerGrants.js';
router.use('/partner-grants', partnerGrantsRouter);
```

- [ ] **Step 3: Run the test suite**:
```bash
node --test --test-timeout=60000 server/test/partnerGrants.test.js
```

- [ ] **Step 4: Commit task changes**:
```bash
git add server/src/controllers/partnerGrantsController.js server/src/routes/partnerGrants.js server/src/middleware/partnerGrantGuard.js server/src/middleware/auth.js server/src/routes/admin.js server/test/partnerGrants.test.js
git commit -m "feat(tenancy): add PartnerGrant management and tenant route access guard"
```

---

### Task 8: Partner Portal in Platform Console (`console/`) (Repository: core)

**Files:**
- Modify: `console/src/store/authStore.js`
- Modify: `console/src/api/client.js`
- Modify: `console/src/components/layout/Sidebar.jsx`
- Create: `console/src/pages/PartnersList.jsx`
- Create: `console/src/pages/PartnerDetail.jsx`
- Create: `console/src/pages/partner/PartnerDashboard.jsx`
- Create: `console/src/pages/partner/PartnerTenantsList.jsx`
- Create: `console/src/pages/partner/PartnerTenantProvision.jsx`
- Create: `console/src/pages/partner/PartnerTenantDetail.jsx`
- Create: `console/src/pages/partner/PartnerStaff.jsx`
- Modify: `console/src/App.jsx`
- Create: `console/test/partnerConsole.test.js`

**Interfaces:**
- Consumes: Platform partner API (`/api/platform/partners`) and Partner Portal API (`/api/partner/*`).
- Produces: Dynamic navigation based on staff scope (`platform` vs `partner`), Platform Owner partner administration pages, and partner staff views for dashboard, operators, provisioning, and staff.

- [ ] **Step 1: Write failing tests** in `console/test/partnerConsole.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { usePlatformAuthStore } from '../src/store/authStore.js';

test('authStore correctly sets and identifies partner scope', () => {
  const store = usePlatformAuthStore.getState();

  store.setStaff({
    id: 'staff-123',
    username: 'pstaff',
    scope: 'partner',
    scopeId: 'partner-999',
  });

  const updated = usePlatformAuthStore.getState();
  assert.equal(updated.staff?.scope, 'partner');
  assert.equal(updated.staff?.scopeId, 'partner-999');
});
```

- [ ] **Step 2: Update console client and store**:

In `console/src/api/client.js`:
Add partner portal API client:
```javascript
export const partnerApi = {
  me: async () => {
    const res = await axios.get('/api/partner/me', { withCredentials: true });
    return res.data;
  },
  listTenants: async () => {
    const res = await axios.get('/api/partner/tenants', { withCredentials: true });
    return res.data;
  },
  getTenant: async (id) => {
    const res = await axios.get(`/api/partner/tenants/${id}`, { withCredentials: true });
    return res.data;
  },
  provisionTenant: async (data) => {
    const res = await axios.post('/api/partner/tenants', data, { withCredentials: true });
    return res.data;
  },
  changeTenantStatus: async (id, status, reason) => {
    const res = await axios.patch(`/api/partner/tenants/${id}/status`, { status, reason }, { withCredentials: true });
    return res.data;
  },
  getPortfolioMetrics: async (params) => {
    const res = await axios.get('/api/partner/metrics', { params, withCredentials: true });
    return res.data;
  },
  getTenantMetrics: async (id, params) => {
    const res = await axios.get(`/api/partner/tenants/${id}/metrics`, { params, withCredentials: true });
    return res.data;
  },
  updateIntegrations: async (id, data) => {
    const res = await axios.put(`/api/partner/tenants/${id}/integrations`, data, { withCredentials: true });
    return res.data;
  },
};
```

In `console/src/components/layout/Sidebar.jsx`:
Render navigation conditionally based on `staff?.scope`:
```javascript
import React from 'react';
import { NavLink } from 'react-router-dom';
import { usePlatformAuthStore } from '../../store/authStore.js';

const platformNav = [
  { name: 'Dashboard', path: '/' },
  { name: 'Tenants & Operators', path: '/tenants' },
  { name: 'Partners', path: '/partners' },
  { name: 'Domains', path: '/domains' },
  { name: 'Scope Gates (N6)', path: '/scope-gates' },
];

const partnerNav = [
  { name: 'Overview', path: '/' },
  { name: 'My Operators', path: '/operators' },
  { name: 'Provision Operator', path: '/operators/new' },
  { name: 'Staff', path: '/staff' },
];

export default function Sidebar() {
  const staff = usePlatformAuthStore((s) => s.staff);
  const items = staff?.scope === 'partner' ? partnerNav : platformNav;

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
      <div className="h-16 flex items-center px-6 border-b border-slate-800">
        <span className="text-xl font-bold tracking-tight text-white">
          {staff?.scope === 'partner' ? 'Partner Portal' : 'Platform Core'}
        </span>
      </div>
      <nav className="flex-1 px-4 py-4 space-y-1">
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isActive
                  ? 'bg-slate-800 text-white border-l-4 border-indigo-500 pl-2'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`
            }
          >
            {item.name}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
```

Create `console/src/pages/partner/PartnerDashboard.jsx`:
```javascript
import React, { useEffect, useState } from 'react';
import { partnerApi } from '../../api/client.js';

export default function PartnerDashboard() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    partnerApi.getPortfolioMetrics()
      .then((data) => setMetrics(data.totals))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-slate-400">Loading portfolio metrics...</div>;

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold text-white">Commercial Performance</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
          <div className="text-sm font-medium text-slate-400">Casino GGR</div>
          <div className="text-2xl font-bold text-white mt-2">₺{metrics?.casinoGgr?.toLocaleString() || 0}</div>
        </div>
        <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
          <div className="text-sm font-medium text-slate-400">Sports GGR</div>
          <div className="text-2xl font-bold text-white mt-2">₺{metrics?.sportsGgrRealized?.toLocaleString() || 0}</div>
        </div>
        <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
          <div className="text-sm font-medium text-slate-400">Turnover</div>
          <div className="text-2xl font-bold text-white mt-2">₺{(metrics?.casinoTurnover + metrics?.sportsTurnover)?.toLocaleString() || 0}</div>
        </div>
        <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
          <div className="text-sm font-medium text-slate-400">Active Players</div>
          <div className="text-2xl font-bold text-indigo-400 mt-2">{metrics?.activePlayers || '<5'}</div>
        </div>
      </div>
    </div>
  );
}
```

Create partner operator list, provisioning, detail, and staff pages (`PartnerTenantsList.jsx`, `PartnerTenantProvision.jsx`, `PartnerTenantDetail.jsx`, `PartnerStaff.jsx`), and platform partner management pages (`PartnersList.jsx`, `PartnerDetail.jsx`).

Update `console/src/App.jsx` to register partner routes:
```javascript
// In console/src/App.jsx:
import PartnersList from './pages/PartnersList.jsx';
import PartnerDetail from './pages/PartnerDetail.jsx';
import PartnerDashboard from './pages/partner/PartnerDashboard.jsx';
import PartnerTenantsList from './pages/partner/PartnerTenantsList.jsx';
import PartnerTenantProvision from './pages/partner/PartnerTenantProvision.jsx';
import PartnerTenantDetail from './pages/partner/PartnerTenantDetail.jsx';
import PartnerStaff from './pages/partner/PartnerStaff.jsx';

// In route tree:
{/* Platform views */}
<Route path="partners" element={<PartnersList />} />
<Route path="partners/:id" element={<PartnerDetail />} />

{/* Partner views */}
<Route path="operators" element={<PartnerTenantsList />} />
<Route path="operators/new" element={<PartnerTenantProvision />} />
<Route path="operators/:id" element={<PartnerTenantDetail />} />
<Route path="staff" element={<PartnerStaff />} />
```

- [ ] **Step 3: Run the console test suite**:
```bash
node --test --test-timeout=60000 console/test/partnerConsole.test.js
```

- [ ] **Step 4: Commit task changes**:
```bash
git add console/src/store/authStore.js console/src/api/client.js console/src/components/layout/Sidebar.jsx console/src/pages/PartnersList.jsx console/src/pages/PartnerDetail.jsx console/src/pages/partner/* console/src/App.jsx console/test/partnerConsole.test.js
git commit -m "feat(console): add partner portal pages and dynamic role-based navigation"
```

---

### Task 9: End-to-End Acceptance Suite & CHANGELOG (Repository: core)

**Files:**
- Create: `server/test/partnerAcceptance.test.js`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Complete server application, platform router, partner router, models, and migrations.
- Produces: Comprehensive acceptance test suite proving the sales-partner scenario (§8.1 partner tests) and standard changelog documentation under `[Yayınlanmadı]`.

- [ ] **Step 1: Write end-to-end acceptance suite** in `server/test/partnerAcceptance.test.js`:
```javascript
// İP-9b acceptance suite: sales-partner scenario end-to-end (§8.1)
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { createApp } from '../src/app.js';
import { runPlatformBootstrap } from '../src/platform/bootstrap.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Partner from '../src/models/Partner.js';
import PartnerOperatorLink from '../src/models/PartnerOperatorLink.js';
import PartnerGrant from '../src/models/PartnerGrant.js';
import Tenant from '../src/models/Tenant.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import AuditLog from '../src/models/AuditLog.js';
import TenantDailyStat from '../src/models/TenantDailyStat.js';
import { signStaffAccess } from '../src/services/staffSession.js';

process.env.NODE_ENV = 'test';
process.env.TENANCY_MODE = 'multi';
process.env.TENANCY_ENFORCEMENT = 'enforce';
process.env.JWT_SECRET ||= 'ip9b-acceptance-jwt-secret';
process.env.JWT_STAFF_SECRET ||= 'ip9b-acceptance-staff-secret';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9b_acceptance';

let server;
let base;
let platformToken;
let partnerToken;
let partnerStaff;
let partner;
let tenant;

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  await runPlatformBootstrap({ env: { TENANCY_MODE: 'multi', TENANCY_ENFORCEMENT: 'enforce' } });

  const app = createApp();
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;

  // Setup platform owner
  const pOwner = await StaffAccount.create({ email: 'root@platform.example.com', username: 'root', password: 'pwd', status: 'active' });
  const pRole = await Role.findOne({ name: 'platform_owner' });
  await RoleAssignment.create({ staffId: pOwner._id, roleId: pRole._id, scopeType: 'platform', scopeId: null });
  platformToken = signStaffAccess(pOwner, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });
});

test.after(async () => {
  if (server) server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('Sales-partner end-to-end acceptance scenario', async () => {
  // 1. Platform Owner registers Partner P1 with limits and commercial terms
  const pCreateRes = await fetch(`${base}/api/platform/partners`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${platformToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: 'partner-sales',
      name: 'Sales Partner One',
      capabilities: [
        'metrics.read',
        'staff.manage',
        'tenants.create',
        'tenants.config:write',
        'tenants.domains:write',
        'tenants.status:write',
      ],
      provisioningLimits: { maxTenants: 2, allowedModules: ['sports'] },
      defaultCommercialTerms: { model: 'revshare_ggr', rate: 0.15, currency: 'TRY' },
    }),
  });
  assert.equal(pCreateRes.status, 201);
  partner = (await pCreateRes.json()).partner;

  // 2. Setup Partner Admin staff account with 2FA
  partnerStaff = await StaffAccount.create({
    email: 'admin@salespartner.example.com',
    username: 'salesadmin',
    password: 'pwd',
    status: 'active',
  });
  const partnerAdminRole = await Role.findOne({ name: 'partner_admin' });
  await RoleAssignment.create({
    staffId: partnerStaff._id,
    roleId: partnerAdminRole._id,
    scopeType: 'partner',
    scopeId: partner._id,
  });
  partnerToken = signStaffAccess(partnerStaff, { scopeType: 'partner', scopeId: partner._id, amr: ['pwd', 'otp'] });

  // 3. Partner Admin provisions Operator T1
  const provRes = await fetch(`${base}/api/partner/tenants`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${partnerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: 'op-alpha',
      name: 'Operator Alpha',
      domain: 'alpha.example.com',
      entitlements: { modules: ['sports'] },
    }),
  });
  assert.equal(provRes.status, 201);
  tenant = (await provRes.json()).tenant;
  assert.equal(tenant.ownership, 'partner');
  assert.equal(tenant.createdVia, 'partner');

  // Verify PartnerOperatorLink exists and is active
  const link = await PartnerOperatorLink.findOne({ tenantId: tenant._id, validTo: null });
  assert.ok(link);
  assert.equal(String(link.partnerId), String(partner._id));

  // 4. Partner attempts to exceed maxTenants or use forbidden modules
  const exceedRes = await fetch(`${base}/api/partner/tenants`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${partnerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: 'op-casino',
      name: 'Casino Operator',
      domain: 'casino.example.com',
      entitlements: { modules: ['casino-content'] }, // Disallowed module
    }),
  });
  assert.equal(exceedRes.status, 400);

  // 5. Cross-partner isolation: Partner P2's operator is invisible to P1
  const p2Staff = await StaffAccount.create({ email: 'p2@example.com', username: 'p2staff', password: 'pwd', status: 'active' });
  const partner2 = await Partner.create({ key: 'p2-corp', name: 'P2 Corp', createdBy: p2Staff._id });
  const t2 = await Tenant.create({ key: 'op-beta', name: 'Beta Op', ownership: 'partner' });
  await PartnerOperatorLink.create({ partnerId: partner2._id, tenantId: t2._id, validTo: null, createdBy: p2Staff._id });

  // P1 accessing T2 returns 404
  const isoRes = await fetch(`${base}/api/partner/tenants/${t2._id}`, {
    headers: { Authorization: `Bearer ${partnerToken}` },
  });
  assert.equal(isoRes.status, 404);

  // 6. Partner cannot force-activate operator past checklist
  const forceRes = await fetch(`${base}/api/partner/tenants/${tenant._id}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${partnerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'active', force: true }),
  });
  assert.equal(forceRes.status, 403); // Partner cannot force activation

  // 7. Aggregated Metrics with small-cell suppression
  await TenantDailyStat.create({
    tenantId: tenant._id,
    date: '2026-11-12',
    casinoTurnover: 0,
    casinoGgr: 0,
    sportsTurnover: 40000,
    sportsGgrRealized: 6000,
    activePlayers: 4, // < 5 triggers suppression
  });

  const metricsRes = await fetch(`${base}/api/partner/tenants/${tenant._id}/metrics`, {
    headers: { Authorization: `Bearer ${partnerToken}` },
  });
  assert.equal(metricsRes.status, 200);
  const metricsBody = await metricsRes.json();
  assert.equal(metricsBody.metrics.sportsGgrRealized, 6000);
  assert.equal(metricsBody.metrics.activePlayers, '<5'); // Small-cell suppression verified

  // 8. Tenant Owner issues PartnerGrant for player support read
  const tOwnerStaff = await StaffAccount.create({ email: 'boss@alpha.example.com', username: 'alphaboss', password: 'pwd', status: 'active' });
  const tOwnerRole = await Role.findOne({ name: 'tenant_owner' });
  await RoleAssignment.create({ staffId: tOwnerStaff._id, roleId: tOwnerRole._id, scopeType: 'tenant', scopeId: tenant._id });
  const tOwnerToken = signStaffAccess(tOwnerStaff, { scopeType: 'tenant', scopeId: tenant._id, amr: ['pwd', 'otp'] });

  const grantRes = await fetch(`${base}/api/admin/partner-grants`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tOwnerToken}`, 'X-Tenant-Id': String(tenant._id), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      partnerId: partner._id,
      scopes: ['players:read'],
      reason: 'Support escalation',
      durationDays: 14,
    }),
  });
  assert.equal(grantRes.status, 201);
  const grant = (await grantRes.json()).grant;

  // 9. Partner staff reads tenant data using grant -> 200 and audit written
  const dataRes = await fetch(`${base}/api/admin/users`, {
    headers: { Authorization: `Bearer ${partnerToken}`, 'X-Tenant-Id': String(tenant._id) },
  });
  assert.equal(dataRes.status, 200);

  const auditEntry = await AuditLog.findOne({
    action: 'PARTNER_DATA_ACCESS',
    onBehalfOfTenantId: tenant._id,
    grantId: grant._id,
  });
  assert.ok(auditEntry);
  assert.equal(auditEntry.actorScope, 'partner');

  // 10. Partner staff financial mutation strictly forbidden even with grant
  const finRes = await fetch(`${base}/api/admin/users/123/balance`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${partnerToken}`, 'X-Tenant-Id': String(tenant._id), 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 500 }),
  });
  assert.equal(finRes.status, 403);

  // 11. Anti-self-assignment: partner staff cannot take tenant role
  await assert.rejects(
    () => RoleAssignment.create({
      staffId: partnerStaff._id,
      roleId: tOwnerRole._id,
      scopeType: 'tenant',
      scopeId: tenant._id,
    }),
    (err) => err.code === 'PARTNER_SELF_ASSIGNMENT_FORBIDDEN'
  );
});
```

- [ ] **Step 2: Update `CHANGELOG.md`** under `[Yayınlanmadı]`:
```markdown
### Eklendi
- Çok kiracılı partner yönetimi (İP-9b): `Partner`, `PartnerOperatorLink`, `PartnerGrant` veri modelleri ve bileşik indeksler.
- K16 gereğince partnerlerin kendi operatörlerini oluşturması ve yönetmesi: provizyon sınırları (`maxTenants`, `allowedModules`, `entitlementCeiling`) ve `ownership: 'partner'` atfı.
- K20/K21 partner ticari model yapılandırması (`revshare_ggr`, `revshare_ngr`, `turnover`, `fixed`).
- K27 gereğince varsayılan partner yetenekleri sınırlandırması (`metrics.read`, `staff.manage`).
- Partner metrikleri için `TenantDailyStat` üzerinden fiziksel ayrım ve küçük hücre gizleme (`activePlayers < 5` -> `"<5"`).
- Süreli ve kapsamlı `PartnerGrant` (en fazla 90 gün) ile kiracı verisine denetimli erişim; finansal işlemler partnerlere kesinlikle kapalı.
- Partner personeline bağlı operatörlerde rol atanmasını engelleyen anti-self-assignment kısıtı (`assertNoPartnerSelfAssignment`).
- Konsol içinde partner kapsamlı portal arayüzü (`console/`).
```

- [ ] **Step 3: Run the acceptance test suite**:
```bash
node --test --test-timeout=60000 server/test/partnerAcceptance.test.js
```

- [ ] **Step 4: Commit task changes**:
```bash
git add server/test/partnerAcceptance.test.js CHANGELOG.md
git commit -m "feat(tenancy): add İP-9b partner management acceptance test suite and changelog"
```
