/**
 * Kripto çekimleri: eşzamanlılık, belirsiz transfer sonucu ve zincirle
 * uzlaştırma (2026-10-12). Zincir istemcisi (`services/cryptoService.js`)
 * taklit edilir; modül taklidi bayrak ister:
 *
 *   node --test --experimental-test-module-mocks test/cryptoWithdrawConcurrency.test.js
 *
 * MONGODB_URI verilmezse 127.0.0.1:27017 (rs0) üzerinde ayrı bir DB kullanılır.
 */
import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/betzone_test_crypto_conc?replicaSet=rs0';
process.env.JWT_SECRET ||= 'crypto-conc-test-secret';

/** Taklit zincir: hazırlanan/yayınlanan işlemleri ve zincir durumunu tutar. */
const chain = {
  reset() {
    Object.assign(this, { prepared: 0, broadcasts: 0, prepareFail: false, broadcastResult: 'accepted', statusThrows: false, expiresInMs: 60_000, delayMs: 20 });
    this.onChain = new Map(); // txId → 'success' | 'failed'
    this.landOnBroadcast = 'success'; // yayınlanan işlem zincirde ne olur (null: hiç görünmez)
  },
};
chain.reset();

mock.module('../src/services/cryptoService.js', {
  namedExports: {
    prepareUSDTTransfer: async () => {
      if (chain.prepareFail) throw Object.assign(new Error('test: imzalanamadı'), { notSent: true });
      chain.prepared += 1;
      const txId = crypto.randomBytes(32).toString('hex');
      return { txId, expiresAt: Date.now() + chain.expiresInMs, signedTx: { txID: txId } };
    },
    broadcastUSDTTransfer: async (signedTx) => {
      chain.broadcasts += 1;
      await new Promise(r => setTimeout(r, chain.delayMs));
      // 'unknown': yanıt kayboldu ama işlem yine de zincire gitmiş olabilir
      if (chain.broadcastResult !== 'rejected' && chain.landOnBroadcast) chain.onChain.set(signedTx.txID, chain.landOnBroadcast);
      return chain.broadcastResult === 'accepted' ? { status: 'accepted' }
        : chain.broadcastResult === 'rejected' ? { status: 'rejected', error: 'CONTRACT_VALIDATE_ERROR: test' }
          : { status: 'unknown', error: 'test: zaman aşımı' };
    },
    getUSDTTransferStatus: async (txId) => {
      if (chain.statusThrows) throw new Error('test: düğüm erişilemiyor');
      return chain.onChain.get(txId) || 'not_found';
    },
    transferUSDT: async () => { throw new Error('artık kullanılmamalı'); },
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
const svc = await import('../src/services/cryptoWithdrawal.js');

let server, base, seq = 0;
const ADDRESS = 'T' + 'B'.repeat(33);
const LATER = () => Date.now() + 10 * 60 * 1000; // süre + pay dolmuş

async function player(balance) {
  seq += 1;
  return User.create({ username: `cc_${seq}`, email: `cc_${seq}@test.example`, password: 'pass12345', balance });
}
const balanceOf = async id => (await User.findById(id).lean()).balance;
const statusOf = async id => (await Transaction.findById(id).lean()).status;

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

/** Admin onayı bekleyen çekim (bakiye düşülmüş). */
async function pendingWithdrawal(u, usdt = 100) {
  return Transaction.create({ userId: u._id, type: 'crypto_withdraw', amount: -usdt, balanceBefore: usdt, balanceAfter: 0, status: 'pending', metadata: { toAddress: ADDRESS, usdtAmount: usdt, flow: 'admin' } });
}

/** Defter bakiyeyi açıklıyor mu (bekleyen/işlemdeki düşümler dahil, iade satırları dahil). */
async function assertLedger(userId, initial) {
  const txs = await Transaction.find({ userId, status: { $nin: ['rejected', 'failed'] } }).lean();
  const failedOrRejected = await Transaction.find({ userId, status: { $in: ['rejected', 'failed'] } }).lean();
  // failed/rejected çekimin düşümü + iade satırı birlikte sıfırlanır
  const sum = +[...txs, ...failedOrRejected].reduce((a, t) => a + t.amount, 0).toFixed(2);
  assert.equal(+(initial + sum).toFixed(2), await balanceOf(userId), 'başlangıç + defter = bakiye');
}

describe('Kripto çekimleri', () => {
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

  beforeEach(() => chain.reset());

  describe('eşzamanlılık', () => {
    it('otomatik çekim: 10 eşzamanlı talep bakiyeyi aşamaz; yalnız düşülenler yayınlanır, uzlaştırma tamamlar', async () => {
      const amount = 10; // minWithdraw (5) ≤ 10 < autoProcessLimit (15): otomatik
      const u = await player(amount * 3);
      const out = await Promise.all(Array.from({ length: 10 }, () => withdraw(u, amount)));
      const ok = out.filter(o => o.status === 200);
      assert.equal(ok.length, 3, out.map(o => `${o.status}:${o.body?.error?.code || o.body?.error || ''}`).join(' '));
      assert.equal(chain.broadcasts, 3, 'yayın = başarılı talep sayısı');
      assert.equal(await balanceOf(u._id), 0);
      assert.equal(await Transaction.countDocuments({ userId: u._id, status: 'processing' }), 3, 'zincir onayına kadar işlemde');
      await svc.reconcileProcessingWithdrawals();
      assert.equal(await Transaction.countDocuments({ userId: u._id, type: 'crypto_withdraw', status: 'completed' }), 3);
      await assertLedger(u._id, amount * 3);
    });

    it('admin: aynı bekleyen çekime eşzamanlı 5 onay → tek yayın', async () => {
      const { approveCryptoWithdrawal } = await import('../src/controllers/admin.js');
      const u = await player(0);
      const tx = await pendingWithdrawal(u);
      const res = await Promise.all(Array.from({ length: 5 }, async () => { const r = mockRes(); await approveCryptoWithdrawal({ params: { id: String(tx._id) }, user: { id: 'a' } }, r, e => { r.err = e; }); return r; }));
      assert.equal(chain.broadcasts, 1);
      assert.equal(res.filter(r => r.body?.ok).length, 1);
    });

    it('admin: eşzamanlı onay ve red → ya gönderilir ya iade edilir, ikisi birden asla', async () => {
      const { approveCryptoWithdrawal, rejectCryptoWithdrawal } = await import('../src/controllers/admin.js');
      for (let i = 0; i < 5; i++) {
        chain.reset();
        const u = await player(0);
        const tx = await pendingWithdrawal(u);
        await Promise.all([
          approveCryptoWithdrawal({ params: { id: String(tx._id) }, user: { id: 'a' } }, mockRes(), () => {}),
          rejectCryptoWithdrawal({ params: { id: String(tx._id) }, user: { id: 'a' } }, mockRes(), () => {}),
        ]);
        const refunded = (await balanceOf(u._id)) === 100;
        assert.ok(!(refunded && chain.broadcasts > 0), `hem iade (${refunded}) hem yayın (${chain.broadcasts})`);
        assert.ok(refunded || chain.broadcasts === 1, 'en az biri gerçekleşmeli');
      }
    });
  });

  describe('kesin "gönderilmedi" durumları', () => {
    it('imzalama/hazırlama başarısız: otomatik çekim hemen iade edilir', async () => {
      chain.prepareFail = true;
      const u = await player(10);
      const r = await withdraw(u, 10);
      assert.equal(r.status, 500);
      assert.equal(await balanceOf(u._id), 10);
      assert.equal(chain.broadcasts, 0);
      const txs = await Transaction.find({ userId: u._id }).lean();
      assert.deepEqual(txs.map(t => `${t.type}:${t.status}`).sort(), ['crypto_withdraw:failed', 'refund:completed']);
    });

    it('düğüm yayını açıkça reddetti: otomatik çekim iade edilir', async () => {
      chain.broadcastResult = 'rejected';
      const u = await player(10);
      const r = await withdraw(u, 10);
      assert.equal(r.status, 500);
      assert.equal(await balanceOf(u._id), 10);
      await assertLedger(u._id, 10);
    });

    it('zincirde başarısız (sözleşme geri döndü): admin çekimi yeniden onaya açılır; yeniden onay yeni işlemle tamamlanır', async () => {
      const { approveCryptoWithdrawal } = await import('../src/controllers/admin.js');
      const u = await player(0);
      const tx = await pendingWithdrawal(u);
      chain.landOnBroadcast = 'failed';
      await approveCryptoWithdrawal({ params: { id: String(tx._id) }, user: { id: 'a' } }, mockRes(), () => {});
      assert.equal((await svc.reconcileWithdrawal(tx._id)).state, 'pending');
      assert.equal(await statusOf(tx._id), 'pending');
      assert.equal(await balanceOf(u._id), 0, 'admin akışında iade yok; çekim bekliyor');

      chain.landOnBroadcast = 'success';
      const r = mockRes();
      await approveCryptoWithdrawal({ params: { id: String(tx._id) }, user: { id: 'a' } }, r, () => {});
      assert.equal(r.body.ok, true);
      assert.equal((await svc.reconcileWithdrawal(tx._id)).state, 'completed');
      const done = await Transaction.findById(tx._id).lean();
      assert.equal(done.metadata.attempts.length, 2, 'iki deneme, iki farklı işlem');
      assert.notEqual(done.metadata.attempts[0].txId, done.metadata.attempts[1].txId);
      assert.equal(done.metadata.txHash, done.metadata.attempts[1].txId);
    });
  });

  describe('belirsiz sonuç ve uzlaştırma', () => {
    it('yanıt kayboldu ama işlem zincire gitti: uzlaştırma tamamlar, iade YAPILMAZ', async () => {
      chain.broadcastResult = 'unknown';
      const u = await player(10);
      const r = await withdraw(u, 10);
      assert.equal(r.status, 502);
      assert.match(r.body.txHash, /^[0-9a-f]{64}$/);
      const tx = await Transaction.findOne({ userId: u._id, type: 'crypto_withdraw' }).lean();
      assert.equal(tx.status, 'processing');
      assert.equal((await svc.reconcileWithdrawal(tx._id, { at: LATER() })).state, 'completed');
      assert.equal(await balanceOf(u._id), 0);
      assert.equal(await Transaction.countDocuments({ userId: u._id, type: 'refund' }), 0);
    });

    it('yanıt kayboldu ve işlem zincire gitmedi: süre dolana kadar bekler, sonra bir kez iade eder', async () => {
      chain.broadcastResult = 'unknown';
      chain.landOnBroadcast = null;
      const u = await player(10);
      await withdraw(u, 10);
      const tx = await Transaction.findOne({ userId: u._id, type: 'crypto_withdraw' }).lean();
      assert.equal((await svc.reconcileWithdrawal(tx._id)).state, 'waiting', 'süre dolmadan karar verilmez');
      assert.equal(await balanceOf(u._id), 0);
      const results = await Promise.all(Array.from({ length: 5 }, () => svc.reconcileWithdrawal(tx._id, { at: LATER() })));
      assert.equal(results.filter(x => x.state === 'refunded').length, 1, JSON.stringify(results));
      assert.equal(await balanceOf(u._id), 10);
      assert.equal(await statusOf(tx._id), 'failed');
      await assertLedger(u._id, 10);
    });

    it('zincir sorgulanamıyorsa hiçbir şey değişmez', async () => {
      chain.broadcastResult = 'unknown';
      chain.landOnBroadcast = null;
      const u = await player(10);
      await withdraw(u, 10);
      chain.statusThrows = true;
      const tx = await Transaction.findOne({ userId: u._id, type: 'crypto_withdraw' }).lean();
      assert.equal((await svc.reconcileWithdrawal(tx._id, { at: LATER() })).state, 'unknown');
      assert.equal(await statusOf(tx._id), 'processing');
      assert.equal(await balanceOf(u._id), 0);
    });

    it('admin akışında belirsiz + gönderilmedi: süre dolunca yeniden "pending" (iade yok)', async () => {
      const { approveCryptoWithdrawal } = await import('../src/controllers/admin.js');
      chain.broadcastResult = 'unknown';
      chain.landOnBroadcast = null;
      const u = await player(0);
      const tx = await pendingWithdrawal(u);
      const r = mockRes();
      await approveCryptoWithdrawal({ params: { id: String(tx._id) }, user: { id: 'a' } }, r, () => {});
      assert.equal(r.statusCode, 502);
      assert.equal((await svc.reconcileWithdrawal(tx._id, { at: LATER() })).state, 'pending');
      assert.equal(await balanceOf(u._id), 0);
    });

    it('işlem kimliği hiç kaydedilmemiş eski/yarım kayıt: elle inceleme ister, admin sonuçlandırır', async () => {
      const u = await player(0);
      const auto = await Transaction.create({ userId: u._id, type: 'crypto_withdraw', amount: -10, balanceBefore: 10, balanceAfter: 0, status: 'processing', metadata: { toAddress: ADDRESS, usdtAmount: 10, flow: 'auto' } });
      assert.equal((await svc.reconcileWithdrawal(auto._id)).state, 'waiting');
      assert.equal((await svc.reconcileWithdrawal(auto._id, { at: LATER() })).state, 'manual_review');

      assert.equal((await svc.resolveWithdrawalManually(auto._id, { sent: true, txHash: 'kısa' })).ok, false, 'geçersiz txHash reddedilir');
      const r = await svc.resolveWithdrawalManually(auto._id, { sent: false, adminId: 'a' });
      assert.deepEqual(r, { ok: true, state: 'refunded' });
      assert.equal(await balanceOf(u._id), 10);

      const u2 = await player(0);
      const sentTx = await Transaction.create({ userId: u2._id, type: 'crypto_withdraw', amount: -10, balanceBefore: 10, balanceAfter: 0, status: 'processing', metadata: { toAddress: ADDRESS, usdtAmount: 10, flow: 'auto' } });
      const hash = crypto.randomBytes(32).toString('hex');
      assert.deepEqual(await svc.resolveWithdrawalManually(sentTx._id, { sent: true, txHash: hash, adminId: 'a' }), { ok: true, state: 'completed' });
      assert.equal((await Transaction.findById(sentTx._id).lean()).metadata.txHash, hash);
      assert.equal(await balanceOf(u2._id), 0);
    });

    it('işlem kimliği kayıtlıysa elle sonuçlandırma reddedilir (zincir uzlaştırması kullanılır)', async () => {
      chain.broadcastResult = 'unknown';
      const u = await player(10);
      await withdraw(u, 10);
      const tx = await Transaction.findOne({ userId: u._id, type: 'crypto_withdraw' }).lean();
      const r = await svc.resolveWithdrawalManually(tx._id, { sent: false, adminId: 'a' });
      assert.equal(r.ok, false);
      assert.equal(await balanceOf(u._id), 0);
    });
  });
});
