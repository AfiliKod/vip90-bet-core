import User from '../models/User.js';
import ReferralTree from '../models/ReferralTree.js';
import ReferralCommission from '../models/ReferralCommission.js';
import Transaction from '../models/Transaction.js';
import { getIO } from './socketEmitter.js';
import { createTransaction } from './ledger.js';

export const COMMISSION_RATES = {
  1: 10, // 10% for direct referrals
  2: 5,  // 5% for level 2
  3: 2,  // 2% for level 3
};

/**
 * Build or update referral tree when a new user registers with a referrer
 */
export async function buildReferralTree(newUserId, referrerId, options = {}) {
  const { session = null } = options;

  // Get or create referrer's tree
  let referrerTree = await ReferralTree.findOne({ userId: referrerId }).session(session);
  if (!referrerTree) {
    referrerTree = await ReferralTree.create([{
      userId: referrerId,
      level1: [],
      level2: [],
      level3: [],
    }], { session });
    referrerTree = referrerTree[0];
  }

  // Add to level 1
  if (!referrerTree.level1.some(id => id.equals(newUserId))) {
    referrerTree.level1.push(newUserId);
    referrerTree.totalDirectReferrals = referrerTree.level1.length;
  }

  // Find referrer's referrer (level 2)
  const referrer = await User.findById(referrerId).select('referredBy').session(session);
  if (referrer?.referredBy) {
    let level2Tree = await ReferralTree.findOne({ userId: referrer.referredBy }).session(session);
    if (!level2Tree) {
      level2Tree = await ReferralTree.create([{
        userId: referrer.referredBy,
        level1: [],
        level2: [],
        level3: [],
      }], { session });
      level2Tree = level2Tree[0];
    }
    if (!level2Tree.level2.some(id => id.equals(newUserId))) {
      level2Tree.level2.push(newUserId);
      level2Tree.totalLevel2Referrals = level2Tree.level2.length;
    }

    // Find level 2's referrer (level 3)
    const level2Referrer = await User.findById(referrer.referredBy).select('referredBy').session(session);
    if (level2Referrer?.referredBy) {
      let level3Tree = await ReferralTree.findOne({ userId: level2Referrer.referredBy }).session(session);
      if (!level3Tree) {
        level3Tree = await ReferralTree.create([{
          userId: level2Referrer.referredBy,
          level1: [],
          level2: [],
          level3: [],
        }], { session });
        level3Tree = level3Tree[0];
      }
      if (!level3Tree.level3.some(id => id.equals(newUserId))) {
        level3Tree.level3.push(newUserId);
        level3Tree.totalLevel3Referrals = level3Tree.level3.length;
      }
      await level3Tree.save({ session });
    }
    await level2Tree.save({ session });
  }

  await referrerTree.save({ session });

  // Create new user's empty tree (only if doesn't exist)
  const existingTree = await ReferralTree.findOne({ userId: newUserId }).session(session);
  if (!existingTree) {
    await ReferralTree.create([{
      userId: newUserId,
      level1: [],
      level2: [],
      level3: [],
    }], { session });
  }

  return referrerTree;
}

/**
 * Create pending commission records for all 3 levels when house profit occurs
 */
export async function createPendingCommissions(bettorId, houseProfit, source, sourceId, options = {}) {
  const { session = null } = options;

  if (!houseProfit || houseProfit <= 0) return [];

  const bettor = await User.findById(bettorId).select('referredBy').session(session);
  if (!bettor?.referredBy) return [];

  const commissions = [];

  // Level 1 - direct referrer
  const level1Referrer = bettor.referredBy;
  const commission1 = parseFloat((houseProfit * (COMMISSION_RATES[1] / 100)).toFixed(2));
  if (commission1 > 0) {
    const rc = await ReferralCommission.create([{
      referrerId: level1Referrer,
      bettorId,
      level: 1,
      houseProfit,
      commissionAmount: commission1,
      commissionRate: COMMISSION_RATES[1],
      status: 'pending',
      source,
      sourceId,
    }], { session });
    commissions.push(rc[0]);
  }

  // Level 2 - referrer's referrer
  const level1User = await User.findById(level1Referrer).select('referredBy').session(session);
  if (level1User?.referredBy) {
    const commission2 = parseFloat((houseProfit * (COMMISSION_RATES[2] / 100)).toFixed(2));
    if (commission2 > 0) {
      const rc = await ReferralCommission.create([{
        referrerId: level1User.referredBy,
        bettorId,
        level: 2,
        houseProfit,
        commissionAmount: commission2,
        commissionRate: COMMISSION_RATES[2],
        status: 'pending',
        source,
        sourceId,
      }], { session });
      commissions.push(rc[0]);
    }

    // Level 3 - level 2's referrer
    const level2User = await User.findById(level1User.referredBy).select('referredBy').session(session);
    if (level2User?.referredBy) {
      const commission3 = parseFloat((houseProfit * (COMMISSION_RATES[3] / 100)).toFixed(2));
      if (commission3 > 0) {
        const rc = await ReferralCommission.create([{
          referrerId: level2User.referredBy,
          bettorId,
          level: 3,
          houseProfit,
          commissionAmount: commission3,
          commissionRate: COMMISSION_RATES[3],
          status: 'pending',
          source,
          sourceId,
        }], { session });
        commissions.push(rc[0]);
      }
    }
  }

  return commissions;
}

/**
 * Approve a pending commission (admin action)
 */
export async function approveCommission(commissionId, adminId, options = {}) {
  const { session = null } = options;

  const commission = await ReferralCommission.findById(commissionId).session(session);
  if (!commission) throw new Error('Commission not found');
  if (commission.status !== 'pending') throw new Error('Commission already processed');

  const referrer = await User.findById(commission.referrerId).session(session);
  if (!referrer) throw new Error('Referrer not found');

  const balanceBefore = referrer.balance;
  referrer.balance = parseFloat((referrer.balance + commission.commissionAmount).toFixed(2));
  referrer.totalReferralEarnings = parseFloat((referrer.totalReferralEarnings + commission.commissionAmount).toFixed(2));
  await referrer.save({ session });

  const { transaction } = await createTransaction({
    userId: referrer._id,
    type: 'referral_commission',
    amount: commission.commissionAmount,
    balanceBefore,
    balanceAfter: referrer.balance,
    note: `Referans komisyonu (Seviye ${commission.level}) - ${commission.source}`,
    referenceId: commission._id,
    createdBy: adminId,
    idempotencyKey: `referral_approve_${commission._id}`,
    source: 'admin',
  }, { session });

  commission.status = 'approved';
  commission.approvedBy = adminId;
  commission.approvedAt = new Date();
  commission.transactionId = transaction._id;
  await commission.save({ session });

  // Real-time balance update
  const io = getIO();
  if (io) io.to(`user:${referrer._id}`).emit('balance:update', { balance: referrer.balance });

  return { commission, transaction };
}

/**
 * Reject a pending commission (admin action)
 */
export async function rejectCommission(commissionId, adminId, reason, options = {}) {
  const { session = null } = options;

  const commission = await ReferralCommission.findById(commissionId).session(session);
  if (!commission) throw new Error('Commission not found');
  if (commission.status !== 'pending') throw new Error('Commission already processed');

  commission.status = 'rejected';
  commission.rejectedBy = adminId;
  commission.rejectedAt = new Date();
  commission.rejectionReason = reason;
  await commission.save({ session });

  return commission;
}

/**
 * Get referral tree for a user (for admin panel tree view)
 */
export async function getReferralTree(userId) {
  const tree = await ReferralTree.findOne({ userId })
    .populate('level1', 'username balance createdAt')
    .populate('level2', 'username balance createdAt')
    .populate('level3', 'username balance createdAt');

  if (!tree) return null;

  return {
    userId: tree.userId,
    level1: tree.level1,
    level2: tree.level2,
    level3: tree.level3,
    totalDirectReferrals: tree.totalDirectReferrals,
    totalLevel2Referrals: tree.totalLevel2Referrals,
    totalLevel3Referrals: tree.totalLevel3Referrals,
    commissionRates: tree.commissionRates,
  };
}

/**
 * Get pending commissions for a user (or all if admin)
 */
export async function getPendingCommissions(referrerId = null, options = {}) {
  const { status = 'pending', page = 1, limit = 20 } = options;
  const skip = (Number(page) - 1) * Number(limit);

  const filter = { status };
  if (referrerId) filter.referrerId = referrerId;

  const [commissions, total] = await Promise.all([
    ReferralCommission.find(filter)
      .populate('referrerId', 'username')
      .populate('bettorId', 'username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    ReferralCommission.countDocuments(filter),
  ]);

  return { commissions, total, page: Number(page), pages: Math.ceil(total / Number(limit)) };
}

/**
 * Get commission stats for a user
 */
export async function getCommissionStats(userId) {
  const [pending, approved, rejected] = await Promise.all([
    ReferralCommission.aggregate([
      { $match: { referrerId: userId, status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$commissionAmount' }, count: { $sum: 1 } } },
    ]),
    ReferralCommission.aggregate([
      { $match: { referrerId: userId, status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$commissionAmount' }, count: { $sum: 1 } } },
    ]),
    ReferralCommission.aggregate([
      { $match: { referrerId: userId, status: 'rejected' } },
      { $group: { _id: null, total: { $sum: '$commissionAmount' }, count: { $sum: 1 } } },
    ]),
  ]);

  // Breakdown by level
  const byLevel = await ReferralCommission.aggregate([
    { $match: { referrerId: userId, status: 'approved' } },
    { $group: { _id: '$level', total: { $sum: '$commissionAmount' }, count: { $sum: 1 } } },
  ]);

  return {
    pending: pending[0] || { total: 0, count: 0 },
    approved: approved[0] || { total: 0, count: 0 },
    rejected: rejected[0] || { total: 0, count: 0 },
    byLevel,
  };
}

/**
 * Update commission rates for a user (admin)
 */
export async function updateCommissionRates(userId, rates) {
  const tree = await ReferralTree.findOneAndUpdate(
    { userId },
    { commissionRates: rates },
    { new: true, runValidators: true }
  );
  return tree;
}

/**
 * Detect potential fraud: same IP, same device, circular referrals
 */
export async function detectFraud(newUserId, referrerId, options = {}) {
  const { session = null, ip = null, deviceFingerprint = null } = options;
  const issues = [];

  // Check for circular referral (A refers B, B refers A)
  const referrer = await User.findById(referrerId).select('referredBy').session(session);
  let current = referrer;
  let depth = 0;
  while (current?.referredBy && depth < 10) {
    if (current.referredBy.equals(newUserId)) {
      issues.push('CIRCULAR_REFERRAL');
      break;
    }
    current = await User.findById(current.referredBy).select('referredBy').session(session);
    depth++;
  }

  // Check IP collision (if provided)
  if (ip) {
    const sameIpUsers = await User.find({ 
      _id: { $ne: newUserId },
      lastLoginIp: ip 
    }).select('_id').session(session);
    if (sameIpUsers.length > 0) {
      issues.push('SAME_IP');
    }
  }

  // Check device fingerprint collision (if provided)
  if (deviceFingerprint) {
    // Would need a device tracking model - placeholder for future
  }

  return { hasIssues: issues.length > 0, issues };
}