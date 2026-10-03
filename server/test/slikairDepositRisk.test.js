import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import { createSlikairRouter } from '../src/routes/slikair.js';
import { createError } from '../src/middleware/error.js';
import { errorHandler } from '../src/middleware/error.js';

const body = {
  amount: 10, currency: 'EUR', paymentMethod: 'credit_card', email: 'a@b.co', country: 'DEU',
  firstName: 'A', lastName: 'B', cardNum: '4111111111111111', cardHolder: 'A B',
  cardExpireMonth: '12', cardExpireYear: '2030', cardCvv: '123',
};

async function boot(riskCheck) {
  const calls = [];
  const app = express();
  app.use(express.json());
  const auth = (req, res, next) => { calls.push('auth'); req.user = { id: 'u1' }; next(); };
  const ctrl = { initiateDeposit: (req, res) => { calls.push('deposit'); res.json({ ok: true }); }, getMyPayments() {}, handlePayinWebhook() {}, handlePayoutWebhook() {} };
  app.use('/api/slikair', createSlikairRouter({ isUsable: async () => true, ctrl, auth, riskCheck: (req, res, next) => { calls.push('risk'); riskCheck(req, res, next); } }));
  app.use(errorHandler);
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  return { calls, server, url: `http://127.0.0.1:${server.address().port}/api/slikair/deposit` };
}
const post = (url, b) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

describe('POST /api/slikair/deposit risk kontrolü', () => {
  let blocked, allowed;
  before(async () => {
    blocked = await boot((req, res, next) => next(createError(403, 'RISK_BLOCKED', 'blocked')));
    allowed = await boot((req, res, next) => next());
  });
  after(() => { blocked.server.close(); allowed.server.close(); });

  test('risk BLOCK: 403 RISK_BLOCKED, controller çağrılmaz', async () => {
    const res = await post(blocked.url, body);
    assert.strictEqual(res.status, 403);
    assert.strictEqual((await res.json()).error.code, 'RISK_BLOCKED');
    assert.ok(!blocked.calls.includes('deposit'));
  });

  test('sıra: auth → risk → controller', async () => {
    const res = await post(allowed.url, body);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(allowed.calls, ['auth', 'risk', 'deposit']);
  });

  test('varsayılan risk kapısı gerçek enforceRiskCheck (4 middleware: gate, auth, validate, risk)', () => {
    const r = createSlikairRouter();
    const layer = r.stack.find(l => l.route?.path === '/deposit');
    assert.strictEqual(layer.route.stack.length, 5); // gate, auth, validate, risk, controller
  });
});
