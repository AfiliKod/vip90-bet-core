# Module System

VIP90.bet's core platform (13 in-house games, user management, bonus/wagering engine, basic admin panel) is always enabled — it's fully functional after purchase, no additional steps needed.

Three additional modules are **sold/licensed separately**:

| Module | ID | What it provides | What it blocks in the API |
|---|---|---|---|
| **Betting** | `betting` | Sports + live betting: odds feed, coupon, automatic settlement | `/api/events`, `/api/bets` |
| **Casino Content** | `casino-content` | Slot and table games via an aggregator | `/api/casino` |
| **Live Casino** | `live-casino` | Real dealer table and video games | *(no connected route yet — see below)* |

## Current state

This is no longer just an architectural intent — it's a real system that can actually be toggled from the panel and is enforced at the API level. It consists of four parts:

### 1. Module registry and key

`server/src/modules/registry.js` defines three modules (`MODULE_DEFINITIONS`) and a fail-closed `moduleStore` for each: if the DB can't be read, **all modules are considered closed** ("a payment/betting module staying open in an immeasurable way is worse than appearing accidentally closed" — comment in the file).

`server/src/modules/index.js` establishes a real DB connection to this registry: each module's enabled/disabled status is stored in the existing `Setting` collection under the `module.<id>.enabled` key (no new schema was opened). `setModuleEnabled(id, enabled, updatedBy)` writes this key and invalidates the 30-second TTL cache.

### 2. License validation service

`server/src/services/licensing/` consists of two files:

- `registry.js` — `createLicenseStore()`: uses the same DI/TTL pattern as the module store but **the failure direction is intentionally reversed**. Modules are fail-**closed** (if DB is down, all are closed); the license is fail-**tolerant** — if the central license server is temporarily unreachable, the last known valid state is preserved for `graceMs` (default 72 hours). Rationale: a temporary network outage shouldn't close all of an operator's modules. However, if the license's `expiresAt` has expired, the module closes **locally** (without needing the network).
- `index.js` — production connection. If `LICENSE_SERVER_URL` and `LICENSE_KEY` env variables are defined, status is fetched from the central server via `GET {LICENSE_SERVER_URL}/license?key=...` in the form `{ "<moduleId>": { valid, expiresAt } }`. **If NOT defined, the product runs in "unmanaged mode": all defined modules are automatically considered valid.** This is a deliberate design decision (code comment: *"The installed product must work out of the box; central enforcement only kicks in when an operator wants to connect to a license server"*) — so if you buy this repo and run it without ever defining `LICENSE_SERVER_URL`/`LICENSE_KEY`, the license gate never blocks you; the only gate is the on/off switch in the admin panel.

  `isModuleUsable(id)` checks both gates: a module must be **both** enabled on the panel **and** licensed (`moduleStore.isEnabled(id) && licenseStore.isLicensed(id)`). If Mongo isn't connected, it returns `false` without even entering the query.

### 3. API gate: `moduleGate`

`server/src/middleware/moduleGate.js` ensures that when a module is disabled, the relevant route group returns a meaningful 503 instead of 404:

```js
res.status(503).json({
  error: { code: 'MODULE_DISABLED', module: moduleId, message: 'This section is currently unavailable.' }
});
```

If the `isUsable()` call throws an error (e.g., DB inaccessible), the gate stays on the safe side and still returns 503 — it never behaves as "open when uncertain".

This gate is currently wired in `server/src/app.js` as follows:

```js
const requireBetting       = createModuleGate({ isUsable: isModuleUsable, moduleId: 'betting' });
const requireCasinoContent = createModuleGate({ isUsable: isModuleUsable, moduleId: 'casino-content' });

app.use('/api/events', requireBetting, eventsRoutes);
app.use('/api/bets',   requireBetting, betsRoutes);
app.use('/api/casino', requireCasinoContent, casinoRoutes);
```

So for example, if you disable the `betting` module from the admin panel, from that moment on **every** request under `/api/events/*` and `/api/bets/*` (including already logged-in users) gets `503 MODULE_DISABLED`; the rest of the core platform (in-house games, bonus, wallet) is unaffected.

**Known gap:** The `live-casino` module ID is defined in the registry and the license/panel key is queryable, but today there is no route/feature that actually disables it — the real dealer live casino integration hasn't been written in the repo yet, so there's no `requireLiveCasino` gate either. Disabling this module in the panel currently doesn't change any API behavior.

### 4. Admin screen

`client/src/pages/admin/Modules.jsx` is a real toggle screen using the `GET /admin/modules` (list), `PATCH /admin/modules/:id` (toggle with `{ enabled }` body), and `POST /admin/modules/refresh` (invalidates both caches and refreshes) endpoints (`server/src/controllers/modules.js`).

Flow:

1. When the screen opens, `GET /admin/modules` is called; the response returns `{ id, title, description, enabled, licensed, licenseSource, licenseExpiresAt }` for each module — `enabled` is the panel key, `licensed` is the result of the license service.
2. Each row has a switch (`role="switch"`); on click, `PATCH /admin/modules/:id { enabled: !enabled }` is sent and the response directly updates the screen (no separate reload).
3. A license badge is shown — one of three states:
   - **"License: verified"** (green, `source: 'live'`) — fresh data came from the central server (or if you're in unmanaged mode, all modules default to this state).
   - **"License: cached — central server unreachable"** (yellow, `source: 'cached'`) — the central server can't be reached but the system is operating with the last known valid state within the grace window.
   - **"License: unverified"** (red, `source: 'closed'`) — neither fresh nor cached valid state exists; the module is considered closed by the license.
4. If the panel key is enabled but the license is closed, an additional red **"Unlicensed — closed to visitors"** badge appears — meaning in the `enabled=true, licensed=false` state the API gate is still closed (`isModuleUsable` requires both gates).
5. The **"↻ Refresh Status"** button calls `POST /admin/modules/refresh`; this instantly invalidates both module and license TTL caches (useful e.g., if a change was made on the license server and you want to reflect it without waiting 30 seconds).

## Supply model

The betting and casino modules depend on third-party data/content providers — therefore require a separate commercial relationship from the platform itself. If you're a licensed operator, you're expected to contract directly with an aggregator; if the licensing process is ongoing, discuss alternative supply options with the sales team.

## More

For known product limitations not covered by the module system (KYC flow, agent system, multi-tier affiliate, VIP cashback, etc.), see [09 — Known Limitations](09-bilinen-kisitlar.md).