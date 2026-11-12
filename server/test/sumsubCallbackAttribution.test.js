process.env.TENANCY_MODE = 'multi';

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import crypto from 'crypto';
import User from '../src/models/User.js';
import Tenant from '../src/models/Tenant.js';
import { runWithTenant, runAsPlatform } from '../src/tenancy/context.js';

// `Setting` bakes its single-mode global `key` unique index at compile time, so the
// multi-mode env above must be in place before it loads (same pattern as the other
// tenancy tests). These imports therefore resolve after the assignment.
const { default: Setting } = await import('../src/models/Setting.js');
const { kycConfig } = await import('../src/config/kyc.js');
const { default: sumsubWebhookRouter } = await import('../src/routes/sumsubWebhook.js');

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip6_t2_sumsub';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();
const SECRET_T1 = 'sumsub_secret_tenant_1';
const SECRET_T2 = 'sumsub_secret_tenant_2';

let server, baseUrl, u1, u2;
const savedMode = process.env.TENANCY_MODE;

before(async () => {
  process.env.TENANCY_MODE = 'multi';
  process.env.OPERATOR_SECRET_ENCRYPTION_KEY = 'c'.repeat(64);
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  await Tenant.create([
    { _id: T1, key: 'tenant1', name: 'Tenant 1', status: 'active' },
    { _id: T2, key: 'tenant2', name: 'Tenant 2', status: 'active' },
  ]);

  u1 = await runWithTenant(T1, () => User.create({ username: 'sumsub_p1', email: 'p1@t1.example.com', password: 'test', kycStatus: 'pending' }));
  u2 = await runWithTenant(T2, () => User.create({ username: 'sumsub_p2', email: 'p2@t2.example.com', password: 'test', kycStatus: 'pending' }));

  await kycConfig.set('SUMSUB_WEBHOOK_SECRET', SECRET_T1, null, { tenantId: T1 });
  await kycConfig.set('SUMSUB_WEBHOOK_SECRET', SECRET_T2, null, { tenantId: T2 });

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
});

function sign(secret, body) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

test('POST /api/webhook/sumsub/:tenantId verifies with T1 secret and approves T1 player', async () => {
  const body = JSON.stringify({
    type: 'applicantReviewed',
    payload: { reviewResult: { reviewAnswer: 'GREEN' }, externalUserId: String(u1._id) },
  });
  const res = await fetch(`${baseUrl}/api/webhook/sumsub/${T1}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-app-signature': sign(SECRET_T1, body),
      'x-app-timestamp': String(Math.floor(Date.now() / 1000)),
    },
    body,
  });
  assert.equal(res.status, 200);

  const refreshedU1 = await runAsPlatform('verify u1 kyc', () => User.findById(u1._id));
  assert.equal(refreshedU1.kycStatus, 'approved');
  assert.equal(refreshedU1.kycVerified, true);
});

test('POST /api/webhook/sumsub/:tenantId signed with T2 secret returns 401', async () => {
  const body = JSON.stringify({
    type: 'applicantReviewed',
    payload: { reviewResult: { reviewAnswer: 'GREEN' }, externalUserId: String(u1._id) },
  });
  const res = await fetch(`${baseUrl}/api/webhook/sumsub/${T1}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-app-signature': sign(SECRET_T2, body),
      'x-app-timestamp': String(Math.floor(Date.now() / 1000)),
    },
    body,
  });
  assert.equal(res.status, 401);
});

test('POST /api/webhook/sumsub/:tenantId with T2 externalUserId returns 404', async () => {
  const body = JSON.stringify({
    type: 'applicantReviewed',
    payload: { reviewResult: { reviewAnswer: 'GREEN' }, externalUserId: String(u2._id) },
  });
  const res = await fetch(`${baseUrl}/api/webhook/sumsub/${T1}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-app-signature': sign(SECRET_T1, body),
      'x-app-timestamp': String(Math.floor(Date.now() / 1000)),
    },
    body,
  });
  assert.equal(res.status, 404);

  const refreshedU2 = await runAsPlatform('verify u2 kyc untouched', () => User.findById(u2._id));
  assert.equal(refreshedU2.kycStatus, 'pending');
});
