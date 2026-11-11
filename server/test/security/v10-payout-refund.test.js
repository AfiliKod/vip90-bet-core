// V10 — a Slikair payout that the provider reports as failed refunds the
// already-debited balance exactly once. Slikair webhooks are unsigned, so the
// webhook body never moves money on its own: the provider status is re-fetched
// (injected fake via _setSlikairService) and only a provider-confirmed failure
// refunds. The refund is keyed to the payout record.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_v10_payout?replicaSet=rs0';

// initiatePayout requires Slikair to be configured; env is read at call time.
process.env.SLIKAIR_MERCHANT_ID = process.env.SLIKAIR_MERCHANT_ID || 'v10-merchant';
process.env.SLIKAIR_MERCHANT_TOKEN = process.env.SLIKAIR_MERCHANT_TOKEN || 'v10-token';
process.env.SLIKAIR_SITE_ID = process.env.SLIKAIR_SITE_ID || 'v10-site';

const { default: User } = await import('../../src/models/User.js');
const { default: Transaction } = await import('../../src/models/Transaction.js');
const { default: SlikairPayout } = await import('../../src/models/SlikairPayout.js');
const { default: AuditLog } = await import('../../src/models/AuditLog.js');
const { slikairConfig } = await import('../../src/config/slikairConfig.js');
const {
  handlePayoutWebhook, initiatePayout, _setSlikairService, _getSlikairService,
} = await import('../../src/controllers/slikairController.js');
const { refundPayout } = await import('../../src/services/slikairPayoutRefund.js');

const ORIGINAL = _getSlikairService();

const fake = {
  statusCalls: 0,
  nextStatus: null, // object returned by getPayoutStatus, or { throws: Error }
  nextCreatePayout: null,
  createOpts: null,
  onStatus: null, // side effect run inside getPayoutStatus (simulates a concurrent write)
  async getPayoutStatus(id) {
    fake.statusCalls++;
    if (fake.onStatus) await fake.onStatus(id);
    if (!fake.nextStatus) throw new Error('getPayoutStatus not mocked');
    if (fake.nextStatus.throws) throw fake.nextStatus.throws;
    return fake.nextStatus;
  },
  async createPayout(params, opts) {
    fake.createOpts = opts;
    if (fake.nextCreatePayout?.throws) throw fake.nextCreatePayout.throws;
    return fake.nextCreatePayout?.result;
  },
};

function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

async function webhook(body) {
  const res = fakeRes();
  await handlePayoutWebhook({ body }, res, (e) => { throw e; });
  return res;
}

describe('V10 Slikair payout failure refunds the player exactly once', async () => {
  let connected = false;
  try { await mongoose.connect(URI, { serverSelectionTimeoutMS: 3000 }); connected = true; } catch { /* skip */ }
  const opts = { skip: !connected && 'MongoDB (replica set) not available' };

  const made = [];
  const s = Date.now();
  let n = 0;

  // A user whose balance was already debited by `amount` for a processing payout.
  async function setup({ balance = 60, amount = 40, status = 'processing', ...extra } = {}) {
    const user = await User.create({ username: `v10_${n}_${s}`, email: `v10_${n++}_${s}@test.dev`, password: 'x'.repeat(10), balance });
    made.push(user._id);
    const payout = await SlikairPayout.create({
      userId: user._id,
      merchantReference: randomUUID(),
      payoutId: `slk-${randomUUID()}`,
      amount,
      currency: 'EUR',
      method: 'crypto',
      status,
      ...extra,
    });
    return { user, payout };
  }
  const bal = async (u) => (await User.findById(u._id).select('balance').lean()).balance;
  const refunds = (u) => Transaction.find({ userId: u._id, type: 'refund' }).lean();

  before(async () => {
    if (!connected) return;
    await Promise.all([Transaction.init(), User.init(), SlikairPayout.init()]);
    slikairConfig.invalidate?.();
  });

  beforeEach(() => {
    fake.statusCalls = 0;
    fake.nextStatus = null;
    fake.nextCreatePayout = null;
    fake.createOpts = null;
    fake.onStatus = null;
    _setSlikairService(fake);
  });

  after(async () => {
    _setSlikairService(ORIGINAL);
    if (connected) {
      await Transaction.deleteMany({ userId: { $in: made } });
      await SlikairPayout.deleteMany({ userId: { $in: made } });
      await AuditLog.deleteMany({ action: 'PAYOUT_REFUND_CONFLICT' });
      await User.deleteMany({ _id: { $in: made } });
      await mongoose.disconnect();
    }
  });

  it('provider-confirmed failed webhook refunds once, keyed to the payout, in the same write as the status', opts, async () => {
    const { user, payout } = await setup();
    fake.nextStatus = { status: 'failed', status_code: 311 };

    const res = await webhook({ payoutId: payout.payoutId, status: 'failed', statusCode: 311 });
    assert.equal(res.statusCode, 200);
    assert.equal(fake.statusCalls, 1, 'provider status must be re-fetched before refunding');

    assert.equal(await bal(user), 100);
    const txs = await refunds(user);
    assert.equal(txs.length, 1);
    assert.equal(txs[0].amount, 40);
    assert.equal(txs[0].balanceBefore, 60);
    assert.equal(txs[0].balanceAfter, 100);
    assert.equal(txs[0].idempotencyKey, `slikair_payout_refund_${payout.merchantReference}`);
    assert.equal(String(txs[0].referenceId), String(payout._id));

    const fresh = await SlikairPayout.findById(payout._id).lean();
    assert.equal(fresh.status, 'failed');
    assert.equal(String(fresh.refundTransactionId), String(txs[0]._id));
    assert.ok(fresh.refundedAt);
    assert.equal(fresh.providerStatus, 'failed');
  });

  it('a status-code-only provider failure (320) also refunds', opts, async () => {
    const { user, payout } = await setup();
    fake.nextStatus = { data: { status_code: 320 } };
    await webhook({ payoutId: payout.payoutId, status: 'failed', statusCode: 320 });
    assert.equal(await bal(user), 100);
    assert.equal((await refunds(user)).length, 1);
  });

  it('the same failed webhook twice refunds once', opts, async () => {
    const { user, payout } = await setup();
    fake.nextStatus = { status: 'failed' };
    await webhook({ payoutId: payout.payoutId, status: 'failed', statusCode: 311 });
    const res = await webhook({ payoutId: payout.payoutId, status: 'failed', statusCode: 311 });
    assert.equal(res.statusCode, 200);
    assert.equal(await bal(user), 100);
    assert.equal((await refunds(user)).length, 1);
  });

  it('concurrent failed webhooks refund once', opts, async () => {
    const { user, payout } = await setup();
    fake.nextStatus = { status: 'failed' };
    const body = { payoutId: payout.payoutId, status: 'failed', statusCode: 311 };
    const results = await Promise.all([webhook(body), webhook(body), webhook(body)]);
    for (const r of results) assert.equal(r.statusCode, 200);
    assert.equal(await bal(user), 100);
    assert.equal((await refunds(user)).length, 1);
  });

  it('refundPayout called twice directly (stale in-memory doc) refunds once', opts, async () => {
    const { user, payout } = await setup();
    const fetchStatus = async () => ({ status: 'failed' });
    const a = await refundPayout(payout, 'test', { fetchStatus });
    const b = await refundPayout(payout, 'test', { fetchStatus });
    assert.equal(a.refunded, true);
    assert.equal(b.refunded, false);
    assert.equal(await bal(user), 100);
    assert.equal((await refunds(user)).length, 1);
  });

  it('provider says processing → no refund, providerStatus recorded, payout stays processing, 200', opts, async () => {
    const { user, payout } = await setup();
    fake.nextStatus = { status: 'processing', status_code: 200 };
    const res = await webhook({ payoutId: payout.payoutId, status: 'failed', statusCode: 311 });
    assert.equal(res.statusCode, 200);
    assert.equal(await bal(user), 60);
    assert.equal((await refunds(user)).length, 0);
    const fresh = await SlikairPayout.findById(payout._id).lean();
    assert.equal(fresh.status, 'processing');
    assert.equal(fresh.providerStatus, 'processing');
    assert.equal(fresh.refundTransactionId, null);
  });

  it('provider says succeeded on a forged failed webhook → no refund', opts, async () => {
    const { user, payout } = await setup();
    fake.nextStatus = { status: 'succeeded', status_code: 310 };
    await webhook({ payoutId: payout.payoutId, status: 'failed', statusCode: 311 });
    assert.equal(await bal(user), 60);
    assert.equal((await refunds(user)).length, 0);
    assert.notEqual((await SlikairPayout.findById(payout._id).lean()).status, 'failed');
  });

  it('provider status fetch throws → no refund, payout stays processing, 200', opts, async () => {
    const { user, payout } = await setup();
    fake.nextStatus = { throws: new Error('network down') };
    const res = await webhook({ payoutId: payout.payoutId, status: 'failed', statusCode: 311 });
    assert.equal(res.statusCode, 200);
    assert.equal(await bal(user), 60);
    assert.equal((await refunds(user)).length, 0);
    const fresh = await SlikairPayout.findById(payout._id).lean();
    assert.equal(fresh.status, 'processing');
    assert.equal(fresh.refundTransactionId, null);
  });

  it('failed webhook on a succeeded payout → no refund, provider not consulted', opts, async () => {
    const { user, payout } = await setup({ status: 'succeeded' });
    fake.nextStatus = { status: 'failed' };
    const res = await webhook({ payoutId: payout.payoutId, status: 'failed', statusCode: 311 });
    assert.equal(res.statusCode, 200);
    assert.equal(fake.statusCalls, 0);
    assert.equal(await bal(user), 60);
    assert.equal((await refunds(user)).length, 0);
    assert.equal((await SlikairPayout.findById(payout._id).lean()).status, 'succeeded');
  });

  it('late provider-confirmed succeeded after a refund → flagged for reconciliation, audited, no clawback', opts, async () => {
    const { user, payout } = await setup();
    fake.nextStatus = { status: 'failed' };
    await webhook({ payoutId: payout.payoutId, status: 'failed', statusCode: 311 });
    assert.equal(await bal(user), 100);

    fake.nextStatus = { status: 'succeeded', status_code: 310 };
    const res = await webhook({ payoutId: payout.payoutId, status: 'succeeded', statusCode: 310 });
    assert.equal(res.statusCode, 200);

    const fresh = await SlikairPayout.findById(payout._id).lean();
    assert.equal(fresh.needsReconciliation, true);
    assert.ok(fresh.reconciliationNote);
    assert.equal(fresh.providerStatus, 'succeeded');
    assert.equal(fresh.status, 'failed', 'a refunded payout is not silently flipped to succeeded');
    assert.ok(fresh.metadata?.refundConflict);
    assert.equal(await bal(user), 100, 'no clawback');
    assert.equal((await refunds(user)).length, 1);
    const audit = await AuditLog.findOne({ action: 'PAYOUT_REFUND_CONFLICT', 'metadata.slikairPayoutId': String(payout._id) }).lean();
    assert.ok(audit, 'PAYOUT_REFUND_CONFLICT audit event');
  });

  it('late succeeded webhook not confirmed by the provider → not flagged', opts, async () => {
    const { payout } = await setup();
    fake.nextStatus = { status: 'failed' };
    await webhook({ payoutId: payout.payoutId, status: 'failed', statusCode: 311 });
    await webhook({ payoutId: payout.payoutId, status: 'succeeded', statusCode: 310 });
    const fresh = await SlikairPayout.findById(payout._id).lean();
    assert.equal(fresh.needsReconciliation, false);
    assert.equal(fresh.status, 'failed');
  });

  it('initiatePayout: createPayout throws → one refund through refundPayout with the payout key', opts, async () => {
    const user = await User.create({ username: `v10i_${s}`, email: `v10i_${s}@test.dev`, password: 'x'.repeat(10), balance: 100 });
    made.push(user._id);
    fake.nextCreatePayout = { throws: Object.assign(new Error('Sandbox environment does not support payouts'), { status: 400 }) };

    let nextErr = null;
    await initiatePayout(
      { validated: { userId: String(user._id), amount: 40, currency: 'EUR', method: 'crypto', country: 'NLD', paymentDetails: {} }, user: { id: String(new mongoose.Types.ObjectId()) } },
      fakeRes(),
      (e) => { nextErr = e; },
    );
    assert.match(nextErr?.message || '', /does not support payouts/);
    assert.equal(fake.statusCalls, 0, 'no payoutId exists, so there is nothing to re-fetch');

    assert.equal(await bal(user), 100);
    const txs = await refunds(user);
    assert.equal(txs.length, 1);
    const payout = await SlikairPayout.findOne({ userId: user._id }).lean();
    assert.equal(payout.status, 'failed');
    assert.equal(String(payout.refundTransactionId), String(txs[0]._id));
    assert.equal(txs[0].idempotencyKey, `slikair_payout_refund_${payout.merchantReference}`);
    assert.equal(fake.createOpts?.idempotencyKey, `slikair_payout_${payout.merchantReference}`, 'deterministic Idempotency-Key');
    const withdraw = await Transaction.findOne({ userId: user._id, type: 'withdraw' }).lean();
    assert.equal(withdraw.status, 'failed', 'pending withdraw closed in the refund transaction');
    assert.equal(String(withdraw.relatedTransactionId), String(txs[0]._id));

    const again = await refundPayout(await SlikairPayout.findById(payout._id), 'again', { skipProviderCheck: true });
    assert.equal(again.refunded, false);
    assert.equal(await bal(user), 100);
  });

  it('initiatePayout: createPayout gets no answer (timeout) → no automatic refund, payout flagged', opts, async () => {
    const user = await User.create({ username: `v10t_${s}`, email: `v10t_${s}@test.dev`, password: 'x'.repeat(10), balance: 100 });
    made.push(user._id);
    fake.nextCreatePayout = { throws: Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }) };
    let nextErr = null;
    await initiatePayout(
      { validated: { userId: String(user._id), amount: 40, currency: 'EUR', method: 'crypto', country: 'NLD', paymentDetails: {} }, user: { id: String(new mongoose.Types.ObjectId()) } },
      fakeRes(),
      (e) => { nextErr = e; },
    );
    assert.ok(nextErr);
    assert.equal(await bal(user), 60, 'the payout may exist at Slikair: no automatic refund');
    assert.equal((await refunds(user)).length, 0);
    const payout = await SlikairPayout.findOne({ userId: user._id }).lean();
    assert.equal(payout.needsReconciliation, true);
    assert.equal(payout.refundTransactionId, null);
  });

  async function initiate(balance = 100) {
    const user = await User.create({ username: `v10x_${n}_${s}`, email: `v10x_${n++}_${s}@test.dev`, password: 'x'.repeat(10), balance });
    made.push(user._id);
    let nextErr = null;
    const res = fakeRes();
    await initiatePayout(
      { validated: { userId: String(user._id), amount: 40, currency: 'EUR', method: 'crypto', country: 'NLD', paymentDetails: {} }, user: { id: String(new mongoose.Types.ObjectId()) } },
      res,
      (e) => { nextErr = e; },
    );
    const payout = await SlikairPayout.findOne({ userId: user._id }).lean();
    return { user, payout, nextErr, res };
  }

  for (const st of [500, 502, 504, 408, 409, 425, 429]) {
    it(`initiatePayout: createPayout HTTP ${st} → no refund, flagged (payout may exist at Slikair)`, opts, async () => {
      fake.nextCreatePayout = { throws: Object.assign(new Error(`upstream ${st}`), { status: st }) };
      const { user, payout, nextErr } = await initiate();
      assert.ok(nextErr);
      assert.equal(await bal(user), 60);
      assert.equal((await refunds(user)).length, 0);
      assert.equal(payout.needsReconciliation, true);
      assert.equal(payout.refundTransactionId, null);
    });
  }

  it('initiatePayout: createPayout HTTP 422 → refunded (definitive rejection)', opts, async () => {
    fake.nextCreatePayout = { throws: Object.assign(new Error('invalid details'), { status: 422 }) };
    const { user, payout } = await initiate();
    assert.equal(await bal(user), 100);
    assert.equal((await refunds(user)).length, 1);
    assert.equal(payout.needsReconciliation, false);
  });

  for (const [label, result] of [['null body', null], ['failure in body', { status: 'failed', payout_id: 'slk-x' }], ['no payout_id', { status: 'created' }]]) {
    it(`initiatePayout: 2xx with ${label} → no refund, flagged, error returned`, opts, async () => {
      fake.nextCreatePayout = { result: result && { ...result, payout_id: result.payout_id ? `${result.payout_id}-${randomUUID()}` : undefined } };
      const { user, payout, nextErr } = await initiate();
      assert.equal(nextErr?.code, 'SLIKAIR_PAYOUT_UNCONFIRMED');
      assert.equal(await bal(user), 60);
      assert.equal((await refunds(user)).length, 0);
      assert.equal(payout.needsReconciliation, true);
      assert.notEqual(payout.status, 'processing');
    });
  }

  it('webhook with an unknown payoutId is matched by merchantReference, the id attached, and the failure refunded', opts, async () => {
    const { user, payout } = await setup({ payoutId: null, status: 'created' });
    const slkId = `slk-${randomUUID()}`;
    fake.nextStatus = { status: 'failed', merchant_reference: payout.merchantReference };
    const res = await webhook({ payoutId: slkId, merchantReference: payout.merchantReference, status: 'failed', statusCode: 311 });
    assert.equal(res.statusCode, 200);
    const fresh = await SlikairPayout.findById(payout._id).lean();
    assert.equal(fresh.payoutId, slkId);
    assert.ok(fresh.refundTransactionId);
    assert.equal(await bal(user), 100);
  });

  it('merchantReference match is refused when the provider reports another reference', opts, async () => {
    const { user, payout } = await setup({ payoutId: null, status: 'created' });
    fake.nextStatus = { status: 'failed', merchantReference: 'someone-else' };
    await webhook({ payoutId: `slk-${randomUUID()}`, merchantReference: payout.merchantReference, status: 'failed', statusCode: 311 });
    const fresh = await SlikairPayout.findById(payout._id).lean();
    assert.equal(fresh.payoutId, null);
    assert.equal(await bal(user), 60);
  });

  it('merchantReference match is refused when get-status carries no reference (fail closed)', opts, async () => {
    const { user, payout } = await setup({ payoutId: null, status: 'created' });
    fake.nextStatus = { status: 'failed', status_code: 311 };
    const res = await webhook({ payoutId: `slk-${randomUUID()}`, merchantReference: payout.merchantReference, status: 'failed', statusCode: 311 });
    assert.equal(res.statusCode, 200);
    const fresh = await SlikairPayout.findById(payout._id).lean();
    assert.equal(fresh.payoutId, null);
    assert.equal(fresh.refundTransactionId, null);
    assert.equal(await bal(user), 60);
  });

  it('sync-refunded payout later paid (matched by merchantReference) → refund conflict flagged', opts, async () => {
    fake.nextCreatePayout = { throws: Object.assign(new Error('bad request'), { status: 400 }) };
    const { user, payout } = await initiate();
    assert.equal(await bal(user), 100);
    fake.nextStatus = { status: 'succeeded', status_code: 310, merchant_reference: payout.merchantReference };
    await webhook({ payoutId: `slk-${randomUUID()}`, merchantReference: payout.merchantReference, status: 'succeeded', statusCode: 310 });
    const fresh = await SlikairPayout.findById(payout._id).lean();
    assert.equal(fresh.needsReconciliation, true);
    assert.ok(fresh.metadata?.refundConflict);
    assert.equal(await bal(user), 100);
  });

  it('pre-V10 failed payout without refund: provider-confirmed failed webhook flags it, no money', opts, async () => {
    const { user, payout } = await setup({ status: 'failed' });
    fake.nextStatus = { status: 'failed' };
    await webhook({ payoutId: payout.payoutId, status: 'failed', statusCode: 311 });
    const fresh = await SlikairPayout.findById(payout._id).lean();
    assert.equal(fresh.needsReconciliation, true);
    assert.equal(fresh.refundTransactionId, null);
    assert.equal(await bal(user), 60);
  });

  it('pre-V10 failed payout: forged failed webhook (provider not failed) is only recorded', opts, async () => {
    const { user, payout } = await setup({ status: 'failed' });
    fake.nextStatus = { status: 'processing' };
    await webhook({ payoutId: payout.payoutId, status: 'failed', statusCode: 311 });
    const fresh = await SlikairPayout.findById(payout._id).lean();
    assert.equal(fresh.needsReconciliation, false);
    assert.ok(fresh.metadata?.unverifiedFailedWebhook);
    assert.equal(await bal(user), 60);
  });

  it('verified succeeded racing a refund (final write matches nothing) → conflict flagged, refund kept', opts, async () => {
    const { user, payout } = await setup();
    fake.nextStatus = { status: 'succeeded', status_code: 310 };
    // While the webhook verifies "succeeded", a concurrent refund lands.
    fake.onStatus = async () => {
      fake.onStatus = null;
      const r = await refundPayout(await SlikairPayout.findById(payout._id), 'race', { skipProviderCheck: true });
      assert.equal(r.refunded, true);
    };
    await webhook({ payoutId: payout.payoutId, status: 'succeeded', statusCode: 310 });
    const fresh = await SlikairPayout.findById(payout._id).lean();
    assert.equal(fresh.status, 'failed');
    assert.equal(fresh.needsReconciliation, true);
    assert.ok(fresh.metadata?.refundConflict);
    assert.equal(await bal(user), 100);
    assert.equal((await refunds(user)).length, 1);
  });

  it('a pre-existing refund row under the payout key blocks a second refund (legacy sync-fail refunds)', opts, async () => {
    const { user, payout } = await setup();
    await Transaction.create({
      userId: user._id, type: 'refund', amount: 40, balanceBefore: 60, balanceAfter: 100,
      referenceId: payout._id, status: 'completed', idempotencyKey: `slikair_payout_refund_${payout.merchantReference}`,
    });
    const r = await refundPayout(payout, 'test', { fetchStatus: async () => ({ status: 'failed' }) });
    assert.equal(r.refunded, false);
    assert.equal(await bal(user), 60);
    assert.equal((await refunds(user)).length, 1);
  });
});
