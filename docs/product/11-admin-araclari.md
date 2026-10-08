# Admin Operations Tools — Activity Feed, Demo Data, Casino Rewards

_Last verified: 2026-10-02 against `server/src/routes/admin.js`, `server/src/controllers/admin.js`, `server/src/services/activityFeed.js`, `server/src/services/demoData/`, `server/src/services/casinoPromo/`._

Three admin-panel tools added between 2026-09-22 and 2026-10-02. Each section covers what the tool does, which permission it needs, its endpoints, and what to watch out for.

| Tool | Panel location | Permission | Plan / design |
|---|---|---|---|
| Live activity feed | `/admin` (Dashboard) | `admin:activity:read` | `docs/superpowers/plans/2026-09-22-admin-activity-feed.md`, `specs/2026-09-22-admin-activity-feed-design.md` |
| Demo data | `/admin/demo-data` (sidebar group "Demo & Simulation") | `admin:demo-data:manage` | `docs/superpowers/plans/2026-09-23-admin-demo-data-seed.md`, `specs/2026-09-23-admin-demo-data-seed-design.md` |
| Casino rewards (bonus call + freeround) | `/admin/igames?tab=bonus` | `admin:casino:read` (view), `admin:casino:bonus` (grant/cancel) | `docs/superpowers/plans/2026-09-30-casino-promo-grants.md`, `specs/2026-09-30-casino-promo-grants-design.md`, implementation report `docs/superpowers/reports/2026-09-30-casino-promo-grants-report.md` |

Permissions are assigned under **Admin → Roles**. New permission keys such as `admin:activity:read` and `admin:demo-data:manage` are inserted into existing installations idempotently by `syncMissingPermissions()` (`server/src/services/permissions.js`), which also attaches them to the `super_admin` and `admin` roles.

---

## Live activity feed

The Dashboard's "Recent Activity" widget (`client/src/pages/admin/components/ActivityFeed.jsx`) shows what players are doing as it happens: money in and out, bets, in-house game sessions, KYC submissions and security events. It replaced the earlier AuditLog-based widget, which showed admin actions rather than player activity.

### Event types

Events are stored in `ActivityEvent` (`server/src/models/ActivityEvent.js`) and **deleted after 30 days** by a TTL index.

| `type` | Written by | When |
|---|---|---|
| `deposit`, `withdraw` | `createTransaction()` (`server/src/services/ledger.js`) | Any ledger entry whose `type` is exactly `deposit` or `withdraw` (bank approval, Slikair, the simple transactions route). Crypto entries use `crypto_deposit` / `crypto_withdraw` and **do not** appear. |
| `bet_placed`, `bet_settled` | `Bet` post-save hook (`server/src/models/Bet.js`) | Coupon created; coupon status changes to `won`, `lost` or `cancelled`. |
| `game_session` | `CasinoRound` post-save hook → `upsertGameSession()` | In-house rounds only. Rounds within 10 minutes of each other are folded into one session row (round count, total bet, net). Igames rounds are not included. |
| `kyc_submitted` | `server/src/services/kyc.js` | Player uploads KYC documents. |
| `risk_flag` | `server/src/services/riskEngine.js` | The risk engine opens a finding. |
| `login_risk` | `server/src/controllers/auth.js` | An account is locked after repeated failed logins. |

### Live updates

- `logActivity()` emits **`activity:new`** to the `role:admin` Socket.IO room; growing a game session emits **`activity:update`**. The widget does not poll.
- The admin panel joins `role:admin` by emitting `subscribe:admin` with its **access token**; the server checks the token's user is an admin (since 2026-10-03 — before that it trusted a client-supplied `userId`, see [09](09-bilinen-kisitlar.md#socket-rooms-trusted-the-clients-user-id--resolved-2026-10-03)).
- `server/src/jobs/closeStaleGameSessions.js` runs every 2 minutes and marks `game_session` rows that have been idle for 10 minutes as `ended`, emitting `activity:update`.
- Clicking a row expands its details. "View user" opens `/admin/users?openUser=<username>`, which opens the user's slide-over directly.
- The type filter in the widget works on the client side.
- The `summary` field is stored in Turkish for logs and direct DB inspection. The widget renders a localised text from `type` + `data` instead. A new event type must therefore put everything needed for rendering into `data`.

### Verifying it end to end

`server/scripts/verify-activity-feed.mjs` drives the feed in a browser against a **local** installation (it refuses a non-localhost `MONGODB_URI`): it approves a bank deposit and checks the row arrives over the socket without a reload, writes two in-house rounds and checks they fold into one session row, then opens a row's details and follows "View user" to the player's slide-over. Last run 2026-10-03: 8/8 PASS. On a live site, `server/scripts/verify-activity-feed-prod.mjs` runs the same three checks through the HTTP API and Socket.IO with a dedicated **test** account that is both admin and has a small balance (it creates a ₺10 deposit for that account and plays two ₺1 Dice rounds; it touches no other user). Last production run 2026-10-03: 10/10 PASS.

### Endpoints

| Method + Path | Permission | Notes |
|---|---|---|
| `GET /api/admin/activity` | `admin:activity:read` | Query: `type?`, `page` (default 1), `limit` (default 20, max 100). Returns `{ events, total, page, pages }`, newest first, `userId` populated with `username`. |
| `GET /api/admin/queues/counts` | `admin:activity:read` | Pending-work counters shared by the sidebar badges and Dashboard queue cards: `{ bank, crypto, tickets, kyc, riskFlags }`. Recomputed and pushed to `role:admin` whenever a queue item is processed. |

---

## Dashboard pending-finance table

The Dashboard's **Pending finance** card lists the approval queue: pending crypto deposits (`CryptoDeposit.status: 'pending_approval'`), pending crypto withdrawals and pending bank deposit/withdrawal requests, **longest waiting first**. Each row shows the player, the TRY amount (plus the USDT amount for crypto), the method, a risk tag and the waiting time. Risk tag: the player's risk-engine profile `HIGH`/`CRITICAL` → *High*; otherwise VIP level ≥ 2 → *VIP*; otherwise the profile level, or *Low* for KYC-approved players without a profile, else *Medium*. The *VIP* / *High* buttons filter on that tag.

Source: `GET /api/admin/queues/pending-finance?limit=` (`admin:transactions:read`, default 5, max 50) → `{ items: [{ ref, kind, userId, username, amount, usdtAmount, risk, status, createdAt }] }`, `server/src/services/pendingFinance.js`. Until 2026-10-03 the card read fields the old endpoints did not return, so player and amount showed "—" and risk was always *Medium*.

## Demo data

Fills an empty installation with realistic, removable data so the Dashboard, Analytics and list pages can be demonstrated or tested. It is unrelated to the older demo seeder library `server/src/demo/seedCore.js` (`demo_admin` / `demo_*` accounts), which has no runner since 2026-10-08: the development script that called it also deleted every user and created accounts with published passwords, so it was removed.

### How it is isolated

Every generated document carries `isSeed: true`. The field exists on 14 models: `User`, `Transaction`, `Bet`, `Event`, `CasinoRound`, `KycDocument`, `RiskEvaluation`, `RiskFinding`, `Ticket`, `Agent`, `ReferralCommission`, `BankDepositRequest`, `CryptoDeposit`, `SlikairPayment`. "Clear" deletes only `isSeed: true` documents, so real data is never touched. Generators make no external calls: no Slikair, no TronGrid, no Igames.

### Categories

`users` · `sports` · `casino` · `kyc` · `risk` · `tickets` · `agents` · `payments` (`server/src/services/demoData/registry.js`).

- **Load** writes `count` records (clamped to 1–10,000) spread over the **last 90 days** using `insertMany`. `insertMany` skips Mongoose post-save hooks on purpose, so the backfill does **not** flood the activity feed with historic events.
- Most categories pick from the existing seed-user pool, so load `users` first.
- **Clearing `users` clears everything**: the seven dependent categories are cleared first so that no orphaned `userId` references remain, and since 2026-10-03 the seed users' `ActivityEvent` rows (live-simulation output — that model has no `isSeed` flag) are deleted too, so the Dashboard feed returns to its pre-seed state. The "Clear all" button uses this path.

### Live simulation

When enabled, a background job (`server/src/jobs/demoDataLiveSimulation.js`) runs every `tickIntervalMinutes` (1–60, default 2). On each tick it picks one category, or two with 30 % probability, weighted casino 30 · sports 25 · users 20 · kyc 8 · risk 7 · tickets 5 · payments 4 · agents 1. It then creates records through the **real** entry points: `createTransaction()`, `new Bet().save()`, `new CasinoRound().save()`, plus `logActivity()` calls shaped exactly like production. As a result, new rows appear in the activity feed in real time.

- It refuses to start without at least one seed user (`400 NO_SEED_USERS`).
- It stops itself, and persists `enabled: false`, once the seed-user pool becomes empty.
- Its state is stored in `Setting` key `demoData.live.config`, and `server.js` restarts it after a reboot if it was enabled.

### Endpoints

All require `admin:demo-data:manage`.

| Method + Path | Body | Returns |
|---|---|---|
| `GET /api/admin/demo-data/status` | — | `{ categories: { <id>: { count, … } }, live: { enabled, tickIntervalMinutes } }` |
| `POST /api/admin/demo-data/:category/load` | `{ count }` | Generator result; `400 INVALID_CATEGORY` for an unknown id |
| `POST /api/admin/demo-data/:category/clear` | — | Generator result |
| `POST /api/admin/demo-data/live/start` | `{ tickIntervalMinutes? }` | `{ enabled: true, tickIntervalMinutes }` |
| `POST /api/admin/demo-data/live/stop` | — | `{ enabled: false }` |

### Verifying it end to end

`server/scripts/verify-demo-data-checklist.mjs` runs the plan's browser checklist with Playwright against a **local** installation (it refuses any non-localhost `MONGODB_URI`, because it loads and clears data): empty start → load 50 per category → Users/Wallet/Compliance/Tickets/Agents filled → Dashboard 90-day chart and Analytics KPIs move → live simulation pushes seed-only events into the feed → "Clear all" restores every collection count, leaves a real user untouched and leaves no orphaned feed rows. Usage and prerequisites are in the file header. Last run 2026-10-03: 18/18 PASS.

### Before you go live — read this

- **Seed data is counted in Dashboard, Analytics and the queue counters.** The `isSeed` exclusion filter was removed on purpose on 2026-09-23. Clear all demo data (`users` → Clear) before reporting real numbers.
- **Seed users cannot sign in** (since 2026-10-03). Login, `/auth/refresh` and every authenticated request reject `isSeed` accounts, and each load writes a random password hash that is never stored anywhere. Before that fix the users shared a password published in the source and some could log in — see [09 — Known Limitations](09-bilinen-kisitlar.md#demo-data-seed-users--resolved-2026-10-03). Migration `0003_rotate_seed_passwords` replaces the passwords of seed users created by older versions.

---

## Casino rewards — Bonus Call and Freeround

A tab under **Casino Management** where an admin can give Igames players two provider-side rewards, cancel them and see their full history. Every grant is recorded in `CasinoPromoGrant` (`server/src/models/CasinoPromoGrant.js`).

- **Bonus Call**: triggers a win of a chosen amount (`set_point`) in a session that is **currently open**. Only sessions from the provider's `online-games` list (connected within the last 30 minutes) can be selected, and only where the provider reports `call_enable`.
- **Freeround**: gives any player a number of free rounds in one game, at a fixed bet per round, until an expiry date.

The provider's own API definition is kept with the Casino Content add-on. Integration details are in the add-on's own documentation.

### Using the tab

- **Top strip:** the agent balance and currency, plus the provider's minimum bonus-call amount (`callMin`). The form warns if the agent balance may not cover the amount entered.
- **Bonus Call form:** pick an open session (sessions that cannot take a call are dimmed), enter an amount (at least `callMin`) and an optional memo.
- **Freeround form:** search for a player and a game, then set the number of rounds (default 10), the bet per round and the expiry (default now + 7 days). The "Advanced" section holds the provider's `win` field (leave at 0) and `scenario`.
- **Two-step confirm:** the submit button turns into "Confirm" for 5 seconds; there is no browser `confirm()` dialog.
- **History table:** filter by type, status and player; it refreshes every 15 s while the tab is visible. Clicking a row opens a drawer with every field, the error and the raw provider response.
- **Shortcut from a player:** the player slide-over has a "Give casino reward" button that opens `/admin/igames?tab=bonus&user=<username>`. That player is preselected in the Freeround form, their sessions are highlighted at the top of the Bonus Call list, and the history is filtered to them.

### Statuses

- Bonus Call: `pending → running → completed | cancelled | failed`
- Freeround: `pending → active → expired | cancelled | failed`

`expired` is never stored. It is computed when reading (`effectiveStatus`: `active` + `expiresAt ≤ now`). Running bonus calls are moved to `completed` from the provider's `online-games` data each time the online-plays list is fetched, and accumulated wins (`winTotal`) are added from the BonusCall (type 32) callback.

### Server-side limits

Defined in `server/src/services/casinoPromo/limits.js`:

| Limit | Value |
|---|---|
| Bonus call `set_point` | ≥ provider `call_min`, ≤ 100,000 |
| Freeround `rounds` | 1–500 |
| Freeround `bet × rounds` | ≤ 100,000 |
| Freeround expiry | in the future, ≤ 90 days |

### Endpoints

All are under `/api/admin`. Write endpoints also apply `blockDemoAdmin` and are audited as `CASINO_PROMO_GRANT` / `CASINO_PROMO_CANCEL`.

| Method + Path | Permission | Body / query |
|---|---|---|
| `GET /igames/online-plays` | `admin:casino:read` | Also syncs running bonus calls |
| `GET /igames/promo/config` | `admin:casino:read` | → `{ callMin, agentBalance, agentCurrency }` (a field is `null` if its provider call failed) |
| `GET /igames/promo/grants` | `admin:casino:read` | `kind?` (`bonusCall`/`freeRound`), `status?`, `username?`, `from?`, `to?`, `page?`, `limit?` (≤100) → `{ items, total, page, pages }` |
| `POST /igames/bonus/start` | `admin:casino:bonus` | `{ gplay_id, set_point, memo? }` |
| `POST /igames/bonus/cancel` | `admin:casino:bonus` | `{ grant_id }`. **Changed 2026-10-02:** the provider `call_id` is no longer accepted. |
| `POST /igames/freeround/create` | `admin:casino:bonus` | `{ user_id, provider_id, game_code, game_name?, rounds, bet, win (default 0), scenario?, expires_at (ISO), memo? }` |
| `POST /igames/freeround/cancel` | `admin:casino:bonus` | `{ grant_id }` |

### Error codes

Errors use the standard envelope `{ error: { code, message } }`. The client maps `code` to `admin.casinoPromo.errors.*`.

| Code | HTTP | Meaning |
|---|---|---|
| `PROMO_PERMISSION_DISABLED` | 403 | The provider has not enabled this feature for the agent account (provider code 1010). Ask the provider to enable it. |
| `PROMO_AGENT_BALANCE_LOW` | 402 | Agent balance too low (2005) |
| `PROMO_CALL_DUPLICATE` | 409 | A pending/running call already exists for this session, or the provider says so (2011). The provider is not called a second time. |
| `PROMO_CALL_ENDED` | 409 | The call already ended (2012). When cancelling, the grant is marked `completed` instead. |
| `PROMO_USER_NOT_FOUND` / `PROMO_GAME_NOT_FOUND` | 404 | |
| `PROMO_INVALID_PARAMS` | 400 | |
| `PROMO_BELOW_MIN` / `PROMO_ABOVE_MAX` / `PROMO_INVALID_EXPIRY` | 400 | Local limit checks; the provider is not called |
| `PLAY_NOT_ACTIVE` / `CALL_NOT_AVAILABLE` | 404 / 409 | The session is no longer online, or cannot take a call |
| `PROMO_NOT_CANCELLABLE` | 409 | The freeround has no provider `frId` (see below) |
| `PROMO_GRANT_NOT_FOUND` | 404 | |
| `PROMO_PROVIDER_BUSY` | 503 | Provider maintenance or busy (1, 1018) |
| `PROMO_PROVIDER_ERROR` | 502 | Any other provider failure |

A provider answer of HTTP 200 with `code ≠ 0` is treated as a failure: the grant is saved as `failed` with the raw response.

### Provider assumptions still to confirm

The provider has not documented these points. Each one is kept in a single constant or helper so it can be corrected in one place. After the first live grant, check the grant's `providerResponse`.

1. Freeround `expirationDate` is assumed to be Unix **seconds** (`FREEROUND_EXPIRATION_UNIT`).
2. The provider's `win` field has no documented meaning. Leave it at 0.
3. `freeround/create` may not return an id. Without `frId` the grant **cannot be cancelled** from the panel (`PROMO_NOT_CANCELLABLE`).
4. Freeround winnings arrive as ordinary Win callbacks, so a freeround's `winTotal` stays `null` ("—" in the table). Bonus-call wins are matched by `call_id`.
