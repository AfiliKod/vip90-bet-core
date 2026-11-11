/**
 * V10 — refund the player when a Slikair payout fails.
 *
 * The payout amount is debited before the payout is sent to Slikair. When the
 * payout fails, the debit is given back exactly once:
 *  - Slikair webhooks are unsigned, so the webhook body never moves money on
 *    its own. Before refunding, the payout status is re-fetched from Slikair
 *    and only a provider-confirmed failure refunds. The status fetcher is
 *    injected by the caller (the controller passes its `_setSlikairService`
 *    seam) so tests use a fake.
 *  - The refund is keyed to the payout record
 *    (`slikair_payout_refund_<merchantReference>`, the key the old sync-fail
 *    refund already used), and the payout row is claimed inside the same
 *    transaction that writes the balance and the ledger row. Repeated or
 *    concurrent calls therefore refund once.
 *  - A refunded payout that the provider later reports as paid is flagged for
 *    manual reconciliation (never clawed back automatically, never silently
 *    double-paid).
 */
import mongoose from 'mongoose';
import SlikairPayout from '../models/SlikairPayout.js';
import Transaction from '../models/Transaction.js';
import { adjustBalance, createTransaction, isDuplicateTransaction } from './ledger.js';
import { withTransactionRetry } from '../utils/transactionRetry.js';
import { errorLogger } from './errorLogger.js';
import { logAuditEvent } from './audit.js';

const FAILED_STATES = new Set(['failed', 'declined', 'expired']);
const FAILED_CODES = new Set([311, 320, 330]);

export function payoutRefundKey(payout) {
  return `slikair_payout_refund_${payout.merchantReference}`;
}

/** Normalises a get-status response to { state, code } (top level or under `data`). */
export function providerState(res) {
  const body = res?.status !== undefined || res?.status_code !== undefined ? res : (res?.data ?? res ?? {});
  const code = Number(body?.status_code ?? body?.statusCode);
  return {
    state: String(body?.status || '').toLowerCase(),
    code: Number.isFinite(code) ? code : null,
  };
}

export function isProviderFailed({ state, code }) {
  return FAILED_STATES.has(state) || FAILED_CODES.has(code);
}

export function isProviderSucceeded({ state, code }) {
  return state === 'succeeded' || code === 310;
}

// HTTP statuses that do not prove Slikair rejected the request: the payout may
// have been created even though this answer says otherwise.
const AMBIGUOUS_4XX = new Set([408, 409, 425, 429]);

/** Only a 4xx client rejection (except 408/409/425/429) proves no payout was created. */
export function isDefinitiveRejection(err) {
  const st = err?.status;
  return Number.isInteger(st) && st >= 400 && st < 500 && !AMBIGUOUS_4XX.has(st);
}

/** Flags a payout whose outcome is unknown; the debit stays, nothing is refunded. */
export async function flagPayoutForReconciliation(payout, note, category) {
  await SlikairPayout.updateOne(
    { _id: payout._id },
    { $set: { needsReconciliation: true, reconciliationNote: note } },
  ).catch(() => {});
  errorLogger.critical(category, `payout ${payout._id}: ${note}; manual reconciliation required`, {
    slikairPayoutId: String(payout._id),
  });
}

async function defaultFetchStatus(payoutId) {
  const { getPayoutStatus } = await import('./slikairService.js');
  return getPayoutStatus(payoutId);
}

/**
 * @param {object} payout SlikairPayout document (may be stale; it is re-read in the transaction)
 * @param {string} reason ledger note
 * @param {object} [opts]
 * @param {boolean} [opts.skipProviderCheck] only for the sync path where Slikair rejected the create call
 * @param {(payoutId: string) => Promise<object>} [opts.fetchStatus] provider status fetcher
 * @returns {Promise<{refunded: boolean, reason?: string, providerStatus?: string|null}>}
 */
export async function refundPayout(payout, reason, { skipProviderCheck = false, fetchStatus = defaultFetchStatus } = {}) {
  if (payout.refundTransactionId) return { refunded: false, reason: 'already_refunded' };
  if (payout.status === 'succeeded') return { refunded: false, reason: 'succeeded' };

  let providerStatus = null;
  if (!skipProviderCheck) {
    if (!payout.payoutId) return { refunded: false, reason: 'provider_unverifiable' };
    try {
      const ps = providerState(await fetchStatus(payout.payoutId));
      providerStatus = ps.state || (ps.code !== null ? String(ps.code) : null);
      if (!isProviderFailed(ps)) {
        await SlikairPayout.updateOne(
          { _id: payout._id, refundTransactionId: null },
          { $set: { providerStatus } },
        );
        return { refunded: false, reason: 'provider_not_failed', providerStatus };
      }
    } catch (e) {
      errorLogger.critical(
        'slikair_payout_refund_verify_failed',
        `payoutId=${payout.payoutId}: provider status check before refund failed: ${e.message}`,
        { payoutId: payout.payoutId },
      );
      return { refunded: false, reason: 'provider_unreachable' };
    }
  }

  const key = payoutRefundKey(payout);
  const session = await mongoose.startSession();
  try {
    return await withTransactionRetry(session, async () => {
      const now = new Date();
      const set = { status: 'failed', refundedAt: now, processedAt: now };
      if (providerStatus) set.providerStatus = providerStatus;
      // Claim the payout row first: a concurrent refund conflicts on this write.
      const claimed = await SlikairPayout.findOneAndUpdate(
        { _id: payout._id, refundTransactionId: null, status: { $ne: 'succeeded' } },
        { $set: set },
        { new: true, session },
      );
      if (!claimed) return { refunded: false, reason: 'already_refunded' };

      const adjusted = await adjustBalance(claimed.userId, claimed.amount, { session });
      if (!adjusted) throw new Error('User not found during Slikair payout refund');

      const { transaction } = await createTransaction({
        userId: claimed.userId,
        type: 'refund',
        amount: claimed.amount,
        balanceBefore: adjusted.balanceBefore,
        balanceAfter: adjusted.balanceAfter,
        referenceId: claimed._id,
        status: 'completed',
        note: `Slikair payout refunded: ${reason}`,
        idempotencyKey: key,
        source: 'system',
      }, { session });

      await SlikairPayout.updateOne(
        { _id: claimed._id },
        { $set: { refundTransactionId: transaction._id } },
        { session },
      );
      // Close the original pending withdraw row so the ledger does not show
      // a pending withdraw next to its refund.
      await Transaction.updateOne(
        { idempotencyKey: `slikair_payout_${claimed.merchantReference}`, type: 'withdraw', status: 'pending' },
        { $set: { status: 'failed', relatedTransactionId: transaction._id } },
        { session },
      );
      return { refunded: true, providerStatus };
    });
  } catch (e) {
    const dupKey = isDuplicateTransaction(e) || (e?.code === 11000 && e?.keyPattern?.idempotencyKey);
    if (!dupKey) throw e;
    // The refund under this key already exists (e.g. an old sync-fail refund
    // written before the payout row tracked it). Link it; never refund again.
    const existing = await Transaction.findOne({ idempotencyKey: key }).select('_id createdAt').lean();
    if (!existing) {
      errorLogger.critical(
        'slikair_payout_refund_duplicate_without_row',
        `payout ${payout._id}: duplicate refund key ${key} reported but no ledger row found; not refunded`,
        { slikairPayoutId: String(payout._id) },
      );
      return { refunded: false, reason: 'duplicate_without_row' };
    }
    await SlikairPayout.updateOne(
      { _id: payout._id, refundTransactionId: null },
      { $set: { refundTransactionId: existing._id, refundedAt: existing.createdAt || new Date(), status: 'failed' } },
    );
    return { refunded: false, reason: 'already_refunded' };
  } finally {
    await session.endSession();
  }
}

/**
 * The provider confirmed a payout as paid after its amount was refunded: the
 * player has the money twice. Flag it loudly for manual reconciliation.
 */
export async function flagRefundConflict(payout, details = {}) {
  const note = 'Provider reported the payout as succeeded after it was refunded';
  await SlikairPayout.updateOne({ _id: payout._id }, {
    $set: {
      providerStatus: 'succeeded',
      needsReconciliation: true,
      reconciliationNote: note,
      'metadata.refundConflict': { ...details, detectedAt: new Date() },
    },
  });
  errorLogger.critical(
    'slikair_payout_refund_conflict',
    `payoutId=${payout.payoutId}: ${note}; manual reconciliation required`,
    { payoutId: payout.payoutId, slikairPayoutId: String(payout._id), amount: payout.amount },
  );
  await logAuditEvent({
    actorType: 'system',
    actorUsername: 'system',
    action: 'PAYOUT_REFUND_CONFLICT',
    category: 'finance',
    targetType: 'transaction',
    targetId: payout.refundTransactionId ? String(payout.refundTransactionId) : null,
    before: null,
    after: { status: payout.status, providerStatus: 'succeeded', needsReconciliation: true },
    reason: note,
    metadata: {
      slikairPayoutId: String(payout._id),
      payoutId: payout.payoutId,
      userId: String(payout.userId),
      amount: payout.amount,
      currency: payout.currency,
    },
  }).catch((e) => errorLogger.critical('slikair_payout_refund_conflict_audit', e.message, { payoutId: payout.payoutId }));
}
