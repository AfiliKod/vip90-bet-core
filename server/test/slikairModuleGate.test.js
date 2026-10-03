import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import { createSlikairRouter } from '../src/routes/slikair.js';
import { MODULE_DEFINITIONS } from '../src/modules/registry.js';
import { createModuleStore } from '../src/modules/registry.js';

function stubCtrl(calls) {
  const h = name => (req, res) => { calls.push(name); res.json({ ok: name }); };
  return {
    initiateDeposit: h('deposit'),
    getMyPayments: h('my-payments'),
    handlePayinWebhook: h('webhook-payin'),
    handlePayoutWebhook: h('webhook-payout'),
  };
}

async function boot(usable) {
  const calls = [];
  const app = express();
  app.use(express.json());
  const auth = (req, res, next) => { req.user = { id: 'u1' }; next(); };
  app.use('/api/slikair', createSlikairRouter({ isUsable: async id => { calls.push(`gate:${id}`); return usable; }, ctrl: stubCtrl(calls), auth, riskCheck: (req, res, next) => next() }));
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/slikair`;
  return { calls, server, base };
}

const post = (url, body = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('slikair-payment modül tanımı', () => {
  test('registry\'de tanımlı', () => {
    assert.ok(MODULE_DEFINITIONS.some(m => m.id === 'slikair-payment'));
  });
  test('DB\'de kayıt yoksa registry kapalı sayar (varsayılan-açık tohumlama ayrı yapılır)', async () => {
    const store = createModuleStore({ load: async () => ({}) });
    assert.strictEqual(await store.isEnabled('slikair-payment'), false);
  });
});

describe('Slikair rotaları — modül kapalı', () => {
  let ctx;
  before(async () => { ctx = await boot(false); });
  after(() => ctx.server.close());

  test('oyuncu yatırma başlatma 503 MODULE_DISABLED (controller çağrılmaz)', async () => {
    const res = await post(`${ctx.base}/deposit`, { amount: 10 });
    assert.strictEqual(res.status, 503);
    const body = await res.json();
    assert.strictEqual(body.error.code, 'MODULE_DISABLED');
    assert.strictEqual(body.error.module, 'slikair-payment');
    assert.ok(!ctx.calls.includes('deposit'));
  });

  test('webhook\'lar modül kapalıyken de ulaşır (gelen ödemeler kaybolmaz)', async () => {
    for (const t of ['payin', 'payout']) {
      const res = await post(`${ctx.base}/webhook/${t}`, { x: 1 });
      assert.strictEqual(res.status, 200);
    }
    assert.ok(ctx.calls.includes('webhook-payin') && ctx.calls.includes('webhook-payout'));
  });

  test('kendi ödeme geçmişi (salt okunur) açık kalır', async () => {
    const res = await fetch(`${ctx.base}/my-payments`);
    assert.strictEqual(res.status, 200);
  });
});

describe('Slikair rotaları — modül açık', () => {
  let ctx;
  before(async () => { ctx = await boot(true); });
  after(() => ctx.server.close());

  test('yatırma başlatma controller\'a ulaşır', async () => {
    const res = await post(`${ctx.base}/deposit`, {
      amount: 10, currency: 'EUR', paymentMethod: 'credit_card', email: 'a@b.co', country: 'DE',
      firstName: 'A', lastName: 'B', cardNum: '4111111111111111', cardHolder: 'A B',
      cardExpireMonth: '12', cardExpireYear: '2030', cardCvv: '123',
    });
    // validator şemasına takılırsa 400, ama 503 olmamalı; gate geçildi
    assert.notStrictEqual(res.status, 503);
    assert.ok(ctx.calls.includes('gate:slikair-payment'));
  });
});
