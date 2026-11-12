process.env.TENANCY_MODE = 'multi';
process.env.TENANCY_ENFORCEMENT = 'enforce';
process.env.OPERATOR_SECRET_ENCRYPTION_KEY = 'c'.repeat(64);

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import crypto from 'crypto';
import fs from 'node:fs';
import User from '../src/models/User.js';
import Tenant from '../src/models/Tenant.js';
import SlikairPayment from '../src/models/SlikairPayment.js';
import SlikairPayout from '../src/models/SlikairPayout.js';
import Transaction from '../src/models/Transaction.js';
import { runWithTenant, runAsPlatform } from '../src/tenancy/context.js';
import { handlePayinWebhook, _setSlikairService } from '../src/controllers/slikairController.js';

const { kycConfig } = await import('../src/config/kyc.js');
const { default: sumsubWebhookRouter } = await import('../src/routes/sumsubWebhook.js');

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip6_t7';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();
const SUMSUB_SECRET_T1 = 'acceptance_sumsub_secret_t1';
const SUMSUB_SECRET_T2 = 'acceptance_sumsub_secret_t2';

let server, baseUrl, u1, u2;
const savedMode = process.env.TENANCY_MODE;
const savedEnforcement = process.env.TENANCY_ENFORCEMENT;

before(async () => {
  process.env.TENANCY_MODE = 'multi';
  process.env.TENANCY_ENFORCEMENT = 'enforce';
  process.env.OPERATOR_SECRET_ENCRYPTION_KEY = 'c'.repeat(64);

  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  await Tenant.create([
    { _id: T1, key: 'acc-t1', name: 'Acceptance Tenant 1', status: 'active' },
    { _id: T2, key: 'acc-t2', name: 'Acceptance Tenant 2', status: 'active' },
  ]);

  u1 = await runWithTenant(T1, () => User.create({
    username: 'acc_p1', email: 'p1@acc.example.com', password: 'test', balance: 1000, kycStatus: 'pending',
  }));
  u2 = await runWithTenant(T2, () => User.create({
    username: 'acc_p2', email: 'p2@acc.example.com', password: 'test', balance: 1000, kycStatus: 'pending',
  }));

  await kycConfig.set('SUMSUB_WEBHOOK_SECRET', SUMSUB_SECRET_T1, null, { tenantId: T1 });
  await kycConfig.set('SUMSUB_WEBHOOK_SECRET', SUMSUB_SECRET_T2, null, { tenantId: T2 });

  const app = express();
  app.use(['/api/webhook/sumsub', '/api/webhook/sumsub/:tenantId'], express.json({
    limit: '100kb',
    verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
  }));
  app.use('/api', sumsubWebhookRouter);

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (savedMode === undefined) delete process.env.TENANCY_MODE; else process.env.TENANCY_MODE = savedMode;
  if (savedEnforcement === undefined) delete process.env.TENANCY_ENFORCEMENT; else process.env.TENANCY_ENFORCEMENT = savedEnforcement;
});

test('§8.4 Scenario 1: Slikair payin webhook with T1 payinId verifies with T1 credentials and does not leak to T2', async () => {
  const payinId = 'slikair_acc_t1_payin';
  await runWithTenant(T1, () => SlikairPayment.create({
    userId: u1._id,
    requestId: 'req_acc_1',
    payinId,
    amount: 250,
    currency: 'TRY',
    paymentMethod: 'card',
    email: 'p1@acc.example.com',
    country: 'TR',
    status: 'pending',
  }));

  _setSlikairService({
    getPaymentStatus: async () => ({ status: 'succeeded', amount: 250, currency: 'TRY' }),
  });

  const req = {
    body: { payin_id: payinId, status: 'succeeded', amount: 250, currency: 'TRY' },
  };
  let responseData;
  const res = { status: () => ({ json: (d) => { responseData = d; } }) };

  await handlePayinWebhook(req, res, (e) => { throw e; });
  assert.ok(responseData);

  const refreshedU1 = await runAsPlatform('check u1', () => User.findById(u1._id));
  assert.equal(refreshedU1.balance, 1250);

  const refreshedU2 = await runAsPlatform('check u2', () => User.findById(u2._id));
  assert.equal(refreshedU2.balance, 1000);
});

test('§8.4 Scenario 2: Sumsub webhook to T1 URL signed with T2 secret returns 401', async () => {
  const rawBody = JSON.stringify({
    type: 'applicantReviewed',
    payload: { reviewResult: { reviewAnswer: 'GREEN' }, externalUserId: String(u1._id) },
  });
  const badSignature = crypto.createHmac('sha256', SUMSUB_SECRET_T2).update(rawBody).digest('hex');

  const res = await fetch(`${baseUrl}/api/webhook/sumsub/${T1}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-app-signature': badSignature,
      'x-app-timestamp': String(Math.floor(Date.now() / 1000)),
    },
    body: rawBody,
  });
  assert.equal(res.status, 401);
});

test('§8.4 Scenario 3: Sumsub webhook to T1 URL with T2 externalUserId returns 404', async () => {
  const rawBody = JSON.stringify({
    type: 'applicantReviewed',
    payload: { reviewResult: { reviewAnswer: 'GREEN' }, externalUserId: String(u2._id) },
  });
  const validSignature = crypto.createHmac('sha256', SUMSUB_SECRET_T1).update(rawBody).digest('hex');

  const res = await fetch(`${baseUrl}/api/webhook/sumsub/${T1}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-app-signature': validSignature,
      'x-app-timestamp': String(Math.floor(Date.now() / 1000)),
    },
    body: rawBody,
  });
  assert.equal(res.status, 404);

  const refreshedU2 = await runAsPlatform('check u2 kyc', () => User.findById(u2._id));
  assert.equal(refreshedU2.kycStatus, 'pending');
});

test('§8.4 Scenario 4: OAuth state from tenant T2 is rejected on a T1 callback', async () => {
  const { setOAuthState, consumeOAuthState } = await import('../src/services/socialAuth.js');
  const { runWithTenant } = await import('../src/tenancy/context.js');
  const foreign = await runWithTenant(T2, async () => setOAuthState('google'));
  assert.equal(await runWithTenant(T1, async () => consumeOAuthState(foreign)), null);
  const own = await runWithTenant(T1, async () => setOAuthState('google'));
  assert.equal((await runWithTenant(T1, async () => consumeOAuthState(own)))?.provider, 'google');
});

// Scenarios 5 and 6 (igames, in-house) are covered in the add-on repositories'
// own suites (test/igamesCallbackAttribution.test.js,
// engine/test/inhouseCallbackAttribution.test.js); core CI has no add-ons.
