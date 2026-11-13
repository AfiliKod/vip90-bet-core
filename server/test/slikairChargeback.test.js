import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import SlikairPayment from '../src/models/SlikairPayment.js';
import Transaction from '../src/models/Transaction.js';
import ActivityEvent from '../src/models/ActivityEvent.js';
import RiskEvaluation from '../src/models/RiskEvaluation.js';
import { runWithTenant, runAsPlatform } from '../src/tenancy/context.js';
import { handlePayinWebhook, getPayments, _setSlikairService } from '../src/controllers/slikairController.js';
import { withdraw } from '../src/controllers/transactions.js';
import { place as placeBet } from '../src/controllers/bets.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9e_slikair_chargebacks';
const TENANT_ID = new mongoose.Types.ObjectId();
const savedMode = process.env.TENANCY_MODE;
const savedEnforcement = process.env.TENANCY_ENFORCEMENT;

function response() {
  return { status: () => ({ json: () => {} }) };
}

async function webhook(payinId, status, statusCode = null) {
  await handlePayinWebhook({ body: { payin_id: payinId, status, status_code: statusCode, amount: 100, currency: 'TRY' } }, response(), (error) => { throw error; });
}

async function creditedPayment({ payinId, balance = 100 } = {}) {
  const user = await runWithTenant(TENANT_ID, () => User.create({
    username: `chargeback_${payinId}`,
    email: `${payinId}@example.com`,
    password: 'test-password',
    balance,
  }));
  const payment = await runWithTenant(TENANT_ID, () => SlikairPayment.create({
    userId: user._id,
    requestId: `request_${payinId}`,
    payinId,
    amount: 100,
    currency: 'TRY',
    paymentMethod: 'credit_card',
    email: `${payinId}@example.com`,
    country: 'TR',
    status: 'succeeded',
    creditedAt: new Date(),
  }));
  const deposit = await runWithTenant(TENANT_ID, () => Transaction.create({
    userId: user._id,
    type: 'deposit',
    amount: 100,
    balanceBefore: balance - 100,
    balanceAfter: balance,
    currency: 'TRY',
    status: 'completed',
    referenceId: payment._id,
    idempotencyKey: `slikair_payin_${TENANT_ID}_${payinId}`,
  }));
  return { user, payment, deposit };
}

before(async () => {
  process.env.TENANCY_MODE = 'multi';
  process.env.TENANCY_ENFORCEMENT = 'enforce';
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  await Promise.all([User.createIndexes(), SlikairPayment.createIndexes(), Transaction.createIndexes(), ActivityEvent.createIndexes(), RiskEvaluation.createIndexes()]);
});

after(async () => {
  _setSlikairService((await import('../src/services/slikairService.js')));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (savedMode === undefined) delete process.env.TENANCY_MODE; else process.env.TENANCY_MODE = savedMode;
  if (savedEnforcement === undefined) delete process.env.TENANCY_ENFORCEMENT; else process.env.TENANCY_ENFORCEMENT = savedEnforcement;
});

beforeEach(() => {
  _setSlikairService({ getPaymentStatus: async () => ({ status: 'chargeback', amount: 100, currency: 'TRY' }) });
});

test('verified chargeback reverses a credited deposit once, records the linked transaction, risk evaluation and activity', async () => {
  const { user, payment, deposit } = await creditedPayment({ payinId: 'cb-verified', balance: 40 });
  await webhook(payment.payinId, 'chargeback');

  const updatedUser = await runAsPlatform('assert chargeback user', () => User.findById(user._id));
  const updatedPayment = await runAsPlatform('assert chargeback payment', () => SlikairPayment.findById(payment._id));
  const reversal = await runAsPlatform('assert chargeback transaction', () => Transaction.findOne({ type: 'chargeback', referenceId: payment._id }));
  assert.equal(updatedUser.balance, -60);
  assert.equal(updatedPayment.status, 'chargeback');
  assert.equal(updatedPayment.reversalType, 'chargeback');
  assert.equal(String(updatedPayment.reversalTransactionId), String(reversal._id));
  assert.equal(String(reversal.relatedTransactionId), String(deposit._id));
  assert.equal(reversal.amount, -100);
  assert.ok(await runAsPlatform('assert chargeback risk', () => RiskEvaluation.exists({ playerId: user._id, event: 'chargeback' })));
  const { default: RiskFinding } = await import('../src/models/RiskFinding.js');
  const { default: RiskProfile } = await import('../src/models/RiskProfile.js');
  assert.ok(await runAsPlatform('assert chargeback finding', () => RiskFinding.exists({ playerId: user._id, code: 'PSP_CHARGEBACK', severity: 'HIGH' })));
  const profile = await runAsPlatform('assert review status', () => RiskProfile.findOne({ playerId: user._id }).lean());
  assert.ok(['REVIEW', 'RESTRICTED', 'BLOCKED'].includes(profile.riskStatus), `riskStatus ${profile.riskStatus}`);
  assert.ok(await runAsPlatform('assert chargeback activity', () => ActivityEvent.exists({ userId: user._id, type: 'deposit_chargeback' })));

  await webhook(payment.payinId, 'chargeback');
  assert.equal(await runAsPlatform('assert one chargeback', () => Transaction.countDocuments({ type: 'chargeback', referenceId: payment._id })), 1);
  assert.equal((await runAsPlatform('assert no second debit', () => User.findById(user._id))).balance, -60);
});

test('unverified chargeback does not move money and stores the claim', async () => {
  const { user, payment } = await creditedPayment({ payinId: 'cb-unverified' });
  _setSlikairService({ getPaymentStatus: async () => ({ status: 'succeeded', amount: 100, currency: 'TRY' }) });
  await webhook(payment.payinId, 'chargeback');
  const updated = await runAsPlatform('assert unverified payment', () => SlikairPayment.findById(payment._id));
  assert.equal((await runAsPlatform('assert unverified balance', () => User.findById(user._id))).balance, 100);
  assert.equal(updated.status, 'succeeded');
  assert.equal(updated.metadata.unverifiedReversalWebhook.status, 'chargeback');
  assert.equal(await runAsPlatform('assert no unverified debit', () => Transaction.countDocuments({ referenceId: payment._id, type: 'chargeback' })), 0);
});

test('verified refund reverses once without risk, and a later chargeback only updates status', async () => {
  const { user, payment } = await creditedPayment({ payinId: 'refund-then-chargeback' });
  _setSlikairService({ getPaymentStatus: async () => ({ status: 'refunded', amount: 100, currency: 'TRY' }) });
  await webhook(payment.payinId, 'refunded');
  assert.equal((await runAsPlatform('assert refund balance', () => User.findById(user._id))).balance, 0);
  assert.equal(await runAsPlatform('assert no refund risk', () => RiskEvaluation.countDocuments({ playerId: user._id, event: 'chargeback' })), 0);
  assert.equal(await runAsPlatform('assert refund transaction', () => Transaction.countDocuments({ type: 'deposit_refund', referenceId: payment._id })), 1);

  _setSlikairService({ getPaymentStatus: async () => ({ status: 'chargeback', amount: 100, currency: 'TRY' }) });
  await webhook(payment.payinId, 'chargeback');
  assert.equal((await runAsPlatform('assert later chargeback balance', () => User.findById(user._id))).balance, 0);
  assert.equal((await runAsPlatform('assert later chargeback status', () => SlikairPayment.findById(payment._id))).status, 'chargeback');
  assert.equal(await runAsPlatform('assert one total reversal', () => Transaction.countDocuments({ referenceId: payment._id, type: { $in: ['chargeback', 'deposit_refund'] } })), 1);
});

test('status_code 320 is informational: a failed webhook remains failed', async () => {
  const { payment } = await creditedPayment({ payinId: 'status-code-320' });
  await runWithTenant(TENANT_ID, () => SlikairPayment.updateOne({ _id: payment._id }, { $set: { status: 'pending' } }));
  await webhook(payment.payinId, 'failed', 320);
  assert.equal((await runAsPlatform('assert failed status', () => SlikairPayment.findById(payment._id))).status, 'failed');
});

test('chargeback for an uncredited payin records status but never debits', async () => {
  const user = await runWithTenant(TENANT_ID, () => User.create({ username: 'uncredited_chargeback', email: 'uncredited@example.com', password: 'test-password', balance: 25 }));
  const payment = await runWithTenant(TENANT_ID, () => SlikairPayment.create({ userId: user._id, requestId: 'uncredited-request', payinId: 'uncredited-chargeback', amount: 100, currency: 'TRY', paymentMethod: 'credit_card', email: 'uncredited@example.com', country: 'TR', status: 'failed' }));
  await webhook(payment.payinId, 'chargeback');
  assert.equal((await runAsPlatform('assert uncredited status', () => SlikairPayment.findById(payment._id))).status, 'chargeback');
  assert.equal((await runAsPlatform('assert uncredited balance', () => User.findById(user._id))).balance, 25);
  assert.equal(await runAsPlatform('assert no uncredited reversal', () => Transaction.countDocuments({ referenceId: payment._id, type: 'chargeback' })), 0);
});

test('a negative chargeback balance is rejected by the real withdrawal and bet controllers', async () => {
  const { user, payment } = await creditedPayment({ payinId: 'negative-balance-blocks', balance: 40 });
  await webhook(payment.payinId, 'chargeback');
  const request = { user: { id: String(user._id) }, validated: { amount: 1, confirmForfeit: false }, body: {} };
  let withdrawalError;
  await runWithTenant(TENANT_ID, () => withdraw(request, response(), (error) => { withdrawalError = error; }));
  assert.equal(withdrawalError?.code, 'INSUFFICIENT_BALANCE');

  let betError;
  await runWithTenant(TENANT_ID, () => placeBet({
    user: { id: String(user._id) },
    validated: { stake: 1, type: 'single', selections: [{ eventId: new mongoose.Types.ObjectId(), marketType: 'winner', oddId: 'home', oddValue: 2 }] },
  }, response(), (error) => { betError = error; }));
  assert.equal(betError?.code, 'INSUFFICIENT_BALANCE');
});

test('admin payment list returns the reversal transaction for a chargeback', async () => {
  const { payment } = await creditedPayment({ payinId: 'admin-chargeback' });
  await webhook(payment.payinId, 'chargeback');
  let body;
  await runWithTenant(TENANT_ID, () => getPayments({ query: {} }, { json: (data) => { body = data; } }, (error) => { throw error; }));
  const listed = body.payments.find((candidate) => String(candidate._id) === String(payment._id));
  assert.equal(listed.status, 'chargeback');
  assert.equal(listed.reversalTransactionId.type, 'chargeback');
});

test('a confirmed chargeback keeps the account in review across later evaluations until staff resolve it', async () => {
  const { default: RiskFinding } = await import('../src/models/RiskFinding.js');
  const { default: RiskProfile } = await import('../src/models/RiskProfile.js');
  const { evaluateRisk } = await import('../src/services/riskEngine.js');
  const { flagChargebackForReview } = await import('../src/services/pspReversal.js');
  const playerId = new mongoose.Types.ObjectId();
  await runAsPlatform('flag', () => flagChargebackForReview({ playerId, payinId: 'p-sticky', amount: 10, currency: 'TRY' }));
  const after = await runAsPlatform('eval', () => evaluateRisk(playerId, 'deposit', {}));
  assert.equal(after.decision, 'REVIEW');
  assert.equal((await runAsPlatform('p', () => RiskProfile.findOne({ playerId }).lean())).riskStatus, 'REVIEW');
  await runAsPlatform('resolve', () => RiskFinding.updateMany({ playerId, code: 'PSP_CHARGEBACK' }, { status: 'resolved' }));
  await runAsPlatform('eval2', () => evaluateRisk(playerId, 'deposit', {}));
  assert.notEqual((await runAsPlatform('p2', () => RiskProfile.findOne({ playerId }).lean())).riskStatus, 'REVIEW');
});
