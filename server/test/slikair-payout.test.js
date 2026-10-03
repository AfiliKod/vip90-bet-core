/**
 * Slikair — admin payout başlatma (initiatePayout)
 *
 * Kullanıcı tarafında Slikair çekim talebi akışı yok, bu yüzden admin'in
 * doğrudan bir kullanıcı için payout başlatabildiği minimal endpoint'i
 * test ediyor. Gerçek sandbox ağına istek atmamak için _setSlikairService()
 * ile createPayout taklit ediliyor (webhook testlerindeki slikairMock
 * deseniyle tutarlı). Admin route/permission middleware'i (requireAuth +
 * requirePermission) atlanıp controller doğrudan çağrılıyor — bu repo'da
 * admin controller'larını HTTP üzerinden admin JWT'siyle test eden bir
 * emsal yok, mevcut testler de controller fonksiyonlarını doğrudan çağırıyor.
 *
 * Çalıştırmak için: node --test test/slikair-payout.test.js
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '..', '.env') });

// Dinamik import — statik import'lar ESM'de hoist edildiği için config()'ten
// ÖNCE çalışır, bu da config/slikair.js'in SLIKAIR_SETTINGS'i boş env
// değerleriyle donduarmasına yol açar (slikair-webhook-connectivity.test.js'te
// de aynı sebeple dinamik import kullanılıyor).
const { default: User } = await import('../src/models/User.js');
const { default: Transaction } = await import('../src/models/Transaction.js');
const { default: SlikairPayout } = await import('../src/models/SlikairPayout.js');
const { initiatePayout, _setSlikairService, _getSlikairService } = await import('../src/controllers/slikairController.js');

const ORIGINAL = _getSlikairService();

const slikairMock = {
  nextCreatePayout: null, // { result } veya { throws: Error }
  async createPayout() {
    if (!slikairMock.nextCreatePayout) throw new Error('createPayout bu test için mocklanmadı');
    if (slikairMock.nextCreatePayout.throws) throw slikairMock.nextCreatePayout.throws;
    return slikairMock.nextCreatePayout.result;
  },
};

function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

async function callInitiatePayout(validated) {
  const req = { validated, user: { id: new mongoose.Types.ObjectId().toString() } };
  const res = fakeRes();
  let nextErr = null;
  const next = (e) => { nextErr = e; };
  await initiatePayout(req, res, next);
  return { res, nextErr };
}

describe('Slikair — initiatePayout (admin)', () => {
  before(async () => {
    await mongoose.connect('mongodb://localhost:27017/betzone_test_slikair_payout');
  });

  after(async () => {
    _setSlikairService(ORIGINAL);
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Transaction.deleteMany({});
    await SlikairPayout.deleteMany({});
    slikairMock.nextCreatePayout = null;
    _setSlikairService(slikairMock);
  });

  it('başarılı payout: bakiye düşer, SlikairPayout + withdraw Transaction oluşur, payoutId kaydedilir', async () => {
    const user = await User.create({ username: 'payoutuser', email: 'payoutuser@test.com', password: 'x', balance: 100 });

    slikairMock.nextCreatePayout = { result: { payout_id: 'slk-payout-1', status: 'created' } };

    const { res, nextErr } = await callInitiatePayout({
      userId: user._id.toString(),
      amount: 40,
      currency: 'EUR',
      method: 'crypto',
      country: 'NLD',
      paymentDetails: { method: 'crypto', convertTo: 'USDT', toAddress: 'Txxxaddr' },
    });

    assert.equal(nextErr, null, nextErr?.message);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.slikairPayoutId, 'slk-payout-1');
    assert.equal(res.body.status, 'processing');

    const fresh = await User.findById(user._id);
    assert.equal(fresh.balance, 60);

    const payout = await SlikairPayout.findOne({ userId: user._id });
    assert.ok(payout);
    assert.equal(payout.payoutId, 'slk-payout-1');
    assert.equal(payout.status, 'processing');
    assert.equal(payout.amount, 40);

    const tx = await Transaction.findOne({ userId: user._id, type: 'withdraw' });
    assert.ok(tx, 'withdraw Transaction oluşmalı');
    assert.equal(tx.amount, -40);
    assert.equal(tx.balanceBefore, 100);
    assert.equal(tx.balanceAfter, 60);
    assert.equal(tx.referenceId.toString(), payout._id.toString());
  });

  it('yetersiz bakiye: Slikair\'e hiç istek atmadan 400 döner, bakiye değişmez', async () => {
    const user = await User.create({ username: 'poorpayout', email: 'poorpayout@test.com', password: 'x', balance: 10 });

    const { nextErr } = await callInitiatePayout({
      userId: user._id.toString(),
      amount: 40,
      currency: 'EUR',
      method: 'crypto',
      country: 'NLD',
      paymentDetails: {},
    });

    assert.ok(nextErr, 'INSUFFICIENT_BALANCE hatası next() ile geçmeli');
    assert.equal(nextErr.status ?? nextErr.statusCode, 400);

    const fresh = await User.findById(user._id);
    assert.equal(fresh.balance, 10, 'Slikair hiç çağrılmadığı için bakiye değişmemeli');

    const payoutCount = await SlikairPayout.countDocuments({ userId: user._id });
    assert.equal(payoutCount, 0, 'Yetersiz bakiyede hiçbir SlikairPayout kaydı oluşmamalı');
  });

  it('Slikair isteği başarısız olursa (sandbox payout desteklemiyor senaryosu): bakiye iade edilir, payout failed olarak işaretlenir', async () => {
    const user = await User.create({ username: 'failpayout', email: 'failpayout@test.com', password: 'x', balance: 100 });

    slikairMock.nextCreatePayout = { throws: Object.assign(new Error('Sandbox environment does not support payouts'), { status: 400 }) };

    const { nextErr } = await callInitiatePayout({
      userId: user._id.toString(),
      amount: 40,
      currency: 'EUR',
      method: 'crypto',
      country: 'NLD',
      paymentDetails: { method: 'crypto', convertTo: 'USDT', toAddress: 'Txxxaddr' },
    });

    assert.ok(nextErr, 'Slikair hatası next() ile geçmeli');
    assert.match(nextErr.message, /does not support payouts/);

    const fresh = await User.findById(user._id);
    assert.equal(fresh.balance, 100, 'Slikair isteği başarısız olunca bakiye tam olarak iade edilmeli');

    const payout = await SlikairPayout.findOne({ userId: user._id });
    assert.equal(payout.status, 'failed');

    const refundTx = await Transaction.findOne({ userId: user._id, type: 'refund' });
    assert.ok(refundTx, 'İade Transaction kaydı oluşmalı');
    assert.equal(refundTx.amount, 40);
    assert.equal(refundTx.balanceAfter, 100);
  });
});
