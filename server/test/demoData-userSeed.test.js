// server/test/demoData-userSeed.test.js
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Transaction from '../src/models/Transaction.js';
import ActivityEvent from '../src/models/ActivityEvent.js';
import { _setIOGetter, _getIOGetter } from '../src/services/activityFeed.js';
import * as userSeed from '../src/services/demoData/userSeed.js';

const ORIGINAL_IO_GETTER = _getIOGetter();

// ledger.js'in createTransaction()'ı logActivity()'i fire-and-forget çağırıyor —
// bkz. test/ledger-activity.test.js. Insert ile find arasındaki yarışı
// deterministik hale getirmek için poll gerekir.
async function waitForEvents(query, { timeoutMs = 2000, intervalMs = 25 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const events = await ActivityEvent.find(query);
    if (events.length > 0 || Date.now() >= deadline) return events;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

describe('demoData/userSeed', () => {
  before(async () => {
    _setIOGetter(() => null);
    await mongoose.connect('mongodb://localhost:27017/betzone_test_demo_data_users');
  });
  after(async () => {
    _setIOGetter(ORIGINAL_IO_GETTER);
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    _setIOGetter(() => null);
    await User.deleteMany({});
    await Transaction.deleteMany({});
    await ActivityEvent.deleteMany({});
  });

  it('load(N) tam N seed kullanıcı oluşturur, her biri bcrypt ile hash\'lenmiş parolaya sahip', async () => {
    const result = await userSeed.load(5);
    assert.equal(result.created, 5);
    const users = await User.find({ isSeed: true });
    assert.equal(users.length, 5);
    for (const u of users) {
      assert.ok(u.password.startsWith('$2'), 'parola bcrypt hash olmalı (düz metin OLMAMALI)');
      assert.match(u.username, /^[a-z]+[._][a-z0-9]+$/, 'insancıl kullanıcı adı (ad.soyadNNNN ya da sifat_isimNNNN)');
      assert.ok(u.email.endsWith('@seed.local'));
    }
  });

  it('load(N) çağrısı idempotent şekilde EKLER, önceki kullanıcıları silmez', async () => {
    await userSeed.load(3);
    await userSeed.load(2);
    const count = await User.countDocuments({ isSeed: true });
    assert.equal(count, 5);
  });

  it('load(N) her kullanıcı için 90 gün içine yayılmış deposit/withdraw geçmişi üretir, bakiye tutarlı olur', async () => {
    await userSeed.load(3);
    const users = await User.find({ isSeed: true });
    for (const u of users) {
      const txs = await Transaction.find({ userId: u._id }).sort({ createdAt: 1 });
      assert.ok(txs.length >= 3 && txs.length <= 15);
      let running = 0;
      for (const tx of txs) {
        assert.equal(tx.balanceBefore, running);
        running = parseFloat((running + tx.amount).toFixed(2));
        assert.equal(tx.balanceAfter, running);
        assert.equal(tx.isSeed, true);
        const daysAgo = (Date.now() - tx.createdAt.getTime()) / (24 * 60 * 60 * 1000);
        assert.ok(daysAgo <= 90.01);
      }
      assert.equal(u.balance, running, 'User.balance, işlem geçmişinin net toplamıyla tutarlı olmalı');
    }
  });

  it('insertMany ile oluşturulan kullanıcı/transaction backfill\'i hiç ActivityEvent üretmez', async () => {
    await userSeed.load(3);
    const count = await ActivityEvent.countDocuments({});
    assert.equal(count, 0);
  });

  it('clear() tüm seed kullanıcıları ve onların transaction\'larını siler', async () => {
    await userSeed.load(3);
    const result = await userSeed.clear();
    assert.equal(result.deleted, 3);
    assert.equal(await User.countDocuments({ isSeed: true }), 0);
    assert.equal(await Transaction.countDocuments({}), 0);
  });

  it('liveTick() havuz boşken null döner', async () => {
    const result = await userSeed.liveTick();
    assert.equal(result, null);
  });

  it('liveTick() gerçek createTransaction() üzerinden 1 yeni işlem üretir ve ActivityEvent doğal düşer', async () => {
    await userSeed.load(1);
    const [user] = await User.find({ isSeed: true });
    await User.updateOne({ _id: user._id }, { balance: 1000 });
    const result = await userSeed.liveTick();
    assert.ok(result);
    assert.ok(['deposit', 'withdraw'].includes(result.type));
    // ledger.js'in createTransaction()'ı logActivity()'i fire-and-forget çağırıyor
    // (gerçek para işlemi activity-log'u beklememeli) — bkz. test/ledger-activity.test.js.
    // Insert ile find arasındaki yarışı deterministik hale getirmek için poll gerekir.
    const events = await waitForEvents({ userId: user._id, type: { $in: ['deposit', 'withdraw'] } });
    assert.equal(events.length, 1);
  });

  it('liveTick() düşük bakiyede withdraw bakiyeyi negatife düşürmez', async () => {
    await userSeed.load(1);
    const [user] = await User.find({ isSeed: true });
    await User.updateOne({ _id: user._id }, { balance: 30 });
    let sawWithdraw = false;
    for (let i = 0; i < 30 && !sawWithdraw; i++) {
      const result = await userSeed.liveTick();
      if (result && result.type === 'withdraw') {
        sawWithdraw = true;
        const updated = await User.findById(user._id);
        assert.ok(updated.balance >= 0, `balance negatif olmamalı: ${updated.balance}`);
      }
    }
    assert.ok(sawWithdraw, '30 denemede en az bir withdraw beklenir');
  });

  it('getSeedUserPool() yalnızca isSeed:true kullanıcıları döner', async () => {
    await User.create({ username: 'realuser1', email: 'realuser1@test.com', password: 'x', isSeed: false });
    await userSeed.load(2);
    const pool = await userSeed.getSeedUserPool();
    assert.equal(pool.length, 2);
    assert.ok(pool.every(u => u.balance !== undefined));
  });
});
