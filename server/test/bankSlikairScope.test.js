import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import BankDepositRequest from '../src/models/BankDepositRequest.js';
import SlikairPayment from '../src/models/SlikairPayment.js';
import SlikairPayout from '../src/models/SlikairPayout.js';
import { runAsPlatform, runWithTenant } from '../src/tenancy/context.js';
import { approveDeposit, rejectDeposit } from '../src/controllers/bank.js';
import { initiatePayout, getPaymentById, getPayoutById } from '../src/controllers/slikairController.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip5_t2_bank_slikair';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

let u1, u2, bankReqT1, paymentT1, payoutT1;
const savedMode = process.env.TENANCY_MODE;

before(async () => {
  // Cross-tenant isolation is a multi-mode property (tenantFilter adds the tenant there only).
  process.env.TENANCY_MODE = 'multi';
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  u1 = await runWithTenant(T1, () => User.create({ username: 'player1_t1', email: 'p1@t1.com', password: 'test-password', balance: 500 }));
  u2 = await runWithTenant(T2, () => User.create({ username: 'player2_t2', email: 'p2@t2.com', password: 'test-password', balance: 500 }));

  bankReqT1 = await runWithTenant(T1, () => BankDepositRequest.create({
    userId: u1._id,
    type: 'deposit',
    amount: 100,
    bankName: 'Bank1',
    senderName: 'Sender1',
    status: 'pending',
  }));

  paymentT1 = await runWithTenant(T1, () => SlikairPayment.create({
    userId: u1._id,
    requestId: 'request-pay-1',
    merchantReference: 'ref-pay-1',
    amount: 100,
    currency: 'TRY',
    paymentMethod: 'bank',
    email: 'p1@t1.com',
    country: 'TR',
    status: 'created',
  }));

  payoutT1 = await runWithTenant(T1, () => SlikairPayout.create({
    userId: u1._id,
    merchantReference: 'ref-out-1',
    amount: 50,
    currency: 'TRY',
    method: 'bank',
    status: 'created',
  }));
});

after(async () => {
  if (savedMode === undefined) delete process.env.TENANCY_MODE; else process.env.TENANCY_MODE = savedMode;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('T2 staff approving T1 bank deposit receives 404', async () => {
  const req = {
    params: { id: String(bankReqT1._id) },
    user: { id: new mongoose.Types.ObjectId() },
    tenant: { id: T2 },
  };
  const res = { json: () => assert.fail('should not succeed') };

  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => approveDeposit(req, res, (err) => { throw err; }),
      (err) => err.status === 404
    );
  });
});

test('T2 staff initiating Slikair payout with T1 player userId receives 404', async () => {
  const req = {
    validated: {
      userId: String(u1._id),
      amount: 100,
      currency: 'TRY',
      method: 'bank',
      country: 'TR',
      paymentDetails: {},
    },
    user: { id: new mongoose.Types.ObjectId() },
    tenant: { id: T2 },
  };
  const res = { status: () => ({ json: () => assert.fail('should not succeed') }) };

  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => initiatePayout(req, res, (err) => { throw err; }),
      (err) => err.status === 404
    );
  });

  // Verify u1 balance unchanged
  const refreshedU1 = await runAsPlatform('test: verify balance', () => User.findById(u1._id));
  assert.equal(refreshedU1.balance, 500);
});

test('T2 staff querying T1 Slikair payment or payout by id receives 404', async () => {
  const reqPay = { params: { id: String(paymentT1._id) }, tenant: { id: T2 } };
  const reqOut = { params: { id: String(payoutT1._id) }, tenant: { id: T2 } };
  const res = { json: () => assert.fail('should not succeed') };

  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => getPaymentById(reqPay, res, (err) => { throw err; }),
      (err) => err.status === 404
    );
    await assert.rejects(
      async () => getPayoutById(reqOut, res, (err) => { throw err; }),
      (err) => err.status === 404
    );
  });
});

test('single mode: a legacy deposit without tenantId is still found and rejected normally (no default-tenant filter)', async () => {
  process.env.TENANCY_MODE = 'single';
  try {
    const legacy = await BankDepositRequest.collection.insertOne({
      userId: u1._id, type: 'deposit', amount: 10, bankName: 'B', senderName: 'S', status: 'pending', createdAt: new Date(),
    });
    let status = null; let body = null;
    const res = { status(c) { status = c; return this; }, json(b) { body = b; return this; } };
    const req = { params: { id: String(legacy.insertedId) }, tenant: { id: T1 }, user: { id: String(new mongoose.Types.ObjectId()) }, validated: { adminNote: 'x' }, body: { adminNote: 'x' } };
    let err = null;
    await rejectDeposit(req, res, (e) => { err = e; });
    assert.notEqual(err?.status, 404, 'legacy record must not be hidden in single mode');
  } finally {
    process.env.TENANCY_MODE = 'multi';
  }
});

