import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Transaction from '../src/models/Transaction.js';
import VipLevel from '../src/models/VipLevel.js';
import Agent from '../src/models/Agent.js';
import { payReferralCommission } from '../src/services/referralCommission.js';
import { payCashback } from '../src/services/vip.js';
import { payAgentCommission } from '../src/services/agent.js';
import { REFERRAL_SETTINGS } from '../src/config/referral.js';

// Aynı kaynak olay (sourceId) için ödeme ikinci kez tetiklenirse ne bakiye
// ne ledger değişmeli. sourceId yoksa eski davranış (her çağrı ayrı ödeme).
describe('ödeme tekrar koruması (sourceId)', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_payoutidem');
    await Promise.all([User.init(), Transaction.init(), VipLevel.init(), Agent.init()]);
  });
  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Transaction.deleteMany({}), VipLevel.deleteMany({}), Agent.deleteMany({})]);
  });
  after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

  it('referral komisyonu aynı sourceId ile bir kez ödenir', async () => {
    const prevEnabled = REFERRAL_SETTINGS.enabled; REFERRAL_SETTINGS.enabled = true;
    try {
      const ref = await User.create({ username: 'refr', email: 'refr@t.local', password: 'Password1', balance: 0 });
      const bettor = await User.create({ username: 'bettr', email: 'bettr@t.local', password: 'Password1', referredBy: ref._id });
      const src = new mongoose.Types.ObjectId();
      const a = await payReferralCommission(bettor._id, 1000, { sourceId: src });
      const b = await payReferralCommission(bettor._id, 1000, { sourceId: src });
      assert.ok(a > 0); assert.equal(b, null);
      const r = await User.findById(ref._id);
      assert.equal(r.balance, a);
      assert.equal(await Transaction.countDocuments({ userId: ref._id, type: 'referral_commission' }), 1);
    } finally { REFERRAL_SETTINGS.enabled = prevEnabled; }
  });

  it('cashback aynı sourceId ile bir kez ödenir', async () => {
    await VipLevel.create({ name: 'Base', level: 1, xpRequired: 0, cashbackPercent: 5, isActive: true });
    const u = await User.create({ username: 'cbu', email: 'cbu@t.local', password: 'Password1', balance: 100 });
    const src = new mongoose.Types.ObjectId();
    const a = await payCashback(u._id, 200, { sourceId: src });
    const b = await payCashback(u._id, 200, { sourceId: src });
    assert.ok(a > 0); assert.equal(b, 0);
    assert.equal((await User.findById(u._id)).balance, 100 + a);
    assert.equal(await Transaction.countDocuments({ userId: u._id, type: 'cashback' }), 1);
  });

  it('sourceId olmadan her çağrı ayrı ödeme (eski davranış korunur)', async () => {
    await VipLevel.create({ name: 'Base', level: 1, xpRequired: 0, cashbackPercent: 5, isActive: true });
    const u = await User.create({ username: 'cbv', email: 'cbv@t.local', password: 'Password1', balance: 0 });
    await payCashback(u._id, 200);
    await new Promise(r => setTimeout(r, 5));
    await payCashback(u._id, 200);
    assert.equal(await Transaction.countDocuments({ userId: u._id, type: 'cashback' }), 2);
  });
});
