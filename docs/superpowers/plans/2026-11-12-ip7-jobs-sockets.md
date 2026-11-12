# İP-7 Jobs, Sockets, Campaigns, Caches and Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement work package İP-7 of the approved multi-tenant design: run every scheduled job once per tenant with `forEachTenant`, move all socket traffic to per-tenant rooms, narrow every global broadcast to its tenant, scope campaign e-mail/SMS audiences per tenant, make the bot scheduler carry the tenant on its internal loopback call, and key every in-process cache by tenant. The §8.5 socket test suite is the acceptance gate.

**Architecture:** Three new primitives carry the work. `server/src/tenancy/tenantKeys.js` derives tenant-scoped room and cache keys from the ambient context (`getCurrentTenantId()`), falling back to the default tenant in single mode. `server/src/socket/publish.js` is the only module that talks to Socket.IO for tenant-wide events; it rejects unscoped publishing, and `publishToAllTenants()` enumerates active tenants instead of using `io.emit`. `server/src/socket/tenant.js` resolves a socket's tenant from the handshake Host (single mode: default tenant), stores it on `socket.request.tenant` and `socket.data.tenantId`, and runs the namespace middleware plus every packet callback inside `runWithTenant`. Jobs keep their existing service bodies and gain thin per-tenant wrappers; platform-only work (event cleanup) is explicitly wrapped in `runAsPlatform(reason)`. Campaign audience queries get an explicit `tenantId` filter in addition to the `tenantScoped` plugin so they are correct in `log` mode too. Bots remain single-mode-only, but their loopback HTTP call now carries `X-Internal-Tenant` plus a trusted `X-Internal-Token`, which `middleware/internalTenant.js` accepts only from loopback.

**Tech Stack:** Node >= 22 (ESM), Express 4, Mongoose 8.24, Socket.IO 4 (`socket.io` + `socket.io-client` in tests), `node:test` + `node:assert/strict`, local MongoDB (replica set `rs0` on 127.0.0.1:27017), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-09-multi-tenant-design.md` (Turkish; upstream copy in `core-ipu`). Sections used: §2.2 (campaign and bot rows), §3 (gaps #10, #12, #15, #17, #18), §4.3, §4.4, §6.1, §6.3 (G7), §7.1 (İP-7 row), §8.1, §8.3, §8.5 (socket room tests), §9 (G-2, G-3, G-8, G-10).

---

## Global Constraints

- **İP-3 lands first.** This plan targets the İP-3 interfaces: `server/src/middleware/tenantHost.js` (`resolveTenantHost`, `clearDomainHostCache`), `server/src/middleware/auth.js` (`requireStaff`, X-Tenant-Id), `server/src/services/socketAuth.js` (`verifySocketStaff`), `staffHasPermission(staffId, key, context)`, `StaffAccount`, `RoleAssignment`, and `signAccess()` payloads carrying `tid` with `typ:'player'` / `aud:'player'`. If a name differs, adapt the call site, not the isolation guarantee.
- **`io.emit(` and the literal `role:admin` room are banned** (§9 G-8). Every tenant-wide event goes through `server/src/socket/publish.js`; admin events go to `t:<tenantId>:admin`. Lint (Task 9) enforces this over `server/src`.
- **Room names are fixed:** `t:<tenantId>:admin`, `t:<tenantId>:clients`, `t:<tenantId>:chat:<roomId>`, `t:<tenantId>:live:<gameId>`. `user:<id>` and `event:<id>` stay global (user ids are globally unique; `eventId` belongs to the CAT `Event` model), and their membership remains token-checked.
- **Single mode never changes behaviour.** In single mode the default tenant (`getDefaultTenantId()`) supplies the room/cache tenant; if G1 has not created it yet, cache keys fall back to the legacy `g:` prefix and broadcasts are skipped instead of emitted globally. `TENANCY_ENFORCEMENT=log` only logs; it must never widen a query or a broadcast.
- **Jobs run sequentially per tenant** through `forEachTenant(fn)` (`server/src/tenancy/forEachTenant.js`). One tenant's failure is recorded as `error` and the loop continues. Platform-only jobs use `runAsPlatform(reason, fn)` and must not be listed in the job loop.
- **Bots, fake winners and demo data are single-mode-only.** In `multi` the scheduler returns without running; `getDemoFlags()` already makes the demo starters inert, and the scheduler adds its own guard. Bots never exist in multi, but any bot code path still carries `tenantId` so a stray document cannot act across tenants.
- **Campaign audience queries carry an explicit tenant filter** (G-10): `User` and `PlayerSegment` queries in `systemMail.js` / `smsTemplate.js` add `tenantId` when an effective tenant exists, even in `log` mode. Scheduled mail/SMS run once per tenant, not globally.
- **Cache keys are tenant-scoped** through `cacheKey(prefix)`; a cache must never be shared between tenants and an unscoped lookup in `multi` throws `TenantScopeError`.
- **The internal tenant header is trusted only from loopback with a matching `INTERNAL_API_TOKEN`.** No token configured means the middleware is a no-op. It must be mounted before `resolveTenantHost()`.
- **No existing check is weakened.** Negative socket tests (anonymous, player token, other user's id) stay and are extended with the cross-tenant negative case. Existing test names/assertions that reference `role:admin` are migrated to the tenant admin room, not deleted.
- **Test databases:** dedicated names (`vip90_test_ip7_*`), `TENANCY_TEST_MONGO` override allowed, never `MONGODB_URI`. Drop the database in `after()`. The suite runs with `--test-concurrency=1` semantics per file; do not share a database between test files.
- **Comments in English. CHANGELOG entries in Turkish** under `## [Yayınlanmadı]` per `docs/CHANGELOG_GUIDE.md`.
- **Commits add files by explicit path.** Never `git add -A` / `git add .`.

---

## Review Focus

- **No broadcast can cross a tenant boundary:** `io.emit` and `role:admin` are gone; every `winners:new`, `online:count`, `bot:action`, `activity:*`, `ticket:*`, `kyc:*`, `admin:counts`, `chat:*` and `game:update` reaches only the emitting tenant's room. `publishToAllTenants()` is reserved for genuinely platform-wide feed updates (odds/score refresh) and enumerates active tenants.
- **Admin room membership is tenant-bound:** a valid admin token for T1 cannot join `t:T2:admin`; a staff token for a different tenant or partner scope is refused; the existing anonymous/player/other-user negatives still fail.
- **Socket tenant binding is per packet:** the Host lookup happens once at handshake, but every packet callback runs under `runWithTenant`, so the `tenantScoped` plugin and `logActivity` see the right tenant even across awaits.
- **Jobs cannot be half-scoped:** every scheduled job either iterates active tenants or is explicitly platform (`event-cleanup`). A suspended/closed tenant is skipped by `forEachTenant`; its failure does not stop the next tenant.
- **Campaigns cannot leak an audience:** `resolveAudience()` and `resolveRecipients()` filter by tenant even when enforcement is `log`; a segment from another tenant resolves to zero recipients.
- **Single mode is byte-for-byte equivalent:** with one default tenant, the same recipients, the same admin room membership, and the same online count are produced. The upgraded tests prove it instead of assuming it.
- **Loopback trust is narrow:** `X-Internal-Tenant` is ignored without the exact token and a loopback remote address; a forged header from a public address is a no-op.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `server/src/tenancy/tenantKeys.js` | Canonical room/cache key builders and tenant-id resolution (`requireTenantId`, `optionalTenantId`, `cacheKey`, `adminRoom`, `clientsRoom`, `chatRoom`, `liveRoom`) | 1 |
| `server/test/tenantKeys.test.js` | Unit tests for key builders, ambient/explicit precedence, single fallback, multi rejection | 1 |
| `server/src/middleware/tenantHost.js` | Add `resolveTenantByHost(host)`; skip resolution when `req.tenant.id` is already bound (internal path) | 2 |
| `server/src/middleware/internalTenant.js` | Trusted loopback tenant binding from `X-Internal-Tenant` + `X-Internal-Token` | 2 |
| `server/src/app.js` | Mount `resolveInternalTenant()` immediately before `resolveTenantHost()` | 2 |
| `server/test/internalTenant.test.js` | Unit tests for loopback/token trust and Host resolver extraction | 2 |
| `server/src/socket/tenant.js` | Socket tenant resolver, namespace middleware, packet context (`createSocketTenantResolver`, `socketTenantMiddleware`, `socketPacketTenant`) | 3 |
| `server/src/socket/handler.js` | Apply tenant middleware to `/` and `/live`; tenant admin/user rooms; tenant-aware online count; tenant live rooms | 3 + 4 |
| `server/src/services/chat.js` | Apply tenant middleware to `/chat`; tenant chat rooms; `chat:join` validates the room inside the tenant | 3 + 4 |
| `server/test/socketTenantBinding.test.js` | Unit tests for resolver, middleware, packet context | 3 |
| `server/test/socketRoomAuth.test.js` | Migrate to tenant admin room; keep all negative cases and add cross-tenant negative | 3 |
| `server/src/socket/publish.js` | `publishToRoom`, `publishToTenant`, `publishToTenantAdmins`, `publishToAllTenants` — the only Socket.IO fan-out surface | 3 |
| `server/src/services/onlineCount.js`, `liveGameStream.js`, `fakeWinners.js`, `activityFeed.js`, `adminCounts.js`, `ticket.js`, `kyc.js` | Narrow every service broadcast to the tenant room | 4 |
| `server/src/controllers/admin.js` | Replace the global `io.emit('odds:update')` with `publishToAllTenants` | 4 |
| `server/test/tenantSocketBroadcasts.test.js` | Unit tests for the narrowed broadcast rooms | 4 |
| `server/test/activityFeed.test.js`, `ticketNotifications.test.js` | Migrate `role:admin` assertions to `adminRoom(T1)` | 4 |
| `server/src/services/systemMail.js`, `smsTemplate.js` | Explicit tenant audience filters; per-tenant scheduled wrappers | 5 |
| `server/test/tenantCampaignAudience.test.js` | Audience isolation tests for mail and SMS | 5 |
| `server/src/jobs/bonusExpiry.js`, `kycExpiry.js`, `cryptoWithdrawalReconcile.js`, `cleanup.js`, `closeStaleGameSessions.js`, `liveSimulation.js` | Per-tenant job loops; platform cleanup; tenant admin/live broadcasts | 6 |
| `server/test/tenantJobs.test.js` | Per-tenant job-loop and platform-reason tests | 6 |
| `server/test/closeStaleGameSessions.test.js` | Tenant fixture and tenant admin room assertion | 6 |
| `server/src/services/internalApi.js` | `buildInternalHeaders(tenantId)` for loopback calls | 7 |
| `server/src/services/bot.js`, `server/src/jobs/botScheduler.js` | Tenant-attributed loopback calls, tenant `bot:action` room, single-mode guard | 7 |
| `server/test/tenantBotScheduler.test.js` | Loopback headers/JWT tenant and scheduler guard tests | 7 |
| `server/src/services/mailTemplates.js`, `casinoStatsService.js` | Tenant-scoped caches and tenant-filtered aggregate | 8 |
| `server/test/tenantRuntimeCaches.test.js` | Cache isolation tests | 8 |
| `scripts/lint-tenant-sockets.mjs` | G-8 lint: ban `io.emit(` and `role:admin` in `server/src` | 9 |
| `scripts/lint-tenant-sockets.test.mjs` | Lint rule tests | 9 |
| `.github/workflows/ci.yml`, `package.json` | Wire the lint into CI and npm scripts | 9 |
| `server/test/tenantSocketRooms.test.js` | §8.5 acceptance suite | 10 |
| `CHANGELOG.md`, `docs/product/02-yapilandirma.md`, `docs/product/11-admin-araclari.md`, `docs/product/09-bilinen-kisitlar.md` | Release note and operator documentation | 11 |

---

## Parallelism

Tasks in the same wave run in parallel in separate worktrees without touching the same files.

| Wave | Tasks (run in parallel, separate worktrees) | Depends on |
|---|---|---|
| A | 1 (tenant runtime keys), 2 (HTTP tenant resolution surface) | İP-3 |
| B | 3 (socket binding + publish surface), 5 (campaign audiences), 6 (scheduled jobs), 8 (runtime caches) | 1 |
| C | 4 (broadcast narrowing), 7 (bot loopback + scheduler) | 3; 7 also needs 2 |
| D | 9 (socket lint + CI), 10 (§8.5 acceptance suite) | 4, 6, 7 |
| E | 11 (CHANGELOG + operator docs) | 10 |

**Conflict notes:**
- Task 1 owns `tenantKeys.js`; Tasks 3, 5, 6, 7 and 8 only import it. Task 2 owns `tenantHost.js`, `internalTenant.js`, `app.js`; Task 3 reads `resolveTenantByHost`, Task 7 reads the internal header contract.
- Task 3 and Task 4 both edit `server/src/socket/handler.js` and `server/src/services/chat.js`, but they are in different waves. Task 3 changes middleware wiring, room membership and the `chat:join` transport; Task 4 changes the emit targets inside services and the remaining handler call sites. Never run 3 and 4 in parallel.
- Tasks 5 and 6 are independent: 5 owns `services/systemMail.js` + `services/smsTemplate.js`, 6 owns `server/src/jobs/*` except `botScheduler.js` (Task 7). `liveSimulation.js` and `closeStaleGameSessions.js` are jobs and therefore belong to 6.
- Task 8 owns `services/mailTemplates.js` and `services/casinoStatsService.js`; it does not touch `systemMail.js`.
- Task 9 creates `scripts/*` and edits CI/package scripts; Task 10 creates one test file and touches no production code.
- Task 11 edits documentation and `CHANGELOG.md` only.

---

### Task 1: Tenant runtime keys (`tenantKeys.js`)

**Files:**
- Create: `server/src/tenancy/tenantKeys.js`
- Test: `server/test/tenantKeys.test.js`

**Interfaces:**
- Consumes: `getCurrentTenantId()` (`server/src/tenancy/context.js`), `getDefaultTenantId()` (`server/src/tenancy/defaultTenantId.js`), `getTenancyMode()` (`server/src/config/tenancy.js`), `TenantScopeError` (`server/src/tenancy/errors.js`).
- Produces:
  - `optionalTenantId(explicit = null): string | null` — explicit id, else ambient, else default tenant in single mode, else `null` in single mode with no default; throws `TenantScopeError` in multi mode when no id exists.
  - `requireTenantId(explicit = null): string` — same resolution, but throws when the result is `null`.
  - `tenantRoom(tenantId, suffix): string` → `t:<tenantId>:<suffix>`.
  - `adminRoom(tenantId = null): string` → `t:<tenantId>:admin`.
  - `clientsRoom(tenantId = null): string` → `t:<tenantId>:clients`.
  - `chatRoom(tenantId, roomId): string` → `t:<tenantId>:chat:<roomId>`; throws on an empty `roomId`.
  - `liveRoom(tenantId, gameId): string` → `t:<tenantId>:live:<gameId>`; throws on an empty `gameId`.
  - `cacheKey(prefix, tenantId = null): string` → `t:<tenantId>:<prefix>` in scoped mode, `g:<prefix>` only in single mode with no default tenant.
  - `cachePrefix(tenantId = null): string` → `t:<tenantId>:` or `g:` for filtered invalidation.
  - `PLATFORM_JOB_REASONS` frozen object: `{ EVENT_CLEANUP: 'event-cleanup', AUDIT_RETENTION: 'audit-retention' }`.

- [ ] **Step 1: Write the failing test**

Create `server/test/tenantKeys.test.js`:

```js
import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  optionalTenantId, requireTenantId, adminRoom, clientsRoom, chatRoom, liveRoom,
  cacheKey, cachePrefix, PLATFORM_JOB_REASONS,
} from '../src/tenancy/tenantKeys.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { setDefaultTenantId } from '../src/tenancy/defaultTenantId.js';
import { TenantScopeError } from '../src/tenancy/errors.js';

const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();
const ORIGINAL_MODE = process.env.TENANCY_MODE;

beforeEach(() => {
  process.env.TENANCY_MODE = 'single';
  setDefaultTenantId(null);
});
after(() => {
  setDefaultTenantId(null);
  if (ORIGINAL_MODE === undefined) delete process.env.TENANCY_MODE;
  else process.env.TENANCY_MODE = ORIGINAL_MODE;
});

describe('tenantKeys', () => {
  it('derives every room from the ambient tenant', async () => {
    await runWithTenant(T1, async () => {
      assert.equal(adminRoom(), `t:${T1}:admin`);
      assert.equal(clientsRoom(), `t:${T1}:clients`);
      assert.equal(chatRoom(null, 'room-1'), `t:${T1}:chat:room-1`);
      assert.equal(liveRoom(null, 'inhouse-crash'), `t:${T1}:live:inhouse-crash`);
    });
  });

  it('explicit tenant wins over the ambient tenant', async () => {
    await runWithTenant(T1, async () => {
      assert.equal(adminRoom(T2), `t:${T2}:admin`);
      assert.equal(optionalTenantId(T2), String(T2));
    });
  });

  it('single mode falls back to the default tenant, then to g: cache keys', async () => {
    setDefaultTenantId(T1);
    assert.equal(adminRoom(), `t:${T1}:admin`);
    assert.equal(cacheKey('mail:event'), `t:${T1}:mail:event`);
    setDefaultTenantId(null);
    assert.equal(optionalTenantId(), null);
    assert.equal(cacheKey('mail:event'), 'g:mail:event');
    assert.equal(cachePrefix(), 'g:');
    assert.throws(() => requireTenantId(), TenantScopeError);
  });

  it('multi mode rejects an unscoped room or cache key', () => {
    process.env.TENANCY_MODE = 'multi';
    assert.throws(() => optionalTenantId(), TenantScopeError);
    assert.throws(() => adminRoom(), TenantScopeError);
    assert.throws(() => cacheKey('popular:15'), TenantScopeError);
  });

  it('rejects empty room identifiers', () => {
    setDefaultTenantId(T1);
    assert.throws(() => chatRoom(null, ''), /roomId/);
    assert.throws(() => liveRoom(null, ''), /gameId/);
  });

  it('exposes stable platform job reasons', () => {
    assert.equal(PLATFORM_JOB_REASONS.EVENT_CLEANUP, 'event-cleanup');
    assert.ok(Object.isFrozen(PLATFORM_JOB_REASONS));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test server/test/tenantKeys.test.js`
Expected: FAIL with `Cannot find module '../src/tenancy/tenantKeys.js'`.

- [ ] **Step 3: Write the implementation**

Create `server/src/tenancy/tenantKeys.js`:

```js
import { getCurrentTenantId } from './context.js';
import { getDefaultTenantId } from './defaultTenantId.js';
import { getTenancyMode } from '../config/tenancy.js';
import { TenantScopeError } from './errors.js';

export const PLATFORM_JOB_REASONS = Object.freeze({
  EVENT_CLEANUP: 'event-cleanup',
  AUDIT_RETENTION: 'audit-retention',
});

function unscoped() {
  return new TenantScopeError('A tenant id is required for this operation', { reason: 'unscoped' });
}

export function optionalTenantId(explicit = null) {
  const id = explicit || getCurrentTenantId();
  if (id) return String(id);
  if (getTenancyMode() === 'single') {
    const fallback = getDefaultTenantId();
    return fallback ? String(fallback) : null;
  }
  throw unscoped();
}

export function requireTenantId(explicit = null) {
  const id = optionalTenantId(explicit);
  if (!id) throw unscoped();
  return id;
}

function roomSuffix(suffix, label) {
  const value = String(suffix ?? '').trim();
  if (!value) throw new TypeError(`${label} is required`);
  return value;
}

export function tenantRoom(tenantId, suffix) {
  return `t:${requireTenantId(tenantId)}:${suffix}`;
}

export function adminRoom(tenantId = null) {
  return tenantRoom(tenantId, 'admin');
}

export function clientsRoom(tenantId = null) {
  return tenantRoom(tenantId, 'clients');
}

export function chatRoom(tenantId, roomId) {
  return tenantRoom(tenantId, `chat:${roomSuffix(roomId, 'roomId')}`);
}

export function liveRoom(tenantId, gameId) {
  return tenantRoom(tenantId, `live:${roomSuffix(gameId, 'gameId')}`);
}

export function cachePrefix(tenantId = null) {
  const id = optionalTenantId(tenantId);
  return id ? `t:${id}:` : 'g:';
}

export function cacheKey(prefix, tenantId = null) {
  return `${cachePrefix(tenantId)}${prefix}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test server/test/tenantKeys.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/tenancy/tenantKeys.js server/test/tenantKeys.test.js
git commit -m "feat(tenancy): add tenant room and cache key builders"
```

---

### Task 2: Host resolver extraction and trusted internal tenant binding

**Files:**
- Modify: `server/src/middleware/tenantHost.js` (created by İP-3)
- Create: `server/src/middleware/internalTenant.js`
- Modify: `server/src/app.js` (mount order around İP-3's `resolveTenantHost()`)
- Test: `server/test/internalTenant.test.js`

**Interfaces:**
- Consumes: `Domain` (`server/src/models/Domain.js`), `Tenant` (`server/src/models/Tenant.js`), `runWithTenant`, `getTenancyMode`, `getDefaultTenantId`.
- Produces:
  - `resolveTenantByHost(host): Promise<{ id: string, brandId: string|null, host: string, isPrimary: boolean, purpose: string|null } | null>` — normalizes the host and returns only verified domains.
  - `createInternalTenantMiddleware({ token = process.env.INTERNAL_API_TOKEN, findTenant = (id) => Tenant.findOne({ _id: id, status: 'active' }).lean(), isLoopback = defaultIsLoopback } = {}): RequestHandler`.
  - `resolveInternalTenant()` — default instance mounted in `app.js`.
  - `resolveTenantHost()` returns early when `req.tenant?.id` is set, binding the existing tenant to the context.

- [ ] **Step 1: Write the failing test**

Create `server/test/internalTenant.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Tenant from '../src/models/Tenant.js';
import Domain from '../src/models/Domain.js';
import { createInternalTenantMiddleware } from '../src/middleware/internalTenant.js';
import { resolveTenantByHost, resolveTenantHost, clearDomainHostCache } from '../src/middleware/tenantHost.js';
import { getCurrentTenantId } from '../src/tenancy/context.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip7_internal';
const TOKEN = 'internal-test-token';
let t1; let t2;

function req({ headers = {}, remoteAddress = '127.0.0.1', hostname = 't1.test' } = {}) {
  return { headers, socket: { remoteAddress }, hostname };
}
function res() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  t1 = await Tenant.create({ key: 't1internal', name: 'T1', status: 'active' });
  t2 = await Tenant.create({ key: 't2internal', name: 'T2', status: 'active' });
  await Domain.create({ host: 't1.test', tenantId: t1._id, verifiedAt: new Date(), isPrimary: true, purpose: 'primary' });
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  clearDomainHostCache();
});

describe('internal tenant header', () => {
  it('binds an active tenant for a loopback request with the exact token', async () => {
    const middleware = createInternalTenantMiddleware({ token: TOKEN });
    const request = req({ headers: { 'x-internal-tenant': String(t1._id), 'x-internal-token': TOKEN } });
    let nextCalls = 0;
    let ambient = null;
    await middleware(request, res(), () => { nextCalls += 1; ambient = getCurrentTenantId(); });
    assert.equal(nextCalls, 1);
    assert.equal(String(request.tenant.id), String(t1._id));
    assert.equal(String(ambient), String(t1._id));
  });

  it('ignores a forged token and leaves the request unbound', async () => {
    const middleware = createInternalTenantMiddleware({ token: TOKEN });
    const request = req({ headers: { 'x-internal-tenant': String(t1._id), 'x-internal-token': 'wrong' } });
    let nextCalls = 0;
    await middleware(request, res(), () => { nextCalls += 1; });
    assert.equal(nextCalls, 1);
    assert.equal(request.tenant, undefined);
  });

  it('ignores the header from a non-loopback address', async () => {
    const middleware = createInternalTenantMiddleware({ token: TOKEN });
    const request = req({
      headers: { 'x-internal-tenant': String(t1._id), 'x-internal-token': TOKEN },
      remoteAddress: '10.0.0.5',
    });
    let nextCalls = 0;
    await middleware(request, res(), () => { nextCalls += 1; });
    assert.equal(nextCalls, 1);
    assert.equal(request.tenant, undefined);
  });

  it('is a no-op when INTERNAL_API_TOKEN is not configured', async () => {
    const middleware = createInternalTenantMiddleware({ token: '' });
    const request = req({ headers: { 'x-internal-tenant': String(t1._id), 'x-internal-token': '' } });
    let nextCalls = 0;
    await middleware(request, res(), () => { nextCalls += 1; });
    assert.equal(nextCalls, 1);
    assert.equal(request.tenant, undefined);
  });

  it('404s a valid header that names a missing or inactive tenant', async () => {
    const middleware = createInternalTenantMiddleware({ token: TOKEN });
    const request = req({ headers: { 'x-internal-tenant': String(t2._id), 'x-internal-token': TOKEN } });
    const response = res();
    let nextCalls = 0;
    await Tenant.updateOne({ _id: t2._id }, { $set: { status: 'suspended' } });
    await middleware(request, response, () => { nextCalls += 1; });
    assert.equal(nextCalls, 0);
    assert.equal(response.statusCode, 404);
    assert.equal(response.body.error.code, 'TENANT_NOT_FOUND');
  });
});

describe('host resolver extraction', () => {
  it('resolves a verified domain to a tenant', async () => {
    const tenant = await resolveTenantByHost('T1.TEST:443');
    assert.equal(String(tenant.id), String(t1._id));
    assert.equal(tenant.host, 't1.test');
  });

  it('does not resolve a pre-bound tenant through the Host header again', async () => {
    const middleware = resolveTenantHost({ getTenancyMode: () => 'multi' });
    const request = req({ hostname: 'unknown.test' });
    request.tenant = { id: t2._id, brandId: null, host: 'unknown.test' };
    let nextCalls = 0;
    await middleware(request, res(), () => { nextCalls += 1; });
    assert.equal(nextCalls, 1);
    assert.equal(String(request.tenant.id), String(t2._id));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test server/test/internalTenant.test.js`
Expected: FAIL with `Cannot find module '../src/middleware/internalTenant.js'`.

- [ ] **Step 3: Extract `resolveTenantByHost` in `server/src/middleware/tenantHost.js`**

Add the export above `resolveTenantHost` and make the middleware use it:

```js
export async function resolveTenantByHost(host) {
  const normalized = normalizeHost(host);
  const domain = await findDomainByHost(normalized);
  if (!domain) return null;
  return {
    id: String(domain.tenantId),
    brandId: domain.brandId ? String(domain.brandId) : null,
    host: domain.host,
    isPrimary: Boolean(domain.isPrimary),
    purpose: domain.purpose ?? null,
  };
}
```

Inside `tenantHostResolution`, before the mode branch:

```js
if (req.tenant?.id) {
  return runWithTenant(req.tenant.id, next, { brandId: req.tenant.brandId ?? null });
}
```

Replace the `const domain = await findDomainByHost(host)` / `req.tenant = {...}` block in multi mode with `const tenant = await resolveTenantByHost(host); if (!tenant) return res.status(404)...; req.tenant = tenant;` (single mode keeps the default-tenant branch unchanged).

- [ ] **Step 4: Create `server/src/middleware/internalTenant.js`**

```js
import crypto from 'node:crypto';
import Tenant from '../models/Tenant.js';
import { runWithTenant } from '../tenancy/context.js';
import { TenantScopeError } from '../tenancy/errors.js';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function defaultIsLoopback(req) {
  return LOOPBACK.has(String(req.socket?.remoteAddress || ''));
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function createInternalTenantMiddleware({
  token = process.env.INTERNAL_API_TOKEN,
  findTenant = (id) => Tenant.findOne({ _id: id, status: 'active' }).lean(),
  isLoopback = defaultIsLoopback,
} = {}) {
  return async function internalTenant(req, res, next) {
    const tenantId = req.headers['x-internal-tenant'];
    if (!tenantId) return next();
    if (!token || !safeEqual(req.headers['x-internal-token'] || '', token)) return next();
    if (!isLoopback(req)) return next();
    try {
      const tenant = await findTenant(String(tenantId));
      if (!tenant) {
        return res.status(404).json({ error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' } });
      }
      req.tenant = {
        id: String(tenant._id),
        brandId: null,
        host: req.headers.host || '',
        source: 'internal',
      };
      return runWithTenant(req.tenant.id, next, { brandId: null });
    } catch (error) {
      if (error instanceof TenantScopeError) return res.status(404).json({ error: { code: 'TENANT_NOT_FOUND' } });
      return next(error);
    }
  };
}

export function resolveInternalTenant() {
  return createInternalTenantMiddleware();
}
```

- [ ] **Step 5: Mount it in `server/src/app.js`**

Add the import and mount it immediately before İP-3's `app.use(resolveTenantHost())`:

```js
import { resolveInternalTenant } from './middleware/internalTenant.js';
// ...
app.use(resolveInternalTenant());
app.use(resolveTenantHost());
```

- [ ] **Step 6: Run the tests**

Run: `node --test server/test/internalTenant.test.js`
Expected: PASS (7 tests). If İP-3's `tenantHost.js` names its mode option differently, keep `resolveTenantHost({ getTenancyMode })` and adapt only that name.

- [ ] **Step 7: Commit**

```bash
git add server/src/middleware/tenantHost.js server/src/middleware/internalTenant.js server/src/app.js server/test/internalTenant.test.js
git commit -m "feat(tenancy): bind internal loopback calls to a trusted tenant"
```

---

### Task 3: Socket tenant binding and the publish surface

**Files:**
- Create: `server/src/socket/tenant.js`
- Create: `server/src/socket/publish.js`
- Modify: `server/src/socket/handler.js`
- Modify: `server/src/services/chat.js` (middleware wiring and `chat:join` transport only)
- Test: `server/test/socketTenantBinding.test.js`
- Modify: `server/test/socketRoomAuth.test.js`

**Interfaces:**
- Consumes: `resolveTenantByHost`, `runWithTenant`, `getCurrentTenantId`, `getTenancyMode`, `getDefaultTenantId`, `adminRoom`, `clientsRoom`, `getIO`, İP-3 `verifySocketStaff` / `staffHasPermission`.
- Produces:
  - `createSocketTenantResolver({ mode = getTenancyMode, defaultTenantId = getDefaultTenantId, findByHost = resolveTenantByHost } = {}): (socket) => Promise<{ id, brandId, host } | null>`.
  - `socketTenantMiddleware(resolveSocketTenant)` — sets `socket.request.tenant`, `socket.data.tenantId`, and calls `next()` inside `runWithTenant`.
  - `socketPacketTenant(socket, next)` — re-enters the socket's tenant for one packet.
  - `publishToRoom(room, event, payload, { namespace = null, io = getIO() } = {}): boolean`.
  - `publishToTenant(event, payload, { tenantId = null, room = 'clients', namespace = null, io = null } = {}): boolean`.
  - `publishToTenantAdmins(event, payload, { tenantId = null, io = null } = {}): boolean`.
  - `publishToAllTenants(event, payload, { tenants = null, room = 'clients', io = null } = {}): Promise<number>`.
  - `initSocket(io, { resolveSocketTenant = createSocketTenantResolver() } = {})`.
  - `initChatSocket(io, { resolveSocketTenant = createSocketTenantResolver() } = {})`.

- [ ] **Step 1: Write the failing test**

Create `server/test/socketTenantBinding.test.js`:

```js
import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  createSocketTenantResolver, socketTenantMiddleware, socketPacketTenant,
} from '../src/socket/tenant.js';
import { getCurrentTenantId } from '../src/tenancy/context.js';
import { setDefaultTenantId } from '../src/tenancy/defaultTenantId.js';

const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();
const ORIGINAL_MODE = process.env.TENANCY_MODE;

function fakeSocket({ host = 't1.test', auth = {} } = {}) {
  return {
    handshake: { headers: { host }, auth },
    data: {},
    request: {},
  };
}

beforeEach(() => {
  process.env.TENANCY_MODE = 'single';
  setDefaultTenantId(null);
});
after(() => {
  setDefaultTenantId(null);
  if (ORIGINAL_MODE === undefined) delete process.env.TENANCY_MODE;
  else process.env.TENANCY_MODE = ORIGINAL_MODE;
});

describe('socket tenant resolver', () => {
  it('uses the default tenant in single mode', async () => {
    setDefaultTenantId(T1);
    const resolve = createSocketTenantResolver({ mode: () => 'single', defaultTenantId: () => T1 });
    const tenant = await resolve(fakeSocket());
    assert.equal(String(tenant.id), String(T1));
  });

  it('uses the Host lookup in multi mode', async () => {
    const resolve = createSocketTenantResolver({
      mode: () => 'multi',
      findByHost: async (host) => (host === 't2.test' ? { id: String(T2), brandId: null, host } : null),
    });
    assert.equal(String((await resolve(fakeSocket({ host: 't2.test' }))).id), String(T2));
    assert.equal(await resolve(fakeSocket({ host: 'unknown.test' })), null);
  });
});

describe('socket tenant middleware', () => {
  it('binds the tenant on the socket and runs next inside the tenant context', async () => {
    setDefaultTenantId(T1);
    const socket = fakeSocket();
    const middleware = socketTenantMiddleware(createSocketTenantResolver({
      mode: () => 'single', defaultTenantId: () => T1,
    }));
    let ambient = null;
    await middleware(socket, (error) => {
      assert.equal(error, undefined);
      ambient = getCurrentTenantId();
    });
    assert.equal(String(socket.request.tenant.id), String(T1));
    assert.equal(socket.data.tenantId, String(T1));
    assert.equal(String(ambient), String(T1));
  });

  it('rejects a socket whose host has no tenant in multi mode', async () => {
    const middleware = socketTenantMiddleware(createSocketTenantResolver({
      mode: () => 'multi', findByHost: async () => null,
    }));
    let error = null;
    await middleware(fakeSocket({ host: 'unknown.test' }), (e) => { error = e; });
    assert.equal(error.message, 'tenant');
  });

  it('re-enters the tenant context for every packet', async () => {
    const socket = fakeSocket();
    socket.data.tenantId = String(T2);
    let ambient = null;
    await socketPacketTenant(socket, () => { ambient = getCurrentTenantId(); });
    assert.equal(String(ambient), String(T2));
  });

  it('rejects a packet when the socket has no bound tenant', async () => {
    let error = null;
    await socketPacketTenant(fakeSocket(), (e) => { error = e; });
    assert.equal(error.message, 'tenant');
  });
});
```

Update `server/test/socketRoomAuth.test.js`:

```js
import { setDefaultTenantId } from '../src/tenancy/defaultTenantId.js';
import { adminRoom } from '../src/tenancy/tenantKeys.js';

const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();
// in before():
setDefaultTenantId(T1);
// every receives() call that probes the admin room uses adminRoom(T1)
```

Keep all existing negative cases and add:

```js
it('başka kiracının admin odasına katılamaz', async () => {
  const c = await connect();
  c.emit('subscribe:admin', { token: sign(admin) });
  await waitFor(() => receives(c, adminRoom(T1), 'activity:new'));
  await new Promise(r => setTimeout(r, 200));
  assert.equal(await receives(c, adminRoom(T2), 'activity:new'), false);
});
```

The positive assertion becomes `waitFor(() => receives(c, adminRoom(T1), 'activity:new')) === true`. No negative assertion is removed or loosened.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test server/test/socketTenantBinding.test.js server/test/socketRoomAuth.test.js`
Expected: FAIL with `Cannot find module '../src/socket/tenant.js'`.

- [ ] **Step 3: Create `server/src/socket/tenant.js`**

```js
import { getTenancyMode } from '../config/tenancy.js';
import { getDefaultTenantId } from '../tenancy/defaultTenantId.js';
import { runWithTenant } from '../tenancy/context.js';
import { resolveTenantByHost } from '../middleware/tenantHost.js';

export function createSocketTenantResolver({
  mode = getTenancyMode,
  defaultTenantId = getDefaultTenantId,
  findByHost = resolveTenantByHost,
} = {}) {
  return async function resolveSocketTenant(socket) {
    const host = socket.handshake?.headers?.host || '';
    if (mode() === 'single') {
      const id = defaultTenantId();
      return id ? { id: String(id), brandId: null, host, isDefault: true } : null;
    }
    const tenant = await findByHost(host);
    return tenant ? { ...tenant, id: String(tenant.id) } : null;
  };
}

export function socketTenantMiddleware(resolveSocketTenant) {
  return async function tenantSocketMiddleware(socket, next) {
    try {
      const tenant = await resolveSocketTenant(socket);
      if (!tenant?.id) return next(new Error('tenant'));
      socket.request = socket.request || {};
      socket.request.tenant = tenant;
      socket.data = {
        ...(socket.data || {}),
        tenantId: String(tenant.id),
        tenantBrandId: tenant.brandId ?? null,
      };
      return runWithTenant(tenant.id, next, { brandId: tenant.brandId ?? null });
    } catch {
      return next(new Error('tenant'));
    }
  };
}

export function socketPacketTenant(socket, next) {
  const tenantId = socket.data?.tenantId;
  if (!tenantId) return next(new Error('tenant'));
  return runWithTenant(tenantId, next, { brandId: socket.data.tenantBrandId ?? null });
}
```

- [ ] **Step 4: Create `server/src/socket/publish.js`**

```js
import Tenant from '../models/Tenant.js';
import { getIO } from '../services/socketEmitter.js';
import { adminRoom, clientsRoom } from '../tenancy/tenantKeys.js';

export function publishToRoom(room, event, payload, { namespace = null, io = getIO() } = {}) {
  if (!io) return false;
  const target = namespace ? io.of(namespace) : io;
  target.to(room).emit(event, payload);
  return true;
}

export function publishToTenant(event, payload, {
  tenantId = null, room = 'clients', namespace = null, io = null,
} = {}) {
  const target = room === 'admin' ? adminRoom(tenantId) : clientsRoom(tenantId);
  return publishToRoom(target, event, payload, { namespace, ...(io ? { io } : {}) });
}

export function publishToTenantAdmins(event, payload, { tenantId = null, io = null } = {}) {
  return publishToTenant(event, payload, { tenantId, room: 'admin', ...(io ? { io } : {}) });
}

export async function publishToAllTenants(event, payload, {
  tenants = null, room = 'clients', io = null,
} = {}) {
  const list = tenants || await Tenant.find({ status: 'active' }).select('_id').lean();
  let sent = 0;
  for (const tenant of list) {
    if (publishToTenant(event, payload, { tenantId: tenant._id, room, ...(io ? { io } : {}) })) sent += 1;
  }
  return sent;
}
```

- [ ] **Step 5: Wire `server/src/socket/handler.js`**

Add imports:

```js
import { createSocketTenantResolver, socketTenantMiddleware, socketPacketTenant } from './tenant.js';
import { adminRoom, clientsRoom, liveRoom } from '../tenancy/tenantKeys.js';
import { verifySocketStaff } from '../services/socketAuth.js';
import { staffHasPermission } from '../services/permissions.js';
```

Change the signature and namespace setup:

```js
export function initSocket(io, { resolveSocketTenant = createSocketTenantResolver() } = {}) {
  io.use(socketTenantMiddleware(resolveSocketTenant));

  io.on('connection', (socket) => {
    socket.use((_event, next) => socketPacketTenant(socket, next));
    const tenantId = socket.data.tenantId;
    socket.join(clientsRoom(tenantId));
    socket.emit('online:count', { count: getOnlineCount(tenantId) });
    broadcastOnlineCount(tenantId);
    socket.on('disconnect', () => broadcastOnlineCount(tenantId));
    // ...
  });

  const liveNS = io.of('/live');
  liveNS.use(socketTenantMiddleware(resolveSocketTenant));
  liveNS.use(socketAuthMiddleware);
  liveNS.on('connection', (socket) => {
    socket.use((_event, next) => socketPacketTenant(socket, next));
    // ...
  });

  initChatSocket(io, { resolveSocketTenant });
}
```

Replace `subscribe:admin` membership with:

```js
socket.on('subscribe:admin', async ({ token } = {}) => {
  const targetTenant = socket.data?.tenantId;
  if (!targetTenant) return;
  const staff = await verifySocketStaff(token);
  if (staff) {
    const tenantScopedStaff = staff.scopeType === 'tenant' && String(staff.tenantId) === String(targetTenant);
    if (
      tenantScopedStaff
      && adminIpAllowedForSocket(socket)
      && await staffHasPermission(staff.subjectId, 'admin:activity:read', {
        scopeType: 'tenant', scopeId: targetTenant,
      })
    ) {
      socket.join(adminRoom(targetTenant));
    }
    return;
  }
  const payload = await verifySocketUser(token);
  if (!payload?.id) return;
  if (payload.tid && String(payload.tid) !== String(targetTenant)) return;
  try {
    const user = await User.findById(payload.id).select('role isSeed tenantId').lean();
    const sameTenant = !user?.tenantId || String(user.tenantId) === String(targetTenant);
    if (user?.role === 'admin' && !user.isSeed && sameTenant && adminIpAllowedForSocket(socket)
      && await userHasPermission(payload.id, 'admin:activity:read')) {
      socket.join(adminRoom(targetTenant));
    }
  } catch { /* invalid id — ignore */ }
});
```

Replace `subscribe:user` membership with:

```js
const payload = await verifySocketUser(token);
const sameTenant = !payload?.tid || String(payload.tid) === String(socket.data?.tenantId);
if (payload?.id && sameTenant) socket.join(`user:${payload.id}`);
```

In `/live`, use `socket.data.tenantId`:

```js
initializeGameStream(gameId, socket.data.tenantId);
socket.join(liveRoom(socket.data.tenantId, gameId));
subscribeToGameStream(socket.id, gameId, socket.data.tenantId);
socket.emit('live:recentWinners', getRecentWinners(20, socket.data.tenantId));
// unsubscribe: socket.leave(liveRoom(...)); unsubscribeFromGameStream(..., tenantId)
```

Remove the two global `initializeGameStream('inhouse-crash'|'inhouse-roulette')` calls; streams are initialized lazily per tenant on subscribe.

- [ ] **Step 6: Wire `/chat` in `server/src/services/chat.js`**

At the top:

```js
import { createSocketTenantResolver, socketTenantMiddleware, socketPacketTenant } from '../socket/tenant.js';
```

Change the signature and connection body:

```js
export function initChatSocket(io, { resolveSocketTenant = createSocketTenantResolver() } = {}) {
  const chatNS = io.of('/chat');
  chatNS.use(socketTenantMiddleware(resolveSocketTenant));
  chatNS.use(socketAuthMiddleware);

  chatNS.on('connection', (socket) => {
    socket.use((_event, next) => socketPacketTenant(socket, next));
    socket.on('chat:join', async ({ roomId } = {}) => {
      const tenantId = socket.data?.tenantId;
      if (!tenantId || !roomId) return;
      try {
        const room = await ChatRoom.findById(roomId).select('_id').lean();
        if (!room) return socket.emit('chat:error', { code: 'ROOM_NOT_FOUND', message: 'Oda bulunamadı' });
        socket.join(chatRoom(tenantId, roomId));
      } catch {
        socket.emit('chat:error', { code: 'ROOM_NOT_FOUND', message: 'Oda bulunamadı' });
      }
    });
    // chat:leave, chat:send, ... unchanged in this task
  });
}
```

Import `chatRoom` from `../tenancy/tenantKeys.js`. Task 4 replaces the remaining emit room strings.

- [ ] **Step 7: Run the tests**

Run: `node --test server/test/socketTenantBinding.test.js server/test/socketRoomAuth.test.js`
Expected: PASS. `socketRoomAuth` still proves that anonymous, player-token and other-user cases cannot join; the positive case now joins `adminRoom(T1)`.

- [ ] **Step 8: Commit**

```bash
git add server/src/socket/tenant.js server/src/socket/publish.js server/src/socket/handler.js server/src/services/chat.js server/test/socketTenantBinding.test.js server/test/socketRoomAuth.test.js
git commit -m "feat(socket): bind sockets to a tenant and add tenant publish helpers"
```

---

### Task 4: Narrow every service broadcast to the tenant

**Files:**
- Modify: `server/src/services/onlineCount.js`
- Modify: `server/src/services/liveGameStream.js`
- Modify: `server/src/services/fakeWinners.js`
- Modify: `server/src/services/activityFeed.js`
- Modify: `server/src/services/adminCounts.js`
- Modify: `server/src/services/ticket.js`
- Modify: `server/src/services/kyc.js`
- Modify: `server/src/services/chat.js` (emit targets and `chat:join`/`chat:leave`)
- Modify: `server/src/controllers/admin.js`
- Test: `server/test/tenantSocketBroadcasts.test.js`
- Modify: `server/test/activityFeed.test.js`
- Modify: `server/test/ticketNotifications.test.js`

**Interfaces:**
- Consumes: `publishToTenant`, `publishToTenantAdmins`, `publishToAllTenants`, `publishToRoom`, `adminRoom`, `clientsRoom`, `chatRoom`, `liveRoom`, `optionalTenantId`.
- Produces:
  - `getOnlineCount(tenantId = null): number` — tenant clients room size plus the single-mode fake pool.
  - `broadcastOnlineCount(tenantId = null): void` — tenant clients room only.
  - `getPoolSize(tenantId = null): number` — 0 in multi; single-mode pool only for the default tenant.
  - `getRecentWinners(limit = 20, tenantId = null)`, `addRecentWinner(winner)` with `winner.tenantId`.
  - `subscribeToGameStream(socketId, gameId, tenantId = null)`, `unsubscribeFromGameStream(socketId, gameId, tenantId = null)`, `emitGameUpdate(gameId, update, tenantId = null)`, `initializeGameStream(gameId, tenantId = null)`, `getActiveStreamsInfo(tenantId = null)`.
  - `invalidateTenantChatCache` is not introduced; chat rooms use `chatRoom()` directly.

- [ ] **Step 1: Write the failing test**

Create `server/test/tenantSocketBroadcasts.test.js`:

```js
import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import ActivityEvent from '../src/models/ActivityEvent.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { setDefaultTenantId } from '../src/tenancy/defaultTenantId.js';
import { adminRoom, clientsRoom, liveRoom } from '../src/tenancy/tenantKeys.js';
import { setIO } from '../src/services/socketEmitter.js';
import { logActivity, _setIOGetter as setActivityIOGetter, _getIOGetter as getActivityIOGetter } from '../src/services/activityFeed.js';
import { createTicket } from '../src/services/ticket.js';
import { addRecentWinner, getRecentWinners, subscribeToGameStream, emitGameUpdate } from '../src/services/liveGameStream.js';
import { broadcastOnlineCount, getOnlineCount } from '../src/services/onlineCount.js';
import { publishToAllTenants } from '../src/socket/publish.js';
import Tenant from '../src/models/Tenant.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip7_broadcasts';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();
const ORIGINAL_GETTER = getActivityIOGetter();

function fakeIO() {
  const calls = [];
  const io = {
    engine: { clientsCount: 2 },
    sockets: { adapter: { rooms: new Map() } },
    to(room) { return { emit: (event, payload) => calls.push({ room, event, payload }) }; },
    of(namespace) {
      return { to: (room) => ({ emit: (event, payload) => calls.push({ namespace, room, event, payload }) }) };
    },
  };
  return { io, calls };
}

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  await Tenant.create([
    { key: 't1broadcast', name: 'T1', status: 'active' },
    { key: 't2broadcast', name: 'T2', status: 'active' },
  ]);
});
after(async () => {
  setActivityIOGetter(ORIGINAL_GETTER);
  setIO(null);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
beforeEach(async () => {
  await User.deleteMany({});
  await ActivityEvent.deleteMany({});
  setActivityIOGetter(ORIGINAL_GETTER);
  setDefaultTenantId(null);
});

describe('tenant-scoped broadcasts', () => {
  it('publishes activity:new to the tenant admin room', async () => {
    const { io, calls } = fakeIO();
    setActivityIOGetter(() => io);
    const user = await User.create({ username: 't1activity', email: 't1activity@test.com', password: 'x', tenantId: T1 });
    await runWithTenant(T1, () => logActivity({ type: 'deposit', userId: user._id, status: 'completed', summary: 'x' }));
    assert.equal(calls[0].room, adminRoom(T1));
    assert.equal(calls[0].event, 'activity:new');
  });

  it('publishes ticket:new to the tenant admin room', async () => {
    setDefaultTenantId(T1);
    const { io, calls } = fakeIO();
    setIO(io);
    const player = await User.create({ username: 't1ticket', email: 't1ticket@test.com', password: 'x', tenantId: T1 });
    await runWithTenant(T1, () => createTicket(player._id, 'Konu', 'Mesaj'));
    const event = calls.find((c) => c.event === 'ticket:new');
    assert.equal(event.room, adminRoom(T1));
  });

  it('keeps winners:new inside the tenant clients room and isolates the recent list', async () => {
    setDefaultTenantId(T1);
    const { io, calls } = fakeIO();
    setIO(io);
    await runWithTenant(T1, () => addRecentWinner({ tenantId: T1, username: 't1winner', gameId: 'crash', amount: 10 }));
    assert.equal(calls[0].room, clientsRoom(T1));
    assert.equal(calls[0].event, 'winners:new');
    assert.equal(getRecentWinners(20, T1).length, 1);
    assert.equal(getRecentWinners(20, T2).length, 0);
  });

  it('broadcasts online:count only to the tenant room', async () => {
    setDefaultTenantId(T1);
    const { io, calls } = fakeIO();
    io.sockets.adapter.rooms.set(clientsRoom(T1), { size: 4 });
    setIO(io);
    broadcastOnlineCount(T1);
    assert.equal(calls.at(-1).room, clientsRoom(T1));
    assert.equal(calls.at(-1).payload.count, 4);
    assert.equal(getOnlineCount(T1), 4);
  });

  it('routes game:update to the tenant-prefixed /live room', async () => {
    setDefaultTenantId(T1);
    const { io, calls } = fakeIO();
    setIO(io);
    subscribeToGameStream('s1', 'crash', T1);
    emitGameUpdate('crash', { multiplier: 2 }, T1);
    assert.equal(calls.at(-1).namespace, '/live');
    assert.equal(calls.at(-1).room, liveRoom(T1, 'crash'));
  });

  it('enumerates active tenants instead of io.emit for platform-wide updates', async () => {
    const { io, calls } = fakeIO();
    const sent = await publishToAllTenants('odds:update', { eventId: 'e1' }, { io });
    assert.equal(sent, 2);
    assert.deepEqual(
      calls.map((c) => c.room).sort(),
      [clientsRoom(T1), clientsRoom(T2)].sort(),
    );
  });
});
```

In `server/test/activityFeed.test.js`, replace the `role:admin` assertion with:

```js
import { adminRoom } from '../src/tenancy/tenantKeys.js';
import { setDefaultTenantId } from '../src/tenancy/defaultTenantId.js';
// before(): setDefaultTenantId(new mongoose.Types.ObjectId());
assert.equal(to.mock.calls[0].arguments[0], adminRoom());
```

In `server/test/ticketNotifications.test.js`, add `setDefaultTenantId(T1)` in `before()` and change the lookup to `c.room === adminRoom(T1)`. Keep the `user:<id>` assertions unchanged.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test server/test/tenantSocketBroadcasts.test.js`
Expected: FAIL because `broadcastOnlineCount` still calls `io.emit` and `logActivity` still uses `role:admin`.

- [ ] **Step 3: Rewrite `server/src/services/onlineCount.js`**

```js
import { getIO } from './socketEmitter.js';
import { getPoolSize } from './fakeWinners.js';
import { clientsRoom, optionalTenantId } from '../tenancy/tenantKeys.js';
import { publishToTenant } from '../socket/publish.js';

export function getOnlineCount(tenantId = null) {
  const io = getIO();
  const id = optionalTenantId(tenantId);
  const room = id ? clientsRoom(id) : null;
  const roomSize = room ? io?.sockets?.adapter?.rooms?.get(room)?.size : null;
  const realOnline = roomSize ?? io?.engine?.clientsCount ?? 0;
  return realOnline + getPoolSize(id);
}

export function broadcastOnlineCount(tenantId = null) {
  const io = getIO();
  if (!io) return;
  try {
    publishToTenant('online:count', { count: getOnlineCount(tenantId) }, { tenantId, io });
  } catch {
    // Single mode before G1 has no default tenant; never fall back to a global emit.
  }
}
```

- [ ] **Step 4: Rewrite `server/src/services/liveGameStream.js`**

Keep `maskUsername`, change the stores to tenant-keyed maps and use `publishToTenant` / `publishToRoom`:

```js
import { getIO } from './socketEmitter.js';
import { optionalTenantId, liveRoom } from '../tenancy/tenantKeys.js';
import { publishToTenant, publishToRoom } from '../socket/publish.js';

const activeStreams = new Map(); // `${tenantKey}:${gameId}` -> { subscribers, lastUpdate }
const recentWinners = new Map(); // tenantKey -> entry[]
const MAX_WINNERS = 50;

function tenantKey(tenantId) {
  return optionalTenantId(tenantId) || 'g';
}
function streamKey(gameId, tenantId) {
  return `${tenantKey(tenantId)}:${gameId}`;
}

export function subscribeToGameStream(socketId, gameId, tenantId = null) {
  const key = streamKey(gameId, tenantId);
  if (!activeStreams.has(key)) activeStreams.set(key, { subscribers: new Set(), lastUpdate: Date.now() });
  activeStreams.get(key).subscribers.add(socketId);
}

export function unsubscribeFromGameStream(socketId, gameId, tenantId = null) {
  const key = streamKey(gameId, tenantId);
  const stream = activeStreams.get(key);
  if (!stream) return;
  stream.subscribers.delete(socketId);
  if (stream.subscribers.size === 0) activeStreams.delete(key);
}

export function emitGameUpdate(gameId, update, tenantId = null) {
  const key = streamKey(gameId, tenantId);
  const stream = activeStreams.get(key);
  if (!stream || stream.subscribers.size === 0) return;
  const id = optionalTenantId(tenantId);
  if (!id) return;
  publishToRoom(liveRoom(id, gameId), 'game:update', update, { namespace: '/live' });
  stream.lastUpdate = Date.now();
}

export function addRecentWinner(winner) {
  const id = winner.tenantId || optionalTenantId();
  const entry = {
    id: crypto.randomUUID(),
    username: maskUsername(winner.username),
    gameId: winner.gameId,
    gameTitle: winner.gameTitle,
    amount: winner.amount,
    currency: winner.currency || 'TRY',
    image: winner.image || null,
    timestamp: Date.now(),
  };
  if (id) {
    const list = recentWinners.get(String(id)) || [];
    list.unshift(entry);
    if (list.length > MAX_WINNERS) list.pop();
    recentWinners.set(String(id), list);
    publishToTenant('winners:new', entry, { tenantId: id });
  }
  return entry;
}

export function getRecentWinners(limit = 20, tenantId = null) {
  return (recentWinners.get(tenantKey(tenantId)) || []).slice(0, limit);
}

export function initializeGameStream(gameId, tenantId = null) {
  const key = streamKey(gameId, tenantId);
  if (!activeStreams.has(key)) activeStreams.set(key, { subscribers: new Set(), lastUpdate: Date.now() });
}

export function getActiveStreamsInfo(tenantId = null) {
  const prefix = `${tenantKey(tenantId)}:`;
  const info = {};
  for (const [key, stream] of activeStreams.entries()) {
    if (!key.startsWith(prefix)) continue;
    info[key.slice(prefix.length)] = { subscriberCount: stream.subscribers.size, lastUpdate: stream.lastUpdate };
  }
  return info;
}
```

`cleanupInactiveStreams` iterates every key (shared interval) and leaves tenant-prefixed entries alone when empty. `emitSpinResult` takes `tenantId = null` and publishes to `liveRoom(id, gameId)` on `/live`.

- [ ] **Step 5: Narrow `fakeWinners.js`**

```js
import { getTenancyMode } from '../config/tenancy.js';
import { getDefaultTenantId } from '../tenancy/defaultTenantId.js';
import { clientsRoom } from '../tenancy/tenantKeys.js';
import { publishToTenant } from '../socket/publish.js';

export function getPoolSize(tenantId = null) {
  if (getTenancyMode() === 'multi') return 0;
  const fallback = getDefaultTenantId();
  if (fallback && tenantId && String(fallback) !== String(tenantId)) return 0;
  return pool.length;
}

export function regeneratePool(tenantId = getDefaultTenantId()) {
  // existing pool regeneration unchanged
  const io = getIO();
  if (!io || !tenantId) return;
  const room = clientsRoom(tenantId);
  const roomSize = io.sockets?.adapter?.rooms?.get(room)?.size ?? 0;
  publishToTenant('online:count', { count: roomSize + pool.length }, { tenantId, io });
}
```

`fireInhouseWin`, `fireCasinoWin` and `queueBettingWin` pass `tenantId: getDefaultTenantId()` into `addRecentWinner`. `startFakeWinnersScheduler` returns immediately when `getTenancyMode() === 'multi'`.

- [ ] **Step 6: Replace `role:admin` in services**

- `activityFeed.js` — both emits become:
  ```js
  const io = _ioGetter();
  if (io) publishToTenantAdmins('activity:new', populated.toObject(), { io });
  ```
  and `'activity:update'` likewise. Import `publishToTenantAdmins` from `../socket/publish.js`.
- `adminCounts.js` — `io.to('role:admin').emit('admin:counts', counts)` becomes `publishToTenantAdmins('admin:counts', counts, { io })`. The counts themselves stay correct because `getAdminCounts()` runs under the request/tenant context.
- `ticket.js` — `io.to('role:admin').emit('ticket:new', ...)` becomes `publishToTenantAdmins('ticket:new', ..., { io })`. Keep the `user:<id>` emit.
- `kyc.js` — `io.to('role:admin').emit('kyc:new_submission', ...)` becomes `publishToTenantAdmins('kyc:new_submission', ..., { io })`.
- `chat.js` — replace every `io.of('/chat').to(\`room:${roomId}\`)` with `publishToRoom(chatRoom(null, roomId), event, payload, { namespace: '/chat', io })` and every `fetchSockets` room string with `chatRoom(null, roomId)`. Message docs already carry the tenant via the plugin; the room key is what changes. `chat:join` stays as Task 3 wrote it; `chat:leave` uses `chatRoom(socket.data.tenantId, roomId)`.
- `controllers/admin.js` — add `import { publishToAllTenants } from '../socket/publish.js';` and in `updateEvent` replace the dynamic import + `io.emit` with:
  ```js
  await publishToAllTenants('odds:update', { eventId: event._id, markets: event.markets });
  ```

- [ ] **Step 7: Run the tests**

Run: `node --test server/test/tenantSocketBroadcasts.test.js server/test/activityFeed.test.js server/test/ticketNotifications.test.js server/test/liveGameStream.test.js server/test/fakeWinners.test.js`
Expected: PASS. `getRecentWinners(50)` in the legacy tests still works because the tenant key falls back to `g` in single mode without a default tenant.

- [ ] **Step 8: Commit**

```bash
git add server/src/services/onlineCount.js server/src/services/liveGameStream.js server/src/services/fakeWinners.js server/src/services/activityFeed.js server/src/services/adminCounts.js server/src/services/ticket.js server/src/services/kyc.js server/src/services/chat.js server/src/controllers/admin.js server/test/tenantSocketBroadcasts.test.js server/test/activityFeed.test.js server/test/ticketNotifications.test.js
git commit -m "feat(socket): narrow global broadcasts to the tenant"
```

---

### Task 5: Tenant-scoped campaign audiences and per-tenant scheduled sends

**Files:**
- Modify: `server/src/services/systemMail.js`
- Modify: `server/src/services/smsTemplate.js`
- Test: `server/test/tenantCampaignAudience.test.js`

**Interfaces:**
- Consumes: `forEachTenant`, `getCurrentTenantId`, `optionalTenantId`.
- Produces:
  - `resolveAudience(audience = {}, { limit = getBatchLimit(), tenantId = getCurrentTenantId() } = {})` — adds `tenantId` to the `User` filter and to the `PlayerSegment` lookup when present.
  - `runDueScheduledMailsForAllTenants(now = new Date(), { run = runDueScheduledMails } = {})` — `forEachTenant` wrapper.
  - `sendBulk(..., { tenantId })` unchanged in signature; the effective tenant is still `tenantId || tpl.tenantId || getCurrentTenantId()`.
  - `resolveRecipients({ audienceType, segmentId, userIds }, { tenantId = getCurrentTenantId() } = {})` — adds `tenantId` to the base query and the segment lookup.
  - `runDueScheduledSmsForAllTenants(now = new Date(), { run = runDueScheduledSms } = {})`.

- [ ] **Step 1: Write the failing test**

Create `server/test/tenantCampaignAudience.test.js`:

```js
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import PlayerSegment from '../src/models/PlayerSegment.js';
import SystemMailTemplate from '../src/models/SystemMailTemplate.js';
import SmsTemplate from '../src/models/SmsTemplate.js';
import Tenant from '../src/models/Tenant.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { getCurrentTenantId } from '../src/tenancy/context.js';
import { resolveAudience, runDueScheduledMailsForAllTenants } from '../src/services/systemMail.js';
import { resolveRecipients, runDueScheduledSmsForAllTenants } from '../src/services/smsTemplate.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip7_campaigns';
let T1; let T2;

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  const t1 = await Tenant.create({ key: 't1campaign', name: 'T1', status: 'active' });
  const t2 = await Tenant.create({ key: 't2campaign', name: 'T2', status: 'active' });
  T1 = t1._id;
  T2 = t2._id;
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
beforeEach(async () => {
  await User.deleteMany({});
  await PlayerSegment.deleteMany({});
  await SystemMailTemplate.deleteMany({});
  await SmsTemplate.deleteMany({});
});

describe('campaign audience isolation', () => {
  it('resolves only the current tenant users for type=all', async () => {
    await User.create([
      { username: 't1mail', email: 't1mail@test.com', password: 'x', tenantId: T1, isActive: true },
      { username: 't2mail', email: 't2mail@test.com', password: 'x', tenantId: T2, isActive: true },
    ]);
    const result = await runWithTenant(T1, () => resolveAudience({ type: 'all' }));
    assert.equal(result.users.length, 1);
    assert.equal(result.users[0].username, 't1mail');
  });

  it('a segment from another tenant resolves to zero users', async () => {
    const foreign = await runWithTenant(T2, () => PlayerSegment.create({
      name: 'T2 segment', criteria: { minBalance: 0 },
    }));
    await User.create([
      { username: 't1seg', email: 't1seg@test.com', password: 'x', tenantId: T1, isActive: true },
      { username: 't2seg', email: 't2seg@test.com', password: 'x', tenantId: T2, isActive: true },
    ]);
    const result = await runWithTenant(T1, () => resolveAudience({ type: 'segments', segmentIds: [foreign._id] }));
    assert.equal(result.users.length, 0);
  });

  it('SMS recipients are tenant-filtered for type=all', async () => {
    await User.create([
      { username: 't1sms', email: 't1sms@test.com', password: 'x', tenantId: T1, isActive: true, phone: '+905550000001' },
      { username: 't2sms', email: 't2sms@test.com', password: 'x', tenantId: T2, isActive: true, phone: '+905550000002' },
    ]);
    const result = await runWithTenant(T1, () => resolveRecipients({ audienceType: 'all' }));
    assert.deepEqual(result.recipients.map((u) => u.username), ['t1sms']);
  });

  it('scheduled mail runs once per active tenant', async () => {
    const seen = [];
    const results = await runDueScheduledMailsForAllTenants(new Date(), {
      run: async (now) => {
        const tid = getCurrentTenantId();
        seen.push({ tid: String(tid), now: now.toISOString() });
        return 1;
      },
    });
    assert.equal(results.length, 2);
    assert.deepEqual(seen.map((s) => s.tid).sort(), [String(T1), String(T2)].sort());
  });

  it('scheduled SMS runs once per active tenant', async () => {
    const seen = [];
    await runDueScheduledSmsForAllTenants(new Date(), {
      run: async () => {
        seen.push(String(getCurrentTenantId()));
        return 2;
      },
    });
    assert.deepEqual(seen.sort(), [String(T1), String(T2)].sort());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test server/test/tenantCampaignAudience.test.js`
Expected: FAIL with `runDueScheduledMailsForAllTenants is not a function`.

- [ ] **Step 3: Update `server/src/services/systemMail.js`**

Add the `forEachTenant` import. Change `resolveAudience`:

```js
export async function resolveAudience(audience = {}, {
  limit = getBatchLimit(),
  tenantId = getCurrentTenantId(),
} = {}) {
  const type = audience?.type || 'all';
  const filter = applyDomainSuppression({ ...BASE_USER_FILTER });
  if (tenantId) filter.tenantId = tenantId;

  if (type === 'segments') {
    const ids = (audience.segmentIds || []).filter((id) => mongoose.isValidObjectId(id));
    if (ids.length === 0) return { users: [], matched: 0 };
    const segmentQuery = { _id: { $in: ids } };
    if (tenantId) segmentQuery.tenantId = tenantId;
    const segments = await PlayerSegment.find(segmentQuery).lean();
    // rest unchanged
  }
  // users / inactive branches unchanged
}
```

Add the wrapper next to `runDueScheduledMails` and make the timer use it:

```js
export async function runDueScheduledMailsForAllTenants(now = new Date(), { run = runDueScheduledMails } = {}) {
  return forEachTenant(async (tenant) => run(now));
}
```

```js
const run = () => {
  runDueScheduledMailsForAllTenants()
    .catch((e) => console.error('[systemMail] job hatası:', e.message));
};
```

`sendBulk` already computes `effectiveTenantId`; pass it to `resolveAudience` explicitly:

```js
const { users, matched } = await resolveAudience(effectiveAudience, { limit, tenantId: effectiveTenantId });
```

- [ ] **Step 4: Update `server/src/services/smsTemplate.js`**

Add `forEachTenant` and `getCurrentTenantId`. Change `resolveRecipients`:

```js
export async function resolveRecipients({ audienceType, segmentId, userIds }, {
  tenantId = getCurrentTenantId(),
} = {}) {
  const base = { isActive: true, phone: { $nin: [null, ''] } };
  if (tenantId) base.tenantId = tenantId;
  // segment branch:
  const segmentQuery = { _id: segmentId };
  if (tenantId) segmentQuery.tenantId = tenantId;
  const segment = await PlayerSegment.findOne(segmentQuery).lean();
  // users branch unchanged
}
```

Add the wrapper:

```js
export async function runDueScheduledSmsForAllTenants(now = new Date(), { run = runDueScheduledSms } = {}) {
  return forEachTenant(async (tenant) => run(now));
}
```

Make `startScheduledSmsJob` call `runDueScheduledSmsForAllTenants()` instead of `runDueScheduledSms()`. Keep the `deps` forwarding: `runDueScheduledSmsForAllTenants(now, { run: (n) => runDueScheduledSms(n, deps) })` only in tests; the timer uses the default.

- [ ] **Step 5: Run the tests**

Run: `node --test server/test/tenantCampaignAudience.test.js`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/services/systemMail.js server/src/services/smsTemplate.js server/test/tenantCampaignAudience.test.js
git commit -m "feat(campaigns): scope mail and sms audiences per tenant"
```

---

### Task 6: Per-tenant scheduled jobs and platform-only cleanup

**Files:**
- Modify: `server/src/jobs/bonusExpiry.js`
- Modify: `server/src/jobs/kycExpiry.js`
- Modify: `server/src/jobs/cryptoWithdrawalReconcile.js`
- Modify: `server/src/jobs/cleanup.js`
- Modify: `server/src/jobs/closeStaleGameSessions.js`
- Modify: `server/src/jobs/liveSimulation.js`
- Test: `server/test/tenantJobs.test.js`
- Modify: `server/test/closeStaleGameSessions.test.js`

**Interfaces:**
- Consumes: `forEachTenant`, `runAsPlatform`, `PLATFORM_JOB_REASONS`, `publishToTenantAdmins`, `publishToAllTenants`, `getCurrentTenantId`.
- Produces:
  - `runBonusExpiryJobOnce({ run = expireOverdueWagerings } = {})` → `forEachTenant` result array.
  - `runKycExpiryJobOnce({ run = expireOldKyc } = {})` → `forEachTenant` result array.
  - `runCryptoWithdrawalReconcileOnce({ run = reconcileProcessingWithdrawals } = {})` → `forEachTenant` result array.
  - `runCleanupOnce({ platform = runAsPlatform, updateMany = ..., deleteMany = ... } = {})` — runs inside `runAsPlatform(PLATFORM_JOB_REASONS.EVENT_CLEANUP, ...)`; returns `{ archived, stale, farFuture, deleted }`.
  - `closeStaleGameSessions()` — still returns the total closed count, now loops tenants; emits `activity:update` through `publishToTenantAdmins`.
  - `startLiveSimulation(io)` — publishes odds/score via `publishToAllTenants` (no `io.emit`).
  - All `start*Job()` functions keep their current interval and immediate first run.

- [ ] **Step 1: Write the failing test**

Create `server/test/tenantJobs.test.js`:

```js
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Tenant from '../src/models/Tenant.js';
import {
  runBonusExpiryJobOnce, runKycExpiryJobOnce, runCryptoWithdrawalReconcileOnce, runCleanupOnce,
} from '../src/jobs/bonusExpiry.js';
import { getCurrentTenantId, tenantContext, runAsPlatform } from '../src/tenancy/context.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip7_jobs';
let T1; let T2;

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  const [t1, t2] = await Tenant.create([
    { key: 't1jobs', name: 'T1', status: 'active' },
    { key: 't2jobs', name: 'T2', status: 'active' },
    { key: 't3jobs', name: 'T3', status: 'suspended' },
  ]);
  T1 = t1._id;
  T2 = t2._id;
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
beforeEach(async () => {
  await Tenant.updateMany({ key: { $in: ['t1jobs', 't2jobs'] } }, { $set: { status: 'active' } });
});

describe('per-tenant job loops', () => {
  it('runs bonus expiry once for each active tenant in its own context', async () => {
    const seen = [];
    const results = await runBonusExpiryJobOnce({
      run: async () => { seen.push(String(getCurrentTenantId())); return { processed: 1, deducted: 0 }; },
    });
    assert.deepEqual(seen.sort(), [String(T1), String(T2)].sort());
    assert.equal(results.length, 2);
    assert.equal(results[0].result.processed, 1);
  });

  it('runs kyc expiry once per active tenant', async () => {
    const seen = [];
    await runKycExpiryJobOnce({ run: async () => { seen.push(String(getCurrentTenantId())); return 3; } });
    assert.deepEqual(seen.sort(), [String(T1), String(T2)].sort());
  });

  it('runs crypto reconciliation once per active tenant', async () => {
    const seen = [];
    await runCryptoWithdrawalReconcileOnce({
      run: async () => { seen.push(String(getCurrentTenantId())); return { waiting: 0 }; },
    });
    assert.deepEqual(seen.sort(), [String(T1), String(T2)].sort());
  });

  it('keeps going when one tenant fails', async () => {
    let calls = 0;
    const results = await runBonusExpiryJobOnce({
      run: async () => {
        calls += 1;
        if (calls === 1) throw new Error('tenant one failed');
        return { processed: 0, deducted: 0 };
      },
    });
    assert.equal(results.length, 2);
    assert.ok(results.some((r) => r.error));
    assert.ok(results.some((r) => r.result));
  });

  it('runs event cleanup explicitly as platform, not per tenant', async () => {
    let reason = null;
    let mode = null;
    const result = await runCleanupOnce({
      platform: async (why, fn) => { reason = why; return runAsPlatform(why, fn); },
      updateMany: async () => ({ modifiedCount: 0 }),
      deleteMany: async () => ({ deletedCount: 0 }),
      onPlatform: () => { mode = tenantContext.get()?.mode; },
    });
    assert.equal(reason, 'event-cleanup');
    assert.equal(mode, 'platform');
    assert.deepEqual(result, { archived: 0, stale: 0, farFuture: 0, deleted: 0 });
  });
});
```

Update `server/test/closeStaleGameSessions.test.js`: create one active `Tenant`, import `setDefaultTenantId` and `adminRoom`, assign `tenantId` to the `ActivityEvent`, set the default tenant, and assert `emit.mock.calls[0].arguments[0] === 'activity:update'` plus the recorded room is `adminRoom(T1)`. The mock IO must expose `to(room) => ({ emit })` and record the room. Keep both "closes stale" and "leaves fresh" assertions.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test server/test/tenantJobs.test.js server/test/closeStaleGameSessions.test.js`
Expected: FAIL because `runBonusExpiryJobOnce` is not exported.

- [ ] **Step 3: Add the job wrappers**

`server/src/jobs/bonusExpiry.js`:

```js
import { expireOverdueWagerings } from '../services/wagering.js';
import { forEachTenant } from '../tenancy/forEachTenant.js';

export async function runBonusExpiryJobOnce({ run = expireOverdueWagerings } = {}) {
  return forEachTenant(async () => run());
}

export function startBonusExpiryJob() {
  const INTERVAL = 60 * 60 * 1000;
  async function tick() {
    try {
      const results = await runBonusExpiryJobOnce();
      const processed = results.reduce((n, r) => n + (r.result?.processed || 0), 0);
      const deducted = results.reduce((n, r) => n + (r.result?.deducted || 0), 0);
      if (processed > 0) console.log(`[bonusExpiry] ${processed} süresi dolmuş çevrim işlendi, ${deducted} geri alındı`);
    } catch (e) {
      console.error('[bonusExpiry] hata:', e.message);
    }
  }
  tick();
  return setInterval(tick, INTERVAL);
}
```

`server/src/jobs/kycExpiry.js` and `cryptoWithdrawalReconcile.js` follow the same shape (`runKycExpiryJobOnce`, `runCryptoWithdrawalReconcileOnce`), keeping the crypto job's `running` overlap guard around the wrapper call.

`server/src/jobs/cleanup.js`:

```js
import Event from '../models/Event.js';
import { runAsPlatform } from '../tenancy/context.js';
import { PLATFORM_JOB_REASONS } from '../tenancy/tenantKeys.js';

export async function runCleanupOnce({
  platform = runAsPlatform,
  updateMany = (filter, update) => Event.updateMany(filter, update),
  deleteMany = (filter) => Event.deleteMany(filter),
  onPlatform = () => {},
} = {}) {
  return platform(PLATFORM_JOB_REASONS.EVENT_CLEANUP, async () => {
    onPlatform();
    // the four existing filter bodies, now using updateMany/deleteMany
    return { archived, stale, farFuture, deleted };
  });
}
```

`startCleanupJob()` calls `runCleanupOnce()` in its `run()` and keeps the immediate first run.

`server/src/jobs/closeStaleGameSessions.js`:

```js
import { forEachTenant } from '../tenancy/forEachTenant.js';
import { publishToTenantAdmins } from '../socket/publish.js';

export async function closeStaleGameSessions() {
  const results = await forEachTenant(async () => {
    const cutoff = new Date(Date.now() - SESSION_GAP_MS);
    const stale = await ActivityEvent.find({ type: 'game_session', status: 'active', updatedAt: { $lt: cutoff } });
    for (const ev of stale) {
      ev.status = 'ended';
      await ev.save();
      try {
        const io = _ioGetter();
        if (io) {
          const populated = await ev.populate('userId', 'username');
          publishToTenantAdmins('activity:update', populated.toObject(), { io });
        }
      } catch (e) {
        console.error('[closeStaleGameSessions] socket emit hatası:', e.message);
      }
    }
    return stale.length;
  });
  return results.reduce((n, r) => n + (r.result || 0), 0);
}
```

`server/src/jobs/liveSimulation.js`: replace both `io.emit` calls with `await publishToAllTenants('odds:update', {...})` / `'score:update'`. Delete the `io` parameter from `startLiveSimulation` (or keep it unused; prefer deleting). It is not started by `server.js` today, but it must not reintroduce `io.emit`.

- [ ] **Step 4: Run the tests**

Run: `node --test server/test/tenantJobs.test.js server/test/closeStaleGameSessions.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full server suite to catch timing regressions**

Run: `npm test`
Expected: PASS. Jobs start immediately in tests only when their `start*` functions are called; no new timers are created by the `run*Once` exports.

- [ ] **Step 6: Commit**

```bash
git add server/src/jobs/bonusExpiry.js server/src/jobs/kycExpiry.js server/src/jobs/cryptoWithdrawalReconcile.js server/src/jobs/cleanup.js server/src/jobs/closeStaleGameSessions.js server/src/jobs/liveSimulation.js server/test/tenantJobs.test.js server/test/closeStaleGameSessions.test.js
git commit -m "feat(jobs): run scheduled jobs per tenant and mark platform cleanup"
```

---

### Task 7: Bot loopback tenant and single-mode scheduler guard

**Files:**
- Create: `server/src/services/internalApi.js`
- Modify: `server/src/services/bot.js`
- Modify: `server/src/jobs/botScheduler.js`
- Test: `server/test/tenantBotScheduler.test.js`

**Interfaces:**
- Consumes: `getTenancyMode`, `getDefaultTenantId`, `runWithTenant`, `publishToTenant`, `getCurrentTenantId`.
- Produces:
  - `buildInternalHeaders(tenantId): Record<string,string>` — sets `x-internal-tenant` when a tenant id is supplied and `x-internal-token` when `INTERNAL_API_TOKEN` is configured.
  - `emitBotAction(bot, payload)` — publishes `bot:action` to `clientsRoom(bot.tenantId)`.
  - `runBotSchedulerForTenant({ tenantId = getDefaultTenantId() } = {})` — returns `[]` in multi or without a tenant; otherwise `runWithTenant(tenantId, runBotScheduler)`.
  - `startBotScheduler({ intervalMs = 15000, run = runBotSchedulerForTenant } = {})` — starts only in single mode with a tenant.

- [ ] **Step 1: Write the failing test**

Create `server/test/tenantBotScheduler.test.js`:

```js
import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import User from '../src/models/User.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { setDefaultTenantId } from '../src/tenancy/defaultTenantId.js';
import { clientsRoom } from '../src/tenancy/tenantKeys.js';
import { setIO } from '../src/services/socketEmitter.js';
import { buildInternalHeaders } from '../src/services/internalApi.js';
import { executeBotAction, emitBotAction, runBotSchedulerForTenant } from '../src/services/bot.js';

process.env.JWT_SECRET ||= 'test_jwt_secret_ip7_bot_0123456789abcdef';
process.env.INTERNAL_API_TOKEN = 'internal-bot-token';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip7_bot';
const T1 = new mongoose.Types.ObjectId();
const ORIGINAL_MODE = process.env.TENANCY_MODE;
const ORIGINAL_FETCH = globalThis.fetch;

function fakeIO() {
  const calls = [];
  return {
    calls,
    io: { to: (room) => ({ emit: (event, payload) => calls.push({ room, event, payload }) }) },
  };
}

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
});
after(async () => {
  globalThis.fetch = ORIGINAL_FETCH;
  setIO(null);
  setDefaultTenantId(null);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (ORIGINAL_MODE === undefined) delete process.env.TENANCY_MODE;
  else process.env.TENANCY_MODE = ORIGINAL_MODE;
});
beforeEach(() => {
  process.env.TENANCY_MODE = 'single';
  setDefaultTenantId(T1);
});

describe('bot tenant attribution', () => {
  it('builds internal headers with the tenant and the configured token', () => {
    assert.deepEqual(buildInternalHeaders(T1), {
      'x-internal-tenant': String(T1),
      'x-internal-token': 'internal-bot-token',
    });
  });

  it('sends the tenant header and a JWT carrying tid on the loopback call', async () => {
    const bot = await runWithTenant(T1, () => User.create({
      username: 'bot_t1', email: 'bot_t1@test.com', password: 'x', isBot: true, tenantId: T1,
      balance: 1000,
      botProfile: {
        botType: 'casual',
        behavior: { betIntervalMinMs: 1000, betIntervalMaxMs: 2000, minBetPercent: 1, maxBetPercent: 2, riskLevel: 30 },
        limits: { maxDailyLoss: 1000, maxDailyBets: 100, minBalanceToPlay: 10 },
        currentState: 'idle',
        stats: { totalBets: 0, totalWagered: 0, totalWon: 0, lastActiveAt: null },
        nextActionAt: new Date(0),
      },
    }));
    let captured = null;
    globalThis.fetch = mock.fn(async (url, options) => {
      captured = { url, options };
      return { ok: true, json: async () => ({ payout: 0 }) };
    });
    const result = await runWithTenant(T1, () => executeBotAction(bot._id));
    assert.equal(result.executed, true);
    assert.equal(captured.options.headers['x-internal-tenant'], String(T1));
    assert.equal(captured.options.headers['x-internal-token'], 'internal-bot-token');
    const payload = jwt.decode(captured.options.headers.Authorization.replace('Bearer ', ''));
    assert.equal(String(payload.tid), String(T1));
  });

  it('publishes bot:action to the tenant clients room', async () => {
    const { io, calls } = fakeIO();
    setIO(io);
    emitBotAction({ _id: new mongoose.Types.ObjectId(), username: 'bot_t1', tenantId: T1 }, { betAmount: 10 });
    assert.equal(calls[0].room, clientsRoom(T1));
    assert.equal(calls[0].event, 'bot:action');
  });

  it('does not run the scheduler in multi mode', async () => {
    process.env.TENANCY_MODE = 'multi';
    const results = await runBotSchedulerForTenant({ tenantId: T1 });
    assert.deepEqual(results, []);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test server/test/tenantBotScheduler.test.js`
Expected: FAIL with `Cannot find module '../src/services/internalApi.js'`.

- [ ] **Step 3: Create `server/src/services/internalApi.js`**

```js
export function buildInternalHeaders(tenantId) {
  const headers = {};
  if (tenantId) headers['x-internal-tenant'] = String(tenantId);
  if (process.env.INTERNAL_API_TOKEN) headers['x-internal-token'] = process.env.INTERNAL_API_TOKEN;
  return headers;
}
```

- [ ] **Step 4: Update `server/src/services/bot.js`**

Add imports:

```js
import { getTenancyMode } from '../config/tenancy.js';
import { getDefaultTenantId } from '../tenancy/defaultTenantId.js';
import { runWithTenant, getCurrentTenantId } from '../tenancy/context.js';
import { publishToTenant } from '../socket/publish.js';
import { buildInternalHeaders } from './internalApi.js';
```

In `executeBotAction(botId)`, after loading the bot and before the HTTP call:

```js
const effectiveTenantId = bot.tenantId || getCurrentTenantId() || getDefaultTenantId();
if (getTenancyMode() === 'multi' && String(bot.tenantId) !== String(getCurrentTenantId())) {
  return { executed: false, reason: 'TENANT_MISMATCH' };
}
// ...
headers: {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
  ...buildInternalHeaders(effectiveTenantId),
},
```

Replace the global emit:

```js
export function emitBotAction(bot, payload) {
  publishToTenant('bot:action', payload, { tenantId: bot.tenantId || getDefaultTenantId() });
}
// inside executeBotAction, after stats:
emitBotAction(bot, {
  botId: bot._id, username: bot.username, gameId,
  betAmount, payout, net, balance: bot.balance,
});
```

Add the scheduler wrapper:

```js
export async function runBotSchedulerForTenant({ tenantId = getDefaultTenantId() } = {}) {
  if (getTenancyMode() === 'multi' || !tenantId) return [];
  return runWithTenant(tenantId, () => runBotScheduler());
}
```

- [ ] **Step 5: Update `server/src/jobs/botScheduler.js`**

```js
import { runBotSchedulerForTenant } from '../services/bot.js';

export function startBotScheduler({ intervalMs = 15 * 1000, run = runBotSchedulerForTenant } = {}) {
  async function tick() {
    try {
      const results = await run();
      const executed = results.filter((r) => r.executed).length;
      if (executed > 0) {
        console.log(`[botScheduler] ${executed}/${results.length} bot actions executed`);
      }
    } catch (e) {
      console.error('[botScheduler] error:', e.message);
    }
  }
  tick();
  const interval = setInterval(tick, intervalMs);
  if (typeof interval.unref === 'function') interval.unref();
  return interval;
}
```

Keep `DEFAULT_STARTERS` in `demoJobs.js` unchanged; it calls `startBotScheduler()` with defaults.

- [ ] **Step 6: Run the tests**

Run: `node --test server/test/tenantBotScheduler.test.js server/test/bot.test.js`
Expected: PASS. Existing `bot.test.js` mocks the game route through the service seam and is unaffected by the extra header.

- [ ] **Step 7: Commit**

```bash
git add server/src/services/internalApi.js server/src/services/bot.js server/src/jobs/botScheduler.js server/test/tenantBotScheduler.test.js
git commit -m "feat(bot): carry the tenant on loopback calls and keep bots single-mode"
```

---

### Task 8: Per-tenant in-process caches

**Files:**
- Modify: `server/src/services/mailTemplates.js`
- Modify: `server/src/services/casinoStatsService.js`
- Test: `server/test/tenantRuntimeCaches.test.js`

**Interfaces:**
- Consumes: `cacheKey`, `cachePrefix`, `getCurrentTenantId`, `optionalTenantId`.
- Produces:
  - `getTemplateByEvent(event, { tenantId = getCurrentTenantId() } = {})` — cache key includes the tenant; the DB query adds an explicit `tenantId` filter when present.
  - `invalidateMailTemplateCache(event = null, { tenantId = null } = {})` — clears only the current (or explicit) tenant's keys.
  - `_clearMailTemplateCache()` — test/ops helper that empties the map.
  - `getPopularGames(limit = 15, { tenantId = getCurrentTenantId() } = {})` — cache key includes the tenant; the aggregate `$match` includes `tenantId` when present.
  - `_clearCasinoStatsCache()` — test/ops helper that empties the map.

- [ ] **Step 1: Write the failing test**

Create `server/test/tenantRuntimeCaches.test.js`:

```js
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import SystemMailTemplate from '../src/models/SystemMailTemplate.js';
import CasinoRound from '../src/models/CasinoRound.js';
import User from '../src/models/User.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { getTemplateByEvent, invalidateMailTemplateCache, _clearMailTemplateCache } from '../src/services/mailTemplates.js';
import { getPopularGames, _clearCasinoStatsCache } from '../src/services/casinoStatsService.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip7_caches';
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
beforeEach(async () => {
  await SystemMailTemplate.deleteMany({});
  await CasinoRound.deleteMany({});
  await User.deleteMany({});
  invalidateMailTemplateCache(null);
  _clearMailTemplateCache();
  _clearCasinoStatsCache();
});

describe('tenant-scoped caches', () => {
  it('caches mail templates per tenant', async () => {
    await SystemMailTemplate.create([
      { event: 'user.welcome', name: 'T1 welcome', subject: 'T1', body: 'T1', tenantId: T1 },
      { event: 'user.welcome', name: 'T2 welcome', subject: 'T2', body: 'T2', tenantId: T2 },
    ]);
    const t1 = await runWithTenant(T1, () => getTemplateByEvent('user.welcome'));
    const t2 = await runWithTenant(T2, () => getTemplateByEvent('user.welcome'));
    assert.equal(t1.subject, 'T1');
    assert.equal(t2.subject, 'T2');
  });

  it('invalidating one tenant does not drop the other tenant cache entry', async () => {
    await SystemMailTemplate.create([
      { event: 'user.welcome', name: 'T1a', subject: 'T1a', body: 'x', tenantId: T1 },
      { event: 'user.welcome', name: 'T2a', subject: 'T2a', body: 'x', tenantId: T2 },
    ]);
    await runWithTenant(T1, () => getTemplateByEvent('user.welcome'));
    await runWithTenant(T2, () => getTemplateByEvent('user.welcome'));
    await runWithTenant(T1, () => invalidateMailTemplateCache('user.welcome'));
    await SystemMailTemplate.updateOne({ tenantId: T1, event: 'user.welcome' }, { $set: { subject: 'T1b' } });
    assert.equal((await runWithTenant(T1, () => getTemplateByEvent('user.welcome'))).subject, 'T1b');
    assert.equal((await runWithTenant(T2, () => getTemplateByEvent('user.welcome'))).subject, 'T2a');
  });

  it('aggregates popular games per tenant and caches separately', async () => {
    await CasinoRound.create([
      { tenantId: T1, provider: 'igames', gameId: 't1-game', bet: 10, createdAt: new Date() },
      { tenantId: T2, provider: 'igames', gameId: 't2-game', bet: 10, createdAt: new Date() },
    ]);
    const t1 = await runWithTenant(T1, () => getPopularGames(15));
    const t2 = await runWithTenant(T2, () => getPopularGames(15));
    assert.deepEqual(t1.map((g) => g.game_code), ['t1-game']);
    assert.deepEqual(t2.map((g) => g.game_code), ['t2-game']);
    await CasinoRound.create({ tenantId: T1, provider: 'igames', gameId: 't1-extra', bet: 10, createdAt: new Date() });
    assert.equal((await runWithTenant(T1, () => getPopularGames(15))).length, 1, 'second read is served from the tenant cache');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test server/test/tenantRuntimeCaches.test.js`
Expected: FAIL because both tenants share one cache entry (T2 returns T1's template) and the aggregate returns both games.

- [ ] **Step 3: Update `server/src/services/mailTemplates.js`**

```js
import { cacheKey, cachePrefix } from '../tenancy/tenantKeys.js';
import { getCurrentTenantId } from '../tenancy/context.js';

const CACHE_TTL_MS = 30 * 1000;
const cache = new Map(); // tenant-scoped key -> { doc, at }

export function _clearMailTemplateCache() {
  cache.clear();
}

export function invalidateMailTemplateCache(event = null, { tenantId = null } = {}) {
  const prefix = cachePrefix(tenantId);
  if (event) {
    cache.delete(`${prefix}${event}`);
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export async function getTemplateByEvent(event, { tenantId = getCurrentTenantId() } = {}) {
  if (!event) return null;
  const key = cacheKey(event, tenantId);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.doc;
  let doc = null;
  try {
    const query = { event };
    if (tenantId) query.tenantId = tenantId;
    doc = await SystemMailTemplate.findOne(query).lean();
  } catch {
    return null;
  }
  cache.set(key, { doc, at: now });
  return doc;
}
```

The CRUD call sites (`invalidateMailTemplateCache(doc.event)`) stay valid because the current tenant is implicit.

- [ ] **Step 4: Update `server/src/services/casinoStatsService.js`**

```js
import mongoose from 'mongoose';
import CasinoRound from '../models/CasinoRound.js';
import { cacheKey } from '../tenancy/tenantKeys.js';
import { getCurrentTenantId } from '../tenancy/context.js';

const POPULAR_CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

export function _clearCasinoStatsCache() {
  cache.clear();
}

export async function getPopularGames(limit = 15, { tenantId = getCurrentTenantId() } = {}) {
  const key = cacheKey(`popular:${limit}`, tenantId);
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.data;

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const match = { provider: 'igames', bet: { $gt: 0 }, createdAt: { $gte: cutoff } };
  if (tenantId) match.tenantId = new mongoose.Types.ObjectId(String(tenantId));
  const rows = await CasinoRound.aggregate([
    { $match: match },
    { $group: { _id: '$gameId', playCount: { $sum: 1 } } },
    { $sort: { playCount: -1 } },
    { $limit: limit },
  ]);
  const data = rows.filter((r) => r._id).map((r) => ({ game_code: r._id, playCount: r.playCount }));
  cache.set(key, { data, expiresAt: Date.now() + POPULAR_CACHE_TTL_MS });
  return data;
}
```

- [ ] **Step 5: Run the tests**

Run: `node --test server/test/tenantRuntimeCaches.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/services/mailTemplates.js server/src/services/casinoStatsService.js server/test/tenantRuntimeCaches.test.js
git commit -m "feat(cache): key in-process caches by tenant"
```

---

### Task 9: G-8 socket lint in CI

**Files:**
- Create: `scripts/lint-tenant-sockets.mjs`
- Create: `scripts/lint-tenant-sockets.test.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces:
  - `scanSource(source, file = '<inline>'): Array<{ file, line, column, rule, message }>` — pure scanner.
  - `scanTree(root = 'server/src'): Array<...>` — recursive `.js` walker (skips `node_modules`).
  - CLI behavior: prints `file:line:column rule message` and exits `1` when any violation exists.

- [ ] **Step 1: Write the failing test**

Create `scripts/lint-tenant-sockets.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanSource, scanTree } from './lint-tenant-sockets.mjs';

test('flags io.emit', () => {
  const found = scanSource("io.emit('winners:new', {})", 'a.js');
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, 'no-global-io-emit');
  assert.equal(found[0].line, 1);
});

test('flags the role:admin room', () => {
  const found = scanSource("io.to('role:admin').emit('x')", 'a.js');
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, 'no-admin-role-room');
});

test('allows tenant room helpers', () => {
  assert.deepEqual(scanSource("io.to(adminRoom(tid)).emit('x')", 'a.js'), []);
  assert.deepEqual(scanSource("publishToTenant('x', payload)", 'a.js'), []);
});

test('ignores comment-only mentions', () => {
  assert.deepEqual(scanSource('// io.emit was banned; role:admin is gone', 'a.js'), []);
  assert.deepEqual(scanSource(' * role:admin is legacy', 'a.js'), []);
});

test('the real server tree is clean', () => {
  assert.deepEqual(scanTree('server/src'), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/lint-tenant-sockets.test.mjs`
Expected: FAIL with `Cannot find module './lint-tenant-sockets.mjs'`.

- [ ] **Step 3: Write the scanner**

Create `scripts/lint-tenant-sockets.mjs`:

```js
#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const RULES = [
  {
    id: 'no-global-io-emit',
    re: /\bio\.emit\s*\(/g,
    message: 'io.emit is banned; publish to a tenant room through socket/publish.js',
  },
  {
    id: 'no-admin-role-room',
    re: /\brole:admin\b/g,
    message: "the role:admin room is banned; use adminRoom(tenantId)",
  },
];

function isCommentOnly(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

export function scanSource(source, file = '<inline>') {
  const violations = [];
  const lines = String(source).split(/\r?\n/);
  for (const rule of RULES) {
    for (let i = 0; i < lines.length; i += 1) {
      if (isCommentOnly(lines[i])) continue;
      rule.re.lastIndex = 0;
      let match;
      while ((match = rule.re.exec(lines[i])) !== null) {
        violations.push({
          file, line: i + 1, column: match.index + 1,
          rule: rule.id, message: rule.message,
        });
      }
    }
  }
  return violations.sort((a, b) => a.line - b.line || a.column - b.column);
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (entry.endsWith('.js') || entry.endsWith('.mjs')) files.push(full);
  }
  return files;
}

export function scanTree(root = 'server/src') {
  return walk(root).flatMap((file) => scanSource(readFileSync(file, 'utf8'), file));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const violations = scanTree('server/src');
  for (const v of violations) {
    console.error(`${v.file}:${v.line}:${v.column} ${v.rule} ${v.message}`);
  }
  if (violations.length > 0) process.exitCode = 1;
  else console.log('tenant socket lint: clean');
}
```

- [ ] **Step 4: Wire the script and CI**

`package.json` scripts:

```json
"lint:tenant-sockets": "node scripts/lint-tenant-sockets.mjs"
```

`.github/workflows/ci.yml`: in the job that runs `npm test` / leak scan, add a step:

```yaml
      - name: Tenant socket lint
        run: node scripts/lint-tenant-sockets.mjs
```

Place it after the leak-scan step and before `npm test`. No allow-list is added; the tree must be clean.

- [ ] **Step 5: Run the lint and its tests**

Run: `node --test scripts/lint-tenant-sockets.test.mjs && node scripts/lint-tenant-sockets.mjs`
Expected: PASS and `tenant socket lint: clean`. If a legitimate platform-wide feed remains, convert it to `publishToAllTenants`; do not add an exception.

- [ ] **Step 6: Commit**

```bash
git add scripts/lint-tenant-sockets.mjs scripts/lint-tenant-sockets.test.mjs package.json .github/workflows/ci.yml
git commit -m "chore(lint): ban global io.emit and the role:admin room"
```

---

### Task 10: §8.5 socket room acceptance suite

**Files:**
- Test: `server/test/tenantSocketRooms.test.js`

**Interfaces:**
- Consumes: `initSocket`, `Tenant`, `User`, `ChatRoom`, `Role`, `initDefaultPermissions`, `initDefaultRoles`, `logActivity`, `addRecentWinner`, `broadcastOnlineCount`, `emitBotAction`, `emitGameUpdate`, `chatRoom`, `adminRoom`, `clientsRoom`, `verifySocketUser`.
- Produces: the acceptance evidence for spec §8.5. No production file is modified; any failure sends the executor back to Tasks 3, 4 or 7.

- [ ] **Step 1: Write the failing acceptance test**

Create `server/test/tenantSocketRooms.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import ChatRoom from '../src/models/ChatRoom.js';
import Role from '../src/models/Role.js';
import { initSocket } from '../src/socket/handler.js';
import { initDefaultPermissions, initDefaultRoles } from '../src/services/permissions.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { adminRoom, clientsRoom, chatRoom, liveRoom } from '../src/tenancy/tenantKeys.js';
import { logActivity } from '../src/services/activityFeed.js';
import { addRecentWinner, emitGameUpdate, subscribeToGameStream } from '../src/services/liveGameStream.js';
import { broadcastOnlineCount } from '../src/services/onlineCount.js';
import { emitBotAction } from '../src/services/bot.js';

process.env.JWT_SECRET ||= 'test_jwt_secret_ip7_socket_rooms_0123456789';
process.env.TENANCY_MODE = 'multi';
process.env.TENANCY_ENFORCEMENT = 'enforce';
process.env.JWT_STAFF_SECRET ||= 'test_staff_secret_ip7_socket_rooms_0123456789';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip7_sockets';
let T1; let T2; let httpServer; let io; let url;
const clients = [];
let admin1; let admin2; let player1; let player2;
let room1; let room2; let superAdmin;

const tenantByKey = () => ({
  t1: { id: String(T1._id), brandId: null, host: 't1.test' },
  t2: { id: String(T2._id), brandId: null, host: 't2.test' },
});

function token(user, tenantId, overrides = {}) {
  return jwt.sign({
    id: String(user._id), role: user.role, tokenVersion: 0,
    tid: String(tenantId), typ: 'player', aud: 'player',
  }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

function connect(path = '/', auth = {}) {
  const client = ioClient(`${url}${path}`, {
    transports: ['websocket'], forceNew: true, reconnection: false,
    auth,
  });
  clients.push(client);
  return client;
}

function connected(client) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('connect timeout')), 3000);
    client.once('connect', () => { clearTimeout(timer); resolve(); });
    client.once('connect_error', (error) => { clearTimeout(timer); reject(error); });
  });
}

function receives(client, event, timeoutMs = 400) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    client.once(event, () => { clearTimeout(timer); resolve(true); });
  });
}

async function waitForJoin(client, room, event = 'probe', ns = '/') {
  const target = ns === '/' ? io : io.of(ns);
  for (let i = 0; i < 120; i += 1) {
    const got = receives(client, event, 50);
    target.to(room).emit(event, { probe: true });
    if (await got) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
}

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  T1 = await Tenant.create({ key: 't1sockets', name: 'T1', status: 'active' });
  T2 = await Tenant.create({ key: 't2sockets', name: 'T2', status: 'active' });
  await runWithTenant(T1._id, async () => {
    await initDefaultPermissions();
    await initDefaultRoles();
    superAdmin = await Role.findOne({ name: 'super_admin' });
    admin1 = await User.create({ username: 'sock_admin_t1', email: 'sock_admin_t1@test.com', password: 'Pass1234', role: 'admin', roles: [superAdmin._id], tenantId: T1._id });
    player1 = await User.create({ username: 'sock_player_t1', email: 'sock_player_t1@test.com', password: 'Pass1234', tenantId: T1._id });
    room1 = await ChatRoom.create({ name: 'T1 room', slug: 't1-room', tenantId: T1._id });
  });
  await runWithTenant(T2._id, async () => {
    admin2 = await User.create({ username: 'sock_admin_t2', email: 'sock_admin_t2@test.com', password: 'Pass1234', role: 'admin', roles: [superAdmin._id], tenantId: T2._id });
    player2 = await User.create({ username: 'sock_player_t2', email: 'sock_player_t2@test.com', password: 'Pass1234', tenantId: T2._id });
    room2 = await ChatRoom.create({ name: 'T2 room', slug: 't2-room', tenantId: T2._id });
  });

  httpServer = http.createServer();
  io = new Server(httpServer);
  initSocket(io, {
    resolveSocketTenant: async (socket) => tenantByKey()[socket.handshake.auth?.tenantKey] || null,
  });
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${httpServer.address().port}`;
});

after(async () => {
  for (const client of clients) client.close();
  io.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('§8.5 tenant socket rooms', () => {
  it('T1 deposit activity reaches only the T1 admin room', async () => {
    const c1 = connect('/', { tenantKey: 't1', token: token(admin1, T1._id) });
    const c2 = connect('/', { tenantKey: 't2', token: token(admin2, T2._id) });
    await Promise.all([connected(c1), connected(c2)]);
    c1.emit('subscribe:admin', { token: token(admin1, T1._id) });
    c2.emit('subscribe:admin', { token: token(admin2, T2._id) });
    assert.equal(await waitForJoin(c1, adminRoom(T1._id)), true);
    assert.equal(await waitForJoin(c2, adminRoom(T2._id)), true);

    const denied = receives(c2, 'activity:new');
    const allowed = receives(c1, 'activity:new');
    await runWithTenant(T1._id, () => logActivity({
      type: 'deposit', userId: player1._id, status: 'completed', summary: 'T1 deposit', amount: 10,
    }));
    assert.equal(await allowed, true);
    assert.equal(await denied, false);
  });

  it('winners, online count and bot actions stay inside the tenant client room', async () => {
    const c1 = connect('/', { tenantKey: 't1' });
    const c2 = connect('/', { tenantKey: 't2' });
    await Promise.all([connected(c1), connected(c2)]);
    await new Promise((r) => setTimeout(r, 100));

    const t1Winner = receives(c1, 'winners:new');
    const t2Winner = receives(c2, 'winners:new');
    await runWithTenant(T1._id, () => addRecentWinner({ tenantId: T1._id, username: 't1sockwinner', gameId: 'crash', amount: 5 }));
    assert.equal(await t1Winner, true);
    assert.equal(await t2Winner, false);

    const t2Online = receives(c2, 'online:count');
    const t1Online = receives(c1, 'online:count');
    broadcastOnlineCount(T1._id);
    assert.equal(await t1Online, true);
    assert.equal(await t2Online, false);

    const t2Bot = receives(c2, 'bot:action');
    const t1Bot = receives(c1, 'bot:action');
    emitBotAction({ _id: new mongoose.Types.ObjectId(), username: 't1bot', tenantId: T1._id }, { betAmount: 1 });
    assert.equal(await t1Bot, true);
    assert.equal(await t2Bot, false);
  });

  it('a T1 player cannot join a T2 chat room', async () => {
    const c1 = connect('/chat', { tenantKey: 't1', token: token(player1, T1._id) });
    await connected(c1);
    const error = new Promise((resolve) => c1.once('chat:error', resolve));
    c1.emit('chat:join', { roomId: String(room2._id) });
    assert.equal((await error).code, 'ROOM_NOT_FOUND');

    const leak = receives(c1, 'chat:message');
    io.of('/chat').to(chatRoom(T2._id, room2._id)).emit('chat:message', { probe: true });
    assert.equal(await leak, false);

    c1.emit('chat:join', { roomId: String(room1._id) });
    assert.equal(await waitForJoin(c1, chatRoom(T1._id, room1._id), 'chat:message', '/chat'), true);
  });

  it('/live uses a tenant-prefixed room key', async () => {
    const p1 = connect('/live', { tenantKey: 't1', token: token(player1, T1._id) });
    const p2 = connect('/live', { tenantKey: 't2', token: token(player2, T2._id) });
    await Promise.all([connected(p1), connected(p2)]);
    p1.emit('live:subscribe', { gameId: 'inhouse-crash' });
    p2.emit('live:subscribe', { gameId: 'inhouse-crash' });
    assert.equal(await waitForJoin(p1, liveRoom(T1._id, 'inhouse-crash'), 'probe', '/live'), true);
    assert.equal(await waitForJoin(p2, liveRoom(T2._id, 'inhouse-crash'), 'probe', '/live'), true);

    const t1Update = receives(p1, 'game:update');
    const t2Update = receives(p2, 'game:update');
    subscribeToGameStream('probe-socket', 'inhouse-crash', T1._id);
    emitGameUpdate('inhouse-crash', { multiplier: 3 }, T1._id);
    assert.equal(await t1Update, true);
    assert.equal(await t2Update, false);
  });

  it('rejects a handshake whose tokenVersion was revoked', async () => {
    const oldToken = token(player1, T1._id);
    await User.updateOne({ _id: player1._id }, { $set: { tokenVersion: 1 } });
    const client = connect('/live', { tenantKey: 't1', token: oldToken });
    const error = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 3000);
      client.once('connect_error', (e) => { clearTimeout(timer); resolve(e); });
    });
    assert.ok(error, 'the handshake must be rejected');
    await User.updateOne({ _id: player1._id }, { $set: { tokenVersion: 0 } });
  });
});
```

- [ ] **Step 2: Run the suite and fix forward**

Run: `node --test --test-concurrency=1 server/test/tenantSocketRooms.test.js`
Expected: initially FAIL on at least one isolation assertion. Fix the owning task, not the test: room name in a service → Task 4; membership/resolver → Task 3; bot event → Task 7. Re-run until all five tests pass.

- [ ] **Step 3: Run the complete suite**

Run: `npm test`
Expected: PASS, including the migrated `socketRoomAuth`, `activityFeed`, `ticketNotifications`, `closeStaleGameSessions`, `liveGameStream` and `fakeWinners` suites.

- [ ] **Step 4: Commit**

```bash
git add server/test/tenantSocketRooms.test.js
git commit -m "test(socket): add the section 8.5 tenant room acceptance suite"
```

---

### Task 11: CHANGELOG and operator documentation

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/product/02-yapilandirma.md`
- Modify: `docs/product/11-admin-araclari.md`
- Modify: `docs/product/09-bilinen-kisitlar.md`

**Interfaces:**
- Consumes: the behavior delivered in Tasks 1–10.
- Produces: operator-facing documentation and a release note. No code.

- [ ] **Step 1: Add the changelog entry**

Under `## [Yayınlanmadı]`, add a Turkish entry following `docs/CHANGELOG_GUIDE.md`:

```markdown
### Değişen

- Çok kiracılı modda zamanlanmış işler (bonus/çevrim süresi, KYC süresi, kripto çekim uzlaştırma,
  kapanmış oyun oturumları) artık her kiracı için ayrı ve sıralı çalışıyor; etkinlik arşivleme
  platform kapsamında (`runAsPlatform`) yürüyor.
- Soket yayınları kiracı odalarına (`t:<tenantId>:admin`, `t:<tenantId>:clients`,
  `t:<tenantId>:chat:<roomId>`, `t:<tenantId>:live:<gameId>`) taşındı. `io.emit` ve `role:admin`
  odası lint ile yasaklandı.
- E-posta/SMS kampanya kitleleri kiracı filtresiyle çözülüyor; zamanlanmış gönderimler kiracı başına
  bir kez çalışıyor.
- Bot zamanlayıcısı iç loopback çağrısında kiracıyı (`X-Internal-Tenant`) taşıyor; botlar, sahte
  kazananlar ve demo verisi yalnız tek modda çalışır.
- Posta şablonu ve popüler oyun önbellekleri kiracı başına anahtarlanıyor.
```

Add a "Güvenlik" bullet if the repo's guide separates security fixes: the internal tenant header is accepted only from loopback with `INTERNAL_API_TOKEN`.

- [ ] **Step 2: Document configuration and operation**

In `docs/product/02-yapilandirma.md`, add a section "Çok kiracılı işler ve soketler" covering:

- `TENANCY_MODE` / `TENANCY_ENFORCEMENT` reminders relevant to jobs and sockets.
- `INTERNAL_API_TOKEN`: must be set in multi mode for bot loopback (even though bots do not run in multi, the middleware is the trust boundary); when unset, `X-Internal-Tenant` is ignored.
- The room naming scheme and the rule that staff `admin:activity:read` is evaluated in tenant scope.
- The job list and which one is platform-scoped (`event-cleanup`).

In `docs/product/11-admin-araclari.md`, add "Kiracı bazlı canlı bildirimler": each tenant's admin sees only its own activity/ticket/KYC/count events; the admin room is tenant-bound. Mention that campaign audiences never cross tenants.

In `docs/product/09-bilinen-kisitlar.md`, add: bots, fake winners and demo data are single-mode-only; in multi mode they are never started even if a `DEMO_*` flag is accidentally set.

- [ ] **Step 3: Verify the changelog check**

Run: `node scripts/check-changelog.mjs`
Expected: PASS. If the guide requires a different heading order, match the guide without changing the content.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md docs/product/02-yapilandirma.md docs/product/11-admin-araclari.md docs/product/09-bilinen-kisitlar.md
git commit -m "docs: document per-tenant jobs, sockets and caches"
```

---

## Self-Review Checklist

- **§7.1 coverage:** `forEachTenant` for scheduled jobs → Task 6; per-tenant socket rooms → Tasks 1, 3; global broadcasts narrowed → Task 4; campaign audiences → Task 5; bot scheduler tenant on loopback → Tasks 2, 7; per-tenant cache keys → Tasks 1, 8; §9 G-8 lint → Task 9; §8.5 acceptance → Task 10.
- **§9 G-2:** no unscoped query is introduced; platform cleanup is the only `runAsPlatform` call and carries `'event-cleanup'` from a frozen constant.
- **§9 G-3:** unchanged in this package; the socket/chat tests add the cross-tenant negative at the transport boundary.
- **§9 G-8:** `io.emit(` and `role:admin` have zero production occurrences at the end of Task 9; the scanner has no allow-list.
- **§9 G-10:** `resolveAudience` and `resolveRecipients` carry an explicit tenant filter; scheduled sends run under `forEachTenant`.
- **Single mode:** default tenant supplies every room/cache key; without G1, cache keys use `g:` and broadcasts are skipped, never widened. Existing single-mode tests are upgraded but their functional assertions remain.
- **No placeholders:** every task names exact files, function signatures, assertions and commands. The only runtime-dependent step is the acceptance suite's "fix forward" instruction, which points at the owning task instead of leaving a TODO.
