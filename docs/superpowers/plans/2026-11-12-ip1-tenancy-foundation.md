# İP-1 Tenancy Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the multi-tenant foundation (tenant model, request context, scope plugin, connection resolver, default tenant, mode checks, demo flags, provisioning hooks) with no behaviour change except that demo behaviour now needs explicit `DEMO_*` flags.

**Architecture:** A new `server/src/tenancy/` package holds the context (`AsyncLocalStorage`), the `tenantScoped` Mongoose plugin, the tenant model registry with a connection resolver, `forEachTenant`, the default-tenant boot migration and the provisioning registry. `server/src/config/tenancy.js` parses and validates `TENANCY_MODE`, `TENANCY_ENFORCEMENT` and the `DEMO_*` flags; `server/src/config/demoFlags.js` exposes the effective demo flags to jobs, routes and (through `GET /api/admin/demo-flags`) the admin client. In İP-1 **no production model uses the plugin**: only test-only models defined inside tests do. Tenant-owned models adopt `defineTenantModel` in İP-2.

**Tech Stack:** Node >= 22 (ESM), Express 4, Mongoose 8.24, `node:test` + `node:assert/strict`, local MongoDB (replica set `rs0` on 127.0.0.1:27017), React (Vite) client.

**Spec:** `docs/superpowers/specs/2026-11-09-multi-tenant-design.md` (Turkish; arrives with the İP-U merge, a copy lives in the `core-ipu` worktree). Sections used: §0.3, §4.2, §4.3.2, §4.3.3, §4.4, §6.1, §6.3 G1, §7.1 (İP-1 row), §7.2, §8.1 (demo tests).

## Global Constraints

- Core never imports premium (`server/src/premium/*`). Premium plugs in through `server/src/tenancy/index.js` exports; the only premium touchpoint in core is `mongoose.models.Operator` looked up by name at runtime (no import).
- İP-1 delivers "davranış değişikliği yok (demo bayrakları hariç, 6.1)": with no tenancy env set, a single-mode install behaves exactly as before except the demo flags.
- Model name is `Tenant`, field name is `tenantId`. Never `Operator`/`operatorId` for the tenant (§4.2, R2).
- `TENANCY_MODE`: `single` | `multi`, default `single`. `TENANCY_ENFORCEMENT`: `off` | `log` | `enforce`; default `off` in single, `enforce` in multi.
- `DEMO_BOTS`, `DEMO_FAKE_WINNERS`, `DEMO_INSTANT_DEPOSIT`, `DEMO_DATA`: `true`/`false`, default `false`. Off: job not started, routes `404 DEMO_FEATURE_DISABLED`, client entries hidden. Never effective in `multi`.
- Startup refuses when `multi` and enforcement is not `enforce`, when `multi` and any `DEMO_*` is `true`, when `multi` and `JWT_STAFF_SECRET` or `OPERATOR_SECRET_ENCRYPTION_KEY` is missing.
- Default tenant: `Tenant{isDefault:true, key:'default'}`; migration record `Migration{name:'tenancy-001-default-tenant'}`.
- Platform models (`Tenant`, `Domain`, `Migration`, `Event`, `Permission`) never get the plugin.
- Never call `syncIndexes()` (drops indexes not in the schema; §6.3 notes).
- Tests use their own database names (`vip90_test_tenancy_*` on `mongodb://127.0.0.1:27017`) and never read `MONGODB_URI` (it may point to a real database). Allow override only via `TENANCY_TEST_MONGO` (base URI, default `mongodb://127.0.0.1:27017`). Drop the test database in `after()`.
- New code comments in English. `CHANGELOG.md` entries are Turkish under the literal heading `## [Yayınlanmadı]` (`docs/CHANGELOG_GUIDE.md`).
- Commits add files by explicit path. Never `git add -A` or `git add .`.

**Setup in each worktree (once):** `npm ci && npm ci --prefix server`. Mongo must answer `mongosh --quiet --eval 'db.runCommand({ping:1}).ok'` with `1`. Run tests from the repo root.

## Review Focus

- **Context across async hops.** A `runWithTenant` body that awaits, uses `Promise.all`, or schedules `setTimeout` must still see its tenant; a sibling `runWithTenant` running concurrently must never see the other's tenant. Test in Task 2.
- **String vs ObjectId tenant ids.** Callers pass hex strings from JWTs/URLs; `aggregate` does not cast. `runWithTenant('<hex>')` must normalise to `ObjectId`, a filter `{tenantId: '<same hex>'}` is not a mismatch, and the injected `$match` uses an `ObjectId`. Tests in Tasks 2, 4, 5.
- **Sloppy env values.** `TENANCY_MODE=" Multi "`, `DEMO_BOTS=TRUE`, `JWT_STAFF_SECRET=""` (empty counts as missing), a typo like `TENANCY_MODE=mulit` (refuse, do not silently fall back to single). Tests in Task 1.
- **Two processes booting at once** (PM2 cluster, a restart overlapping the old process): G1 must still leave exactly one `isDefault` tenant. Test in Task 9.
- **One tenant failing inside `forEachTenant`** must not stop the others nor leak its context to the caller. Test in Task 7.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `server/src/config/tenancy.js` (create) | Parse/validate `TENANCY_MODE`, `TENANCY_ENFORCEMENT`, `DEMO_*`; startup assertion | 1 |
| `server/src/config/demoFlags.js` (modify) | Effective demo flags, `requireDemoFlag` middleware | 1 |
| `server/.env.example`, `.env.docker.example` (modify) | Document the variables | 1 |
| `server/src/tenancy/errors.js`, `connections.js`, `context.js` (create) | `TenantScopeError`, connection resolver, `AsyncLocalStorage` context | 2 |
| `server/src/models/Tenant.js`, `server/src/models/Domain.js` (create) | Platform models | 3 |
| `server/src/tenancy/tenantScoped.js` (create) | Plugin: query/save/insertMany/bulkWrite hooks, violation stats, tenant-collection registry | 4 |
| same file (modify) + `tenantLookup` | Aggregate hook, `$lookup` guard | 5 |
| `server/src/tenancy/models.js` (create) | `defineTenantModel`, `getTenantModel` | 6 |
| `server/src/tenancy/forEachTenant.js` (create) | Iterate tenants in their own context | 7 |
| `server/src/tenancy/provisioning.js` (create) | Provisioning hook + credential schema registry | 8 |
| `server/src/tenancy/defaultTenant.js`, `server/migrations/0004_tenancy_default_tenant.js` (create) | G1 boot migration | 9 |
| `server/src/jobs/demoJobs.js` (create), `server/src/server.js` (modify) | Startup checks, tenancy boot, demo job gating | 10 |
| `server/src/routes/admin.js` (modify) | Route gating, `GET /api/admin/demo-flags` | 11 |
| `client/src/utils/demoFlags.js`, `client/src/hooks/useDemoFlags.js` (create); `adminNav.config.js`, `AdminSidebar.jsx`, `AdminTopbar.jsx`, `Dashboard.jsx` (modify) | Hide demo entries | 12 |
| `server/src/tenancy/index.js` (create) | Public surface for premium add-ons | 13 |
| `CHANGELOG.md`, `AGENTS.md`, `docs/product/02-yapilandirma.md`, `05-api-referansi.md`, `11-admin-araclari.md` (modify) | Docs | 14 |

## Parallelism

Each task is one commit on its own branch cut from `feat/ip1-tenancy-foundation`; merge back in wave order. A task may start when every task it consumes (its **Interfaces → Consumes**) is merged.

| Wave | Tasks (run in parallel, separate worktrees) | Depends on |
|---|---|---|
| A | 1 (config), 2 (context), 3 (models), 12 (client; needs only the endpoint contract in Task 11's Interfaces) | none |
| B | 4 (plugin) | 1, 2 |
| B | 7 (forEachTenant) | 2, 3 |
| B | 8 (provisioning) | 2 |
| B | 9 (default tenant) | 1, 3 |
| B | 11 (admin routes) | 1 |
| C | 5 (aggregate) | 4 |
| C | 6 (model registry) | 2, 4 |
| C | 10 (server wiring) | 1, 9 |
| D | 13 (public surface) | 2, 6, 7, 8 |
| E | 14 (docs, CHANGELOG, AGENTS.md) | all |

Conflict notes: Tasks 4 and 5 edit the same file, so 5 waits for 4. Task 10 is the only task editing `server/src/server.js`; Task 11 the only one editing `server/src/routes/admin.js`; Task 14 the only one editing `CHANGELOG.md`.

---

### Task 1: Tenancy config, startup validation and demo flags

**Files:**
- Create: `server/src/config/tenancy.js`
- Modify: `server/src/config/demoFlags.js`
- Modify: `server/.env.example` (the "Demo anında yatırma" block near line 181), `.env.docker.example` (near line 62)
- Test: `server/test/tenancyConfig.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `tenancy.js`: `TENANCY_MODES = ['single','multi']`, `ENFORCEMENT_MODES = ['off','log','enforce']`, `DEMO_FLAG_ENV = { bots:'DEMO_BOTS', fakeWinners:'DEMO_FAKE_WINNERS', instantDeposit:'DEMO_INSTANT_DEPOSIT', data:'DEMO_DATA' }` (all frozen);
    `readTenancyConfig(env = process.env) -> { mode: 'single'|'multi', enforcement: 'off'|'log'|'enforce', demoRequested: { bots, fakeWinners, instantDeposit, data }: boolean, errors: string[] }`;
    `getTenancyMode(env = process.env) -> 'single'|'multi'`; `getTenancyEnforcement(env = process.env) -> 'off'|'log'|'enforce'`;
    `validateTenancyStartup(env = process.env) -> string[]`; `class TenancyStartupError extends Error { code = 'TENANCY_STARTUP'; problems: string[] }`; `assertTenancyStartup(env = process.env) -> void` (throws `TenancyStartupError`).
  - `demoFlags.js` (keeps `isMultiTenancyMode`, `isDemoInstantDepositEnabled`, `requireDemoInstantDeposit`): `getDemoFlags(env = process.env) -> { bots, fakeWinners, instantDeposit, data }` (effective: always all `false` in multi); `isDemoBotsEnabled(env)`, `isDemoFakeWinnersEnabled(env)`, `isDemoDataEnabled(env)`; `requireDemoFlag(flag: 'bots'|'fakeWinners'|'instantDeposit'|'data') -> express middleware` with property `.demoFlag === flag`, reading `process.env` per request, `next(createError(404, 'DEMO_FEATURE_DISABLED', 'This feature is disabled on this installation'))` when off; unknown flag throws `TypeError` at creation.

Parsing rules: values are trimmed and lower-cased. Mode unset/empty → `single`. Enforcement unset/empty → `off` in single, `enforce` in multi. Invalid mode → `mode:'single'` plus an error; invalid enforcement → mode default plus an error. A demo flag is requested only when its value is `true`. A secret is missing when unset or empty after trim.

Exact error strings (the tests match them):
- `TENANCY_MODE must be "single" or "multi" (got "<raw>")`
- `TENANCY_ENFORCEMENT must be "off", "log" or "enforce" (got "<raw>")`
- `TENANCY_MODE=multi requires TENANCY_ENFORCEMENT=enforce (got "<value>")`
- `TENANCY_MODE=multi does not allow <ENV_NAME>=true` (one per requested flag)
- `TENANCY_MODE=multi requires JWT_STAFF_SECRET`
- `TENANCY_MODE=multi requires OPERATOR_SECRET_ENCRYPTION_KEY`

- [ ] **Step 1: Write the failing tests** in `server/test/tenancyConfig.test.js` (pure, no DB):

```js
const MULTI_OK = { TENANCY_MODE: 'multi', JWT_STAFF_SECRET: 's', OPERATOR_SECRET_ENCRYPTION_KEY: 'k' };

it('defaults to single/off with no demo flags', () => {
  assert.deepEqual(readTenancyConfig({}), { mode: 'single', enforcement: 'off',
    demoRequested: { bots: false, fakeWinners: false, instantDeposit: false, data: false }, errors: [] });
});
it('multi defaults enforcement to enforce', () => {
  assert.equal(getTenancyEnforcement({ TENANCY_MODE: 'multi' }), 'enforce');
});
it('trims and lower-cases', () => {
  assert.equal(getTenancyMode({ TENANCY_MODE: ' Multi ' }), 'multi');
  assert.equal(readTenancyConfig({ DEMO_BOTS: 'TRUE' }).demoRequested.bots, true);
  assert.equal(readTenancyConfig({ DEMO_BOTS: '1' }).demoRequested.bots, false);
});
it('single mode with every demo flag and enforce is valid', () => {
  assert.deepEqual(validateTenancyStartup({ TENANCY_ENFORCEMENT: 'enforce', DEMO_BOTS: 'true',
    DEMO_FAKE_WINNERS: 'true', DEMO_INSTANT_DEPOSIT: 'true', DEMO_DATA: 'true' }), []);
});
it('typo in mode is refused, not treated as single', () => {
  assert.deepEqual(validateTenancyStartup({ TENANCY_MODE: 'mulit' }),
    ['TENANCY_MODE must be "single" or "multi" (got "mulit")']);
});
it('invalid enforcement is refused', () => {
  assert.match(validateTenancyStartup({ TENANCY_ENFORCEMENT: 'strict' })[0], /TENANCY_ENFORCEMENT must be/);
});
it('multi with all secrets and default enforcement is valid', () => {
  assert.deepEqual(validateTenancyStartup(MULTI_OK), []);
});
it('multi refuses log enforcement', () => {
  assert.deepEqual(validateTenancyStartup({ ...MULTI_OK, TENANCY_ENFORCEMENT: 'log' }),
    ['TENANCY_MODE=multi requires TENANCY_ENFORCEMENT=enforce (got "log")']);
});
it('multi refuses each demo flag', () => {
  for (const name of ['DEMO_BOTS', 'DEMO_FAKE_WINNERS', 'DEMO_INSTANT_DEPOSIT', 'DEMO_DATA']) {
    assert.deepEqual(validateTenancyStartup({ ...MULTI_OK, [name]: 'true' }),
      [`TENANCY_MODE=multi does not allow ${name}=true`]);
  }
});
it('multi refuses missing or empty secrets', () => {
  assert.deepEqual(validateTenancyStartup({ TENANCY_MODE: 'multi', JWT_STAFF_SECRET: '  ' }), [
    'TENANCY_MODE=multi requires JWT_STAFF_SECRET',
    'TENANCY_MODE=multi requires OPERATOR_SECRET_ENCRYPTION_KEY',
  ]);
});
it('assertTenancyStartup throws with all problems', () => {
  assert.throws(() => assertTenancyStartup({ TENANCY_MODE: 'multi', DEMO_DATA: 'true' }),
    (e) => e instanceof TenancyStartupError && e.code === 'TENANCY_STARTUP' && e.problems.length === 3);
  assert.doesNotThrow(() => assertTenancyStartup({}));
});
it('effective demo flags: on in single only when requested, never in multi', () => {
  assert.deepEqual(getDemoFlags({}), { bots: false, fakeWinners: false, instantDeposit: false, data: false });
  assert.equal(isDemoBotsEnabled({ DEMO_BOTS: 'true' }), true);
  assert.equal(isDemoFakeWinnersEnabled({ DEMO_FAKE_WINNERS: 'true' }), true);
  assert.equal(isDemoDataEnabled({ DEMO_DATA: 'true' }), true);
  assert.deepEqual(getDemoFlags({ TENANCY_MODE: 'multi', DEMO_BOTS: 'true', DEMO_DATA: 'true' }),
    { bots: false, fakeWinners: false, instantDeposit: false, data: false });
});
it('requireDemoFlag answers 404 when off and passes when on', () => {
  const mw = requireDemoFlag('data');
  assert.equal(mw.demoFlag, 'data');
  // set process.env.DEMO_DATA, call mw({}, {}, next) and capture the next() argument;
  // off → err.status === 404 && err.code === 'DEMO_FEATURE_DISABLED'; 'true' → next() with no argument;
  // 'true' plus TENANCY_MODE=multi → 404. Restore both env vars in a finally block.
});
it('requireDemoFlag rejects unknown flag names', () => {
  assert.throws(() => requireDemoFlag('robots'), TypeError);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test server/test/tenancyConfig.test.js`
Expected: FAIL, `Cannot find module .../server/src/config/tenancy.js`.

- [ ] **Step 3: Implement `server/src/config/tenancy.js`** with the signatures above. `validateTenancyStartup` returns problems in this order: mode error, enforcement error, multi enforcement, demo flags in `DEMO_FLAG_ENV` order, `JWT_STAFF_SECRET`, `OPERATOR_SECRET_ENCRYPTION_KEY`.

- [ ] **Step 4: Rewrite `server/src/config/demoFlags.js`** on top of `tenancy.js`. `isMultiTenancyMode(env)` becomes `getTenancyMode(env) === 'multi'`; `requireDemoInstantDeposit` becomes `requireDemoFlag('instantDeposit')`. Keep the existing exports so `routes/transactions.js` and `server/test/security/v4-demo-deposit.test.js` stay unchanged.

- [ ] **Step 5: Document the variables.** In `server/.env.example`, replace the "Demo anında yatırma" block with a "Kiracı modu ve demo bayrakları" block listing `TENANCY_MODE=single`, `TENANCY_ENFORCEMENT=` (empty = mode default), `JWT_STAFF_SECRET=` (comment: required only in multi), and `DEMO_BOTS=false`, `DEMO_FAKE_WINNERS=false`, `DEMO_INSTANT_DEPOSIT=false`, `DEMO_DATA=false`. Each gets a one-line Turkish comment that matches the file's style. Add a comment saying demo installs must set the flags they use to `true`, and that in multi any `true` stops the server. Make the same change in English in `.env.docker.example`.

- [ ] **Step 6: Run tests**

Run: `node --test server/test/tenancyConfig.test.js && node --test server/test/security/v4-demo-deposit.test.js`
Expected: both end with `# fail 0`.

- [ ] **Step 7: Commit**

```bash
git add server/src/config/tenancy.js server/src/config/demoFlags.js server/.env.example .env.docker.example server/test/tenancyConfig.test.js
git commit -m "feat(tenancy): tenancy mode, enforcement and demo flag config with startup checks"
```

---

### Task 2: Tenant context, connection resolver, TenantScopeError

**Files:**
- Create: `server/src/tenancy/errors.js`, `server/src/tenancy/connections.js`, `server/src/tenancy/context.js`
- Test: `server/test/tenancyContext.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `errors.js`: `class TenantScopeError extends Error` with `constructor(message, { model = null, op = null, reason = 'unscoped' } = {})`; fields `name = 'TenantScopeError'`, `code = 'TENANT_SCOPE'`, `status = 500`, `model`, `op`, `reason` (`'unscoped'|'cross_tenant'`).
  - `connections.js`: `resolveConnection(tenantId: ObjectId|null) -> mongoose.Connection` (default: `mongoose.connection` for every id); `setConnectionResolver(fn: ((tenantId) => Connection) | null) -> void` (`null` restores the default).
  - `context.js`: `tenantContext = { run(ctx, fn), get() }`, where `get()` returns the frozen ctx or `undefined`. Context shape: `{ tenantId: ObjectId|null, brandId: ObjectId|null, actor: { kind: 'player'|'staff'|'system', id, scope }, mode: 'tenant'|'platform', reason: string|null, connection: mongoose.Connection }`.
    `runWithTenant(tenantId: ObjectId|string, fn, { brandId = null, actor = { kind: 'system', id: null, scope: null } } = {}) -> ReturnType<fn>`: normalises `tenantId` to `ObjectId`, throws `TypeError` for null or invalid ids, and sets `connection: resolveConnection(tenantId)`.
    `runAsPlatform(reason: string, fn) -> ReturnType<fn>`: throws `TypeError` unless `reason` is a non-empty string, logs `console.info('[tenancy] runAsPlatform: ' + reason)`, and sets `mode: 'platform'`, `tenantId: null`, `connection: mongoose.connection`.
    `getCurrentTenantId() -> ObjectId|null`: returns the tenant id only when `mode === 'tenant'`.

- [ ] **Step 1: Write the failing tests** (pure, no DB; for the resolver, use `mongoose.createConnection()` without a URI as the fake second connection):

```js
it('get() is undefined outside any run', () => assert.equal(tenantContext.get(), undefined));
it('runWithTenant normalises a hex string to ObjectId', () => runWithTenant(HEX, () => {
  const ctx = tenantContext.get();
  assert.ok(ctx.tenantId instanceof mongoose.Types.ObjectId);
  assert.equal(String(ctx.tenantId), HEX);
  assert.equal(ctx.mode, 'tenant');
  assert.equal(ctx.actor.kind, 'system');
  assert.ok(Object.isFrozen(ctx));
}));
it('runWithTenant rejects null and garbage ids', () => {
  assert.throws(() => runWithTenant(null, () => {}), TypeError);
  assert.throws(() => runWithTenant('nope', () => {}), TypeError);
});
it('returns fn result, including promises', async () => {
  assert.equal(await runWithTenant(HEX, async () => 42), 42);
});
it('context survives await, Promise.all and setTimeout', async () => {
  await runWithTenant(HEX, async () => {
    await new Promise((r) => setTimeout(r, 5));
    const ids = await Promise.all([1, 2].map(async () => String(getCurrentTenantId())));
    assert.deepEqual(ids, [HEX, HEX]);
  });
});
it('concurrent runs do not see each other', async () => {
  const seen = await Promise.all([HEX, HEX2].map((id) => runWithTenant(id, async () => {
    await new Promise((r) => setTimeout(r, Math.random() * 10));
    return String(getCurrentTenantId());
  })));
  assert.deepEqual(seen, [HEX, HEX2]);
});
it('runAsPlatform requires a reason and sets platform mode', () => {
  assert.throws(() => runAsPlatform('', () => {}), TypeError);
  assert.throws(() => runAsPlatform(undefined, () => {}), TypeError);
  runAsPlatform('test: settle loop', () => {
    assert.equal(tenantContext.get().mode, 'platform');
    assert.equal(getCurrentTenantId(), null);
    assert.equal(tenantContext.get().reason, 'test: settle loop');
  });
});
it('nested platform inside tenant restores tenant afterwards', () => runWithTenant(HEX, () => {
  runAsPlatform('nested', () => assert.equal(getCurrentTenantId(), null));
  assert.equal(String(getCurrentTenantId()), HEX);
}));
it('connection comes from the resolver', () => {
  const other = mongoose.createConnection();
  setConnectionResolver((id) => (String(id) === HEX2 ? other : mongoose.connection));
  try {
    runWithTenant(HEX2, () => assert.equal(tenantContext.get().connection, other));
    runWithTenant(HEX, () => assert.equal(tenantContext.get().connection, mongoose.connection));
  } finally { setConnectionResolver(null); }
  assert.equal(resolveConnection(new mongoose.Types.ObjectId(HEX2)), mongoose.connection);
});
it('TenantScopeError carries code, status and details', () => {
  const e = new TenantScopeError('x', { model: 'W', op: 'find', reason: 'cross_tenant' });
  assert.equal(e.code, 'TENANT_SCOPE'); assert.equal(e.status, 500);
  assert.equal(e.model, 'W'); assert.equal(e.op, 'find'); assert.equal(e.reason, 'cross_tenant');
  assert.ok(e instanceof Error);
});
```

- [ ] **Step 2: Run to verify failure:** `node --test server/test/tenancyContext.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement the three files.** Use `AsyncLocalStorage` from `node:async_hooks` with one module-level instance, and `Object.freeze` the ctx.
- [ ] **Step 4: Run:** `node --test server/test/tenancyContext.test.js`. Expected: `# fail 0`.
- [ ] **Step 5: Commit**

```bash
git add server/src/tenancy/errors.js server/src/tenancy/connections.js server/src/tenancy/context.js server/test/tenancyContext.test.js
git commit -m "feat(tenancy): AsyncLocalStorage tenant context, connection resolver, TenantScopeError"
```

---

### Task 3: Tenant and Domain models

**Files:**
- Create: `server/src/models/Tenant.js`, `server/src/models/Domain.js`
- Test: `server/test/tenancyModels.test.js` (DB `vip90_test_tenancy_models`)

**Interfaces:**
- Consumes: nothing.
- Produces: default exports `Tenant` (collection `tenants`) and `Domain` (collection `domains`), both plain `mongoose.model(...)`. **Do not apply `tenantScoped` to either.**

`Tenant` schema (§4.3.2), `{ timestamps: true }`:
- `key`: String, required, unique, immutable, trimmed, lower-cased, must match `/^[a-z0-9][a-z0-9-]{1,39}$/`.
- `name`: String, required, trimmed.
- `legalEntity`: `{ name: String, registrationNo: String, address: String }`, each defaulting to `null`.
- `status`: enum `provisioning|active|suspended|closed`, default `provisioning`.
- `isDefault`: Boolean, default `false`. Index `{isDefault:1}`, unique, `partialFilterExpression: {isDefault: true}`.
- `ownership`: enum `direct|partner`, default `direct`.
- `providerOperatorId`: ObjectId, **no default** (so `sparse` works). Index unique + sparse.
- `entitlements`: `{ modules: [String], limits: Mixed }`, defaulting to `{ modules: [], limits: {} }`.
- `timezone`, `defaultLocale`, `baseCurrency`: String, default `null`.
- `jurisdictionIds`: [ObjectId ref `Jurisdiction`].
- `createdBy`: ObjectId, default `null` (no `ref` yet: `StaffAccount` arrives in İP-3).
- `createdVia`: enum `platform|partner`, default `platform`.
- `closedAt`: Date, default `null`.

`Domain` schema (§4.3.3), `{ timestamps: true }`:
- `host`: String, required, unique, trimmed, lower-cased, must match `/^[a-z0-9.-]+(:\d{1,5})?$/`.
- `tenantId`: ObjectId ref `Tenant`, required, indexed.
- `brandId`: ObjectId ref `Brand`, default `null`.
- `isPrimary`: Boolean, default `false`.
- `purpose`: enum `player|admin|api`, default `player`.
- `verifiedAt`: Date, default `null`.
- `tls`: `{ status: enum none|pending|active|failed, default 'none'; provider: String, default null }`.

- [ ] **Step 1: Write the failing tests.** `before`: connect, then `await Tenant.init(); await Domain.init();`. `after`: drop the DB and disconnect.

```js
it('creates a tenant with defaults', async () => {
  const t = await Tenant.create({ key: 'acme', name: 'Acme' });
  assert.equal(t.status, 'provisioning'); assert.equal(t.isDefault, false);
  assert.equal(t.ownership, 'direct'); assert.equal(t.providerOperatorId, undefined);
});
it('key is unique, lower-cased and validated', async () => {
  await Tenant.create({ key: 'Beta', name: 'B' });
  assert.equal((await Tenant.findOne({ key: 'beta' })).key, 'beta');
  await assert.rejects(Tenant.create({ key: 'beta', name: 'B2' }), /E11000/);
  await assert.rejects(Tenant.create({ key: '-bad', name: 'x' }), /validation/i);
});
it('key is immutable', async () => {
  const t = await Tenant.create({ key: 'gamma', name: 'G' });
  t.key = 'delta'; await t.save();
  assert.equal((await Tenant.findById(t._id)).key, 'gamma');
});
it('only one isDefault tenant', async () => {
  await Tenant.create({ key: 'd1', name: 'D1', isDefault: true });
  await assert.rejects(Tenant.create({ key: 'd2', name: 'D2', isDefault: true }), /E11000/);
  await Tenant.create({ key: 'n1', name: 'N1' }); await Tenant.create({ key: 'n2', name: 'N2' }); // many non-default ok
});
it('providerOperatorId unique but optional', async () => {
  const op = new mongoose.Types.ObjectId();
  await Tenant.create({ key: 'p1', name: 'P1', providerOperatorId: op });
  await assert.rejects(Tenant.create({ key: 'p2', name: 'P2', providerOperatorId: op }), /E11000/);
});
it('status enum enforced', async () => {
  await assert.rejects(Tenant.create({ key: 's1', name: 'S', status: 'live' }), /validation/i);
});
it('domain host normalised and globally unique', async () => {
  const [a, b] = await Tenant.create([{ key: 'ha', name: 'A' }, { key: 'hb', name: 'B' }]);
  const d = await Domain.create({ host: ' Shop.Example.COM ', tenantId: a._id });
  assert.equal(d.host, 'shop.example.com'); assert.equal(d.purpose, 'player'); assert.equal(d.tls.status, 'none');
  await assert.rejects(Domain.create({ host: 'shop.example.com', tenantId: b._id }), /E11000/);
});
it('domain host rejects scheme, path and spaces; keeps port', async () => {
  const t = await Tenant.create({ key: 'hc', name: 'C' });
  for (const host of ['https://x.example', 'x.example/path', 'a b.example']) {
    await assert.rejects(Domain.create({ host, tenantId: t._id }), /validation/i);
  }
  assert.equal((await Domain.create({ host: 'localhost:5173', tenantId: t._id })).host, 'localhost:5173');
});
it('domain requires tenantId', async () => {
  await assert.rejects(Domain.create({ host: 'orphan.example' }), /validation/i);
});
```

- [ ] **Step 2: Run to verify failure:** `node --test server/test/tenancyModels.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement both models** as specified.
- [ ] **Step 4: Run:** `node --test server/test/tenancyModels.test.js`. Expected: `# fail 0`.
- [ ] **Step 5: Commit**

```bash
git add server/src/models/Tenant.js server/src/models/Domain.js server/test/tenancyModels.test.js
git commit -m "feat(tenancy): Tenant and Domain platform models"
```

---

### Task 4: `tenantScoped` plugin (queries, writes, bulkWrite)

**Files:**
- Create: `server/src/tenancy/tenantScoped.js`
- Test: `server/test/tenantScoped.test.js` (DB `vip90_test_tenancy_plugin`)

**Interfaces:**
- Consumes: `getTenancyEnforcement()` (Task 1); `tenantContext`, `runWithTenant`, `runAsPlatform` (Task 2); `TenantScopeError` (Task 2).
- Produces:
  - `tenantScoped(schema) -> void`: a Mongoose plugin. It adds `tenantId: { type: ObjectId, ref: 'Tenant', index: true }` when the schema has no `tenantId` path, and marks the schema with `schema.$tenantScoped = true`.
  - `SCOPED_QUERY_OPS`: frozen `['find','findOne','countDocuments','distinct','updateOne','updateMany','replaceOne','deleteOne','deleteMany','findOneAndUpdate','findOneAndReplace','findOneAndDelete']`.
  - `registerTenantCollection(name: string) -> void`, `isTenantCollection(name: string) -> boolean`.
  - `getScopeViolationStats() -> { count: number, lastSample: { model, op, reason, stack } | null }`, `resetScopeViolationStats() -> void`.
  - Internal helper `reportViolation({ model, op, reason })`, exported for Task 5: in `log` mode it increments the counter, stores the sample and calls `console.warn('[tenancy] unscoped <op> on <model>')`; in `enforce` mode it throws `TenantScopeError`.

Behaviour. The enforcement mode is read on every operation via `getTenancyEnforcement()`:

| Situation | `off` | `log` | `enforce` |
|---|---|---|---|
| any operation | **no-op** (nothing injected, nothing checked) | see below | see below |
| ctx `mode:'platform'` | — | pass through | pass through |
| ctx `mode:'tenant'`, query | — | add `tenantId: ctx.tenantId` to the filter; if the filter already has a different `tenantId` → throw `TenantScopeError(reason:'cross_tenant')` | same |
| no ctx, query filter has `tenantId` | — | pass | pass |
| no ctx, query filter lacks `tenantId` | — | violation (warn + count) | throw `TenantScopeError(reason:'unscoped')` |
| `save` of a new doc / `insertMany` in tenant ctx | — | stamp `tenantId` if empty; if it differs → `cross_tenant` | same |
| `save`/`insertMany` with no ctx and no `tenantId` | — | violation | throw |
| `bulkWrite`, `estimatedDocumentCount` outside platform ctx | — | violation | throw |

Compare ids with `String(a) === String(b)`, so a hex string and an equal ObjectId are not a mismatch. Register the query hooks with `schema.pre(SCOPED_QUERY_OPS, { document: false, query: true }, fn)` and read/merge the filter with `this.getFilter()` / `this.setQuery()`. Register `insertMany` and `bulkWrite` with the `function (next, docsOrOps)` signature and call `next()` / `next(err)`. Saves of existing documents are not checked (İP-2 makes `tenantId` immutable).

- [ ] **Step 1: Write the failing tests.** Define a test model in the test file: `const Widget = mongoose.model('TenancyPluginWidget', new mongoose.Schema({ name: String }).plugin(tenantScoped))`. Also save and restore `process.env.TENANCY_ENFORCEMENT` per test via `withEnforcement(mode, fn)`. Seed in `beforeEach` under `runAsPlatform`: two docs for `T1`, one for `T2`.

```js
it('adds a tenantId path when missing', () => assert.ok(Widget.schema.path('tenantId')));
it('off: unscoped find returns everything and nothing is stamped', () => withEnforcement('off', async () => {
  assert.equal((await Widget.find()).length, 3);
  const d = await runWithTenant(T1, () => Widget.create({ name: 'n' }));
  assert.equal(d.tenantId, undefined);
}));
it('log: tenant ctx find is scoped', () => withEnforcement('log', async () => {
  assert.equal((await runWithTenant(T1, () => Widget.find())).length, 2);
  assert.equal(await runWithTenant(T2, () => Widget.countDocuments()), 1);
}));
it('log: findById of another tenant doc returns null', () => withEnforcement('log', async () => {
  const other = await runAsPlatform('t', () => Widget.findOne({ tenantId: T2 }));
  assert.equal(await runWithTenant(T1, () => Widget.findById(other._id)), null);
}));
it('log: updateMany/deleteMany only touch own tenant', () => withEnforcement('log', async () => {
  await runWithTenant(T1, () => Widget.updateMany({}, { $set: { name: 'x' } }));
  assert.equal(await runAsPlatform('t', () => Widget.countDocuments({ name: 'x' })), 2);
  await runWithTenant(T2, () => Widget.deleteMany({}));
  assert.equal(await runAsPlatform('t', () => Widget.countDocuments()), 2);
}));
it('log: unscoped query outside ctx warns and counts', () => withEnforcement('log', async () => {
  resetScopeViolationStats();
  assert.equal((await Widget.find()).length, 3);
  assert.equal(getScopeViolationStats().count, 1);
  assert.equal(getScopeViolationStats().lastSample.op, 'find');
}));
it('enforce: unscoped find throws TenantScopeError', () => withEnforcement('enforce', async () => {
  await assert.rejects(Widget.find(), (e) => e instanceof TenantScopeError && e.reason === 'unscoped');
}));
it('enforce: explicit tenantId filter outside ctx is allowed', () => withEnforcement('enforce', async () => {
  assert.equal((await Widget.find({ tenantId: T1 })).length, 2);
}));
it('enforce: cross-tenant filter in ctx throws, same id as string does not', () => withEnforcement('enforce', async () => {
  await assert.rejects(runWithTenant(T1, () => Widget.find({ tenantId: T2 })), (e) => e.reason === 'cross_tenant');
  assert.equal((await runWithTenant(T1, () => Widget.find({ tenantId: String(T1) }))).length, 2);
}));
it('enforce: platform ctx bypasses', () => withEnforcement('enforce', async () => {
  assert.equal((await runAsPlatform('t', () => Widget.find())).length, 3);
}));
it('enforce: create stamps tenantId; mismatching tenantId throws', () => withEnforcement('enforce', async () => {
  const d = await runWithTenant(T1, () => Widget.create({ name: 'new' }));
  assert.equal(String(d.tenantId), String(T1));
  await assert.rejects(runWithTenant(T1, () => Widget.create({ name: 'bad', tenantId: T2 })), (e) => e.reason === 'cross_tenant');
  await assert.rejects(Widget.create({ name: 'orphan' }), TenantScopeError);
}));
it('enforce: insertMany stamps every doc', () => withEnforcement('enforce', async () => {
  const docs = await runWithTenant(T2, () => Widget.insertMany([{ name: 'a' }, { name: 'b' }]));
  assert.ok(docs.every((d) => String(d.tenantId) === String(T2)));
}));
it('enforce: bulkWrite only inside runAsPlatform', () => withEnforcement('enforce', async () => {
  const ops = [{ updateOne: { filter: { name: 'zzz' }, update: { $set: { name: 'y' } } } }];
  await assert.rejects(runWithTenant(T1, () => Widget.bulkWrite(ops)), TenantScopeError);
  await runAsPlatform('t', () => Widget.bulkWrite(ops));
}));
it('tenant collection registry', () => {
  registerTenantCollection('tenancypluginwidgets');
  assert.equal(isTenantCollection('tenancypluginwidgets'), true);
  assert.equal(isTenantCollection('events'), false);
});
```

- [ ] **Step 2: Run to verify failure:** `node --test server/test/tenantScoped.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `server/src/tenancy/tenantScoped.js`** per the table.
- [ ] **Step 4: Run:** `node --test server/test/tenantScoped.test.js`. Expected: `# fail 0`.
- [ ] **Step 5: Commit**

```bash
git add server/src/tenancy/tenantScoped.js server/test/tenantScoped.test.js
git commit -m "feat(tenancy): tenantScoped plugin with off/log/enforce modes"
```

---

### Task 5: Aggregate scoping and `tenantLookup`

**Files:**
- Modify: `server/src/tenancy/tenantScoped.js`
- Test: `server/test/tenantScopedAggregate.test.js` (DB `vip90_test_tenancy_aggregate`)

**Interfaces:**
- Consumes: `tenantScoped`, `registerTenantCollection`, `isTenantCollection`, the violation reporter (Task 4); context (Task 2).
- Produces: `tenantLookup({ from: string, localField: string, foreignField: string, as: string, pipeline?: object[] }) -> { $lookup }`, which returns:

```js
{ $lookup: { from, as,
  let: { __lk: `$${localField}`, __tid: '$tenantId' },
  pipeline: [{ $match: { $expr: { $and: [{ $eq: [`$${foreignField}`, '$$__lk'] }, { $eq: ['$tenantId', '$$__tid'] }] } } }, ...pipeline] } }
```

Aggregate pre-hook (`schema.pre('aggregate', fn)`, using `this.pipeline()`), skipped entirely in `off` and in platform ctx:
- Tenant ctx: insert `{ $match: { tenantId: ctx.tenantId } }` (an ObjectId, because aggregate does not cast) at index 0. If stage 0 is `$geoNear`, `$search`, `$searchMeta` or `$vectorSearch`, insert at index 1 instead.
- No ctx: a violation unless stage 0 is a `$match` that has a `tenantId` key.
- Any non-platform ctx, or no ctx: a top-level `$lookup` whose `from` passes `isTenantCollection` and whose `let.__tid !== '$tenantId'` is a violation. A top-level `$unionWith` into a tenant collection is always a violation outside platform ctx.

- [ ] **Step 1: Write the failing tests.** Use two test models: `AggOrder` (plugin; `{ name, itemKey }`) and `AggItem` (plugin; `{ key, label }`), and register both collection names. Seed T1 and T2 rows with the **same** `itemKey`/`key` values so a leaking `$lookup` would show.

```js
it('tenant ctx aggregate sees only own rows', () => withEnforcement('enforce', async () => {
  const rows = await runWithTenant(T1, () => AggOrder.aggregate([{ $group: { _id: null, n: { $sum: 1 } } }]));
  assert.equal(rows[0].n, 2);
}));
it('hex string tenant in ctx still matches (ObjectId injected)', () => withEnforcement('enforce', async () => {
  const rows = await runWithTenant(String(T1), () => AggOrder.aggregate([{ $match: {} }]));
  assert.equal(rows.length, 2);
}));
it('no ctx without leading tenantId $match throws in enforce', () => withEnforcement('enforce', async () => {
  await assert.rejects(AggOrder.aggregate([{ $match: {} }]), TenantScopeError);
  assert.equal((await AggOrder.aggregate([{ $match: { tenantId: T1 } }])).length, 2);
}));
it('raw $lookup into tenant collection throws', () => withEnforcement('enforce', async () => {
  const raw = { $lookup: { from: 'aggitems', localField: 'itemKey', foreignField: 'key', as: 'item' } };
  await assert.rejects(runWithTenant(T1, () => AggOrder.aggregate([raw])), TenantScopeError);
}));
it('tenantLookup joins only same-tenant rows', () => withEnforcement('enforce', async () => {
  const rows = await runWithTenant(T1, () => AggOrder.aggregate([
    tenantLookup({ from: 'aggitems', localField: 'itemKey', foreignField: 'key', as: 'item' })]));
  assert.ok(rows.every((r) => r.item.length === 1 && String(r.item[0].tenantId) === String(T1)));
}));
it('$lookup into a platform collection is allowed', () => withEnforcement('enforce', async () => {
  await runWithTenant(T1, () => AggOrder.aggregate([{ $lookup: { from: 'tenants', localField: 'tenantId', foreignField: '_id', as: 't' } }]));
}));
it('platform ctx aggregate is untouched', () => withEnforcement('enforce', async () => {
  assert.equal((await runAsPlatform('t', () => AggOrder.aggregate([{ $match: {} }]))).length, 4);
}));
it('log mode counts unscoped aggregate', () => withEnforcement('log', async () => {
  resetScopeViolationStats(); await AggOrder.aggregate([{ $match: {} }]);
  assert.equal(getScopeViolationStats().lastSample.op, 'aggregate');
}));
it('off mode does not inject', () => withEnforcement('off', async () => {
  assert.equal((await runWithTenant(T1, () => AggOrder.aggregate([{ $match: {} }]))).length, 4);
}));
```

- [ ] **Step 2: Run to verify failure:** `node --test server/test/tenantScopedAggregate.test.js`. Expected: FAIL, `tenantLookup` is not exported.
- [ ] **Step 3: Implement** the aggregate hook and `tenantLookup` in `tenantScoped.js`.
- [ ] **Step 4: Run:** `node --test server/test/tenantScopedAggregate.test.js server/test/tenantScoped.test.js`. Expected: `# fail 0`.
- [ ] **Step 5: Commit**

```bash
git add server/src/tenancy/tenantScoped.js server/test/tenantScopedAggregate.test.js
git commit -m "feat(tenancy): scope aggregate pipelines and add tenantLookup"
```

---

### Task 6: Tenant model registry and connection routing

**Files:**
- Create: `server/src/tenancy/models.js`
- Test: `server/test/tenantModelRouting.test.js` (DBs `vip90_test_tenancy_routing_a`, `vip90_test_tenancy_routing_b`)

**Interfaces:**
- Consumes: `tenantContext`, `runWithTenant`, `setConnectionResolver` (Task 2); `tenantScoped`, `registerTenantCollection` (Task 4).
- Produces:
  - `defineTenantModel(name: string, schema: mongoose.Schema) -> mongoose.Model`: applies `tenantScoped` unless `schema.$tenantScoped` is already set, compiles on `mongoose.connection` via `mongoose.model(name, schema)`, calls `registerTenantCollection(model.collection.collectionName)`, and stores `{ name, schema }`. Calling it twice with the same name throws `Error('Tenant model already defined: <name>')`.
  - `getTenantModel(name: string) -> mongoose.Model`: picks `conn = tenantContext.get()?.connection ?? mongoose.connection` and returns `conn.models[name] ?? conn.model(name, schema)`, so each model compiles once per connection. An unknown name throws `Error('Unknown tenant model: <name>')`.
  - `listTenantModelNames() -> string[]`.

- [ ] **Step 1: Write the failing tests.** `before`: `mongoose.connect(A)`, `connB = await mongoose.createConnection(B).asPromise()`. `defineTenantModel('TenancyRoutingWidget', new Schema({ name: String }))`. Set `TENANCY_ENFORCEMENT=log` for the file and restore it in `after`.

```js
it('defineTenantModel returns the default-connection model with the plugin', () => {
  assert.equal(Widget.db, mongoose.connection);
  assert.ok(Widget.schema.path('tenantId'));
  assert.ok(isTenantCollection(Widget.collection.collectionName));
  assert.deepEqual(listTenantModelNames(), ['TenancyRoutingWidget']);
});
it('duplicate definition throws', () => {
  assert.throws(() => defineTenantModel('TenancyRoutingWidget', new Schema({})), /already defined/);
});
it('unknown model throws', () => assert.throws(() => getTenantModel('Nope'), /Unknown tenant model/));
it('outside ctx and for default-routed tenants, getTenantModel is the default model', () => {
  assert.equal(getTenantModel('TenancyRoutingWidget'), Widget);
  runWithTenant(T1, () => assert.equal(getTenantModel('TenancyRoutingWidget'), Widget));
});
it('a tenant routed to a second connection writes there without code changes', async () => {
  setConnectionResolver((id) => (String(id) === String(T2) ? connB : mongoose.connection));
  try {
    const doc = await runWithTenant(T2, () => getTenantModel('TenancyRoutingWidget').create({ name: 'b' }));
    await runWithTenant(T1, () => getTenantModel('TenancyRoutingWidget').create({ name: 'a' }));
    assert.equal(String(doc.tenantId), String(T2));
    assert.equal(await connB.db.collection('tenancyroutingwidgets').countDocuments(), 1);
    assert.equal(await mongoose.connection.db.collection('tenancyroutingwidgets').countDocuments(), 1);
    const m1 = runWithTenant(T2, () => getTenantModel('TenancyRoutingWidget'));
    const m2 = runWithTenant(T2, () => getTenantModel('TenancyRoutingWidget'));
    assert.equal(m1, m2);
    assert.equal(m1.db, connB);
  } finally { setConnectionResolver(null); }
});
```

- [ ] **Step 2: Run to verify failure:** `node --test server/test/tenantModelRouting.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `server/src/tenancy/models.js`.**
- [ ] **Step 4: Run:** `node --test server/test/tenantModelRouting.test.js`. Expected: `# fail 0`.
- [ ] **Step 5: Commit**

```bash
git add server/src/tenancy/models.js server/test/tenantModelRouting.test.js
git commit -m "feat(tenancy): defineTenantModel and per-connection model routing"
```

---

### Task 7: `forEachTenant`

**Files:**
- Create: `server/src/tenancy/forEachTenant.js`
- Test: `server/test/forEachTenant.test.js` (DB `vip90_test_tenancy_foreach`)

**Interfaces:**
- Consumes: `runWithTenant`, `tenantContext`, `getCurrentTenantId` (Task 2); `Tenant` (Task 3).
- Produces: `forEachTenant(fn: (tenant: leanTenant) => any, { status = 'active' }: { status?: string | string[] } = {}) -> Promise<Array<{ tenantId: ObjectId, result?: any, error?: Error }>>`. It lists tenants with `Tenant.find({ status: { $in: [].concat(status) } }).sort({ _id: 1 }).lean()` and runs each `fn` **sequentially** inside `runWithTenant(tenant._id, ...)`. A thrown or rejected `fn` is caught, logged with `console.error('[tenancy] forEachTenant <key>: <message>')` and recorded as `error`; the loop continues.

- [ ] **Step 1: Write the failing tests.** Seed tenants `a` (active), `b` (active), `s` (suspended).

```js
it('runs fn once per active tenant, in _id order, inside its context', async () => {
  const seen = [];
  const out = await forEachTenant(async (t) => { seen.push([t.key, String(getCurrentTenantId())]); return t.key; });
  assert.deepEqual(seen.map((s) => s[0]), ['a', 'b']);
  assert.ok(seen.every(([, id], i) => id === String(out[i].tenantId)));
  assert.deepEqual(out.map((r) => r.result), ['a', 'b']);
});
it('status filter accepts an array', async () => {
  const out = await forEachTenant((t) => t.key, { status: ['active', 'suspended'] });
  assert.deepEqual(out.map((r) => r.result).sort(), ['a', 'b', 's']);
});
it('a failing tenant does not stop the rest', async () => {
  const out = await forEachTenant((t) => { if (t.key === 'a') throw new Error('boom'); return 'ok'; });
  assert.equal(out[0].error.message, 'boom'); assert.equal(out[1].result, 'ok');
});
it('caller context is untouched afterwards', async () => {
  await forEachTenant(() => {});
  assert.equal(tenantContext.get(), undefined);
});
it('runs sequentially', async () => {
  let active = 0, max = 0;
  await forEachTenant(async () => { active++; max = Math.max(max, active); await new Promise((r) => setTimeout(r, 5)); active--; });
  assert.equal(max, 1);
});
```

- [ ] **Step 2: Run to verify failure:** `node --test server/test/forEachTenant.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run:** `node --test server/test/forEachTenant.test.js`. Expected: `# fail 0`.
- [ ] **Step 5: Commit**

```bash
git add server/src/tenancy/forEachTenant.js server/test/forEachTenant.test.js
git commit -m "feat(tenancy): forEachTenant runs jobs per tenant in its own context"
```

---

### Task 8: Provisioning hook and credential schema registry

**Files:**
- Create: `server/src/tenancy/provisioning.js`
- Test: `server/test/tenantProvisioning.test.js` (pure, no DB)

**Interfaces:**
- Consumes: `runWithTenant`, `getCurrentTenantId` (Task 2).
- Produces:
  - `registerTenantProvisioningHook(fn: (tenant) => Promise<void>|void, { name }: { name?: string } = {}) -> () => void`: returns an unregister function and throws `TypeError` when `fn` is not a function.
  - `runTenantProvisioningHooks(tenant: { _id }) -> Promise<Array<{ name, ok: true }>>`: runs the hooks sequentially in registration order inside `runWithTenant(tenant._id)`. The first error is rethrown wrapped as `Error('Provisioning hook "<name>" failed: <message>')` with `cause`. Provisioning must fail loudly; the İP-9a caller retries idempotently.
  - `registerTenantCredentialSchema(moduleId: string, schema: { fields: Array<{ key: string, label: string, secret?: boolean, required?: boolean }>, validate?: (values) => Promise<void>|void }) -> void`: throws on a duplicate `moduleId`, an empty `fields` array, or duplicate field keys.
  - `getTenantCredentialSchema(moduleId) -> schema|null`, `listTenantCredentialSchemas() -> Array<{ moduleId, fields }>`.
  - `_resetTenancyRegistriesForTests() -> void`.

No core code calls `runTenantProvisioningHooks` in İP-1 (the provisioning flow is İP-9a). Premium add-ons register at import time.

- [ ] **Step 1: Write the failing tests:**

```js
it('runs hooks in order inside the tenant context', async () => {
  const calls = [];
  registerTenantProvisioningHook((t) => calls.push(['a', String(getCurrentTenantId())]), { name: 'a' });
  registerTenantProvisioningHook(async () => calls.push(['b']), { name: 'b' });
  const out = await runTenantProvisioningHooks({ _id: T1 });
  assert.deepEqual(calls, [['a', String(T1)], ['b']]);
  assert.deepEqual(out, [{ name: 'a', ok: true }, { name: 'b', ok: true }]);
});
it('unregister removes the hook', async () => {
  const off = registerTenantProvisioningHook(() => { throw new Error('x'); }, { name: 'x' });
  off();
  assert.deepEqual(await runTenantProvisioningHooks({ _id: T1 }), []);
});
it('a failing hook stops provisioning with a named error', async () => {
  let ranSecond = false;
  registerTenantProvisioningHook(() => { throw new Error('no operator'); }, { name: 'inhouse' });
  registerTenantProvisioningHook(() => { ranSecond = true; }, { name: 'later' });
  await assert.rejects(runTenantProvisioningHooks({ _id: T1 }), /Provisioning hook "inhouse" failed: no operator/);
  assert.equal(ranSecond, false);
});
it('rejects non-function hooks', () => assert.throws(() => registerTenantProvisioningHook(1), TypeError));
it('credential schemas register once per module', () => {
  registerTenantCredentialSchema('igames', { fields: [{ key: 'agentCode', label: 'Agent', required: true }, { key: 'token', label: 'Token', secret: true }] });
  assert.equal(getTenantCredentialSchema('igames').fields.length, 2);
  assert.equal(getTenantCredentialSchema('none'), null);
  assert.throws(() => registerTenantCredentialSchema('igames', { fields: [{ key: 'x', label: 'x' }] }), /already registered/);
  assert.throws(() => registerTenantCredentialSchema('m2', { fields: [] }), /fields/);
  assert.throws(() => registerTenantCredentialSchema('m3', { fields: [{ key: 'a', label: 'a' }, { key: 'a', label: 'b' }] }), /duplicate/i);
  assert.deepEqual(listTenantCredentialSchemas().map((s) => s.moduleId), ['igames']);
});
// beforeEach: _resetTenancyRegistriesForTests()
```

- [ ] **Step 2: Run to verify failure:** `node --test server/test/tenantProvisioning.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement.** A hook with no `name` gets `fn.name || 'hook#<n>'`.
- [ ] **Step 4: Run:** `node --test server/test/tenantProvisioning.test.js`. Expected: `# fail 0`.
- [ ] **Step 5: Commit**

```bash
git add server/src/tenancy/provisioning.js server/test/tenantProvisioning.test.js
git commit -m "feat(tenancy): provisioning hook and credential schema registry for add-ons"
```

---

### Task 9: Default tenant boot migration (G1)

**Files:**
- Create: `server/src/tenancy/defaultTenant.js`, `server/migrations/0004_tenancy_default_tenant.js`
- Test: `server/test/defaultTenant.test.js` (DB `vip90_test_tenancy_default`)

**Interfaces:**
- Consumes: `getTenancyMode` (Task 1); `Tenant`, `Domain` (Task 3); existing `Brand` (`server/src/models/Brand.js`), `Migration` (`server/src/models/Migration.js`, `{ name unique, version required }`), `errorLogger` (`server/src/services/errorLogger.js`).
- Produces:
  - `DEFAULT_TENANT_KEY = 'default'`; `DEFAULT_TENANT_MIGRATION = { name: 'tenancy-001-default-tenant', version: '1.1.0' }` (frozen).
  - `hostsFromClientUrl(clientUrl: string|undefined) -> string[]`: splits on commas, trims, skips empty and `*`, parses with `new URL()` (an invalid entry is skipped with `console.warn`), returns `url.host.toLowerCase()` (a non-default port is kept), deduplicated in order.
  - `ensureDefaultTenant({ env = process.env, findProviderOperatorId = defaultFindProviderOperatorId } = {}) -> Promise<{ tenant, created: boolean, domainsCreated: number, migrationRecorded: boolean }>`.
  - `runTenancyBoot({ env = process.env, ensure = ensureDefaultTenant, reportError = (m) => errorLogger.critical('tenancy_boot', m) } = {}) -> Promise<{ mode, defaultTenant: tenant|null, error: string|null }>`. It never throws. In `multi` it does nothing (`defaultTenant: null`). On failure it calls `reportError(message)` once and returns `error`. A failed G1 must not stop the server (§6.3: unattended upgrades, `off` behaviour).
  - Not exported: `defaultFindProviderOperatorId()` returns `(await mongoose.models.Operator?.findOne({ operatorKey: 'vip90' }).select('_id').lean())?._id ?? null`. It looks the model up by name and **never imports premium**.

`ensureDefaultTenant` algorithm:
1. `tenant = Tenant.findOne({ isDefault: true })`. If none, upsert `Tenant.findOneAndUpdate({ key: 'default' }, { $setOnInsert: { key: 'default', name: 'Default', isDefault: true, status: 'active', ownership: 'direct', createdVia: 'platform' } }, { upsert: true, new: true, includeResultMetadata: true })`, and set `created` from `lastErrorObject.upserted`. On E11000 (a concurrent boot), re-read once with `findOne({ isDefault: true })`.
2. If `tenant.providerOperatorId` is absent and `findProviderOperatorId()` returns an id, run `updateOne({ _id, providerOperatorId: { $exists: false } }, { $set: { providerOperatorId: id } })`. Never overwrite an existing link.
3. If no `Migration{name}` exists, back-fill the domains. Hosts in order: `hostsFromClientUrl(env.CLIENT_URL)`, then the hosts of `Brand.findOne({ isDefault: true })`, with the brand's `isPrimary` domain first (lower-cased, trimmed, invalid skipped). Deduplicate. The first host gets `isPrimary: true`. Upsert each with `Domain.updateOne({ host }, { $setOnInsert: { host, tenantId, brandId: brand?._id ?? null, isPrimary, purpose: 'player' } }, { upsert: true })` and count `upsertedCount`. A host already owned by another tenant is left alone. Then `Migration.updateOne({ name }, { $setOnInsert: { name, version } }, { upsert: true })`.
4. Return the re-read tenant.

`server/migrations/0004_tenancy_default_tenant.js` exports `{ name: 'tenancy-001-default-tenant', version: '1.1.0', description: 'Default tenant for single-operator installs (G1)', async up() { if (getTenancyMode() === 'multi') return; await ensureDefaultTenant(); } }`. The CLI (`server/scripts/migrate.js`), the healthcheck and the boot path then agree on one record name.

- [ ] **Step 1: Write the failing tests.** `beforeEach`: clear `tenants`, `domains`, `brands`, `migrations`; `await Tenant.init(); await Domain.init()`.

```js
it('hostsFromClientUrl normalises, dedupes and skips junk', () => {
  assert.deepEqual(hostsFromClientUrl(' https://Site.Example/, https://site.example ,*,http://localhost:5173,not a url'),
    ['site.example', 'localhost:5173']);
  assert.deepEqual(hostsFromClientUrl(undefined), []);
});
it('creates exactly one default tenant and records the migration', async () => {
  const r = await ensureDefaultTenant({ env: {}, findProviderOperatorId: async () => null });
  assert.equal(r.created, true);
  assert.equal(r.tenant.key, 'default'); assert.equal(r.tenant.isDefault, true); assert.equal(r.tenant.status, 'active');
  assert.equal(r.tenant.providerOperatorId, undefined);
  assert.equal(await Migration.countDocuments({ name: 'tenancy-001-default-tenant' }), 1);
});
it('is idempotent', async () => {
  await ensureDefaultTenant({ env: {} });
  const r = await ensureDefaultTenant({ env: { CLIENT_URL: 'https://late.example' } });
  assert.equal(r.created, false); assert.equal(r.domainsCreated, 0);
  assert.equal(await Tenant.countDocuments({ isDefault: true }), 1);
  assert.equal(await Domain.countDocuments({ host: 'late.example' }), 0); // domain back-fill runs once
});
it('concurrent boots leave one default tenant', async () => {
  await Promise.all([1, 2, 3].map(() => ensureDefaultTenant({ env: {} })));
  assert.equal(await Tenant.countDocuments(), 1);
});
it('links the provider operator once and never overwrites', async () => {
  const op1 = new mongoose.Types.ObjectId(), op2 = new mongoose.Types.ObjectId();
  await ensureDefaultTenant({ env: {}, findProviderOperatorId: async () => op1 });
  const r = await ensureDefaultTenant({ env: {}, findProviderOperatorId: async () => op2 });
  assert.equal(String(r.tenant.providerOperatorId), String(op1));
});
it('creates domains from CLIENT_URL and the default brand', async () => {
  const brand = await Brand.create({ name: 'B', slug: 'b', isDefault: true,
    domains: [{ domain: 'other.example' }, { domain: 'Brand.Example', isPrimary: true }] });
  const r = await ensureDefaultTenant({ env: { CLIENT_URL: 'https://site.example,https://www.site.example' } });
  const ds = await Domain.find().sort({ _id: 1 }).lean();
  assert.deepEqual(ds.map((d) => d.host), ['site.example', 'www.site.example', 'brand.example', 'other.example']);
  assert.deepEqual(ds.filter((d) => d.isPrimary).map((d) => d.host), ['site.example']);
  assert.ok(ds.every((d) => String(d.tenantId) === String(r.tenant._id) && String(d.brandId) === String(brand._id)));
  assert.equal(r.domainsCreated, 4);
});
it('leaves a host owned by another tenant alone', async () => {
  const other = await Tenant.create({ key: 'other', name: 'O' });
  await Domain.create({ host: 'site.example', tenantId: other._id });
  await ensureDefaultTenant({ env: { CLIENT_URL: 'https://site.example' } });
  assert.equal(String((await Domain.findOne({ host: 'site.example' })).tenantId), String(other._id));
});
it('runTenancyBoot skips multi mode', async () => {
  const r = await runTenancyBoot({ env: { TENANCY_MODE: 'multi' } });
  assert.equal(r.mode, 'multi'); assert.equal(r.defaultTenant, null);
  assert.equal(await Tenant.countDocuments(), 0);
});
it('runTenancyBoot never throws and reports once', async () => {
  const reported = [];
  const r = await runTenancyBoot({ env: {}, ensure: async () => { throw new Error('disk full'); }, reportError: (m) => reported.push(m) });
  assert.equal(r.error, 'disk full'); assert.deepEqual(reported, ['disk full']);
});
it('the migration file is discovered under the shared name', async () => {
  const found = await discoverMigrations(); // from server/migrations/index.js
  assert.ok(found.some((m) => m.name === 'tenancy-001-default-tenant' && m.version === '1.1.0'));
});
```

- [ ] **Step 2: Run to verify failure:** `node --test server/test/defaultTenant.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement both files.**
- [ ] **Step 4: Run:** `node --test server/test/defaultTenant.test.js server/test/migrationDiscovery.test.js`. Expected: `# fail 0`.
- [ ] **Step 5: Commit**

```bash
git add server/src/tenancy/defaultTenant.js server/migrations/0004_tenancy_default_tenant.js server/test/defaultTenant.test.js
git commit -m "feat(tenancy): default tenant boot migration (G1)"
```

---

### Task 10: Server wiring: startup checks, tenancy boot, demo job gating

**Files:**
- Create: `server/src/jobs/demoJobs.js`
- Modify: `server/src/server.js`. Imports are at the top; the console patch is lines 4-10; the demo-data live restore block is lines 211-219; `startBotScheduler()` is around line 245 and `startFakeWinnersScheduler()` around line 248.
- Test: `server/test/demoJobs.test.js` (pure), `server/test/tenancyStartup.test.js` (spawns the server)

**Interfaces:**
- Consumes: `assertTenancyStartup`, `getTenancyMode` (Task 1); `getDemoFlags` (Task 1); `runTenancyBoot` (Task 9); existing `startBotScheduler` (`server/src/jobs/botScheduler.js`), `startFakeWinnersScheduler` (`server/src/services/fakeWinners.js`), `startDemoDataLiveJob` (`server/src/jobs/demoDataLiveSimulation.js`), `Setting`.
- Produces: `startDemoJobs({ env = process.env, starters = DEFAULT_STARTERS } = {}) -> Promise<string[]>`, where `starters = { bots: () => void, fakeWinners: () => void|Promise, data: () => Promise<void> }`. It starts exactly the starters whose effective flag (`getDemoFlags(env)`) is `true`, in the order `bots`, `fakeWinners`, `data`, and returns their names. `DEFAULT_STARTERS.data` is the existing `demoData.live.config` restore block moved out of `server.js` unchanged.

- [ ] **Step 1: Write the failing tests.**

`server/test/demoJobs.test.js`:

```js
const fake = () => { const calls = []; return { calls, starters: {
  bots: () => calls.push('bots'), fakeWinners: () => calls.push('fakeWinners'), data: async () => calls.push('data') } }; };
it('starts nothing by default', async () => {
  const f = fake(); assert.deepEqual(await startDemoJobs({ env: {}, starters: f.starters }), []); assert.deepEqual(f.calls, []);
});
it('starts only the enabled jobs', async () => {
  const f = fake();
  assert.deepEqual(await startDemoJobs({ env: { DEMO_FAKE_WINNERS: 'true', DEMO_DATA: 'true' }, starters: f.starters }), ['fakeWinners', 'data']);
});
it('starts nothing in multi mode even when flags are set', async () => {
  const f = fake();
  assert.deepEqual(await startDemoJobs({ env: { TENANCY_MODE: 'multi', DEMO_BOTS: 'true' }, starters: f.starters }), []);
});
```

`server/test/tenancyStartup.test.js` spawns `process.execPath` with the absolute path of `server/src/server.js` and `cwd: os.tmpdir()`, so no `.env` is loaded. Env: `{ PATH: process.env.PATH, TENANCY_MODE: 'multi', DEMO_BOTS: 'true', MONGODB_URI: 'mongodb://127.0.0.1:1/none' }`. Timeout: 30 s.

```js
it('refuses to start in multi mode with a demo flag on', async () => {
  const { code, stderr } = await runServer({ TENANCY_MODE: 'multi', DEMO_BOTS: 'true' });
  assert.equal(code, 1);
  assert.match(stderr, /\[tenancy\].*TENANCY_MODE=multi does not allow DEMO_BOTS=true/);
  assert.match(stderr, /requires JWT_STAFF_SECRET/);
  assert.doesNotMatch(stderr, /DB connection error/); // the check runs before any DB work
});
it('refuses to start with an invalid TENANCY_MODE', async () => {
  const { code, stderr } = await runServer({ TENANCY_MODE: 'mulit' });
  assert.equal(code, 1); assert.match(stderr, /TENANCY_MODE must be "single" or "multi"/);
});
```

- [ ] **Step 2: Run to verify failure:** `node --test server/test/demoJobs.test.js server/test/tenancyStartup.test.js`. Expected: FAIL, module not found, and the spawn test fails on the `DB connection error` assertion.
- [ ] **Step 3: Implement `server/src/jobs/demoJobs.js`.**
- [ ] **Step 4: Edit `server/src/server.js`:**
  1. Import `assertTenancyStartup` and `getTenancyMode` from `./config/tenancy.js`, `runTenancyBoot` from `./tenancy/defaultTenant.js`, and `startDemoJobs` from `./jobs/demoJobs.js`. Remove the now-unused `startBotScheduler`/`startFakeWinnersScheduler` imports.
  2. Directly after the console patch, before the premium `await import(...)` blocks: `try { assertTenancyStartup(); } catch (e) { for (const p of e.problems ?? [e.message]) console.error('[tenancy] ' + p); process.exit(1); }`. Then, when `getTenancyMode() === 'multi'`, add `console.warn('[tenancy] TENANCY_MODE=multi: tenant isolation is not complete yet (later work packages); do not take real traffic')`.
  3. In `connectDB().then(...)`, right after `await hydrateCryptoSettings(...)`, add `await runTenancyBoot();`.
  4. Delete the demo-data live restore block and the direct `startBotScheduler()` / `startFakeWinnersScheduler()` calls. In their place add `startDemoJobs().then((started) => { if (started.length) console.log('[demo] started: ' + started.join(', ')); }).catch((err) => console.error('startDemoJobs error:', err.message));`.
- [ ] **Step 5: Run:** `node --test server/test/demoJobs.test.js server/test/tenancyStartup.test.js server/test/bot.test.js server/test/fakeWinners.test.js`. Expected: `# fail 0`.
- [ ] **Step 6: Boot smoke (manual).** Run `MONGODB_URI=mongodb://127.0.0.1:27017/vip90_smoke_ip1 PORT=3999 JWT_SECRET=x timeout 15 node server/src/server.js`. Expected: `Server running on :3999`, no `[tenancy]` error, and no `[demo] started` line. Afterwards `mongosh vip90_smoke_ip1 --quiet --eval 'db.tenants.countDocuments({isDefault:true})'` prints `1`. Drop the database afterwards.
- [ ] **Step 7: Commit**

```bash
git add server/src/jobs/demoJobs.js server/src/server.js server/test/demoJobs.test.js server/test/tenancyStartup.test.js
git commit -m "feat(tenancy): startup checks, default tenant at boot, demo jobs behind DEMO_* flags"
```

---

### Task 11: Admin route gating and `GET /api/admin/demo-flags`

**Files:**
- Modify: `server/src/routes/admin.js` (demo-data routes at lines 92-96, bots at lines 212-218, fake-winners at lines 221-222)
- Test: `server/test/demoFlagRoutes.test.js` (pure; walks the router, no DB)

**Interfaces:**
- Consumes: `requireDemoFlag`, `getDemoFlags` (Task 1).
- Produces: `GET /api/admin/demo-flags` (any authenticated admin, no permission key, like `/me/permissions`). Response `200 { bots: boolean, fakeWinners: boolean, instantDeposit: boolean, data: boolean }` with the effective flags. Task 12 relies on this exact shape.

Changes: put `requireDemoFlag('data')` as the **first** handler of all five `/demo-data/*` routes, `requireDemoFlag('bots')` first on all seven `/bots*` routes, and `requireDemoFlag('fakeWinners')` first on both `/fake-winners` routes. The flag gate goes before `requirePermission`, so a disabled feature answers 404 to everyone. Add `r.get('/demo-flags', (req, res) => res.json(getDemoFlags()));`.

- [ ] **Step 1: Write the failing test:**

```js
import adminRoutes from '../src/routes/admin.js';
const routes = adminRoutes.stack.filter((l) => l.route).map((l) => ({
  path: l.route.path, methods: Object.keys(l.route.methods), first: l.route.stack[0].handle }));
const gated = (prefix) => routes.filter((r) => r.path === prefix || r.path.startsWith(prefix + '/'));

it('every demo-data route is gated by DEMO_DATA first', () => {
  assert.equal(gated('/demo-data').length, 5);
  assert.ok(gated('/demo-data').every((r) => r.first.demoFlag === 'data'));
});
it('every bots route is gated by DEMO_BOTS first', () => {
  assert.equal(gated('/bots').length, 7);
  assert.ok(gated('/bots').every((r) => r.first.demoFlag === 'bots'));
});
it('fake-winners routes are gated by DEMO_FAKE_WINNERS first', () => {
  assert.equal(gated('/fake-winners').length, 2);
  assert.ok(gated('/fake-winners').every((r) => r.first.demoFlag === 'fakeWinners'));
});
it('no other route carries a demo gate', () => {
  const others = routes.filter((r) => !/^\/(demo-data|bots|fake-winners)/.test(r.path));
  assert.ok(others.every((r) => r.first.demoFlag === undefined));
});
it('GET /demo-flags returns the effective flags', () => {
  const r = routes.find((x) => x.path === '/demo-flags');
  assert.deepEqual(r.methods, ['get']);
  let body; process.env.DEMO_DATA = 'true';
  try { r.first({}, { json: (b) => { body = b; } }); } finally { delete process.env.DEMO_DATA; }
  assert.deepEqual(body, { bots: false, fakeWinners: false, instantDeposit: false, data: true });
});
```

- [ ] **Step 2: Run to verify failure:** `node --test server/test/demoFlagRoutes.test.js`. Expected: FAIL, the gate assertions fail.
- [ ] **Step 3: Edit `server/src/routes/admin.js`** as described.
- [ ] **Step 4: Run:** `node --test server/test/demoFlagRoutes.test.js server/test/routeWiring.test.js`. Expected: `# fail 0`.
- [ ] **Step 5: Commit**

```bash
git add server/src/routes/admin.js server/test/demoFlagRoutes.test.js
git commit -m "feat(tenancy): demo admin routes 404 unless their DEMO_* flag is on; expose demo flags"
```

---

### Task 12: Client hides demo entries

**Files:**
- Create: `client/src/utils/demoFlags.js`, `client/src/hooks/useDemoFlags.js`
- Modify: `client/src/components/admin/adminNav.config.js` (lines 127-128), `client/src/components/admin/AdminSidebar.jsx` (line 37 `ADMIN_NAV_GROUPS.map`), `client/src/components/admin/AdminTopbar.jsx` (its `ADMIN_NAV_GROUPS` use), `client/src/pages/admin/Dashboard.jsx` (the `/admin/demo-data` quick link at line ~820)
- Test: `client/src/utils/demoFlags.test.js` (included in the root `npm test` glob `client/src/utils/*.test.js`)

**Interfaces:**
- Consumes: the endpoint contract from Task 11, `GET /admin/demo-flags` (through `client/src/services/api`), which returns `{ bots, fakeWinners, instantDeposit, data }`.
- Produces:
  - `utils/demoFlags.js`: `NO_DEMO_FLAGS` (frozen, all `false`); `isNavItemVisible(item: { demoFlags?: string[] }, flags) -> boolean` (true when the item has no `demoFlags` or any listed flag is `true`); `filterNavByDemoFlags(groups, flags) -> groups` (a new array, items filtered, empty groups dropped, input not mutated).
  - `hooks/useDemoFlags.js`: `useDemoFlags() -> { bots, fakeWinners, instantDeposit, data }`. It starts as `NO_DEMO_FLAGS` and keeps that on any error, so it fails closed. Pattern: `client/src/hooks/useMyPermissions.js`.

Changes: the nav item `demo-data` gets `demoFlags: ['data']`. The nav item `bots` gets `demoFlags: ['fakeWinners']`, because `pages/admin/Bots.jsx` only manages the fake-winners simulation and has no bot UI. `AdminSidebar` and `AdminTopbar` render `filterNavByDemoFlags(ADMIN_NAV_GROUPS, useDemoFlags())`. The Dashboard quick link renders only when `flags.data`. Leave the routes in `App.jsx` alone: a direct visit hits the server's 404.

- [ ] **Step 1: Write the failing test:**

```js
const groups = [
  { id: 'g1', items: [{ id: 'a' }, { id: 'b', demoFlags: ['data'] }] },
  { id: 'demo', items: [{ id: 'd', demoFlags: ['data'] }, { id: 'w', demoFlags: ['fakeWinners'] }] },
];
it('hides flagged items and empty groups when flags are off', () => {
  assert.deepEqual(filterNavByDemoFlags(groups, NO_DEMO_FLAGS), [{ id: 'g1', items: [{ id: 'a' }] }]);
});
it('shows an item when any of its flags is on', () => {
  const out = filterNavByDemoFlags(groups, { ...NO_DEMO_FLAGS, fakeWinners: true });
  assert.deepEqual(out.map((g) => g.items.map((i) => i.id)), [['a'], ['w']]);
});
it('does not mutate its input', () => {
  filterNavByDemoFlags(groups, NO_DEMO_FLAGS);
  assert.equal(groups[1].items.length, 2);
});
it('real nav config: demo items carry their flags', async () => {
  const { ADMIN_NAV_GROUPS } = await import('../components/admin/adminNav.config.js');
  const items = ADMIN_NAV_GROUPS.flatMap((g) => g.items);
  assert.deepEqual(items.find((i) => i.id === 'demo-data').demoFlags, ['data']);
  assert.deepEqual(items.find((i) => i.id === 'bots').demoFlags, ['fakeWinners']);
  assert.equal(filterNavByDemoFlags(ADMIN_NAV_GROUPS, NO_DEMO_FLAGS).some((g) => g.id === 'demo-simulation'), false);
});
```

- [ ] **Step 2: Run to verify failure:** `node --test client/src/utils/demoFlags.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the util and the hook, then edit the four files.
- [ ] **Step 4: Run:** `node --test client/src/utils/demoFlags.test.js client/src/components/admin/adminNav.config.test.js && npm run build --prefix client`. Expected: tests `# fail 0`, and the build ends with `built in`.
- [ ] **Step 5: Commit**

```bash
git add client/src/utils/demoFlags.js client/src/utils/demoFlags.test.js client/src/hooks/useDemoFlags.js client/src/components/admin/adminNav.config.js client/src/components/admin/AdminSidebar.jsx client/src/components/admin/AdminTopbar.jsx client/src/pages/admin/Dashboard.jsx
git commit -m "feat(admin): hide demo data and fake winners entries unless their DEMO_* flag is on"
```

---

### Task 13: Tenancy public surface for add-ons

**Files:**
- Create: `server/src/tenancy/index.js`
- Test: `server/test/tenancyIndex.test.js` (pure)

**Interfaces:**
- Consumes: Tasks 2, 4, 5, 6, 7, 8.
- Produces: `server/src/tenancy/index.js` re-exports exactly: `tenantContext`, `runWithTenant`, `runAsPlatform`, `getCurrentTenantId`, `TenantScopeError`, `resolveConnection`, `setConnectionResolver`, `tenantScoped`, `tenantLookup`, `defineTenantModel`, `getTenantModel`, `forEachTenant`, `registerTenantProvisioningHook`, `runTenantProvisioningHooks`, `registerTenantCredentialSchema`, `getTenantCredentialSchema`, `listTenantCredentialSchemas`. Premium add-ons import only this file (for example `../../tenancy/index.js` from `server/src/premium/<addon>/`). Add a header comment saying so, and that core never imports premium.

- [ ] **Step 1: Write the failing test:**

```js
const EXPECTED = ['tenantContext','runWithTenant','runAsPlatform','getCurrentTenantId','TenantScopeError','resolveConnection',
  'setConnectionResolver','tenantScoped','tenantLookup','defineTenantModel','getTenantModel','forEachTenant',
  'registerTenantProvisioningHook','runTenantProvisioningHooks','registerTenantCredentialSchema',
  'getTenantCredentialSchema','listTenantCredentialSchemas'];
it('exports the documented surface and nothing test-only', async () => {
  const mod = await import('../src/tenancy/index.js');
  assert.deepEqual(Object.keys(mod).sort(), [...EXPECTED].sort());
});
it('no file under server/src/tenancy imports premium', async () => {
  // read every .js file in server/src/tenancy and assert none matches /from ['"][^'"]*premium\//
});
```

- [ ] **Step 2: Run to verify failure:** `node --test server/test/tenancyIndex.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full tenancy suite:** `node --test server/test/tenancy*.test.js server/test/tenantScoped*.test.js server/test/tenantModelRouting.test.js server/test/forEachTenant.test.js server/test/tenantProvisioning.test.js server/test/defaultTenant.test.js server/test/demoJobs.test.js server/test/demoFlagRoutes.test.js`. Expected: `# fail 0`.
- [ ] **Step 5: Commit**

```bash
git add server/src/tenancy/index.js server/test/tenancyIndex.test.js
git commit -m "feat(tenancy): public tenancy surface for add-ons"
```

---

### Task 14: CHANGELOG, operator docs, AGENTS.md

**Files:**
- Modify: `CHANGELOG.md` (new section directly under `## [Yayınlanmadı]`, line 19)
- Modify: `docs/product/02-yapilandirma.md` (Security table near line 131: replace the `DEMO_INSTANT_DEPOSIT` row; add a "Tenancy" subsection)
- Modify: `docs/product/11-admin-araclari.md` (demo data section: requires `DEMO_DATA=true`; endpoints answer 404 otherwise)
- Modify: `docs/product/05-api-referansi.md` (admin section: `GET /api/admin/demo-flags`; demo-data, bots and fake-winners routes answer `404 DEMO_FEATURE_DISABLED` when their flag is off)
- Modify or create: `AGENTS.md` (repo root)

**Interfaces:**
- Consumes: the env names, error code and endpoint from Tasks 1, 10, 11.
- Produces: documentation only.

- [ ] **Step 1: Add the CHANGELOG section** (Turkish, verbatim):

```markdown
### İP-1: çok kiracılı temel (kiracı modeli, kiracı bağlamı, kapsam eklentisi, demo bayrakları)
**Kırılan Değişiklikler**
- Demo davranışları artık açık bayrak ister; hepsinin varsayılanı kapalıdır: `DEMO_BOTS` (bot oyuncu zamanlayıcısı ve `/api/admin/bots*`), `DEMO_FAKE_WINNERS` (Son Kazananlar simülasyonu ve `/api/admin/fake-winners`), `DEMO_DATA` (`/api/admin/demo-data/*` ve canlı demo simülasyonunun açılışta geri yüklenmesi). Kapalıyken iş başlatılmaz, uçlar `404 DEMO_FEATURE_DISABLED` döner, admin menüsündeki ilgili öğeler gizlenir. Sahte kazananlar bugüne kadar varsayılan olarak açıktı. Demo kurulumları güncellemeden önce kullandıkları bayrakları `server/.env`'de `true` yapar; gerçek operatör kurulumlarının bir şey yapması gerekmez.
- `TENANCY_MODE` ve `TENANCY_ENFORCEMENT` açılışta doğrulanır. Geçersiz değer ya da `TENANCY_MODE=multi` iken `enforce` dışında bir zorlama değeri, açık bir `DEMO_*` bayrağı, eksik `JWT_STAFF_SECRET` veya `OPERATOR_SECRET_ENCRYPTION_KEY` sunucunun başlamasını engeller. Bu değişkenleri tanımlamayan tek operatörlü kurulumlar etkilenmez.
**Eklendi**
- `Tenant` ve `Domain` modelleri. Açılış geçişi `tenancy-001-default-tenant` tek modda varsayılan kiracıyı (`key: 'default'`) oluşturur, in-house sağlayıcının `vip90` operatörü varsa ona bağlar ve varsayılan markanın alan adlarıyla `CLIENT_URL` kökenlerinden `Domain` kayıtları üretir. Bu kayıtları henüz hiçbir kod okumaz; davranış değişmez. Aynı geçiş `node scripts/migrate.js` ile de çalışır.
- Kiracı bağlamı (`server/src/tenancy/`): `tenantContext`, `runWithTenant`, `runAsPlatform`, `forEachTenant`, `tenantScoped` eklentisi (`TENANCY_ENFORCEMENT=off|log|enforce`, tek modda varsayılan `off`), `defineTenantModel`/`getTenantModel` ve bağlantı çözümleyici; eklentiler için `registerTenantProvisioningHook` ve `registerTenantCredentialSchema`. Bu sürümde hiçbir üretim modeli eklentiyi kullanmaz.
- `GET /api/admin/demo-flags`: admin istemcisinin demo öğelerini gösterip gizlemek için okuduğu etkin bayraklar.
```

- [ ] **Step 2: Update the three product docs** (English, matching their style). In `02-yapilandirma.md`, add a `### Tenancy and demo flags` subsection under `.env` variables with rows for `TENANCY_MODE`, `TENANCY_ENFORCEMENT`, `JWT_STAFF_SECRET` (multi only, used from İP-3), `DEMO_BOTS`, `DEMO_FAKE_WINNERS`, `DEMO_INSTANT_DEPOSIT` (move the existing row here), `DEMO_DATA`, and the startup refusal rules. Source: `server/src/config/tenancy.js`.

- [ ] **Step 3: AGENTS.md.** The text to place is the §0.3 block of the spec, verbatim:

```markdown
- **`2026-11-09`: Çok kiracılı veri yalıtımı (multi-tenant) zorunludur.** Bu karar
  "Multi-brand data isolation is not enforced" kararının yerini alır
  (docs/superpowers/specs/2026-11-09-multi-tenant-design.md). Operatöre ait her koleksiyon
  `tenantId` taşır; operatöre ait modellerde kapsamsız sorgu `tenantScoped` eklentisi
  tarafından reddedilir; kapsam dışı çalışan platform işleri `runAsPlatform(reason, fn)`
  ile açıkça işaretlenir. Kiracı modeli `Tenant`'tır; `Operator` adı in-house
  sağlayıcının B2B müşteri modeline aittir ve kiracı anlamında kullanılmaz. Tek operatörlü
  kurulumlar varsayılan kiracıyla (`TENANCY_MODE=single`) değişmeden çalışır.
  Brand/Jurisdiction sayfaları artık işlevseldir: Brand bir kiracıya aittir, alan adı →
  kiracı çözümlemesi `Domain` koleksiyonundan yapılır. Yalıtım çekirdeği, Platform Sahibi
  paneli, Partner hiyerarşisi, operatör provizyonu ve faturalama public core'dadır ve
  core'da geliştirilir (core upstream'dir, bkz. "Repo dağılımı"). Merkezi çok kiracılı
  kurulum yeni ve temiz bir kurulumdur; app.vip90.bet tek operatörlü demo ortamı olarak
  kalır ve taşınmaz. Multi modda bot, sahte kazanan ve demo depozit çalışmaz; personel
  2FA'sı yalnız multi modda zorunludur. Agent (bayi) ile Partner ayrı kavramlardır;
  birleştirme önerme.
```

Placement (pick the first that applies):
1. `AGENTS.md` exists and contains the bullet starting `- Multi-brand data isolation is **not enforced**`: replace that whole bullet, including its continuation lines, with the block.
2. `AGENTS.md` exists and has a `## Settled decisions` heading: append the block as the last bullet of that section.
3. `AGENTS.md` exists otherwise: append `\n## Multi-tenancy\n\n` followed by the block.
4. `AGENTS.md` does not exist: create it with `# Agent Instructions\n\n## Multi-tenancy\n\n` followed by the block.

- [ ] **Step 4: Verify:** `node scripts/check-changelog.mjs --base origin/main` exits 0 (if the script is missing on this branch, run `grep -n "İP-1: çok kiracılı temel" CHANGELOG.md` and expect one hit), and `grep -c "Çok kiracılı veri yalıtımı" AGENTS.md` prints `1`.
- [ ] **Step 5: Full regression:** `npm test` from the repo root. Expected: the same pass/fail set as on `feat/ip1-tenancy-foundation` before Task 1 (record that baseline once before starting the plan), plus the new tenancy tests passing.
- [ ] **Step 6: Commit**

```bash
git add CHANGELOG.md AGENTS.md docs/product/02-yapilandirma.md docs/product/05-api-referansi.md docs/product/11-admin-araclari.md
git commit -m "docs(tenancy): İP-1 changelog, operator docs and AGENTS.md multi-tenant decision"
```

---

## Decisions this plan makes where the spec leaves room

1. **`off` is a complete no-op.** The plugin injects nothing and checks nothing in `off` (the İP-1 single-mode default), which guarantees "no behaviour change". Cross-tenant mismatches throw in both `log` and `enforce`.
2. **No production model uses the plugin in İP-1.** Only test-only models do. TEN models move to `defineTenantModel` in İP-2 together with their `tenantId` fields.
3. **Enforcement default.** Single → `off`; multi → `enforce` when unset. An explicit `off`/`log` in multi refuses to start.
4. **Invalid `TENANCY_MODE`/`TENANCY_ENFORCEMENT` values refuse to start** instead of silently meaning single. The old `isMultiTenancyMode` helper keeps its signature.
5. **`bulkWrite` and `estimatedDocumentCount`** are guarded by the plugin hook (allowed only inside `runAsPlatform`). The spec also proposes a lint rule; that lint rule is İP-5.
6. **G1 runs on every single-mode boot.** It is idempotent and self-healing for the tenant row. The domain back-fill runs only until `Migration{tenancy-001-default-tenant}` exists, and the same migration is also a `server/migrations/0004_*` file so CLI, healthcheck and boot agree. Migration version `1.1.0`.
7. **A G1 failure does not stop the server.** It goes to `errorLogger.critical('tenancy_boot', …)`, which the admin Health/Logs page shows (the §6.3 "admin panelinde uyarı").
8. **Provider operator link** uses `mongoose.models.Operator` looked up by name at runtime, so core does not import premium.
9. **`Domain.host`** is `URL.host` lower-cased (a non-default port is kept). An unset `CLIENT_URL` yields no domains; the `localhost:5173` fallback in `app.js` is not turned into a record.
10. **How the client learns the flags:** a new `GET /api/admin/demo-flags`. The admin "bots" nav entry maps to `DEMO_FAKE_WINNERS` because that page only manages fake winners; `DEMO_BOTS` gates the bot scheduler and the UI-less `/api/admin/bots*` API.
11. **Multi mode in İP-1** starts (when the checks pass) with a loud warning; Host resolution and the rest arrive in later packages.
12. **Out of scope here:** the isolation harness as a CI gate (§8.7; core has no CI workflows yet), process metrics (§7.1 İP-10 note), and the `runAsPlatform` allow-list lint (İP-5).
