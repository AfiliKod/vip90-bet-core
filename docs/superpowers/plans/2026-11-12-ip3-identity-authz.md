# İP-3 Identity and Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement work package İP-3 of the approved multi-tenant design: identity separation (`StaffAccount` distinct from player `User`), scoped roles and permissions (`RoleAssignment`), partner permission namespace (`partner:*`), two token families (`JWT_SECRET` for players, `JWT_STAFF_SECRET` for staff), Host resolution middleware (`Domain.host` mapping with 60s cache and default tenant fallback in single mode), staff 2FA policy (mandatory only in multi mode per K12; in single mode only for accounts that enabled it per İP-0 V2), compatible login for legacy single-mode admin accounts (G5), emergency staff recovery CLI (`scripts/staff-recover.mjs`), and comprehensive §8.1 cross-check acceptance test suite.

**Architecture:** Players remain in the tenant-owned `User` collection. All staff identities move to the platform model `StaffAccount` (`server/src/models/StaffAccount.js`). Roles gain scope fields (`scopeType: 'platform'|'partner'|'tenant'`, `scopeId`) in `server/src/models/Role.js`, and assignments live in `server/src/models/RoleAssignment.js` with an anti-self-assignment constraint preventing partner staff from taking tenant roles on linked operators. Two token families use distinct signing secrets: player access tokens use `JWT_SECRET` with `aud: 'player'` and `tid: tenantId`; staff access tokens use `JWT_STAFF_SECRET` with `aud: 'staff'`, `scp: scopeType`, `sid: scopeId`, and `amr: ['pwd','otp']`. The Host resolution middleware (`server/src/middleware/tenantHost.js`) resolves incoming hostnames against `Domain.host` with a 60-second in-memory cache, falls back to the default tenant in single mode, and binds ambient context via `tenantContext.run`. Staff 2FA is strictly enforced in multi mode on `/api/staff/*` endpoints, while single mode preserves optional 2FA. The G5 boot migration (`server/migrations/0007_tenancy_staff_accounts.js` + `server/src/tenancy/staffMigration.js`) copies existing admin `User`s to `StaffAccount` with identical `_id` values, promoting `super_admin` to both `platform_owner` and default-tenant `tenant_owner`, while preserving the legacy `User.role: 'admin'` login path at `/api/auth/login` so single-mode administrators log in with existing credentials and retain identical permissions. Emergency server-side recovery is provided by `scripts/staff-recover.mjs`.

**Tech Stack:** Node >= 22 (ESM), Express 4, Mongoose 8.24, `jsonwebtoken` 9.0, `speakeasy` 2.0, `node:test` + `node:assert/strict`, local MongoDB (replica set `rs0` on 127.0.0.1:27017).

**Spec:** `docs/superpowers/specs/2026-11-09-multi-tenant-design.md` (Turkish; canonical copy in `core-ipu`). Sections used: §0.2 (K3, K5, K7, K12, K16), §2.1 (rows User, StaffAccount, Role, Permission), §3 (isolation risk points 1, 2, 7, 10, 14), §4.3 (Platform Owner, Tenant, Brand/Domain, Partner, StaffAccount, RoleAssignment), §5 (all of section 5: identity separation, scoped roles, authority matrix, token families, host resolution), §6.3 (G5 staff separation), §7.1 (İP-3 row), §8.1 (acceptance cross-check suite), §9 (G-1, G-5, G-7, G-15).

---

## Global Constraints

- **Single mode backward compatibility (K8, K11, G5):** Single mode keeps working with existing admin accounts without credential resets. The legacy `User.role: 'admin'` path remains active alongside `StaffAccount` until G5 migration is fully verified. Existing admin accounts log in at `/api/auth/login` with the same username/password and receive identical permissions.
- **Never weaken an existing auth check:** All existing middleware protections (`requireAuth`, `requireAdmin`, `requirePermission`, `enforceAdminIp`, `auditLog`) must remain in force. New checks add defense-in-depth and cross-tenant boundaries without loosening existing security invariants.
- **StaffAccount is a platform model:** `StaffAccount`, `Role`, `RoleAssignment`, `Permission`, `Tenant`, `Domain` are platform models. They never receive the `tenantScoped` plugin and are never registered via `defineTenantModel`.
- **Identity separation (R3, §5.1):** Players reside in `User` (tenant-scoped). Staff reside in `StaffAccount` (platform-level identity, scoped via `RoleAssignment`). Same email across two operators creates two separate player accounts (K5), but staff accounts have globally unique emails.
- **Two token families (R3, §5.4):**
  - Player tokens: signed with `JWT_SECRET`, payload `{ sub: userId, typ: 'player', tid: tenantId, tv: tokenVersion, aud: 'player' }`.
  - Staff tokens: signed with `JWT_STAFF_SECRET`, payload `{ sub: staffId, typ: 'staff', scp: 'platform'|'partner'|'tenant', sid: scopeId|null, tv: tokenVersion, aud: 'staff', amr: ['pwd','otp'] }`.
  - A player token is never accepted by `requireStaff`. A staff token is never accepted by `requireAuth`.
- **Staff 2FA policy (K12, V2, G-7):**
  - Multi mode: 2FA is mandatory for all staff accounts. No staff access token can be issued without `amr` containing `'otp'`. First login without 2FA triggers forced setup before session issuance.
  - Single mode: 2FA is optional. Only accounts that explicitly enabled 2FA require TOTP on login (V2 fix). Accounts without 2FA log in with password alone.
- **Partner permission namespace and boundaries (§5.2, K3, K16, G-15):**
  - Partner permissions use prefix `partner:*`: `partner:metrics:read`, `partner:staff:write`, `partner:tenants:create`, `partner:tenants:config:write`, `partner:tenants:domains:write`, `partner:tenants:staff:write`, `partner:tenants:status:write`, `partner:tenants:integrations:write`, `partner:grants:use`.
  - Partner staff effective permission = `role.permissions ∩ Partner.capabilities ∩ (PartnerOperatorLink.capabilities || all)`.
  - Anti-self-assignment constraint: a staff member holding a role under `partnerId` cannot be assigned any tenant-scoped role on an operator linked to that partner.
  - Tenant roles can never be assigned `platform:*` permissions (validator rejects with 400).
- **Host resolution (§5.5):**
  - Requests resolve tenant via `Domain.host` with a 60s in-memory cache.
  - Unmatched domain in single mode falls back to default tenant (`isDefault: true`).
  - Unmatched domain in multi mode returns 404 `TENANT_NOT_FOUND` (never falls back to platform or another tenant).
  - Cross-check: player token `tid !== req.tenant.id` returns 401. Tenant staff token `sid !== req.tenant.id` returns 403.
- **Core never imports premium:** Public core provides hooks and interfaces; premium packages plug in via dynamic imports or dependency injection.
- **No syncIndexes or autoIndex disabling:** Schema options for autoIndex remain untouched. Compound indexes use explicit migration or registry.
- **Test database isolation:** Tests use dedicated databases (`vip90_test_ip3_*` on `mongodb://127.0.0.1:27017`), never read `MONGODB_URI`, allow override via `TENANCY_TEST_MONGO`, and drop databases in `after()`.
- **Language and commit hygiene:** Code comments in English. CHANGELOG entries in Turkish under `## [Yayınlanmadı]`. Commits add files by explicit path (never `git add -A` or `git add .`).

---

## Review Focus

- **Zero regression on legacy admin login (G5):** An existing administrator in single mode must be able to log in through `/api/auth/login` with unchanged username and password, receive a valid session, access `/admin`, and have all administrative permissions preserved.
- **Cross-tenant token replay rejection (G-1):** An access token issued for Tenant 1 (or Host 1) must be rejected with 401/403 when presented against Tenant 2 (or Host 2), across all REST endpoints and Socket.IO handshakes.
- **IDOR containment without information leakage (G-3):** An authenticated staff member of Tenant 1 querying an object ID belonging to Tenant 2 must receive 404 (not 403), ensuring resource existence is never disclosed across tenants.
- **Privilege escalation prevention (G-5, G-15):** Tenant roles must not accept `platform:*` permission keys. Partner staff must not assign themselves roles on linked tenants, and their actions must be strictly bounded by assigned capabilities.
- **2FA matrix correctness (K12, G-7):** In multi mode, every staff action requires verified 2FA (`amr` containing `'otp'`). In single mode, accounts without 2FA must log in smoothly while accounts with 2FA must prompt for code.
- **Emergency recovery safety (G5):** The CLI tool `scripts/staff-recover.mjs` must run directly against the database from the host terminal, recover lost owner credentials, reset locked 2FA, and maintain process idempotency.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `server/src/models/StaffAccount.js` (create) | Platform model: staff credentials, 2FA state, tokenVersion, safe serialization | 1 |
| `server/test/staffAccountModel.test.js` (create) | Unit tests for StaffAccount model, hashing, projection, and methods | 1 |
| `server/src/models/Role.js` (modify) | Add `scopeType`, `scopeId`, compound unique `{ scopeType, scopeId, name }` | 2 |
| `server/src/models/RoleAssignment.js` (create) | Platform model: staffId, roleId, scopeType, scopeId, anti-self-assignment check | 2 |
| `server/test/roleAssignmentModel.test.js` (create) | Unit tests for scoped Role and RoleAssignment schemas and constraints | 2 |
| `server/src/services/permissions.js` (modify) | Platform & partner namespaces, system role templates, scoped permission evaluator | 3 |
| `server/test/scopedPermissions.test.js` (create) | Unit tests for permission catalog, role inheritance, and capability capping | 3 |
| `server/src/middleware/tenantHost.js` (create) | Host header resolution, 60s domain cache, default fallback in single mode, 404 in multi | 4 |
| `server/test/tenantHostResolution.test.js` (create) | Unit & integration tests for Host resolution, caching, and fallback policies | 4 |
| `server/src/services/staffSession.js` (create) | Staff token family (`JWT_STAFF_SECRET`), cookie management, tokenVersion cache | 5 |
| `server/src/services/session.js` (modify) | Player token family (`JWT_SECRET`), audience/type hardening, backward compat | 5 |
| `server/test/tokenFamilies.test.js` (create) | Unit tests for token families, signatures, expiry, and separation | 5 |
| `server/src/controllers/staff2fa.js` (create) | Staff TOTP generation, confirmation, backup codes, challenge token verification | 6 |
| `server/src/routes/staff2fa.js` (create) | Express routes for staff 2FA setup, verify, and challenge login | 6 |
| `server/test/staffTwoFactor.test.js` (create) | Unit tests for staff 2FA lifecycle, backup codes, brute-force locking | 6 |
| `scripts/staff-recover.mjs` (create) | Server-side recovery CLI: password reset, 2FA reset, owner promotion/creation | 7 |
| `server/test/staffRecoverCli.test.js` (create) | Integration tests for recovery CLI execution and parameter parsing | 7 |
| `server/src/middleware/auth.js` (modify) | `requireStaff` middleware, scope checking, Host cross-checks, compatible `requireAdmin` | 8 |
| `server/src/services/socketAuth.js` (modify) | Socket.IO handshake verification for both player and staff tokens, room isolation | 8 |
| `server/test/authStaffMiddleware.test.js` (create) | Unit & integration tests for requireStaff, requireAuth hardening, and socket auth | 8 |
| `server/migrations/0007_tenancy_staff_accounts.js` (create) | G5 migration runner contract (`tenancy-004-staff-accounts`, version 1.3.0) | 9 |
| `server/src/tenancy/staffMigration.js` (create) | G5 migration logic: copy admin Users with same `_id`, assign roles, idempotent | 9 |
| `server/test/tenancyStaffMigration.test.js` (create) | Unit & idempotency tests for G5 staff account migration | 9 |
| `server/src/controllers/staffAuth.js` (create) | Staff login, 2FA prompt, refresh, me, logout handlers | 10 |
| `server/src/routes/staffAuth.js` (create) | Staff auth router: `/api/staff/auth/login`, `/refresh`, `/me`, `/logout` | 10 |
| `server/src/controllers/auth.js` (modify) | Compatible login in single mode: authenticate User & StaffAccount, bridge session | 10 |
| `server/src/app.js` (modify) | Mount `resolveTenantHost` middleware, mount `/api/staff/auth` routes | 10 |
| `server/test/compatibleLogin.test.js` (create) | Integration test for single-mode compatible admin login and multi-mode separation | 10 |
| `server/test/tenancyIdentityCrossChecks.test.js` (create) | §8.1 Acceptance suite: cross-tenant token replay, cross-host staff access, IDOR | 11 |
| `server/test/tenancyPartnerCapabilities.test.js` (create) | §8.1 Acceptance suite: partner capability bounds, anti-self-assignment, 404 leakage | 11 |
| `server/src/tenancy/index.js` (modify) | Re-export staff models, middlewares, and session utilities for add-ons | 12 |
| `CHANGELOG.md` (modify) | Turkish changelog entry under `## [Yayınlanmadı]` | 12 |
| `AGENTS.md` (modify) | Update identity separation, staff authentication, and 2FA policy guidelines | 12 |
| `docs/product/05-api-referansi.md` (modify) | Document staff auth endpoints, token families, and X-Tenant-Id header usage | 12 |
| `docs/product/11-admin-araclari.md` (modify) | Document `scripts/staff-recover.mjs` usage and options | 12 |
| `server/test/tenancyPublicSurface.test.js` (modify) | Assert all İP-3 tenancy exports are present | 12 |

---

## Parallelism

Tasks in the same wave touch disjoint files and can execute concurrently in separate worktrees.

| Wave | Tasks (run in parallel, separate worktrees) | Depends on |
|---|---|---|
| A | 1 (StaffAccount model), 2 (Role & RoleAssignment), 3 (Permissions catalog), 4 (Host resolution) | none |
| B | 5 (Token families & sessions), 6 (Staff 2FA), 7 (Recovery CLI) | 1, 2 |
| C | 8 (Auth middlewares & socket), 9 (G5 migration runner) | 1, 2, 3, 4, 5, 6 |
| D | 10 (Compatible login & app route wiring) | 5, 6, 8, 9 |
| E | 11 (§8.1 Acceptance cross-check suite) | 10 |
| F | 12 (Docs, public surface, AGENTS.md, CHANGELOG) | 11 |

Conflict notes:
- Task 1 and Task 2 are completely independent models.
- Task 5 modifies `services/session.js` and creates `services/staffSession.js`.
- Task 8 modifies `middleware/auth.js` and `services/socketAuth.js`.
- Task 10 is the only task modifying `app.js` and `controllers/auth.js`.
- Task 12 is the only task modifying `CHANGELOG.md` and documentation.

---

### Task 1: StaffAccount model, password hashing and safe serialization

**Files:**
- Create: `server/src/models/StaffAccount.js`
- Test: `server/test/staffAccountModel.test.js`

**Interfaces:**
- Consumes: `bcryptjs`, `mongoose`.
- Produces:
  - Default export: `mongoose.model('StaffAccount', staffAccountSchema)`
  - Schema fields:
    - `_id`: ObjectId (preserved during migration)
    - `email`: `{ type: String, required: true, unique: true, lowercase: true, trim: true }`
    - `username`: `{ type: String, required: true, trim: true }`
    - `password`: `{ type: String, required: true, select: false }`
    - `status`: `{ type: String, enum: ['active', 'suspended', 'closed'], default: 'active', index: true }`
    - `twoFactor`: `{ enabled: { type: Boolean, default: false }, secretEnc: { type: String, default: null, select: false }, backupCodesHash: { type: [String], default: [], select: false } }`
    - `tokenVersion`: `{ type: Number, default: 0 }`
    - `lastLoginAt`: `{ type: Date, default: null }`
    - `lastLoginIp`: `{ type: String, default: null }`
    - `createdBy`: `{ type: ObjectId, ref: 'StaffAccount', default: null }`
    - `timestamps`: `true`
  - Instance methods:
    - `comparePassword(candidate: string) -> Promise<boolean>`
    - `toSafeObject() -> object` (returns `{ id, email, username, status, twoFactorEnabled, tokenVersion, lastLoginAt }`, never includes password, secretEnc, or backupCodesHash)
  - Pre-save hook: hashes `password` with bcrypt (salt rounds 10) if modified.
  - Platform model declaration: never uses `defineTenantModel` or `tenantScoped`.

- [ ] **Step 1: Write the failing tests** in `server/test/staffAccountModel.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import StaffAccount from '../src/models/StaffAccount.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip3_t1';

describe('StaffAccount Model', () => {
  before(async () => {
    await mongoose.connect(TEST_DB);
    await StaffAccount.deleteMany({});
  });

  after(async () => {
    await StaffAccount.deleteMany({});
    await mongoose.disconnect();
  });

  it('hashes password on save and compares correctly', async () => {
    const staff = await StaffAccount.create({
      email: 'Staff1@Domain.COM',
      username: 'staff_one',
      password: 'SecretPassword123!',
    });
    assert.equal(staff.email, 'staff1@domain.com');
    assert.notEqual(staff.password, 'SecretPassword123!');
    assert.equal(await staff.comparePassword('SecretPassword123!'), true);
    assert.equal(await staff.comparePassword('WrongPassword'), false);
  });

  it('toSafeObject strips password and 2FA secrets', async () => {
    const staff = await StaffAccount.findOne({ email: 'staff1@domain.com' }).select('+password +twoFactor.secretEnc');
    const safe = staff.toSafeObject();
    assert.equal(safe.email, 'staff1@domain.com');
    assert.equal(safe.password, undefined);
    assert.equal(safe.secretEnc, undefined);
    assert.equal(safe.twoFactorEnabled, false);
  });

  it('enforces unique email case-insensitively', async () => {
    await assert.rejects(
      () => StaffAccount.create({ email: 'STAFF1@domain.com', username: 'staff_dup', password: 'Pass' }),
      /E11000/
    );
  });
});
```

- [ ] **Step 2: Implement StaffAccount model** in `server/src/models/StaffAccount.js`:
  - Define schema with fields, indexes, pre-save bcrypt hashing, `comparePassword`, and `toSafeObject`.
  - Export model as default export.

- [ ] **Step 3: Run the tests:**
```bash
node --test server/test/staffAccountModel.test.js
```

- [ ] **Step 4: Commit:**
```bash
git add server/src/models/StaffAccount.js server/test/staffAccountModel.test.js && git commit -m "feat(auth): add StaffAccount platform model with password hashing and safe serialization"
```

---

### Task 2: Scoped Role schema and RoleAssignment model

**Files:**
- Modify: `server/src/models/Role.js`
- Create: `server/src/models/RoleAssignment.js`
- Test: `server/test/roleAssignmentModel.test.js`

**Interfaces:**
- Consumes: `mongoose`.
- Produces:
  - `Role.js`:
    - Fields added:
      - `scopeType`: `{ type: String, enum: ['platform', 'partner', 'tenant'], required: true, default: 'tenant', index: true }`
      - `scopeId`: `{ type: ObjectId, default: null, index: true }` (null for platform scope or system templates)
    - Removes old `unique: true` on `name`.
    - Adds compound unique index: `{ scopeType: 1, scopeId: 1, name: 1 }` with `{ unique: true }`.
  - `RoleAssignment.js`:
    - Fields:
      - `staffId`: `{ type: ObjectId, ref: 'StaffAccount', required: true, index: true }`
      - `roleId`: `{ type: ObjectId, ref: 'Role', required: true }`
      - `scopeType`: `{ type: String, enum: ['platform', 'partner', 'tenant'], required: true, index: true }`
      - `scopeId`: `{ type: ObjectId, default: null, index: true }`
      - `grantedBy`: `{ type: ObjectId, ref: 'StaffAccount', default: null }`
    - Compound unique index: `{ staffId: 1, scopeType: 1, scopeId: 1, roleId: 1 }` with `{ unique: true }`.
    - Helper export: `assertNoPartnerSelfAssignment(staffId, tenantId)` checking if staff has a partner role linked to tenantId.

- [ ] **Step 1: Write the failing tests** in `server/test/roleAssignmentModel.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip3_t2';

describe('Scoped Role & RoleAssignment Models', () => {
  before(async () => {
    await mongoose.connect(TEST_DB);
    await Role.deleteMany({});
    await RoleAssignment.deleteMany({});
  });

  after(async () => {
    await Role.deleteMany({});
    await RoleAssignment.deleteMany({});
    await mongoose.disconnect();
  });

  it('allows same role name across different scopes', async () => {
    const r1 = await Role.create({ name: 'admin', displayName: 'Platform Admin', scopeType: 'platform', scopeId: null });
    const tenantId = new mongoose.Types.ObjectId();
    const r2 = await Role.create({ name: 'admin', displayName: 'Tenant Admin', scopeType: 'tenant', scopeId: tenantId });
    assert.ok(r1._id);
    assert.ok(r2._id);
  });

  it('rejects duplicate role name within same scope', async () => {
    await assert.rejects(
      () => Role.create({ name: 'admin', displayName: 'Dup', scopeType: 'platform', scopeId: null }),
      /E11000/
    );
  });

  it('enforces unique RoleAssignment per staff, scope, and role', async () => {
    const staffId = new mongoose.Types.ObjectId();
    const roleId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();
    await RoleAssignment.create({ staffId, roleId, scopeType: 'tenant', scopeId: tenantId });
    await assert.rejects(
      () => RoleAssignment.create({ staffId, roleId, scopeType: 'tenant', scopeId: tenantId }),
      /E11000/
    );
  });
});
```

- [ ] **Step 2: Update Role schema and create RoleAssignment model**:
  - In `server/src/models/Role.js`: add `scopeType`, `scopeId`, adjust indexes to `{ scopeType: 1, scopeId: 1, name: 1 }`.
  - In `server/src/models/RoleAssignment.js`: create schema with required fields and compound unique index.

- [ ] **Step 3: Run the tests:**
```bash
node --test server/test/roleAssignmentModel.test.js
```

- [ ] **Step 4: Commit:**
```bash
git add server/src/models/Role.js server/src/models/RoleAssignment.js server/test/roleAssignmentModel.test.js && git commit -m "feat(authz): add scoped Role fields and RoleAssignment platform model"
```

---

### Task 3: Permission catalog, partner namespace, and scoped authorization service

**Files:**
- Modify: `server/src/services/permissions.js`
- Test: `server/test/scopedPermissions.test.js`

**Interfaces:**
- Consumes: `models/Permission.js`, `models/Role.js`, `models/RoleAssignment.js`, `models/StaffAccount.js`.
- Produces:
  - Permission constants:
    - `PARTNER_PERMISSION_DEFS`:
      - `partner:metrics:read` (GGR, turnover, active players aggregation)
      - `partner:staff:write` (manage partner staff and roles)
      - `partner:tenants:create` (provision operators under partner quota)
      - `partner:tenants:config:write` (branding, theme, VIP, promos within ceilings)
      - `partner:tenants:domains:write` (add/remove domains with verification)
      - `partner:tenants:staff:write` (operator admin users, no self-assignment)
      - `partner:tenants:status:write` (suspend/reopen operator)
      - `partner:tenants:integrations:write` (write-only credentials)
      - `partner:grants:use` (use active PartnerGrant scopes)
    - `PLATFORM_PERMISSION_DEFS`:
      - `platform:events:settle` (manual event settlement, R7)
      - `platform:partners:manage` (partner CRUD and capability sets)
      - `platform:tenants:manage` (platform tenant control and closure)
      - `platform:billing:read` (commission and invoices)
      - `platform:roles:manage` (platform role assignment)
  - Functions:
    - `initDefaultScopedRoles()`: seeds `platform_owner`, `platform_ops`, `platform_finance`, `platform_support` (scopeType: 'platform'); `partner_admin`, `partner_ops`, `partner_analyst` (scopeType: 'partner'); `tenant_owner` (replacing super_admin), `admin`, `finance`, `risk_analyst`, `casino_manager`, `support`, `content_manager` (scopeType: 'tenant', scopeId: null templates).
    - `getStaffEffectivePermissions(staffId, { scopeType, scopeId, partnerCapabilities = null, linkCapabilities = null }) -> Promise<Set<string>>`:
      - Finds role assignments for staff in given scope.
      - Populates permissions.
      - For partner scope: intersects with `partnerCapabilities` (and `linkCapabilities` if provided per R10).
    - `staffHasPermission(staffId, permissionKey, context) -> Promise<boolean>`
    - `validateRolePermissions(scopeType, permissionKeys) -> void`: throws 400 if tenant role is assigned any `platform:*` permission (G-5).

- [ ] **Step 1: Write the failing tests** in `server/test/scopedPermissions.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Permission from '../src/models/Permission.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import StaffAccount from '../src/models/StaffAccount.js';
import {
  syncMissingPermissions,
  initDefaultScopedRoles,
  getStaffEffectivePermissions,
  validateRolePermissions,
  PARTNER_PERMISSION_DEFS,
} from '../src/services/permissions.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip3_t3';

describe('Scoped Permissions & Role System', () => {
  before(async () => {
    await mongoose.connect(TEST_DB);
    await Promise.all([Permission.deleteMany({}), Role.deleteMany({}), RoleAssignment.deleteMany({}), StaffAccount.deleteMany({})]);
  });

  after(async () => {
    await Promise.all([Permission.deleteMany({}), Role.deleteMany({}), RoleAssignment.deleteMany({}), StaffAccount.deleteMany({})]);
    await mongoose.disconnect();
  });

  it('syncs partner and platform permissions into catalog', async () => {
    await syncMissingPermissions();
    const partnerPerm = await Permission.findOne({ key: 'partner:metrics:read' });
    const platformPerm = await Permission.findOne({ key: 'platform:events:settle' });
    assert.ok(partnerPerm);
    assert.ok(platformPerm);
  });

  it('prevents assigning platform:* permissions to tenant scope', () => {
    assert.throws(
      () => validateRolePermissions('tenant', ['admin:users:read', 'platform:events:settle']),
      /PLATFORM_PERMISSION_FORBIDDEN/
    );
  });

  it('caps partner permissions by capability set (R10)', async () => {
    const staff = await StaffAccount.create({ email: 'partner_staff@test.com', username: 'pstaff', password: 'pwd' });
    const perm1 = await Permission.findOne({ key: 'partner:metrics:read' });
    const perm2 = await Permission.findOne({ key: 'partner:tenants:create' });
    const role = await Role.create({
      name: 'partner_role', displayName: 'PR', scopeType: 'partner', scopeId: null,
      permissions: [perm1._id, perm2._id],
    });
    const partnerId = new mongoose.Types.ObjectId();
    await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'partner', scopeId: partnerId });

    // Allowed capability set only includes metrics.read
    const perms = await getStaffEffectivePermissions(staff._id, {
      scopeType: 'partner',
      scopeId: partnerId,
      partnerCapabilities: ['metrics.read'], // maps to partner:metrics:read
    });
    assert.ok(perms.has('partner:metrics:read'));
    assert.equal(perms.has('partner:tenants:create'), false);
  });
});
```

- [ ] **Step 2: Update `server/src/services/permissions.js`**:
  - Add `PARTNER_PERMISSION_DEFS` and `PLATFORM_PERMISSION_DEFS` to `PERMISSION_DEFS`.
  - Add `initDefaultScopedRoles`, `getStaffEffectivePermissions`, `validateRolePermissions`.
  - Maintain backward compatibility of existing `userHasPermission` for single mode User model.

- [ ] **Step 3: Run the tests:**
```bash
node --test server/test/scopedPermissions.test.js
```

- [ ] **Step 4: Commit:**
```bash
git add server/src/services/permissions.js server/test/scopedPermissions.test.js && git commit -m "feat(authz): add platform and partner permissions catalog and scoped permission evaluator"
```

---

### Task 4: Host resolution middleware, domain cache, and ambient tenant routing

**Files:**
- Create: `server/src/middleware/tenantHost.js`
- Test: `server/test/tenantHostResolution.test.js`

**Interfaces:**
- Consumes: `models/Domain.js`, `models/Tenant.js`, `config/tenancy.js`, `tenancy/context.js`.
- Produces:
  - `resolveTenantHost(options = {}) -> express middleware`:
    - Reads hostname from `req.headers['x-forwarded-host'] || req.headers.host`.
    - Normalizes hostname: removes port (if standard 80/443), lowercase, trims whitespace.
    - Uses in-memory cache (`Map` with TTL 60,000 ms).
    - Queries `Domain.findOne({ host: normalizedHost }).lean()`.
    - If domain found:
      - Attaches `req.tenant = { id: domain.tenantId, brandId: domain.brandId, host: domain.host, isPrimary: domain.isPrimary, purpose: domain.purpose }`.
    - If domain not found:
      - In `single` mode: finds default tenant (`Tenant.findOne({ isDefault: true }).lean()`), attaches `req.tenant = { id: defaultTenant._id, brandId: null, host: normalizedHost, isDefault: true }`.
      - In `multi` mode: returns 404 with `{ error: 'TENANT_NOT_FOUND', message: 'Domain not registered' }`.
    - Calls `tenantContext.run({ tenantId: req.tenant.id, brandId: req.tenant.brandId, actor: { kind: 'system', id: null, scope: null }, mode: 'tenant', reason: null, connection: mongoose.connection }, next)`.
  - Helper: `clearDomainHostCache(host = null)` to invalidate cache in tests or on domain change.

- [ ] **Step 1: Write the failing tests** in `server/test/tenantHostResolution.test.js`:

```js
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Domain from '../src/models/Domain.js';
import Tenant from '../src/models/Tenant.js';
import { resolveTenantHost, clearDomainHostCache } from '../src/middleware/tenantHost.js';
import { getCurrentTenantId } from '../src/tenancy/context.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip3_t4';

describe('Tenant Host Resolution Middleware', () => {
  let defaultTenant, customTenant;

  before(async () => {
    await mongoose.connect(TEST_DB);
    await Domain.deleteMany({});
    await Tenant.deleteMany({});
    defaultTenant = await Tenant.create({ key: 'default', name: 'Default Tenant', isDefault: true, status: 'active' });
    customTenant = await Tenant.create({ key: 'operator-b', name: 'Operator B', isDefault: false, status: 'active' });
    await Domain.create({ host: 'operator-b.com', tenantId: customTenant._id, isPrimary: true, purpose: 'player' });
  });

  after(async () => {
    await Domain.deleteMany({});
    await Tenant.deleteMany({});
    await mongoose.disconnect();
  });

  beforeEach(() => {
    clearDomainHostCache();
  });

  it('resolves registered domain and sets ambient tenantContext', async () => {
    const mw = resolveTenantHost({ getTenancyMode: () => 'multi' });
    const req = { headers: { host: 'Operator-B.com:443' } };
    const res = {};
    let ambientTenantId = null;
    await new Promise((resolve, reject) => {
      mw(req, res, (err) => {
        if (err) return reject(err);
        ambientTenantId = getCurrentTenantId();
        resolve();
      });
    });
    assert.equal(String(req.tenant.id), String(customTenant._id));
    assert.equal(String(ambientTenantId), String(customTenant._id));
  });

  it('falls back to default tenant in single mode for unknown domain', async () => {
    const mw = resolveTenantHost({ getTenancyMode: () => 'single' });
    const req = { headers: { host: 'unknown-domain.com' } };
    const res = {};
    await new Promise((resolve) => mw(req, res, resolve));
    assert.equal(String(req.tenant.id), String(defaultTenant._id));
    assert.equal(req.tenant.isDefault, true);
  });

  it('returns 404 in multi mode for unknown domain', async () => {
    const mw = resolveTenantHost({ getTenancyMode: () => 'multi' });
    const req = { headers: { host: 'unknown-domain.com' } };
    let statusSent = null;
    let jsonSent = null;
    const res = {
      status(s) { statusSent = s; return this; },
      json(j) { jsonSent = j; },
    };
    await new Promise((resolve) => {
      mw(req, res, () => resolve());
      if (statusSent) resolve();
    });
    assert.equal(statusSent, 404);
    assert.equal(jsonSent.error, 'TENANT_NOT_FOUND');
  });
});
```

- [ ] **Step 2: Implement Host resolution middleware** in `server/src/middleware/tenantHost.js`:
  - Implement cache, domain lookup, fallback logic, error responses, and `tenantContext.run` wrapping.

- [ ] **Step 3: Run the tests:**
```bash
node --test server/test/tenantHostResolution.test.js
```

- [ ] **Step 4: Commit:**
```bash
git add server/src/middleware/tenantHost.js server/test/tenantHostResolution.test.js && git commit -m "feat(tenancy): implement Host resolution middleware with domain cache and single-mode fallback"
```

---

### Task 5: Two token families and staff session management

**Files:**
- Create: `server/src/services/staffSession.js`
- Modify: `server/src/services/session.js`
- Test: `server/test/tokenFamilies.test.js`

**Interfaces:**
- Consumes: `jsonwebtoken`, `models/StaffAccount.js`, `models/User.js`.
- Produces:
  - `staffSession.js`:
    - `signStaffAccess(staffAccount, { scopeType, scopeId = null, amr = ['pwd'] }) -> string`:
      - Signs with `process.env.JWT_STAFF_SECRET || process.env.JWT_SECRET`.
      - Payload: `{ sub: staffAccount._id, typ: 'staff', scp: scopeType, sid: scopeId, tv: staffAccount.tokenVersion || 0, aud: 'staff', amr }`.
      - Expiry: 15 minutes.
    - `signStaffRefresh(staffAccount) -> string`:
      - Signs with `process.env.JWT_STAFF_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET || process.env.JWT_STAFF_SECRET`.
      - Payload: `{ sub: staffAccount._id, typ: 'staff', family: staffAccount.tokenVersion || 0, aud: 'staff-refresh' }`.
      - Expiry: 7 days.
    - `verifyStaffAccess(token) -> payload`: checks signature and `aud === 'staff'`.
    - `verifyStaffRefresh(token) -> payload`: checks signature and `aud === 'staff-refresh'`.
    - `setStaffRefreshCookie(res, token)`: sets httpOnly cookie `staffRefreshToken` on path `/api/staff/auth`.
    - `invalidateStaffTokens(staffId)`: bumps `StaffAccount.tokenVersion`, clears cache.
    - `getStaffAuthState(staffId)`: returns cached version and revoked status.
  - `session.js` (players):
    - `signAccess(user, amr = ['pwd'])`:
      - Payload includes: `{ sub: user._id, id: user._id, role: user.role, typ: 'player', tid: user.tenantId || null, tokenVersion: user.tokenVersion || 0, aud: 'player', amr }`.
      - Preserves legacy fields (`id`, `role`) so existing single-mode checks continue working.

- [ ] **Step 1: Write the failing tests** in `server/test/tokenFamilies.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import StaffAccount from '../src/models/StaffAccount.js';
import User from '../src/models/User.js';
import { signStaffAccess, signStaffRefresh, verifyStaffAccess, verifyStaffRefresh } from '../src/services/staffSession.js';
import { signAccess } from '../src/services/session.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip3_t5';

describe('Two Token Families & Staff Session', () => {
  process.env.JWT_SECRET = 'test_player_jwt_secret_32_bytes_long!!';
  process.env.JWT_STAFF_SECRET = 'test_staff_jwt_secret_32_bytes_long!!';
  process.env.JWT_REFRESH_SECRET = 'test_player_refresh_secret_32_long!!';

  it('signs staff access token with aud staff and JWT_STAFF_SECRET', () => {
    const staff = { _id: new mongoose.Types.ObjectId(), tokenVersion: 1 };
    const tenantId = new mongoose.Types.ObjectId();
    const token = signStaffAccess(staff, { scopeType: 'tenant', scopeId: tenantId, amr: ['pwd', 'otp'] });
    const payload = verifyStaffAccess(token);
    assert.equal(payload.sub, String(staff._id));
    assert.equal(payload.typ, 'staff');
    assert.equal(payload.aud, 'staff');
    assert.equal(payload.scp, 'tenant');
    assert.equal(payload.sid, String(tenantId));
    assert.deepEqual(payload.amr, ['pwd', 'otp']);

    // Player secret cannot verify staff token
    assert.throws(() => jwt.verify(token, process.env.JWT_SECRET), jwt.JsonWebTokenError);
  });

  it('signs player access token with aud player and JWT_SECRET', () => {
    const tenantId = new mongoose.Types.ObjectId();
    const user = { _id: new mongoose.Types.ObjectId(), role: 'user', tokenVersion: 2, tenantId };
    const token = signAccess(user, ['pwd']);
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    assert.equal(payload.typ, 'player');
    assert.equal(payload.aud, 'player');
    assert.equal(payload.id, String(user._id));
    assert.equal(String(payload.tid), String(tenantId));

    // Staff secret cannot verify player token
    assert.throws(() => jwt.verify(token, process.env.JWT_STAFF_SECRET), jwt.JsonWebTokenError);
  });
});
```

- [ ] **Step 2: Implement `staffSession.js` and update `session.js`**:
  - Implement token generation, verification, cookie handling, and tokenVersion caching in `server/src/services/staffSession.js`.
  - Update `signAccess` in `server/src/services/session.js` to stamp `aud: 'player'`, `typ: 'player'`, `tid: user.tenantId`.

- [ ] **Step 3: Run the tests:**
```bash
node --test server/test/tokenFamilies.test.js
```

- [ ] **Step 4: Commit:**
```bash
git add server/src/services/staffSession.js server/src/services/session.js server/test/tokenFamilies.test.js && git commit -m "feat(auth): implement two token families for staff and player sessions"
```

---

### Task 6: Staff 2FA service, challenge lifecycle, and multi-mode setup

**Files:**
- Create: `server/src/controllers/staff2fa.js`
- Create: `server/src/routes/staff2fa.js`
- Test: `server/test/staffTwoFactor.test.js`

**Interfaces:**
- Consumes: `speakeasy`, `qrcode`, `models/StaffAccount.js`, `utils/secretCrypto.js`.
- Produces:
  - `controllers/staff2fa.js`:
    - `setup2fa(req, res, next)`: Generates base32 secret and OTPAuth URI formatted `otpauth://totp/VIP90-Staff:${staff.email}?secret=...&issuer=VIP90-Platform`, produces QR code.
    - `confirm2fa(req, res, next)`: Verifies initial code against temp secret. On success: encrypts secret using `encryptSensitive`, generates 8 backup codes, hashes them with SHA-256, updates `StaffAccount.twoFactor = { enabled: true, secretEnc, backupCodesHash }`, returns plaintext backup codes once.
    - `createStaffChallengeToken(staffAccount, method) -> string`: Issues 5-minute single-use challenge token.
    - `verifyStaffChallenge(challengeToken, code) -> { staff, amr: ['pwd','otp'] }`: Enforces max 5 attempts per challenge, marks challenge used upon success, verifies TOTP or backup codes.
  - `routes/staff2fa.js`:
    - `POST /setup`
    - `POST /confirm`
    - `POST /challenge-verify`

- [ ] **Step 1: Write the failing tests** in `server/test/staffTwoFactor.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import speakeasy from 'speakeasy';
import StaffAccount from '../src/models/StaffAccount.js';
import {
  generateStaffSecret,
  confirmStaff2fa,
  createStaffChallengeToken,
  verifyStaffChallenge,
} from '../src/controllers/staff2fa.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip3_t6';

describe('Staff 2FA Lifecycle', () => {
  process.env.JWT_SECRET = 'player_sec_32_bytes_long_1234567!';
  process.env.JWT_STAFF_SECRET = 'staff_sec_32_bytes_long_1234567!';
  process.env.OPERATOR_SECRET_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  let staff;

  before(async () => {
    await mongoose.connect(TEST_DB);
    await StaffAccount.deleteMany({});
    staff = await StaffAccount.create({ email: 'staff2fa@test.com', username: 'staff2fa', password: 'pwd' });
  });

  after(async () => {
    await StaffAccount.deleteMany({});
    await mongoose.disconnect();
  });

  it('generates secret, confirms setup and returns backup codes', async () => {
    const { secret, otpauthUrl } = generateStaffSecret(staff);
    assert.ok(secret);
    assert.ok(otpauthUrl.includes('VIP90-Staff'));

    const token = speakeasy.totp({ secret, encoding: 'base32' });
    const { backupCodes } = await confirmStaff2fa(staff._id, { secret, token });
    assert.equal(backupCodes.length, 8);

    const updated = await StaffAccount.findById(staff._id).select('+twoFactor.secretEnc +twoFactor.backupCodesHash');
    assert.equal(updated.twoFactor.enabled, true);
    assert.ok(updated.twoFactor.secretEnc.startsWith('enc:'));
    assert.equal(updated.twoFactor.backupCodesHash.length, 8);
  });

  it('verifies login challenge with TOTP code', async () => {
    const updated = await StaffAccount.findById(staff._id);
    const challenge = createStaffChallengeToken(updated, 'pwd');
    const secret = speakeasy.generateSecret().base32; // dummy
    // Re-read staff with secret
    const fullStaff = await StaffAccount.findById(staff._id).select('+twoFactor.secretEnc');
    const { decryptSensitive } = await import('../src/utils/secretCrypto.js');
    const rawSecret = decryptSensitive(fullStaff.twoFactor.secretEnc);
    const validCode = speakeasy.totp({ secret: rawSecret, encoding: 'base32' });

    const result = await verifyStaffChallenge(challenge, validCode);
    assert.equal(String(result.staff._id), String(staff._id));
    assert.deepEqual(result.amr, ['pwd', 'otp']);
  });
});
```

- [ ] **Step 2: Implement `staff2fa.js` controller and router**:
  - Implement TOTP generation, encryption, backup code hashing, and challenge verification with rate limiting in `server/src/controllers/staff2fa.js`.
  - Wire Express routes in `server/src/routes/staff2fa.js`.

- [ ] **Step 3: Run the tests:**
```bash
node --test server/test/staffTwoFactor.test.js
```

- [ ] **Step 4: Commit:**
```bash
git add server/src/controllers/staff2fa.js server/src/routes/staff2fa.js server/test/staffTwoFactor.test.js && git commit -m "feat(auth): implement staff 2FA setup, verification and challenge lifecycle"
```

---

### Task 7: Platform emergency recovery CLI (G5)

**Files:**
- Create: `scripts/staff-recover.mjs`
- Test: `server/test/staffRecoverCli.test.js`

**Interfaces:**
- Consumes: `models/StaffAccount.js`, `models/Role.js`, `models/RoleAssignment.js`, `models/Tenant.js`.
- Produces:
  - Command-line tool executable via `node scripts/staff-recover.mjs [args]`:
    - `--list`: prints table of all staff accounts with status, 2FA status, and assigned roles.
    - `--email <email> --reset-password <newPassword>`: updates password with fresh bcrypt hash, bumps tokenVersion.
    - `--email <email> --reset-2fa`: disables 2FA (`twoFactor.enabled: false`, clears `secretEnc` and `backupCodesHash`), bumps tokenVersion.
    - `--email <email> --promote-owner`: assigns `platform_owner` (scopeType: 'platform') and `tenant_owner` (scopeType: 'tenant', default tenant).
    - `--create-owner --email <email> --username <username> --password <password>`: creates new StaffAccount and assigns owner roles.
  - Safe, idempotent, logs clear actions to stdout, exits with code 0 on success or 1 on error.
  - Testable both as an imported function `runStaffRecover(args, { dbUri })` and as a CLI process.

- [ ] **Step 1: Write the failing tests** in `server/test/staffRecoverCli.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import StaffAccount from '../src/models/StaffAccount.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import Tenant from '../src/models/Tenant.js';
import { runStaffRecover } from '../../scripts/staff-recover.mjs';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip3_t7';

describe('Staff Recovery CLI (G5)', () => {
  let defaultTenant;

  before(async () => {
    await mongoose.connect(TEST_DB);
    await Promise.all([StaffAccount.deleteMany({}), Role.deleteMany({}), RoleAssignment.deleteMany({}), Tenant.deleteMany({})]);
    defaultTenant = await Tenant.create({ key: 'default', name: 'Default', isDefault: true, status: 'active' });
    await Role.create({ name: 'platform_owner', displayName: 'PO', scopeType: 'platform', scopeId: null });
    await Role.create({ name: 'tenant_owner', displayName: 'TO', scopeType: 'tenant', scopeId: null });
  });

  after(async () => {
    await Promise.all([StaffAccount.deleteMany({}), Role.deleteMany({}), RoleAssignment.deleteMany({}), Tenant.deleteMany({})]);
    await mongoose.disconnect();
  });

  it('resets password and bumps tokenVersion', async () => {
    const staff = await StaffAccount.create({ email: 'locked@test.com', username: 'locked', password: 'old', tokenVersion: 0 });
    const res = await runStaffRecover(['--email', 'locked@test.com', '--reset-password', 'NewSecurePass123!'], { dbUri: TEST_DB });
    assert.equal(res.success, true);

    const updated = await StaffAccount.findById(staff._id).select('+password');
    assert.equal(await updated.comparePassword('NewSecurePass123!'), true);
    assert.equal(updated.tokenVersion, 1);
  });

  it('resets 2FA on account', async () => {
    const staff = await StaffAccount.create({
      email: '2fa_locked@test.com', username: 'tfa', password: 'pwd',
      twoFactor: { enabled: true, secretEnc: 'enc:xxx' },
    });
    const res = await runStaffRecover(['--email', '2fa_locked@test.com', '--reset-2fa'], { dbUri: TEST_DB });
    assert.equal(res.success, true);

    const updated = await StaffAccount.findById(staff._id);
    assert.equal(updated.twoFactor.enabled, false);
  });

  it('promotes staff to owner across platform and default tenant', async () => {
    const staff = await StaffAccount.create({ email: 'promote@test.com', username: 'prom', password: 'pwd' });
    const res = await runStaffRecover(['--email', 'promote@test.com', '--promote-owner'], { dbUri: TEST_DB });
    assert.equal(res.success, true);

    const assignments = await RoleAssignment.find({ staffId: staff._id }).populate('roleId');
    const roles = assignments.map(a => a.roleId.name);
    assert.ok(roles.includes('platform_owner'));
    assert.ok(roles.includes('tenant_owner'));
  });
});
```

- [ ] **Step 2: Implement recovery CLI script** in `scripts/staff-recover.mjs`:
  - Support argument parsing (`process.argv`), database connection handling, and actions (`--list`, `--reset-password`, `--reset-2fa`, `--promote-owner`, `--create-owner`).
  - Export `runStaffRecover` for automated testing.

- [ ] **Step 3: Run the tests:**
```bash
node --test server/test/staffRecoverCli.test.js
```

- [ ] **Step 4: Commit:**
```bash
git add scripts/staff-recover.mjs server/test/staffRecoverCli.test.js && git commit -m "feat(cli): implement emergency staff recovery CLI (G5)"
```

---

### Task 8: Staff authentication middleware, scope checks, and socket authentication

**Files:**
- Modify: `server/src/middleware/auth.js`
- Modify: `server/src/services/socketAuth.js`
- Test: `server/test/authStaffMiddleware.test.js`

**Interfaces:**
- Consumes: `services/staffSession.js`, `services/permissions.js`, `config/tenancy.js`.
- Produces:
  - `middleware/auth.js`:
    - `requireAuth(req, res, next)`:
      - Validates player token with `JWT_SECRET`.
      - Checks `tokenVersion`, `isActive`, `!deletedAt`, `!isSeed`.
      - Rejects tokens with `aud: 'staff'` (401 `INVALID_TOKEN`).
      - Cross-tenant check: if `payload.tid` exists and `req.tenant?.id`, verifies `String(payload.tid) === String(req.tenant.id)`. If mismatch -> 401 `CROSS_TENANT_TOKEN`.
      - Sets `req.user = payload`.
    - `requireStaff(allowedScope = null) -> express middleware`:
      - Extracts Bearer token from Authorization header.
      - Calls `verifyStaffAccess(token)`.
      - Validates `tokenVersion` against `getStaffAuthState(payload.sub)`.
      - 2FA policy check (K12, V2):
        - In `multi` mode: if `!payload.amr?.includes('otp')`, returns 403 `TWO_FACTOR_REQUIRED`.
        - In `single` mode: checks `StaffAccount.findById(payload.sub).select('twoFactor.enabled')`; if 2FA enabled, requires `payload.amr.includes('otp')`.
      - Scope check:
        - If `allowedScope` provided: validates `payload.scp === allowedScope` (or `payload.scp === 'platform'` for global ops).
        - For `scp: 'tenant'`: checks `String(payload.sid) === String(req.tenant?.id)`. If mismatch -> 403 `CROSS_TENANT_ACCESS`.
      - Attaches `req.staff = { id: payload.sub, scope: payload.scp, scopeId: payload.sid, amr: payload.amr }`.
      - Sets ambient `tenantContext.actor = { kind: 'staff', id: payload.sub, scope: payload.scp }`.
      - Enforces `enforceAdminIp(req, res, next)`.
    - `requireAdmin(req, res, next)`:
      - Compatible bridge: if `req.staff` exists, checks if staff holds admin or owner permission; else checks legacy `req.user?.role === 'admin'`.
    - `requireStaffPermission(permissionKey)`:
      - Middleware factory: validates that `req.staff` possesses `permissionKey` in current scope via `staffHasPermission`.
  - `services/socketAuth.js`:
    - Supports both player tokens (`JWT_SECRET`) and staff tokens (`JWT_STAFF_SECRET`).
    - Stuffs `socket.data = { tenantId, actor: { kind: 'player'|'staff', id, scope } }`.
    - Rejects cross-tenant socket handshakes.

- [ ] **Step 1: Write the failing tests** in `server/test/authStaffMiddleware.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { requireStaff, requireAuth } from '../src/middleware/auth.js';
import { signStaffAccess } from '../src/services/staffSession.js';
import { signAccess } from '../src/services/session.js';
import StaffAccount from '../src/models/StaffAccount.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip3_t8';

describe('requireStaff & requireAuth Middlewares', () => {
  process.env.JWT_SECRET = 'player_secret_32_bytes_long_12345!';
  process.env.JWT_STAFF_SECRET = 'staff_secret_32_bytes_long_12345!';

  let staff;

  before(async () => {
    await mongoose.connect(TEST_DB);
    await StaffAccount.deleteMany({});
    staff = await StaffAccount.create({ email: 'auth_test@test.com', username: 'authtest', password: 'pwd', tokenVersion: 0 });
  });

  after(async () => {
    await StaffAccount.deleteMany({});
    await mongoose.disconnect();
  });

  it('rejects player token when presented to requireStaff', async () => {
    const playerToken = signAccess({ _id: new mongoose.Types.ObjectId(), role: 'admin', tokenVersion: 0 });
    const req = { headers: { authorization: `Bearer ${playerToken}` }, tenant: { id: new mongoose.Types.ObjectId() } };
    let error;
    requireStaff()(req, {}, (err) => { error = err; });
    assert.equal(error?.status, 401);
  });

  it('enforces 2FA in multi mode for staff token', async () => {
    process.env.TENANCY_MODE = 'multi';
    const pwdOnlyToken = signStaffAccess(staff, { scopeType: 'tenant', scopeId: staff._id, amr: ['pwd'] });
    const req = { headers: { authorization: `Bearer ${pwdOnlyToken}` }, tenant: { id: staff._id } };
    let error;
    requireStaff()(req, {}, (err) => { error = err; });
    assert.equal(error?.status, 403);
    assert.equal(error?.code, 'TWO_FACTOR_REQUIRED');
  });

  it('rejects staff token when tenant scope sid does not match req.tenant.id', async () => {
    process.env.TENANCY_MODE = 'single';
    const tenantA = new mongoose.Types.ObjectId();
    const tenantB = new mongoose.Types.ObjectId();
    const token = signStaffAccess(staff, { scopeType: 'tenant', scopeId: tenantA, amr: ['pwd'] });
    const req = { headers: { authorization: `Bearer ${token}` }, tenant: { id: tenantB } };
    let error;
    requireStaff()(req, {}, (err) => { error = err; });
    assert.equal(error?.status, 403);
    assert.equal(error?.code, 'CROSS_TENANT_ACCESS');
  });
});
```

- [ ] **Step 2: Update `server/src/middleware/auth.js` and `server/src/services/socketAuth.js`**:
  - Implement `requireStaff`, update `requireAuth` to block staff tokens and cross-tenant player tokens, update `socketAuth.js`.

- [ ] **Step 3: Run the tests:**
```bash
node --test server/test/authStaffMiddleware.test.js
```

- [ ] **Step 4: Commit:**
```bash
git add server/src/middleware/auth.js server/src/services/socketAuth.js server/test/authStaffMiddleware.test.js && git commit -m "feat(auth): implement requireStaff middleware with scope verification and socket auth updates"
```

---

### Task 9: G5 migration runner: Admin User to StaffAccount and RoleAssignment

**Files:**
- Create: `server/migrations/0007_tenancy_staff_accounts.js`
- Create: `server/src/tenancy/staffMigration.js`
- Test: `server/test/tenancyStaffMigration.test.js`

**Interfaces:**
- Consumes: `models/User.js`, `models/StaffAccount.js`, `models/Role.js`, `models/RoleAssignment.js`, `models/Tenant.js`, `models/Migration.js`.
- Produces:
  - `staffMigration.js`:
    - `STAFF_MIGRATION_NAME = 'tenancy-004-staff-accounts'`
    - `migrateAdminUsersToStaff({ defaultTenantId = null }) -> Promise<{ scanned, migrated, skipped, errors }>`:
      - Runs within `runAsPlatform('g5-staff-migration', ...)`
      - Finds default tenant if not supplied (`Tenant.findOne({ isDefault: true })`).
      - Queries `User.find({ role: 'admin' }).select('+password +twoFactorSecret +twoFactorBackupCodes')`.
      - For each user:
        - Upserts `StaffAccount` with `_id: user._id`, preserving exact ID!
        - Copies `email`, `username`, `password`, `status` (`isActive ? 'active' : 'suspended'`).
        - Copies `twoFactor` state if present.
        - Looks up role assignments:
          - If user held `super_admin` role (or orphaned admin): assigns `platform_owner` (`scopeType: 'platform', scopeId: null`) AND `tenant_owner` (`scopeType: 'tenant', scopeId: defaultTenant._id`).
          - If user held specific roles (`finance`, `support`, etc.): assigns matching scoped role on `defaultTenant._id`.
        - Stamps `User.updateOne({ _id: user._id }, { $set: { staffMigratedAt: new Date() } })`.
        - Leaves `User.role: 'admin'` intact so single mode legacy code path continues to work!
      - Records `Migration{ name: STAFF_MIGRATION_NAME, version: '1.3.0' }`.
      - Idempotent: can be re-run safely without creating duplicate accounts or assignments.
  - `0007_tenancy_staff_accounts.js`:
    - Migration runner contract with `up()` and `down()` exports.

- [ ] **Step 1: Write the failing tests** in `server/test/tenancyStaffMigration.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import Tenant from '../src/models/Tenant.js';
import Migration from '../src/models/Migration.js';
import { migrateAdminUsersToStaff } from '../src/tenancy/staffMigration.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip3_t9';

describe('G5 Staff Migration', () => {
  let defaultTenant, superAdminRole, adminUser;

  before(async () => {
    await mongoose.connect(TEST_DB);
    await Promise.all([User.deleteMany({}), StaffAccount.deleteMany({}), Role.deleteMany({}), RoleAssignment.deleteMany({}), Tenant.deleteMany({}), Migration.deleteMany({})]);

    defaultTenant = await Tenant.create({ key: 'default', name: 'Default', isDefault: true, status: 'active' });
    superAdminRole = await Role.create({ name: 'super_admin', displayName: 'Super Admin', scopeType: 'tenant', scopeId: null });
    await Role.create({ name: 'platform_owner', displayName: 'PO', scopeType: 'platform', scopeId: null });
    await Role.create({ name: 'tenant_owner', displayName: 'TO', scopeType: 'tenant', scopeId: null });

    adminUser = await User.create({
      username: 'main_admin',
      email: 'admin@vip90.bet',
      password: 'HashedPassword123',
      role: 'admin',
      roles: [superAdminRole._id],
    });
  });

  after(async () => {
    await Promise.all([User.deleteMany({}), StaffAccount.deleteMany({}), Role.deleteMany({}), RoleAssignment.deleteMany({}), Tenant.deleteMany({}), Migration.deleteMany({})]);
    await mongoose.disconnect();
  });

  it('migrates admin User to StaffAccount preserving exact _id and assigns owner roles', async () => {
    const res = await migrateAdminUsersToStaff({ defaultTenantId: defaultTenant._id });
    assert.equal(res.migrated, 1);

    const staff = await StaffAccount.findById(adminUser._id);
    assert.ok(staff);
    assert.equal(staff.email, 'admin@vip90.bet');

    const assignments = await RoleAssignment.find({ staffId: staff._id }).populate('roleId');
    const roleNames = assignments.map(a => a.roleId.name);
    assert.ok(roleNames.includes('platform_owner'));
    assert.ok(roleNames.includes('tenant_owner'));

    const updatedUser = await User.findById(adminUser._id);
    assert.ok(updatedUser.staffMigratedAt);
    assert.equal(updatedUser.role, 'admin'); // Not demoted in single mode!
  });

  it('is completely idempotent on second run', async () => {
    const res = await migrateAdminUsersToStaff({ defaultTenantId: defaultTenant._id });
    assert.equal(res.migrated, 0);
    assert.equal(res.skipped, 1);
  });
});
```

- [ ] **Step 2: Implement G5 migration logic and runner**:
  - Implement `server/src/tenancy/staffMigration.js` with batching, role creation, and migration logging.
  - Implement `server/migrations/0007_tenancy_staff_accounts.js`.

- [ ] **Step 3: Run the tests:**
```bash
node --test server/test/tenancyStaffMigration.test.js
```

- [ ] **Step 4: Commit:**
```bash
git add server/src/tenancy/staffMigration.js server/migrations/0007_tenancy_staff_accounts.js server/test/tenancyStaffMigration.test.js && git commit -m "feat(migration): implement G5 staff account and role assignment migration"
```

---

### Task 10: Compatible login, staff auth controller and route integration

**Files:**
- Create: `server/src/controllers/staffAuth.js`
- Create: `server/src/routes/staffAuth.js`
- Modify: `server/src/controllers/auth.js`
- Modify: `server/src/app.js`
- Test: `server/test/compatibleLogin.test.js`

**Interfaces:**
- Consumes: `services/staffSession.js`, `controllers/staff2fa.js`, `middleware/auth.js`, `middleware/tenantHost.js`.
- Produces:
  - `controllers/staffAuth.js`:
    - `login`: Staff login handler. Authenticates against `StaffAccount`.
      - In multi mode: if 2FA not enabled, returns `{ requires2faSetup: true, setupToken }`; if enabled, returns `{ requires2fa: true, challengeToken }`.
      - In single mode: if 2FA enabled, returns challenge; if not enabled, directly issues staff session (`amr: ['pwd']`).
      - Returns `{ accessToken, staff: staff.toSafeObject(), amr }` and sets refresh cookie.
    - `refresh`: Rotates staff refresh token.
    - `me`: Returns current authenticated staff profile and permissions.
    - `logout`: Clears staff refresh cookie.
  - `routes/staffAuth.js`: Express router mounted at `/api/staff/auth`.
  - `controllers/auth.js` (legacy player/admin login):
    - In `single` mode: `/api/auth/login` checks `User.findOne({ username })`. If `user.role === 'admin'`, authenticates credentials, returns legacy token and user object so existing admin dashboard works seamlessly.
    - In `multi` mode: `/api/auth/login` only authenticates player accounts; any staff login must go to `/api/staff/auth/login`.
  - `server/src/app.js`:
    - Mounts `resolveTenantHost()` before route handlers.
    - Mounts `app.use('/api/staff/auth', staffAuthRoutes);` and `app.use('/api/staff/auth/2fa', staff2faRoutes);`.

- [ ] **Step 1: Write the failing tests** in `server/test/compatibleLogin.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Tenant from '../src/models/Tenant.js';
import { createApp } from '../src/app.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip3_t10';

describe('Compatible Login & Staff Auth Integration', () => {
  let app, server, defaultTenant, adminUser;

  before(async () => {
    await mongoose.connect(TEST_DB);
    await Promise.all([User.deleteMany({}), StaffAccount.deleteMany({}), Tenant.deleteMany({})]);

    defaultTenant = await Tenant.create({ key: 'default', name: 'Default', isDefault: true, status: 'active' });
    adminUser = await User.create({
      username: 'legacy_admin',
      email: 'admin@legacy.com',
      password: 'AdminPassword123!',
      role: 'admin',
    });
    await StaffAccount.create({
      _id: adminUser._id,
      email: 'admin@legacy.com',
      username: 'legacy_admin',
      password: 'AdminPassword123!',
    });

    app = createApp();
  });

  after(async () => {
    await Promise.all([User.deleteMany({}), StaffAccount.deleteMany({}), Tenant.deleteMany({})]);
    await mongoose.disconnect();
  });

  it('single mode: existing admin logs in at /api/auth/login with identical credentials', async () => {
    process.env.TENANCY_MODE = 'single';
    // Emulate POST /api/auth/login
    const { login } = await import('../src/controllers/auth.js');
    const req = {
      validated: { username: 'legacy_admin', password: 'AdminPassword123!' },
      headers: { host: 'localhost:5173' },
      tenant: { id: defaultTenant._id },
    };
    let responseData = null;
    const res = {
      cookie() {},
      json(data) { responseData = data; },
    };
    await login(req, res, (err) => { if (err) throw err; });
    assert.ok(responseData.accessToken);
    assert.equal(responseData.user.role, 'admin');
    assert.equal(responseData.user.username, 'legacy_admin');
  });

  it('multi mode: /api/staff/auth/login serves staff', async () => {
    process.env.TENANCY_MODE = 'multi';
    const { login } = await import('../src/controllers/staffAuth.js');
    const req = {
      body: { username: 'legacy_admin', password: 'AdminPassword123!' },
      headers: { host: 'any.com' },
      tenant: { id: defaultTenant._id },
    };
    let responseData = null;
    const res = {
      cookie() {},
      json(data) { responseData = data; },
    };
    await login(req, res, (err) => { if (err) throw err; });
    // In multi mode without 2FA setup, requires2faSetup is returned
    assert.equal(responseData.requires2faSetup, true);
    assert.ok(responseData.setupToken);
  });
});
```

- [ ] **Step 2: Implement `staffAuth.js` and update `controllers/auth.js` and `app.js`**:
  - Implement `server/src/controllers/staffAuth.js` and `server/src/routes/staffAuth.js`.
  - Update `server/src/controllers/auth.js` to preserve single-mode admin login.
  - Update `server/src/app.js` to mount `resolveTenantHost()` and staff auth routes.

- [ ] **Step 3: Run the tests:**
```bash
node --test server/test/compatibleLogin.test.js
```

- [ ] **Step 4: Commit:**
```bash
git add server/src/controllers/staffAuth.js server/src/routes/staffAuth.js server/src/controllers/auth.js server/src/app.js server/test/compatibleLogin.test.js && git commit -m "feat(auth): add staff auth routes and maintain single mode compatible admin login"
```

---

### Task 11: §8.1 Acceptance & cross-checks integration test suite

**Files:**
- Create: `server/test/tenancyIdentityCrossChecks.test.js`
- Create: `server/test/tenancyPartnerCapabilities.test.js`

**Interfaces:**
- Consumes: all İP-3 models, controllers, and middlewares.
- Produces:
  - Comprehensive acceptance tests matching spec §8.1:
    - **Cross-tenant token replay:** T1 player token on T2 host -> 401/403. T1 staff token on T2 host -> 403.
    - **Cross-tenant IDOR containment:** T1 staff requesting T2 resource -> 404 (never discloses existence, G-3).
    - **Socket isolation:** T1 socket handshake on T2 domain -> rejected.
    - **2FA matrix verification:** multi mode rejects any staff request without OTP; single mode allows password-only if 2FA not enabled (K12).
    - **Partner capabilities sandbox:** partner P1 on T2 returns 404; P1 exceeding capability set returns 403; P1 attempting self-assignment on linked operator is rejected with 400/403 (G-15).
    - **Legacy admin regression:** single mode admin logs in with existing password and has identical permissions.

- [ ] **Step 1: Write the test suite** in `server/test/tenancyIdentityCrossChecks.test.js` and `server/test/tenancyPartnerCapabilities.test.js`.

- [ ] **Step 2: Run the test suite:**
```bash
node --test server/test/tenancyIdentityCrossChecks.test.js server/test/tenancyPartnerCapabilities.test.js
```

- [ ] **Step 3: Commit:**
```bash
git add server/test/tenancyIdentityCrossChecks.test.js server/test/tenancyPartnerCapabilities.test.js && git commit -m "test(acceptance): add §8.1 identity, authorization and partner isolation test suites"
```

---

### Task 12: Public surface, documentation, AGENTS.md, and CHANGELOG

**Files:**
- Modify: `server/src/tenancy/index.js`
- Modify: `CHANGELOG.md`
- Modify: `AGENTS.md`
- Modify: `docs/product/05-api-referansi.md`
- Modify: `docs/product/11-admin-araclari.md`
- Test: `server/test/tenancyPublicSurface.test.js`

**Interfaces:**
- Consumes: exports from Tasks 1-10.
- Produces:
  - `server/src/tenancy/index.js`: Re-exports `StaffAccount`, `RoleAssignment`, `resolveTenantHost`, `requireStaff`, `requireStaffPermission`, `signStaffAccess`.
  - `CHANGELOG.md`: Turkish entry under `## [Yayınlanmadı]` documenting `StaffAccount`, `RoleAssignment`, two token families, Host resolution, G5 compatible login, and recovery CLI.
  - `AGENTS.md`: Update section on identity separation and staff auth.
  - Documentation in `docs/product/`:
    - `05-api-referansi.md`: Document `/api/staff/auth/*` endpoints and token headers.
    - `11-admin-araclari.md`: Document `scripts/staff-recover.mjs` CLI usage.

- [ ] **Step 1: Update public surface and documentation**:
  - Update `server/src/tenancy/index.js`.
  - Add Turkish CHANGELOG entry under `## [Yayınlanmadı]`.
  - Update `AGENTS.md` and docs.

- [ ] **Step 2: Run public surface tests:**
```bash
node --test server/test/tenancyPublicSurface.test.js
```

- [ ] **Step 3: Commit:**
```bash
git add server/src/tenancy/index.js CHANGELOG.md AGENTS.md docs/product/05-api-referansi.md docs/product/11-admin-araclari.md server/test/tenancyPublicSurface.test.js && git commit -m "docs: document İP-3 identity and authorization package and update public surface"
```
