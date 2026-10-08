# Module System

VIP90.bet's core platform (accounts, wallet, bonus/wagering engine, KYC, risk and compliance tools, basic admin panel) is always enabled — it is fully functional after purchase, no additional steps needed, and it starts even when none of the add-ons below are present.

Three **paid add-ons** are sold/licensed separately and live in private git submodules under `server/src/premium/` (installation: [01 — Installation § Add-on modules](01-kurulum.md#add-on-modules-in-house-games-sports-betting-casino-content)). Four more modules ship with the core. All seven can be switched on and off from **Settings → Modules**:

| Module | ID | How it ships | What it provides | What it blocks in the API |
|---|---|---|---|---|
| **Sports & Live Betting** | `betting` | Paid add-on (`premium/betting`) | Odds feed, coupon, automatic settlement | `/api/events`, `/api/bets` |
| **Casino Content** | `casino-content` | Paid add-on (`premium/igames`) | Slot and table games via an aggregator | `/api/casino` (the aggregator's own `/api/igames` routes are **not** behind this gate, see below) |
| **In-house Games** | `inhouse-games` | Paid add-on (`premium/inhouse-provider`) | 13 provably fair games served from a separate game host | `/api/inhouse-provider` (launch and wallet callback) |
| **Crypto Payment Gateway** | `crypto-payment` | Core | USDT-TRC20 deposits and withdrawals | `/api/crypto` |
| **Slikair Payment Gateway** | `slikair-payment` | Core, exempt from the licence check | Card and alternative-method deposits via Slikair | `POST /api/slikair/deposit` (webhooks and payment history are not gated) |
| **KYC Identity Verification** | `kyc-verification` | Core | Manual document review or Sumsub | `/api/kyc` |
| **SMS Gateway** | `sms-gateway` | Core | System and campaign SMS via Twilio | No HTTP gate: while it is off, event SMS are skipped (`MODULE_DISABLED` in the log) and test/campaign sends answer `SMS_MODULE_DISABLED`. Only the panel switch counts; the licence check is not applied |
| **Live Casino** *(planned — future update)* | — | — | Real dealer table and video games | *(not in this release — see below)* |

**New installations start with every module switched off** except `slikair-payment`: a module with no stored switch counts as disabled (the server seeds only Slikair as enabled at start). After installing, open **Settings → Modules** and enable what you use; otherwise the matching routes answer `503 MODULE_DISABLED`.

## Current state

This is no longer just an architectural intent — it's a real system that can actually be toggled from the panel and is enforced at the API level. It consists of four parts:

### 1. Module registry and key

`server/src/modules/registry.js` defines seven modules (`MODULE_DEFINITIONS`: `betting`, `casino-content`, `inhouse-games`, `crypto-payment`, `slikair-payment`, `kyc-verification`, `sms-gateway`) and a fail-closed `moduleStore` for each: if the DB can't be read, **all modules are considered closed** ("a payment/betting module staying open in an immeasurable way is worse than appearing accidentally closed" — comment in the file). A module with no stored switch is also closed. `slikair-payment` carries `licenseExempt: true` (it is the operator's own payment method, not a sold add-on): the licence check never closes it, only the panel switch does.

`server/src/modules/index.js` establishes a real DB connection to this registry: each module's enabled/disabled status is stored in the existing `Setting` collection under the `module.<id>.enabled` key (no new schema was opened). `setModuleEnabled(id, enabled, updatedBy)` writes this key and invalidates the 30-second TTL cache. `seedDefaultEnabledModules()` runs at server start and inserts `module.slikair-payment.enabled = true` only if no record exists (it never overrides an existing value).

### 2. License validation service

`server/src/services/licensing/` consists of two files:

- `registry.js` — `createLicenseStore()`: uses the same DI/TTL pattern as the module store but **the failure direction is intentionally reversed**. Modules are fail-**closed** (if DB is down, all are closed); the license is fail-**tolerant** — if the central license server is temporarily unreachable, the last known valid state is preserved for `graceMs` (default 72 hours). Rationale: a temporary network outage shouldn't close all of an operator's modules. However, if the license's `expiresAt` has expired, the module closes **locally** (without needing the network).
- `index.js` — production connection. If `LICENSE_SERVER_URL` and `LICENSE_KEY` env variables are defined, status is fetched from the central server via `GET {LICENSE_SERVER_URL}/license?key=...` (5-second timeout); the response must be JSON of the form `{ "modules": { "<moduleId>": { "valid": true, "expiresAt": <ms timestamp or null> } } }` — a response without the `modules` object is rejected. **If NOT defined, the product runs in "unmanaged mode": all defined modules are automatically considered valid.** This is a deliberate design decision (code comment: *"the installed product must work out of the box; central enforcement only kicks in when an operator wants to connect to a license server"*) — so if you run it without ever defining `LICENSE_SERVER_URL`/`LICENSE_KEY`, the license gate never blocks you; the only gate is the on/off switch in the admin panel.

  `isModuleUsable(id)` checks both gates: a module must be **both** enabled on the panel **and** licensed (`moduleStore.isEnabled(id) && licenseStore.isLicensed(id)`). If Mongo isn't connected, it returns `false` without even entering the query.

### 3. API gate: `moduleGate`

`server/src/middleware/moduleGate.js` ensures that when a module is disabled, the relevant route group returns a meaningful 503 instead of 404:

```js
res.status(503).json({
  error: { code: 'MODULE_DISABLED', module: moduleId, message: 'Bu bölüm şu anda kullanılamıyor.' }
});
```

If the `isUsable()` call throws an error (e.g., DB inaccessible), the gate stays on the safe side and still returns 503 — it never behaves as "open when uncertain".

This gate is currently wired in `server/src/app.js` as follows:

```js
const requireBetting         = createModuleGate({ isUsable: isModuleUsable, moduleId: 'betting' });
const requireCasinoContent   = createModuleGate({ isUsable: isModuleUsable, moduleId: 'casino-content' });
const requireInhouseGames    = createModuleGate({ isUsable: isModuleUsable, moduleId: 'inhouse-games' });
const requireCryptoPayment   = createModuleGate({ isUsable: isModuleUsable, moduleId: 'crypto-payment' });
const requireKycVerification = createModuleGate({ isUsable: isModuleUsable, moduleId: 'kyc-verification' });

app.use('/api/events', requireBetting, eventsRoutes);
app.use('/api/bets',   requireBetting, betsRoutes);
app.use('/api/casino', requireCasinoContent, casinoRoutes);
app.use('/api/inhouse-provider', requireInhouseGames, inhouseProviderProxyRoutes); // 503 MODULE_NOT_INSTALLED if the add-on is absent
app.use('/api/crypto', requireCryptoPayment, cryptoRoutes);
app.use('/api/kyc',    requireKycVerification, kycRoutes);
```

`slikair-payment` is gated inside `server/src/routes/slikair.js` (`POST /deposit`) and on the admin payout creation route. Not covered by any module gate: `/api/igames` (it answers `503` itself when the provider token is not configured or the add-on is missing) and `/api/provider/v1` (the game host's own API, protected by operator API keys and session tokens).

So for example, if you disable the `betting` module from the admin panel, from that moment on **every** request under `/api/events/*` and `/api/bets/*` (including already logged-in users) gets `503 MODULE_DISABLED`; the rest of the core platform (wallet, bonus, account) is unaffected.

**Add-on not installed:** if a paid add-on's code is absent, the server still starts. `/api/igames`, `/api/inhouse-provider` and `/api/provider/v1` then answer `503 MODULE_NOT_INSTALLED`, and the betting sync jobs, game engine and Igames reconciliation simply do not start.

**Planned:** Live Casino is a future update, not part of this release. There is no `live-casino` entry in `server/src/modules/registry.js`, no live-dealer connector and no `requireLiveCasino` gate yet; it does not appear on the admin Modules screen.

### 4. Admin screen

`client/src/pages/admin/Modules.jsx` is a real toggle screen, shown as the **Modules** tab of **Settings** (`/admin/platform?tab=modules`; the old `/admin/modules` path redirects there). It uses the `GET /admin/modules` (list), `PATCH /admin/modules/:id` (toggle with `{ enabled }` body; `400` for a non-boolean value or an unknown id), and `POST /admin/modules/refresh` (invalidates both caches and refreshes) endpoints (`server/src/controllers/modules.js`). The visitor-facing availability list is `GET /api/modules`.

Flow:

1. When the screen opens, `GET /admin/modules` is called; the response returns `{ id, title, description, enabled, licensed, licenseSource, licenseExpiresAt }` for each module — `enabled` is the panel key, `licensed` is the result of the license service. Each module is one card; its **connection settings** (the odds-provider token for betting, aggregator credentials and default language for casino content, the in-house provider API key rotation and languages/currencies, crypto thresholds, Sumsub/KYC provider choice, Slikair credentials, Twilio credentials and sender for SMS) are in the card's expandable body. The last card, **Email Gateway**, is not a module: it is part of the core, cannot be switched off as a module, and holds the SMTP/Mailgun settings; the switch in its header chooses between the panel values and the server's `.env` SMTP values ([02 — Configuration § Email](02-yapilandirma.md#email)). Business settings (categories, popular games, allowed games) are on the product pages: **Products → Sportsbook / Casino Provider / In-house Games**.
2. Each card has a switch (`role="switch"`); on click, `PATCH /admin/modules/:id { enabled: !enabled }` is sent and the response directly updates the screen (no separate reload).
3. The cards no longer show a licence-state badge (removed 2026-10-07); `licenseSource` (`live`, `cached` within the grace window, `closed`) is still returned by the API.
4. If the panel key is enabled but the license is closed, a red **"Unlicensed — hidden from visitors"** badge appears — meaning in the `enabled=true, licensed=false` state the API gate is still closed (`isModuleUsable` requires both gates).
5. The **"↻ Refresh Status"** button calls `POST /admin/modules/refresh`; this instantly invalidates both module and license TTL caches (useful e.g., if a change was made on the license server and you want to reflect it without waiting 30 seconds).

## Supply model

The three paid add-ons are separate commercial products from the core platform. Beyond that, the betting and casino modules depend on third-party data/content providers (an odds feed; a casino content aggregator) — which require their own commercial relationship. If you're a licensed operator, you're expected to contract directly with them; if the licensing process is ongoing, discuss alternative supply options with the sales team. The In-house Games add-on needs no third-party contract.

## More

For known product limitations not covered by the module system (KYC flow, agent system, multi-tier affiliate, VIP cashback, etc.), see [09 — Known Limitations](09-bilinen-kisitlar.md).