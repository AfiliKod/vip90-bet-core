/**
 * Sorumlu oyun limitleri ve para işlemlerinin eşzamanlılığı — HTTP seviyesi.
 *
 * Gerçek rotalar (`routes/transactions.js`, `routes/bets.js`) ve gerçek ara
 * katman zinciri (requireAuth → validate → KYC → risk → RG → controller)
 * ayrı bir veritabanında, MongoDB transaction'ları için replika setle
 * çalışır. Modül kapıları (`requireBetting`) burada bağlı değildir; KYC
 * modülü bu DB'de kayıtsız olduğu için kapalıdır.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27017/betzone_test_rg_conc?replicaSet=rs0 \
 *   node --test test/rgConcurrency.test.js
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Transaction from '../src/models/Transaction.js';
import Bet from '../src/models/Bet.js';
import Event from '../src/models/Event.js';
import transactionsRoutes from '../src/routes/transactions.js';
import betsRoutes from '../src/routes/bets.js';
import { errorHandler } from '../src/middleware/error.js';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/betzone_test_rg_conc?replicaSet=rs0';
process.env.JWT_SECRET ||= 'rg-concurrency-test-secret';

const IBAN = 'TR330006100519786457841326';
let server, base, event, seq = 0;

function token(user) {
  return jwt.sign({ id: String(user._id), role: 'user', tokenVersion: user.tokenVersion ?? 0 }, process.env.JWT_SECRET);
}

async function player(fields = {}) {
  seq += 1;
  return User.create({ username: `rgc_${seq}`, email: `rgc_${seq}@test.example`, password: 'pass12345', balance: 0, ...fields });
}

async function call(user, path, body) {
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(user)}` },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, code: json.error?.code, body: json };
}

const deposit = (u, amount) => call(u, '/api/transactions/deposit', { amount });
const withdraw = (u, amount) => call(u, '/api/transactions/withdraw', { amount, iban: IBAN, fullName: 'Test Oyuncu' });
const bet = (u, stake) => call(u, '/api/bets', {
  type: 'single', stake,
  selections: [{ eventId: String(event._id), marketType: 'maç_sonucu', oddId: 'o1', oddLabel: '1', oddValue: 2.0, eventLabel: 'A - B' }],
});

/**
 * Oyuncunun defter kayıtları bakiyeyi birebir açıklıyor mu? Kayıp güncelleme
 * (iki işlemin aynı bakiyeyi okuyup birinin düşümünü ezmesi) olursa bakiye,
 * başlangıç + defter toplamından sapar.
 */
async function assertLedgerReconciles(user, initialBalance) {
  const fresh = await User.findById(user._id).lean();
  const txs = await Transaction.find({ userId: user._id }).sort({ createdAt: 1, _id: 1 }).lean();
  const sum = +txs.reduce((a, t) => a + t.amount, 0).toFixed(2);
  assert.equal(+(initialBalance + sum).toFixed(2), fresh.balance, 'başlangıç + defter toplamı = bakiye');
  assert.ok(fresh.balance >= 0, `bakiye negatife düşmemeli (${fresh.balance})`);
  for (const t of txs) {
    assert.equal(+(t.balanceBefore + t.amount).toFixed(2), t.balanceAfter, `kayıt ${t._id} kendi içinde tutarlı`);
  }
  return { fresh, txs };
}

const count = (results, pred) => results.filter(pred).length;

describe('Sorumlu oyun ve eşzamanlılık (HTTP)', () => {
  before(async () => {
    await mongoose.connect(URI);
    await mongoose.connection.dropDatabase();
    // Koleksiyonlar transaction içinde ilk kez oluşturulunca geçici hata
    // verebiliyor; testin konusu bu değil, önceden oluştur.
    for (const m of [User, Transaction, Bet, Event]) await m.createCollection().catch(() => {});
    await Promise.all([User, Transaction, Bet, Event].map(m => m.syncIndexes()));

    const app = express();
    app.use(express.json());
    app.use('/api/transactions', transactionsRoutes);
    app.use('/api/bets', betsRoutes);
    app.use(errorHandler);
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    server?.close();
    await mongoose.connection.dropDatabase().catch(() => {});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Event.deleteMany({});
    event = await Event.create({
      sport: 'football', league: 'Test', country: 'Test',
      homeTeam: { name: 'A' }, awayTeam: { name: 'B' },
      status: 'upcoming', startTime: new Date(Date.now() + 3600_000),
      markets: [{ type: 'maç_sonucu', odds: [{ id: 'o1', label: '1', value: 2.0, isActive: true }] }],
    });
  });

  describe('Limitler (sıralı)', () => {
    it('günlük yatırma limiti: limite kadar kabul, aşan istek 403 LIMIT_EXCEEDED', async () => {
      const u = await player({ responsibleLimits: { depositDaily: 500 } });
      assert.equal((await deposit(u, 300)).status, 200);
      const over = await deposit(u, 300);
      assert.equal(over.status, 403);
      assert.equal(over.code, 'LIMIT_EXCEEDED');
      assert.equal((await deposit(u, 200)).status, 200, 'tam limite kadar izin verilir');
      assert.equal((await deposit(u, 10)).code, 'LIMIT_EXCEEDED');
      const fresh = await User.findById(u._id);
      assert.equal(fresh.balance, 500);
      assert.equal(fresh.dailyStats.deposits, 500);
    });

    it('haftalık ve aylık yatırma limiti ayrı ayrı uygulanır', async () => {
      const w = await player({ responsibleLimits: { depositWeekly: 100 } });
      assert.equal((await deposit(w, 100)).status, 200);
      assert.equal((await deposit(w, 10)).code, 'LIMIT_EXCEEDED');
      const m = await player({ responsibleLimits: { depositMonthly: 50 } });
      assert.equal((await deposit(m, 60)).code, 'LIMIT_EXCEEDED');
      assert.equal((await deposit(m, 50)).status, 200);
    });

    it('dünün yatırmaları bugünün günlük limitine sayılmaz', async () => {
      const yesterday = new Date(Date.now() - 86400_000);
      const u = await player({ responsibleLimits: { depositDaily: 100 }, dailyStats: { deposits: 100, lastUpdated: yesterday } });
      assert.equal((await deposit(u, 100)).status, 200);
      assert.equal((await User.findById(u._id)).dailyStats.deposits, 100);
    });

    it('günlük bahis (wager) limiti: aşan kupon 403, bakiye ve defter değişmez', async () => {
      const u = await player({ balance: 1000, responsibleLimits: { wagerDaily: 150 } });
      assert.equal((await bet(u, 100)).status, 201);
      const over = await bet(u, 100);
      assert.equal(over.status, 403);
      assert.equal(over.code, 'LIMIT_EXCEEDED');
      assert.equal((await bet(u, 50)).status, 201);
      const { fresh, txs } = await assertLedgerReconciles(u, 1000);
      assert.equal(fresh.balance, 850);
      assert.equal(txs.length, 2);
      assert.equal(await Bet.countDocuments({ userId: u._id }), 2);
    });

    it('kayıp limiti dolduysa yeni kupon reddedilir, yatırma serbest kalır', async () => {
      const u = await player({ balance: 500, responsibleLimits: { lossDaily: 200 }, dailyStats: { losses: 200, lastUpdated: new Date() } });
      assert.equal((await bet(u, 10)).code, 'LIMIT_EXCEEDED');
      assert.equal((await deposit(u, 50)).status, 200);
    });

    it('soğuma dönemi: yatırma, bahis ve çekim 403 ACCOUNT_RESTRICTED', async () => {
      const u = await player({ balance: 500, responsibleLimits: { coolOffUntil: new Date(Date.now() + 3600_000) } });
      for (const r of [await deposit(u, 50), await bet(u, 10), await withdraw(u, 50)]) {
        assert.equal(r.status, 403);
        assert.equal(r.code, 'ACCOUNT_RESTRICTED');
      }
      await assertLedgerReconciles(u, 500);
      assert.equal((await Transaction.countDocuments({ userId: u._id })), 0);
    });

    it('kendini dışlama süresi bitince işlemler yeniden açılır', async () => {
      const active = await player({ balance: 100, responsibleLimits: { selfExclusionUntil: new Date(Date.now() + 86400_000) } });
      assert.equal((await bet(active, 10)).code, 'ACCOUNT_RESTRICTED');
      const expired = await player({ balance: 100, responsibleLimits: { selfExclusionUntil: new Date(Date.now() - 1000) } });
      assert.equal((await bet(expired, 10)).status, 201);
    });

    it('yönetici kısıtlaması tüm para hareketlerini durdurur', async () => {
      const u = await player({ balance: 300, accountRestricted: true, restrictionReason: 'test' });
      assert.equal((await deposit(u, 50)).code, 'ACCOUNT_RESTRICTED');
      assert.equal((await withdraw(u, 50)).code, 'ACCOUNT_RESTRICTED');
      assert.equal((await bet(u, 10)).code, 'ACCOUNT_RESTRICTED');
    });

    it('limitler çekimi engellemez (oyuncu parasını her zaman çekebilir)', async () => {
      const u = await player({ balance: 300, responsibleLimits: { depositDaily: 10, wagerDaily: 10, lossDaily: 1 }, dailyStats: { losses: 50, lastUpdated: new Date() } });
      assert.equal((await withdraw(u, 100)).status, 200);
    });
  });

  describe('Eşzamanlılık', () => {
    it('20 eşzamanlı çekim (bakiye 10 çekime yeter): tam 10 başarılı, bakiye 0, defter tutarlı', async () => {
      const u = await player({ balance: 1000 });
      const results = await Promise.all(Array.from({ length: 20 }, () => withdraw(u, 100)));
      const statuses = results.map(r => `${r.status}:${r.code ?? ''}`);
      const accepted = count(results, r => r.status === 200);
      const { fresh } = await assertLedgerReconciles(u, 1000);
      assert.equal(fresh.balance, 1000 - accepted * 100, 'kabul edilen çekimler kadar düşüldü');
      assert.equal(count(results, r => r.status >= 500), 0, `hiçbir istek 5xx dönmemeli: ${statuses.join(' ')}`);
      assert.equal(accepted, 10, statuses.join(' '));
      assert.equal(count(results, r => r.code === 'INSUFFICIENT_BALANCE'), 10, statuses.join(' '));
    });

    it('20 eşzamanlı kupon (bakiye 10 kupona yeter): tam 10 kupon, çift harcama yok', async () => {
      const u = await player({ balance: 1000 });
      const results = await Promise.all(Array.from({ length: 20 }, () => bet(u, 100)));
      const statuses = results.map(r => `${r.status}:${r.code ?? ''}`);
      // Para güvenliği: kaç kupon kabul edildiyse bakiye ve defter onu birebir yansıtmalı.
      const accepted = count(results, r => r.status === 201);
      const { fresh } = await assertLedgerReconciles(u, 1000);
      assert.equal(await Bet.countDocuments({ userId: u._id }), accepted, 'kabul edilen kupon = kayıtlı kupon');
      assert.equal(fresh.balance, 1000 - accepted * 100);
      assert.equal(fresh.dailyStats.wagers, accepted * 100, 'wager sayacı hiçbir artışı kaybetmemeli');
      // Hizmet kalitesi: çakışan işlemler yeniden denenmeli, oyuncu 500 görmemeli.
      assert.equal(count(results, r => r.status >= 500), 0, `hiçbir istek 5xx dönmemeli: ${statuses.join(' ')}`);
      assert.equal(accepted, 10, statuses.join(' '));
    });

    it('karışık eşzamanlı yatırma/çekim/kupon: bakiye = başlangıç + başarılı işlemler', async () => {
      const u = await player({ balance: 500 });
      const ops = [];
      for (let i = 0; i < 10; i++) ops.push(['deposit', 50], ['withdraw', 80], ['bet', 40]);
      const results = await Promise.all(ops.map(([op, amt]) =>
        (op === 'deposit' ? deposit(u, amt) : op === 'withdraw' ? withdraw(u, amt) : bet(u, amt)).then(r => ({ op, amt, ...r }))));
      const ok = results.filter(r => r.status === 200 || r.status === 201);
      const expected = ok.reduce((a, r) => a + (r.op === 'deposit' ? r.amt : -r.amt), 500);
      const { fresh, txs } = await assertLedgerReconciles(u, 500);
      assert.equal(fresh.balance, +expected.toFixed(2));
      assert.equal(txs.length, ok.length, 'her başarılı işlem tam bir defter kaydı');
      const failed = results.filter(r => r.status >= 500);
      assert.equal(failed.length, 0, `5xx: ${failed.map(r => `${r.op}/${r.body?.error?.code}`).join(' ')}`);
      assert.equal(count(results, r => r.op === 'deposit' && r.status === 200), 10, 'yatırmalar bakiyeden bağımsız hep başarılı');
    });

    it('eşzamanlı kuponlar günlük bahis limitini aşamaz', async () => {
      const u = await player({ balance: 5000, responsibleLimits: { wagerDaily: 300 } });
      const results = await Promise.all(Array.from({ length: 10 }, () => bet(u, 100)));
      const fresh = await User.findById(u._id).lean();
      const accepted = count(results, r => r.status === 201);
      assert.equal(accepted, 3, results.map(r => r.code || r.status).join(' '));
      assert.equal(count(results, r => r.code === 'LIMIT_EXCEEDED'), 7);
      assert.ok(fresh.dailyStats.wagers <= 300,
        `günlük bahis limiti 300, kabul edilen ${accepted} kupon, toplam bahis ${fresh.dailyStats.wagers}`);
    });

    it('eşzamanlı yatırmalar günlük yatırma limitini aşamaz', async () => {
      const u = await player({ responsibleLimits: { depositDaily: 300 } });
      const results = await Promise.all(Array.from({ length: 10 }, () => deposit(u, 100)));
      const fresh = await User.findById(u._id).lean();
      const accepted = count(results, r => r.status === 200);
      assert.equal(accepted, 3, results.map(r => r.code || r.status).join(' '));
      assert.equal(fresh.balance, 300, 'bakiye yalnız kabul edilen yatırmalar kadar arttı');
      assert.ok(fresh.dailyStats.deposits <= 300,
        `günlük yatırma limiti 300, kabul edilen ${accepted} yatırma, toplam ${fresh.dailyStats.deposits}`);
    });
  });
});

describe('retryDelay', () => {
  it('üstel artan tavan içinde rastgele, 400 ms ile sınırlı ve en az 1 ms', async () => {
    const { retryDelay } = await import('../src/utils/transactionRetry.js');
    assert.equal(retryDelay(1, () => 0), 1);
    assert.equal(retryDelay(1, () => 0.999), 20);
    assert.equal(retryDelay(3, () => 0.999), 80);
    assert.equal(retryDelay(12, () => 0.999), 400);
  });
});
