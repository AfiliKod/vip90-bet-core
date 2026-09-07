# Known Limitations

This document lists features that are **defined but not end-to-end connected** or **partially functional** in the codebase. The goal is for the operator to be aware of this before encountering a situation where "I see a field/service in the panel but the behavior isn't what I expected." Each item has been verified by reading the relevant code.

## KYC document review flow is not end-to-end connected

`server/src/services/kyc.js` is written as a complete service: `submitKycDocuments`, `approveKyc`, `rejectKyc`, `checkKycRequired`, `requireKyc`, `expireOldKyc`. But these functions are **not called from any route or controller**:

```
grep -rn "requireKyc\|submitKycDocuments" server/src/routes server/src/controllers
# (empty result)
```

There's no document upload page/route on the user side — a player can't upload an identity document. The only thing that actually works in the admin panel is a raw `kycVerified` checkbox in `client/src/pages/admin/components/UserSlideOver.jsx`; this is limited to the field list allowed by `updateUser` in `server/src/controllers/admin.js`:

```js
const allowed = ['isActive', 'kycVerified'];
```

So an admin can manually mark a user as "KYC verified," but there's no document review/approval/rejection workflow to back it up.

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

## VIP cashback is defined but never paid

The default VIP levels in `server/src/services/vip.js` have a `cashbackPercent` field for each level:

```js
{ level: 2, name: 'Silver',   cashbackPercent: 2,  rewardAmount: 10,  ... },
{ level: 3, name: 'Gold',     cashbackPercent: 5,  rewardAmount: 50,  ... },
{ level: 4, name: 'Platinum', cashbackPercent: 8,  rewardAmount: 200, ... },
{ level: 5, name: 'Diamond',  cashbackPercent: 12, rewardAmount: 500, ... },
```

But this field is only **defined**, never **read or processed** anywhere:

```
grep -n "cashbackPercent" server/src/services/vip.js server/src/jobs/*.js
# only the definition lines above match — no calculation/payment
```

The only mechanism that actually works is the one-time `rewardAmount` paid when a user levels up to the next VIP tier (around lines 102-134 in `vip.js`, added to balance at the moment of leveling up). So there's no "automatic monthly/weekly lossback" cashback engine — the `cashbackPercent` field is currently dead; in the future, a periodic job (cron/job) could be extended to read this value and calculate real cashback, but that job hasn't been written today.

## Additional note on the module system

The `live-casino` module ID is defined in the registry (`server/src/modules/registry.js`), can be toggled from the panel, and its license status is queryable — but there's no route that actually disables it at the API level (the real dealer live casino integration hasn't been written yet). For details, see the "Known gap" note in [03 — Module System](03-modul-sistemi.md).