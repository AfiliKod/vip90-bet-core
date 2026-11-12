import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Transaction from '../src/models/Transaction.js';
import BankDepositRequest from '../src/models/BankDepositRequest.js';
import SlikairPayout from '../src/models/SlikairPayout.js';
import Promotion from '../src/models/Promotion.js';
import BonusWagering from '../src/models/BonusWagering.js';
import ChatRoom from '../src/models/ChatRoom.js';
import ChatTip from '../src/models/ChatTip.js';
import { runAsPlatform, runWithTenant } from '../src/tenancy/context.js';
import { approveDeposit } from '../src/controllers/bank.js';
import { updateBalance, approveCryptoDeposit, approveCryptoWithdrawal } from '../src/controllers/admin.js';
import { initiatePayout } from '../src/controllers/slikairController.js';
import { claim as claimPromotion } from '../src/controllers/promotions.js';
import { sendTip } from '../src/services/chat.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip5_t10';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

let u1, u2, roomT1;
let originalMode, originalEnforcement;

before(async () => {
  originalMode = process.env.TENANCY_MODE;
  originalEnforcement = process.env.TENANCY_ENFORCEMENT;
  process.env.TENANCY_MODE = 'multi';
  process.env.TENANCY_ENFORCEMENT = 'enforce';

  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  u1 = await runWithTenant(T1, () => User.create({
    username: 'money_p1', email: 'm1@money.example.com', password: 'test-password', balance: 1000,
  }));
  u2 = await runWithTenant(T2, () => User.create({
    username: 'money_p2', email: 'm2@money.example.com', password: 'test-password', balance: 500,
  }));

  roomT1 = await runWithTenant(T1, () => ChatRoom.create({ name: 'T1 Room', slug: 't1-room', isActive: true }));
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (originalMode === undefined) delete process.env.TENANCY_MODE;
  else process.env.TENANCY_MODE = originalMode;
  if (originalEnforcement === undefined) delete process.env.TENANCY_ENFORCEMENT;
  else process.env.TENANCY_ENFORCEMENT = originalEnforcement;
});

test('§8.3 Flow 1: T1 Bank deposit approval credits T1 player; T2 admin approval returns 404', async () => {
  const reqBank = await runWithTenant(T1, () => BankDepositRequest.create({
    userId: u1._id,
    type: 'deposit',
    amount: 200,
    bankName: 'Bank A',
    senderName: 'P1',
    status: 'pending',
  }));

  // T2 admin attempt -> 404
  const reqCross = { params: { id: String(reqBank._id) }, tenant: { id: T2 }, user: { id: new mongoose.Types.ObjectId() } };
  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => approveDeposit(reqCross, { json: () => {} }, (e) => { throw e; }),
      (e) => e.status === 404,
    );
  });

  // T1 admin approval -> 200
  const reqValid = { params: { id: String(reqBank._id) }, tenant: { id: T1 }, user: { id: new mongoose.Types.ObjectId() } };
  let approvedData;
  await runWithTenant(T1, async () => {
    await approveDeposit(reqValid, { json: (data) => { approvedData = data; } }, (e) => { throw e; });
  });

  assert.ok(approvedData);
  const refreshedU1 = await runAsPlatform('test: verify bank approval', () => User.findById(u1._id));
  assert.equal(refreshedU1.balance, 1200);

  const tx = await runAsPlatform('test: verify bank ledger', () =>
    Transaction.findOne({ idempotencyKey: `bank_approve_${reqBank._id}` }),
  );
  assert.ok(tx);
  assert.equal(String(tx.tenantId), String(T1));
  assert.equal(tx.amount, 200);
});

test('§8.3 Flow 2: Slikair payout with cross-tenant userId returns 404 and leaves balances untouched', async () => {
  const req = {
    validated: {
      userId: String(u1._id),
      amount: 150,
      currency: 'TRY',
      method: 'bank',
      country: 'TR',
      paymentDetails: {},
    },
    tenant: { id: T2 },
    user: { id: new mongoose.Types.ObjectId() },
  };

  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => initiatePayout(req, { status: () => ({ json: () => {} }) }, (e) => { throw e; }),
      (e) => e.status === 404,
    );
  });

  const refreshedU1 = await runAsPlatform('test: verify payout balance', () => User.findById(u1._id));
  assert.equal(refreshedU1.balance, 1200);
  const payoutCount = await runAsPlatform('test: verify payout count', () => SlikairPayout.countDocuments({ userId: u1._id }));
  assert.equal(payoutCount, 0);
});

test('§8.3 Flow 3: Cross-tenant promotion claim returns 404; same-tenant claim writes ledger and wagering', async () => {
  const promo = await runWithTenant(T1, () => Promotion.create({
    type: 'reload',
    title: 'T1 100% Reload',
    amount: 100,
    isActive: true,
    wageringMultiplier: 25,
    claimedBy: [],
  }));

  // T2 player claim -> 404
  const reqCross = {
    params: { id: String(promo._id) },
    user: { id: String(u2._id) },
    tenant: { id: T2 },
    validated: { acceptedBonusTerms: true },
  };
  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => claimPromotion(reqCross, { json: () => {} }, (e) => { throw e; }),
      (e) => e.status === 404,
    );
  });

  // T1 player claim -> 200
  const reqValid = {
    params: { id: String(promo._id) },
    user: { id: String(u1._id) },
    tenant: { id: T1 },
    validated: { acceptedBonusTerms: true },
  };
  let claimData;
  await runWithTenant(T1, async () => {
    await claimPromotion(reqValid, { json: (data) => { claimData = data; } }, (e) => { throw e; });
  });

  assert.equal(claimData.wageringMultiplier, 25);
  const wagering = await runAsPlatform('test: verify promotion wagering', () =>
    BonusWagering.findOne({ promotionId: promo._id, userId: u1._id }),
  );
  assert.ok(wagering);
  assert.equal(String(wagering.tenantId), String(T1));
});

test('§8.3 Flow 4: Chat tip cross-tenant attempt returns 404 RECIPIENT_NOT_FOUND', async () => {
  await runWithTenant(T1, async () => {
    await assert.rejects(
      async () => sendTip(u1._id, u2._id, roomT1._id, 50, 'tip to T2 player'),
      (e) => e.status === 404 && e.code === 'RECIPIENT_NOT_FOUND',
    );
  });

  const tipCount = await runAsPlatform('test: verify tip count', () => ChatTip.countDocuments());
  assert.equal(tipCount, 0);
});

test('§8.3 Flow 5: Admin balance adjustment by cross-tenant staff returns 404', async () => {
  const reqCross = {
    params: { id: String(u1._id) },
    tenant: { id: T2 },
    body: { amount: 300, note: 'invalid adjustment' },
    validated: { amount: 300, type: 'credit', note: 'invalid adjustment' },
    user: { id: new mongoose.Types.ObjectId() },
  };
  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => updateBalance(reqCross, { json: () => {} }, (e) => { throw e; }),
      (e) => e.status === 404,
    );
  });
});

