import Transaction from '../models/Transaction.js';
import SlikairPayment from '../models/SlikairPayment.js';
import { adjustBalance, createTransaction } from './ledger.js';

/**
 * Reverse a previously credited PSP deposit in the caller's transaction.
 * The conditional payment claim and its ledger row share the transaction, so
 * concurrent callbacks cannot debit the player twice.
 */
export async function reverseCreditedDeposit({ payment, kind, amount, currency, session }) {
  const claimed = await SlikairPayment.findOneAndUpdate(
    { _id: payment._id, reversalTransactionId: null },
    { $set: { status: kind === 'chargeback' ? 'chargeback' : 'refunded', reversalType: kind, reversedAt: new Date() } },
    { new: true, session },
  );
  if (!claimed) return { reversed: false };

  const original = await Transaction.findOne({
    referenceId: payment._id,
    type: 'deposit',
    status: 'completed',
  }).session(session);
  if (!original) throw new Error(`Credited Slikair payment ${payment._id} has no deposit transaction`);

  const adjusted = await adjustBalance(payment.userId, -Number(amount), { session });
  if (!adjusted) throw new Error('User not found');

  const type = kind === 'chargeback' ? 'chargeback' : 'deposit_refund';
  const { transaction } = await createTransaction({
    userId: payment.userId,
    type,
    amount: -Number(amount),
    balanceBefore: adjusted.balanceBefore,
    balanceAfter: adjusted.balanceAfter,
    referenceId: payment._id,
    relatedTransactionId: original._id,
    status: 'completed',
    note: `Slikair ${kind === 'chargeback' ? 'chargeback' : 'iade'} (${payment.paymentMethod})`,
    idempotencyKey: `slikair_${kind}_${payment.tenantId || 'single'}_${payment.payinId}`,
    currency,
    source: 'provider',
    metadata: { payinId: payment.payinId, paymentMethod: payment.paymentMethod },
  }, { session });

  await SlikairPayment.updateOne(
    { _id: payment._id, reversalTransactionId: null },
    { $set: { reversalTransactionId: transaction._id } },
    { session },
  );
  return { reversed: true, transaction };
}

/**
 * Industry practice for a confirmed chargeback: the account goes to manual
 * review whatever the configured risk rules say. A HIGH finding is recorded and
 * the risk status is raised to REVIEW (a stricter status is kept).
 */
export async function flagChargebackForReview({ playerId, payinId, amount, currency }) {
  const { default: RiskFinding, FINDING_SEVERITY } = await import('../models/RiskFinding.js');
  const { default: RiskProfile, RISK_STATUS } = await import('../models/RiskProfile.js');
  await RiskFinding.create({
    playerId,
    code: 'PSP_CHARGEBACK',
    category: 'payment',
    severity: FINDING_SEVERITY.HIGH,
    sourceEvent: 'chargeback',
    description: `PSP chargeback confirmed for payin ${payinId}: ${amount} ${currency}`,
  });
  await RiskProfile.findOneAndUpdate(
    { playerId },
    { $setOnInsert: { playerId } },
    { upsert: true, new: true },
  );
  await RiskProfile.updateOne(
    { playerId, riskStatus: RISK_STATUS.CLEAR },
    { $set: { riskStatus: RISK_STATUS.REVIEW } },
  );
}
