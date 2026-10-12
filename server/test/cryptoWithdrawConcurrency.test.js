/**
 * Kripto çekimlerinde eşzamanlılık (2026-10-12). Zincir transferi
 * (`services/cryptoService.js`) taklit edilir; modül taklidi bayrak ister:
 *
 *   node --test --experimental-test-module-mocks test/cryptoWithdrawConcurrency.test.js
 *
 * MONGODB_URI verilmezse 127.0.0.1:27017 (rs0) üzerinde ayrı bir DB kullanılır.
 */
import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/betzone_test_crypto_conc?replicaSet=rs0';
process.env.JWT_SECRET ||= 'crypto-conc-test-secret';

const chain = { transfers: 0, fail: false, delayMs: 30 };
mock.module('../src/services/cryptoService.js', {
  namedExports: {
    transferUSDT: async () => {
      chain.transfers += 1;
      await new Promise(r => setTimeout(r, chain.delayMs));
      return chain.fail ? { success: false, error: 'test: zincir reddetti' } : { success: true, txHash: `tx${Date.now()}${Math.random().toString(16).slice(2)}` };
    },
    getHotWalletBalance: async () => ({ usdt: 1e9, trx: 1e9 }),
    getWalletBalance: async () => ({ usdt: 0, trx: 0 }),
    deriveDepositAddress: () => 'T' + 'A'.repeat(33),
    fetchIncomingUSDT: async () => [],
    getHotWalletSigner: () => null,
    getHotWalletAddress: () => 'T' + 'C'.repeat(33),
  },
});

const { default: User } = await import('../src/models/User.js');
const { default: Transaction } = await import('../src/models/Transaction.js');
const { CRYPTO_SETTINGS } = await import('../src/config/crypto.js');

let server, base, seq = 0;
const ADDRESS = 'T' + 'B'.repeat(33);

async function player(balance) {
  seq += 1;
  return User.create({ username: `cc_${seq}`, email: `cc_${seq}@test.example`, password: 'pass12345', balance });
}
const balanceOf = async id => (await User.findById(id).lean()).balance;

async function withdraw(user, usdtAmount) {
  const token = jwt.sign({ id: String(user._id), role: 'user', tokenVersion: 0 }, process.env.JWT_SECRET);
  const r = await fetch(`${base}/api/crypto/withdraw-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ address: ADDRESS, usdtAmount }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

function mockRes() {
  const res = { statusCode: 200 };
  res.status = c => { res.statusCode = c; return res; };
  res.json = b => { res.body = b; return res; };
  return res;
}

describe('Kripto çekim eşzamanlılığı', () => {
  before(async () => {
    await mongoose.connect(URI);
    await mongoose.connection.dropDatabase();
    for (const m of [User, Transaction]) { await m.createCollection().catch(() => {}); await m.syncIndexes(); }
    CRYPTO_SETTINGS.usdtTryRate = 1;
    const { default: cryptoRoutes } = await import('../src/routes/crypto.js');
    const { errorHandler } = await import('../src/middleware/error.js');
    const app = express();
    app.use(express.json());
    app.use('/api/crypto', cryptoRoutes);
    app.use(errorHandler);
    await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    server?.close();
    await mongoose.connection.dropDatabase().catch(() => {});
    await mongoose.disconnect();
  });

  it('otomatik çekim: 10 eşzamanlı talep bakiyeyi aşamaz, zincire yalnız düşülenler kadar gider', async () => {
    chain.transfers = 0; chain.fail = false;
    const amount = 10; // minWithdraw (5) ≤ 10 < autoProcessLimit (15): otomatik işlenir
    const u = await player(amount * 3);
    const out = await Promise.all(Array.from({ length: 10 }, () => withdraw(u, amount)));
    const ok = out.filter(o => o.status === 200);
    assert.equal(ok.length, 3, out.map(o => `${o.status}:${o.body?.error?.code || o.body?.error || ''}`).join(' '));
    assert.equal(chain.transfers, 3, 'zincir transferi = başarılı çekim sayısı');
    assert.equal(await balanceOf(u._id), 0);
    assert.equal(await Transaction.countDocuments({ userId: u._id, type: 'crypto_withdraw', status: 'completed' }), 3);
  });

  it('otomatik çekim zincirde reddedilirse bakiye iade edilir, defter iadeyi gösterir', async () => {
    chain.transfers = 0; chain.fail = true;
    const amount = CRYPTO_SETTINGS.minWithdraw;
    const u = await player(amount);
    const r = await withdraw(u, amount);
    chain.fail = false;
    assert.equal(r.status, 500);
    assert.equal(await balanceOf(u._id), amount);
    const txs = await Transaction.find({ userId: u._id }).lean();
    assert.deepEqual(txs.map(t => `${t.type}:${t.status}`).sort(), ['crypto_withdraw:failed', 'refund:completed']);
  });

  it('admin onayı: aynı bekleyen çekime eşzamanlı 5 onay → zincire tek transfer', async () => {
    const { approveCryptoWithdrawal } = await import('../src/controllers/admin.js');
    chain.transfers = 0; chain.fail = false;
    const u = await player(0);
    const tx = await Transaction.create({ userId: u._id, type: 'crypto_withdraw', amount: -100, balanceBefore: 100, balanceAfter: 0, status: 'pending', metadata: { toAddress: ADDRESS, usdtAmount: 100 } });
    const res = await Promise.all(Array.from({ length: 5 }, async () => { const r = mockRes(); await approveCryptoWithdrawal({ params: { id: String(tx._id) } }, r, e => { r.err = e; }); return r; }));
    assert.equal(chain.transfers, 1, 'USDT bir kez gönderilmeli');
    assert.equal(res.filter(r => r.body?.ok).length, 1);
    assert.equal((await Transaction.findById(tx._id).lean()).status, 'completed');
  });

  it('admin: aynı çekime eşzamanlı onay ve red → ya gönderilir ya iade edilir, ikisi birden asla', async () => {
    const { approveCryptoWithdrawal, rejectCryptoWithdrawal } = await import('../src/controllers/admin.js');
    for (let i = 0; i < 5; i++) {
      chain.transfers = 0; chain.fail = false;
      const u = await player(0);
      const tx = await Transaction.create({ userId: u._id, type: 'crypto_withdraw', amount: -100, balanceBefore: 100, balanceAfter: 0, status: 'pending', metadata: { toAddress: ADDRESS, usdtAmount: 100 } });
      await Promise.all([
        approveCryptoWithdrawal({ params: { id: String(tx._id) } }, mockRes(), () => {}),
        rejectCryptoWithdrawal({ params: { id: String(tx._id) }, user: { id: String(u._id) } }, mockRes(), () => {}),
      ]);
      const refunded = (await balanceOf(u._id)) === 100;
      assert.ok(!(refunded && chain.transfers > 0), `hem iade (${refunded}) hem transfer (${chain.transfers})`);
      assert.ok(refunded || chain.transfers === 1, 'en az biri gerçekleşmeli');
    }
  });
});
