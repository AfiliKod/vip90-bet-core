# Known Limitations

_Last verified: 2026-09-17 (after PAM/Risk-Fraud Completion plan + final whole-branch review)._

This document lists features that are **defined but not end-to-end connected** or **partially functional** in the codebase. The goal is for the operator to be aware of this before encountering a situation where "I see a field/service in the panel but the behavior isn't what I expected." Each item has been verified by reading the relevant code.

**Resolved since the last pass, no longer limitations:** the Agent/reseller admin UI (previously only an HTTP API existed with no way to use it — `client/src/pages/admin/Agents.jsx` now provides agent creation, player assignment, commission transfer, PR #76), Agent-to-player fund transfer is now fully atomic on BOTH sides (the player-side credit was still read-modify-write outside any DB transaction until the 2026-09-17 final review caught it — both legs now run inside a `mongoose` session via `withTransactionRetry`, mirroring `bank.js approve`), Responsible Gaming daily/weekly/monthly limit tracking (previously dead code — `updateDailyStats` is now wired into the deposit and bet-placement flows, rewritten with an atomic reset+`$inc` pattern that is safe under concurrent requests, and extended to weekly/monthly buckets), the RG player-facing UI (previously nonexistent — `client/src/pages/ResponsibleGaming.jsx` now lets players set deposit/loss/wager limits and activate cool-off/self-exclusion), the Reconciliation admin UI (previously nonexistent despite a complete backend — `client/src/pages/admin/Reconciliation.jsx` now provides job creation, start, item review and resolution), and the Sumsub webhook timestamp header (previously optional — now mandatory, closing a replay-protection gap). Full detail: `docs/superpowers/plans/2026-09-16-pam-risk-completion.md`.

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

`server/src/services/referralCommission.js` (37 lines) contains a single function: `payReferralCommission(userId, houseProfit)`. When a user plays bets/games and generates house profit, a fixed **10%** of the house profit is paid **only to the person who directly invited that user**:

```js
const commission = parseFloat((houseProfit * 0.10).toFixed(2));
...
const referrer = await User.findByIdAndUpdate(
  bettor.referredBy,
  { $inc: { balance: commission, totalReferralEarnings: commission } },
  ...
);
```

There's no mechanism to walk up the `bettor.referredBy` chain and also pay 2nd or 3rd tier referrers — the system is a flat single-tier "you brought them, you earn" model. If you're looking for a multi-tier affiliate/MLM structure, this requires additional development.

## Financial ledger — partial coverage (updated 2026-09-17)

`server/src/services/ledger.js` (`createTransaction`) provides idempotency protection and currency stamping. A 2026-09-16 audit found the actual count of raw `Transaction.create()` call sites was **18**, not the previously-estimated ~11. The 4 highest-traffic/highest-risk sites have since been migrated:

- ✅ `admin.js` — `updateBalance` (bonus/credit/debit) — migrated 2026-09-17, `admin_balance_<userId>_<uuid>` key (unique per call, not a retry-dedup key — a double-click still double-credits; recommend a client-generated request id if real dedup is needed here)
- ✅ `bank.js` — `approve` (bank deposit/withdrawal) — migrated 2026-09-17, `bank_approve_<recordId>` key (real retry-dedup)
- ✅ `settlement.js` — bet win settlement — migrated 2026-09-17, `bet_win_<betId>` key (real retry-dedup)
- ✅ `promotions.js` — promotion claim — migrated 2026-09-17, `promo_claim_<promoId>_<userId>` key (real retry-dedup; the idempotency check runs before the balance mutation, not after, to avoid a balance-leak on the rare manual-re-claim path)

**Batch 2 migrated (2026-09-17):**
- ✅ `crypto.js` — check-deposit auto-credit, pending-approval, withdraw-request auto, withdraw-request pending (4 sites) — migrated, `crypto_deposit_<txHash>`, `crypto_deposit_pending_<txHash>`, `crypto_withdraw_<txHash>`, `crypto_withdraw_pending_<userId>_<uuid>` keys
- ✅ `admin.js` — `rejectCryptoWithdrawal` — migrated, `crypto_withdraw_reject_<txId>` key
- ✅ `vip.js` — cashback, level-up reward (3 sites) — migrated, `vip_cashback_<userId>_<ts>`, `vip_levelup_<userId>_<levelId>` keys
- ✅ `referralCommission.js` — commission payout — migrated, `referral_commission_<userId>_<ts>` key
- ✅ `referral.js` — admin-approved commission — migrated, `referral_approve_<commissionId>` key
- ✅ `agent.js` — `payAgentCommission` — migrated, `agent_commission_<agentId>_<playerId>_<ts>` key
- ✅ `inhouseProviderProxy.js` — debit/settle callbacks — migrated + wrapped in `withTransactionRetry` session (atomicity fix), `inhouse_bet_<gameId>_<roundId>`, `inhouse_win_<gameId>_<roundId>` keys
- ✅ `igamesSession.js` — session settlement — migrated, `igames_session_close_<sessionId>` key

**All 18 original raw `Transaction.create()` sites are now migrated to `createTransaction()`.** Remaining raw calls in `ledger.js` itself (the implementation) and in test fixtures are expected.

## RG daily/weekly/monthly limit tracking — RESOLVED 2026-09-17

`server/src/services/responsibleGaming.js`'s `updateDailyStats()` was dead code (never called) as of the last pass. It is now wired into all major channels:

- **Deposit tracking:** `bank.js approve`, `crypto.js check-deposit` auto-credit, `admin.js approveCryptoDeposit` — all call `updateDailyStats(userId, 'deposit', amount)` after successful deposit
- **Wager tracking:** `bets.js` (sports), `inhouseProviderProxy.js` debit (in-house games), `igames.js handleIgamesBet` (Igames) — all call `updateDailyStats(userId, 'wager', amount)`
- **Loss tracking:** `inhouseProviderProxy.js` settle (in-house games) — calls `updateDailyStats(userId, 'loss', bet - payout)` when payout < bet
- **Atomic reset:** `updateDailyStats` uses atomic conditional `$set` period-resets + a single `$inc` (safe under concurrent requests)
- **Weekly/monthly buckets:** `weeklyStats`/`monthlyStats` on the User model, exposed in player UI via period selector
- **Player UI:** `ResponsibleGaming.jsx` now supports daily/weekly/monthly period selection, limit removal (0 value), and shows all period stats
- **RG audit:** `restrictAccount`/`liftRestriction` now write to `AuditLog` with `category: 'responsible_gaming'`

**Residual gap (documented 2026-09-17, not yet closed):**
- **3rd-party casino (Igames) loss tracking:** Igames callback API does not provide explicit "round result" events — only Bet/Win/BetCancel/BonusCall types. Loss is inferred from a Bet with no corresponding Win, which is a design decision requiring separate handling. Deferred to a follow-up.

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

**Webhook signature gap — RESOLVED 2026-09-17 (commit `9abead7`, `dev` branch):** the webhook endpoints (`/api/slikair/webhook/payin`, `/payout`) still receive no signature/HMAC from Slikair (confirmed: not documented anywhere by Slikair, OpenAPI spec marks the notification endpoints `security: []`), so this was not "fixed" by adding a signature check. Instead, `handlePayinWebhook`/`handlePayoutWebhook` now cross-verify every webhook claiming `succeeded` against Slikair's own `/payment/get-status` (`/payouts/get-status`) API — a merchant-credentialed server-to-server call a forged webhook cannot spoof — checking status **and** amount/currency match before crediting. On a mismatch the payment is left in `processing` (never written as `succeeded`, so a later genuine webhook is not silently swallowed by the idempotency check) and logged via `errorLogger.critical` for admin review. Previously, anyone who knew a valid `payin_id` (e.g. from their own real deposit attempt) could POST a forged "succeeded" webhook and be credited without ever paying. Not yet on `main` as of 2026-09-17.

**One open gap remains, found during a 2026-09-17 documentation audit, not yet fixed:**
- The deposit route (`POST /api/slikair/deposit`) does not run the `enforceRiskCheck` fraud/risk-rule engine pre-transaction (unlike crypto deposit / in-house launch, see `RISK_FRAUD_REPORT.md` F17/F18). Only the inline Responsible Gaming eligibility check runs before submission; a risk signal is emitted post-hoc after the webhook credits the deposit. This is unrelated to the webhook-signature gap above (already resolved) — it's about the risk-rule engine (velocity/shared-IP/etc. checks) not being consulted before the deposit is submitted to Slikair at all.

## Reconciliation — one real channel (crypto, via TronGrid), two still stubbed (bank, Slikair)

`client/src/pages/admin/Reconciliation.jsx` (added 2026-09-17) provides job creation, starting a job, reviewing/resolving items. The backend (model/service/controller/routes) already existed and is fully wired. What an operator should know before relying on this:

- **`cryptoDeposit` job type — RESOLVED 2026-09-18, real external source.** TRC20/USDT deposits are already public on-chain, so no third-party integrator was needed — `controllers/reconciliation.js`'s `fetchCryptoExternalRecords()` derives every crypto-depositing user's TRON address (`User.cryptoDepositIndex` → `deriveDepositAddress()`) and queries TronGrid's own `fetchIncomingUSDT()` (the same function `POST /api/crypto/check-deposit` already uses) for each one, filtered to the job's `dateRange`. Internal side compares against `CryptoDeposit` (not `Transaction` — its `usdtAmount` is in USDT, matching TronGrid's units directly, so no TRY-conversion-rate drift can cause a false mismatch), keyed by `txHash`. Because TronGrid has no per-address batch endpoint, one request is made per address; `CRYPTO_ADDRESS_FETCH_CAP = 300` fails the job loudly (not a silent truncation) if the crypto user base exceeds that in one job, matching the existing `INTERNAL_FETCH_CAP` safety pattern. A per-address TronGrid failure is skipped and logged via `errorLogger.critical('reconciliation_crypto_fetch_partial', ...)` rather than failing the whole job — but that means the job's `missing_internally` count can undercount if any address failed; check the critical-error log before treating a `cryptoDeposit` job's summary as complete. This is also the first channel where "missing internally" is a real, actionable signal: an on-chain deposit for which `check-deposit` was never triggered by the user (money arrived, nobody claimed it) now surfaces as `missing_internally` instead of being invisible. Tests: `server/test/reconciliation.test.js` (new, 6 tests — normalization, date-range filtering, partial-failure resilience, the 300-address cap, and full matched/amount-mismatch/missing-internally/status-mismatch classification via `reconciliationService.startReconciliationJob`).
- **Bank and Slikair channels — still a stub, no integrator yet.** `startJob`'s fetcher falls back to `mockFetchExternal = async () => []` for every job type other than `cryptoDeposit`. Every non-crypto job you start today will still report 100% of internal records as "dışarıda eksik" (missing externally). A 2026-09-17 research pass into real sources for these two channels found:
  - **Bank (manual Ziraat Bankası transfers, see below)**: Turkey's regulated Open Banking standard (ÖHVPS, run by TCMB) offers account-information APIs that could supply a real transaction feed. Two commercial providers package this as a ready integration rather than building ÖHVPS access from scratch: **Payfoni** (supports Ziraat Bankası, read-only PSD2-style API, ~3-5 min data latency, webhook on their Premium tier) and **Finrota** (also ÖHVPS-based, plus its own description-parsing/reference-matching reconciliation layer — more than needed here, since `compareRecords` already does our matching). Neither is wired in; this is a vendor-selection decision, not a code task.
  - **Slikair does not fill this gap either.** Slikair (see below) is a payment gateway providing one deposit channel (card/crypto/open-banking); it is not a reconciliation/settlement-feed source, and needs its own gap closed separately: its public OpenAPI spec documents only `payment/create`, `payment/get-status`, `payouts/create`, `payouts/get-status` — no bulk transaction list or settlement-report endpoint. Their dashboard ("Pulse"/"Insights") appears to offer this only as a UI export, not an API. Closing this channel means asking Slikair's account team for a settlement-report API or SFTP feed (a normal ask for PSPs), not something discoverable from their published docs.
- **Date range is now required when creating a job** (added 2026-09-17, after a job created without one was found to trigger an unconstrained fetch of an entire collection) — plus a 5,000-record hard cap as a second safety layer. A job whose match exceeds the cap fails loudly with an explanatory error rather than silently reconciling a truncated set.
- A resolve action's outcome (`resolved`/`dismissed`/`escalated`) is stored in a separate `resolutionStatus` field, not the item's diagnostic `status` field (which classifies *what kind* of discrepancy it is — `matched`/`missing_internally`/`amount_mismatch`/etc). This split was added 2026-09-17 after the two were found merged into one field, which made every resolve action fail with a validation error.

