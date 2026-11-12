import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Transaction from '../src/models/Transaction.js';
import KycDocument from '../src/models/KycDocument.js';
import { runWithTenant } from '../src/tenancy/context.js';
import {
  updateBalance,
  approveCryptoDeposit,
  approveCryptoWithdrawal,
  getUser,
  getKycSubmissionDetail,
  getStats,
} from '../src/controllers/admin.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip5_t7';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

let u1, txDepT1, txWdT1, kycT1;
let originalMode, originalEnforcement;

before(async () => {
  originalMode = process.env.TENANCY_MODE;
  originalEnforcement = process.env.TENANCY_ENFORCEMENT;
  process.env.TENANCY_MODE = 'multi';
  process.env.TENANCY_ENFORCEMENT = 'enforce';

  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  u1 = await runWithTenant(T1, () => User.create({
    username: 'player_t1', email: 'p1@t1.example.com', password: 'test-password', balance: 200,
  }));

  txDepT1 = await runWithTenant(T1, () => Transaction.create({
    userId: u1._id,
    type: 'crypto_deposit',
    amount: 100,
    balanceBefore: 200,
    balanceAfter: 300,
    status: 'pending',
    idempotencyKey: 't1_cdep_1',
  }));

  txWdT1 = await runWithTenant(T1, () => Transaction.create({
    userId: u1._id,
    type: 'crypto_withdraw',
    amount: -50,
    balanceBefore: 200,
    balanceAfter: 150,
    status: 'pending',
    idempotencyKey: 't1_cwd_1',
  }));

  kycT1 = await runWithTenant(T1, () => KycDocument.create({
    userId: u1._id,
    documentType: 'passport',
    fileName: 'pass.jpg',
    fileSize: 1024,
    mimeType: 'image/jpeg',
    status: 'pending',
  }));
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (originalMode === undefined) delete process.env.TENANCY_MODE;
  else process.env.TENANCY_MODE = originalMode;
  if (originalEnforcement === undefined) delete process.env.TENANCY_ENFORCEMENT;
  else process.env.TENANCY_ENFORCEMENT = originalEnforcement;
});

function failureRes() {
  return {
    status() { return this; },
    json() { assert.fail('should not succeed'); },
  };
}

function captureRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('T2 staff updating T1 player balance receives 404', async () => {
  const req = {
    params: { id: String(u1._id) },
    tenant: { id: T2 },
    body: { amount: 50, note: 'hacked credit' },
    validated: { amount: 50, type: 'credit', note: 'hacked credit' },
    user: { id: new mongoose.Types.ObjectId() },
  };

  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => updateBalance(req, failureRes(), (e) => { throw e; }),
      (e) => e.status === 404,
    );
  });
  const ref = await runWithTenant(T1, () => User.findById(u1._id));
  assert.equal(ref.balance, 200);
});

test('T2 staff approving T1 crypto deposit or withdrawal receives 404', async () => {
  const reqDep = { params: { id: String(txDepT1._id) }, tenant: { id: T2 }, user: { id: new mongoose.Types.ObjectId() } };
  const reqWd = { params: { id: String(txWdT1._id) }, tenant: { id: T2 }, user: { id: new mongoose.Types.ObjectId() } };
  const resDep = captureRes();
  const resWd = captureRes();

  await runWithTenant(T2, async () => {
    await approveCryptoDeposit(reqDep, resDep, (e) => { throw e; });
    await approveCryptoWithdrawal(reqWd, resWd, (e) => { throw e; });
  });
  assert.equal(resDep.statusCode, 404);
  assert.equal(resWd.statusCode, 404);
});

test('T2 staff querying T1 user or KYC details receives 404', async () => {
  const reqUser = { params: { id: String(u1._id) }, tenant: { id: T2 } };
  const reqKyc = { params: { id: String(kycT1._id) }, tenant: { id: T2 } };

  await runWithTenant(T2, async () => {
    await assert.rejects(async () => getUser(reqUser, failureRes(), (e) => { throw e; }), (e) => e.status === 404);
    await assert.rejects(async () => getKycSubmissionDetail(reqKyc, failureRes(), (e) => { throw e; }), (e) => e.status === 404);
  });
});

void getStats;
