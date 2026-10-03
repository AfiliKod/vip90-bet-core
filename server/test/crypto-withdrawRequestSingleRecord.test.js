import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

// Admin onayına düşen kripto çekim talebi TEK Transaction üretmeli ve
// adres/USDT tutarı metadata'da saklanmalı (eskiden ham Transaction.create +
// createTransaction çift kayıt yazıyordu; adres alanları strict şemada düşüyordu).
describe('POST /crypto/withdraw-request — tek kayıt + metadata', () => {
  const origFetch = global.fetch;
  let Transaction, User, handler;

  before(async () => {
    // Herkesçe bilinen test anımsatıcısı (hardhat/foundry varsayılanı) — gerçek fon yok.
    process.env.CRYPTO_SEED_PHRASE = 'test test test test test test test test test test test junk';
    // TronGrid hot wallet sorgusu: yeterli USDT varmış gibi.
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ data: [{ trc20: [{ TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: '1000000000' }, { 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf': '1000000000' }], balance: 0 }] }),
    });
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_cryptowdreq');
    Transaction = (await import('../src/models/Transaction.js')).default;
    User = (await import('../src/models/User.js')).default;
    await Promise.all([Transaction.deleteMany({}), User.deleteMany({})]);
    // Transaction içinde koleksiyon/indeks oluşturulamaz — önceden hazırla.
    await Promise.all([User.init(), Transaction.init()]);
    await Promise.all([User.createCollection().catch(() => {}), Transaction.createCollection().catch(() => {})]);
    const router = (await import('../src/routes/crypto.js')).default;
    const layer = router.stack.find(l => l.route?.path === '/withdraw-request');
    const stack = layer.route.stack;
    handler = stack[stack.length - 1].handle;
  });

  after(async () => {
    global.fetch = origFetch;
    await Promise.all([Transaction.deleteMany({}), User.deleteMany({})]);
    await mongoose.disconnect();
  });

  it('bekleyen çekim: tek crypto_withdraw kaydı, metadata dolu', async () => {
    const { CRYPTO_SETTINGS } = await import('../src/config/crypto.js');
    const usdtAmount = Math.max(50, (CRYPTO_SETTINGS.withdraw?.autoProcessLimit || 15) + 10);
    const rate = CRYPTO_SETTINGS.usdtTryRate || 1;
    const u = await User.create({ username: 'wdreq', email: 'wdreq@test.local', password: 'Password1', balance: usdtAmount * rate + 100 });
    const address = 'TXYZabcdefghijkmnopqrstuvwxyz12345';
    let body; let code = 200; let err;
    const res = { status(c) { code = c; return this; }, json(b) { body = b; return this; } };
    await handler({ user: { id: String(u._id) }, validated: { address, usdtAmount, confirmForfeit: false } }, res, e => { err = e; });
    assert.equal(err, undefined, err?.message);
    assert.equal(code, 200, JSON.stringify(body));
    assert.equal(body.autoProcessed, false);
    const rows = await Transaction.find({ userId: u._id, type: 'crypto_withdraw' }).lean();
    assert.equal(rows.length, 1, 'tek kayıt olmalı');
    assert.equal(rows[0].status, 'pending');
    assert.equal(rows[0].metadata.toAddress, address);
    assert.equal(rows[0].metadata.usdtAmount, usdtAmount);
    assert.ok(rows[0].idempotencyKey);
  });
});
