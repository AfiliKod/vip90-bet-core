import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Transaction from '../src/models/Transaction.js';
import CryptoDeposit from '../src/models/CryptoDeposit.js';
import cryptoRouter from '../src/routes/crypto.js';
import { deriveDepositAddress } from '../src/services/cryptoService.js';

const TEST_MNEMONIC = 'test test test test test test test test test test test junk';

function checkDepositHandler() {
  const layer = cryptoRouter.stack.find(l => l.route?.path === '/check-deposit' && l.route.methods.post);
  assert.ok(layer, 'POST /check-deposit rotası bulunamadı');
  return layer.route.stack.at(-1).handle; // risk middleware'i sonrası asıl handler
}

async function callCheckDeposit(userId) {
  const out = { status: 200, body: null };
  const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } };
  let err = null;
  await checkDepositHandler()({ user: { id: String(userId) } }, res, (e) => { err = e; });
  if (err) throw err;
  return out;
}

describe('POST /api/crypto/check-deposit — admin onayına düşen yatırma', () => {
  const realFetch = globalThis.fetch;
  const savedSeed = process.env.CRYPTO_SEED_PHRASE;
  before(async () => {
    await mongoose.connect('mongodb://localhost:27017/betzone_test_crypto_check_deposit');
    // Çok-belgeli transaction içinde koleksiyon oluşturulamaz; önceden oluştur.
    for (const m of [User, Transaction, CryptoDeposit]) { await m.createCollection(); await m.syncIndexes(); }
  });
  after(async () => {
    globalThis.fetch = realFetch;
    if (savedSeed === undefined) delete process.env.CRYPTO_SEED_PHRASE; else process.env.CRYPTO_SEED_PHRASE = savedSeed;
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    await Promise.all([User, Transaction, CryptoDeposit].map(m => m.deleteMany({})));
    process.env.CRYPTO_SEED_PHRASE = TEST_MNEMONIC;
  });

  function mockIncoming(address, usdt, txId) {
    globalThis.fetch = async (url) => {
      assert.match(String(url), /\/v1\/accounts\/.+\/transactions\/trc20/);
      return { ok: true, json: async () => ({ data: [{ transaction_id: txId, to: address, from: 'TFromAddressForTest0000000000000000', value: String(usdt * 1_000_000), type: 'Transfer' }] }) };
    };
  }

  it('limit üstü yatırma tek bir bekleyen crypto_deposit Transaction üretir (çift kayıt yok)', async () => {
    const user = await User.create({ username: 'cdposit1', email: 'cd1@t.com', password: 'x', cryptoDepositIndex: 7, balance: 10 });
    const address = deriveDepositAddress(7);
    mockIncoming(address, 500, 'a'.repeat(64));
    const out = await callCheckDeposit(user._id);
    assert.equal(out.body.pendingApproval.length, 1);
    assert.equal(out.body.credited.length, 0);

    const dep = await CryptoDeposit.findOne({ userId: user._id });
    assert.equal(dep.status, 'pending_approval');
    const txs = await Transaction.find({ userId: user._id, type: 'crypto_deposit' });
    assert.equal(txs.length, 1, 'tam bir Transaction olmalı');
    assert.equal(txs[0].status, 'pending');
    assert.equal(String(txs[0].cryptoDepositId), String(dep._id));
    assert.equal(txs[0].idempotencyKey, `crypto_deposit_pending_${'a'.repeat(64)}`);
    assert.equal((await User.findById(user._id)).balance, 10, 'bakiye değişmemeli');
  });

  it('aynı işlem tekrar kontrol edilince yeni kayıt üretmez', async () => {
    const user = await User.create({ username: 'cdposit2', email: 'cd2@t.com', password: 'x', cryptoDepositIndex: 8 });
    mockIncoming(deriveDepositAddress(8), 500, 'b'.repeat(64));
    await callCheckDeposit(user._id);
    await callCheckDeposit(user._id);
    assert.equal(await Transaction.countDocuments({ userId: user._id, type: 'crypto_deposit' }), 1);
    assert.equal(await CryptoDeposit.countDocuments({ userId: user._id }), 1);
  });
});
