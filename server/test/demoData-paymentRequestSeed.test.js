// server/test/demoData-paymentRequestSeed.test.js
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import BankDepositRequest from '../src/models/BankDepositRequest.js';
import CryptoDeposit from '../src/models/CryptoDeposit.js';
import Transaction from '../src/models/Transaction.js';
import SlikairPayment from '../src/models/SlikairPayment.js';
import ActivityEvent from '../src/models/ActivityEvent.js';
import { _setIOGetter, _getIOGetter } from '../src/services/activityFeed.js';
import { getCryptoTxDetail } from '../src/controllers/admin.js';
import * as paymentRequestSeed from '../src/services/demoData/paymentRequestSeed.js';

const ORIGINAL_IO_GETTER = _getIOGetter();

describe('demoData/paymentRequestSeed', () => {
  before(async () => {
    _setIOGetter(() => null);
    await mongoose.connect('mongodb://localhost:27017/betzone_test_demo_data_payments');
  });
  after(async () => {
    _setIOGetter(ORIGINAL_IO_GETTER);
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    _setIOGetter(() => null);
    await User.deleteMany({});
    await BankDepositRequest.deleteMany({});
    await CryptoDeposit.deleteMany({});
    await SlikairPayment.deleteMany({});
    await Transaction.deleteMany({});
    await ActivityEvent.deleteMany({});
  });

  it('load(N) toplam N kayıt üretir (Bank+Crypto+Slikair arasında dağıtılmış)', async () => {
    const result = await paymentRequestSeed.load(30);
    assert.equal(result.created, 30);
    const [bank, crypto_, slikair, cryptoWithdraw] = await Promise.all([
      BankDepositRequest.countDocuments({ isSeed: true }),
      CryptoDeposit.countDocuments({ isSeed: true }),
      SlikairPayment.countDocuments({ isSeed: true }),
      Transaction.countDocuments({ isSeed: true, type: 'crypto_withdraw' }),
    ]);
    assert.equal(bank + crypto_ + slikair + cryptoWithdraw, 30);
  });

  it('hiçbir gerçek dış API çağrısı yapmaz — insertMany backfill ActivityEvent üretmez', async () => {
    await paymentRequestSeed.load(15);
    assert.equal(await ActivityEvent.countDocuments({}), 0);
  });

  it('clear() tüm modellerde seed kayıtları siler', async () => {
    await paymentRequestSeed.load(9);
    const result = await paymentRequestSeed.clear();
    assert.equal(result.deleted, 9);
  });

  it('liveTick() 1 pending BankDepositRequest oluşturur, ActivityEvent üretmez (kapsam dışı)', async () => {
    await paymentRequestSeed.load(1);
    const result = await paymentRequestSeed.liveTick();
    assert.ok(result);
    assert.equal(await ActivityEvent.countDocuments({}), 0);
  });
});

describe('demoData/paymentRequestSeed — Wallet → Crypto Transaction eşleşmesi', () => {
  before(async () => {
    _setIOGetter(() => null);
    await mongoose.connect('mongodb://localhost:27017/betzone_test_demo_data_payments');
  });
  after(async () => {
    _setIOGetter(ORIGINAL_IO_GETTER);
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    _setIOGetter(() => null);
    await Promise.all([User, BankDepositRequest, CryptoDeposit, SlikairPayment, ActivityEvent, Transaction].map(m => m.deleteMany({})));
  });

  const STATUS_MAP = { pending_approval: 'pending', credited: 'completed', confirmed: 'completed', rejected: 'rejected' };

  it('her seed CryptoDeposit için eşleşen crypto_deposit Transaction üretir (durum eşlemeli)', async () => {
    await paymentRequestSeed.load(120);
    const deposits = await CryptoDeposit.find({ isSeed: true });
    assert.ok(deposits.length > 0);
    for (const dep of deposits) {
      const txs = await Transaction.find({ cryptoDepositId: dep._id });
      assert.equal(txs.length, 1, 'tam bir eşleşen Transaction');
      const tx = txs[0];
      assert.equal(tx.type, 'crypto_deposit');
      assert.equal(tx.isSeed, true);
      assert.equal(String(tx.userId), String(dep.userId));
      assert.equal(tx.amount, dep.creditedTRY);
      assert.equal(tx.status, STATUS_MAP[dep.status]);
      assert.ok(tx.note.length > 0);
      assert.equal(tx.createdAt.getTime(), dep.createdAt.getTime());
    }
  });

  it('crypto_withdraw Transaction üretir: negatif tutar, parse edilemeyen adres, karışık durum', async () => {
    await paymentRequestSeed.load(200);
    const withdraws = await Transaction.find({ isSeed: true, type: 'crypto_withdraw' });
    assert.ok(withdraws.length >= 5);
    assert.ok(new Set(withdraws.map(w => w.status)).size >= 2, 'karışık durum');
    for (const w of withdraws) {
      assert.ok(w.amount < 0);
      assert.ok(['pending', 'completed', 'rejected'].includes(w.status));
      assert.match(w.note, /[\d.]+ USDT → seed_wallet_/);
      // Seed onaylansa bile gerçek transfer tetiklenmesin: admin regex'i eşleşmemeli.
      assert.equal(/→ ([T][A-Za-z0-9]{33})/.test(w.note), false);
      assert.ok(w.metadata.toAddress);
    }
  });

  it('Wallet → Crypto listeleme sorgusu (type+status) seed kayıtlarını döndürür', async () => {
    await paymentRequestSeed.load(100);
    const deposits = await Transaction.find({ type: 'crypto_deposit' });
    assert.equal(deposits.length, await CryptoDeposit.countDocuments({ isSeed: true }));
    const pending = await Transaction.countDocuments({ type: 'crypto_deposit', status: 'pending' });
    assert.equal(pending, await CryptoDeposit.countDocuments({ isSeed: true, status: 'pending_approval' }));
  });

  it('created/count/deleted birincil kayıtları sayar; clear() Transaction seed kayıtlarını da siler', async () => {
    const { created } = await paymentRequestSeed.load(60);
    assert.equal(created, 60);
    assert.equal((await paymentRequestSeed.status()).count, 60);
    const result = await paymentRequestSeed.clear();
    assert.equal(result.deleted, 60);
    assert.equal(await Transaction.countDocuments({ isSeed: true, type: { $in: ['crypto_deposit', 'crypto_withdraw'] } }), 0);
  });

  it('clear() seed olmayan crypto Transaction kayıtlarına dokunmaz', async () => {
    const user = await User.create({ username: 'realcrypto', email: 'rc@t.com', password: 'x' });
    await Transaction.create({ userId: user._id, type: 'crypto_deposit', amount: 50, balanceBefore: 0, balanceAfter: 50 });
    await paymentRequestSeed.load(30);
    await paymentRequestSeed.clear();
    assert.equal(await Transaction.countDocuments({ type: 'crypto_deposit' }), 1);
  });

  it('satır açılımı ucu (tx-detail) seed pending yatırma ve çekim için kullanıcı özeti döndürür', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('ağ çağrısı yasak'); };
    try {
      await paymentRequestSeed.load(200);
      const call = async (tx) => {
        const out = {};
        await getCryptoTxDetail({ params: { id: String(tx._id) } }, { status() { return this; }, json(b) { out.body = b; } }, (e) => { throw e; });
        return out.body;
      };
      const dep = await Transaction.findOne({ isSeed: true, type: 'crypto_deposit', status: 'pending' });
      const wd = await Transaction.findOne({ isSeed: true, type: 'crypto_withdraw', status: 'pending' });
      assert.ok(dep && wd);
      const d1 = await call(dep);
      assert.equal(d1.transaction.type, 'crypto_deposit');
      assert.ok(d1.cryptoDeposit?.txHash?.startsWith('seed_'));
      assert.equal(typeof d1.user.withdrawable, 'number');
      const d2 = await call(wd);
      assert.equal(d2.transaction.type, 'crypto_withdraw');
      assert.equal(typeof d2.user.balance, 'number');
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
