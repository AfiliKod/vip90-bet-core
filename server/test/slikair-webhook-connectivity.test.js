/**
 * Slikair Webhook Connectivity & Processing Tests
 *
 * Hem endpoint'lerin çalıştığını hem de geçerli webhook'ların
 * gerçekten işlendiğini (200 dönüp durumu güncellediğini) doğrular.
 *
 * Slikair'in webhook'ları imzasız olduğu için (bkz. slikairController.js
 * "GÜVENLİK" yorumu) handler artık krediye geçmeden önce Slikair'in KENDİ
 * get-status API'sine çapraz doğrulama yapıyor — bu dosyadaki testler gerçek
 * sandbox'a ağ isteği ATMAMASI için _setSlikairService() ile bu çağrıyı
 * taklit ediyor (igamesSession.js'teki _setIgamesService deseniyle tutarlı).
 *
 * Çalıştırmak için: node --test test/slikair-webhook-connectivity.test.js
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

let app;
try {
  const mod = await import('../src/app.js');
  app = mod.default || mod.app;
} catch (e) {
  console.error('  ⚠ app.js import edilemedi:', e.message);
}

// Modelleri import et (DB ile etkileşim için)
let SlikairPayment, User, _setSlikairService;
try {
  const paymentMod = await import('../src/models/SlikairPayment.js');
  SlikairPayment = paymentMod.default;
  const userMod = await import('../src/models/User.js');
  User = userMod.default;
  const controllerMod = await import('../src/controllers/slikairController.js');
  _setSlikairService = controllerMod._setSlikairService;
} catch (e) {
  console.error('  ⚠ Modeller import edilemedi:', e.message);
}

// get-status çapraz doğrulamasını taklit eden sahte servis — her test kendi
// beklediği yanıtı `slikairMock.nextGetPaymentStatus`/`nextGetPayoutStatus`'a
// atayıp sıfırlar.
const slikairMock = {
  nextGetPaymentStatus: null,
  nextGetPayoutStatus: null,
  async getPaymentStatus() {
    if (!slikairMock.nextGetPaymentStatus) throw new Error('getPaymentStatus bu test için mock\'lanmadı');
    return slikairMock.nextGetPaymentStatus;
  },
  async getPayoutStatus() {
    if (!slikairMock.nextGetPayoutStatus) throw new Error('getPayoutStatus bu test için mock\'lanmadı');
    return slikairMock.nextGetPayoutStatus;
  },
};
if (_setSlikairService) _setSlikairService(slikairMock);

after(() => {
  if (mongoose.connection.readyState !== 0) {
    mongoose.connection.close(false).catch(() => {});
  }
});

async function testEndpoint(method, path, body) {
  const server = app.listen(0);
  const addr = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  } finally {
    server.close();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. ENDPOINT BULUNABİLİRLİĞİ
// ═══════════════════════════════════════════════════════════════════════════

describe('Slikair Webhook — Endpoint Discovery', () => {
  it('POST /api/slikair/webhook/payin → 400 (missing payin_id, NOT 404)', async () => {
    if (!app) return;
    const { status, data } = await testEndpoint('POST', '/api/slikair/webhook/payin', {});
    console.log(`    → status=${status}`);
    assert.equal(status, 400, `Expected 400, got ${status}. Endpoint missing?`);
    assert.ok(data?.error?.includes('payin_id'));
  });

  it('POST /api/slikair/webhook/payout → 400 (missing payoutId, NOT 404)', async () => {
    if (!app) return;
    const { status, data } = await testEndpoint('POST', '/api/slikair/webhook/payout', {});
    console.log(`    → status=${status}`);
    assert.equal(status, 400);
    assert.ok(data?.error?.includes('payoutId'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. IDEMPOTENCY — BİLİNMEYEN KAYITLAR
// ═══════════════════════════════════════════════════════════════════════════

describe('Slikair Webhook — Idempotency (Unknown Records)', () => {
  it('Bilinmeyen payin_id → 200 (retry döngüsüne girmemesi için)', async () => {
    if (!app) return;
    const { status, data } = await testEndpoint('POST', '/api/slikair/webhook/payin', {
      payin_id: 'non-existent-payin-id',
      status: 'captured',
      status_code: 310,
    });
    console.log(`    → status=${status}`);
    assert.equal(status, 200, 'Unknown payin_id should return 200 (not 404/500)');
  });

  it('Bilinmeyen payoutId → 200', async () => {
    if (!app) return;
    const { status } = await testEndpoint('POST', '/api/slikair/webhook/payout', {
      payoutId: 'non-existent-payout-id',
      status: 'succeeded',
      statusCode: 310,
    });
    console.log(`    → status=${status}`);
    assert.equal(status, 200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. GERÇEK İŞ AKIŞI — WEBHOOK DURUM GÜNCELLEMESİ
// ═══════════════════════════════════════════════════════════════════════════

describe('Slikair Webhook — Real Processing Flow', () => {
  it('Geçerli payin webhook\'u → 200 + durum güncellenir', async () => {
    if (!app || !SlikairPayment || !User) return;

    // Test kullanıcısı oluştur
    const testUser = await User.create({
      username: `webhook-test-${Date.now()}`,
      email: `webhook-test-${Date.now()}@test.com`,
      password: 'hashedpassword123',
      balance: 100,
    });

    // Test payment kaydı oluştur (sandbox'tan dönen response gibi)
    const testPayinId = `test-payin-${Date.now()}`;
    const payment = await SlikairPayment.create({
      userId: testUser._id,
      requestId: `req-${Date.now()}`,
      payinId: testPayinId,
      amount: 50.00,
      currency: 'EUR',
      paymentMethod: 'credit_card',
      email: 'test@test.com',
      country: 'NLD',
      status: 'pending',
    });

    const balanceBefore = testUser.balance;

    // get-status çapraz doğrulaması bu webhook'u onaylayacak şekilde mock'lanıyor
    slikairMock.nextGetPaymentStatus = { status: 'succeeded', amount: 50.00, currency: 'EUR' };

    // Webhook gönder — status_code: 310 = Captured (başarılı)
    const { status, data } = await testEndpoint('POST', '/api/slikair/webhook/payin', {
      payin_id: testPayinId,
      status: 'captured',
      status_code: 310,
      amount: 50.00,
      currency: 'EUR',
    });

    console.log(`    → webhook status=${status}`);

    // Webhook 200 dönmeli
    assert.equal(status, 200, `Webhook should return 200, got ${status}`);

    // Payment durumu güncellenmeli
    await payment.reload();
    console.log(`    → payment.status=${payment.status}, creditedAt=${payment.creditedAt}`);
    assert.equal(payment.status, 'succeeded', 'Payment status should be succeeded');
    assert.ok(payment.creditedAt, 'creditedAt should be set');

    // Kullanıcı bakiyesi güncellenmeli
    await testUser.reload();
    console.log(`    → balanceBefore=${balanceBefore}, balanceAfter=${testUser.balance}`);
    assert.ok(testUser.balance > balanceBefore, 'User balance should increase');
    assert.equal(testUser.balance, balanceBefore + 50.00, 'Balance should increase by payment amount');

    // Temizle
    slikairMock.nextGetPaymentStatus = null;
    await SlikairPayment.deleteOne({ _id: payment._id });
    await User.deleteOne({ _id: testUser._id });
  });

  it('Aynı webhook tekrar gelirse → 200 + tekrar kredi YAPILMAZ (idempotent)', async () => {
    if (!app || !SlikairPayment || !User) return;

    const testUser = await User.create({
      username: `webhook-idem-${Date.now()}`,
      email: `webhook-idem-${Date.now()}@test.com`,
      password: 'hashedpassword123',
      balance: 200,
    });

    const testPayinId = `test-payin-idem-${Date.now()}`;
    const payment = await SlikairPayment.create({
      userId: testUser._id,
      requestId: `req-idem-${Date.now()}`,
      payinId: testPayinId,
      amount: 100.00,
      currency: 'EUR',
      paymentMethod: 'credit_card',
      email: 'test@test.com',
      country: 'NLD',
      status: 'succeeded', // Zaten succeeded
      creditedAt: new Date(),
    });

    const balanceBefore = testUser.balance;

    // Aynı webhook tekrar
    const { status } = await testEndpoint('POST', '/api/slikair/webhook/payin', {
      payin_id: testPayinId,
      status: 'captured',
      status_code: 310,
    });

    assert.equal(status, 200);

    // Bakiye değişmemeli
    await testUser.reload();
    assert.equal(testUser.balance, balanceBefore, 'Balance should NOT change on duplicate webhook');

    await SlikairPayment.deleteOne({ _id: payment._id });
    await User.deleteOne({ _id: testUser._id });
  });

  it('Reddedilen kart webhook\'u → 200 + durum failed olarak güncellenir', async () => {
    if (!app || !SlikairPayment || !User) return;

    const testUser = await User.create({
      username: `webhook-fail-${Date.now()}`,
      email: `webhook-fail-${Date.now()}@test.com`,
      password: 'hashedpassword123',
      balance: 50,
    });

    const testPayinId = `test-payin-fail-${Date.now()}`;
    const payment = await SlikairPayment.create({
      userId: testUser._id,
      requestId: `req-fail-${Date.now()}`,
      payinId: testPayinId,
      amount: 75.00,
      currency: 'EUR',
      paymentMethod: 'credit_card',
      email: 'test@test.com',
      country: 'NLD',
      status: 'pending',
    });

    // Reddedilen kart webhook'u — status_code: 301 = Declined
    const { status } = await testEndpoint('POST', '/api/slikair/webhook/payin', {
      payin_id: testPayinId,
      status: 'declined',
      status_code: 301,
      reason_code: 'insufficient_funds',
    });

    assert.equal(status, 200);

    await payment.reload();
    console.log(`    → payment.status=${payment.status}`);
    assert.equal(payment.status, 'failed', 'Payment should be failed');
    assert.equal(payment.statusCode, 301);

    // Bakiye değişmemeli
    await testUser.reload();
    assert.equal(testUser.balance, 50, 'Balance should NOT change for failed payment');

    await SlikairPayment.deleteOne({ _id: payment._id });
    await User.deleteOne({ _id: testUser._id });
  });

  it('SAHTE webhook (get-status doğrulamayan "succeeded") → 200 ama KREDİ VERİLMEZ', async () => {
    if (!app || !SlikairPayment || !User) return;

    const testUser = await User.create({
      username: `webhook-forge-${Date.now()}`,
      email: `webhook-forge-${Date.now()}@test.com`,
      password: 'hashedpassword123',
      balance: 10,
    });

    const testPayinId = `test-payin-forge-${Date.now()}`;
    const payment = await SlikairPayment.create({
      userId: testUser._id,
      requestId: `req-forge-${Date.now()}`,
      payinId: testPayinId,
      amount: 500.00, // saldırgan büyük bir tutar iddia ediyor
      currency: 'EUR',
      paymentMethod: 'credit_card',
      email: 'test@test.com',
      country: 'NLD',
      status: 'pending',
    });

    const balanceBefore = testUser.balance;

    // Slikair'in gerçek get-status'u bu ödemeyi HİÇ "succeeded" olarak
    // görmüyor (ör. gerçekte hiç yapılmamış/reddedilmiş bir ödeme) — saldırgan
    // yine de webhook body'sinde "succeeded" iddia ediyor.
    slikairMock.nextGetPaymentStatus = { status: 'processing', amount: 500.00, currency: 'EUR' };

    const { status } = await testEndpoint('POST', '/api/slikair/webhook/payin', {
      payin_id: testPayinId,
      status: 'captured',
      status_code: 310, // saldırgan "başarılı" statü kodu gönderiyor
      amount: 500.00,
      currency: 'EUR',
    });

    // Slikair tekrar denemesin diye 200 dönmeli, ama kredi VERİLMEMELİ
    assert.equal(status, 200);

    await payment.reload();
    console.log(`    → payment.status=${payment.status} (succeeded OLMAMALI)`);
    assert.notEqual(payment.status, 'succeeded', 'Doğrulanmamış webhook kredi vermemeli — payment succeeded olarak işaretlenmemeli');

    await testUser.reload();
    console.log(`    → balanceBefore=${balanceBefore}, balanceAfter=${testUser.balance}`);
    assert.equal(testUser.balance, balanceBefore, 'Doğrulanmamış webhook sonrası bakiye DEĞİŞMEMELİ');

    slikairMock.nextGetPaymentStatus = null;
    await SlikairPayment.deleteOne({ _id: payment._id });
    await User.deleteOne({ _id: testUser._id });
  });
});
