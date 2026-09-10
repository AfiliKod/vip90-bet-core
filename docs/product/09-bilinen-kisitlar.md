# Known Limitations

_Last verified: 2026-09-11 (against `dev`/`main` after the crypto payment + dual-KYC + VIP cashback work landed)._

This document lists features that are **defined but not end-to-end connected** or **partially functional** in the codebase. The goal is for the operator to be aware of this before encountering a situation where "I see a field/service in the panel but the behavior isn't what I expected." Each item has been verified by reading the relevant code.

**Resolved since the last pass, no longer limitations:** KYC document review (now a dual system — local document review + Sumsub — wired end-to-end via `server/src/routes/kyc.js` and `admin.approveKycSubmission`/`rejectKycSubmission`) and VIP cashback (now paid in real time on every settled bet/round via `vip.payCashback`, hooked into sports settlement, in-house rounds, and Palace sessions — see `GET /api/vip/cashback` for history).

## No agent (reseller) system

The `server/src/models/User.js` schema defines two fields for an agent relationship:

```js
agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', default: null },
isAgent: { type: Boolean, default: false },
```

But there's no route, controller, or admin UI that reads or writes these fields:

```
grep -rln "isAgent\|agentId" server/src/routes server/src/controllers client/src/pages
# (empty result)
```

Additionally, the referenced `Agent` model doesn't exist. These two fields are skeleton entries left in the schema; today there's no functioning agent/reseller hierarchy, agent commission, or agent panel.

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

## Roulette house edge setting is not read by the game engine

`server/src/services/gameSettings.js` defines `rouletteHouseEdgePercent` and `rouletteMaxPayout` as admin-editable fields (validated, persisted, exposed in the panel), but the actual roulette engine (`server/src/provider/games/rouletteGame.js`) computes payouts purely from `evaluateBets()`'s fixed European-roulette payout table — it never reads either setting:

```
grep -n "rouletteHouseEdgePercent\|houseEdge" server/src/provider/games/rouletteGame.js
# (empty result)
```

So changing these two fields from the admin panel has no effect on gameplay; the house edge is whatever the fixed payout table implies (~2.7%, standard European single-zero roulette).