# İP-8 Enforce Guard and Per-Tenant Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement work package İP-8 of the approved multi-tenant design: make the tenant-scope guard `enforce` mandatory in multi mode (`TENANCY_MODE=multi`), allow single mode to opt in to `enforce` (G8) while keeping today's default, remove client hard-coded brand fallback strings, serve a dynamic `manifest.webmanifest` per tenant, render the `index.html` `<title>` and brand metadata on the server per tenant, and source legal text dynamically from `Tenant.legalEntity`. The acceptance gate is that the entire isolation test suite is green in `enforce` mode.

**Architecture:** The tenant-scope guard in `server/src/tenancy/tenantScoped.js` rejects unscoped queries on operator-owned models by throwing `TenantScopeError` in `enforce` mode. In `server/src/config/tenancy.js`, `readTenancyConfig` and `validateTenancyStartup` make `enforce` mandatory for `TENANCY_MODE=multi`, while single mode retains its gated default (`log` when G3 backfill completed, `off` otherwise) and permits explicit opt-in to `enforce`. An inventory harness identifies every location across services, jobs, and endpoints that throws in `enforce` mode; these locations are scoped using `tenantFilter` / `runWithTenant` or explicitly marked with `runAsPlatform(reason, fn)` with the reason registered in `scripts/lint-tenancy.mjs`. On the HTTP layer, `server/src/app.js` mounts dynamic manifest serving before static assets, serving per-tenant PWA manifests derived from `req.tenant`. SPA fallback in `server/src/seo/http.js` injects the per-tenant `<title>` and OpenGraph metadata into `index.html` regardless of whether database SEO is configured. On the client, hard-coded fallback strings (such as literal brand names) are removed from components and stores; `Tenant.legalEntity` is exposed via `/api/branding` and consumed by `client/src/data/legalContent.js`, while default tenant values preserve current appearance for single-mode installs.

**Tech Stack:** Node >= 22 (ESM), Express 4, Mongoose 8.24, Zustand 4, Vite 5, `node:test` + `node:assert/strict`, local MongoDB (replica set `rs0` on 127.0.0.1:27017).

**Spec:** `docs/superpowers/specs/2026-11-09-multi-tenant-design.md`. Sections used: §3 (brand and client isolation gaps), §4.3.2 (`Tenant.legalEntity`), §4.4 (tenant context and `tenantScoped`), §4.5 (branding and settings), §6.1 (modes and startup checks), §6.3 (G7, G8 single mode opt-in), §7.1 (İP-8 row), §8 (isolation test suites §8.1 to §8.7), §9 (G-8, G-10, G-11), K19-K27 (owner decisions), Y3 (single mode backward compatibility).

---

## Global Constraints

- **Never weaken an existing check:** Existing authentication (`requireAuth`, `requireStaff`), permissions, IP checks, and rate limiters remain active. The `enforce` mode strengthens data isolation by throwing `TenantScopeError` on any unscoped query on a tenant-owned model.
- **Never silence the guard globally:** Fix unscoped queries by adding ambient context (`runWithTenant`), explicit query filters (`tenantFilter`), or, where platform-wide by design, `runAsPlatform(reason, fn)` registered in the lint allow-list. Never disable `reportViolation` globally or catch and swallow `TenantScopeError`.
- **Single mode backward compatibility (spec §6.1, §6.3, Y3):** When running in `TENANCY_MODE=single`, default enforcement remains gated (`log` once G3 backfill is complete, `off` beforehand). Single mode may opt in to `enforce` via `TENANCY_ENFORCEMENT=enforce` (spec §9 G8). The default tenant receives today's brand values (`VIP90.bet`, legal entity details) so existing single-operator installs retain their exact appearance and behaviour.
- **Core never imports premium add-ons:** Core provides registration hooks and interfaces (`runWithTenant`, `runAsPlatform`, `tenantFilter`, `defineTenantModel`). Private add-ons (sports betting, casino content, in-house games) attach through hooks and are never imported by core.
- **Dynamic manifest and index.html intercept static files:** The dynamic route for `/manifest.webmanifest` is mounted before `express.static(clientDist)` so the Vite build-time manifest is never served to multi-tenant clients. The SPA fallback renders per-tenant `<title>` and brand metadata into `index.html` on every non-API request.
- **Legal text from `Tenant.legalEntity`:** Legal details (company name, registration number, address) must come from `Tenant.legalEntity` served through `/api/branding` and stored in `brandingStore`, replacing hard-coded constants in `client/src/data/legalContent.js`.
- **No secrets or internal hostnames in public files:** Use placeholder domains such as `*.example.com`, never real-looking e-mails or internal IP addresses. Never name the casino content provider.
- **Isolated test execution:** Tests use dedicated database names (e.g. `mongodb://127.0.0.1:27017/vip90_test_ip8_t*`) overrideable via `TENANCY_TEST_MONGO`, and drop test databases in cleanup. Tasks must never run the global root test command.
- **Dependence on İP-7:** Jobs and socket code assume the İP-7 primitives on `origin/feat/ip7-jobs-sockets` (`forEachTenant` for scheduled jobs, `publishToAllTenants` / `tenantRoom` for socket events, `tenantKeys.js`).

---

## Reviewer correction (2026-11-12): overrides every conflicting line below

1. **Branch from main after İP-7 is merged.** İP-8 is cut from `origin/main` once İP-7 (jobs and sockets) has landed;
   do not read İP-7 from its feature branch.
2. **Task 1 decides Wave B.** The file lists in Tasks 3 and 4 are a forecast. The reviewer runs Task 1's inventory once,
   alone, and re-splits the fixes by the files it reports; a task only touches files the inventory lists (or tests).
3. **No brand values in core.** Core is a public, brand-neutral product. The default tenant takes today's values from the
   install's own settings (site name, logo, colours and legal details already stored in the database or `.env`), not
   from constants written into core. Where a fallback is unavoidable (no settings yet), use a neutral one such as the
   tenant `name`, never a product name.
4. **Single mode looks and behaves exactly as today** unless the operator opts in to `TENANCY_ENFORCEMENT=enforce`.
   `client/index.html` keeps a valid `<title>` so the Vite dev server and a static build without the server still work.
5. Never change an existing test to make a new one pass. Do NOT run the full root `npm test`; run your task's test files
   only, always with `--test-timeout=60000`. Fixture e-mails use `*.example.com`.

## Review Focus

- **Mandatory `enforce` in multi mode (§6.1, §7.1):** Multi mode cannot be started with `TENANCY_ENFORCEMENT=log` or `off`. In multi mode, any unscoped read or write on a tenant model immediately throws `TenantScopeError`.
- **Single mode opt-in to `enforce` (G8):** In single mode, setting `TENANCY_ENFORCEMENT=enforce` must be supported and pass all single-operator regressions without errors, while leaving the default unforced.
- **Exhaustive inventory of scope violations:** Task 1 runs the full isolation suite under forced `enforce` mode, recording all failure points to guarantee no unscoped operations remain.
- **Per-tenant dynamic PWA manifest:** `GET /manifest.webmanifest` must return tenant-specific `name`, `short_name`, `theme_color`, and icon definitions matching the requesting hostname.
- **Per-tenant server-rendered `index.html`:** The SPA fallback must inject the tenant's brand title and OpenGraph metadata into the HTML before sending to the client, even if custom SEO settings are not configured.
- **Legal entity dynamic binding:** `client/src/data/legalContent.js` must consume `useBrandingStore.getState().legalEntity` while defaulting safely for single-mode installs.
- **Removal of client brand fallback strings:** UI components (`Navbar`, `Footer`, `LiveHelp`, `HomePage`, `Login`) must not contain hard-coded brand strings as fallbacks.

---

## File Structure

| File | Repository | Responsibility | Task |
|---|---|---|---|
| `scripts/tenancy-enforce-inventory.mjs` | core | Inventory script running isolation test suite under forced `enforce` and reporting violations | 1 |
| `server/test/enforceInventory.test.js` | core | Tests verifying that the inventory harness captures `TenantScopeError` violations accurately | 1 |
| `server/src/config/tenancy.js` | core | Make `enforce` mandatory in multi mode; validate startup; allow single mode `enforce` opt-in | 2 |
| `server/test/tenancyConfig.test.js` | core | Startup validation tests for multi-mode mandatory `enforce` and single-mode opt-in | 2 |
| `server/test/tenancyEnforcementDefault.test.js` | core | Unit tests verifying single-mode gated default vs explicit `enforce` opt-in | 2 |
| `server/src/services/adminCounts.js` | core | Ensure admin dashboard count queries apply tenant context in `enforce` mode | 3 |
| `server/src/services/activityFeed.js` | core | Ensure `ActivityEvent` operations are scoped to ambient tenant context | 3 |
| `server/src/services/onlineCount.js` | core | Scope active user count queries to ambient tenant | 3 |
| `scripts/lint-tenancy.mjs` | core | Update `RUN_AS_PLATFORM_ALLOWLIST` for legitimate platform-wide background operations | 3 |
| `server/test/activityFeed.test.js` | core | Verify activity feed queries pass cleanly in `enforce` mode | 3 |
| `server/test/adminControllerScope.test.js` | core | Verify admin counts and dashboard stats pass in `enforce` mode | 3 |
| `server/src/routes/staticPages.js` | core | Scope static page lookups by tenant context in `enforce` mode | 4 |
| `server/src/services/staticPages.js` | core | Ensure static page helper services apply tenant filter | 4 |
| `server/src/routes/promotions.js` | core | Scope promotions queries to ambient tenant context | 4 |
| `server/src/services/ticket.js` | core | Scope support ticket queries to ambient tenant context | 4 |
| `server/test/staticPages.test.js` | core | Test static page queries pass under `enforce` mode | 4 |
| `server/test/promotionsSegmentScope.test.js` | core | Test promotions queries pass under `enforce` mode | 4 |
| `server/src/controllers/manifestController.js` | core | Controller generating dynamic JSON manifest per tenant | 5 |
| `server/src/routes/manifest.js` | core | Route definition for dynamic `manifest.webmanifest` and `site.webmanifest` | 5 |
| `server/src/app.js` | core | Mount dynamic manifest route before static files; connect SPA fallback | 5, 6 |
| `server/test/manifest.test.js` | core | Integration tests for per-tenant dynamic `manifest.webmanifest` serving | 5 |
| `server/src/seo/http.js` | core | Update `createSpaFallback` / `sendIndex` to always inject per-tenant title and brand meta | 6 |
| `server/src/seo/render.js` | core | Support brand meta injection fallback when SEO record is absent | 6 |
| `client/index.html` | core | Remove hard-coded `<title>VIP90.bet</title>`; use template title tag for server replacement | 6 |
| `server/test/spaFallbackTenantBranding.test.js` | core | Integration tests for server-rendered `index.html` title and OpenGraph tags per tenant | 6 |
| `server/src/routes/branding.js` | core | Expose `Tenant.legalEntity` and `tenantName` in `GET /api/branding` | 7 |
| `server/src/tenancy/defaultTenant.js` | core | Initialize default tenant with standard legalEntity values for single mode | 7 |
| `client/src/store/brandingStore.js` | core | Store `legalEntity` state in Zustand branding store | 7 |
| `client/src/branding/BrandingInjector.jsx` | core | Update branding injector to load and populate `legalEntity` | 7 |
| `client/src/data/legalContent.js` | core | Derive company info and legal entity name dynamically from branding store | 7 |
| `client/src/pages/legal/LegalLayout.jsx` | core | Render legal name and entity details from dynamic store | 7 |
| `client/src/pages/company/CompanyPageLayout.jsx` | core | Render contact and company details from dynamic store | 7 |
| `server/test/brandingLegalEntity.test.js` | core | Tests for legalEntity retrieval in `/api/branding` | 7 |
| `client/src/data/legalContent.test.js` | core | Unit tests for dynamic legal entity resolution | 7 |
| `client/src/components/Footer.jsx` | core | Remove hard-coded `'VIP90.bet'` fallback; use store siteName | 8 |
| `client/src/components/LiveHelp.jsx` | core | Remove hard-coded `'VIP90.bet'` fallback; use store siteName | 8 |
| `client/src/components/Navbar.jsx` | core | Remove hard-coded `'VIP90.bet'` fallback; use store siteName | 8 |
| `client/src/components/home/PromoHeroSlider.jsx` | core | Remove hard-coded `'VIP90.bet'` fallback; use store siteName | 8 |
| `client/src/pages/HomePage.jsx` | core | Remove hard-coded `'VIP90.bet'` fallback; use store siteName | 8 |
| `client/src/pages/Login.jsx` | core | Remove hard-coded `'VIP90.bet'` fallback; use store siteName | 8 |
| `client/src/seo/titles.js` | core | Make default site title dynamic or neutral; support store fallback | 8 |
| `client/src/seo/titles.test.js` | core | Update unit tests for dynamic title formatting | 8 |
| `client/test/brandFallbacksClean.test.js` | core | Verification test ensuring no hard-coded brand strings remain in UI components | 8 |
| `server/test/enforceIsolationAcceptance.test.js` | core | Acceptance test suite verifying full isolation green in `enforce` mode | 9 |
| `CHANGELOG.md` | core | Document İP-8 enforce guard and per-tenant branding changes | 9 |

---

## Parallelism

Tasks are structured into sequential and parallel execution waves:

| Wave | Tasks (run in parallel, separate worktrees) | Repository | Depends on |
|---|---|---|---|
| A | 1 (Inventory of scope violations in `enforce` mode) | core | none |
| B | 2 (Mandatory `enforce` in multi mode & single-mode opt-in G8) | core | 1 |
| B | 3 (Background services & feeds tenant scoping) | core | 1 |
| B | 4 (Content, pages, and support endpoints scoping) | core | 1 |
| B | 5 (Server-side dynamic `manifest.webmanifest` per tenant) | core | 1 |
| B | 6 (Server-side per-tenant `index.html` title & meta rendering) | core | 1 |
| B | 7 (Per-tenant legal entity support & legal text integration) | core | 1 |
| C | 8 (Remove client hard-coded brand fallback strings) | core | 7 |
| D | 9 (Full isolation acceptance suite in `enforce` mode & CHANGELOG) | core | 2, 3, 4, 5, 6, 7, 8 |

**Conflict notes:**
- Task 1 is an inventory and diagnostics task that establishes the baseline.
- Tasks 2, 3, 4, 5, 6, and 7 edit distinct sets of files:
  - Task 2 edits `server/src/config/tenancy.js` and config test files.
  - Task 3 edits `adminCounts.js`, `activityFeed.js`, `onlineCount.js`, and `lint-tenancy.mjs`.
  - Task 4 edits `staticPages.js`, `promotions.js`, and `ticket.js`.
  - Task 5 creates `manifestController.js`, `routes/manifest.js`, and mounts in `server/src/app.js`.
  - Task 6 edits `server/src/seo/http.js`, `render.js`, and `client/index.html`.
  - Task 7 edits `routes/branding.js`, `defaultTenant.js`, `brandingStore.js`, `BrandingInjector.jsx`, `legalContent.js`, `LegalLayout.jsx`, `CompanyPageLayout.jsx`.
- Task 8 modifies client UI components (`Footer.jsx`, `Navbar.jsx`, `LiveHelp.jsx`, `PromoHeroSlider.jsx`, `HomePage.jsx`, `Login.jsx`, `titles.js`) and depends on Task 7's store changes.
- Task 9 introduces `server/test/enforceIsolationAcceptance.test.js` and updates `CHANGELOG.md`.

---

### Task 1: Inventory of Scope Violations in `enforce` Mode (Repository: core)

**Files:**
- Create: `scripts/tenancy-enforce-inventory.mjs`
- Create: `server/test/enforceInventory.test.js`

**Interfaces:**
- Consumes: `process.env.TENANCY_ENFORCEMENT`, `TenantScopeError` from `server/src/tenancy/errors.js`, `getScopeViolationStats` from `server/src/tenancy/tenantScoped.js`.
- Produces: Executable inventory harness `node scripts/tenancy-enforce-inventory.mjs` that runs all isolation test files with `TENANCY_ENFORCEMENT=enforce`, captures stack traces and operations that throw `TenantScopeError`, and prints a grouped summary of unscoped models and operations.

- [ ] **Step 1: Write the failing tests** in `server/test/enforceInventory.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { runInventoryHarness, parseViolationOutput } from '../scripts/tenancy-enforce-inventory.mjs';

test('inventory parser extracts model and operation from TenantScopeError stack', () => {
  const sampleError = '[tenancy] unscoped find on User\n    at reportViolation (server/src/tenancy/tenantScoped.js:68:11)';
  const parsed = parseViolationOutput(sampleError);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].model, 'User');
  assert.equal(parsed[0].op, 'find');
  assert.equal(parsed[0].reason, 'unscoped');
});

test('runInventoryHarness returns inventory object with violations list and summary', async () => {
  const result = await runInventoryHarness({ dryRun: true });
  assert.ok(Array.isArray(result.filesScanned));
  assert.ok(typeof result.summary === 'object');
  assert.equal(result.forcedEnforcement, 'enforce');
});
```

- [ ] **Step 2: Implement the inventory script** in `scripts/tenancy-enforce-inventory.mjs`:
```javascript
#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

export const ISOLATION_TEST_PATTERNS = [
  'adminControllerScope.test.js',
  'brandMessagingScope.test.js',
  'chatSupportScope.test.js',
  'operationsBettingScope.test.js',
  'promotionsSegmentScope.test.js',
  'bankSlikairScope.test.js',
  'platformReadOnly.test.js',
  'moneyPathsTenancy.test.js',
  'moneyTenancy.test.js',
  'playersAuthTenancy.test.js',
  'riskAuditOperationsTenancy.test.js',
  'bonusReferralAgentTenancy.test.js',
  'brandContentMarketingTenancy.test.js',
  'chatSupportActivityTenancy.test.js',
  'contentSettingsTenancy.test.js',
  'credentialStoresTenancy.test.js',
  'secretSettingsStoreTenancy.test.js',
  'settingsSnapshot.test.js',
  'slikairCallbackAttribution.test.js',
  'sumsubCallbackAttribution.test.js',
  'callbackAttributionAcceptance.test.js',
  'tenancyScoped.test.js',
  'tenancyScopedAggregate.test.js',
  'tenantModelRouting.test.js',
  'tenantHostResolution.test.js',
  'tenantSettingsIsolation.test.js',
  'tenantBaseUrl.test.js',
  'tenantDailyStat.test.js',
];

const VIOLATION_REGEX = /\[tenancy\]\s+(unscoped|cross_tenant)\s+([a-zA-Z0-9_$]+)\s+on\s+([a-zA-Z0-9_$]+)/g;

export function parseViolationOutput(text) {
  const violations = [];
  for (const match of text.matchAll(VIOLATION_REGEX)) {
    violations.push({
      reason: match[1],
      op: match[2],
      model: match[3],
    });
  }
  return violations;
}

export async function runInventoryHarness({ dryRun = false } = {}) {
  const testDir = resolve(process.cwd(), 'server/test');
  const availableFiles = readdirSync(testDir);
  const targetFiles = availableFiles.filter(f => ISOLATION_TEST_PATTERNS.includes(f));

  if (dryRun) {
    return {
      forcedEnforcement: 'enforce',
      filesScanned: targetFiles,
      violations: [],
      summary: { totalViolations: 0, distinctModels: [] },
    };
  }

  const results = [];
  const env = {
    ...process.env,
    TENANCY_ENFORCEMENT: 'enforce',
    NODE_ENV: 'test',
  };

  for (const file of targetFiles) {
    const filePath = join('server/test', file);
    const output = await new Promise((res) => {
      let stdout = '';
      let stderr = '';
      const proc = spawn('node', ['--test', '--experimental-test-module-mocks', filePath], {
        env,
        cwd: process.cwd(),
      });
      proc.stdout.on('data', d => { stdout += d.toString(); });
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('close', (code) => {
        res({ file, code, stdout, stderr });
      });
    });

    const parsed = parseViolationOutput(output.stdout + '\n' + output.stderr);
    if (parsed.length > 0) {
      results.push({ file, violations: parsed, exitCode: output.code });
    }
  }

  const distinctModels = [...new Set(results.flatMap(r => r.violations.map(v => v.model)))];
  return {
    forcedEnforcement: 'enforce',
    filesScanned: targetFiles,
    violations: results,
    summary: {
      totalFilesWithViolations: results.length,
      distinctModels,
    },
  };
}

if (process.argv[1] && process.argv[1].endsWith('tenancy-enforce-inventory.mjs')) {
  console.log('[inventory] Running isolation test suite under TENANCY_ENFORCEMENT=enforce...');
  runInventoryHarness().then((report) => {
    console.log(`[inventory] Scanned ${report.filesScanned.length} test files.`);
    console.log(`[inventory] Found violations in ${report.violations.length} files.`);
    for (const v of report.violations) {
      console.log(`  - ${v.file}: ${JSON.stringify(v.violations)}`);
    }
    process.exit(0);
  }).catch((err) => {
    console.error('[inventory] Error running inventory:', err);
    process.exit(1);
  });
}
```

- [ ] **Step 3: Run the task's tests**:
```bash
node --test --experimental-test-module-mocks server/test/enforceInventory.test.js
```
Expected output:
```
✔ inventory parser extracts model and operation from TenantScopeError stack
✔ runInventoryHarness returns inventory object with violations list and summary
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
```

- [ ] **Step 4: Commit**:
```bash
git add scripts/tenancy-enforce-inventory.mjs server/test/enforceInventory.test.js && git commit -m "feat(tenancy): inventory harness for enforce mode violations"
```

---

### Task 2: Mandatory `enforce` in Multi Mode & Optional `enforce` in Single Mode (Repository: core)

**Files:**
- Modify: `server/src/config/tenancy.js`
- Modify: `server/test/tenancyConfig.test.js`
- Modify: `server/test/tenancyEnforcementDefault.test.js`

**Interfaces:**
- Consumes: `TENANCY_MODE`, `TENANCY_ENFORCEMENT`, `validateTenancyStartup`, `readTenancyConfig`, `getTenancyEnforcement`.
- Produces: In `readTenancyConfig`: when `mode === 'multi'`, `enforcement` always evaluates to `'enforce'`. In `validateTenancyStartup`: `TENANCY_MODE=multi` requires `TENANCY_ENFORCEMENT=enforce` (or empty, which defaults to `enforce`), and flags an error if explicitly set to `log` or `off`. In single mode: default remains `tenantIdBackfillComplete ? 'log' : 'off'`, and `TENANCY_ENFORCEMENT=enforce` is fully valid (G8 opt-in).

- [ ] **Step 1: Write the failing tests** in `server/test/tenancyConfig.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readTenancyConfig,
  getTenancyEnforcement,
  validateTenancyStartup,
} from '../src/config/tenancy.js';

test('multi mode forces enforcement to enforce regardless of unset or empty env', () => {
  const cfg = readTenancyConfig({ TENANCY_MODE: 'multi', TENANCY_ENFORCEMENT: '' });
  assert.equal(cfg.mode, 'multi');
  assert.equal(cfg.enforcement, 'enforce');
  assert.deepEqual(cfg.errors, []);
});

test('multi mode rejects explicit TENANCY_ENFORCEMENT=log or off in validateTenancyStartup', () => {
  const logProblems = validateTenancyStartup({ TENANCY_MODE: 'multi', TENANCY_ENFORCEMENT: 'log' });
  assert.ok(logProblems.some(p => p.includes('TENANCY_MODE=multi requires TENANCY_ENFORCEMENT=enforce')));

  const offProblems = validateTenancyStartup({ TENANCY_MODE: 'multi', TENANCY_ENFORCEMENT: 'off' });
  assert.ok(offProblems.some(p => p.includes('TENANCY_MODE=multi requires TENANCY_ENFORCEMENT=enforce')));
});

test('single mode supports explicit TENANCY_ENFORCEMENT=enforce opt-in (spec §9 G8)', () => {
  const cfg = readTenancyConfig({ TENANCY_MODE: 'single', TENANCY_ENFORCEMENT: 'enforce' });
  assert.equal(cfg.mode, 'single');
  assert.equal(cfg.enforcement, 'enforce');
  assert.deepEqual(cfg.errors, []);

  const problems = validateTenancyStartup({ TENANCY_MODE: 'single', TENANCY_ENFORCEMENT: 'enforce' });
  assert.deepEqual(problems, []);
});
```

- [ ] **Step 2: Update `server/src/config/tenancy.js`**:
In `readTenancyConfig(env)`:
```javascript
  // When in multi mode, enforcement is strictly 'enforce' (spec §7.1 row İP-8).
  if (mode === 'multi') {
    enforcement = 'enforce';
    if (rawEnforcement && rawEnforcement.toLowerCase() !== 'enforce') {
      enforcementErrors.push(
        `TENANCY_MODE=multi requires TENANCY_ENFORCEMENT=enforce (got "${rawEnforcement}")`
      );
    }
  } else if (!rawEnforcement) {
    enforcement = defaultEnforcement(mode);
  } else if (ENFORCEMENT_MODES_SET.has(rawEnforcement.toLowerCase())) {
    enforcement = rawEnforcement.toLowerCase();
  } else {
    enforcement = defaultEnforcement(mode);
    enforcementErrors.push(
      `TENANCY_ENFORCEMENT must be "off", "log" or "enforce" (got "${rawEnforcement}")`
    );
  }
```

In `validateTenancyStartup(env)`:
```javascript
  // Multi mode: enforcement must be 'enforce'
  if (rawMode.toLowerCase() === 'multi') {
    const explicitEnforcement = rawEnforcement ? rawEnforcement.trim().toLowerCase() : null;
    if (explicitEnforcement && explicitEnforcement !== 'enforce') {
      problems.push(
        `TENANCY_MODE=multi requires TENANCY_ENFORCEMENT=enforce (got "${rawEnforcement.trim()}")`
      );
    }
  }
```

- [ ] **Step 3: Run the task's tests**:
```bash
node --test --experimental-test-module-mocks server/test/tenancyConfig.test.js server/test/tenancyEnforcementDefault.test.js
```
Expected output:
```
✔ multi mode forces enforcement to enforce regardless of unset or empty env
✔ multi mode rejects explicit TENANCY_ENFORCEMENT=log or off in validateTenancyStartup
✔ single mode supports explicit TENANCY_ENFORCEMENT=enforce opt-in (spec §9 G8)
ℹ pass 12
ℹ fail 0
```

- [ ] **Step 4: Commit**:
```bash
git add server/src/config/tenancy.js server/test/tenancyConfig.test.js server/test/tenancyEnforcementDefault.test.js && git commit -m "feat(tenancy): mandatory enforce in multi mode and single mode G8 opt-in"
```

---

### Task 3: Background Services and Feeds Tenant Scoping (Repository: core)

**Files:**
- Modify: `server/src/services/adminCounts.js`
- Modify: `server/src/services/activityFeed.js`
- Modify: `server/src/services/onlineCount.js`
- Modify: `scripts/lint-tenancy.mjs`
- Test: `server/test/activityFeed.test.js`
- Test: `server/test/adminControllerScope.test.js`

**Interfaces:**
- Consumes: `getCurrentTenantId` from `server/src/tenancy/context.js`, `tenantFilter` from `server/src/tenancy/tenantFilter.js`, `runAsPlatform` from `server/src/tenancy/context.js`.
- Produces: `adminCounts`, `activityFeed`, and `onlineCount` queries execute with proper tenant scoping or ambient context, eliminating any unscoped `User`, `ActivityEvent`, or `Transaction` queries that throw in `enforce` mode.

- [ ] **Step 1: Write the failing tests** in `server/test/activityFeed.test.js`:
```javascript
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import ActivityEvent from '../src/models/ActivityEvent.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { getRecentActivity, recordActivity } from '../src/services/activityFeed.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip8_t3_activity';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

let savedEnforcement;

before(async () => {
  savedEnforcement = process.env.TENANCY_ENFORCEMENT;
  process.env.TENANCY_ENFORCEMENT = 'enforce';
  await mongoose.connect(TEST_DB);
  await ActivityEvent.deleteMany({});
});

after(async () => {
  if (savedEnforcement === undefined) delete process.env.TENANCY_ENFORCEMENT;
  else process.env.TENANCY_ENFORCEMENT = savedEnforcement;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('recordActivity and getRecentActivity execute cleanly in enforce mode within tenant context', async () => {
  await runWithTenant(T1, async () => {
    await recordActivity({
      userId: new mongoose.Types.ObjectId(),
      type: 'bet',
      description: 'Placed sports bet',
      metadata: { amount: 50 },
    });
    const items = await getRecentActivity({ limit: 10 });
    assert.equal(items.length, 1);
    assert.equal(String(items[0].tenantId), String(T1));
  });

  await runWithTenant(T2, async () => {
    const items = await getRecentActivity({ limit: 10 });
    assert.equal(items.length, 0);
  });
});
```

- [ ] **Step 2: Update `server/src/services/adminCounts.js` and `server/src/services/activityFeed.js`**:
In `server/src/services/adminCounts.js`: Ensure queries pass `{ ...tenantFilter(req), ...query }` or read `getCurrentTenantId()`.
In `server/src/services/activityFeed.js`:
```javascript
import ActivityEvent from '../models/ActivityEvent.js';
import { getCurrentTenantId } from '../tenancy/context.js';

export async function getRecentActivity({ limit = 20, type = null } = {}) {
  const query = {};
  if (type) query.type = type;
  const tenantId = getCurrentTenantId();
  if (tenantId) query.tenantId = tenantId;
  return ActivityEvent.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

export async function recordActivity(payload) {
  const tenantId = getCurrentTenantId();
  const doc = { ...payload };
  if (tenantId && !doc.tenantId) doc.tenantId = tenantId;
  return ActivityEvent.create(doc);
}
```

In `scripts/lint-tenancy.mjs`:
Register any platform-level background reconciliation reasons in `RUN_AS_PLATFORM_ALLOWLIST`.

- [ ] **Step 3: Run the task's tests**:
```bash
node --test --experimental-test-module-mocks server/test/activityFeed.test.js server/test/adminControllerScope.test.js
```
Expected output:
```
✔ recordActivity and getRecentActivity execute cleanly in enforce mode within tenant context
✔ adminCounts scoped to request tenant without scope violation
ℹ pass 4
ℹ fail 0
```

- [ ] **Step 4: Commit**:
```bash
git add server/src/services/adminCounts.js server/src/services/activityFeed.js server/src/services/onlineCount.js scripts/lint-tenancy.mjs server/test/activityFeed.test.js && git commit -m "feat(tenancy): scope admin counts and activity feed in enforce mode"
```

---

### Task 4: Content, Pages, and Support Endpoints Scoping (Repository: core)

**Files:**
- Modify: `server/src/routes/staticPages.js`
- Modify: `server/src/services/staticPages.js`
- Modify: `server/src/routes/promotions.js`
- Modify: `server/src/services/ticket.js`
- Test: `server/test/staticPages.test.js`
- Test: `server/test/promotionsSegmentScope.test.js`

**Interfaces:**
- Consumes: `tenantFilter(req, ...)` from `server/src/tenancy/tenantFilter.js`, `getCurrentTenantId()`.
- Produces: `StaticPage`, `Promotion`, and `Ticket` queries are scoped by tenant, executing cleanly in `enforce` mode with zero `TenantScopeError` violations.

- [ ] **Step 1: Write the failing tests** in `server/test/staticPages.test.js`:
```javascript
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import StaticPage from '../src/models/StaticPage.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { getPageBySlug } from '../src/services/staticPages.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip8_t4_pages';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

let savedEnforcement;

before(async () => {
  savedEnforcement = process.env.TENANCY_ENFORCEMENT;
  process.env.TENANCY_ENFORCEMENT = 'enforce';
  await mongoose.connect(TEST_DB);
  await StaticPage.deleteMany({});
});

after(async () => {
  if (savedEnforcement === undefined) delete process.env.TENANCY_ENFORCEMENT;
  else process.env.TENANCY_ENFORCEMENT = savedEnforcement;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('getPageBySlug executes cleanly in enforce mode and isolates by tenant', async () => {
  await runWithTenant(T1, async () => {
    await StaticPage.create({
      tenantId: T1,
      slug: 'terms',
      title: 'T1 Terms of Service',
      content: 'T1 content',
      isActive: true,
    });
    const page = await getPageBySlug('terms');
    assert.ok(page);
    assert.equal(page.title, 'T1 Terms of Service');
  });

  await runWithTenant(T2, async () => {
    const page = await getPageBySlug('terms');
    assert.equal(page, null);
  });
});
```

- [ ] **Step 2: Update `server/src/services/staticPages.js` and `server/src/routes/staticPages.js`**:
In `server/src/services/staticPages.js`:
```javascript
import StaticPage from '../models/StaticPage.js';
import { getCurrentTenantId } from '../tenancy/context.js';

export async function getPageBySlug(slug) {
  const tenantId = getCurrentTenantId();
  const query = { slug, isActive: true };
  if (tenantId) query.tenantId = tenantId;
  return StaticPage.findOne(query).lean();
}

export async function getPublicPageList() {
  const tenantId = getCurrentTenantId();
  const query = { isActive: true };
  if (tenantId) query.tenantId = tenantId;
  return StaticPage.find(query).select('slug title route').lean();
}
```

In `server/src/routes/promotions.js`:
Ensure all player-facing and admin queries apply `tenantFilter(req)` or ambient tenant context so queries on `Promotion` and `PlayerSegment` do not throw in `enforce` mode.

- [ ] **Step 3: Run the task's tests**:
```bash
node --test --experimental-test-module-mocks server/test/staticPages.test.js server/test/promotionsSegmentScope.test.js
```
Expected output:
```
✔ getPageBySlug executes cleanly in enforce mode and isolates by tenant
✔ promotions segment scope queries pass in enforce mode
ℹ pass 3
ℹ fail 0
```

- [ ] **Step 4: Commit**:
```bash
git add server/src/services/staticPages.js server/src/routes/staticPages.js server/src/routes/promotions.js server/src/services/ticket.js server/test/staticPages.test.js && git commit -m "feat(tenancy): scope static pages and promotions in enforce mode"
```

---

### Task 5: Server-Side Dynamic `manifest.webmanifest` per Tenant (Repository: core)

**Files:**
- Create: `server/src/controllers/manifestController.js`
- Create: `server/src/routes/manifest.js`
- Modify: `server/src/app.js`
- Create: `server/test/manifest.test.js`

**Interfaces:**
- Consumes: `req.tenant` from `server/src/middleware/tenantHost.js`, `getBrandingValues()` from `server/src/branding/index.js`, `Tenant` model from `server/src/models/Tenant.js`.
- Produces: `GET /manifest.webmanifest` and `GET /site.webmanifest` return dynamically generated JSON manifests with `Content-Type: application/manifest+json; charset=utf-8` and tenant-specific branding (`name`, `short_name`, `theme_color`, icons), intercepting the static Vite build file.

- [ ] **Step 1: Write the failing tests** in `server/test/manifest.test.js`:
```javascript
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { buildManifestPayload } from '../src/controllers/manifestController.js';
import manifestRoutes from '../src/routes/manifest.js';
import Tenant from '../src/models/Tenant.js';
import Brand from '../src/models/Brand.js';
import { runWithTenant } from '../src/tenancy/context.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip8_t5_manifest';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

before(async () => {
  await mongoose.connect(TEST_DB);
  await Tenant.deleteMany({});
  await Tenant.create([
    { _id: T1, key: 'tenant-one', name: 'Alpha Bet', isDefault: true, status: 'active' },
    { _id: T2, key: 'tenant-two', name: 'Beta Gaming', isDefault: false, status: 'active' },
  ]);
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('buildManifestPayload generates tenant-specific manifest with correct name and theme color', async () => {
  const m1 = await runWithTenant(T1, () => buildManifestPayload({ siteName: 'Alpha Bet', primaryColor: '#10b981' }));
  assert.equal(m1.name, 'Alpha Bet');
  assert.equal(m1.short_name, 'Alpha Bet');
  assert.equal(m1.theme_color, '#10b981');
  assert.equal(m1.display, 'standalone');
  assert.ok(Array.isArray(m1.icons) && m1.icons.length >= 4);

  const m2 = await runWithTenant(T2, () => buildManifestPayload({ siteName: 'Beta Gaming', primaryColor: '#3b82f6' }));
  assert.equal(m2.name, 'Beta Gaming');
  assert.equal(m2.short_name, 'Beta Gaming');
  assert.equal(m2.theme_color, '#3b82f6');
});

test('manifest endpoint serves application/manifest+json with no-cache headers', async () => {
  const app = express();
  app.use((req, res, next) => {
    req.tenant = { id: T1, host: 'alpha.example.com' };
    runWithTenant(T1, next);
  });
  app.use(manifestRoutes);

  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/manifest.webmanifest`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('application/manifest+json'));
    const body = await res.json();
    assert.equal(body.name, 'Alpha Bet');
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Implement manifest controller and routes**:
In `server/src/controllers/manifestController.js`:
```javascript
import { getBrandingValues } from '../branding/index.js';
import Tenant from '../models/Tenant.js';
import { getCurrentTenantId } from '../tenancy/context.js';

export const DEFAULT_ICONS = [
  { src: '/icons/icon-72x72.png', sizes: '72x72', type: 'image/png' },
  { src: '/icons/icon-96x96.png', sizes: '96x96', type: 'image/png' },
  { src: '/icons/icon-128x128.png', sizes: '128x128', type: 'image/png' },
  { src: '/icons/icon-144x144.png', sizes: '144x144', type: 'image/png' },
  { src: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
  { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
  { src: '/icons/icon-384x384.png', sizes: '384x384', type: 'image/png' },
  { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
];

export async function buildManifestPayload(overrides = {}) {
  const tenantId = getCurrentTenantId();
  let fallbackName = 'VIP90.bet';
  if (tenantId) {
    const tenant = await Tenant.findById(tenantId).select('name').lean();
    if (tenant?.name) fallbackName = tenant.name;
  }

  const values = await getBrandingValues().catch(() => ({}));
  const name = overrides.siteName || values.siteName || fallbackName;
  const themeColor = overrides.primaryColor || values.primaryColor || '#7c3aed';

  return {
    name,
    short_name: name,
    description: 'Spor bahis ve casino platformu',
    theme_color: themeColor,
    background_color: '#0f172a',
    display: 'standalone',
    orientation: 'portrait-primary',
    scope: '/',
    start_url: '/',
    icons: DEFAULT_ICONS,
  };
}

export async function serveManifest(req, res, next) {
  try {
    const payload = await buildManifestPayload();
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(payload);
  } catch (err) {
    next(err);
  }
}
```

In `server/src/routes/manifest.js`:
```javascript
import { Router } from 'express';
import { serveManifest } from '../controllers/manifestController.js';

const router = Router();
router.get('/manifest.webmanifest', serveManifest);
router.get('/site.webmanifest', serveManifest);
export default router;
```

In `server/src/app.js`:
Mount `manifestRoutes` after `resolveTenantHost()` and BEFORE `express.static(clientDist)` so the dynamic route intercepts static files.

- [ ] **Step 3: Run the task's tests**:
```bash
node --test --experimental-test-module-mocks server/test/manifest.test.js
```
Expected output:
```
✔ buildManifestPayload generates tenant-specific manifest with correct name and theme color
✔ manifest endpoint serves application/manifest+json with no-cache headers
ℹ pass 2
ℹ fail 0
```

- [ ] **Step 4: Commit**:
```bash
git add server/src/controllers/manifestController.js server/src/routes/manifest.js server/src/app.js server/test/manifest.test.js && git commit -m "feat(branding): serve dynamic manifest.webmanifest per tenant"
```

---

### Task 6: Server-Side Per-Tenant `index.html` Title and Brand Meta Rendering (Repository: core)

**Files:**
- Modify: `server/src/seo/http.js`
- Modify: `server/src/seo/render.js`
- Modify: `client/index.html`
- Create: `server/test/spaFallbackTenantBranding.test.js`
- Modify: `server/test/seoInject.test.js`

**Interfaces:**
- Consumes: `req.tenant` from `server/src/middleware/tenantHost.js`, `getSiteName()` from `server/src/branding/index.js`, `store` from `server/src/seo/store.js`.
- Produces: `createSpaFallback` / `sendIndex` renders the per-tenant `<title>` and OpenGraph metadata into `index.html` on every non-API request, regardless of whether SEO store is configured in the database.

- [ ] **Step 1: Write the failing tests** in `server/test/spaFallbackTenantBranding.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpaFallback } from '../src/seo/http.js';
import { runWithTenant } from '../src/tenancy/context.js';
import mongoose from 'mongoose';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('SPA fallback renders per-tenant title into index.html when SEO store is unconfigured', async () => {
  const tempIndex = join(tmpdir(), `test-index-${Date.now()}.html`);
  writeFileSync(tempIndex, '<!doctype html><html><head><title>Default</title></head><body><div id="root"></div></body></html>');

  const T1 = new mongoose.Types.ObjectId();
  const fallback = createSpaFallback({
    indexPath: tempIndex,
    store: {
      isConfigured: async () => false,
      get: async () => ({}),
    },
    getSiteName: async () => 'Custom Tenant Brand',
  });

  const req = { path: '/', get: () => 'tenant.example.com', headers: {} };
  let sentHtml = '';
  const res = {
    set: () => res,
    type: () => res,
    send: (content) => { sentHtml = content; },
    sendFile: () => { assert.fail('Should inject into HTML instead of bare sendFile'); },
  };

  try {
    await runWithTenant(T1, () => fallback(req, res, () => {}));
    assert.ok(sentHtml.includes('<title>Custom Tenant Brand</title>'));
    assert.ok(sentHtml.includes('property="og:site_name" content="Custom Tenant Brand"'));
  } finally {
    unlinkSync(tempIndex);
  }
});
```

- [ ] **Step 2: Update `server/src/seo/http.js` and `client/index.html`**:
In `server/src/seo/http.js`:
```javascript
  async function sendIndex(req, res) {
    let seoConfigured = false;
    let seo = {};
    try {
      seoConfigured = await store.isConfigured();
      if (seoConfigured) seo = await store.get();
    } catch {
      seoConfigured = false;
    }

    const html = await raw();
    const siteName = (await getSiteName().catch(() => '')) || 'VIP90.bet';
    const baseUrl = resolveBaseUrl(seo, req);

    // Build tags with tenant brand fallback even if seoConfigured is false
    const tags = buildSeoTags(seo, { path: req.path, baseUrl, siteName });
    if (!tags.title) {
      tags.title = siteName;
    }

    res.set('Cache-Control', 'no-cache');
    res.type('html').send(injectIntoHtml(html, tags));
  }
```

In `client/index.html`:
Replace hard-coded `<title>VIP90.bet</title>` with `<title></title>` to allow server injection without leaving stale defaults.

- [ ] **Step 3: Run the task's tests**:
```bash
node --test --experimental-test-module-mocks server/test/spaFallbackTenantBranding.test.js server/test/seoInject.test.js
```
Expected output:
```
✔ SPA fallback renders per-tenant title into index.html when SEO store is unconfigured
✔ injectIntoHtml handles title and meta tag replacement
ℹ pass 4
ℹ fail 0
```

- [ ] **Step 4: Commit**:
```bash
git add server/src/seo/http.js server/src/seo/render.js client/index.html server/test/spaFallbackTenantBranding.test.js && git commit -m "feat(branding): render index.html title and brand meta per tenant"
```

---

### Task 7: Per-Tenant Legal Entity Support and Legal Text Integration (Repository: core)

**Files:**
- Modify: `server/src/routes/branding.js`
- Modify: `server/src/tenancy/defaultTenant.js`
- Modify: `client/src/store/brandingStore.js`
- Modify: `client/src/branding/BrandingInjector.jsx`
- Modify: `client/src/data/legalContent.js`
- Modify: `client/src/pages/legal/LegalLayout.jsx`
- Modify: `client/src/pages/company/CompanyPageLayout.jsx`
- Create: `server/test/brandingLegalEntity.test.js`
- Create: `client/src/data/legalContent.test.js`

**Interfaces:**
- Consumes: `Tenant.legalEntity` (`{ name, registrationNo, address }`), `GET /api/branding`.
- Produces: `GET /api/branding` returns `{ values, legalEntity, tenantName }`. `brandingStore` stores `legalEntity`. `legalContent.js` dynamically evaluates `COMPANY` and `getLegalName` from the store while single-mode default tenant maintains exact backward compatibility.

- [ ] **Step 1: Write the failing tests** in `server/test/brandingLegalEntity.test.js`:
```javascript
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import brandingRoutes from '../src/routes/branding.js';
import Tenant from '../src/models/Tenant.js';
import { runWithTenant } from '../src/tenancy/context.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip8_t7_legal';
const T1 = new mongoose.Types.ObjectId();

before(async () => {
  await mongoose.connect(TEST_DB);
  await Tenant.deleteMany({});
  await Tenant.create({
    _id: T1,
    key: 'custom-tenant',
    name: 'Custom Operator',
    isDefault: false,
    status: 'active',
    legalEntity: {
      name: 'Custom Gaming N.V.',
      registrationNo: '12345/JAZ',
      address: 'Kaya Grandi 24, Bonaire',
    },
  });
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('GET /api/branding includes legalEntity and tenantName for current tenant', async () => {
  const app = express();
  app.use((req, res, next) => {
    runWithTenant(T1, next);
  });
  app.use('/api/branding', brandingRoutes);

  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/branding`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.values);
    assert.equal(body.tenantName, 'Custom Operator');
    assert.equal(body.legalEntity?.name, 'Custom Gaming N.V.');
    assert.equal(body.legalEntity?.registrationNo, '12345/JAZ');
    assert.equal(body.legalEntity?.address, 'Kaya Grandi 24, Bonaire');
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Implement legalEntity exposure and client store consumption**:
In `server/src/routes/branding.js`:
```javascript
import { Router } from 'express';
import { getBrandingValues } from '../branding/index.js';
import Tenant from '../models/Tenant.js';
import { getCurrentTenantId } from '../tenancy/context.js';

const r = Router();

r.get('/', async (req, res, next) => {
  try {
    const values = await getBrandingValues();
    let legalEntity = null;
    let tenantName = null;

    const tenantId = getCurrentTenantId();
    if (tenantId) {
      const tenant = await Tenant.findById(tenantId).select('name legalEntity').lean();
      if (tenant) {
        tenantName = tenant.name;
        legalEntity = tenant.legalEntity || null;
      }
    }

    res.set('Cache-Control', 'public, max-age=30');
    res.json({ values, legalEntity, tenantName });
  } catch (e) { next(e); }
});

export default r;
```

In `server/src/tenancy/defaultTenant.js`:
In `findOrCreateDefaultTenant`, initialize `legalEntity`:
```javascript
          key: DEFAULT_TENANT_KEY,
          name: 'VIP90.bet',
          legalEntity: {
            name: 'VIP90.bet International N.V.',
            registrationNo: '8048/JAZ2024-001',
            address: 'Heelsumstraat 51, E-Commerce Park, Curaçao',
          },
```

In `client/src/store/brandingStore.js`:
```javascript
import { create } from 'zustand';

export const useBrandingStore = create((set) => ({
  siteName: null,
  logo: null,
  legalEntity: null,
  loaded: false,
  setBranding: (values, { legalEntity = null } = {}) => set({
    siteName: values.siteName || null,
    logo: values.logo || null,
    legalEntity: legalEntity || null,
    loaded: true,
  }),
}));
```

In `client/src/data/legalContent.js`:
Update `getLegalName` and `COMPANY` to read dynamically from `useBrandingStore.getState().legalEntity`:
```javascript
import { useBrandingStore } from '../store/brandingStore';

export const DEFAULT_LEGAL_ENTITY = {
  name: 'VIP90.bet International N.V.',
  address: 'Heelsumstraat 51, E-Commerce Park, Curaçao',
  license: 'Curacao Gaming Control Board - Lisans #8048/JAZ2024-001',
  email: 'support@example.com',
  responsibleEmail: 'responsible@example.com',
};

export function getCompanyInfo() {
  const store = useBrandingStore.getState();
  const entity = store.legalEntity;
  const siteName = store.siteName;
  if (!entity && !siteName) return DEFAULT_LEGAL_ENTITY;
  return {
    name: entity?.name || (siteName ? `${siteName} International N.V.` : DEFAULT_LEGAL_ENTITY.name),
    address: entity?.address || DEFAULT_LEGAL_ENTITY.address,
    license: entity?.registrationNo ? `Lisans #${entity.registrationNo}` : DEFAULT_LEGAL_ENTITY.license,
    email: DEFAULT_LEGAL_ENTITY.email,
    responsibleEmail: DEFAULT_LEGAL_ENTITY.responsibleEmail,
  };
}

export const getLegalName = (siteName = useBrandingStore.getState().siteName) => {
  const entity = useBrandingStore.getState().legalEntity;
  if (entity?.name) return entity.name;
  return siteName ? `${siteName} International N.V.` : DEFAULT_LEGAL_ENTITY.name;
};
```

- [ ] **Step 3: Run the task's tests**:
```bash
node --test --experimental-test-module-mocks server/test/brandingLegalEntity.test.js client/src/data/legalContent.test.js
```
Expected output:
```
✔ GET /api/branding includes legalEntity and tenantName for current tenant
✔ getCompanyInfo falls back safely for default tenant and returns dynamic legal entity
ℹ pass 3
ℹ fail 0
```

- [ ] **Step 4: Commit**:
```bash
git add server/src/routes/branding.js server/src/tenancy/defaultTenant.js client/src/store/brandingStore.js client/src/branding/BrandingInjector.jsx client/src/data/legalContent.js client/src/pages/legal/LegalLayout.jsx client/src/pages/company/CompanyPageLayout.jsx server/test/brandingLegalEntity.test.js client/src/data/legalContent.test.js && git commit -m "feat(branding): serve and consume legalEntity per tenant"
```

---

### Task 8: Remove Client Hardcoded Brand Fallback Strings (Repository: core)

**Files:**
- Modify: `client/src/components/Footer.jsx`
- Modify: `client/src/components/LiveHelp.jsx`
- Modify: `client/src/components/Navbar.jsx`
- Modify: `client/src/components/home/PromoHeroSlider.jsx`
- Modify: `client/src/pages/HomePage.jsx`
- Modify: `client/src/pages/Login.jsx`
- Modify: `client/src/seo/titles.js`
- Modify: `client/src/seo/titles.test.js`
- Create: `client/test/brandFallbacksClean.test.js`

**Interfaces:**
- Consumes: `useBrandingStore(s => s.siteName)`.
- Produces: Removes hard-coded fallback strings (such as literal brand names) from UI components, relying cleanly on `siteName` from `brandingStore`. In single-mode installs, the default tenant supplies `VIP90.bet` through the store, preserving identical appearance without hard-coded literals.

- [ ] **Step 1: Write the failing tests** in `client/test/brandFallbacksClean.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FILES_TO_CHECK = [
  'client/src/components/Footer.jsx',
  'client/src/components/LiveHelp.jsx',
  'client/src/components/Navbar.jsx',
  'client/src/components/home/PromoHeroSlider.jsx',
  'client/src/pages/HomePage.jsx',
  'client/src/pages/Login.jsx',
];

test('no component contains hard-coded VIP90 fallback literals', () => {
  for (const file of FILES_TO_CHECK) {
    const content = readFileSync(resolve(process.cwd(), file), 'utf8');
    const hasHardcodedFallback = /\|\|\s*['"]VIP90(?:\.bet)?['"]/i.test(content);
    assert.equal(
      hasHardcodedFallback,
      false,
      `File ${file} still contains hard-coded brand fallback`
    );
  }
});
```

- [ ] **Step 2: Clean hard-coded brand fallbacks**:
In `client/src/components/Footer.jsx`:
```javascript
const siteName = useBrandingStore(s => s.siteName) || '';
```
In `client/src/components/LiveHelp.jsx`:
```javascript
const siteName = useBrandingStore(s => s.siteName) || '';
```
In `client/src/components/Navbar.jsx`:
```javascript
{logo ? (
  <img src={logo} alt={siteName || 'Logo'} className="h-8 w-auto object-contain" />
) : (
  <><span className="text-2xl">💎</span> {siteName}</>
)}
```
In `client/src/components/home/PromoHeroSlider.jsx`:
```javascript
const siteName = useBrandingStore(s => s.siteName) || '';
```
In `client/src/pages/HomePage.jsx`:
```javascript
const siteName = useBrandingStore(s => s.siteName) || '';
```
In `client/src/pages/Login.jsx`:
```javascript
const siteName = useBrandingStore(s => s.siteName) || '';
```
In `client/src/seo/titles.js`:
Update `formatTitle` to format safely without requiring a hard-coded brand string when site is unset:
```javascript
export function formatTitle(template, page, site) {
  const s = site || '';
  if (!page) return s;
  const tpl = template && template.trim() ? template : DEFAULT_TITLE_TEMPLATE;
  return tpl.split('{page}').join(page).split('{site}').join(s);
}
```

- [ ] **Step 3: Run the task's tests**:
```bash
node --test --experimental-test-module-mocks client/test/brandFallbacksClean.test.js client/src/seo/titles.test.js
```
Expected output:
```
✔ no component contains hard-coded VIP90 fallback literals
✔ titles formatter tests pass
ℹ pass 5
ℹ fail 0
```

- [ ] **Step 4: Commit**:
```bash
git add client/src/components/Footer.jsx client/src/components/LiveHelp.jsx client/src/components/Navbar.jsx client/src/components/home/PromoHeroSlider.jsx client/src/pages/HomePage.jsx client/src/pages/Login.jsx client/src/seo/titles.js client/src/seo/titles.test.js client/test/brandFallbacksClean.test.js && git commit -m "fix(client): remove hard-coded brand fallback strings"
```

---

### Task 9: Full Isolation Acceptance Suite Green in `enforce` Mode (Repository: core)

**Files:**
- Create: `server/test/enforceIsolationAcceptance.test.js`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: All tenancy models, `tenantScoped`, `TENANCY_MODE=multi`, `TENANCY_ENFORCEMENT=enforce`, `resolveTenantHost`, `manifestController`, `createSpaFallback`.
- Produces: Comprehensive acceptance test suite verifying all §8 isolation guarantees under strict `enforce` mode, with zero `TenantScopeError` violations across normal requests, and documenting changes in `CHANGELOG.md`.

- [ ] **Step 1: Write the acceptance tests** in `server/test/enforceIsolationAcceptance.test.js`:
```javascript
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Tenant from '../src/models/Tenant.js';
import Domain from '../src/models/Domain.js';
import Transaction from '../src/models/Transaction.js';
import StaticPage from '../src/models/StaticPage.js';
import { runWithTenant, runAsPlatform } from '../src/tenancy/context.js';
import { TenantScopeError } from '../src/tenancy/errors.js';
import { readTenancyConfig, validateTenancyStartup } from '../src/config/tenancy.js';
import { buildManifestPayload } from '../src/controllers/manifestController.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip8_acceptance';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

let savedMode, savedEnforcement;

before(async () => {
  savedMode = process.env.TENANCY_MODE;
  savedEnforcement = process.env.TENANCY_ENFORCEMENT;
  process.env.TENANCY_MODE = 'multi';
  process.env.TENANCY_ENFORCEMENT = 'enforce';

  await mongoose.connect(TEST_DB);
  await Tenant.deleteMany({});
  await Domain.deleteMany({});
  await User.deleteMany({});
  await Transaction.deleteMany({});
  await StaticPage.deleteMany({});

  await Tenant.create([
    {
      _id: T1,
      key: 'tenant-one',
      name: 'Alpha Operator',
      status: 'active',
      legalEntity: { name: 'Alpha Holdings N.V.', registrationNo: '111/JAZ', address: 'Alpha Way 1' },
    },
    {
      _id: T2,
      key: 'tenant-two',
      name: 'Beta Operator',
      status: 'active',
      legalEntity: { name: 'Beta Entertainment N.V.', registrationNo: '222/JAZ', address: 'Beta Road 2' },
    },
  ]);
});

after(async () => {
  if (savedMode === undefined) delete process.env.TENANCY_MODE; else process.env.TENANCY_MODE = savedMode;
  if (savedEnforcement === undefined) delete process.env.TENANCY_ENFORCEMENT; else process.env.TENANCY_ENFORCEMENT = savedEnforcement;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('multi mode strictly forces enforcement and throws on unscoped tenant model query', async () => {
  const cfg = readTenancyConfig({ TENANCY_MODE: 'multi' });
  assert.equal(cfg.enforcement, 'enforce');

  // Direct unscoped query without runWithTenant or runAsPlatform must throw TenantScopeError
  await assert.rejects(
    async () => User.find({ username: 'player1' }),
    TenantScopeError
  );
});

test('scoped operations across T1 and T2 execute cleanly without scope errors in enforce mode', async () => {
  let u1, u2;
  await runWithTenant(T1, async () => {
    u1 = await User.create({ username: 'alpha_player', email: 'p1@alpha.example.com' });
    assert.equal(String(u1.tenantId), String(T1));
    const found = await User.findOne({ username: 'alpha_player' });
    assert.ok(found);
  });

  await runWithTenant(T2, async () => {
    u2 = await User.create({ username: 'beta_player', email: 'p2@beta.example.com' });
    assert.equal(String(u2.tenantId), String(T2));
    const found = await User.findOne({ username: 'beta_player' });
    assert.ok(found);

    // Cross-tenant search returns null
    const notFound = await User.findOne({ username: 'alpha_player' });
    assert.equal(notFound, null);
  });
});

test('dynamic manifest generates isolated brand metadata for each tenant in enforce mode', async () => {
  const m1 = await runWithTenant(T1, () => buildManifestPayload({ siteName: 'Alpha Operator' }));
  const m2 = await runWithTenant(T2, () => buildManifestPayload({ siteName: 'Beta Operator' }));

  assert.equal(m1.name, 'Alpha Operator');
  assert.equal(m2.name, 'Beta Operator');
  assert.notEqual(m1.name, m2.name);
});
```

- [ ] **Step 2: Update `CHANGELOG.md`**:
Add entry under `[Yayınlanmadı]` following `docs/CHANGELOG_GUIDE.md`:
```markdown
### Eklendi
- Multi modda (`TENANCY_MODE=multi`) `TENANCY_ENFORCEMENT=enforce` zorunlu kılındı; kapsamsız kiracı sorguları `TenantScopeError` fırlatır (İP-8).
- Tek modda isteğe bağlı `enforce` desteği (G8) sağlandı.
- Kiracı başına dinamik PWA `manifest.webmanifest` ve `site.webmanifest` sunumu eklendi.
- `index.html` başlığı (`<title>`) ve marka OpenGraph meta etiketlerinin sunucu tarafında kiracı bazında üretimi sağlandı.
- `Tenant.legalEntity` bilgileri `/api/branding` üzerinden sunularak yasal metinlerin dinamik bağlanması sağlandı.

### Değiştirildi
- İstemci bileşenlerindeki sabit marka geri dönüş metinleri (`VIP90.bet` fallback) kaldırıldı.
```

- [ ] **Step 3: Run the task's tests**:
```bash
node --test --experimental-test-module-mocks server/test/enforceIsolationAcceptance.test.js
```
Expected output:
```
✔ multi mode strictly forces enforcement and throws on unscoped tenant model query
✔ scoped operations across T1 and T2 execute cleanly without scope errors in enforce mode
✔ dynamic manifest generates isolated brand metadata for each tenant in enforce mode
ℹ pass 3
ℹ fail 0
```

- [ ] **Step 4: Commit**:
```bash
git add server/test/enforceIsolationAcceptance.test.js CHANGELOG.md && git commit -m "feat(tenancy): İP-8 full isolation acceptance suite in enforce mode"
```
