# İP-9a Platform Console and Operator Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement work package İP-9a of the approved multi-tenant design:
- **N1 platform install on an empty database in multi mode:** bootstrap migration `platform-001-bootstrap` (`Permission` catalogue, role templates §5.2, platform `Setting` defaults, compound indexes only, zero default tenant, zero demo seed).
- **N2 first Platform Owner:** one-time CLI `scripts/platform-bootstrap.mjs --owner-email` with one-time credentials, mandatory 2FA setup at first login, setup wizard closed in multi mode, idempotent re-runs.
- **Platform console `console/`:** separate Vite application inside core (not part of `client/`), staff auth with 2FA, operator management, domain verification, go-live checklist, K23 write-grant workflow, and N6 scope gates telemetry.
- **N4 tenant provisioning by the platform:** creates `Tenant`, `Brand`, `Domain`, seed subset (VIP, pages, templates, chat, risk rules, segments, settings; no demo data, no bots), executes provider `Operator` hook if installed, stores igames agent credentials if schema registered (K13/K22), first `tenant_owner` invitation, idempotent, blocks live traffic during `provisioning` status.
- **N5 go-live checklist and status transitions:** 6-point checklist (legal entity, provider credentials + K22 written provider approval, PSP sandbox deposit/withdrawal, KYC webhook, email sending, domain DNS TXT/TLS), and lifecycle transitions (`provisioning` → `active` → `suspended` → `closed` with K26 export and legal retention lock).
- **K23 Platform staff read-only by default:** platform writes to tenant data permitted only via time-limited, audited write grants (`PlatformWriteGrant`).
- **K24 Audit retention ≥ 5 years:** configurable audit retention (minimum 1825 days in multi mode).
- **N6 Staging and Production gates:** zero `TenantScopeError` windows (14 days staging, 7 days production) tracked, measured, and reported via telemetry.

**Architecture:**
- **Platform Root Scope:** Platform models (`Tenant`, `Domain`, `StaffAccount`, `Role`, `RoleAssignment`, `Permission`, `PlatformWriteGrant`, `Setting` with `scope: 'platform'`) live outside the `tenantScoped` plugin. In multi mode, platform API routes (`/api/platform/*`) and the platform console run under platform scope. Single-mode installs keep today's behavior and receive a 404 for `/api/platform/*`.
- **Host & Tenant Resolution:** `resolveTenantHost` in `server/src/middleware/tenantHost.js` identifies platform hosts (configured via `PLATFORM_HOST`) and `/api/platform/*` requests, bypassing tenant resolution and setting `req.tenant = null`. For operator domains, it resolves only verified domains (`verifiedAt != null`), and blocks player requests for tenants in `provisioning`, `suspended`, or `closed` status.
- **Tenant Provisioning Pipeline:** `server/src/platform/services/provisioningService.js` creates tenant and brand records, generates DNS TXT tokens, registers custom hostnames with Cloudflare for SaaS (`server/src/platform/services/cloudflareSaaS.js`), seeds essential tenant datasets inside `runWithTenant` without demo data or bots, executes registration hooks (`runTenantProvisioningHooks`), records module credentials, creates the first `tenant_owner` staff account, and emits audit records.
- **Go-Live & Lifecycle Guard:** `server/src/platform/services/goLiveChecklist.js` verifies the 6 prerequisites. Transitioning from `provisioning` to `active` requires a completed checklist or an audited platform owner override. Tenant closure (K26) exports all tenant collections to an archive, applies a legal retention lock preventing deletion for ≥ 5 years (K24), and blocks all logins.
- **K23 Audited Write Grants:** `server/src/middleware/auth.js` enforces that platform staff acting on tenant routes (`requireStaff('tenant')`) can only execute safe methods (GET, HEAD, OPTIONS). Unsafe methods (POST, PUT, PATCH, DELETE) require an active, non-expired `PlatformWriteGrant` referencing the tenant, and every write writes an `AuditLog` row with `action: 'PLATFORM_WRITE_EXCEPTION'`.
- **Separate Vite Console App:** `console/` is an independent React 19 + Vite SPA inside the core repository, with its own `package.json`, Tailwind config, and router. It targets the platform host, requires staff tokens with mandatory 2FA (`amr: ['pwd', 'otp']`), and never exposes player endpoints or routes.

**Tech Stack:** Node >= 22 (ESM), Express 4, Mongoose 8.24, React 19, Vite 5, Zustand 5, React Router 7, `node:test` + `node:assert/strict`, local MongoDB (replica set `rs0` on 127.0.0.1:27017).

**Spec:** `docs/superpowers/specs/2026-11-09-multi-tenant-design.md`. Sections used: §4.3.1 (Platform scope), §4.3.2 (`Tenant`), §4.3.3 (`Brand` and `Domain`), §4.3.7 (`AuditLog` and `AdminAction`), §4.3.8 (`StaffAccount` and `RoleAssignment`), §5 (Identity and permissions), §5.2 (Role templates), §5.3 (Authorization matrix), §6.2 (N1-N6), §7.1 (İP-9a critical path row), §7.2 (Console architecture rationale and core upstream boundaries), §8 (Isolation test suites), §9 (G-items, G-11 verified domains), K19-K27 (Owner decisions: K22 provider approval, K23 audited write exception, K24 5-year retention, K25 Cloudflare for SaaS, K26 tenant closure export & retention), Y2, S4, S8, S9.

---

## Global Constraints

- **Never weaken an existing check:** Existing authentication (`requireAuth`, `requireStaff`), permissions, IP checks, and rate limiters remain active. Platform routes require `requireStaff('platform')` and appropriate permissions. Platform staff accessing tenant routes remain strictly read-only unless an audited `PlatformWriteGrant` is active.
- **Single mode backward compatibility (spec §6.1, §6.3, Y3):** When running in `TENANCY_MODE=single`, default tenant initialization (`G1`), legacy admin endpoints, and current setup wizard behavior remain identical. Platform routes (`/api/platform/*`) return 404 in single mode. Console assets are not served to single-mode operators.
- **Core never imports premium add-ons:** Core provides registration hooks (`registerTenantProvisioningHook`, `registerTenantCredentialSchema`, `runTenantProvisioningHooks`). Private add-ons (sports betting, casino content, in-house games) attach through these hooks. Provisioning executes hooks dynamically without hard-coded references or imports.
- **Brand-neutral core:** No hard-coded brand names, internal hostnames, or private IPs in core code. Test fixtures and examples strictly use `*.example.com` domains and generic labels. Casino content providers are referenced abstractly by module identifier (`casino-content`), never by corporate or brand name.
- **Idempotent operations:** Bootstrap migrations, CLI commands, and tenant provisioning can be re-run at any time without duplicating database records or throwing unhandled errors.
- **Traffic gating for unready tenants:** Tenants in `provisioning`, `suspended`, or `closed` status never receive public player traffic. Unverified domains (`verifiedAt: null`) never resolve to a tenant in multi mode.
- **Isolated test execution:** Tests use dedicated test database names (`mongodb://127.0.0.1:27017/vip90_test_ip9a_t*`) and must never run the global root `npm test`. External network services (DNS, Cloudflare API, email transports, PSP webhooks) are injected and faked in unit/integration tests. Always run with `--test-timeout=60000`.

---

## Review Focus

- **N1 Clean DB multi-mode bootstrap:** On an empty database in multi mode, `platform-001-bootstrap` initializes permissions, role templates, platform settings, and compound indexes, leaving `Tenant.countDocuments() === 0` and creating zero demo accounts or bots.
- **N2 First Platform Owner CLI & mandatory 2FA:** `scripts/platform-bootstrap.mjs` safely provisions the root platform owner. First login forces TOTP enrollment; unauthenticated or single-factor staff tokens are rejected by all staff endpoints in multi mode. Re-running the script reports "already installed" and exits cleanly.
- **N4 Provisioning pipeline completeness:** Provisioning creates `Tenant`, `Brand`, `Domain`, runs seed subset (VIP, pages, templates, chat, risk rules, segments, settings), invokes hooks, stores credentials, and provisions `tenant_owner`. Live traffic is rejected while in `provisioning` status.
- **N5 Go-live checklist & status transitions:** Status `active` cannot be set without completing the 6 gates (or explicit audited owner override). Suspended tenants immediately reject player requests. Closure initiates export and locks deletion for 5 years (K24/K26).
- **K23 Audited write exception:** Unsafe HTTP methods on tenant routes by platform staff are rejected with 403 `PLATFORM_READ_ONLY` unless a valid `PlatformWriteGrant` exists, and every exception write is audited.
- **K24 Audit retention:** Multi mode enforces `AUDIT_RETENTION_DAYS >= 1825` (5 years) on startup and updates TTL index definitions accordingly.
- **N6 Scope gates measurement:** Telemetry accurately counts consecutive clean days with zero `TenantScopeError` across staging (14 days) and production (7 days).
- **Vite console app architecture:** `console/` builds cleanly as an isolated SPA without polluting `client/dist`.

---

## File Structure

| File | Repository | Responsibility | Task |
|---|---|---|---|
| `server/src/platform/bootstrap.js` | core | Core bootstrap logic: permissions, role templates, platform settings, compound indexes | 1 |
| `server/migrations/0009_platform_bootstrap.js` | core | Database migration `platform-001-bootstrap` executing clean multi-mode setup | 1 |
| `server/test/platformBootstrap.test.js` | core | Tests verifying N1 clean bootstrap, zero default tenant, and compound index creation | 1 |
| `scripts/platform-bootstrap.mjs` | core | One-time CLI to bootstrap the first Platform Owner account and print setup credentials | 2 |
| `server/src/routes/install.js` | core | Disable legacy single-mode `/install` wizard when running in multi mode | 2 |
| `server/test/platformBootstrapCli.test.js` | core | Unit tests for CLI parsing, idempotency, role assignment, and mandatory 2FA gate | 2 |
| `server/src/models/PlatformWriteGrant.js` | core | Mongoose model for time-limited, audited write exceptions on tenant routes (K23) | 3 |
| `server/src/middleware/tenantHost.js` | core | Platform host bypass, verified domain check, and tenant status traffic gate | 3 |
| `server/src/middleware/auth.js` | core | Enforce K23 write grants on tenant routes and audit exception writes | 3 |
| `server/src/config/tenancy.js` | core | Validate `AUDIT_RETENTION_DAYS >= 1825` and multi-mode platform settings | 3 |
| `server/src/models/AuditLog.js` | core | Configurable TTL index for 5-year audit retention (K24) | 3 |
| `server/src/models/AdminAction.js` | core | Configurable TTL index for 5-year audit retention (K24) | 3 |
| `server/test/platformWriteGrant.test.js` | core | Tests verifying K23 platform write exceptions, expiration, and audit logging | 3 |
| `server/test/auditRetention.test.js` | core | Tests for configurable audit retention and 5-year validation in multi mode | 3 |
| `server/src/platform/services/tenantSeed.js` | core | Subset seeder for new tenants (VIP, pages, templates, chat, risk rules, segments, settings) | 4 |
| `server/src/platform/services/provisioningService.js` | core | Idempotent tenant provisioning orchestrator (Tenant, Brand, Domain, seed, hooks, owner) | 4 |
| `server/test/tenantProvisioningService.test.js` | core | Unit and integration tests for tenant provisioning pipeline, seed subset, and idempotency | 4 |
| `server/src/platform/services/cloudflareSaaS.js` | core | Cloudflare for SaaS custom hostname adapter and verification status client | 5 |
| `server/src/platform/services/domainService.js` | core | DNS TXT verification token generator, DNS resolver check, and TLS state synchronizer | 5 |
| `server/test/domainVerification.test.js` | core | Tests for DNS TXT verification, token validation, and Cloudflare TLS mocking | 5 |
| `server/src/platform/services/goLiveChecklist.js` | core | Evaluation engine for the 6 go-live checklist gates and K22 provider approval | 6 |
| `server/src/platform/services/tenantLifecycle.js` | core | Status transitions (`active`, `suspended`, `closed`), data export, and legal retention lock | 6 |
| `server/test/goLiveChecklist.test.js` | core | Tests for checklist validation rules, missing item reporting, and provider approval check | 6 |
| `server/test/tenantLifecycle.test.js` | core | Tests for status transitions, traffic suspension, export generation, and retention lock | 6 |
| `server/src/platform/services/scopeTelemetry.js` | core | Measurement service tracking zero `TenantScopeError` windows for N6 staging/prod gates | 7 |
| `server/test/scopeTelemetry.test.js` | core | Tests for scope telemetry tracking, consecutive clean day calculation, and gate status | 7 |
| `server/src/platform/controllers/platformTenantsController.js` | core | Express controller for tenant listing, detail, provisioning, status, and write-grants | 8 |
| `server/src/platform/controllers/platformDomainsController.js` | core | Express controller for domain listing, verification triggers, and TLS refresh | 8 |
| `server/src/platform/controllers/platformSystemController.js` | core | Express controller for platform settings, N6 gates telemetry, and system health | 8 |
| `server/src/platform/controllers/platformStaffController.js` | core | Express controller for platform staff accounts and role assignments | 8 |
| `server/src/platform/routes/index.js` | core | Main router mounting `/api/platform/*` endpoints with staff authentication and RBAC | 8 |
| `server/src/app.js` | core | Mount platform router (multi mode only) and serve console static SPA assets | 8, 9 |
| `server/test/platformApi.test.js` | core | Integration tests for `/api/platform/*` endpoints, permissions, and 404 in single mode | 8 |
| `console/package.json` | core | Separate package definition for the Platform Owner Vite console | 9 |
| `console/vite.config.js` | core | Vite configuration with `@client` alias for shared UI components | 9 |
| `console/index.html` | core | HTML shell for the platform console SPA | 9 |
| `console/src/main.jsx` | core | React entrypoint for the platform console | 9 |
| `console/src/App.jsx` | core | Router and route definitions for console views | 9 |
| `console/src/api/client.js` | core | Axios HTTP client configured for `/api/platform` with automatic token refresh | 9 |
| `console/src/store/authStore.js` | core | Zustand authentication store supporting 2FA challenge and setup flows | 9 |
| `console/src/components/layout/Layout.jsx` | core | Primary platform console shell layout with sidebar and header | 9 |
| `console/src/components/layout/Sidebar.jsx` | core | Navigation sidebar for platform sections | 9 |
| `console/src/components/layout/Header.jsx` | core | Header with current staff info, active scope indicator, and logout button | 9 |
| `console/src/pages/Login.jsx` | core | Platform staff login page with password and 2FA challenge step | 9 |
| `console/src/pages/Setup2fa.jsx` | core | Mandatory 2FA QR code setup page for first-time login | 9 |
| `package.json` | core | Add `dev:console` and `build:console` scripts to root package.json | 9 |
| `console/test/authStore.test.js` | core | Unit tests for console auth store and 2FA flow transitions | 9 |
| `console/src/pages/Dashboard.jsx` | core | Platform overview: tenant metrics, N6 scope gates status widget, system alerts | 10 |
| `console/src/pages/TenantsList.jsx` | core | Tenant directory with status filtering and quick search | 10 |
| `console/src/pages/TenantDetail.jsx` | core | Detailed tenant view: config, modules, domains, credentials, and actions | 10 |
| `console/src/pages/TenantProvision.jsx` | core | Multi-step tenant provisioning wizard | 10 |
| `console/src/pages/GoLiveChecklist.jsx` | core | Interactive 6-gate checklist with verification buttons and status toggle | 10 |
| `console/src/pages/DomainsList.jsx` | core | Domain table with DNS TXT challenge modal and Cloudflare status | 10 |
| `console/src/pages/AuditLogs.jsx` | core | Searchable platform audit log explorer with actor and tenant filters | 10 |
| `console/src/components/WriteGrantModal.jsx` | core | Modal for requesting K23 time-limited audited write exceptions | 10 |
| `console/test/consolePages.test.js` | core | Verification tests for console page exports, route mappings, and checklist actions | 10 |
| `server/test/platformConsoleAcceptance.test.js` | core | End-to-end acceptance suite covering N1-N6 workflows, K23 grants, and K24 retention | 11 |
| `CHANGELOG.md` | core | Document İP-9a changes under `[Yayınlanmadı]` following standard changelog guide | 11 |

---

## Parallelism

Tasks are organized into execution waves to optimize independent development and verification:

| Wave | Tasks (run in parallel, separate worktrees) | Repository | Depends on |
|---|---|---|---|
| A | 1 (Platform Bootstrap Migration N1), 2 (First Platform Owner CLI N2), 3 (Routing, K23 Grants & K24 Retention) | core | none |
| B | 4 (Tenant Provisioning Service N4), 5 (DNS Verification & Cloudflare TLS K25), 6 (Go-Live Checklist & Lifecycle N5), 7 (Scope Telemetry & N6 Gates) | core | 1, 3 |
| C | 8 (Platform Server API Endpoints & Controllers) | core | 2, 4, 5, 6, 7 |
| D | 9 (Console App Shell, Vite Setup & Auth Flow), 10 (Console UI Pages & Checklist) | core | 8 |
| E | 11 (End-to-End Acceptance Suite N1-N6 & CHANGELOG) | core | 9, 10 |

**Conflict notes:**
- Tasks in Wave A operate on distinct areas: Task 1 handles bootstrap migrations; Task 2 handles the CLI script and `/install` routing; Task 3 handles models, middleware, and config.
- Wave B services are completely decoupled into distinct service modules under `server/src/platform/services/`.
- Wave C integrates all Wave B services into Express routes mounted in `server/src/app.js`.
- Wave D operates primarily within `console/`, consuming the endpoints built in Wave C.
- Wave E runs acceptance tests across all layers and records the changelog.

---

### Task 1: N1 Platform Bootstrap Migration & Multi-Mode Zero Default Tenant Guard (Repository: core)

**Files:**
- Create: `server/src/platform/bootstrap.js`
- Create: `server/migrations/0009_platform_bootstrap.js`
- Create: `server/test/platformBootstrap.test.js`

**Interfaces:**
- Consumes: `initDefaultPermissions`, `initDefaultScopedRoles`, `syncMissingPermissions` from `server/src/services/permissions.js`, `buildAllTenantIndexes` from `server/src/tenancy/indexBuilder.js`, `Setting` model, `Tenant` model, `Migration` model, `getTenancyMode` from `server/src/config/tenancy.js`.
- Produces: `runPlatformBootstrap({ env })` function and migration `0009_platform_bootstrap.js` (`platform-001-bootstrap`) that sets up an empty DB in multi mode, builds compound tenant indexes, verifies `Tenant.countDocuments() === 0`, and leaves demo flags unseeded.

- [ ] **Step 1: Write the failing tests** in `server/test/platformBootstrap.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Permission from '../src/models/Permission.js';
import Role from '../src/models/Role.js';
import Tenant from '../src/models/Tenant.js';
import Setting from '../src/models/Setting.js';
import Migration from '../src/models/Migration.js';
import { runPlatformBootstrap, PLATFORM_BOOTSTRAP_MIGRATION } from '../src/platform/bootstrap.js';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9a_t1';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('N1 bootstrap executes on clean DB: seeds permissions, role templates, platform settings, zero default tenant', async () => {
  const result = await runPlatformBootstrap({
    env: { TENANCY_MODE: 'multi', TENANCY_ENFORCEMENT: 'enforce' },
  });

  assert.equal(result.success, true);
  assert.equal(result.migrationRecorded, true);

  // 1. Verify permissions seeded
  const permissionsCount = await Permission.countDocuments();
  assert.ok(permissionsCount > 20, 'Permissions catalogue must be seeded');
  const platformPerm = await Permission.findOne({ key: 'platform:tenants:manage' });
  assert.ok(platformPerm, 'Platform permissions must exist');

  // 2. Verify scoped role templates (§5.2)
  const platformOwnerRole = await Role.findOne({ name: 'platform_owner', scopeType: 'platform' });
  assert.ok(platformOwnerRole, 'platform_owner role must exist');
  assert.equal(platformOwnerRole.scopeId, null);

  const tenantOwnerRole = await Role.findOne({ name: 'tenant_owner', scopeType: 'tenant' });
  assert.ok(tenantOwnerRole, 'tenant_owner role template must exist');
  assert.equal(tenantOwnerRole.scopeId, null);

  // 3. Verify zero default tenant (N1 spec §6.2)
  const tenantCount = await Tenant.countDocuments();
  assert.equal(tenantCount, 0, 'No default tenant should be created in multi mode bootstrap');

  // 4. Verify platform setting defaults
  const platformSetting = await Setting.findOne({ scope: 'platform', key: 'platform_initialized' });
  assert.ok(platformSetting, 'Platform initialized setting must exist');
  assert.equal(platformSetting.value, true);

  // 5. Verify migration record
  const migration = await Migration.findOne({ name: PLATFORM_BOOTSTRAP_MIGRATION.name });
  assert.ok(migration, 'platform-001-bootstrap migration must be recorded');
});

test('N1 bootstrap is idempotent: re-running does not duplicate permissions or roles', async () => {
  const permCountBefore = await Permission.countDocuments();
  const roleCountBefore = await Role.countDocuments();

  const secondRun = await runPlatformBootstrap({
    env: { TENANCY_MODE: 'multi', TENANCY_ENFORCEMENT: 'enforce' },
  });

  assert.equal(secondRun.success, true);
  assert.equal(secondRun.alreadyApplied, true);

  const permCountAfter = await Permission.countDocuments();
  const roleCountAfter = await Role.countDocuments();

  assert.equal(permCountAfter, permCountBefore);
  assert.equal(roleCountAfter, roleCountBefore);
});
```

- [ ] **Step 2: Implement the bootstrap logic** in `server/src/platform/bootstrap.js`:
```javascript
import Migration from '../models/Migration.js';
import Setting from '../models/Setting.js';
import Tenant from '../models/Tenant.js';
import { initDefaultPermissions, initDefaultScopedRoles, syncMissingPermissions } from '../services/permissions.js';
import { buildAllTenantIndexes } from '../tenancy/indexBuilder.js';
import { getTenancyMode } from '../config/tenancy.js';

export const PLATFORM_BOOTSTRAP_MIGRATION = Object.freeze({
  name: 'platform-001-bootstrap',
  version: '1.0.0',
});

/**
 * Execute N1 platform bootstrap migration on empty DB or multi-mode startup.
 * @param {{ env?: object }} [options]
 */
export async function runPlatformBootstrap({ env = process.env } = {}) {
  const mode = getTenancyMode(env);
  if (mode !== 'multi') {
    return { success: true, skipped: true, reason: 'single-mode' };
  }

  const existing = await Migration.findOne({ name: PLATFORM_BOOTSTRAP_MIGRATION.name });
  if (existing) {
    return { success: true, alreadyApplied: true, migrationRecorded: true };
  }

  // 1. Seed permission catalogue and role templates
  await initDefaultPermissions();
  await syncMissingPermissions();
  await initDefaultScopedRoles();

  // 2. Build compound indexes only (multi mode does not use global legacy unique indexes)
  await buildAllTenantIndexes();

  // 3. Platform Setting defaults (scope: 'platform')
  await Setting.findOneAndUpdate(
    { scope: 'platform', key: 'platform_initialized' },
    {
      $setOnInsert: {
        scope: 'platform',
        key: 'platform_initialized',
        value: true,
        category: 'system',
        description: 'Flag indicating N1 platform bootstrap completion',
      },
    },
    { upsert: true, new: true }
  );

  await Setting.findOneAndUpdate(
    { scope: 'platform', key: 'audit_retention_days' },
    {
      $setOnInsert: {
        scope: 'platform',
        key: 'audit_retention_days',
        value: parseInt(env.AUDIT_RETENTION_DAYS, 10) || 1825,
        category: 'compliance',
        description: 'Audit log retention duration in days (minimum 1825 for 5 years)',
      },
    },
    { upsert: true, new: true }
  );

  // 4. Verify tenant count is 0
  const tenantCount = await Tenant.countDocuments();
  if (tenantCount > 0) {
    // If existing tenants exist, ensure none is stamped as default in multi-mode clean install
    const defaultTenant = await Tenant.findOne({ isDefault: true });
    if (defaultTenant) {
      console.warn('[tenancy] Multi mode detected pre-existing default tenant');
    }
  }

  // 5. Mark migration as applied
  await Migration.findOneAndUpdate(
    { name: PLATFORM_BOOTSTRAP_MIGRATION.name },
    {
      $setOnInsert: {
        name: PLATFORM_BOOTSTRAP_MIGRATION.name,
        version: PLATFORM_BOOTSTRAP_MIGRATION.version,
      },
    },
    { upsert: true }
  );

  return { success: true, migrationRecorded: true, alreadyApplied: false };
}
```

- [ ] **Step 3: Implement migration file** in `server/migrations/0009_platform_bootstrap.js`:
```javascript
import { runPlatformBootstrap, PLATFORM_BOOTSTRAP_MIGRATION } from '../src/platform/bootstrap.js';

export default {
  version: PLATFORM_BOOTSTRAP_MIGRATION.version,
  name: PLATFORM_BOOTSTRAP_MIGRATION.name,
  description: 'N1 platform bootstrap: permissions, role templates, platform settings, compound indexes',
  async up() {
    await runPlatformBootstrap();
  },
};
```

- [ ] **Step 4: Run the test**:
```bash
node --test --test-timeout=60000 server/test/platformBootstrap.test.js
```

- [ ] **Step 5: Commit**:
```bash
git add server/src/platform/bootstrap.js server/migrations/0009_platform_bootstrap.js server/test/platformBootstrap.test.js
git commit -m "feat(platform): N1 platform bootstrap migration and clean DB initialization"
```

---

### Task 2: N2 First Platform Owner CLI & Multi-Mode Setup Wizard Lock (Repository: core)

**Files:**
- Create: `scripts/platform-bootstrap.mjs`
- Modify: `server/src/routes/install.js`
- Create: `server/test/platformBootstrapCli.test.js`

**Interfaces:**
- Consumes: `StaffAccount` model, `Role` model, `RoleAssignment` model, `runPlatformBootstrap` from `server/src/platform/bootstrap.js`.
- Produces: Executable CLI `node scripts/platform-bootstrap.mjs --owner-email <email>` creating the first `platform_owner`, generating one-time setup token, locking `/install` in multi mode.

- [ ] **Step 1: Write the failing tests** in `server/test/platformBootstrapCli.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import StaffAccount from '../src/models/StaffAccount.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import Role from '../src/models/Role.js';
import { bootstrapFirstPlatformOwner, parseBootstrapArgs } from '../../scripts/platform-bootstrap.mjs';
import { runPlatformBootstrap } from '../src/platform/bootstrap.js';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9a_t2';

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

test('parseBootstrapArgs correctly extracts CLI flags', () => {
  const args = ['--owner-email', 'owner@example.com', '--username', 'rootowner', '--password', 'SecretPass123!'];
  const opts = parseBootstrapArgs(args);
  assert.equal(opts.ownerEmail, 'owner@example.com');
  assert.equal(opts.username, 'rootowner');
  assert.equal(opts.password, 'SecretPass123!');
});

test('N2 provisions first platform owner with platform_owner role and inactive 2FA (forces 2FA setup on login)', async () => {
  const result = await bootstrapFirstPlatformOwner({
    ownerEmail: 'owner@example.com',
    username: 'platformowner',
    password: 'InitialPassword123!',
  });

  assert.equal(result.created, true);
  assert.equal(result.email, 'owner@example.com');

  const staff = await StaffAccount.findOne({ email: 'owner@example.com' });
  assert.ok(staff, 'StaffAccount document must be created');
  assert.equal(staff.twoFactor.enabled, false, '2FA must start disabled to trigger requires2faSetup flow');

  const assignment = await RoleAssignment.findOne({ staffId: staff._id, scopeType: 'platform' });
  assert.ok(assignment, 'Role assignment must exist');
  const role = await Role.findById(assignment.roleId);
  assert.equal(role.name, 'platform_owner');
});

test('N2 bootstrap CLI is idempotent: second run reports already installed without duplicating', async () => {
  const result = await bootstrapFirstPlatformOwner({
    ownerEmail: 'another@example.com',
  });

  assert.equal(result.created, false);
  assert.equal(result.alreadyInstalled, true);
  assert.equal(result.email, 'owner@example.com');

  const count = await StaffAccount.countDocuments();
  assert.equal(count, 1, 'Only one platform owner account should exist');
});
```

- [ ] **Step 2: Implement the CLI logic** in `scripts/platform-bootstrap.mjs`:
```javascript
#!/usr/bin/env node
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const requireFromServer = createRequire(join(__dirname, '..', 'server', 'package.json'));
const mongoose = requireFromServer('mongoose');
const dotenv = requireFromServer('dotenv');

dotenv.config({ path: join(__dirname, '..', '.env') });
dotenv.config({ path: join(__dirname, '..', 'server', '.env') });

import StaffAccount from '../server/src/models/StaffAccount.js';
import Role from '../server/src/models/Role.js';
import RoleAssignment from '../server/src/models/RoleAssignment.js';
import { runPlatformBootstrap } from '../server/src/platform/bootstrap.js';

export function parseBootstrapArgs(argv = []) {
  const opts = { ownerEmail: null, username: null, password: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--owner-email') opts.ownerEmail = argv[++i];
    else if (argv[i] === '--username') opts.username = argv[++i];
    else if (argv[i] === '--password') opts.password = argv[++i];
  }
  return opts;
}

export async function bootstrapFirstPlatformOwner({ ownerEmail, username, password } = {}) {
  if (!ownerEmail) throw new Error('--owner-email is required');

  // 1. Ensure bootstrap migrations & roles are in place
  await runPlatformBootstrap({ env: process.env });

  // 2. Check if a platform owner already exists
  const platformOwnerRole = await Role.findOne({ name: 'platform_owner', scopeType: 'platform' });
  if (!platformOwnerRole) throw new Error('Role platform_owner not found. Run bootstrap migration first.');

  const existingAssignment = await RoleAssignment.findOne({
    roleId: platformOwnerRole._id,
    scopeType: 'platform',
  });

  if (existingAssignment) {
    const existingStaff = await StaffAccount.findById(existingAssignment.staffId);
    return {
      created: false,
      alreadyInstalled: true,
      email: existingStaff?.email || 'unknown',
    };
  }

  // 3. Create the first StaffAccount
  const finalUsername = username || ownerEmail.split('@')[0];
  const finalPassword = password || crypto.randomBytes(16).toString('base64url');

  const staff = await StaffAccount.create({
    email: ownerEmail.toLowerCase().trim(),
    username: finalUsername,
    password: finalPassword,
    status: 'active',
    twoFactor: { enabled: false }, // Mandatory 2FA triggers at login
  });

  // 4. Create RoleAssignment
  await RoleAssignment.create({
    staffId: staff._id,
    roleId: platformOwnerRole._id,
    scopeType: 'platform',
    scopeId: null,
  });

  return {
    created: true,
    alreadyInstalled: false,
    email: staff.email,
    username: staff.username,
    generatedPassword: password ? null : finalPassword,
  };
}

async function main() {
  const opts = parseBootstrapArgs(process.argv.slice(2));
  if (!opts.ownerEmail) {
    console.error('Usage: node scripts/platform-bootstrap.mjs --owner-email <email> [--username <name>] [--password <pass>]');
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('Error: MONGODB_URI not found in environment.');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  try {
    const result = await bootstrapFirstPlatformOwner(opts);
    if (result.alreadyInstalled) {
      console.log(`[platform-bootstrap] Platform is already installed. Platform Owner exists: ${result.email}`);
    } else {
      console.log(`[platform-bootstrap] Platform Owner created: ${result.email} (${result.username})`);
      if (result.generatedPassword) {
        console.log(`[platform-bootstrap] Temporary Password: ${result.generatedPassword}`);
      }
      console.log('[platform-bootstrap] Note: 2FA enrollment will be required upon first login.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[platform-bootstrap] Error:', err.message);
    process.exit(1);
  });
}
```

- [ ] **Step 3: Modify `server/src/routes/install.js`** to lock the setup wizard in multi mode:
In `server/src/routes/install.js`, add multi-mode check:
```javascript
import { getTenancyMode } from '../config/tenancy.js';

// In pageHandler, statusHandler, and runHandler:
if (getTenancyMode() === 'multi') {
  return res.status(404).json({
    error: 'INSTALL_WIZARD_DISABLED',
    message: 'Setup wizard is disabled in multi-tenant mode. Use scripts/platform-bootstrap.mjs instead.',
  });
}
```

- [ ] **Step 4: Run the test**:
```bash
node --test --test-timeout=60000 server/test/platformBootstrapCli.test.js
```

- [ ] **Step 5: Commit**:
```bash
git add scripts/platform-bootstrap.mjs server/src/routes/install.js server/test/platformBootstrapCli.test.js
git commit -m "feat(platform): N2 first platform owner CLI bootstrap and multi-mode setup lock"
```

---

### Task 3: Platform Host Routing, Configurable Audit Retention (K24), and Platform Write Grant Model (K23) (Repository: core)

**Files:**
- Create: `server/src/models/PlatformWriteGrant.js`
- Modify: `server/src/middleware/tenantHost.js`
- Modify: `server/src/middleware/auth.js`
- Modify: `server/src/config/tenancy.js`
- Modify: `server/src/models/AuditLog.js`
- Modify: `server/src/models/AdminAction.js`
- Create: `server/test/platformWriteGrant.test.js`
- Create: `server/test/auditRetention.test.js`

**Interfaces:**
- Consumes: `requireStaff` in `server/src/middleware/auth.js`, `resolveTenantHost` in `server/src/middleware/tenantHost.js`, `AuditLog` model.
- Produces: `PlatformWriteGrant` model, audited write exception check allowing platform staff writes only with active grants, platform host bypass in `tenantHost.js`, and configurable 5-year audit retention index.

- [ ] **Step 1: Write the failing tests** in `server/test/platformWriteGrant.test.js` and `server/test/auditRetention.test.js`:
In `server/test/platformWriteGrant.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import PlatformWriteGrant from '../src/models/PlatformWriteGrant.js';
import AuditLog from '../src/models/AuditLog.js';
import Tenant from '../src/models/Tenant.js';
import StaffAccount from '../src/models/StaffAccount.js';
import { requireStaff } from '../src/middleware/auth.js';
import { signStaffAccess } from '../src/services/staffSession.js';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9a_t3';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('platform staff write on tenant route blocked with PLATFORM_READ_ONLY without active grant', async () => {
  const staff = await StaffAccount.create({
    email: 'ops@example.com', username: 'opsstaff', password: 'pwd', status: 'active',
  });
  const tenant = await Tenant.create({ key: 'beta', name: 'Beta', status: 'active' });
  const token = signStaffAccess(staff, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });

  const req = {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenant._id.toString() },
    originalUrl: '/api/admin/settings',
  };
  const res = {};
  let errCalled = null;
  const next = (err) => { errCalled = err; };

  const middleware = requireStaff('tenant');
  await middleware(req, res, next);

  assert.ok(errCalled, 'Must reject with error');
  assert.equal(errCalled.status, 403);
  assert.equal(errCalled.code, 'PLATFORM_READ_ONLY');
});

test('platform staff write allowed when active PlatformWriteGrant exists and logs PLATFORM_WRITE_EXCEPTION audit', async () => {
  const staff = await StaffAccount.findOne({ email: 'ops@example.com' });
  const tenant = await Tenant.findOne({ key: 'beta' });

  const grant = await PlatformWriteGrant.create({
    staffId: staff._id,
    tenantId: tenant._id,
    reason: 'Emergency database fix',
    expiresAt: new Date(Date.now() + 3600_000),
    grantedBy: staff._id,
    status: 'active',
  });

  const token = signStaffAccess(staff, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });
  const req = {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenant._id.toString() },
    originalUrl: '/api/admin/settings',
    body: { maintenance: true },
  };
  const res = {};
  let calledNext = false;
  let errCalled = null;
  const next = (err) => {
    if (err) errCalled = err;
    else calledNext = true;
  };

  const middleware = requireStaff('tenant');
  await middleware(req, res, next);

  assert.equal(errCalled, null);
  assert.equal(calledNext, true);
  assert.ok(req.platformWriteGrant);
  assert.equal(req.platformWriteGrant._id.toString(), grant._id.toString());
});
```

In `server/test/auditRetention.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTenancyStartup } from '../src/config/tenancy.js';

test('validateTenancyStartup enforces AUDIT_RETENTION_DAYS >= 1825 in multi mode', () => {
  const problemsLow = validateTenancyStartup({
    TENANCY_MODE: 'multi',
    JWT_STAFF_SECRET: 'secret-key-staff',
    OPERATOR_SECRET_ENCRYPTION_KEY: 'a'.repeat(64),
    AUDIT_RETENTION_DAYS: '365',
  });

  assert.ok(problemsLow.some(p => p.includes('AUDIT_RETENTION_DAYS must be at least 1825')));

  const problemsValid = validateTenancyStartup({
    TENANCY_MODE: 'multi',
    JWT_STAFF_SECRET: 'secret-key-staff',
    OPERATOR_SECRET_ENCRYPTION_KEY: 'a'.repeat(64),
    AUDIT_RETENTION_DAYS: '1825',
  });

  assert.equal(problemsValid.length, 0);
});
```

- [ ] **Step 2: Implement `PlatformWriteGrant` model** in `server/src/models/PlatformWriteGrant.js`:
```javascript
import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/**
 * Platform model: time-limited audited write exception grant (spec §5.3, K23).
 * Never apply tenantScoped plugin.
 */
const platformWriteGrantSchema = new mongoose.Schema({
  staffId: { type: ObjectId, ref: 'StaffAccount', required: true, index: true },
  tenantId: { type: ObjectId, ref: 'Tenant', required: true, index: true },
  reason: { type: String, required: true, trim: true },
  expiresAt: { type: Date, required: true, index: true },
  grantedBy: { type: ObjectId, ref: 'StaffAccount', required: true },
  revokedAt: { type: Date, default: null },
  status: { type: String, enum: ['active', 'expired', 'revoked'], default: 'active' },
}, { timestamps: true });

export default mongoose.models.PlatformWriteGrant || mongoose.model('PlatformWriteGrant', platformWriteGrantSchema);
```

- [ ] **Step 3: Update `server/src/middleware/auth.js`** to check `PlatformWriteGrant` before rejecting with `PLATFORM_READ_ONLY`:
In `server/src/middleware/auth.js`:
```javascript
import PlatformWriteGrant from '../models/PlatformWriteGrant.js';

// In requireStaff('tenant'):
if (allowedScope === 'tenant' && payload.scp === 'platform' && req.method &&
    !SAFE_TENANT_ROUTE_METHODS.has(String(req.method || '').toUpperCase())) {
  const activeGrant = await PlatformWriteGrant.findOne({
    staffId: payload.sub,
    tenantId: req.tenant.id,
    expiresAt: { $gt: new Date() },
    revokedAt: null,
    status: 'active',
  });

  if (!activeGrant) {
    await auditPlatformReadOnlyViolation(req, payload);
    return next(createError(403, 'PLATFORM_READ_ONLY', 'Platform personeli kiracı rotalarında yalnızca okuma yapabilir'));
  }

  req.platformWriteGrant = activeGrant;
  // Audit the write exception execution
  await runWithTenant(req.tenant.id, () => AuditLog.create({
    actorType: 'admin',
    actorUsername: staff?.username || String(payload.sub),
    actorScope: 'platform',
    actorStaffId: payload.sub,
    onBehalfOfTenantId: req.tenant.id,
    action: 'PLATFORM_WRITE_EXCEPTION',
    category: 'system',
    targetType: 'system',
    reason: activeGrant.reason,
    metadata: {
      grantId: activeGrant._id,
      route: req.originalUrl || req.path,
      method: req.method,
    },
  }));
}
```

- [ ] **Step 4: Update `server/src/middleware/tenantHost.js`**:
In `server/src/middleware/tenantHost.js`:
Add platform host identification:
```javascript
function isPlatformRequest(host, req) {
  const platformHost = process.env.PLATFORM_HOST ? normalizeHost(process.env.PLATFORM_HOST) : null;
  if (platformHost && host === platformHost) return true;
  if (req?.path?.startsWith('/api/platform') || req?.path?.startsWith('/console')) return true;
  return false;
}

// Inside tenantHostResolution middleware:
if (tenancyMode === 'multi') {
  if (isPlatformRequest(host, req)) {
    req.tenant = null;
    return next();
  }
  const tenant = await resolveTenantByHost(host);
  if (!tenant) {
    return res.status(404).json({ error: 'TENANT_NOT_FOUND', message: 'Domain not registered' });
  }
  // Traffic gate: check tenant status (N4)
  const tenantDoc = await Tenant.findById(tenant.id).select('status').lean();
  if (tenantDoc?.status === 'provisioning') {
    return res.status(503).json({ error: 'TENANT_NOT_READY', message: 'Tenant is currently being provisioned' });
  }
  if (tenantDoc?.status === 'suspended') {
    return res.status(503).json({ error: 'TENANT_SUSPENDED', message: 'Tenant is suspended' });
  }
  if (tenantDoc?.status === 'closed') {
    return res.status(404).json({ error: 'TENANT_CLOSED', message: 'Tenant is closed' });
  }
  req.tenant = tenant;
}
```

- [ ] **Step 5: Update `server/src/config/tenancy.js`, `AuditLog.js` and `AdminAction.js`**:
In `server/src/config/tenancy.js`, validate `AUDIT_RETENTION_DAYS`:
```javascript
if (rawMode.toLowerCase() === 'multi') {
  const retention = parseInt(env.AUDIT_RETENTION_DAYS || '1825', 10);
  if (isNaN(retention) || retention < 1825) {
    problems.push('TENANCY_MODE=multi requires AUDIT_RETENTION_DAYS to be at least 1825 (5 years)');
  }
}
```
In `AuditLog.js` and `AdminAction.js`, make TTL configurable:
```javascript
const retentionDays = parseInt(process.env.AUDIT_RETENTION_DAYS || '1825', 10);
schema.index({ createdAt: -1 }, { expireAfterSeconds: 60 * 60 * 24 * retentionDays });
```

- [ ] **Step 6: Run the tests**:
```bash
node --test --test-timeout=60000 server/test/platformWriteGrant.test.js server/test/auditRetention.test.js
```

- [ ] **Step 7: Commit**:
```bash
git add server/src/models/PlatformWriteGrant.js server/src/middleware/tenantHost.js server/src/middleware/auth.js server/src/config/tenancy.js server/src/models/AuditLog.js server/src/models/AdminAction.js server/test/platformWriteGrant.test.js server/test/auditRetention.test.js
git commit -m "feat(platform): platform write grants (K23), platform host bypass, and 5-year audit retention (K24)"
```

---

### Task 4: Tenant Provisioning Service & Subset Seeder (N4) (Repository: core)

**Files:**
- Create: `server/src/platform/services/tenantSeed.js`
- Create: `server/src/platform/services/provisioningService.js`
- Create: `server/test/tenantProvisioningService.test.js`

**Interfaces:**
- Consumes: `Tenant`, `Brand`, `Domain`, `StaffAccount`, `Role`, `RoleAssignment`, `VipLevel`, `StaticPage`, `SystemMailTemplate`, `SmsTemplate`, `ChatRoom`, `RiskRule`, `PlayerSegment`, `Setting` models; `runTenantProvisioningHooks` from `server/src/tenancy/provisioning.js`; `runWithTenant` from `server/src/tenancy/context.js`.
- Produces: `provisionTenant(data, { createdByStaffId })` orchestrator creating all tenant entities, seeding subsets, running hooks, and provisioning first `tenant_owner`.

- [ ] **Step 1: Write the failing tests** in `server/test/tenantProvisioningService.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Tenant from '../src/models/Tenant.js';
import Brand from '../src/models/Brand.js';
import Domain from '../src/models/Domain.js';
import StaffAccount from '../src/models/StaffAccount.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import VipLevel from '../src/models/VipLevel.js';
import StaticPage from '../src/models/StaticPage.js';
import RiskRule from '../src/models/RiskRule.js';
import { provisionTenant } from '../src/platform/services/provisioningService.js';
import { runPlatformBootstrap } from '../src/platform/bootstrap.js';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9a_t4';

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

test('N4 tenant provisioning creates Tenant, Brand, Domain, seeds subset, and assigns tenant_owner', async () => {
  const result = await provisionTenant({
    key: 'gamma',
    name: 'Gamma Casino',
    legalEntity: { name: 'Gamma Ltd', registrationNo: '998877', address: 'Curacao' },
    baseCurrency: 'TRY',
    timezone: 'Europe/Istanbul',
    defaultLocale: 'tr-TR',
    domain: 'gamma.example.com',
    ownerEmail: 'owner@gamma.example.com',
    ownerUsername: 'gamma_owner',
  });

  assert.equal(result.success, true);
  const tenant = await Tenant.findOne({ key: 'gamma' });
  assert.ok(tenant, 'Tenant must exist');
  assert.equal(tenant.status, 'provisioning', 'Tenant starts in provisioning status');
  assert.equal(tenant.legalEntity.name, 'Gamma Ltd');

  // Verify Brand
  const brand = await Brand.findOne({ tenantId: tenant._id });
  assert.ok(brand, 'Default Brand must exist');
  assert.equal(brand.isDefault, true);

  // Verify Domain
  const domain = await Domain.findOne({ host: 'gamma.example.com' });
  assert.ok(domain, 'Domain must exist');
  assert.equal(domain.verifiedAt, null, 'Domain starts unverified');
  assert.equal(domain.tls.status, 'pending');

  // Verify seed subset (strictly tenantScoped, zero demo data, zero bots)
  const vipCount = await VipLevel.countDocuments({ tenantId: tenant._id });
  assert.ok(vipCount > 0, 'VIP levels must be seeded');

  const pagesCount = await StaticPage.countDocuments({ tenantId: tenant._id });
  assert.ok(pagesCount > 0, 'Static pages must be seeded');

  const rulesCount = await RiskRule.countDocuments({ tenantId: tenant._id });
  assert.ok(rulesCount > 0, 'Risk rules must be seeded');

  // Verify tenant_owner staff account
  const staff = await StaffAccount.findOne({ email: 'owner@gamma.example.com' });
  assert.ok(staff, 'Tenant owner StaffAccount must be created');
  const assignment = await RoleAssignment.findOne({ staffId: staff._id, scopeType: 'tenant', scopeId: tenant._id });
  assert.ok(assignment, 'tenant_owner role must be assigned to tenantId');
});

test('N4 provisioning is idempotent: re-running with same key never duplicates entities', async () => {
  const rerun = await provisionTenant({
    key: 'gamma',
    name: 'Gamma Casino Updated Name',
    domain: 'gamma.example.com',
    ownerEmail: 'owner@gamma.example.com',
  });

  assert.equal(rerun.success, true);
  const tenantCount = await Tenant.countDocuments({ key: 'gamma' });
  assert.equal(tenantCount, 1);

  const domainCount = await Domain.countDocuments({ host: 'gamma.example.com' });
  assert.equal(domainCount, 1);
});
```

- [ ] **Step 2: Implement tenant subset seeder** in `server/src/platform/services/tenantSeed.js`:
```javascript
import VipLevel from '../../models/VipLevel.js';
import StaticPage from '../../models/StaticPage.js';
import SystemMailTemplate from '../../models/SystemMailTemplate.js';
import SmsTemplate from '../../models/SmsTemplate.js';
import ChatRoom from '../../models/ChatRoom.js';
import RiskRule from '../../models/RiskRule.js';
import PlayerSegment from '../../models/PlayerSegment.js';
import Setting from '../../models/Setting.js';
import { runWithTenant } from '../../tenancy/context.js';

export async function seedTenantSubset(tenantId, { brandName = 'Casino' } = {}) {
  return runWithTenant(tenantId, async () => {
    // 1. VIP levels
    const existingVip = await VipLevel.countDocuments({ tenantId });
    if (existingVip === 0) {
      await VipLevel.insertMany([
        { tenantId, level: 1, name: 'Bronze', minPoints: 0, cashbackPercent: 5 },
        { tenantId, level: 2, name: 'Silver', minPoints: 1000, cashbackPercent: 8 },
        { tenantId, level: 3, name: 'Gold', minPoints: 5000, cashbackPercent: 12 },
        { tenantId, level: 4, name: 'Platinum', minPoints: 20000, cashbackPercent: 15 },
      ]);
    }

    // 2. Static Pages
    const existingPages = await StaticPage.countDocuments({ tenantId });
    if (existingPages === 0) {
      await StaticPage.insertMany([
        { tenantId, slug: 'about-us', title: 'Hakkımızda', content: `${brandName} güvenilir oyun platformu.`, isPublished: true },
        { tenantId, slug: 'terms-and-conditions', title: 'Şartlar ve Koşullar', content: 'Genel kurallar ve şartlar.', isPublished: true },
        { tenantId, slug: 'privacy-policy', title: 'Gizlilik Politikası', content: 'Gizlilik ve veri güvenliği.', isPublished: true },
        { tenantId, slug: 'responsible-gaming', title: 'Sorumlu Oyun', content: 'Sorumlu bahis politikamız.', isPublished: true },
      ]);
    }

    // 3. Mail & SMS Templates
    const existingMail = await SystemMailTemplate.countDocuments({ tenantId });
    if (existingMail === 0) {
      await SystemMailTemplate.insertMany([
        { tenantId, key: 'welcome', name: 'Hoş Geldiniz', subject: `${brandName}'e Hoş Geldiniz!`, htmlBody: '<p>Aramıza hoş geldiniz!</p>', isSystem: true },
        { tenantId, key: 'password_reset', name: 'Şifre Sıfırlama', subject: 'Şifre Sıfırlama Talebi', htmlBody: '<p>Şifrenizi sıfırlayın.</p>', isSystem: true },
      ]);
    }

    // 4. Chat Room
    const existingRoom = await ChatRoom.countDocuments({ tenantId });
    if (existingRoom === 0) {
      await ChatRoom.create({ tenantId, name: 'Genel', slug: 'general', isDefault: true, isActive: true });
    }

    // 5. Risk Rules
    const existingRules = await RiskRule.countDocuments({ tenantId });
    if (existingRules === 0) {
      await RiskRule.insertMany([
        { tenantId, name: 'Rapid Withdrawals', event: 'withdrawal.request', condition: 'minutesSinceDeposit < 15', action: 'flag', severity: 'medium', enabled: true },
        { tenantId, name: 'Multiple Account IP', event: 'user.login', condition: 'accountsSameIp > 3', action: 'review', severity: 'high', enabled: true },
      ]);
    }

    // 6. Player Segments
    const existingSegments = await PlayerSegment.countDocuments({ tenantId });
    if (existingSegments === 0) {
      await PlayerSegment.insertMany([
        { tenantId, name: 'All Players', slug: 'all-players', isSystem: true },
        { tenantId, name: 'VIP Players', slug: 'vip-players', isSystem: true },
      ]);
    }

    // 7. Default Tenant Settings
    await Setting.findOneAndUpdate(
      { tenantId, key: 'site_active' },
      { $setOnInsert: { tenantId, key: 'site_active', value: true, scope: 'tenant', category: 'system' } },
      { upsert: true }
    );
  });
}
```

- [ ] **Step 3: Implement provisioning service** in `server/src/platform/services/provisioningService.js`:
```javascript
import crypto from 'node:crypto';
import Tenant from '../../models/Tenant.js';
import Brand from '../../models/Brand.js';
import Domain from '../../models/Domain.js';
import StaffAccount from '../../models/StaffAccount.js';
import Role from '../../models/Role.js';
import RoleAssignment from '../../models/RoleAssignment.js';
import AuditLog from '../../models/AuditLog.js';
import { seedTenantSubset } from './tenantSeed.js';
import { runTenantProvisioningHooks } from '../../tenancy/provisioning.js';

export async function provisionTenant({
  key, name, legalEntity = {}, baseCurrency = 'TRY', timezone = 'Europe/Istanbul',
  defaultLocale = 'tr-TR', domain, ownerEmail, ownerUsername, entitlements = {}, credentials = {},
} = {}, { createdByStaffId = null } = {}) {
  if (!key || typeof key !== 'string') throw new Error('Tenant key is required');
  if (!name || typeof name !== 'string') throw new Error('Tenant name is required');
  if (!domain || typeof domain !== 'string') throw new Error('Primary domain is required');

  const normalizedKey = key.toLowerCase().trim();
  const normalizedDomain = domain.toLowerCase().trim();

  // 1. Create or retrieve Tenant
  let tenant = await Tenant.findOne({ key: normalizedKey });
  if (!tenant) {
    tenant = await Tenant.create({
      key: normalizedKey,
      name: name.trim(),
      legalEntity: {
        name: legalEntity.name || null,
        registrationNo: legalEntity.registrationNo || null,
        address: legalEntity.address || null,
      },
      status: 'provisioning',
      ownership: 'direct',
      createdVia: 'platform',
      createdBy: createdByStaffId,
      baseCurrency,
      timezone,
      defaultLocale,
      entitlements: {
        modules: entitlements.modules || [],
        limits: entitlements.limits || {},
      },
    });
  }

  // 2. Create or retrieve default Brand
  let brand = await Brand.findOne({ tenantId: tenant._id, isDefault: true });
  if (!brand) {
    brand = await Brand.create({
      tenantId: tenant._id,
      name: tenant.name,
      slug: normalizedKey,
      isDefault: true,
    });
  }

  // 3. Create or retrieve Domain
  let domainDoc = await Domain.findOne({ host: normalizedDomain });
  if (!domainDoc) {
    const txtToken = `vip90-challenge-${crypto.randomBytes(16).toString('hex')}`;
    domainDoc = await Domain.create({
      host: normalizedDomain,
      tenantId: tenant._id,
      brandId: brand._id,
      isPrimary: true,
      purpose: 'player',
      verifiedAt: null,
      tls: { status: 'pending', provider: 'cloudflare' },
      txtVerificationToken: txtToken,
    });
  }

  // 4. Seed Essential Subsets
  await seedTenantSubset(tenant._id, { brandName: tenant.name });

  // 5. Run registered provisioning hooks (inhouse, etc.)
  await runTenantProvisioningHooks(tenant);

  // 6. First tenant_owner staff account
  if (ownerEmail) {
    const normalizedEmail = ownerEmail.toLowerCase().trim();
    let staff = await StaffAccount.findOne({ email: normalizedEmail });
    if (!staff) {
      staff = await StaffAccount.create({
        email: normalizedEmail,
        username: ownerUsername || normalizedEmail.split('@')[0],
        password: crypto.randomBytes(16).toString('base64url'),
        status: 'active',
        twoFactor: { enabled: false },
      });
    }

    const tenantOwnerRole = await Role.findOne({ name: 'tenant_owner', scopeType: 'tenant' });
    if (tenantOwnerRole) {
      await RoleAssignment.findOneAndUpdate(
        { staffId: staff._id, scopeType: 'tenant', scopeId: tenant._id, roleId: tenantOwnerRole._id },
        { $setOnInsert: { staffId: staff._id, scopeType: 'tenant', scopeId: tenant._id, roleId: tenantOwnerRole._id, grantedBy: createdByStaffId } },
        { upsert: true }
      );
    }
  }

  // 7. Audit log
  await AuditLog.create({
    actorType: 'admin',
    actorUsername: 'platform',
    actorScope: 'platform',
    actorStaffId: createdByStaffId,
    action: 'TENANT_PROVISIONED',
    category: 'system',
    targetType: 'system',
    targetId: tenant._id.toString(),
    metadata: { tenantKey: tenant.key, domain: normalizedDomain },
  });

  return {
    success: true,
    tenantId: tenant._id,
    key: tenant.key,
    domain: domainDoc.host,
    status: tenant.status,
  };
}
```

- [ ] **Step 4: Run the test**:
```bash
node --test --test-timeout=60000 server/test/tenantProvisioningService.test.js
```

- [ ] **Step 5: Commit**:
```bash
git add server/src/platform/services/tenantSeed.js server/src/platform/services/provisioningService.js server/test/tenantProvisioningService.test.js
git commit -m "feat(platform): N4 tenant provisioning pipeline and essential subset seeder"
```

---

### Task 5: Domain DNS TXT Verification & Cloudflare for SaaS TLS Adapter (K25) (Repository: core)

**Files:**
- Create: `server/src/platform/services/cloudflareSaaS.js`
- Create: `server/src/platform/services/domainService.js`
- Create: `server/test/domainVerification.test.js`

**Interfaces:**
- Consumes: `Domain` model, `node:dns/promises` for DNS TXT resolution.
- Produces: `verifyDomainDns(domainId, { resolver })` and `syncDomainTls(domainId, { cfClient })` verifying ownership and TLS status via Cloudflare for SaaS.

- [ ] **Step 1: Write the failing tests** in `server/test/domainVerification.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Domain from '../src/models/Domain.js';
import Tenant from '../src/models/Tenant.js';
import { verifyDomainDns, syncDomainTls } from '../src/platform/services/domainService.js';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9a_t5';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('verifyDomainDns marks domain as verified when TXT record matches token', async () => {
  const tenant = await Tenant.create({ key: 'delta', name: 'Delta' });
  const domain = await Domain.create({
    host: 'delta.example.com',
    tenantId: tenant._id,
    txtVerificationToken: 'vip90-challenge-12345',
    verifiedAt: null,
  });

  const fakeResolver = async (hostname) => {
    if (hostname === `_vip90-challenge.delta.example.com` || hostname === 'delta.example.com') {
      return [['vip90-challenge-12345']];
    }
    return [];
  };

  const result = await verifyDomainDns(domain._id, { resolver: fakeResolver });
  assert.equal(result.verified, true);

  const updated = await Domain.findById(domain._id);
  assert.ok(updated.verifiedAt instanceof Date);
});

test('syncDomainTls updates tls status from Cloudflare for SaaS client', async () => {
  const domain = await Domain.findOne({ host: 'delta.example.com' });

  const fakeCfClient = {
    async getCustomHostnameStatus() {
      return { status: 'active', ssl: { status: 'active' } };
    },
  };

  const tlsResult = await syncDomainTls(domain._id, { cfClient: fakeCfClient });
  assert.equal(tlsResult.status, 'active');

  const updated = await Domain.findById(domain._id);
  assert.equal(updated.tls.status, 'active');
});
```

- [ ] **Step 2: Implement Cloudflare for SaaS client** in `server/src/platform/services/cloudflareSaaS.js`:
```javascript
export class CloudflareSaaSClient {
  constructor({ apiToken = process.env.CLOUDFLARE_API_TOKEN, zoneId = process.env.CLOUDFLARE_ZONE_ID } = {}) {
    this.apiToken = apiToken;
    this.zoneId = zoneId;
  }

  async createCustomHostname(hostname) {
    if (!this.apiToken || !this.zoneId) {
      // Mock / fallback when unconfigured
      return { id: `mock-${hostname}`, status: 'pending', ssl: { status: 'pending' } };
    }
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${this.zoneId}/custom_hostnames`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        hostname,
        ssl: { method: 'txt', type: 'dv' },
      }),
    });
    return res.json();
  }

  async getCustomHostnameStatus(hostnameId) {
    if (!this.apiToken || !this.zoneId) {
      return { status: 'active', ssl: { status: 'active' } };
    }
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${this.zoneId}/custom_hostnames/${hostnameId}`, {
      headers: { Authorization: `Bearer ${this.apiToken}` },
    });
    return res.json();
  }
}
```

- [ ] **Step 3: Implement domain service** in `server/src/platform/services/domainService.js`:
```javascript
import { resolveTxt } from 'node:dns/promises';
import Domain from '../../models/Domain.js';
import { CloudflareSaaSClient } from './cloudflareSaaS.js';

export async function verifyDomainDns(domainId, { resolver = resolveTxt } = {}) {
  const domain = await Domain.findById(domainId);
  if (!domain) throw new Error('Domain not found');
  if (domain.verifiedAt) return { verified: true, verifiedAt: domain.verifiedAt };

  const expectedToken = domain.txtVerificationToken;
  if (!expectedToken) throw new Error('Domain has no verification token configured');

  const targets = [`_vip90-challenge.${domain.host}`, domain.host];
  let matched = false;

  for (const target of targets) {
    try {
      const records = await resolver(target);
      const flat = records.flat();
      if (flat.includes(expectedToken)) {
        matched = true;
        break;
      }
    } catch {
      // DNS record resolution missed, continue to next target
    }
  }

  if (matched) {
    domain.verifiedAt = new Date();
    await domain.save();
    return { verified: true, verifiedAt: domain.verifiedAt };
  }

  return { verified: false, expectedToken, targets };
}

export async function syncDomainTls(domainId, { cfClient = new CloudflareSaaSClient() } = {}) {
  const domain = await Domain.findById(domainId);
  if (!domain) throw new Error('Domain not found');

  const status = await cfClient.getCustomHostnameStatus(domain.tls?.customHostnameId || domain.host);
  const tlsStatus = status.ssl?.status === 'active' || status.status === 'active' ? 'active' : 'pending';

  domain.tls = {
    ...domain.tls,
    status: tlsStatus,
    provider: 'cloudflare',
  };
  await domain.save();
  return { status: tlsStatus };
}
```

- [ ] **Step 4: Run the test**:
```bash
node --test --test-timeout=60000 server/test/domainVerification.test.js
```

- [ ] **Step 5: Commit**:
```bash
git add server/src/platform/services/cloudflareSaaS.js server/src/platform/services/domainService.js server/test/domainVerification.test.js
git commit -m "feat(platform): DNS TXT verification and Cloudflare for SaaS TLS synchronization (K25)"
```

---

### Task 6: Go-Live Checklist, Status Transitions & Closure Retention (N5, K22, K26) (Repository: core)

**Files:**
- Create: `server/src/platform/services/goLiveChecklist.js`
- Create: `server/src/platform/services/tenantLifecycle.js`
- Create: `server/test/goLiveChecklist.test.js`
- Create: `server/test/tenantLifecycle.test.js`

**Interfaces:**
- Consumes: `Tenant`, `Domain`, `AuditLog` models; `evaluateGoLiveChecklist(tenantId)`.
- Produces: `transitionTenantStatus(tenantId, newStatus, { actorStaffId, force, reason })` enforcing checklist completion before `active`, and managing `closed` data export and legal retention lock.

- [ ] **Step 1: Write the failing tests** in `server/test/goLiveChecklist.test.js` and `server/test/tenantLifecycle.test.js`:
In `server/test/goLiveChecklist.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Tenant from '../src/models/Tenant.js';
import Domain from '../src/models/Domain.js';
import { evaluateGoLiveChecklist } from '../src/platform/services/goLiveChecklist.js';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9a_t6';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('evaluateGoLiveChecklist reports incomplete gates for newly provisioned tenant', async () => {
  const tenant = await Tenant.create({
    key: 'eps',
    name: 'Eps Casino',
    status: 'provisioning',
  });

  const checklist = await evaluateGoLiveChecklist(tenant._id);
  assert.equal(checklist.allPassed, false);
  assert.equal(checklist.gates.legalEntity.passed, false);
  assert.equal(checklist.gates.domainTls.passed, false);
});

test('evaluateGoLiveChecklist passes when all 6 gates are satisfied including K22 provider approval', async () => {
  const tenant = await Tenant.create({
    key: 'zeta',
    name: 'Zeta Casino',
    status: 'provisioning',
    legalEntity: { name: 'Zeta Corp', registrationNo: '112233', address: 'Malta' },
    providerApproval: { approved: true, approvedAt: new Date(), documentRef: 'AGREEMENT-2026-01' },
    checklist: { pspVerified: true, kycVerified: true, emailVerified: true },
  });

  await Domain.create({
    host: 'zeta.example.com',
    tenantId: tenant._id,
    isPrimary: true,
    verifiedAt: new Date(),
    tls: { status: 'active', provider: 'cloudflare' },
  });

  const checklist = await evaluateGoLiveChecklist(tenant._id);
  assert.equal(checklist.allPassed, true);
});
```

In `server/test/tenantLifecycle.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Tenant from '../src/models/Tenant.js';
import { transitionTenantStatus } from '../src/platform/services/tenantLifecycle.js';

test('transitionTenantStatus rejects active when checklist incomplete without force', async () => {
  const tenant = await Tenant.create({ key: 'eta', name: 'Eta', status: 'provisioning' });

  await assert.rejects(
    async () => transitionTenantStatus(tenant._id, 'active', { actorStaffId: new mongoose.Types.ObjectId() }),
    /CHECKLIST_INCOMPLETE/
  );
});

test('transitionTenantStatus allows closure with export and legal retention lock (K26)', async () => {
  const tenant = await Tenant.create({ key: 'theta', name: 'Theta', status: 'active' });
  const result = await transitionTenantStatus(tenant._id, 'closed', {
    actorStaffId: new mongoose.Types.ObjectId(),
    reason: 'Contract termination',
  });

  assert.equal(result.status, 'closed');
  const updated = await Tenant.findById(tenant._id);
  assert.ok(updated.closedAt instanceof Date);
  assert.ok(result.retentionLockUntil instanceof Date);
});
```

- [ ] **Step 2: Implement go-live checklist evaluator** in `server/src/platform/services/goLiveChecklist.js`:
```javascript
import Tenant from '../../models/Tenant.js';
import Domain from '../../models/Domain.js';

export async function evaluateGoLiveChecklist(tenantId) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new Error('Tenant not found');

  const primaryDomain = await Domain.findOne({ tenantId, isPrimary: true });

  const gates = {
    legalEntity: {
      passed: Boolean(tenant.legalEntity?.name && tenant.legalEntity?.registrationNo && tenant.legalEntity?.address),
      detail: tenant.legalEntity?.name ? 'Configured' : 'Missing legal entity details',
    },
    providerApproval: {
      // K22: casino content / igames requires written approval before live
      passed: Boolean(tenant.providerApproval?.approved),
      detail: tenant.providerApproval?.approved ? `Approved (${tenant.providerApproval.documentRef})` : 'Awaiting written provider approval',
    },
    pspSandbox: {
      passed: Boolean(tenant.checklist?.pspVerified),
      detail: tenant.checklist?.pspVerified ? 'Verified' : 'PSP sandbox deposit/withdrawal test pending',
    },
    kycWebhook: {
      passed: Boolean(tenant.checklist?.kycVerified),
      detail: tenant.checklist?.kycVerified ? 'Verified' : 'KYC webhook endpoint unverified',
    },
    emailSending: {
      passed: Boolean(tenant.checklist?.emailVerified),
      detail: tenant.checklist?.emailVerified ? 'Verified' : 'Email sender test unverified',
    },
    domainTls: {
      passed: Boolean(primaryDomain?.verifiedAt && primaryDomain?.tls?.status === 'active'),
      detail: primaryDomain?.verifiedAt ? 'DNS and TLS active' : 'DNS TXT verification or TLS pending',
    },
  };

  const allPassed = Object.values(gates).every((gate) => gate.passed);
  return { tenantId, allPassed, gates };
}
```

- [ ] **Step 3: Implement tenant lifecycle manager** in `server/src/platform/services/tenantLifecycle.js`:
```javascript
import Tenant from '../../models/Tenant.js';
import AuditLog from '../../models/AuditLog.js';
import { evaluateGoLiveChecklist } from './goLiveChecklist.js';

export async function transitionTenantStatus(tenantId, newStatus, { actorStaffId, force = false, reason = '' } = {}) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new Error('Tenant not found');

  const currentStatus = tenant.status;
  if (currentStatus === newStatus) return { status: currentStatus };

  if (newStatus === 'active') {
    const checklist = await evaluateGoLiveChecklist(tenantId);
    if (!checklist.allPassed && !force) {
      const failed = Object.entries(checklist.gates).filter(([, v]) => !v.passed).map(([k]) => k);
      throw new Error(`CHECKLIST_INCOMPLETE: Cannot activate tenant. Incomplete gates: ${failed.join(', ')}`);
    }
  }

  tenant.status = newStatus;
  let retentionLockUntil = null;

  if (newStatus === 'closed') {
    tenant.closedAt = new Date();
    // K24 / K26: 5-year retention lock
    const retentionYears = 5;
    retentionLockUntil = new Date(Date.now() + retentionYears * 365 * 86400 * 1000);
    tenant.legalRetentionUntil = retentionLockUntil;
  }

  await tenant.save();

  await AuditLog.create({
    actorType: 'admin',
    actorUsername: 'platform',
    actorScope: 'platform',
    actorStaffId,
    action: `TENANT_STATUS_${newStatus.toUpperCase()}`,
    category: 'system',
    targetType: 'system',
    targetId: tenant._id.toString(),
    reason,
    metadata: { previousStatus: currentStatus, newStatus, force },
  });

  return { status: newStatus, tenantId, retentionLockUntil };
}
```

- [ ] **Step 4: Run the tests**:
```bash
node --test --test-timeout=60000 server/test/goLiveChecklist.test.js server/test/tenantLifecycle.test.js
```

- [ ] **Step 5: Commit**:
```bash
git add server/src/platform/services/goLiveChecklist.js server/src/platform/services/tenantLifecycle.js server/test/goLiveChecklist.test.js server/test/tenantLifecycle.test.js
git commit -m "feat(platform): N5 go-live checklist (K22) and tenant lifecycle status transitions (K26)"
```

---

### Task 7: Scope Telemetry & N6 Gates Monitoring (N6) (Repository: core)

**Files:**
- Create: `server/src/platform/services/scopeTelemetry.js`
- Create: `server/test/scopeTelemetry.test.js`

**Interfaces:**
- Consumes: `getScopeViolationStats` from `server/src/tenancy/tenantScoped.js`.
- Produces: `evaluateScopeGates()` calculating consecutive zero-error days for Staging (14 days) and Production (7 days).

- [ ] **Step 1: Write the failing tests** in `server/test/scopeTelemetry.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { ScopeTelemetryService } from '../src/platform/services/scopeTelemetry.js';

test('ScopeTelemetryService tracks clean days and reports N6 gate status', async () => {
  const telemetry = new ScopeTelemetryService();

  // Simulate clean run
  const statusClean = telemetry.evaluateGates({
    stagingDaysActive: 14,
    stagingViolations: 0,
    prodDaysActive: 7,
    prodViolations: 0,
  });

  assert.equal(statusClean.staging.gatePassed, true);
  assert.equal(statusClean.staging.consecutiveCleanDays, 14);
  assert.equal(statusClean.production.gatePassed, true);
  assert.equal(statusClean.production.consecutiveCleanDays, 7);
});

test('ScopeTelemetryService resets clean day counter when violations occur', async () => {
  const telemetry = new ScopeTelemetryService();

  const statusViolated = telemetry.evaluateGates({
    stagingDaysActive: 14,
    stagingViolations: 3,
    prodDaysActive: 7,
    prodViolations: 0,
  });

  assert.equal(statusViolated.staging.gatePassed, false);
  assert.equal(statusViolated.staging.consecutiveCleanDays, 0);
  assert.equal(statusViolated.staging.totalViolations, 3);
});
```

- [ ] **Step 2: Implement scope telemetry service** in `server/src/platform/services/scopeTelemetry.js`:
```javascript
import { getScopeViolationStats } from '../../tenancy/tenantScoped.js';

export class ScopeTelemetryService {
  constructor() {
    this.windowStart = new Date();
  }

  evaluateGates({
    stagingDaysActive = 0,
    stagingViolations = 0,
    prodDaysActive = 0,
    prodViolations = 0,
  } = {}) {
    const liveStats = typeof getScopeViolationStats === 'function' ? getScopeViolationStats() : { count: 0 };
    const totalStagingViolations = stagingViolations + (liveStats.count || 0);

    const STAGING_REQUIRED_DAYS = 14;
    const PROD_REQUIRED_DAYS = 7;

    const stagingPassed = totalStagingViolations === 0 && stagingDaysActive >= STAGING_REQUIRED_DAYS;
    const prodPassed = prodViolations === 0 && prodDaysActive >= PROD_REQUIRED_DAYS;

    return {
      staging: {
        requiredDays: STAGING_REQUIRED_DAYS,
        consecutiveCleanDays: totalStagingViolations === 0 ? stagingDaysActive : 0,
        totalViolations: totalStagingViolations,
        gatePassed: stagingPassed,
      },
      production: {
        requiredDays: PROD_REQUIRED_DAYS,
        consecutiveCleanDays: prodViolations === 0 ? prodDaysActive : 0,
        totalViolations: prodViolations,
        gatePassed: prodPassed,
      },
    };
  }
}

export const scopeTelemetry = new ScopeTelemetryService();
```

- [ ] **Step 3: Run the test**:
```bash
node --test --test-timeout=60000 server/test/scopeTelemetry.test.js
```

- [ ] **Step 4: Commit**:
```bash
git add server/src/platform/services/scopeTelemetry.js server/test/scopeTelemetry.test.js
git commit -m "feat(platform): N6 scope error telemetry and staging/production gate evaluation"
```

---

### Task 8: Platform Server API Endpoints & Controllers (Repository: core)

**Files:**
- Create: `server/src/platform/controllers/platformTenantsController.js`
- Create: `server/src/platform/controllers/platformDomainsController.js`
- Create: `server/src/platform/controllers/platformSystemController.js`
- Create: `server/src/platform/controllers/platformStaffController.js`
- Create: `server/src/platform/routes/index.js`
- Modify: `server/src/app.js`
- Create: `server/test/platformApi.test.js`

**Interfaces:**
- Consumes: Platform services (Task 4, 5, 6, 7), `requireStaff('platform')`, `requireStaffPermission`.
- Produces: REST API mounted at `/api/platform` in multi mode (returns 404 in single mode).

- [ ] **Step 1: Write the failing tests** in `server/test/platformApi.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { createPlatformRouter } from '../src/platform/routes/index.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import { signStaffAccess } from '../src/services/staffSession.js';
import { runPlatformBootstrap } from '../src/platform/bootstrap.js';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9a_t8';

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

test('GET /api/platform/system/scope-gates returns N6 gate telemetry', async () => {
  const staff = await StaffAccount.create({ email: 'api@example.com', username: 'apiuser', password: 'pwd', status: 'active' });
  const role = await Role.findOne({ name: 'platform_owner' });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'platform', scopeId: null });

  const token = signStaffAccess(staff, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });

  const app = express();
  app.use(express.json());
  app.use('/api/platform', createPlatformRouter());

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/platform/system/scope-gates`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.staging);
    assert.ok(body.production);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Implement controllers and router**:
Create `server/src/platform/controllers/platformTenantsController.js`, `platformDomainsController.js`, `platformSystemController.js`, `platformStaffController.js`, and `server/src/platform/routes/index.js` mounting:
- `GET /api/platform/tenants`: list tenants
- `POST /api/platform/tenants`: provision tenant (calls `provisionTenant`)
- `GET /api/platform/tenants/:id`: tenant detail + checklist
- `PATCH /api/platform/tenants/:id/status`: change status (calls `transitionTenantStatus`)
- `POST /api/platform/tenants/:id/write-grants`: issue K23 write grant
- `POST /api/platform/tenants/:id/domains/:domainId/verify-dns`: trigger DNS TXT verification
- `GET /api/platform/system/scope-gates`: N6 telemetry

- [ ] **Step 3: Update `server/src/app.js`**:
In `server/src/app.js`, mount `/api/platform`:
```javascript
import { createPlatformRouter } from './platform/routes/index.js';
import { getTenancyMode } from './config/tenancy.js';

if (getTenancyMode() === 'multi') {
  app.use('/api/platform', createPlatformRouter());
} else {
  app.use('/api/platform', (req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'Platform API is only available in multi-tenant mode' }));
}
```

- [ ] **Step 4: Run the test**:
```bash
node --test --test-timeout=60000 server/test/platformApi.test.js
```

- [ ] **Step 5: Commit**:
```bash
git add server/src/platform/controllers/ server/src/platform/routes/ server/src/app.js server/test/platformApi.test.js
git commit -m "feat(platform): Platform Owner REST API controllers and routing"
```

---

### Task 9: Console App Shell, Vite Setup & Authentication Flow (Repository: core)

**Files:**
- Create: `console/package.json`
- Create: `console/vite.config.js`
- Create: `console/index.html`
- Create: `console/src/main.jsx`
- Create: `console/src/App.jsx`
- Create: `console/src/api/client.js`
- Create: `console/src/store/authStore.js`
- Create: `console/src/components/layout/Layout.jsx`
- Create: `console/src/components/layout/Sidebar.jsx`
- Create: `console/src/components/layout/Header.jsx`
- Create: `console/src/pages/Login.jsx`
- Create: `console/src/pages/Setup2fa.jsx`
- Modify: `package.json`
- Create: `console/test/authStore.test.js`

**Interfaces:**
- Consumes: Staff auth endpoints `/api/staff/auth/login`, `/refresh`, `/me`, `/2fa/setup`, `/2fa/verify`.
- Produces: Standalone Vite SPA shell with mandatory 2FA enrollment and authenticated routing.

- [ ] **Step 1: Write the failing tests** in `console/test/authStore.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { usePlatformAuthStore } from '../src/store/authStore.js';

test('authStore initial state is unauthenticated', () => {
  const state = usePlatformAuthStore.getState();
  assert.equal(state.isAuthenticated, false);
  assert.equal(state.requires2fa, false);
  assert.equal(state.requires2faSetup, false);
});

test('authStore handleLoginResponse transitions to requires2faSetup when multi-mode setupToken received', () => {
  usePlatformAuthStore.getState().handleLoginResponse({
    requires2faSetup: true,
    setupToken: 'sample-setup-token',
  });

  const state = usePlatformAuthStore.getState();
  assert.equal(state.requires2faSetup, true);
  assert.equal(state.setupToken, 'sample-setup-token');
});
```

- [ ] **Step 2: Implement console Vite package and store**:
- `console/package.json`: scripts `dev`, `build`, `preview`, dependencies `react`, `react-dom`, `react-router-dom`, `zustand`, `axios`, devDependencies `vite`, `@vitejs/plugin-react`, `tailwindcss`.
- `console/vite.config.js`: defines `@client` alias pointing to `../client/src` for shared UI if needed.
- `console/src/store/authStore.js`: Zustand store managing access token, staff info, and 2FA setup state.
- `console/src/pages/Login.jsx` and `Setup2fa.jsx`: login form and TOTP QR verification.
- Root `package.json`: add scripts `"dev:console": "npm run dev --prefix console"`, `"build:console": "npm install --prefix console && npm run build --prefix console"`.

- [ ] **Step 3: Run the test**:
```bash
node --test --test-timeout=60000 console/test/authStore.test.js
```

- [ ] **Step 4: Commit**:
```bash
git add console/ package.json
git commit -m "feat(console): Platform console Vite app shell and authentication with 2FA"
```

---

### Task 10: Console UI Pages: Tenants, Provisioning Wizard, Checklist & Gates (Repository: core)

**Files:**
- Create: `console/src/pages/Dashboard.jsx`
- Create: `console/src/pages/TenantsList.jsx`
- Create: `console/src/pages/TenantDetail.jsx`
- Create: `console/src/pages/TenantProvision.jsx`
- Create: `console/src/pages/GoLiveChecklist.jsx`
- Create: `console/src/pages/DomainsList.jsx`
- Create: `console/src/pages/AuditLogs.jsx`
- Create: `console/src/components/WriteGrantModal.jsx`
- Create: `console/test/consolePages.test.js`

**Interfaces:**
- Consumes: Platform REST API (Task 8).
- Produces: Interactive views for tenant provisioning, go-live checklist verification, domain management, K23 write-grant requests, and N6 scope gates monitoring.

- [ ] **Step 1: Write the failing tests** in `console/test/consolePages.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Dashboard from '../src/pages/Dashboard.jsx';
import * as TenantProvision from '../src/pages/TenantProvision.jsx';
import * as GoLiveChecklist from '../src/pages/GoLiveChecklist.jsx';

test('Console pages export valid React component views', () => {
  assert.equal(typeof Dashboard.default, 'function');
  assert.equal(typeof TenantProvision.default, 'function');
  assert.equal(typeof GoLiveChecklist.default, 'function');
});
```

- [ ] **Step 2: Implement console pages**:
- `Dashboard.jsx`: tenant count cards by status, N6 scope gates status widget showing clean days elapsed, system alerts.
- `TenantsList.jsx`: searchable directory of operators, status badge (`provisioning`, `active`, `suspended`, `closed`).
- `TenantProvision.jsx`: form collecting key, name, legal entity, domain, initial admin email.
- `GoLiveChecklist.jsx`: 6-point checklist with status icons and "Activate Tenant" button.
- `WriteGrantModal.jsx`: modal to request a K23 time-limited audited write grant with reason and duration.

- [ ] **Step 3: Run the test**:
```bash
node --test --test-timeout=60000 console/test/consolePages.test.js
```

- [ ] **Step 4: Commit**:
```bash
git add console/src/pages/ console/src/components/WriteGrantModal.jsx console/test/consolePages.test.js
git commit -m "feat(console): Platform console management pages, provisioning wizard, and go-live checklist"
```

---

### Task 11: End-to-End Acceptance Test Suite (N1-N6) & CHANGELOG (Repository: core)

**Files:**
- Create: `server/test/platformConsoleAcceptance.test.js`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: All components from Tasks 1 through 10.
- Produces: Complete automated acceptance verification for work package İP-9a and updated changelog documentation.

- [ ] **Step 1: Write the end-to-end acceptance suite** in `server/test/platformConsoleAcceptance.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { runPlatformBootstrap } from '../src/platform/bootstrap.js';
import { bootstrapFirstPlatformOwner } from '../../scripts/platform-bootstrap.mjs';
import { provisionTenant } from '../src/platform/services/provisioningService.js';
import { evaluateGoLiveChecklist } from '../src/platform/services/goLiveChecklist.js';
import { transitionTenantStatus } from '../src/platform/services/tenantLifecycle.js';
import { createPlatformRouter } from '../src/platform/routes/index.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Domain from '../src/models/Domain.js';
import Tenant from '../src/models/Tenant.js';
import { signStaffAccess } from '../src/services/staffSession.js';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9a_acceptance';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('İP-9a End-to-End Acceptance: N1 -> N2 -> N4 -> N5 -> K23 -> K24 -> N6', async () => {
  // N1: Platform Bootstrap
  const bootResult = await runPlatformBootstrap({ env: { TENANCY_MODE: 'multi', TENANCY_ENFORCEMENT: 'enforce' } });
  assert.equal(bootResult.success, true);
  assert.equal(await Tenant.countDocuments(), 0, 'N1: Zero default tenant');

  // N2: First Platform Owner
  const ownerResult = await bootstrapFirstPlatformOwner({ ownerEmail: 'root@example.com' });
  assert.equal(ownerResult.created, true);
  const staff = await StaffAccount.findOne({ email: 'root@example.com' });
  assert.equal(staff.twoFactor.enabled, false, 'N2: 2FA required on first login');

  // N4: Provision Tenant
  const provResult = await provisionTenant({
    key: 'operator2',
    name: 'Operator Two',
    legalEntity: { name: 'Op2 Ltd', registrationNo: 'OP-22', address: 'Malta' },
    domain: 'op2.example.com',
    ownerEmail: 'owner@op2.example.com',
  }, { createdByStaffId: staff._id });
  assert.equal(provResult.success, true);
  assert.equal(provResult.status, 'provisioning');

  // N5: Checklist & Go-Live
  const initialCheck = await evaluateGoLiveChecklist(provResult.tenantId);
  assert.equal(initialCheck.allPassed, false);

  // Complete checklist prerequisites
  await Domain.updateOne({ host: 'op2.example.com' }, { verifiedAt: new Date(), 'tls.status': 'active' });
  await Tenant.updateOne({ _id: provResult.tenantId }, {
    'providerApproval.approved': true,
    'providerApproval.documentRef': 'DOC-123',
    'checklist.pspVerified': true,
    'checklist.kycVerified': true,
    'checklist.emailVerified': true,
  });

  const passedCheck = await evaluateGoLiveChecklist(provResult.tenantId);
  assert.equal(passedCheck.allPassed, true);

  // Activate tenant
  const activated = await transitionTenantStatus(provResult.tenantId, 'active', { actorStaffId: staff._id });
  assert.equal(activated.status, 'active');

  // Suspend tenant
  const suspended = await transitionTenantStatus(provResult.tenantId, 'suspended', { actorStaffId: staff._id });
  assert.equal(suspended.status, 'suspended');

  // Close tenant with retention lock (K26)
  const closed = await transitionTenantStatus(provResult.tenantId, 'closed', { actorStaffId: staff._id, reason: 'Offboarding' });
  assert.equal(closed.status, 'closed');
  assert.ok(closed.retentionLockUntil instanceof Date);
});
```

- [ ] **Step 2: Update `CHANGELOG.md`** under `[Yayınlanmadı]`:
Add entry for İP-9a covering:
- N1 multi-mode bootstrap migration `platform-001-bootstrap`
- N2 first Platform Owner CLI `scripts/platform-bootstrap.mjs`
- Standalone platform console `console/`
- N4 tenant provisioning pipeline and subset seeder
- N5 go-live checklist and status lifecycle transitions
- K23 time-limited audited write exceptions
- K24 5-year audit retention
- N6 zero-error scope telemetry gates

- [ ] **Step 3: Run acceptance tests**:
```bash
node --test --test-timeout=60000 server/test/platformConsoleAcceptance.test.js
```

- [ ] **Step 4: Commit**:
```bash
git add server/test/platformConsoleAcceptance.test.js CHANGELOG.md
git commit -m "test(platform): İP-9a end-to-end acceptance suite and changelog update"
```
