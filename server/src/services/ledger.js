/**
 * Financial Ledger Service (Phase 2A)
 *
 * Provides atomic transaction creation with idempotency protection,
 * transaction history, and balance consistency validation.
 */
import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import { getActiveCurrency } from '../currency/index.js';

/**
 * Create a transaction with idempotency protection.
 * If idempotencyKey is provided and already exists, returns the existing transaction.
 * Otherwise creates a new transaction atomically.
 *
 * @param {Object} data - Transaction data
 * @param {Object} options - Options including session
 * @returns {Object} Created or existing transaction
 */
export async function createTransaction(data, options = {}) {
  const { session = null } = options;
  const {
    userId,
    type,
    amount,
    balanceBefore,
    balanceAfter,
    referenceId = null,
    cryptoDepositId = null,
    status = 'completed',
    note = '',
    createdBy = null,
    idempotencyKey = null,
    source = 'system',
    metadata = {},
    relatedTransactionId = null,
    walletId = 'main',
  } = data;

  // Check idempotency if key provided
  if (idempotencyKey) {
    const existing = await Transaction.findOne({ idempotencyKey }).session(session);
    if (existing) {
      return { transaction: existing, idempotent: true };
    }
  }

  // Get active currency
  const currency = await getActiveCurrency();

  // Create transaction
  const transaction = await Transaction.create([{
    userId,
    type,
    amount,
    balanceBefore,
    balanceAfter,
    referenceId,
    cryptoDepositId,
    status,
    note,
    createdBy,
    idempotencyKey,
    currency: currency.code,
    source,
    metadata,
    relatedTransactionId,
    walletId,
  }], { session });

  if (type === 'deposit' || type === 'withdraw') {
    try {
      const { logActivity } = await import('./activityFeed.js');
      logActivity({
        type,
        userId,
        status,
        summary: `${type === 'deposit' ? 'Yatırma' : 'Çekim'}: ${Math.abs(amount)} ${currency.code}`,
        amount: Math.abs(amount),
        currency: currency.code,
        referenceId: transaction[0]._id,
        referenceModel: 'Transaction',
      }).catch(() => {}); // logActivity zaten kendi içinde hatayı yutuyor, bu ekstra güvenlik
    } catch (e) {
      console.error('ledger activity log failed:', e);
    }
  }

  return { transaction: transaction[0], idempotent: false };
}

export async function emitDepositRisk(playerId, amount, metadata = {}) {
  try {
    const { onDeposit } = await import('./riskDetector.js');
    await onDeposit(playerId, { amount, ...metadata });
  } catch {}
}

export async function emitWithdrawalRisk(playerId, amount, metadata = {}) {
  try {
    const { onWithdrawal } = await import('./riskDetector.js');
    await onWithdrawal(playerId, { amount, ...metadata });
  } catch {}
}

/**
 * Create a reversal transaction linked to the original.
 *
 * @param {String} originalTransactionId - Original transaction ID
 * @param {String} reason - Reversal reason
 * @param {Object} options - Options including session
 * @returns {Object} Reversal transaction
 */
export async function createReversal(originalTransactionId, reason, options = {}) {
  const { session = null } = options;

  const original = await Transaction.findById(originalTransactionId).session(session);
  if (!original) throw new Error('Original transaction not found');
  if (original.type === 'reversal') throw new Error('Cannot reverse a reversal');

  // Get user's current balance
  const user = await User.findById(original.userId).session(session);
  if (!user) throw new Error('User not found');

  // Calculate reversal amount (opposite of original)
  const reversalAmount = -original.amount;
  const balanceBefore = user.balance;
  const balanceAfter = parseFloat((user.balance + reversalAmount).toFixed(2));

  // Update user balance
  user.balance = balanceAfter;
  await user.save({ session });

  // Create reversal transaction
  const { transaction: reversal } = await createTransaction({
    userId: original.userId,
    type: 'reversal',
    amount: reversalAmount,
    balanceBefore,
    balanceAfter,
    referenceId: original.referenceId,
    status: 'completed',
    note: `Reversal for ${original.type}: ${reason}`,
    createdBy: null,
    source: 'system',
    metadata: { originalTransactionId, reason },
    relatedTransactionId: original._id,
    walletId: original.walletId,
  }, { session });

  return reversal;
}

/**
 * Get transaction history for a user with pagination and filtering.
 *
 * @param {String} userId - User ID
 * @param {Object} filters - Filter options
 * @returns {Object} Paginated transactions
 */
export async function getTransactionHistory(userId, filters = {}) {
  const {
    page = 1,
    limit = 20,
    type = null,
    status = null,
    startDate = null,
    endDate = null,
    currency = null,
    walletId = null,
  } = filters;

  const skip = (Number(page) - 1) * Number(limit);
  const query = { userId };

  if (type) query.type = type;
  if (status) query.status = status;
  if (currency) query.currency = currency;
  if (walletId) query.walletId = walletId;
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const [transactions, total] = await Promise.all([
    Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Transaction.countDocuments(query),
  ]);

  return {
    transactions,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
  };
}

/**
 * Get a single transaction by ID.
 *
 * @param {String} transactionId - Transaction ID
 * @returns {Object|null} Transaction or null
 */
export async function getTransactionById(transactionId) {
  return Transaction.findById(transactionId);
}

/**
 * Validate balance consistency for a user.
 * Checks if the sum of all transactions matches the current balance.
 *
 * @param {String} userId - User ID
 * @returns {Object} Validation result
 */
export async function validateBalanceConsistency(userId) {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  // Get all completed transactions
  const transactions = await Transaction.find({
    userId,
    status: 'completed',
  }).sort({ createdAt: 1 });

  // Calculate expected balance from transactions
  let expectedBalance = 0;
  for (const tx of transactions) {
    expectedBalance += tx.amount;
  }
  expectedBalance = parseFloat(expectedBalance.toFixed(2));

  // Compare with actual balance
  const isConsistent = Math.abs(user.balance - expectedBalance) < 0.01;

  return {
    userId,
    actualBalance: user.balance,
    expectedBalance,
    isConsistent,
    transactionCount: transactions.length,
    lastTransactionAt: transactions.length > 0 ? transactions[transactions.length - 1].createdAt : null,
  };
}

/**
 * Get transaction statistics for a user.
 *
 * @param {String} userId - User ID
 * @param {Object} filters - Filter options
 * @returns {Object} Transaction statistics
 */
export async function getTransactionStats(userId, filters = {}) {
  const { startDate = null, endDate = null, currency = null } = filters;

  const match = { userId, status: 'completed' };
  if (currency) match.currency = currency;
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }

  const stats = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        avgAmount: { $avg: '$amount' },
      },
    },
    { $sort: { totalAmount: -1 } },
  ]);

  return stats;
}

/**
 * Get daily transaction summary.
 *
 * @param {String} userId - User ID
 * @param {Number} days - Number of days to look back
 * @returns {Object} Daily summary
 */
export async function getDailySummary(userId, days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const summary = await Transaction.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        status: 'completed',
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          type: '$type',
        },
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
      },
    },
    { $sort: { '_id.date': 1, '_id.type': 1 } },
  ]);

  return summary;
}
