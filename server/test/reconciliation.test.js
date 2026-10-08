/**
 * Reconciliation — cryptoDeposit kanalı (gerçek TronGrid dış kaynağı) testleri
 *
 * Daha önce startJob'daki fetchExternalRecords her zaman [] dönen bir mock'tu
 * (server/src/controllers/reconciliation.js). cryptoDeposit tipi işler artık
 * gerçek bir kaynağa sahip: TronGrid (her USDT yatırma zaten zincir üzerinde
 * herkese açık, ayrı bir entegratör gerekmiyor — bkz.
 * docs/product/09-bilinen-kisitlar.md § Reconciliation). Gerçek ağa istek
 * atmamak için _setCryptoService() ile deriveDepositAddress/fetchIncomingUSDT
 * taklit ediliyor (slikairController.js'teki _setSlikairService deseniyle
 * tutarlı).
 *
 * Çalıştırmak için: node --test test/reconciliation.test.js
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// .env dosyasını yükle
config({ path: join(__dirname, '..', '.env') });

import User from '../src/models/User.js';
import CryptoDeposit from '../src/models/CryptoDeposit.js';
import { ReconciliationJob, ReconciliationItem } from '../src/models/Reconciliation.js';
import * as reconciliationService from '../src/services/reconciliation.js';
import {
  fetchCryptoExternalRecords,
  _setCryptoService,
  _getCryptoService,
  parsePagination,
  listJobs,
  getJobItems,
} from '../src/controllers/reconciliation.js';
import Agent from '../src/models/Agent.js';
import { getAllAgents } from '../src/controllers/agent.js';

const ORIGINAL_CRYPTO_SERVICE = _getCryptoService();

// TronGrid'i taklit eden sahte servis — her test kendi addressTxs/throwFor
// durumunu kurup sıfırlıyor.
const cryptoMock = {
  addressTxs: new Map(), // address -> [{ transaction_id, value, block_timestamp }]
  throwFor: new Set(),   // ağ hatası simüle edilecek adresler
  deriveDepositAddress(index) {
    return `T_ADDR_${index}`;
  },
  async fetchIncomingUSDT(address, sinceMs = 0) {
    if (cryptoMock.throwFor.has(address)) {
      throw new Error('TronGrid ağ hatası (simüle)');
    }
    const txs = cryptoMock.addressTxs.get(address) || [];
    return txs.filter(tx => (tx.block_timestamp || 0) >= sinceMs);
  },
};

function resetCryptoMock() {
  cryptoMock.addressTxs.clear();
  cryptoMock.throwFor.clear();
}

describe('Reconciliation — cryptoDeposit (TronGrid)', () => {
  before(async () => {
    // Kasıtlı olarak MONGODB_URI'yi yok sayıyoruz: crypto.test.js'teki aynı
    // güvenlik gerekçesiyle, gerçek geliştirme veritabanını (betzone) işaret
    // etmesin diye ayrı, sabit bir test DB'sine bağlanıyoruz.
    await mongoose.connect('mongodb://localhost:27017/betzone_test_reconciliation');
  });

  after(async () => {
    _setCryptoService(ORIGINAL_CRYPTO_SERVICE);
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await CryptoDeposit.deleteMany({});
    await ReconciliationJob.deleteMany({});
    await ReconciliationItem.deleteMany({});
    resetCryptoMock();
    _setCryptoService(cryptoMock);
  });

  describe('fetchCryptoExternalRecords', () => {
    it('TronGrid işlemlerini dış kayıt formatına normalize eder (amount USDT birimine çevrilir)', async () => {
      const u1 = await User.create({ username: 'cdu1', email: 'cdu1@test.com', password: 'x', cryptoDepositIndex: 1 });
      cryptoMock.addressTxs.set('T_ADDR_1', [
        { transaction_id: 'tx-in-range', value: '25000000', block_timestamp: new Date('2026-01-15').getTime() },
      ]);

      const job = {
        _id: 'fake-job-id',
        dateRange: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
      };
      const records = await fetchCryptoExternalRecords(job);

      assert.equal(records.length, 1);
      assert.equal(records[0].id, 'tx-in-range');
      assert.equal(records[0].amount, 25);
      assert.equal(records[0].currency, 'USDT');
      assert.equal(records[0].status, 'credited');
      void u1;
    });

    it('dateRange.end tarihinden sonraki işlemleri eler (min_timestamp TronGrid tarafında, max_timestamp burada uygulanıyor)', async () => {
      await User.create({ username: 'cdu2', email: 'cdu2@test.com', password: 'x', cryptoDepositIndex: 1 });
      cryptoMock.addressTxs.set('T_ADDR_1', [
        { transaction_id: 'tx-in-range', value: '10000000', block_timestamp: new Date('2026-01-15').getTime() },
        { transaction_id: 'tx-after-end', value: '10000000', block_timestamp: new Date('2026-02-05').getTime() },
      ]);

      const job = {
        _id: 'fake-job-id',
        dateRange: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
      };
      const records = await fetchCryptoExternalRecords(job);

      assert.equal(records.length, 1);
      assert.equal(records[0].id, 'tx-in-range');
    });

    it('bir adres için TronGrid sorgusu başarısız olursa o adresi atlar, diğer adreslerin sonucunu döndürür (job\'ı düşürmez)', async () => {
      await User.create({ username: 'cdu3', email: 'cdu3@test.com', password: 'x', cryptoDepositIndex: 1 });
      await User.create({ username: 'cdu4', email: 'cdu4@test.com', password: 'x', cryptoDepositIndex: 2 });
      cryptoMock.throwFor.add('T_ADDR_1');
      cryptoMock.addressTxs.set('T_ADDR_2', [
        { transaction_id: 'tx-ok', value: '5000000', block_timestamp: new Date('2026-01-15').getTime() },
      ]);

      const job = {
        _id: 'fake-job-id',
        dateRange: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
      };
      const records = await fetchCryptoExternalRecords(job);

      assert.equal(records.length, 1);
      assert.equal(records[0].id, 'tx-ok');
    });

    it('kripto yatırma adresi olan kullanıcı sayısı sınırı (300) aşılırsa sessizce kırpmak yerine açıkça hata verir', async () => {
      const docs = [];
      for (let i = 0; i < 301; i++) {
        docs.push({ username: `capuser${i}`, email: `capuser${i}@test.com`, password: 'x', cryptoDepositIndex: i + 1000 });
      }
      await User.insertMany(docs);

      await assert.rejects(
        () => fetchCryptoExternalRecords({ _id: 'fake-job-id', dateRange: {} }),
        /TronGrid tarama sınırını/
      );
    });
  });

  describe('reconciliationService.startReconciliationJob — cryptoDeposit uçtan uca', () => {
    it('eşleşen, tutar uyuşmazlığı ve tahsil edilmemiş (iç kayıtta eksik) yatırmaları doğru sınıflandırır', async () => {
      const matchedUser = await User.create({ username: 'matched', email: 'matched@test.com', password: 'x', cryptoDepositIndex: 1 });
      const mismatchUser = await User.create({ username: 'mismatch', email: 'mismatch@test.com', password: 'x', cryptoDepositIndex: 2 });
      await User.create({ username: 'uncredited', email: 'uncredited@test.com', password: 'x', cryptoDepositIndex: 3 });

      const inRange = new Date('2026-01-15T00:00:00Z');

      // 1) Eşleşen: internal CryptoDeposit (credited) + aynı tutarda on-chain tx
      await CryptoDeposit.create({
        userId: matchedUser._id,
        txHash: 'tx-matched',
        toAddress: 'T_ADDR_1',
        usdtAmount: 30,
        creditedTRY: 30,
        status: 'credited',
        creditedAt: inRange,
        createdAt: inRange,
      });
      // 2) Tutar uyuşmazlığı: internal 20 USDT, zincirde 22 USDT görünüyor
      await CryptoDeposit.create({
        userId: mismatchUser._id,
        txHash: 'tx-mismatch',
        toAddress: 'T_ADDR_2',
        usdtAmount: 20,
        creditedTRY: 20,
        status: 'credited',
        creditedAt: inRange,
        createdAt: inRange,
      });
      // 3) Tahsil edilmemiş yatırma: zincirde var ama hiçbir zaman check-deposit
      //    tetiklenmediği için CryptoDeposit hiç oluşturulmamış — gerçek dünyada
      //    tam da mutabakatın yakalaması gereken durum: para geldi, kimse claim etmedi.
      cryptoMock.addressTxs.set('T_ADDR_1', [{ transaction_id: 'tx-matched', value: '30000000', block_timestamp: inRange.getTime() }]);
      cryptoMock.addressTxs.set('T_ADDR_2', [{ transaction_id: 'tx-mismatch', value: '22000000', block_timestamp: inRange.getTime() }]);
      cryptoMock.addressTxs.set('T_ADDR_3', [{ transaction_id: 'tx-uncredited', value: '15000000', block_timestamp: inRange.getTime() }]);

      const job = await reconciliationService.createReconciliationJob({
        name: 'Test crypto reconciliation',
        type: 'cryptoDeposit',
        startedBy: matchedUser._id,
        dateRange: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
      });

      const fetchExternal = (j) => (j.type === 'cryptoDeposit' ? fetchCryptoExternalRecords(j) : []);
      const completed = await reconciliationService.startReconciliationJob(job._id, fetchExternal);

      assert.equal(completed.status, 'completed');
      assert.equal(completed.summary.matched, 1);
      assert.equal(completed.summary.amountMismatch, 1);
      assert.equal(completed.summary.missingInternally, 1);

      const { items } = await reconciliationService.getReconciliationItems(job._id, { limit: 50 });
      const uncreditedItem = items.find(it => it.externalRecordId === 'tx-uncredited');
      assert.ok(uncreditedItem, 'Tahsil edilmemiş on-chain yatırma bir item olarak kaydedilmeli');
      assert.equal(uncreditedItem.status, 'missing_internally');
    });

    it('admin onayı bekleyen ($100+) bir yatırma zincirde onaylı görünüyorsa status_mismatch olarak işaretlenir', async () => {
      const pendingUser = await User.create({ username: 'pendingapproval', email: 'pendingapproval@test.com', password: 'x', cryptoDepositIndex: 1 });
      const inRange = new Date('2026-01-15T00:00:00Z');

      await CryptoDeposit.create({
        userId: pendingUser._id,
        txHash: 'tx-pending',
        toAddress: 'T_ADDR_1',
        usdtAmount: 150,
        creditedTRY: 150,
        status: 'pending_approval',
        creditedAt: null,
        createdAt: inRange,
      });
      cryptoMock.addressTxs.set('T_ADDR_1', [{ transaction_id: 'tx-pending', value: '150000000', block_timestamp: inRange.getTime() }]);

      const job = await reconciliationService.createReconciliationJob({
        name: 'Test pending crypto reconciliation',
        type: 'cryptoDeposit',
        startedBy: pendingUser._id,
        dateRange: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
      });

      const fetchExternal = (j) => (j.type === 'cryptoDeposit' ? fetchCryptoExternalRecords(j) : []);
      const completed = await reconciliationService.startReconciliationJob(job._id, fetchExternal);

      assert.equal(completed.summary.statusMismatch, 1);
      assert.equal(completed.summary.matched, 0);
    });
  });

  // 2026-09-17 Batch 2, Task 3.2 Step 5 — admin liste uçlarında limit üst sınırı.
  describe('sayfalama limit üst sınırı (agent + reconciliation)', () => {
    async function callList(handler, query, params = {}) {
      let body;
      const res = { json(b) { body = b; }, status() { return this; } };
      await handler({ query, params }, res, (e) => { throw e; });
      return body;
    }

    it('parsePagination: limit 1-100 aralığına sıkıştırılır, geçersiz değerler varsayılana düşer', () => {
      assert.deepEqual(parsePagination({ limit: '1000000' }), { page: 1, limit: 100 });
      assert.deepEqual(parsePagination({ limit: '-5', page: '0' }), { page: 1, limit: 1 });
      assert.deepEqual(parsePagination({ limit: 'abc', page: 'x' }), { page: 1, limit: 20 });
      assert.deepEqual(parsePagination({ limit: '50', page: '3' }), { page: 3, limit: 50 });
      assert.deepEqual(parsePagination(), { page: 1, limit: 20 });
    });

    it('GET /reconciliation/jobs/:id/items ?limit=1000000 en fazla 100 kayıt döner', async () => {
      const jobId = new mongoose.Types.ObjectId();
      await ReconciliationItem.insertMany(Array.from({ length: 101 }, () => ({ jobId, recordType: 'transaction' })));
      const body = await callList(getJobItems, { limit: '1000000' }, { id: String(jobId) });
      assert.equal(body.items.length, 100);
      assert.equal(body.total, 101);
      assert.equal(body.pages, 2);
    });

    it('GET /reconciliation/jobs ?limit=1000000 en fazla 100 iş döner', async () => {
      const startedBy = new mongoose.Types.ObjectId();
      await ReconciliationJob.insertMany(Array.from({ length: 101 }, (_, i) => ({ name: `job-${i}`, type: 'transaction', startedBy })));
      const body = await callList(listJobs, { limit: '1000000' });
      const rows = body.jobs || body.items;
      assert.equal(rows.length, 100);
      assert.equal(body.total, 101);
    });

    it('GET /agents ?limit=1000000 en fazla 100 agent döner', async () => {
      await Agent.deleteMany({});
      const users = await User.insertMany(Array.from({ length: 101 }, (_, i) => ({ username: `pg_agent_${i}`, email: `pg_agent_${i}@test.com`, password: 'x' })));
      await Agent.insertMany(users.map(u => ({ userId: u._id })));
      const body = await callList(getAllAgents, { limit: '1000000' });
      assert.equal(body.agents.length, 100);
      assert.equal(body.total, 101);
      assert.equal(body.pages, 2);
      await Agent.deleteMany({});
    });
  });
});
