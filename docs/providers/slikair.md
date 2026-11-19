# Slikair Payment Provider

## Verification, States, and Risk Review

A Slikair notification alone never moves money. Core calls `get-status` with the operator's own credentials and requires the event to match the stored deposit by status, amount, and currency. `processing`, `succeeded`, and `failed` are provider lifecycle states. A verified `refunded` reverses the prior deposit with `deposit_refund`; a verified `chargeback` reverses it with `chargeback` and opens a `PSP_CHARGEBACK` risk finding. Authorised risk staff can review, resolve, or dismiss that finding in the Risk screen.

The reversal is idempotent: a chargeback received after a refund can update the payment status but never posts a second debit. A chargeback can create a negative balance; balance-sufficiency checks block new bets and withdrawals.

## Fees and NGR Configuration

The Slikair webhook does not provide a PSP fee amount. A verified chargeback amount becomes `chargebacks` in daily statistics and the event count becomes `chargebackCount`. If the contract has a per-case PSP charge, define it in NGR as a separately labelled `other` item with `fixed` source and `per_chargeback` period. Casino-provider GGR fees are separate: `ProviderFeeSchedule` stores the provider, `rateOfGgr`, currency, date, and optional monthly minimum. An operator-specific schedule overrides the platform default; a provider with negative GGR has no daily fee; the monthly minimum is not applied during daily calculation.

Slikair deposit notifications are unsigned. Therefore `succeeded`, `refunded`, and `chargeback` notifications cannot change a balance by themselves: core calls `get-status` using that tenant's Slikair credentials and requires status, amount, and currency to match the stored deposit.

## States and Reversals

- `processing`, `succeeded`, and `failed` are provider lifecycle states only; `status_code` is retained for information and does not decide the lifecycle. In particular, `320` is a BIN-block/decline code, not a refund.
- A verified `refunded` notification reverses an already credited deposit with a `deposit_refund` ledger row.
- A verified `chargeback` notification reverses the same transaction with a `chargeback` ledger row, sends the account to risk review, and notifies the administrator activity feed.
- The reversal, original deposit, and payment record are written in the same database transaction with one idempotency key per payin. A chargeback after a refund changes only the payment status; it does not debit again.

If a chargeback puts the balance below zero, balance-sufficiency checks block new withdrawal and bet requests; the operator must review the account until the debt is settled.

`TenantDailyStat.chargebacks` aggregates only the absolute amount of completed, verified `chargeback` ledger rows; `chargebackCount` aggregates the event count. `deposit_refund`, general `refund`, and `reversal` rows are not chargebacks. Because the Slikair notification has no fee source, `providerFees` remains zero. If the contract requires a per-case PSP charge, configure a separately labelled `other` NGR item with `fixed` + `per_chargeback`.
