import VipLevel from '../models/VipLevel.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { createTransaction } from './ledger.js';

/**
 * XP calculation rules:
 * - Sports bets: 1 XP per 10 currency units wagered
 * - Casino bets: 1 XP per 20 currency units wagered
 * - Minimum bet for XP: 1 currency unit
 */

export const XP_RATES = {
  sports: 0.1,   // 1 XP per 10 wagered
  casino: 0.05,  // 1 XP per 20 wagered
};

/**
 * Award XP to a user for a bet
 * @param {string} userId - User ID
 * @param {number} amount - Bet amount
 * @param {string} type - 'sports' or 'casino'
 * @param {object} options - { session }
 * @returns {object} { xpAwarded, leveledUp, newLevel, reward }
 */
export async function awardXp(userId, amount, type, options = {}) {
  const { session = null } = options;

  if (!amount || amount <= 0) return { xpAwarded: 0, leveledUp: false };

  const rate = XP_RATES[type] || 0;
  if (rate <= 0) return { xpAwarded: 0, leveledUp: false };

  const xpAwarded = Math.floor(amount * rate);
  if (xpAwarded <= 0) return { xpAwarded: 0, leveledUp: false };

  const user = await User.findById(userId).session(session);
  if (!user) return { xpAwarded: 0, leveledUp: false };

  // Update user's XP
  user.vipXp = (user.vipXp || 0) + xpAwarded;
  user.totalXpEarned = (user.totalXpEarned || 0) + xpAwarded;

  // Check for level up
  const result = await checkLevelUp(user, session);

  await user.save({ session });

  return {
    xpAwarded,
    leveledUp: result.leveledUp,
    newLevel: result.newLevel,
    reward: result.reward,
    vipXp: user.vipXp,
    vipLevel: user.vipLevel,
  };
}

/**
 * Pay cashback to a user based on their VIP level's cashbackPercent.
 * Called on every settled bet/round. Credits balance directly.
 * @param {string} userId - User ID
 * @param {number} betAmount - The stake/bet amount to calculate cashback on
 * @param {object} options - { session }
 * @returns {number} cashback amount credited (0 if none)
 */
export async function payCashback(userId, betAmount, options = {}) {
  const { session = null } = options;

  if (!betAmount || betAmount <= 0) return 0;

  const user = await User.findById(userId).select('vipLevel balance').session(session);
  if (!user) return 0;

  // If user has no VIP level assigned, try to find one
  let levelDoc = null;
  if (user.vipLevel) {
    levelDoc = await VipLevel.findById(user.vipLevel).session(session);
  }
  if (!levelDoc) {
    levelDoc = await VipLevel.findOne({
      xpRequired: { $lte: 0 },
      isActive: true,
    }).sort({ xpRequired: -1 }).session(session);
  }

  if (!levelDoc || !levelDoc.cashbackPercent || levelDoc.cashbackPercent <= 0) return 0;

  const cashback = parseFloat((betAmount * levelDoc.cashbackPercent / 100).toFixed(2));
  if (cashback <= 0) return 0;

  const balanceBefore = user.balance;
  user.balance = parseFloat((user.balance + cashback).toFixed(2));
  await user.save({ session });

  await Transaction.create([{
    userId: user._id,
    type: 'cashback',
    amount: cashback,
    balanceBefore,
    balanceAfter: user.balance,
    note: `VIP cashback (${levelDoc.name} %${levelDoc.cashbackPercent})`,
  }], { session });

  await createTransaction({
    userId: user._id,
    type: 'cashback',
    amount: cashback,
    balanceBefore,
    balanceAfter: user.balance,
    note: `VIP cashback (${levelDoc.name} %${levelDoc.cashbackPercent})`,
    idempotencyKey: `vip_cashback_${user._id}_${Date.now()}`,
    source: 'system',
  }, { session });

  const io = getIO();
  if (io) io.to(`user:${user._id}`).emit('balance:update', { balance: user.balance });

  return cashback;
}

/**
 * Check if user should level up and apply rewards
 */
async function checkLevelUp(user, session) {
  // Find the highest level user qualifies for
  const qualifiedLevel = await VipLevel.findOne({
    xpRequired: { $lte: user.vipXp },
    isActive: true,
  }).sort({ xpRequired: -1 }).session(session);

  if (!qualifiedLevel) {
    return { leveledUp: false };
  }

  const currentLevelId = user.vipLevel ? user.vipLevel.toString() : null;
  const newLevelId = qualifiedLevel._id.toString();

  // Already at this level or higher
  if (currentLevelId === newLevelId) {
    return { leveledUp: false };
  }

  // Check if we're leveling up (not down)
  let currentLevel = null;
  if (currentLevelId) {
    currentLevel = await VipLevel.findById(currentLevelId).session(session);
  }

  // If user has no level yet, assign the base level (Bronze, level 1) silently
  // Don't count initial Bronze assignment as a "level up"
  if (!currentLevelId && qualifiedLevel.level === 1) {
    user.vipLevel = qualifiedLevel._id;
    return { leveledUp: false };
  }

  if (currentLevel && qualifiedLevel.level <= currentLevel.level) {
    return { leveledUp: false };
  }

  // Level up!
  user.vipLevel = qualifiedLevel._id;

  // Apply level reward if any
  let reward = null;
  if (qualifiedLevel.rewardAmount > 0) {
    const balanceBefore = user.balance;
    const rewardAmount = qualifiedLevel.rewardAmount;

    if (qualifiedLevel.rewardType === 'balance') {
      user.balance = parseFloat((user.balance + rewardAmount).toFixed(2));
      
      await Transaction.create([{
        userId: user._id,
        type: 'bonus',
        amount: rewardAmount,
        balanceBefore,
        balanceAfter: user.balance,
        note: `VIP seviye ödülü: ${qualifiedLevel.name}`,
      }], { session });

      await createTransaction({
        userId: user._id,
        type: 'bonus',
        amount: rewardAmount,
        balanceBefore,
        balanceAfter: user.balance,
        note: `VIP seviye ödülü: ${qualifiedLevel.name}`,
        idempotencyKey: `vip_levelup_${user._id}_${qualifiedLevel._id}`,
        source: 'system',
      }, { session });
    } else if (qualifiedLevel.rewardType === 'bonus') {
      // Bonus balance would be handled by wagering system
      // For now, treat as balance with bonus type
      user.balance = parseFloat((user.balance + rewardAmount).toFixed(2));
      
      await Transaction.create([{
        userId: user._id,
        type: 'bonus',
        amount: rewardAmount,
        balanceBefore,
        balanceAfter: user.balance,
        note: `VIP seviye bonus ödülü: ${qualifiedLevel.name}`,
      }], { session });

      await createTransaction({
        userId: user._id,
        type: 'bonus',
        amount: rewardAmount,
        balanceBefore,
        balanceAfter: user.balance,
        note: `VIP seviye bonus ödülü: ${qualifiedLevel.name}`,
        idempotencyKey: `vip_levelup_${user._id}_${qualifiedLevel._id}_bonus`,
        source: 'system',
      }, { session });
    }

    reward = {
      amount: rewardAmount,
      type: qualifiedLevel.rewardType,
      levelName: qualifiedLevel.name,
    };
  }

  return {
    leveledUp: true,
    newLevel: qualifiedLevel,
    reward,
  };
}

/**
 * Get user's current VIP status with next level info
 */
export async function getVipStatus(userId) {
  const user = await User.findById(userId)
    .populate('vipLevel')
    .select('vipXp totalXpEarned vipLevel');

  if (!user) return null;

  // If user has no vipLevel assigned but qualifies for one, find it
  let currentLevel = user.vipLevel;
  if (!currentLevel) {
    currentLevel = await VipLevel.findOne({
      xpRequired: { $lte: user.vipXp },
      isActive: true,
    }).sort({ xpRequired: -1 });
    
    // If still no level (XP below minimum), get the base level
    if (!currentLevel) {
      currentLevel = await VipLevel.findOne({ isActive: true }).sort({ xpRequired: 1 });
    }
  }

  const nextLevel = await VipLevel.findOne({
    xpRequired: { $gt: user.vipXp },
    isActive: true,
  }).sort({ xpRequired: 1 });

  const currentXpRequired = currentLevel?.xpRequired || 0;
  const nextXpRequired = nextLevel?.xpRequired || currentXpRequired;
  
  const progress = nextLevel 
    ? ((user.vipXp - currentXpRequired) / (nextXpRequired - currentXpRequired)) * 100
    : 100;

  return {
    currentLevel,
    vipXp: user.vipXp,
    totalXpEarned: user.totalXpEarned,
    nextLevel,
    progressPercent: Math.min(100, Math.max(0, Math.round(progress))),
  };
}

/**
 * Initialize default VIP levels if none exist
 */
export async function initDefaultVipLevels() {
  const count = await VipLevel.countDocuments();
  if (count > 0) return;

  // icon değerleri Material Symbols glyph adı olmalı (admin panelinde
  // Faz 9'dan beri material-symbols-outlined span'i içinde render ediliyor
  // — emoji/yıldız karakteri geçersiz ligature üretip boş/kutu görünüyordu).
  const levels = [
    { level: 1, name: 'Bronze', xpRequired: 0, cashbackPercent: 0, rewardAmount: 0, color: '#cd7f32', icon: 'military_tech' },
    { level: 2, name: 'Silver', xpRequired: 1000, cashbackPercent: 2, rewardAmount: 10, rewardType: 'balance', color: '#c0c0c0', icon: 'workspace_premium' },
    { level: 3, name: 'Gold', xpRequired: 5000, cashbackPercent: 5, rewardAmount: 50, rewardType: 'balance', color: '#ffd700', icon: 'star' },
    { level: 4, name: 'Platinum', xpRequired: 20000, cashbackPercent: 8, rewardAmount: 200, rewardType: 'balance', color: '#e5e4e2', icon: 'auto_awesome' },
    { level: 5, name: 'Diamond', xpRequired: 50000, cashbackPercent: 12, rewardAmount: 500, rewardType: 'balance', color: '#b9f2ff', icon: 'diamond' },
  ];

  await VipLevel.insertMany(levels);
  return levels;
}

const LEGACY_ICON_MAP = {
  '★': 'military_tech',
  '★★': 'workspace_premium',
  '★★★': 'star',
  '★★★★': 'auto_awesome',
  '💎': 'diamond',
};
const VALID_GLYPH_RE = /^[a-z][a-z0-9_]*$/;

/**
 * Faz 9 (emoji → Material Symbols) öncesi oluşturulmuş VipLevel kayıtlarının
 * icon alanını geçerli bir glyph adına taşır — bu diff'ten önce var olan ya
 * da admin tarafından hiç dokunulmamış seviyeler eski '★'/emoji değerini
 * taşıyordu, admin panelindeki material-symbols-outlined span'i bunları
 * çizemeyip boş karakter gösteriyordu.
 */
export async function migrateLegacyVipIcons() {
  const levels = await VipLevel.find({});
  for (const level of levels) {
    if (VALID_GLYPH_RE.test(level.icon || '')) continue;
    level.icon = LEGACY_ICON_MAP[level.icon] || 'military_tech';
    await level.save();
  }
}

/**
 * Get all VIP levels (for admin panel)
 */
export async function getAllVipLevels() {
  return VipLevel.find({ isActive: true }).sort({ level: 1 });
}

/**
 * Create or update a VIP level (admin)
 */
export async function upsertVipLevel(data) {
  const { level, ...updateData } = data;
  
  const vipLevel = await VipLevel.findOneAndUpdate(
    { level },
    { level, ...updateData },
    { new: true, upsert: true, runValidators: true }
  );

  return vipLevel;
}

/**
 * Delete a VIP level (admin) - only if no users assigned
 */
export async function deleteVipLevel(level) {
  const usersWithLevel = await User.countDocuments({ vipLevel: { $exists: true } });
  // We need to check if any user has this specific level
  const vipLevelDoc = await VipLevel.findOne({ level });
  if (!vipLevelDoc) throw new Error('VIP level not found');

  const assignedUsers = await User.countDocuments({ vipLevel: vipLevelDoc._id });
  if (assignedUsers > 0) {
    throw new Error(`Cannot delete level ${level}: ${assignedUsers} users are assigned to it`);
  }

  return VipLevel.findOneAndDelete({ level });
}