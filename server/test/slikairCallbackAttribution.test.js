import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import SlikairPayment from '../src/models/SlikairPayment.js';
import SlikairPayout from '../src/models/SlikairPayout.js';
import Transaction from '../src/models/Transaction.js';
import Setting from '../src/models/Setting.js';
import { runWithTenant, runAsPlatform } from '../src/tenancy/context.js';
import {
  handlePayinWebhook,
  handlePayoutWebhook,
  _setSlikairService,
} from '../src/controllers/slikairController.js';
import { findPaymentForCallback, findPayoutForCallback } from '../src/tenancy/callbackAttribution.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip6_t1_slikair';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

let u1, u2;
const savedMode = process.env.TENANCY_MODE;
const savedEnforcement = process.env.TENANCY_ENFORCEMENT;

before(async () => {
  process.env.TENANCY_MODE = 'multi';
  process.env.TENANCY_ENFORCEMENT = 'enforce';
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  u1 = await runWithTenant(T1, () => User.create({ username: 'slik_u1', email: 'u1@example.com', password: 'test', balance: 100 }));
  u2 = await runWithTenant(T2, () => User.create({ username: 'slik_u2', email: 'u2@example.com', password: 'test', balance: 200 }));
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (savedMode === undefined) delete process.env.TENANCY_MODE; else process.env.TENANCY_MODE = savedMode;
  if (savedEnforcement === undefined) delete process.env.TENANCY_ENFORCEMENT; else process.env.TENANCY_ENFORCEMENT = savedEnforcement;
});

test('findPaymentForCallback returns stored payment with tenantId', async () => {
  const p1 = await runWithTenant(T1, () => SlikairPayment.create({
    userId: u1._id,
    requestId: 'req-t1-1',
    payinId: 'payin-t1-1',
    amount: 50,
    currency: 'TRY',
    paymentMethod: 'card',
    email: 'u1@example.com',
    country: 'TR',
    status: 'created',
  }));

  const found = await findPaymentForCallback('payin-t1-1');
  assert.ok(found);
  assert.equal(String(found._id), String(p1._id));
  assert.equal(String(found.tenantId), String(T1));
});

test('handlePayinWebhook executes under payment tenant and credits only that player', async () => {
  const payinId = 'payin-t1-success';
  const payment = await runWithTenant(T1, () => SlikairPayment.create({
    userId: u1._id,
    requestId: 'req-t1-success',
    payinId,
    amount: 150,
    currency: 'TRY',
    paymentMethod: 'card',
    email: 'u1@example.com',
    country: 'TR',
    status: 'pending',
  }));

  let verifiedTenantUsed = null;
  _setSlikairService({
    getPaymentStatus: async (id) => {
      verifiedTenantUsed = mongoose.connection.readyState === 1;
      return { status: 'succeeded', amount: 150, currency: 'TRY' };
    },
  });

  const req = {
    body: {
      payin_id: payinId,
      status: 'succeeded',
      status_code: 201,
      amount: 150,
      currency: 'TRY',
    },
  };
  let responseJson = null;
  const res = {
    status: (code) => ({
      json: (data) => { responseJson = { code, data }; return responseJson; },
    }),
  };

  await handlePayinWebhook(req, res, (e) => { throw e; });
  assert.equal(responseJson.code, 200);

  const updatedU1 = await runAsPlatform('verify u1', () => User.findById(u1._id));
  assert.equal(updatedU1.balance, 250);

  const updatedU2 = await runAsPlatform('verify u2', () => User.findById(u2._id));
  assert.equal(updatedU2.balance, 200);

  const tx = await runAsPlatform('verify tx', () => Transaction.findOne({ idempotencyKey: `slikair_payin_${T1}_${payinId}` }));
  assert.ok(tx);
  assert.equal(String(tx.tenantId), String(T1));
});

test('handlePayinWebhook with unknown payin_id credits nothing', async () => {
  const req = {
    body: {
      payin_id: 'non-existent-payin',
      status: 'succeeded',
      amount: 500,
    },
  };
  let responseJson = null;
  const res = {
    status: (code) => ({ json: (data) => { responseJson = { code, data }; } }),
  };

  await handlePayinWebhook(req, res, (e) => { throw e; });
  assert.equal(responseJson.code, 200);

  const u1Check = await runAsPlatform('check u1', () => User.findById(u1._id));
  assert.equal(u1Check.balance, 250);
});