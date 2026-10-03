# Known Limitations

_Last verified: 2026-10-03 (documentation audit, then updated after the code fixes of PR #132; earlier verification 2026-09-17 after the PAM/Risk-Fraud Completion plan). Items below marked RESOLVED 2026-10-03 were checked in the core code; where a fix lives in an add-on submodule (`server/src/premium/*`, not checked out in the documentation worktree) it is stated from the fix reports and was not re-read here._

This document lists features that are **defined but not end-to-end connected** or **partially functional** in the codebase. The goal is for the operator to be aware of this before encountering a situation where "I see a field/service in the panel but the behavior isn't what I expected." Each item has been verified by reading the relevant code.

**Resolved since the last pass, no longer limitations:** the Agent/reseller admin UI (previously only an HTTP API existed with no way to use it — `client/src/pages/admin/Agents.jsx` now provides agent creation, player assignment, commission transfer, PR #76), Agent-to-player fund transfer is now fully atomic on BOTH sides (the player-side credit was still read-modify-write outside any DB transaction until the 2026-09-17 final review caught it — both legs now run inside a `mongoose` session via `withTransactionRetry`, mirroring `bank.js approve`), Responsible Gaming daily/weekly/monthly limit tracking (previously dead code — `updateDailyStats` is now wired into the deposit and bet-placement flows, rewritten with an atomic reset+`$inc` pattern that is safe under concurrent requests, and extended to weekly/monthly buckets), the RG player-facing UI (previously nonexistent — `client/src/pages/ResponsibleGaming.jsx` now lets players set deposit/loss/wager limits and activate cool-off/self-exclusion), the Reconciliation admin UI (previously nonexistent despite a complete backend — `client/src/pages/admin/Reconciliation.jsx` now provides job creation, start, item review and resolution), and the Sumsub webhook timestamp header (previously optional — now mandatory, closing a replay-protection gap). Full detail: `docs/superpowers/plans/2026-09-16-pam-risk-completion.md`.

## Commercial scope: what is core and what is a paid add-on

The core platform (accounts, wallet, bonus/wagering, KYC, risk, admin) is the base product. **In-house Games (13 games), Sports Betting and Casino Content are separate paid add-ons** (private submodules under `server/src/premium/`); the core starts without them (`503 MODULE_NOT_INSTALLED` on their routes). Installation steps: [01 — Installation § Add-on modules](01-kurulum.md#add-on-modules-in-house-games-sports-betting-casino-content). The game front end (`game-host`) and the odds service (`odds-provider`) are separate Node apps, not in Docker Compose and still outside the deploy workflow. The add-on submodules themselves now ship with the deploy (`SUBMODULE_PAT` is set; its Contents: Read access also covers the `bet` repo and may be narrowed later — see [RUNBOOK § Deployment](../RUNBOOK.md#deployment-production)).

## Live Casino — planned, not in this release

Live dealer tables/video games are a planned future update. There is no `live-casino` entry in `server/src/modules/registry.js`, no connector and no gate; nothing about it appears in the admin Modules screen.

## Casino content provider — bonus call needs a provider-side permission

`POST /api/admin/igames/bonus/start` calls the provider's `call_start`. If the feature is not enabled for your agent account at the provider, the provider answers `PERMISSION_ERROR` (code 1010); the platform maps it to `403 PROMO_PERMISSION_DISABLED` and the admin UI shows "This feature is disabled for your account at the provider" (`server/src/services/casinoPromo/providerErrors.js`). Ask your aggregator to enable bonus calls for the agent before relying on **Casino Provider → Bonus & Freeround**.

## Casino content provider — freeround API is not documented by the provider

The provider's freeround endpoints (`freeround/create`, `freeround/cancel`) are not documented, so two details are assumptions that still await live verification (`server/src/services/casinoPromo/grants.js`, `limits.js`):

- **`expirationDate` format** — sent as Unix **seconds** (`FREEROUND_EXPIRATION_UNIT = 'seconds'`); if the provider expects milliseconds, change that one constant.
- **`fr_id` return** — the provider may not return a freeround id in the create response. When it does (`fr_id`/`frId`/`id`) it is stored; without it the grant cannot be cancelled from the panel (`409 PROMO_NOT_CANCELLABLE`).

Until verified against the live provider, treat freeround grants as experimental.

## Cloudflare Turnstile and admin IP allowlist — RESOLVED 2026-10-03

Both are implemented and **off by default**. Turnstile turns on when `TURNSTILE_SECRET_KEY` and `TURNSTILE_SITE_KEY` are both set (register, login, forgot-password; the client renders the widget); `ADMIN_ALLOWED_IPS` turns on the `/api/admin/*` IP/CIDR restriction (`403 ADMIN_IP_NOT_ALLOWED`). Still open for the operator: behind Cloudflare and another proxy the real client IP may not reach `req.ip` (use proxy real-IP handling or `ADMIN_IP_TRUST_CF_HEADER=true` only if the origin accepts Cloudflare traffic only), and the admin login endpoint (`/api/auth/login`, `/api/auth/2fa`) is outside the allowlist. See [02 — Configuration](02-yapilandirma.md).

## KYC — withdrawal gate RESOLVED 2026-10-03

With the `kyc-verification` module enabled, every player withdrawal (bank, transactions, crypto) requires an approved KYC (`403 KYC_REQUIRED`, `server/src/middleware/kycGate.js`), and `expireOldKyc()` now runs daily. What remains: with the module disabled (the default on a new install) nothing is required; deposits and bets are never gated by KYC; the older `checkKycRequired`/`requireKyc` helpers (amount-based `KYC_REQUIREMENTS`) are still unused.

## Casino provider routes and setup wizard keys — RESOLVED 2026-10-03

`/api/igames/*` now also accepts a token saved from **Settings → Modules → Casino Content** (and the health check sees panel-saved SMTP/Igames credentials). The setup wizard writes the real keys the site reads (`branding.siteName`, `currency.code`, selected modules); the currency is limited to the registered TRY/USD/EUR. (The Igames fix is add-on code, taken from the fix report.)

## i18n — 6 languages have 3 untranslated blocks each

`client/src/i18n/dictionaries/` has 8 languages with 3000 keys each; `tr` and `en` are complete. In `ko`, `th`, `es`, `ja`, `pt` and `de` three blocks are still English text, each marked `// TODO: bu bloğu <dil>'e çevir`: the admin dashboard payment/KPI cards, the casino-statistics labels, and the In-house Games module card. Everything else in those files is translated (roughly one fifth of the strings equal the English text, mostly brand names and numbers).

## Deployment gaps — RESOLVED 2026-10-03

- `npm run install:all` / `dev` / `dev:games` / `build:game-host` skip missing add-on directories with a warning (`scripts/optional-run.mjs`).
- The Docker image now copies `docs/product/` and `CHANGELOG.md` (the chatbot's knowledge base); `.env.docker.example` lists the core and add-on variable groups.
- Odds: there is no third-party odds API in the code any more (the legacy The Odds API client and `dataSync` job were deleted); odds come only from the odds-provider service. `ODDS_API_KEY`/`ODDS_API_SPORT` are gone from the code; `ODDS_PROVIDER` is not wired to anything.
- Still open: `game-host` and `odds-provider` are not built or updated by the deploy, and `odds-provider/.env.example` says `PORT=3003` while the code default is 3002.

## Agent (reseller) system — IMPLEMENTED (API + admin UI)

The agent/reseller system is now fully implemented, API through UI:

- **Model**: `server/src/models/Agent.js` — Agent model with balance, commission rates, player ownership
- **Service**: `server/src/services/agent.js` — Create/update agents, assign players, transfer funds, pay commissions
- **Routes**: `server/src/routes/agent.js` — Admin API for agent management
- **Controller**: `server/src/controllers/agent.js` — Full CRUD operations, fund transfer wrapped in a DB transaction
- **Admin UI**: `client/src/pages/admin/Agents.jsx` — list/paginate agents, create agent, assign player, transfer commission
- **Commission**: Automatic commission on player losses, configurable rates per agent

The system supports:
- Creating agents from existing users
- Assigning players to agents
- Agent-to-player fund transfers with dual transaction records, both sides atomic (`$gte + $inc` on the agent side since 2026-09-16, `$inc` on the player side since 2026-09-17) and the whole transfer wrapped in one DB transaction (2026-09-17)
- Commission calculation and payment
- Agent statistics and player management
- Service-layer errors now mapped to proper HTTP status codes (404/400/409) — 2026-09-17

## Affiliate/referral system is single-tier

`server/src/services/referralCommission.js` contains `payReferralCommission(userId, houseProfit)`. When a user plays bets/games and generates house profit, a percentage of the house profit — `REFERRAL_SETTINGS.commissionRate` in `server/src/config/referral.js`, **default 10%**, adjustable from the admin panel via `GET/PUT /admin/referral/settings` (permission `admin:referral:rates`), with an `enabled` switch — is paid **only to the person who directly invited that user**:

```js
const commission = parseFloat((houseProfit * REFERRAL_SETTINGS.commissionRate / 100).toFixed(2));
...
const referrer = await User.findByIdAndUpdate(
  bettor.referredBy,
  { $inc: { balance: commission, totalReferralEarnings: commission } },
  ...
);
```

There's no mechanism to walk up the `bettor.referredBy` chain and also pay 2nd or 3rd tier referrers — the system is a flat single-tier "you brought them, you earn" model (`GET /admin/users/:id/referral-tree` returns a read-only 3-level tree for viewing; it pays nothing). If you're looking for a multi-tier affiliate/MLM structure, this requires additional development.

## Financial ledger — double writes RESOLVED 2026-10-03

`server/src/services/ledger.js` (`createTransaction`) provides idempotency protection and currency stamping. A 2026-09-16 audit counted 18 raw `Transaction.create()` sites; the 2026-09-17 migrations covered the admin balance, bank approve, bet win settlement, promotion claim and the crypto/vip/referral/agent/in-house/Igames sites listed in the changelog. A 2026-10-03 re-check found that several of those still wrote a raw `Transaction.create()` row **and** a `createTransaction()` row for the same event (crypto withdrawal reject, VIP cashback/level-up, referral and agent commissions, Igames session close). PR #132 removed the raw writes: each event now produces one idempotent ledger row (`server/test/ledger-singleWrite.test.js`, `igamesSessionLedger.test.js`). `routes/crypto.js` was already single-write (only comments mention the old call). `vip.js` also lacked a `getIO` import, which made `payCashback` throw; fixed.

Duplicate protection for commissions/cashback now derives its key from the source event: `payReferralCommission`, `payCashback` and `payAgentCommission` accept `sourceId`, build the idempotency key from it and check for an existing transaction **before** touching the balance. **Remaining limit:** the core passes `sourceId` only from the in-house `CasinoRound` post-save hook. The sports settlement and Igames session callers (add-on code) were not seen passing it in the main checkout (settlement calls `payReferralCommission(..., { session })` / `payCashback(...)` without it), and without `sourceId` the old behaviour applies (every call counts as a separate payout, key contains `Date.now()`). Passing `sourceId` from those add-on callers is open work.

Other items kept from the earlier pass: `admin.js updateBalance` uses a per-call unique key, so a double-click still double-credits; a client-generated request id would be needed for real dedup there.

## RG daily/weekly/monthly limit tracking — RESOLVED 2026-09-17

`server/src/services/responsibleGaming.js`'s `updateDailyStats()` was dead code (never called) as of the last pass. It is now wired into all major channels:

- **Deposit tracking:** `bank.js approve`, `crypto.js check-deposit` auto-credit, `admin.js approveCryptoDeposit` — all call `updateDailyStats(userId, 'deposit', amount)` after successful deposit
- **Wager tracking:** `bets.js` (sports), `premium/inhouse-provider/inhouseProviderProxy.js` debit (in-house games), `premium/igames/igames.js handleIgamesBet` (Igames) — all call `updateDailyStats(userId, 'wager', amount)`
- **Loss tracking:** `premium/betting/settlement.js` (sports), `premium/inhouse-provider/inhouseProviderProxy.js` settle (in-house games) — calls `updateDailyStats(userId, 'loss', bet - payout)` when payout < bet
- **Atomic reset:** `updateDailyStats` uses atomic conditional `$set` period-resets + a single `$inc` (safe under concurrent requests)
- **Weekly/monthly buckets:** `weeklyStats`/`monthlyStats` on the User model, exposed in player UI via period selector
- **Player UI:** `ResponsibleGaming.jsx` now supports daily/weekly/monthly period selection, limit removal (0 value), and shows all period stats
- **RG audit:** `restrictAccount`/`liftRestriction` now write to `AuditLog` with `category: 'responsible_gaming'`

**Igames loss tracking — RESOLVED (verified 2026-10-03):** the Igames callback has no explicit "round result" event, so `premium/igames/igames.js` counts every Bet as a full loss first (`updateDailyStats(..., 'loss', amount)`), subtracts it again when the matching Win arrives (`handleIgamesWin`) and reverses both wager and loss on BetCancel (`handleIgamesBetCancel`). Net loss therefore converges to the real value without an extra provider signal.

## RG audit log — RESOLVED 2026-09-17

`getResponsibleGamingAudit` now queries the real `AuditLog` service with `category: 'responsible_gaming'`. The `restrictAccount` and `liftRestriction` functions now write `AuditLog` entries with `action: 'RESPONSIBLE_GAMING_RESTRICT'` and `'RESPONSIBLE_GAMING_LIFT'` respectively, and the `actorUsername` field is populated with the admin's ID. Audit log entries are written with `.catch()` to avoid breaking the main operation on audit failure.

## Multi-brand data isolation — not enforced

`server/src/services/multiBrand.js` provides brand CRUD and domain lookup. The risk subsystem supports `brandScope` filtering. However, **core business models** (`User`, `Transaction`, `Bet`, `CasinoRound`, `Agent`) have **no `brandId` field**. The system operates as a single-brand deployment. If a second brand is deployed with separate user pools, `brandId` must be added to core models before data isolation can be enforced.

## Sumsub webhook timestamp — RESOLVED 2026-09-17

`server/src/routes/sumsubWebhook.js` previously validated the `x-app-timestamp` header only if present. A missing header now returns `401 Missing timestamp header` — the existing age check (reject if older than 5 minutes) is unchanged. Verified with a real HTTP-level test (`server/test/sumsub.test.js`, a real `express()` app on an ephemeral port).

## Slikair payment gateway — sandbox only, no live KYB

`server/src/services/slikairService.js` / `server/src/controllers/slikairController.js` / `server/src/routes/slikair.js` (merged 2026-09-17) provide a full deposit gateway integration — user deposit initiation, payin/payout webhook processing, admin payment/payout views (`client/src/pages/admin/SlikairPayments.jsx`), and ledger integration via `createTransaction()`.

**The integration only works against Slikair sandbox credentials.** Accepting real, live payments requires KYB (company documents, gaming license) with Slikair plus commercial pricing negotiation — **neither has been completed**. The code path is production-ready; the underlying merchant account is not. Do not enable this in production until the sandbox `SLIKAIR_MERCHANT_ID`/`SLIKAIR_MERCHANT_TOKEN`/`SLIKAIR_SITE_ID` are swapped for real, live-approved credentials.

Two related production incidents were fixed the same day this was merged: `getWebhookUrl()` defaulted to a non-existent `api.vip90.bet` subdomain (NXDOMAIN — webhooks could never reach the server) and the `uuid` package was used but never declared in `server/package.json`, crash-looping the server in production (`Cannot find package 'uuid'`, 60+ systemd restarts) until it was replaced with `node:crypto`'s built-in `randomUUID()`. `server/src/server.js` also gained global `unhandledRejection`/`uncaughtException` handlers as an independent hardening fix found the same day.

**Webhook signature is NOT verified — mitigated by cross-verification (commit `9abead7`, present in the code as of 2026-10-03):** the webhook endpoints (`/api/slikair/webhook/payin`, `/payout`) receive no signature/HMAC from Slikair (not documented anywhere by Slikair, OpenAPI spec marks the notification endpoints `security: []`); `SLIKAIR_WEBHOOK_SECRET` exists in the config but no code verifies anything with it. The protection is therefore not a signature check: Instead, `handlePayinWebhook`/`handlePayoutWebhook` now cross-verify every webhook claiming `succeeded` against Slikair's own `/payment/get-status` (`/payouts/get-status`) API — a merchant-credentialed server-to-server call a forged webhook cannot spoof — checking status **and** amount/currency match before crediting. On a mismatch the payment is left in `processing` (never written as `succeeded`, so a later genuine webhook is not silently swallowed by the idempotency check) and logged via `errorLogger.critical` for admin review. Previously, anyone who knew a valid `payin_id` (e.g. from their own real deposit attempt) could POST a forged "succeeded" webhook and be credited without ever paying. The residual risk is that the endpoints stay unauthenticated (anyone can trigger a get-status call and fill the critical-error log), and that the protection depends entirely on Slikair's get-status API being reachable and correct.

**Deposit risk check — RESOLVED 2026-10-03:** `POST /api/slikair/deposit` now runs `enforceRiskCheck('deposit')` (order: module gate, auth, validation, risk check, controller — same as the bank deposit; `server/src/routes/slikair.js`, `server/test/slikairDepositRisk.test.js`). There is still no player withdrawal endpoint for Slikair (admin payout only), so the KYC withdrawal gate does not apply to it.

## Reconciliation — one real channel (crypto, via TronGrid), two still stubbed (bank, Slikair)

`client/src/pages/admin/Reconciliation.jsx` (added 2026-09-17) provides job creation, starting a job, reviewing/resolving items. The backend (model/service/controller/routes) already existed and is fully wired. What an operator should know before relying on this:

- **`cryptoDeposit` job type — RESOLVED 2026-09-18, real external source.** TRC20/USDT deposits are already public on-chain, so no third-party integrator was needed — `controllers/reconciliation.js`'s `fetchCryptoExternalRecords()` derives every crypto-depositing user's TRON address (`User.cryptoDepositIndex` → `deriveDepositAddress()`) and queries TronGrid's own `fetchIncomingUSDT()` (the same function `POST /api/crypto/check-deposit` already uses) for each one, filtered to the job's `dateRange`. Internal side compares against `CryptoDeposit` (not `Transaction` — its `usdtAmount` is in USDT, matching TronGrid's units directly, so no TRY-conversion-rate drift can cause a false mismatch), keyed by `txHash`. Because TronGrid has no per-address batch endpoint, one request is made per address; `CRYPTO_ADDRESS_FETCH_CAP = 300` fails the job loudly (not a silent truncation) if the crypto user base exceeds that in one job, matching the existing `INTERNAL_FETCH_CAP` safety pattern. A per-address TronGrid failure is skipped and logged via `errorLogger.critical('reconciliation_crypto_fetch_partial', ...)` rather than failing the whole job — but that means the job's `missing_internally` count can undercount if any address failed; check the critical-error log before treating a `cryptoDeposit` job's summary as complete. This is also the first channel where "missing internally" is a real, actionable signal: an on-chain deposit for which `check-deposit` was never triggered by the user (money arrived, nobody claimed it) now surfaces as `missing_internally` instead of being invisible. Tests: `server/test/reconciliation.test.js` (new, 6 tests — normalization, date-range filtering, partial-failure resilience, the 300-address cap, and full matched/amount-mismatch/missing-internally/status-mismatch classification via `reconciliationService.startReconciliationJob`).
- **Bank and Slikair channels — still a stub, no integrator yet.** `startJob`'s fetcher falls back to `mockFetchExternal = async () => []` for every job type other than `cryptoDeposit`. Every non-crypto job you start today will still report 100% of internal records as "dışarıda eksik" (missing externally). A 2026-09-17 research pass into real sources for these two channels found:
  - **Bank (manual Ziraat Bankası transfers, see below)**: Turkey's regulated Open Banking standard (ÖHVPS, run by TCMB) offers account-information APIs that could supply a real transaction feed. Two commercial providers package this as a ready integration rather than building ÖHVPS access from scratch: **Payfoni** (supports Ziraat Bankası, read-only PSD2-style API, ~3-5 min data latency, webhook on their Premium tier) and **Finrota** (also ÖHVPS-based, plus its own description-parsing/reference-matching reconciliation layer — more than needed here, since `compareRecords` already does our matching). Neither is wired in; this is a vendor-selection decision, not a code task.
  - **Slikair does not fill this gap either.** Slikair (see below) is a payment gateway providing one deposit channel (card/crypto/open-banking); it is not a reconciliation/settlement-feed source, and needs its own gap closed separately: its public OpenAPI spec documents only `payment/create`, `payment/get-status`, `payouts/create`, `payouts/get-status` — no bulk transaction list or settlement-report endpoint. Their dashboard ("Pulse"/"Insights") appears to offer this only as a UI export, not an API. Closing this channel means asking Slikair's account team for a settlement-report API or SFTP feed (a normal ask for PSPs), not something discoverable from their published docs.
- **Date range is now required when creating a job** (added 2026-09-17, after a job created without one was found to trigger an unconstrained fetch of an entire collection) — plus a 5,000-record hard cap as a second safety layer. A job whose match exceeds the cap fails loudly with an explanatory error rather than silently reconciling a truncated set.
- A resolve action's outcome (`resolved`/`dismissed`/`escalated`) is stored in a separate `resolutionStatus` field, not the item's diagnostic `status` field (which classifies *what kind* of discrepancy it is — `matched`/`missing_internally`/`amount_mismatch`/etc). This split was added 2026-09-17 after the two were found merged into one field, which made every resolve action fail with a validation error.

