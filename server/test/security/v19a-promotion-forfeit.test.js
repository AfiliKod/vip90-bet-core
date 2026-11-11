// V19a — promotion claim and bonus forfeit run in one transaction; CasinoRound
// side effects never run inside a transaction.
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import Transaction from '../../src/models/Transaction.js';
import Promotion from '../../src/models/Promotion.js';
import BonusWagering from '../../src/models/BonusWagering.js';
import CasinoRound, { applyCasinoRoundSideEffects } from '../../src/models/CasinoRound.js';
import { claim } from '../../src/controllers/promotions.js';
import { forfeitActiveWagerings } from '../../src/services/wagering.js';
import { withTransactionRetry } from '../../src/utils/transactionRetry.js';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/v19a_promo_forfeit_test';

let connected = false;
try {
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 2000 });
  // Transactions need a replica set.
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  connected = Boolean(hello.setName);
  if (!connected) await mongoose.disconnect();
} catch { /* skip */ }
const opts = { skip: !connected && 'MongoDB replica set not available' };
after(async () => { if (connected) { await mongoose.connection.dropDatabase().catch(() => {}); await mongoose.disconnect(); } });

async function mkUser(balance) {
  const n = `v19a_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  return User.create({ username: n, email: `${n}@example.test`, password: 'x', balance });
}

async function mkPromo(amount = 100) {
  return Promotion.create({ type: 'welcome', title: 'V19a promo', amount, wageringMultiplier: 10, deadlineDays: 30 });
}

async function callClaim(user, promo) {
  const req = { params: { id: String(promo._id) }, user: { id: String(user._id) }, validated: { acceptedBonusTerms: true } };
  const out = { status: 200, body: null, err: null };
  const res = {
    status(c) { out.status = c; return this; },
    json(b) { out.body = b; return this; },
  };
  await claim(req, res, (e) => { out.err = e; });
  return out;
}

describe('V19a promotion claim', () => {
  it('a duplicate claim key rolls back the claim: no credit, claimedBy reverted, no wagering', opts, async () => {
    const user = await mkUser(50);
    const promo = await mkPromo(100);
    await Transaction.create({
      userId: user._id, type: 'bonus', amount: 100, balanceBefore: 0, balanceAfter: 100,
      idempotencyKey: `promo_claim_${promo._id}_${user._id}`,
    });
    const out = await callClaim(user, promo);
    assert.ok(out.err, 'claim must fail');
    assert.equal(out.err.status, 409);
    assert.equal((await User.findById(user._id)).balance, 50);
    const p = await Promotion.findById(promo._id);
    assert.equal(p.claimedBy.length, 0, 'claimedBy rolled back');
    assert.equal(await BonusWagering.countDocuments({ userId: user._id }), 0);
  });

  it('a failure after the credit (wagering write) rolls back balance, ledger and claimedBy', opts, async () => {
    const user = await mkUser(50);
    const promo = await mkPromo(100);
    const orig = BonusWagering.create;
    BonusWagering.create = async () => { throw new Error('boom'); };
    let out;
    try { out = await callClaim(user, promo); } finally { BonusWagering.create = orig; }
    assert.ok(out.err, 'claim must fail');
    assert.equal((await User.findById(user._id)).balance, 50);
    assert.equal((await Promotion.findById(promo._id)).claimedBy.length, 0);
    assert.equal(await Transaction.countDocuments({ userId: user._id, type: 'bonus' }), 0);
  });

  it('a successful claim writes balance, bonus row and wagering together', opts, async () => {
    const user = await mkUser(50);
    const promo = await mkPromo(100);
    const out = await callClaim(user, promo);
    assert.equal(out.err, null, out.err?.message);
    assert.equal(out.body.balance, 150);
    assert.equal(out.body.bonusBalance, 100);
    assert.equal((await User.findById(user._id)).balance, 150);
    const txs = await Transaction.find({ userId: user._id, type: 'bonus' });
    assert.equal(txs.length, 1);
    assert.equal(txs[0].idempotencyKey, `promo_claim_${promo._id}_${user._id}`);
    const ws = await BonusWagering.find({ userId: user._id });
    assert.equal(ws.length, 1);
    assert.equal(ws[0].status, 'active');
    assert.equal(ws[0].wageringRequired, 1000);
  });

  it('a second claim is 409 and moves no money; a missing promotion stays 404', opts, async () => {
    const user = await mkUser(0);
    const promo = await mkPromo(20);
    assert.equal((await callClaim(user, promo)).err, null);
    const again = await callClaim(user, promo);
    assert.equal(again.err?.status, 409);
    assert.equal((await User.findById(user._id)).balance, 20);
    const missing = await callClaim(user, { _id: new mongoose.Types.ObjectId() });
    assert.equal(missing.err?.status, 404);
    await Promotion.updateOne({ _id: promo._id }, { isActive: false });
    const other = await mkUser(0);
    assert.equal((await callClaim(other, promo)).err?.status, 404);
  });

  it('concurrent claims credit once', opts, async () => {
    const user = await mkUser(0);
    const promo = await mkPromo(30);
    const outs = await Promise.all([1, 2, 3, 4].map(() => callClaim(user, promo)));
    assert.equal(outs.filter(o => !o.err).length, 1);
    assert.equal((await User.findById(user._id)).balance, 30);
    assert.equal(await Transaction.countDocuments({ userId: user._id, type: 'bonus' }), 1);
    assert.equal(await BonusWagering.countDocuments({ userId: user._id }), 1);
  });
  it('five different users claim the same promotion concurrently: all succeed', opts, async () => {
    const promo = await mkPromo(10);
    const users = await Promise.all([1, 2, 3, 4, 5].map(() => mkUser(0)));
    const outs = await Promise.all(users.map((u) => callClaim(u, promo)));
    assert.deepEqual(outs.map((o) => o.err?.message ?? null), [null, null, null, null, null]);
    for (const u of users) assert.equal((await User.findById(u._id)).balance, 10);
    assert.equal((await Promotion.findById(promo._id)).claimedBy.length, 5);
    assert.equal(await BonusWagering.countDocuments({ promotionId: promo._id }), 5);
  });
});

describe('V19a forfeitActiveWagerings', () => {
  it('a ledger failure inside the transaction leaves the wagering active and the balance untouched', opts, async () => {
    const user = await mkUser(500);
    const w = await BonusWagering.create({ userId: user._id, bonusAmount: 100, wageringRequired: 1000, wageringProgress: 0, status: 'active' });
    await Transaction.create({
      userId: user._id, type: 'bonus_forfeit', amount: -1, balanceBefore: 0, balanceAfter: 0,
      idempotencyKey: `forfeit_${w._id}`,
    });
    await assert.rejects(() => forfeitActiveWagerings(user._id));
    assert.equal((await BonusWagering.findById(w._id)).status, 'active');
    assert.equal((await User.findById(user._id)).balance, 500);
  });

  it('a successful forfeit marks the wagering forfeited, lowers the balance and writes one row', opts, async () => {
    const user = await mkUser(500);
    const w = await BonusWagering.create({ userId: user._id, bonusAmount: 100, wageringRequired: 1000, wageringProgress: 250, status: 'active' });
    const out = await forfeitActiveWagerings(user._id);
    assert.equal(out.totalForfeitedAmount, 75);
    assert.equal(out.items.length, 1);
    assert.equal((await BonusWagering.findById(w._id)).status, 'forfeited');
    assert.equal((await User.findById(user._id)).balance, 425);
    const rows = await Transaction.find({ userId: user._id, type: 'bonus_forfeit' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].amount, -75);
    assert.equal(rows[0].idempotencyKey, `forfeit_${w._id}`);
    assert.equal(rows[0].balanceBefore, 500);
    assert.equal(rows[0].balanceAfter, 425);
    // A second run finds nothing active and moves nothing.
    const again = await forfeitActiveWagerings(user._id);
    assert.equal(again.totalForfeitedAmount, 0);
    assert.equal((await User.findById(user._id)).balance, 425);
  });

  it('never takes the balance below zero: only what is left is deducted', opts, async () => {
    const user = await mkUser(30);
    const w = await BonusWagering.create({ userId: user._id, bonusAmount: 100, wageringRequired: 1000, wageringProgress: 0, status: 'active' });
    const out = await forfeitActiveWagerings(user._id);
    assert.equal(out.totalForfeitedAmount, 30);
    assert.equal((await User.findById(user._id)).balance, 0);
    assert.equal((await BonusWagering.findById(w._id)).status, 'forfeited');
    const rows = await Transaction.find({ userId: user._id, type: 'bonus_forfeit' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].amount, -30);
    assert.equal(rows[0].balanceAfter, 0);
    assert.equal(rows[0].metadata.forfeitAmount, 100);
    assert.equal(rows[0].metadata.deducted, 30);
  });

  it('a zero balance forfeits the wagering without a ledger row', opts, async () => {
    const user = await mkUser(0);
    const w = await BonusWagering.create({ userId: user._id, bonusAmount: 100, wageringRequired: 1000, wageringProgress: 0, status: 'active' });
    const out = await forfeitActiveWagerings(user._id);
    assert.equal(out.totalForfeitedAmount, 0);
    assert.equal((await BonusWagering.findById(w._id)).status, 'forfeited');
    assert.equal((await User.findById(user._id)).balance, 0);
    assert.equal(await Transaction.countDocuments({ userId: user._id, type: 'bonus_forfeit' }), 0);
  });

  it("joins the caller's transaction: an abort after forfeit undoes it", opts, async () => {
    const user = await mkUser(500);
    const w = await BonusWagering.create({ userId: user._id, bonusAmount: 100, wageringRequired: 1000, wageringProgress: 0, status: 'active' });
    const session = await mongoose.startSession();
    try {
      await assert.rejects(() => withTransactionRetry(session, async () => {
        const out = await forfeitActiveWagerings(user._id, { session });
        assert.equal(out.totalForfeitedAmount, 100);
        throw new Error('caller failed');
      }), /caller failed/);
    } finally { await session.endSession(); }
    assert.equal((await BonusWagering.findById(w._id)).status, 'active');
    assert.equal((await User.findById(user._id)).balance, 500);
    assert.equal(await Transaction.countDocuments({ userId: user._id, type: 'bonus_forfeit' }), 0);
  });
});

describe('V19a CasinoRound post-save hook', () => {
  function roundDoc(userId) {
    return { userId, gameId: 'g1', provider: 'igames', bet: 100, payout: 0, net: -100, balanceBefore: 500, balanceAfter: 400 };
  }

  it('a round written inside a transaction does not credit wagering; the post-commit call credits once', opts, async () => {
    const user = await mkUser(500);
    const w = await BonusWagering.create({ userId: user._id, bonusAmount: 100, wageringRequired: 1000, wageringProgress: 0, status: 'active' });
    const session = await mongoose.startSession();
    let round;
    try {
      round = await withTransactionRetry(session, async () => {
        const [r] = await CasinoRound.create([roundDoc(user._id)], { session });
        return r;
      });
    } finally { await session.endSession(); }
    assert.equal((await BonusWagering.findById(w._id)).wageringProgress, 0, 'no wagering inside the transaction');
    await applyCasinoRoundSideEffects(round);
    assert.equal((await BonusWagering.findById(w._id)).wageringProgress, 50, 'igames weight 0.5 x 100, once');
  });

  it('a round written without a session keeps crediting wagering as before', opts, async () => {
    const user = await mkUser(500);
    const w = await BonusWagering.create({ userId: user._id, bonusAmount: 100, wageringRequired: 1000, wageringProgress: 0, status: 'active' });
    await CasinoRound.create(roundDoc(user._id));
    assert.equal((await BonusWagering.findById(w._id)).wageringProgress, 50);
  });
});
