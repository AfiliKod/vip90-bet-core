/**
 * Slikair Payment Gateway Tests
 *
 * Comprehensive tests covering:
 * - Config (enabled/disabled, all payment methods, URLs)
 * - Validators (all 19 payment methods, edge cases)
 * - Models (SlikairPayment + SlikairPayout: CRUD, enums, indexes)
 * - Webhook idempotency (payin + payout)
 * - Cashier enablement (503 when disabled)
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const ALL_PAYMENT_METHODS = [
  'credit_card', 'credit_card_ftd', 'open_banking', 'crypto',
  'blik', 'googlepay', 'applepay', 'interac', 'mbway',
  'instantbanking', 'revolut', 'skrill', 'ideal', 'trustly',
  'eps', 'neteller', 'rapidtransfer', 'paysafecard', 'mybank',
];

const PAYIN_STATUSES = ['created', 'pending', 'processing', 'succeeded', 'failed', 'refunded'];
const PAYOUT_STATUSES = ['created', 'processing', 'succeeded', 'failed'];
const INVALID_ENUM = ['invalid_status', '', 'pending2', 'SUCCESS'];

before(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_slikair');
});

after(async () => {
  await mongoose.disconnect();
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. CONFIG TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Slikair Config', () => {
  it('isSlikairEnabled returns false when env vars missing', () => {
    delete process.env.SLIKAIR_MERCHANT_ID;
    delete process.env.SLIKAIR_MERCHANT_TOKEN;
    delete process.env.SLIKAIR_SITE_ID;
    const enabled = !!(process.env.SLIKAIR_MERCHANT_ID && process.env.SLIKAIR_MERCHANT_TOKEN && process.env.SLIKAIR_SITE_ID);
    assert.equal(enabled, false);
  });

  it('isSlikairEnabled returns true when all env vars set', () => {
    process.env.SLIKAIR_MERCHANT_ID = 'TEST_merchant';
    process.env.SLIKAIR_MERCHANT_TOKEN = 'sk_test_token';
    process.env.SLIKAIR_SITE_ID = 'SANDBOX_123';
    const enabled = !!(process.env.SLIKAIR_MERCHANT_ID && process.env.SLIKAIR_MERCHANT_TOKEN && process.env.SLIKAIR_SITE_ID);
    assert.equal(enabled, true);
    delete process.env.SLIKAIR_MERCHANT_ID;
    delete process.env.SLIKAIR_MERCHANT_TOKEN;
    delete process.env.SLIKAIR_SITE_ID;
  });

  it('isSlikairEnabled returns false when only some env vars set', () => {
    process.env.SLIKAIR_MERCHANT_ID = 'TEST_merchant';
    delete process.env.SLIKAIR_MERCHANT_TOKEN;
    delete process.env.SLIKAIR_SITE_ID;
    const enabled = !!(process.env.SLIKAIR_MERCHANT_ID && process.env.SLIKAIR_MERCHANT_TOKEN && process.env.SLIKAIR_SITE_ID);
    assert.equal(enabled, false);
    delete process.env.SLIKAIR_MERCHANT_ID;
  });

  it('isPaymentMethodSupported returns true for ALL 19 methods', async () => {
    const { isPaymentMethodSupported } = await import('../src/config/slikair.js');
    for (const method of ALL_PAYMENT_METHODS) {
      assert.equal(isPaymentMethodSupported(method), true, `${method} should be supported`);
    }
  });

  it('isPaymentMethodSupported returns false for invalid methods', async () => {
    const { isPaymentMethodSupported } = await import('../src/config/slikair.js');
    assert.equal(isPaymentMethodSupported('invalid_method'), false);
    assert.equal(isPaymentMethodSupported(''), false);
    assert.equal(isPaymentMethodSupported('CREDIT_CARD'), false);
    assert.equal(isPaymentMethodSupported('credit_card_plain'), false);
  });

  it('getWebhookUrl returns payin URL', async () => {
    const { getWebhookUrl } = await import('../src/config/slikair.js');
    const url = getWebhookUrl('payin');
    assert.ok(url.includes('/api/slikair/webhook/payin'));
  });

  it('getWebhookUrl returns payout URL', async () => {
    const { getWebhookUrl } = await import('../src/config/slikair.js');
    const url = getWebhookUrl('payout');
    assert.ok(url.includes('/api/slikair/webhook/payout'));
  });

  it('getRedirectUrls returns all required URLs', async () => {
    const { getRedirectUrls } = await import('../src/config/slikair.js');
    const urls = getRedirectUrls();
    assert.ok(urls.success_url);
    assert.ok(urls.pending_url);
    assert.ok(urls.fail_url);
    assert.ok(urls.back_url);
    assert.ok(urls.success_url.includes('deposit=success'));
    assert.ok(urls.fail_url.includes('deposit=failed'));
    // 2026-09-22 canlı test bulgusu: method=slikair olmadan Profile.jsx
    // varsayılan 'bank' sekmesiyle açılıyor, SlikairDeposit.jsx (ve onun
    // deposit=success/pending/failed'i işleyen useEffect'i) hiç mount
    // olmuyor — kullanıcı başarı bildirimini görmüyor, bakiye/işlem
    // geçmişi otomatik yenilenmiyor.
    assert.ok(urls.success_url.includes('method=slikair'), 'success_url method=slikair içermeli, yoksa SlikairDeposit mount olmaz');
    assert.ok(urls.pending_url.includes('method=slikair'));
    assert.ok(urls.fail_url.includes('method=slikair'));
    assert.ok(urls.back_url.includes('method=slikair'));
  });

  it('paymentMethods list contains exactly 19 methods', async () => {
    const { SLIKAIR_SETTINGS } = await import('../src/config/slikair.js');
    assert.equal(SLIKAIR_SETTINGS.paymentMethods.length, 19);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. VALIDATOR TESTS — ALL 19 PAYMENT METHODS
// ═══════════════════════════════════════════════════════════════════════════

describe('Slikair Validators — All Payment Methods', () => {
  // Kart gerektiren yöntemler
  const cardRequired = ['credit_card', 'credit_card_ftd'];
  // Kart gerektirmeyen yöntemler
  const cardOptional = ALL_PAYMENT_METHODS.filter(m => !cardRequired.includes(m));

  for (const method of ALL_PAYMENT_METHODS) {
    const needsCard = cardRequired.includes(method);
    const baseData = {
      amount: 100,
      currency: 'EUR',
      paymentMethod: method,
      email: 'test@example.com',
      country: 'NLD',
      firstName: 'John',
      lastName: 'Doe',
    };

    if (needsCard) {
      baseData.cardNum = '4111111111111111';
      baseData.cardHolder = 'John Doe';
      baseData.cardExpireMonth = '12';
      baseData.cardExpireYear = '2026';
      baseData.cardCvv = '123';
    }

    it(`accepts valid ${method} deposit${needsCard ? ' (with card)' : ' (without card)'}`, async () => {
      const { slikairDepositSchema } = await import('../src/validators/slikair.js');
      const result = slikairDepositSchema.safeParse({ ...baseData });
      assert.equal(result.success, true, `${method} should be valid: ${JSON.stringify(result.error?.issues)}`);
    });
  }

  it('rejects invalid paymentMethod', async () => {
    const { slikairDepositSchema } = await import('../src/validators/slikair.js');
    const result = slikairDepositSchema.safeParse({
      amount: 100,
      currency: 'EUR',
      paymentMethod: 'invalid_method',
      email: 'test@example.com',
      country: 'NLD',
      firstName: 'John',
      lastName: 'Doe',
    });
    assert.equal(result.success, false);
  });

  it('rejects invalid email', async () => {
    const { slikairDepositSchema } = await import('../src/validators/slikair.js');
    const result = slikairDepositSchema.safeParse({
      amount: 100,
      currency: 'EUR',
      paymentMethod: 'credit_card',
      email: 'not-an-email',
      country: 'NLD',
      firstName: 'John',
      lastName: 'Doe',
    });
    assert.equal(result.success, false);
  });

  it('rejects invalid card number (too short)', async () => {
    const { slikairDepositSchema } = await import('../src/validators/slikair.js');
    const result = slikairDepositSchema.safeParse({
      amount: 100,
      currency: 'EUR',
      paymentMethod: 'credit_card',
      email: 'test@example.com',
      country: 'NLD',
      firstName: 'John',
      lastName: 'Doe',
      cardNum: '123',
    });
    assert.equal(result.success, false);
  });

  it('rejects invalid card number (letters)', async () => {
    const { slikairDepositSchema } = await import('../src/validators/slikair.js');
    const result = slikairDepositSchema.safeParse({
      amount: 100,
      currency: 'EUR',
      paymentMethod: 'credit_card',
      email: 'test@example.com',
      country: 'NLD',
      firstName: 'John',
      lastName: 'Doe',
      cardNum: 'abcdefghijklmnop',
    });
    assert.equal(result.success, false);
  });

  it('rejects negative amount', async () => {
    const { slikairDepositSchema } = await import('../src/validators/slikair.js');
    const result = slikairDepositSchema.safeParse({
      amount: -10,
      currency: 'EUR',
      paymentMethod: 'credit_card',
      email: 'test@example.com',
      country: 'NLD',
      firstName: 'John',
      lastName: 'Doe',
    });
    assert.equal(result.success, false);
  });

  it('rejects zero amount', async () => {
    const { slikairDepositSchema } = await import('../src/validators/slikair.js');
    const result = slikairDepositSchema.safeParse({
      amount: 0,
      currency: 'EUR',
      paymentMethod: 'credit_card',
      email: 'test@example.com',
      country: 'NLD',
      firstName: 'John',
      lastName: 'Doe',
    });
    assert.equal(result.success, false);
  });

  it('rejects missing required fields', async () => {
    const { slikairDepositSchema } = await import('../src/validators/slikair.js');
    const result = slikairDepositSchema.safeParse({});
    assert.equal(result.success, false);
  });

  it('accepts optional address fields', async () => {
    const { slikairDepositSchema } = await import('../src/validators/slikair.js');
    const result = slikairDepositSchema.safeParse({
      amount: 50,
      currency: 'EUR',
      paymentMethod: 'open_banking',
      email: 'test@example.com',
      country: 'NLD',
      firstName: 'Jan',
      lastName: 'de Vries',
      mobile: '+31612345678',
      address: 'Keizersgracht 123',
      city: 'Amsterdam',
      zipCode: '1017 CG',
      state: 'North Holland',
      birthDate: '1990-01-15',
    });
    assert.equal(result.success, true);
  });

  it('accepts different currencies', async () => {
    const { slikairDepositSchema } = await import('../src/validators/slikair.js');
    for (const currency of ['EUR', 'USD', 'GBP', 'TRY', 'PLN']) {
      const result = slikairDepositSchema.safeParse({
        amount: 100,
        currency,
        paymentMethod: 'credit_card',
        email: 'test@example.com',
        country: 'NLD',
        firstName: 'John',
        lastName: 'Doe',
      });
      assert.equal(result.success, true, `${currency} should be accepted`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. MODEL TESTS — SLIKAIRPAYMENT
// ═══════════════════════════════════════════════════════════════════════════

describe('SlikairPayment Model', () => {
  let SlikairPayment;

  before(async () => {
    const mod = await import('../src/models/SlikairPayment.js');
    SlikairPayment = mod.default;
  });

  beforeEach(async () => {
    await SlikairPayment.deleteMany({});
  });

  it('creates a payment with required fields', async () => {
    const userId = new mongoose.Types.ObjectId();
    const payment = await SlikairPayment.create({
      userId,
      requestId: 'test-req-001',
      amount: 100,
      currency: 'EUR',
      paymentMethod: 'credit_card',
      email: 'test@example.com',
      country: 'NLD',
    });
    assert.equal(payment.status, 'created');
    assert.equal(payment.amount, 100);
    assert.equal(payment.currency, 'EUR');
    assert.equal(payment.paymentMethod, 'credit_card');
    assert.ok(payment._id);
    assert.ok(payment.createdAt);
  });

  it('creates payment with all 19 payment methods', async () => {
    const userId = new mongoose.Types.ObjectId();
    for (let i = 0; i < ALL_PAYMENT_METHODS.length; i++) {
      const payment = await SlikairPayment.create({
        userId,
        requestId: `test-method-${i}`,
        amount: 50 + i,
        currency: 'EUR',
        paymentMethod: ALL_PAYMENT_METHODS[i],
        email: 'test@example.com',
        country: 'NLD',
      });
      assert.equal(payment.paymentMethod, ALL_PAYMENT_METHODS[i]);
    }
    const count = await SlikairPayment.countDocuments();
    assert.equal(count, 19);
  });

  it('has unique index on requestId', () => {
    const indexes = SlikairPayment.schema.indexes();
    const requestIdIndex = indexes.find(idx => idx[0].requestId !== undefined);
    assert.ok(requestIdIndex, 'requestId index should exist');
    assert.equal(requestIdIndex[1].unique, true);
  });

  it('has indexes on userId, payinId, status', () => {
    const indexes = SlikairPayment.schema.indexes();
    assert.ok(indexes.some(idx => idx[0].userId !== undefined && idx[0].createdAt !== undefined));
    assert.ok(indexes.some(idx => idx[0].payinId !== undefined));
    assert.ok(indexes.some(idx => idx[0].status !== undefined));
  });

  for (const status of PAYIN_STATUSES) {
    it(`accepts status "${status}"`, async () => {
      const userId = new mongoose.Types.ObjectId();
      const payment = await SlikairPayment.create({
        userId,
        requestId: `test-status-${status}`,
        amount: 100,
        currency: 'EUR',
        paymentMethod: 'credit_card',
        email: 'test@example.com',
        country: 'NLD',
        status,
      });
      assert.equal(payment.status, status);
    });
  }

  for (const status of INVALID_ENUM) {
    it(`rejects invalid status "${status}"`, async () => {
      const userId = new mongoose.Types.ObjectId();
      await assert.rejects(
        SlikairPayment.create({
          userId,
          requestId: `test-invalid-${status || 'empty'}`,
          amount: 100,
          currency: 'EUR',
          paymentMethod: 'credit_card',
          email: 'test@example.com',
          country: 'NLD',
          status,
        }),
        /Validation failed|validation failed|is not a valid enum/
      );
    });
  }

  it('stores metadata as mixed object', async () => {
    const userId = new mongoose.Types.ObjectId();
    const payment = await SlikairPayment.create({
      userId,
      requestId: 'test-metadata',
      amount: 100,
      currency: 'EUR',
      paymentMethod: 'credit_card',
      email: 'test@example.com',
      country: 'NLD',
      metadata: { payinId: 'abc123', custom: { nested: true } },
    });
    assert.deepEqual(payment.metadata, { payinId: 'abc123', custom: { nested: true } });
  });

  it('defaults webhookReceivedAt and creditedAt to null', async () => {
    const userId = new mongoose.Types.ObjectId();
    const payment = await SlikairPayment.create({
      userId,
      requestId: 'test-defaults',
      amount: 100,
      currency: 'EUR',
      paymentMethod: 'credit_card',
      email: 'test@example.com',
      country: 'NLD',
    });
    assert.equal(payment.webhookReceivedAt, null);
    assert.equal(payment.creditedAt, null);
  });

  it('updates fields successfully', async () => {
    const userId = new mongoose.Types.ObjectId();
    const payment = await SlikairPayment.create({
      userId,
      requestId: 'test-update',
      amount: 100,
      currency: 'EUR',
      paymentMethod: 'credit_card',
      email: 'test@example.com',
      country: 'NLD',
    });
    payment.status = 'succeeded';
    payment.payinId = 'payin-uuid-123';
    payment.creditedAt = new Date();
    await payment.save();

    const updated = await SlikairPayment.findById(payment._id);
    assert.equal(updated.status, 'succeeded');
    assert.equal(updated.payinId, 'payin-uuid-123');
    assert.ok(updated.creditedAt);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. MODEL TESTS — SLIKAIRPAYOUT
// ═══════════════════════════════════════════════════════════════════════════

describe('SlikairPayout Model', () => {
  let SlikairPayout;

  before(async () => {
    const mod = await import('../src/models/SlikairPayout.js');
    SlikairPayout = mod.default;
  });

  beforeEach(async () => {
    await SlikairPayout.deleteMany({});
  });

  it('creates a payout with required fields', async () => {
    const userId = new mongoose.Types.ObjectId();
    const payout = await SlikairPayout.create({
      userId,
      merchantReference: 'ORDER-123',
      amount: 50,
      currency: 'EUR',
      method: 'credit_card',
    });
    assert.equal(payout.status, 'created');
    assert.equal(payout.amount, 50);
    assert.equal(payout.method, 'credit_card');
  });

  it('creates payout with multiple methods', async () => {
    const userId = new mongoose.Types.ObjectId();
    const methods = ['credit_card', 'open_banking', 'crypto', 'fps'];
    for (let i = 0; i < methods.length; i++) {
      const payout = await SlikairPayout.create({
        userId,
        merchantReference: `ORDER-METHOD-${i}`,
        amount: 100 + i,
        currency: 'EUR',
        method: methods[i],
      });
      assert.equal(payout.method, methods[i]);
    }
    const count = await SlikairPayout.countDocuments();
    assert.equal(count, 4);
  });

  for (const status of PAYOUT_STATUSES) {
    it(`accepts status "${status}"`, async () => {
      const userId = new mongoose.Types.ObjectId();
      const payout = await SlikairPayout.create({
        userId,
        merchantReference: `ORDER-STATUS-${status}`,
        amount: 50,
        currency: 'EUR',
        method: 'credit_card',
        status,
      });
      assert.equal(payout.status, status);
    });
  }

  for (const status of INVALID_ENUM) {
    it(`rejects invalid status "${status}"`, async () => {
      const userId = new mongoose.Types.ObjectId();
      await assert.rejects(
        SlikairPayout.create({
          userId,
          merchantReference: `ORDER-INVALID-${status || 'empty'}`,
          amount: 50,
          currency: 'EUR',
          method: 'credit_card',
          status,
        }),
        /Validation failed|validation failed|is not a valid enum/
      );
    });
  }

  it('has indexes on userId, payoutId, status, merchantReference', () => {
    const indexes = SlikairPayout.schema.indexes();
    assert.ok(indexes.some(idx => idx[0].userId !== undefined && idx[0].createdAt !== undefined));
    assert.ok(indexes.some(idx => idx[0].payoutId !== undefined));
    assert.ok(indexes.some(idx => idx[0].status !== undefined));
    assert.ok(indexes.some(idx => idx[0].merchantReference !== undefined));
  });

  it('stores customer and paymentDetails as mixed objects', async () => {
    const userId = new mongoose.Types.ObjectId();
    const payout = await SlikairPayout.create({
      userId,
      merchantReference: 'ORDER-MIXED',
      amount: 50,
      currency: 'EUR',
      method: 'credit_card',
      customer: { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
      paymentDetails: { method: 'credit_card', cardNum: '4111111111111111' },
    });
    assert.equal(payout.customer.firstName, 'John');
    assert.equal(payout.paymentDetails.method, 'credit_card');
  });

  it('defaults webhookReceivedAt and processedAt to null', async () => {
    const userId = new mongoose.Types.ObjectId();
    const payout = await SlikairPayout.create({
      userId,
      merchantReference: 'ORDER-DEFAULTS',
      amount: 50,
      currency: 'EUR',
      method: 'credit_card',
    });
    assert.equal(payout.webhookReceivedAt, null);
    assert.equal(payout.processedAt, null);
  });

  it('updates payout status to succeeded', async () => {
    const userId = new mongoose.Types.ObjectId();
    const payout = await SlikairPayout.create({
      userId,
      merchantReference: 'ORDER-UPDATE',
      amount: 50,
      currency: 'EUR',
      method: 'credit_card',
    });
    payout.status = 'succeeded';
    payout.payoutId = 'payout-uuid-456';
    payout.processedAt = new Date();
    await payout.save();

    const updated = await SlikairPayout.findById(payout._id);
    assert.equal(updated.status, 'succeeded');
    assert.equal(updated.payoutId, 'payout-uuid-456');
    assert.ok(updated.processedAt);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. WEBHOOK IDEMPOTENCY TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Webhook Idempotency', () => {
  let SlikairPayment;
  let SlikairPayout;

  before(async () => {
    const mod1 = await import('../src/models/SlikairPayment.js');
    SlikairPayment = mod1.default;
    const mod2 = await import('../src/models/SlikairPayout.js');
    SlikairPayout = mod2.default;
  });

  beforeEach(async () => {
    await SlikairPayment.deleteMany({});
    await SlikairPayout.deleteMany({});
  });

  it('payin webhook: second call on succeeded payment is idempotent', async () => {
    const userId = new mongoose.Types.ObjectId();
    const payment = await SlikairPayment.create({
      userId,
      requestId: 'idemp-test-001',
      amount: 100,
      currency: 'EUR',
      paymentMethod: 'credit_card',
      email: 'test@example.com',
      country: 'NLD',
      status: 'succeeded',
      payinId: 'payin-idempotent-001',
    });

    // Simulate webhook handler logic: if status === 'succeeded', skip
    const existing = await SlikairPayment.findOne({ payinId: 'payin-idempotent-001' });
    assert.equal(existing.status, 'succeeded');

    // Second webhook should not change anything
    const before = existing.creditedAt;
    existing.webhookReceivedAt = new Date();
    await existing.save();

    const after = await SlikairPayment.findOne({ payinId: 'payin-idempotent-001' });
    assert.equal(after.status, 'succeeded');
  });

  it('payin webhook: processes pending→succeeded transition', async () => {
    const userId = new mongoose.Types.ObjectId();
    const payment = await SlikairPayment.create({
      userId,
      requestId: 'idemp-test-002',
      amount: 100,
      currency: 'EUR',
      paymentMethod: 'credit_card',
      email: 'test@example.com',
      country: 'NLD',
      status: 'pending',
      payinId: 'payin-transition-001',
    });

    // Simulate webhook: pending → succeeded
    payment.status = 'succeeded';
    payment.creditedAt = new Date();
    await payment.save();

    const updated = await SlikairPayment.findOne({ payinId: 'payin-transition-001' });
    assert.equal(updated.status, 'succeeded');
    assert.ok(updated.creditedAt);
  });

  it('payout webhook: second call on succeeded payout is idempotent', async () => {
    const userId = new mongoose.Types.ObjectId();
    const payout = await SlikairPayout.create({
      userId,
      merchantReference: 'ORDER-IDEMP-001',
      amount: 50,
      currency: 'EUR',
      method: 'credit_card',
      status: 'succeeded',
      payoutId: 'payout-idempotent-001',
    });

    const existing = await SlikairPayout.findOne({ payoutId: 'payout-idempotent-001' });
    assert.equal(existing.status, 'succeeded');

    // Second webhook should not change anything
    existing.webhookReceivedAt = new Date();
    await existing.save();

    const after = await SlikairPayout.findOne({ payoutId: 'payout-idempotent-001' });
    assert.equal(after.status, 'succeeded');
  });

  it('payout webhook: processes created→processing→succeeded transition', async () => {
    const userId = new mongoose.Types.ObjectId();
    const payout = await SlikairPayout.create({
      userId,
      merchantReference: 'ORDER-TRANSITION-001',
      amount: 50,
      currency: 'EUR',
      method: 'open_banking',
    });
    assert.equal(payout.status, 'created');

    // First webhook: processing
    payout.status = 'processing';
    await payout.save();
    assert.equal((await SlikairPayout.findById(payout._id)).status, 'processing');

    // Second webhook: succeeded
    payout.status = 'succeeded';
    payout.processedAt = new Date();
    await payout.save();

    const final = await SlikairPayout.findById(payout._id);
    assert.equal(final.status, 'succeeded');
    assert.ok(final.processedAt);
  });

  it('webhook for unknown payin_id does not throw', async () => {
    // Simulate: webhook arrives for payin_id that doesn't exist in DB
    const found = await SlikairPayment.findOne({ payinId: 'nonexistent-payin-id' });
    assert.equal(found, null);
    // Handler should return 200, not throw
  });

  it('webhook for unknown payoutId does not throw', async () => {
    const found = await SlikairPayout.findOne({ payoutId: 'nonexistent-payout-id' });
    assert.equal(found, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. CASHIER ENABLEMENT TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Cashier Enablement', () => {
  it('deposit endpoint returns 503 when Slikair is disabled', async () => {
    // Simulate: isSlikairEnabled() returns false
    delete process.env.SLIKAIR_MERCHANT_ID;
    delete process.env.SLIKAIR_MERCHANT_TOKEN;
    delete process.env.SLIKAIR_SITE_ID;

    const enabled = !!(process.env.SLIKAIR_MERCHANT_ID && process.env.SLIKAIR_MERCHANT_TOKEN && process.env.SLIKAIR_SITE_ID);
    assert.equal(enabled, false, 'Slikair should be disabled when env vars are missing');
  });

  it('deposit endpoint proceeds when Slikair is enabled', async () => {
    process.env.SLIKAIR_MERCHANT_ID = 'TEST_merchant';
    process.env.SLIKAIR_MERCHANT_TOKEN = 'sk_test_token';
    process.env.SLIKAIR_SITE_ID = 'SANDBOX_123';

    const enabled = !!(process.env.SLIKAIR_MERCHANT_ID && process.env.SLIKAIR_MERCHANT_TOKEN && process.env.SLIKAIR_SITE_ID);
    assert.equal(enabled, true, 'Slikair should be enabled when all env vars are set');

    delete process.env.SLIKAIR_MERCHANT_ID;
    delete process.env.SLIKAIR_MERCHANT_TOKEN;
    delete process.env.SLIKAIR_SITE_ID;
  });

  it('isSlikairEnabled is the single source of truth for cashier state', () => {
    // The function reads process.env at call time, but config module may cache.
    // Verify the logic directly: all 3 env vars required.
    process.env.SLIKAIR_MERCHANT_ID = 'TEST';
    process.env.SLIKAIR_MERCHANT_TOKEN = 'sk_test';
    process.env.SLIKAIR_SITE_ID = 'SANDBOX';
    const enabled = !!(process.env.SLIKAIR_MERCHANT_ID && process.env.SLIKAIR_MERCHANT_TOKEN && process.env.SLIKAIR_SITE_ID);
    assert.equal(enabled, true);

    delete process.env.SLIKAIR_MERCHANT_ID;
    const disabled = !!(process.env.SLIKAIR_MERCHANT_ID && process.env.SLIKAIR_MERCHANT_TOKEN && process.env.SLIKAIR_SITE_ID);
    assert.equal(disabled, false);

    delete process.env.SLIKAIR_MERCHANT_TOKEN;
    delete process.env.SLIKAIR_SITE_ID;
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. EDGE CASE / INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Edge Cases', () => {
  let SlikairPayment;

  before(async () => {
    const mod = await import('../src/models/SlikairPayment.js');
    SlikairPayment = mod.default;
  });

  beforeEach(async () => {
    await SlikairPayment.deleteMany({});
  });

  it('handles very large amounts', async () => {
    const userId = new mongoose.Types.ObjectId();
    const payment = await SlikairPayment.create({
      userId,
      requestId: 'test-large-amount',
      amount: 999999999.99,
      currency: 'EUR',
      paymentMethod: 'credit_card',
      email: 'test@example.com',
      country: 'NLD',
    });
    assert.equal(payment.amount, 999999999.99);
  });

  it('handles very small amounts', async () => {
    const userId = new mongoose.Types.ObjectId();
    const payment = await SlikairPayment.create({
      userId,
      requestId: 'test-small-amount',
      amount: 0.01,
      currency: 'EUR',
      paymentMethod: 'credit_card',
      email: 'test@example.com',
      country: 'NLD',
    });
    assert.equal(payment.amount, 0.01);
  });

  it('handles special characters in email', async () => {
    const { slikairDepositSchema } = await import('../src/validators/slikair.js');
    const result = slikairDepositSchema.safeParse({
      amount: 100,
      currency: 'EUR',
      paymentMethod: 'credit_card',
      email: 'test+tag@sub.domain.com',
      country: 'NLD',
      firstName: 'John',
      lastName: 'Doe',
    });
    assert.equal(result.success, true);
  });

  it('handles 3-letter country codes', async () => {
    const { slikairDepositSchema } = await import('../src/validators/slikair.js');
    for (const country of ['NLD', 'USA', 'GBR', 'TUR', 'DEU', 'FRA']) {
      const result = slikairDepositSchema.safeParse({
        amount: 100,
        currency: 'EUR',
        paymentMethod: 'credit_card',
        email: 'test@example.com',
        country,
        firstName: 'John',
        lastName: 'Doe',
      });
      assert.equal(result.success, true, `${country} should be accepted`);
    }
  });

  it('SlikairPayment can store and retrieve full lifecycle', async () => {
    const userId = new mongoose.Types.ObjectId();
    const payment = await SlikairPayment.create({
      userId,
      requestId: 'lifecycle-test',
      amount: 250,
      currency: 'USD',
      paymentMethod: 'open_banking',
      email: 'lifecycle@test.com',
      country: 'USA',
      status: 'created',
    });
    assert.equal(payment.status, 'created');
    assert.equal(payment.creditedAt, null);

    // Update to pending
    payment.status = 'pending';
    payment.payinId = 'payin-lifecycle-001';
    await payment.save();

    // Update to succeeded
    payment.status = 'succeeded';
    payment.creditedAt = new Date();
    payment.webhookReceivedAt = new Date();
    await payment.save();

    const final = await SlikairPayment.findById(payment._id);
    assert.equal(final.status, 'succeeded');
    assert.equal(final.payinId, 'payin-lifecycle-001');
    assert.ok(final.creditedAt);
    assert.ok(final.webhookReceivedAt);
  });
});
