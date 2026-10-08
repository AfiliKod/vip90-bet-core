/**
 * Admin — updateBalance: requestId ile tekilleştirme ve tek transaction.
 *
 * Controller doğrudan çağrılıyor (bkz. admin-create-user.test.js). Bakiye,
 * defter kaydı ve bonus çevrim kaydı aynı transaction'da yazıldığı için
 * MongoDB replica set gerekir.
 *
 * Çalıştırmak için: node --test test/admin-update-balance.test.js
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Transaction from '../src/models/Transaction.js';
import BonusWagering from '../src/models/BonusWagering.js';
import { updateBalance } from '../src/controllers/admin.js';

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

async function call(userId, validated, adminId) {
  const req = { params: { id: String(userId) }, validated, user: { id: adminId } };
  const res = fakeRes();
  let err = null;
  await updateBalance(req, res, (e) => { err = e; });
  return { res, err };
}

describe('Admin — updateBalance', () => {
  let admin;

  before(async () => {
    await mongoose.connect('mongodb://localhost:27017/betzone_test_admin_update_balance');
    await Transaction.syncIndexes();
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Transaction.deleteMany({});
    await BonusWagering.deleteMany({});
    admin = await User.create({ username: 'admin1', email: 'adm@test.com', password: 'x', role: 'admin' });
  });

  it('aynı requestId ile ikinci istek bakiyeyi değiştirmez, ilk kaydı döner', async () => {
    const u = await User.create({ username: 'player1', email: 'p1@test.com', password: 'x', balance: 100 });
    const requestId = crypto.randomUUID();

    const first = await call(u._id, { amount: 50, type: 'credit', requestId }, admin._id);
    assert.equal(first.err, null, first.err?.message);
    assert.equal(first.res.body.duplicate, false);

    const second = await call(u._id, { amount: 50, type: 'credit', requestId }, admin._id);
    assert.equal(second.err, null, second.err?.message);
    assert.equal(second.res.body.duplicate, true);
    assert.equal(String(second.res.body.transaction._id), String(first.res.body.transaction._id));

    assert.equal((await User.findById(u._id)).balance, 150);
    assert.equal(await Transaction.countDocuments({ userId: u._id }), 1);
  });

  it('aynı requestId ile eşzamanlı iki istekten yalnız biri uygulanır', async () => {
    const u = await User.create({ username: 'player2', email: 'p2@test.com', password: 'x', balance: 0 });
    const requestId = crypto.randomUUID();

    const results = await Promise.all([
      call(u._id, { amount: 30, type: 'credit', requestId }, admin._id),
      call(u._id, { amount: 30, type: 'credit', requestId }, admin._id),
    ]);
    for (const r of results) assert.equal(r.err, null, r.err?.message);
    assert.deepEqual(results.map(r => r.res.body.duplicate).sort(), [false, true]);

    assert.equal((await User.findById(u._id)).balance, 30);
    assert.equal(await Transaction.countDocuments({ userId: u._id }), 1);
  });

  it('bakiyeden büyük borç 400 döner, bakiye ve defter değişmez', async () => {
    const u = await User.create({ username: 'player3', email: 'p3@test.com', password: 'x', balance: 20 });

    const r = await call(u._id, { amount: 50, type: 'debit', requestId: crypto.randomUUID() }, admin._id);
    assert.equal(r.err?.status, 400);
    assert.equal(r.err?.code, 'INSUFFICIENT_BALANCE');
    assert.equal((await User.findById(u._id)).balance, 20);
    assert.equal(await Transaction.countDocuments({ userId: u._id }), 0);
  });

  it('borç bakiyeyi düşürür, defter eksi tutar yazar', async () => {
    const u = await User.create({ username: 'player4', email: 'p4@test.com', password: 'x', balance: 80 });

    const r = await call(u._id, { amount: 30, type: 'debit', requestId: crypto.randomUUID() }, admin._id);
    assert.equal(r.err, null, r.err?.message);
    assert.equal((await User.findById(u._id)).balance, 50);
    const tx = await Transaction.findOne({ userId: u._id });
    assert.equal(tx.amount, -30);
    assert.equal(tx.balanceBefore, 80);
    assert.equal(tx.balanceAfter, 50);
  });

  it('bonus tek çevrim kaydı açar, tekrarında ikinci kayıt açılmaz', async () => {
    const u = await User.create({ username: 'player5', email: 'p5@test.com', password: 'x', balance: 0 });
    const requestId = crypto.randomUUID();

    await call(u._id, { amount: 10, type: 'bonus', requestId }, admin._id);
    await call(u._id, { amount: 10, type: 'bonus', requestId }, admin._id);

    assert.equal((await User.findById(u._id)).balance, 10);
    assert.equal(await BonusWagering.countDocuments({ userId: u._id }), 1);
    assert.equal((await BonusWagering.findOne({ userId: u._id })).wageringRequired, 350);
  });

  it('requestId gönderilmezse her istek ayrı işlem sayılır (eski istemciler)', async () => {
    const u = await User.create({ username: 'player6', email: 'p6@test.com', password: 'x', balance: 0 });

    await call(u._id, { amount: 5, type: 'credit' }, admin._id);
    await call(u._id, { amount: 5, type: 'credit' }, admin._id);

    assert.equal((await User.findById(u._id)).balance, 10);
    assert.equal(await Transaction.countDocuments({ userId: u._id }), 2);
  });
});
