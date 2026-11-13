# İP-9e: PSP refunds and chargebacks (Slikair) — implementation plan

> **For agentic workers:** implement the tasks in order in one branch; each task ends green on its own tests.

**Goal:** stop ignoring Slikair `refunded` / `chargeback` notifications on credited deposits; reverse the player's
balance, record the chargeback, flag the account, and feed real chargeback data into `TenantDailyStat` and NGR (K28).

**Owner decision (2026-11-13):** follow industry practice. On a verified chargeback the deposit amount is debited from
the player's balance even if it goes negative; a negative balance blocks withdrawals and bets (they already require
funds); the account is flagged for risk review and admins are notified. On a verified PSP refund the amount is debited
the same way but the account is not flagged and it is not a chargeback.

**Facts from the Slikair v2 spec** (`https://doc.slikair.com/v2/openapi.yaml`):
- Payin webhook `status`: `processing | succeeded | failed | refunded | chargeback`; `status_code` is nullable and is
  a gateway response code, not a lifecycle state. Fields: status, status_code, reason_code (failed only), payin_id,
  merchant_reference, payment_method, amount, currency, decline_reason.
- `get-status` returns the same lifecycle (`initiated | processing | succeeded | failed | kyc_required | refunded |
  chargeback`), so a refund/chargeback webhook can be verified like a succeeded one.
- Webhooks are unsigned (`security: []`). No chargeback fee, dispute id, reason or date is reported.
- v2 `status_code` 320 means "BIN Block enforced" (a decline); the current code maps 320 → `refunded` (v1-era table).

## Global constraints

- The webhook body never moves money by itself: `refunded` / `chargeback` on a `succeeded` payment is acted on only
  after `get-status` (with that tenant's credentials, as today for `succeeded`) returns the same status and the same
  amount/currency; otherwise the claim is stored in `metadata.unverified...` and nothing moves.
- Idempotent: one reversal per payin (`idempotencyKey: slikair_chargeback_<tenant|single>_<payinId>` /
  `slikair_refund_...`), inside one DB transaction with the balance change (same pattern as the deposit credit).
  A refund followed by a chargeback for the same payin reverses the money once (the second records status only).
- Lifecycle decisions use the `status` string; `status_code` is stored for information only. Remove the v1 code table
  from decision making (320 must never mean refunded).
- Tenancy: everything runs in the payment's tenant (existing `callbackTenantId` / `runWithTenant`); single mode keeps
  working without a tenant.
- No money is invented: `TenantDailyStat.chargebacks` sums verified chargeback transactions only; refunds are not
  chargebacks. `providerFees` stays 0 (no source).
- Do NOT run the full root `npm test`; run the task's files with `--test-timeout=60000`. Fixture e-mails
  `*.example.com`. Public brand-neutral core.

## Task 1 — Slikair status handling, reversal and records (server)

Files: `server/src/controllers/slikairController.js`, `server/src/models/SlikairPayment.js` (status enum adds
`chargeback`; fields `reversedAt`, `reversalTransactionId`, `reversalType`), `server/src/models/Transaction.js` (type
enum adds `chargeback`, `deposit_refund`), new `server/src/services/pspReversal.js`
(`reverseCreditedDeposit({ payment, kind: 'chargeback'|'refund', amount, currency, session })` → debits the player with
`adjustBalance(userId, -amount)` without `requireFunds`, writes the Transaction with `relatedTransactionId` = the
original deposit transaction, sets the payment fields; for `chargeback` also raises a risk signal through the existing
risk engine (`evaluateRisk(playerId, 'chargeback', {...})` or the closest existing API — read riskEngine.js) and
`logActivity({ type: 'deposit_chargeback', ... })` for the admin feed; refunds log `deposit_refund` without a risk
flag). Tests `server/test/slikairChargeback.test.js` with get-status mocked:
- chargeback webhook on a succeeded payin + get-status chargeback → balance −amount (may go negative), one
  `chargeback` Transaction linked to the deposit, payment `status: 'chargeback'`, risk signal + activity written;
- the same webhook again → no second debit;
- chargeback webhook but get-status still `succeeded` → nothing moves, claim stored as unverified;
- refund webhook verified → `deposit_refund` debit, no risk flag; a later verified chargeback for the same payin →
  status updated, no second debit;
- `status_code: 320` with `status: 'failed'` → payment `failed`, never `refunded`;
- chargeback for a payin that was never credited (status failed/pending) → status recorded, no money moves;
- a negative balance blocks a withdrawal request and a bet (existing requireFunds paths) — assert with the real
  services/routes used by the existing withdrawal and bet tests.

## Task 2 — Data for NGR (server)

Files: `server/src/services/tenantDailyStat.js` (fill `chargebacks` = sum of |amount| of completed `chargeback`
transactions per tenant/day/currency; add `chargebackCount` to the model and fill it), `server/src/models/TenantDailyStat.js`,
`server/src/platform/services/ngrRules.js` (+ `STAT_FIELD_CATEGORY.chargebackCount` is NOT a money field: add a fixed
period `per_chargeback` instead: amount × that day's `chargebackCount`, category must be `chargeback` or `other`),
`server/src/platform/services/commissionCalculator.js` (support `per_chargeback`). A `chargeback` category item may use
either `stat_field: chargebacks` (the reversed amounts) or `fixed` with `per_chargeback` (the PSP fee per case), but
these are two different costs: allow one `chargeback` item (amounts) plus fee items under `other` with a distinct label,
and reject two `chargeback` items as today. Tests: aggregation counts only `chargeback` transactions (not
`deposit_refund`, `refund`, `reversal`); a per_chargeback fee of 15 with 3 chargebacks deducts 45 on that day; existing
NGR tests stay green unchanged.

## Task 3 — Admin visibility, docs, changelog

- Tenant admin: the existing Slikair admin deposit list/detail shows `refunded` / `chargeback` and the reversal
  transaction (server response + client admin page where the deposit status is rendered; read the code).
- Docs (Turkish): `docs/providers/` Slikair document (or the closest existing provider doc) — statuses, verification,
  reversal behaviour, negative balance, risk flag, no fee from the PSP (configure `per_chargeback`); `docs/product/12-cok-operator.md`
  if present (NGR chargeback data now real); `docs/product/09-bilinen-kisitlar.md` (remove "chargebacks have no source";
  keep providerFees).
- CHANGELOG `[Yayınlanmadı]`: `### Slikair iade ve chargeback bildirimleri artık işleniyor` with **Düzeltildi** and
  **Kırılan Değişiklikler** (balances can now go negative after a chargeback; withdrawals/bets blocked until settled;
  `TenantDailyStat.chargebacks` now filled).
