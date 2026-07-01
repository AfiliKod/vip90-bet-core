import BonusWagering from '../models/BonusWagering.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';

const DEFAULT_WEIGHTS = {
  sports: 1.0,
  casino_slot: 0.5,
  casino_live: 0.7,
  inhouse: 0.5,
};

export function getWeight(gameType, customWeights = null) {
  const weights = { ...DEFAULT_WEIGHTS, ...(customWeights || {}) };
  return weights[gameType] ?? 0.5;
}

/**
 * Bir bahis için aktif bonus wagering'lerine credit ekler.
 * gameType: 'sports' | 'casino_slot' | 'casino_live' | 'inhouse'
 * amount: bahis miktarı (₺)
 * customWeights: opsiyonel per-bonus weights override
 *
 * @returns {Array} tamamlanan wagering'ler
 */
export async function recordWagering(userId, gameType, amount, extra = {}) {
  if (!amount || amount <= 0) return [];

  const activeWagerings = await BonusWagering.find({
    userId,
    status: 'active',
  });

  const completed = [];

  for (const w of activeWagerings) {
    if (w.deadline && w.deadline < new Date()) {
      w.status = 'expired';
      await w.save();
      continue;
    }

    const weight = getWeight(gameType, w.gameWeights);
    const credit = amount * weight;

    const before = w.wageringProgress;
    w.wageringProgress = Math.min(w.wageringRequired, w.wageringProgress + credit);
    await w.save();

    if (w.wageringProgress >= w.wageringRequired && before < w.wageringRequired) {
      w.status = 'completed';
      w.completedAt = new Date();
      await w.save();
      completed.push(w);
    }
  }

  return completed;
}

/**
 * Bonus'u cash'e çevirir (manuel onay sonrası).
 * Sadece 'completed' statüsündeki bonuslar çevrilebilir.
 *
 * @returns {Object} { convertedAmount, newBalance } | null
 */
export async function convertBonus(wageringId, userId) {
  const wagering = await BonusWagering.findOne({
    _id: wageringId,
    userId,
    status: 'completed',
  });

  if (!wagering) return null;

  const user = await User.findById(userId);
  if (!user) return null;

  const balanceBefore = user.balance;
  user.balance = parseFloat((user.balance + wagering.bonusAmount).toFixed(2));
  await user.save();

  wagering.status = 'converted';
  wagering.convertedAt = new Date();
  wagering.convertedAmount = wagering.bonusAmount;
  await wagering.save();

  await Transaction.create({
    userId,
    type: 'bonus_conversion',
    amount: wagering.bonusAmount,
    balanceBefore,
    balanceAfter: user.balance,
    referenceId: wagering._id,
    note: `Bonus çevrimi: ${wagering.description || wagering.source}`,
  });

  return {
    convertedAmount: wagering.bonusAmount,
    newBalance: user.balance,
    wagering,
  };
}

/**
 * Kullanıcının aktif wagering'lerini getirir.
 */
export async function getActiveWagerings(userId) {
  return await BonusWagering.find({
    userId,
    status: 'active',
  }).sort({ createdAt: -1 });
}

/**
 * Kullanıcının tamamlanmış (henüz çevrilmemiş) wagering'lerini getirir.
 */
export async function getConvertibleWagerings(userId) {
  return await BonusWagering.find({
    userId,
    status: 'completed',
  }).sort({ completedAt: -1 });
}

/**
 * Aktif wagering varsa bonus'u forfeit eder (çekim talebi için).
 * Tüm aktif wagering'lerin bonusBalance'ını user.balance'dan düşer.
 *
 * @returns {Array} forfeit edilen wagering'ler
 */
export async function forfeitActiveWagerings(userId) {
  const active = await BonusWagering.find({
    userId,
    status: 'active',
  });

  const forfeited = [];
  let totalForfeitedAmount = 0;

  for (const w of active) {
    const remaining = w.wageringRequired - w.wageringProgress;
    const forfeitRatio = remaining / w.wageringRequired;
    const forfeitAmount = parseFloat((w.bonusAmount * forfeitRatio).toFixed(2));
    totalForfeitedAmount += forfeitAmount;

    w.status = 'forfeited';
    await w.save();
    forfeited.push({ wagering: w, forfeitAmount });
  }

  return { items: forfeited, totalForfeitedAmount };
}

export { DEFAULT_WEIGHTS };