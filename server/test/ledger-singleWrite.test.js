import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

// Madde 7: aynı olay için ham Transaction.create + createTransaction çift satır
// üretiyordu. Her yol artık tek (idempotent) ledger kaydı yazmalı.
describe('Ledger tek kayıt (çift yazım yok)', () => {
  let M = {};
  const mk = (n, extra = {}) => M.User.create({ username: n, email: `${n}@t.local`, password: 'Password1', balance: 100, ...extra });

  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_ledgersingle');
    M.Transaction = (await import('../src/models/Transaction.js')).default;
    M.User = (await import('../src/models/User.js')).default;
    M.Agent = (await import('../src/models/Agent.js')).default;
    M.VipLevel = (await import('../src/models/VipLevel.js')).default;
    M.RC = (await import('../src/models/ReferralCommission.js')).default;
    const all = Object.values(M);
    await Promise.all(all.map(m => m.deleteMany({})));
    await Promise.all(all.map(m => m.init()));
    await Promise.all(all.map(m => m.createCollection().catch(() => {})));
  });
  after(async () => {
    await Promise.all(Object.values(M).map(m => m.deleteMany({})));
    await mongoose.disconnect();
  });

  const count = (userId, type) => M.Transaction.countDocuments({ userId, type });

  it('payReferralCommission: tek referral_commission', async () => {
    const { payReferralCommission } = await import('../src/services/referralCommission.js');
    const ref = await mk('rc_ref');
    const bettor = await mk('rc_bet', { referredBy: ref._id });
    const c = await payReferralCommission(bettor._id, 1000);
    if (c === null) return; // referral kapalıysa uygulanmaz
    assert.equal(await count(ref._id, 'referral_commission'), 1);
  });

  it('approveCommission: tek kayıt, commission.transactionId ona işaret eder', async () => {
    const { approveCommission } = await import('../src/services/referral.js');
    const ref = await mk('ap_ref');
    const bettor = await mk('ap_bet');
    const admin = await mk('ap_adm');
    const com = await M.RC.create({ referrerId: ref._id, bettorId: bettor._id, level: 1, houseProfit: 100, commissionAmount: 5, commissionRate: 5, source: 'casino' });
    const { commission, transaction } = await approveCommission(com._id, admin._id);
    assert.equal(await count(ref._id, 'referral_commission'), 1);
    assert.equal(String(commission.transactionId), String(transaction._id));
  });

  it('payAgentCommission: tek agent_commission', async () => {
    const { payAgentCommission } = await import('../src/services/agent.js');
    const agentUser = await mk('ag_user');
    const agent = await M.Agent.create({ userId: agentUser._id, commissionRate: 10 });
    const player = await mk('ag_player', { agentId: agent._id });
    const r = await payAgentCommission(player._id, 100);
    assert.equal(r.commission, 10);
    assert.ok(r.transaction._id);
    assert.equal(await count(agentUser._id, 'agent_commission'), 1);
  });

  it('payCashback: tek cashback', async () => {
    const { payCashback } = await import('../src/services/vip.js');
    const lvl = await M.VipLevel.create({ level: 1, name: 'Bronze', xpRequired: 0, cashbackPercent: 10 });
    const u = await mk('cb_user', { vipLevel: lvl._id });
    const amt = await payCashback(u._id, 100);
    assert.equal(amt, 10);
    assert.equal(await count(u._id, 'cashback'), 1);
  });

  for (const rewardType of ['balance', 'bonus']) {
    it(`seviye ödülü (${rewardType}): tek bonus`, async () => {
      const { awardXp } = await import('../src/services/vip.js');
      await M.VipLevel.deleteMany({});
      const l1 = await M.VipLevel.create({ level: 1, name: 'B', xpRequired: 0 });
      const l2 = await M.VipLevel.create({ level: 2, name: 'S', xpRequired: 5, rewardAmount: 7, rewardType });
      const u = await mk(`lv_${rewardType}`, { vipLevel: l1._id });
      const r = await awardXp(u._id, 1000, 'sports');
      assert.equal(r.leveledUp, true);
      assert.equal(await count(u._id, 'bonus'), 1);
    });
  }

  it('rejectCryptoWithdrawal: tek iade kaydı', async () => {
    const { rejectCryptoWithdrawal } = await import('../src/controllers/admin.js');
    const u = await mk('rj_user');
    const w = await M.Transaction.create({ userId: u._id, type: 'crypto_withdraw', amount: -30, balanceBefore: 100, balanceAfter: 70, status: 'pending', note: 'x' });
    let body, code = 200, err;
    const res = { status(c) { code = c; return this; }, json(b) { body = b; return this; } };
    await rejectCryptoWithdrawal({ params: { id: String(w._id) } }, res, e => { err = e; });
    assert.equal(err, undefined, err?.message);
    assert.equal(code, 200, JSON.stringify(body));
    // orijinal talep + tek iade satırı
    assert.equal(await M.Transaction.countDocuments({ userId: u._id, type: 'crypto_withdraw' }), 2);
    assert.equal(await M.Transaction.countDocuments({ userId: u._id, type: 'crypto_withdraw', amount: 30 }), 1);
  });
});
