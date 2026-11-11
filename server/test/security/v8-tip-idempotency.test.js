import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import ChatRoom from '../../src/models/ChatRoom.js';
import ChatTip from '../../src/models/ChatTip.js';
import ChatMessage from '../../src/models/ChatMessage.js';
import Transaction from '../../src/models/Transaction.js';
import BonusWagering from '../../src/models/BonusWagering.js';
import RiskProfile from '../../src/models/RiskProfile.js';
import { setIO } from '../../src/services/socketEmitter.js';
import { createRoom, sendTip, banUserFromRoom, muteUserInRoom } from '../../src/services/chat.js';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_v8_tip?replicaSet=rs0';

describe('V8 chat tip is atomic, funded from withdrawable money and idempotent', async () => {
  let connected = false;
  try { await mongoose.connect(URI, { serverSelectionTimeoutMS: 3000 }); connected = true; } catch { /* skip */ }
  const opts = { skip: !connected && 'MongoDB (replica set) not available' };

  const s = Date.now();
  let n = 0;
  const made = [];
  let room;
  const mk = async (balance = 0, extra = {}) => {
    const u = await User.create({ username: `v8t_${n}_${s}`, email: `v8t_${n++}_${s}@test.dev`, password: 'x'.repeat(10), balance, ...extra });
    made.push(u._id);
    return u;
  };
  const bal = async (u) => (await User.findById(u._id).select('balance').lean()).balance;
  const txs = (u) => Transaction.find({ userId: u._id }).lean();

  before(async () => {
    if (!connected) return;
    setIO(null);
    await Promise.all([ChatTip.init(), Transaction.init(), User.init()]);
    const owner = await mk();
    room = await createRoom({ name: `v8 tip ${s}` }, owner._id);
  });

  after(async () => {
    if (connected) {
      await Transaction.deleteMany({ userId: { $in: made } });
      await ChatTip.deleteMany({ roomId: room?._id });
      await ChatMessage.deleteMany({ roomId: room?._id });
      await BonusWagering.deleteMany({ userId: { $in: made } });
      await RiskProfile.deleteMany({ playerId: { $in: made } });
      await ChatRoom.deleteOne({ _id: room?._id });
      await User.deleteMany({ _id: { $in: made } });
      await mongoose.disconnect();
    }
  });

  it('missing requestId → 400 REQUEST_ID_REQUIRED, nothing written', opts, async () => {
    const from = await mk(100); const to = await mk();
    await assert.rejects(() => sendTip(from._id, to._id, room._id, 10, ''), (e) => e.code === 'REQUEST_ID_REQUIRED');
    assert.equal(await bal(from), 100);
    assert.equal(await ChatTip.countDocuments({ fromUserId: from._id }), 0);
  });

  it('two sequential calls with requestId r1 → one ChatTip, one tip_sent, one tip_received; second returns the first record', opts, async () => {
    const from = await mk(100); const to = await mk();
    const first = await sendTip(from._id, to._id, room._id, 30, 'gg', { requestId: 'r1' });
    const second = await sendTip(from._id, to._id, room._id, 30, 'gg', { requestId: 'r1' });
    assert.equal(String(second._id), String(first._id));
    assert.equal(await ChatTip.countDocuments({ fromUserId: from._id }), 1);
    assert.equal((await txs(from)).filter((t) => t.type === 'tip_sent').length, 1);
    assert.equal((await txs(to)).filter((t) => t.type === 'tip_received').length, 1);
    assert.equal(await bal(from), 70);
    assert.equal(await bal(to), 30);
    assert.ok(first.requestId.endsWith('r1'));
  });

  it('a double click (two concurrent calls with one requestId) moves money once', opts, async () => {
    const from = await mk(100); const to = await mk();
    const results = await Promise.allSettled([
      sendTip(from._id, to._id, room._id, 40, '', { requestId: 'dbl' }),
      sendTip(from._id, to._id, room._id, 40, '', { requestId: 'dbl' }),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled').map((r) => String(r.value._id));
    assert.ok(ok.length >= 1);
    assert.equal(new Set(ok).size, 1);
    assert.equal(await bal(from), 60);
    assert.equal(await bal(to), 40);
    assert.equal(await ChatTip.countDocuments({ fromUserId: from._id }), 1);
    assert.equal((await txs(from)).length, 1);
  });

  it('the same client requestId from a different sender is a different tip (keys are scoped per user)', opts, async () => {
    const a = await mk(50); const b = await mk(50); const to = await mk();
    const ta = await sendTip(a._id, to._id, room._id, 5, '', { requestId: 'shared' });
    const tb = await sendTip(b._id, to._id, room._id, 5, '', { requestId: 'shared' });
    assert.notEqual(String(ta._id), String(tb._id));
    assert.equal(await bal(a), 45);
    assert.equal(await bal(b), 45);
    assert.equal(await bal(to), 10);
  });

  it('insufficient balance: neither balance changes and no ChatTip is written', opts, async () => {
    const from = await mk(10); const to = await mk(3);
    await assert.rejects(() => sendTip(from._id, to._id, room._id, 50, '', { requestId: 'poor' }), (e) => e.code === 'INSUFFICIENT_BALANCE');
    assert.equal(await bal(from), 10);
    assert.equal(await bal(to), 3);
    assert.equal(await ChatTip.countDocuments({ fromUserId: from._id }), 0);
    assert.equal((await txs(from)).length + (await txs(to)).length, 0);
  });

  it('a missing recipient rolls the debit back', opts, async () => {
    const from = await mk(100);
    await assert.rejects(() => sendTip(from._id, new mongoose.Types.ObjectId(), room._id, 10, '', { requestId: 'ghost' }));
    assert.equal(await bal(from), 100);
    assert.equal((await txs(from)).length, 0);
  });

  it('invalid amounts are refused before anything is written', opts, async () => {
    const from = await mk(100); const to = await mk(100);
    for (const [i, bad] of [-10, 0, NaN, '5', 0.001].entries()) {
      await assert.rejects(() => sendTip(from._id, to._id, room._id, bad, '', { requestId: `bad${i}` }), (e) => e.code === 'INVALID_AMOUNT', String(bad));
    }
    assert.equal(await bal(from), 100);
    assert.equal(await bal(to), 100);
  });

  it('locked bonus money cannot be tipped: only balance minus active wagering bonus is spendable', opts, async () => {
    const from = await mk(100); const to = await mk();
    await BonusWagering.create({ userId: from._id, bonusAmount: 80, wageringRequired: 800, status: 'active' });
    await assert.rejects(() => sendTip(from._id, to._id, room._id, 30, '', { requestId: 'locked1' }), (e) => e.code === 'INSUFFICIENT_BALANCE');
    assert.equal(await bal(from), 100);
    await sendTip(from._id, to._id, room._id, 20, '', { requestId: 'locked2' });
    assert.equal(await bal(from), 80);
    assert.equal(await bal(to), 20);
  });

  it('withdrawal lock, self-exclusion and cool-off block tipping', opts, async () => {
    const to = await mk();
    const future = new Date(Date.now() + 3600_000);
    const locked = await mk(100, { withdrawalLockUntil: future });
    const excluded = await mk(100, { 'responsibleLimits.selfExclusionUntil': future });
    const cooling = await mk(100, { 'responsibleLimits.coolOffUntil': future });
    const restricted = await mk(100, { accountRestricted: true });
    for (const u of [locked, excluded, cooling, restricted]) {
      await assert.rejects(() => sendTip(u._id, to._id, room._id, 10, '', { requestId: 'rg' }), (e) => e.status === 403 && ['WITHDRAWAL_LOCKED', 'ACCOUNT_RESTRICTED'].includes(e.code));
      assert.equal(await bal(u), 100);
    }
    assert.equal(await bal(to), 0);
  });

  // Cash-out gates (fix round 1): the tip sender passes the same gates as /bank/withdraw.
  const kycOn = { getUsability: async () => 'usable', getConfig: async (k) => (k === 'KYC_ENABLED' ? 'true' : null) };

  it('KYC on: an unverified sender is refused (KYC_REQUIRED), a verified sender still tips', opts, async () => {
    const to = await mk();
    const unverified = await mk(100, { kycStatus: 'pending' });
    await assert.rejects(
      () => sendTip(unverified._id, to._id, room._id, 10, '', { requestId: 'kyc1', cashOutGates: { kyc: kycOn } }),
      (e) => e.status === 403 && e.code === 'KYC_REQUIRED',
    );
    assert.equal(await bal(unverified), 100);
    assert.equal(await ChatTip.countDocuments({ fromUserId: unverified._id }), 0);

    const verified = await mk(100, { kycStatus: 'approved', kycVerified: true });
    await sendTip(verified._id, to._id, room._id, 10, '', { requestId: 'kyc2', cashOutGates: { kyc: kycOn } });
    assert.equal(await bal(verified), 90);
    assert.equal(await bal(to), 10);
  });

  it('KYC status unreadable with the default block policy refuses the tip (503 KYC_CHECK_UNAVAILABLE)', opts, async () => {
    const from = await mk(100, { kycStatus: 'approved', kycVerified: true }); const to = await mk();
    const broken = { getUsability: async () => 'unknown', getConfig: async () => null };
    await assert.rejects(
      () => sendTip(from._id, to._id, room._id, 10, '', { requestId: 'kyc3', cashOutGates: { kyc: broken } }),
      (e) => e.status === 503 && e.code === 'KYC_CHECK_UNAVAILABLE',
    );
    assert.equal(await bal(from), 100);
  });

  it('a risk-blocked or risk-restricted sender is refused (real RiskProfile, withdraw check)', opts, async () => {
    const to = await mk();
    for (const [status, code] of [['BLOCKED', 'RISK_BLOCKED'], ['RESTRICTED', 'RISK_RESTRICTED']]) {
      const from = await mk(100);
      await RiskProfile.create({ playerId: from._id, riskStatus: status });
      await assert.rejects(
        () => sendTip(from._id, to._id, room._id, 10, '', { requestId: `risk-${status}` }),
        (e) => e.status === 403 && e.code === code,
      );
      assert.equal(await bal(from), 100);
    }
    const review = await mk(100);
    await RiskProfile.create({ playerId: review._id, riskStatus: 'REVIEW' });
    await sendTip(review._id, to._id, room._id, 10, '', { requestId: 'risk-review' });
    assert.equal(await bal(review), 90, 'REVIEW passes, as on the withdraw route');
  });

  it('the RG evaluation runs as a withdraw with the amount; RESTRICT → LIMIT_EXCEEDED, nothing moves', opts, async () => {
    const from = await mk(100); const to = await mk();
    const seen = [];
    const rg = (user, action, ctx) => { seen.push([action, ctx.amount]); return 'RESTRICT'; };
    await assert.rejects(
      () => sendTip(from._id, to._id, room._id, 25, '', { requestId: 'rg-limit', cashOutGates: { rg } }),
      (e) => e.status === 403 && e.code === 'LIMIT_EXCEEDED',
    );
    assert.deepEqual(seen[0], ['withdraw', 25]);
    assert.equal(await bal(from), 100);
    assert.equal(await bal(to), 0);
  });

  it('a sender banned or muted in the room cannot tip; nothing moves', opts, async () => {
    const to = await mk();
    const banned = await mk(100); const muted = await mk(100);
    await banUserFromRoom(room._id, banned._id, made[0]);
    await muteUserInRoom(room._id, muted._id, 600, 'spam', made[0]);
    await assert.rejects(() => sendTip(banned._id, to._id, room._id, 10, '', { requestId: 'ban1' }), (e) => e.code === 'BANNED');
    await assert.rejects(() => sendTip(muted._id, to._id, room._id, 10, '', { requestId: 'mute1' }), (e) => e.code === 'MUTED');
    assert.equal(await bal(banned), 100);
    assert.equal(await bal(muted), 100);
    assert.equal(await bal(to), 0);
  });
});
