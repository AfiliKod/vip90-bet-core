/**
 * Slikair Sandbox Integration Tests
 *
 * Gerçek Slikair sandbox API'sine istek atar.
 * Sandbox dashboard'unda bu istekleri göreceksiniz.
 *
 * Sandbox gerçekliği:
 * - birthDate: OpenAPI'de optional ama sandbox 400 döndürüyor → zorunlu
 * - mobile: crypto method'u için zorunlu
 * - Tüm yöntemler payin_id döndürmüyor, bazıları sadece redirect_url
 * - Payout sandbox'ta çalışmayabilir (support onaylamalı)
 *
 * Varsayılan `npm test` paketine dahil DEĞİL (gerçek ağ + sandbox kotası).
 * Çalıştırmak için (kökten): npm run test:network
 * veya (server/ içinden): node --test test/network/slikair-sandbox.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const SANDBOX = {
  merchantId:     'TEST_30f35779d0ad7526a8b2d88bb1547339',
  merchantToken:  'sk_test_1c5b92922aac5d25bb6f604395af1131',
  siteId:         'SANDBOX_3137',
  baseUrl:        'https://sandbox.slikair.online/api/v2',
};

// Platform webhook URL'leri — sandbox'tan gelen bildirimlerin hedefi.
// DİKKAT: Bu testler çalışırken sunucu ayakta olmalı ki Slikair webhook'ları platforma ulaşabilsin.
// Production: https://api.vip90.bet, Development: http://localhost:3001
const PLATFORM_BASE = process.env.API_BASE_URL || 'https://app.vip90.bet';
const WEBHOOK_PAYIN  = `${PLATFORM_BASE}/api/slikair/webhook/payin`;
const WEBHOOK_PAYOUT = `${PLATFORM_BASE}/api/slikair/webhook/payout`;

// Redirect URL'leri — kullanıcının yönlendirildiği sayfalar
const APP_BASE = (process.env.CLIENT_URL || 'https://app.vip90.bet').split(',')[0].trim();
const REDIRECT = {
  success_url: `${APP_BASE}/profile?deposit=success`,
  pending_url: `${APP_BASE}/profile?deposit=pending`,
  fail_url:    `${APP_BASE}/profile?deposit=failed`,
  back_url:    `${APP_BASE}/profile?mode=deposit`,
};

const CARDS = {
  succeed:     '1111111111111111',
  declined:    '4000000000000002',
  threeds:     '4000000000003220',
  pendingOk:   '4000000000000119',
  riskDecline: '4000000000000333',
  expired:     '4000000000000069',
  invalidCvv:  '4000000000000127',
};

async function api(endpoint, body, idempotencyKey) {
  const res = await fetch(`${SANDBOX.baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'merchant-token': SANDBOX.merchantToken,
      'Idempotency-Key': idempotencyKey || crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

function base(overrides = {}) {
  return {
    merchant_id: SANDBOX.merchantId,
    merchant_site_id: SANDBOX.siteId,
    payment_method: 'credit_card',
    device_ip: '127.0.0.1',
    amount: 10.00,
    currency: 'EUR',
    email: `test-${Date.now()}@${Math.random().toString(36).slice(2)}@example.com`,
    request_id: crypto.randomUUID(),
    country: 'NLD',
    first_name: 'Test',
    last_name: 'User',
    // Gerçek platform webhook URL'leri — Slikair sonuçları buraya gönderecek
    notification_link: WEBHOOK_PAYIN,
    // Gerçek redirect URL'leri — kullanıcı ödemeden sonra buraya yönlendirilecek
    success_url: REDIRECT.success_url,
    pending_url: REDIRECT.pending_url,
    fail_url:    REDIRECT.fail_url,
    back_url:    REDIRECT.back_url,
    // Sandbox zorunlu alanları
    birthDate: '1990-01-15',
    mobile: '+31612345678',
    address: 'Teststraat 1',
    city: 'Amsterdam',
    zipCode: '1012 AB',
    state: 'North Holland',
    ...overrides,
  };
}

function card(num, extras = {}) {
  return {
    cardNum: num,
    cardHolder: 'Test Holder',
    cardExpireMonth: '12',
    cardExpireYear: '2026',
    cardCvv: '123',
    ...extras,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. KREDİ KARTI YÖNTEMLERİ
// ═══════════════════════════════════════════════════════════════════════════

describe('Slikair Sandbox — Kredi Kartı', () => {

  it('credit_card (başarılı 1111...) → 200 + redirect_url', async () => {
    const reqId = crypto.randomUUID();
    const { status, data } = await api('/payment/create', base({
      payment_method: 'credit_card',
      ...card(CARDS.succeed),
    }), reqId);

    console.log(`    response: ${JSON.stringify({ status: data?.status, payin_id: data?.payin_id, redirect_url: data?.redirect_url?.substring(0, 60), request_id: data?.request_id })}`);

    assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
    assert.ok(data.redirect_url, 'Should have redirect_url');
  });

  it('credit_card (reddedilen 0002) → error or redirect', async () => {
    const reqId = crypto.randomUUID();
    const { status, data } = await api('/payment/create', base({
      payment_method: 'credit_card',
      ...card(CARDS.declined),
    }), reqId);

    console.log(`    response: ${JSON.stringify({ status: data?.status, payin_id: data?.payin_id, redirect_url: data?.redirect_url?.substring(0, 60) })}`);

    assert.equal(status, 200);
    // Reddedilen kart sandbox'ta hata döndürebilir veya redirect_url verebilir
    // Her iki durum da geçerli — asıl önemli olan webhook'un failed state tetiklemesi
    assert.ok(data.redirect_url || data.status === 'error' || data.status === 'pending',
      `Should have redirect_url or error/pending status, got: ${JSON.stringify(data)}`);
  });

  it('credit_card (3DS 3220) → 200 + redirect_url', async () => {
    const reqId = crypto.randomUUID();
    const { status, data } = await api('/payment/create', base({
      payment_method: 'credit_card',
      ...card(CARDS.threeds),
    }), reqId);

    console.log(`    response: ${JSON.stringify({ status: data?.status, payin_id: data?.payin_id, redirect_url: data?.redirect_url?.substring(0, 60) })}`);

    assert.equal(status, 200);
    assert.ok(data.redirect_url);
  });

  it('credit_card (pending→succeeded 0119) → 200 + redirect_url', async () => {
    const reqId = crypto.randomUUID();
    const { status, data } = await api('/payment/create', base({
      payment_method: 'credit_card',
      ...card(CARDS.pendingOk),
    }), reqId);

    console.log(`    response: ${JSON.stringify({ status: data?.status, payin_id: data?.payin_id, redirect_url: data?.redirect_url?.substring(0, 60) })}`);

    assert.equal(status, 200);
    assert.ok(data.redirect_url);
  });

  it('credit_card_ftd → 200 + redirect_url', async () => {
    const reqId = crypto.randomUUID();
    const { status, data } = await api('/payment/create', base({
      payment_method: 'credit_card_ftd',
      amount: 200.00,
      ...card(CARDS.succeed),
    }), reqId);

    console.log(`    response: ${JSON.stringify({ status: data?.status, payin_id: data?.payin_id, redirect_url: data?.redirect_url?.substring(0, 60) })}`);

    assert.equal(status, 200);
    assert.ok(data.redirect_url);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. WALLET / ALTERNATİF YÖNTEMLER
// ═══════════════════════════════════════════════════════════════════════════

describe('Slikair Sandbox — Wallet & Alternatif', () => {

  it('googlepay → 200', async () => {
    const reqId = crypto.randomUUID();
    const { status, data } = await api('/payment/create', base({
      payment_method: 'googlepay',
      amount: 25.00,
    }), reqId);
    console.log(`    response: ${JSON.stringify({ status: data?.status, payin_id: data?.payin_id, redirect: data?.redirect_url?.substring(0, 60) })}`);
    assert.equal(status, 200, JSON.stringify(data));
  });

  it('applepay → 200', async () => {
    const reqId = crypto.randomUUID();
    const { status, data } = await api('/payment/create', base({
      payment_method: 'applepay',
      amount: 45.00,
    }), reqId);
    console.log(`    response: ${JSON.stringify({ status: data?.status, payin_id: data?.payin_id, redirect: data?.redirect_url?.substring(0, 60) })}`);
    assert.equal(status, 200, JSON.stringify(data));
  });

  it('revolut → 200', async () => {
    const reqId = crypto.randomUUID();
    const { status, data } = await api('/payment/create', base({
      payment_method: 'revolut',
      amount: 60.00,
    }), reqId);
    console.log(`    response: ${JSON.stringify({ status: data?.status, payin_id: data?.payin_id, redirect: data?.redirect_url?.substring(0, 60) })}`);
    assert.equal(status, 200, JSON.stringify(data));
  });

  it('skrill → 200', async () => {
    const reqId = crypto.randomUUID();
    const { status, data } = await api('/payment/create', base({
      payment_method: 'skrill',
      amount: 40.00,
    }), reqId);
    console.log(`    response: ${JSON.stringify({ status: data?.status, payin_id: data?.payin_id, redirect: data?.redirect_url?.substring(0, 60) })}`);
    assert.equal(status, 200, JSON.stringify(data));
  });

  it('neteller → 200', async () => {
    const reqId = crypto.randomUUID();
    const { status, data } = await api('/payment/create', base({
      payment_method: 'neteller',
      amount: 35.00,
    }), reqId);
    console.log(`    response: ${JSON.stringify({ status: data?.status, payin_id: data?.payin_id, redirect: data?.redirect_url?.substring(0, 60) })}`);
    assert.equal(status, 200, JSON.stringify(data));
  });

  it('paysafecard → 200', async () => {
    const reqId = crypto.randomUUID();
    const { status, data } = await api('/payment/create', base({
      payment_method: 'paysafecard',
      amount: 25.00,
    }), reqId);
    console.log(`    response: ${JSON.stringify({ status: data?.status, payin_id: data?.payin_id, redirect: data?.redirect_url?.substring(0, 60) })}`);
    assert.equal(status, 200, JSON.stringify(data));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. BANK TRANSFER YÖNTEMLERİ
// ═══════════════════════════════════════════════════════════════════════════

describe('Slikair Sandbox — Bank Transfer', () => {

  it('open_banking → 200', async () => {
    const reqId = crypto.randomUUID();
    const { status, data } = await api('/payment/create', base({
      payment_method: 'open_banking',
      amount: 150.00,
    }), reqId);
    console.log(`    response: ${JSON.stringify({ status: data?.status, payin_id: data?.payin_id, redirect: data?.redirect_url?.substring(0, 60) })}`);
    assert.equal(status, 200, JSON.stringify(data));
    assert.ok(data.redirect_url, 'open_banking must return redirect_url');
  });

  it('ideal → 200', async () => {
    const reqId = crypto.randomUUID();
    const { status, data } = await api('/payment/create', base({
      payment_method: 'ideal',
      amount: 35.00,
    }), reqId);
    console.log(`    response: ${JSON.stringify({ status: data?.status, payin_id: data?.payin_id, redirect: data?.redirect_url?.substring(0, 60) })}`);
    assert.equal(status, 200, JSON.stringify(data));
  });

  it('trustly → 200', async () => {
    const reqId = crypto.randomUUID();
    const { status, data } = await api('/payment/create', base({
      payment_method: 'trustly',
      amount: 80.00,
    }), reqId);
    console.log(`    response: ${JSON.stringify({ status: data?.status, payin_id: data?.payin_id, redirect: data?.redirect_url?.substring(0, 60) })}`);
    assert.equal(status, 200, JSON.stringify(data));
  });

  it('eps → 200', async () => {
    const reqId = crypto.randomUUID();
    const { status, data } = await api('/payment/create', base({
      payment_method: 'eps',
      amount: 55.00,
      country: 'AUT',
    }), reqId);
    console.log(`    response: ${JSON.stringify({ status: data?.status, payin_id: data?.payin_id, redirect: data?.redirect_url?.substring(0, 60) })}`);
    assert.equal(status, 200, JSON.stringify(data));
  });

  it('instantbanking → 200', async () => {
    const reqId = crypto.randomUUID();
    const { status, data } = await api('/payment/create', base({
      payment_method: 'instantbanking',
      amount: 120.00,
    }), reqId);
    console.log(`    response: ${JSON.stringify({ status: data?.status, payin_id: data?.payin_id, redirect: data?.redirect_url?.substring(0, 60) })}`);
    assert.equal(status, 200, JSON.stringify(data));
  });

  it('rapidtransfer → 200', async () => {
    const reqId = crypto.randomUUID();
    const { status, data } = await api('/payment/create', base({
      payment_method: 'rapidtransfer',
      amount: 50.00,
    }), reqId);
    console.log(`    response: ${JSON.stringify({ status: data?.status, payin_id: data?.payin_id, redirect: data?.redirect_url?.substring(0, 60) })}`);
    assert.equal(status, 200, JSON.stringify(data));
  });

  it('mybank → 200', async () => {
    const reqId = crypto.randomUUID();
    const { status, data } = await api('/payment/create', base({
      payment_method: 'mybank',
      amount: 90.00,
      country: 'ITA',
    }), reqId);
    console.log(`    response: ${JSON.stringify({ status: data?.status, payin_id: data?.payin_id, redirect: data?.redirect_url?.substring(0, 60) })}`);
    assert.equal(status, 200, JSON.stringify(data));
  });

  it('interac → 200', async () => {
    const reqId = crypto.randomUUID();
    const { status, data } = await api('/payment/create', base({
      payment_method: 'interac',
      amount: 70.00,
      currency: 'CAD',
      country: 'CAN',
    }), reqId);
    console.log(`    response: ${JSON.stringify({ status: data?.status, payin_id: data?.payin_id, redirect: data?.redirect_url?.substring(0, 60) })}`);
    assert.equal(status, 200, JSON.stringify(data));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. OTHER METHODS
// ═══════════════════════════════════════════════════════════════════════════

describe('Slikair Sandbox — Diğer Yöntemler', () => {

  it('blik → 200', async () => {
    const reqId = crypto.randomUUID();
    const { status, data } = await api('/payment/create', base({
      payment_method: 'blik',
      amount: 30.00,
      currency: 'PLN',
      country: 'POL',
    }), reqId);
    console.log(`    response: ${JSON.stringify({ status: data?.status, payin_id: data?.payin_id, redirect: data?.redirect_url?.substring(0, 60) })}`);
    assert.equal(status, 200, JSON.stringify(data));
  });

  it('mbway → 200', async () => {
    const reqId = crypto.randomUUID();
    const { status, data } = await api('/payment/create', base({
      payment_method: 'mbway',
      amount: 20.00,
      country: 'PRT',
    }), reqId);
    console.log(`    response: ${JSON.stringify({ status: data?.status, payin_id: data?.payin_id, redirect: data?.redirect_url?.substring(0, 60) })}`);
    assert.equal(status, 200, JSON.stringify(data));
  });

  it('crypto → 200', async () => {
    const reqId = crypto.randomUUID();
    const { status, data } = await api('/payment/create', base({
      payment_method: 'crypto',
      amount: 0.005,
      currency: 'BTC',
      country: 'USA',
    }), reqId);
    console.log(`    response: ${JSON.stringify({ status: data?.status, payin_id: data?.payin_id, redirect: data?.redirect_url?.substring(0, 60) })}`);
    assert.equal(status, 200, JSON.stringify(data));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. PAYIN STATUS
// ═══════════════════════════════════════════════════════════════════════════

describe('Slikair Sandbox — Payin Status', () => {
  it('getPaymentStatus → 200 + status field', async () => {
    // Create a payment first
    const reqId = crypto.randomUUID();
    const createRes = await api('/payment/create', base({
      payment_method: 'credit_card',
      ...card(CARDS.succeed),
    }), reqId);

    assert.equal(createRes.status, 200);
    const payinId = createRes.data.payin_id;
    assert.ok(payinId, 'Create should return payin_id for credit_card');

    // Check status
    const { status, data } = await api('/payment/get-status', {
      merchant_id: SANDBOX.merchantId,
      payin_id: payinId,
    });

    console.log(`    → status=${status} payin_status=${data?.status}`);
    assert.equal(status, 200, `Status check failed: ${JSON.stringify(data)}`);
    assert.ok(data.status, 'Should have status field');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. PAYOUT
// ═══════════════════════════════════════════════════════════════════════════

describe('Slikair Sandbox — Payout', () => {
  it('payout create endpoint responds', async () => {
    const reqId = crypto.randomUUID();
    const { status, data } = await api('/payouts/create', {
      merchant_id: SANDBOX.merchantId,
      method: 'credit_card',
      site_id: SANDBOX.siteId,
      mode: 'direct',
      amount: 50.00,
      currency: 'EUR',
      merchantReference: `PAYOUT-${reqId}`,
      country: 'NLD',
      notificationUrl: WEBHOOK_PAYOUT,
      customer: {
        firstName: 'Test',
        lastName: 'Payout',
        email: 'test-payout@example.com',
        phone: '+31612345678',
      },
      paymentDetails: {
        method: 'credit_card',
        cardNum: '4111111111111111',
        cardHolder: 'Test Payout',
        cardExpireMonth: '12',
        cardExpireYear: '2026',
      },
    }, reqId);

    console.log(`    → status=${status} payout_status=${data?.status} errors=${JSON.stringify(data?.errors)}`);
    assert.ok(status >= 200, 'Payout endpoint should respond');
    // Sandbox might return success or error — both are valid
  });

  it('payout status for non-existent → 404 or error', async () => {
    const { status, data } = await api('/payouts/get-status', {
      merchant_id: SANDBOX.merchantId,
      payout_id: 'non-existent-payout-id',
    });
    console.log(`    → status=${status}`);
    assert.ok(status >= 400 || data?.status === 'failed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════

describe('Slikair Sandbox — Error Handling', () => {
  it('invalid site_id → 400', async () => {
    const { status, data } = await api('/payment/create', base({
      merchant_site_id: 'INVALID_SITE',
    }));
    console.log(`    → status=${status} message=${data?.message}`);
    assert.ok(status >= 400 || data?.status === 'error');
  });

  it('missing birthDate → 400 (sandbox enforced)', async () => {
    const body = base();
    delete body.birthDate;
    const { status, data } = await api('/payment/create', body);
    console.log(`    → status=${status} errors=${JSON.stringify(data?.errors)}`);
    assert.equal(status, 400);
    assert.ok(data.errors?.some(e => e.includes('birthDate')));
  });

  it('missing mobile for crypto → 400', async () => {
    const body = base({ payment_method: 'crypto', currency: 'BTC', country: 'USA' });
    delete body.mobile;
    const { status, data } = await api('/payment/create', body);
    console.log(`    → status=${status} errors=${JSON.stringify(data?.errors)}`);
    assert.equal(status, 400);
    assert.ok(data.errors?.some(e => e.includes('mobile')));
  });
});
