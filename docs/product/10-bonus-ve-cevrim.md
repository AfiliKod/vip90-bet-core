# Bonus and Wagering — Locked Balance Model

_Last verified: 2026-10-02 against `server/src/services/wagering.js`, `server/src/controllers/promotions.js`, `server/src/controllers/admin.js` (`updateBalance`), `server/src/controllers/transactions.js` and `server/src/controllers/bank.js`._

This document explains how a bonus behaves once it is granted: where the money goes, when it can be withdrawn, how wagering progresses and what happens when a player withdraws before finishing. The model was introduced on 2026-07-09 (plan: `docs/superpowers/plans/2026-07-08-bonus-playable-lockbalance.md`, design: `docs/superpowers/specs/2026-07-08-bonus-playable-lockbalance-design.md`).

## The model in one paragraph

A granted bonus is added **directly to the player's real `balance`** and can be played immediately — on sports bets, in-house games and the Igames casino (which takes the whole `balance` at launch). The bonus amount is **locked**: it cannot be withdrawn until the bonus's wagering requirement is complete. Nothing in the betting or casino code paths knows about bonuses; the lock is enforced only at withdrawal.

Before 2026-07-09 the bonus sat in a separate `bonusBalance` pool that could not be spent at all, so a player whose only money was a bonus could never play, and wagering never progressed.

## Terms

| Term | Meaning | Source |
|---|---|---|
| `balance` | Real money **plus** every granted bonus. This is what games and bets spend. | `User.balance` |
| `locked` | Sum of `bonusAmount` over the player's `BonusWagering` records with `status: 'active'`. Computed on every read; there is no stored field. | `getLockedAmount(userId)` |
| `withdrawable` | `max(0, balance − locked)` | `getSpendableBreakdown(userId)` |
| `bonusBalance` | Kept only as a display mirror of `locked`. It is no longer a spendable pool. | `User.bonusBalance` |

The `POST /api/auth/login` and `POST /api/auth/refresh` responses carry `locked` and `withdrawable` next to `balance` (`enrichWithLockedBalance` in `server/src/controllers/auth.js`). The header balance shows a "locked" badge when `locked > 0`.

## How a bonus is granted

| Path | Wagering requirement | Deadline | Ledger entry |
|---|---|---|---|
| Player claims a promotion — `POST /api/promotions/:id/claim` | `promo.amount × promo.wageringMultiplier` (default ×35) | `promo.deadlineDays` (default 30) | `type: 'bonus'`, idempotency key `promo_claim_<promoId>_<userId>` (a second claim returns `409`) |
| Admin sends a bonus — `PATCH /api/admin/users/:id/balance` with `type: 'bonus'` | `amount × 35` (fixed) | 30 days (fixed) | `type: 'bonus'`, key `admin_balance_<userId>_<uuid>` |

Both paths `$inc` the real `balance` and create one `BonusWagering` record (`status: 'active'`). Admin bonuses are recorded with `source: 'admin_adjustment'`.

## How wagering progresses

Every settled stake calls `recordWagering(userId, gameType, amount)`:

- sports bets — `server/src/controllers/bets.js` (`gameType: 'sports'`)
- Igames and in-house rounds — the `CasinoRound` post-save hook (`casino_slot` / `inhouse`)

Each active wagering record gets `amount × weight` added to `wageringProgress`, capped at `wageringRequired`. Default weights (`DEFAULT_WEIGHTS` in `wagering.js`); a promotion can override them with `gameWeights`:

| `gameType` | Weight |
|---|---|
| `sports` | 1.0 |
| `casino_live` | 0.7 (defined, but no code path records this type today) |
| `casino_slot` | 0.5 |
| `inhouse` | 0.5 |

When progress reaches the requirement the record becomes `completed`, drops out of `locked`, and the bonus money is withdrawable. Nothing is added to `balance` at that moment because it is already there. `POST /api/promotions/:id/wagerings/:wid/convert` and `convertBonus()` remain for backward compatibility; on a completed record they only refresh the mirror and never credit twice.

## Withdrawing while a bonus is active

`POST /api/transactions/withdraw` and the bank withdrawal request (`createWithdraw` in `bank.js`) both run the same gate:

1. If `amount ≤ withdrawable`, the request proceeds normally and the bonus is untouched.
2. If `amount > withdrawable` and there is no active bonus, the response is `400 INSUFFICIENT_BALANCE`.
3. If `amount > withdrawable` and a bonus is active, the response is **`409 ACTIVE_BONUS_LOCK`** with a message naming the locked amount. The client shows a confirmation dialog and, if the player agrees, repeats the request with `confirmForfeit: true`.
4. With `confirmForfeit: true` the server first calls `previewForfeitAmount()`, which changes nothing. If even after forfeiting the requested amount would not be withdrawable, it rejects with `400 INSUFFICIENT_BALANCE` and the bonus is kept. A forfeit cannot be undone, so it is never triggered when it would not help.
5. Otherwise `forfeitActiveWagerings()` marks every active record `forfeited` and removes the **unwagered share** of each bonus from `balance`, writing one `type: 'bonus_forfeit'` ledger entry:

```
forfeitAmount = bonusAmount × (wageringRequired − wageringProgress) / wageringRequired
```

The share already wagered stays with the player.

## Deneme Bonusu (trial promotion)

`server/scripts/add-deneme-bonusu-promotion.mjs` creates a ready-made trial promotion. It is idempotent: if a promotion titled "Deneme Bonusu" exists, the script skips it.

| Field | Value |
|---|---|
| `type` | `trial` |
| `amount` | 100 |
| `minOdds` | 1.8 |
| `wageringMultiplier` | 35 |
| `deadlineDays` | 30 |

```bash
node server/scripts/add-deneme-bonusu-promotion.mjs
```

After it is created, the promotion is edited like any other from **Admin → Promotions** (`GET/POST/DELETE /api/admin/promotions`).

## One-off operational scripts (already run on the reference deployment)

Both scripts default to `--dry-run` and write only with `--commit`.

- `server/scripts/migrate-bonus-to-balance.mjs`: moves bonuses granted under the old model (`bonusBalance > 0`, never added to `balance`) into `balance`. Each migrated user is stamped with `User.bonusModelBMigratedAt`, so running the script again can never credit twice. Run it once, right after deploying the locked-balance model and before any new bonus is granted.
- `server/scripts/reset-to-clean-slate.mjs`: a destructive "clean slate" for a test deployment going live. It withdraws every non-admin Igames wallet to the house, zeroes local `balance`/`bonusBalance` and deletes `CasinoRound`/`CasinoSession`, keeping `Transaction` and `BonusWagering` as the audit trail. It never runs automatically.

## When a bonus expires

_Since 2026-10-03 (before that an expired bonus was simply unlocked — see [09](09-bilinen-kisitlar.md#bonus-expiry--resolved-2026-10-03))._

When a wagering record passes its `deadline` while still `active`, `expireWagering()` (`server/src/services/wagering.js`) applies the forfeit rule above: the **unwagered share** (`bonusAmount × remaining / required`) is taken back from `balance`, the wagered share stays with the player, and the balance never goes below zero (if the bonus was already lost in play, only what is left is taken). Status change, balance update and the `bonus_forfeit` ledger row (`idempotencyKey: bonus_expire_<wageringId>`, `metadata.reason: 'expired'`) happen in one DB transaction; a conditional claim makes concurrent processing deduct once.

Expiry is processed:

- before `recordWagering` credits a stake,
- before every lock / withdrawable calculation (`getLockedAmount`, `getSpendableBreakdown` — so the withdrawal gate never works from a stale balance),
- hourly for everyone by `server/src/jobs/bonusExpiry.js` (players who never bet again).

## Known gaps

- The admin bonus path uses a fixed ×35 / 30-day rule that cannot be configured from the panel.
