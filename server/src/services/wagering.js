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
 * amount: bahis miktarı (aktif para birimi cinsinden)
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
 * Bonus wagering'i 'converted' statüsüne geçirir (manuel onay sonrası).
 * Model B (Kilitli Bakiye): bonus tutarı grant anında zaten user.balance'a
 * eklenmişti (bkz. promotions.js claim, admin.js updateBalance). Bu fonksiyon
 * balance'a TEKRAR eklemez — yalnızca kilidi kaldırır (status artık 'active'
 * olmadığı için getLockedAmount toplamından çıkar).
 * Sadece 'completed' statüsündeki bonuslar çevrilebilir.
 *
 * @returns {Object} { convertedAmount, newBalance, wagering } | null
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

  wagering.status = 'converted';
  wagering.convertedAt = new Date();
  wagering.convertedAmount = wagering.bonusAmount;
  await wagering.save();

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
 * Bir wagering için forfeit edilecek tutarı hesaplar (state değiştirmez).
 * forfeitActiveWagerings ve previewForfeitAmount tarafından paylaşılır (DRY).
 */
function computeForfeitAmount(w) {
  const forfeitRatio = w.wageringRequired > 0
    ? (w.wageringRequired - w.wageringProgress) / w.wageringRequired
    : 0;
  return parseFloat((w.bonusAmount * forfeitRatio).toFixed(2));
}

/**
 * forfeitActiveWagerings'in ne kadar tutar feda edeceğini, hiçbir şeyi
 * değiştirmeden (salt-okunur) hesaplar. Withdraw akışının forfeit'e girmeden
 * önce "bu işe yarayacak mı" diye önceden doğrulaması içindir — bkz. #17
 * final review Finding 1: forfeit geri dönüşsüz olduğu için, işe yaramayacaksa
 * hiç tetiklenmemeli.
 *
 * @returns {number} toplam feda edilecek tutar (aktif para birimi cinsinden)
 */
export async function previewForfeitAmount(userId) {
  const active = await BonusWagering.find({
    userId,
    status: 'active',
  });

  let totalForfeitedAmount = 0;
  for (const w of active) {
    totalForfeitedAmount += computeForfeitAmount(w);
  }
  return parseFloat(totalForfeitedAmount.toFixed(2));
}

/**
 * Aktif wagering varsa bonus'u forfeit eder (çekim talebi için).
 * Model B (Kilitli Bakiye): bonus tutarı zaten user.balance içinde olduğu
 * için forfeit artık balance'ı GERÇEKTEN düşürür (önceki modelde bonus ayrı
 * bir havuzdaydı, forfeit yalnızca "vaadi" iptal ediyordu). Kalan wagering
 * oranına göre kısmi forfeit (tamamlanan kısım feda edilmez).
 *
 * UYARI: Bu fonksiyon geri dönüşsüzdür ve mongoose session almaz (kendi
 * ayrı commit'leriyle yazar). Çağıran taraf (withdraw akışları) bunu
 * çağırmadan ÖNCE previewForfeitAmount ile "işe yarayacak mı" diye
 * doğrulamalıdır — aksi halde başarısız bir çekim, hiçbir faydası olmadan
 * kullanıcının bonusunu yok edebilir.
 *
 * @returns {Array} forfeit edilen wagering'ler + toplam düşülen tutar
 */
export async function forfeitActiveWagerings(userId) {
  const active = await BonusWagering.find({
    userId,
    status: 'active',
  });

  if (active.length === 0) return { items: [], totalForfeitedAmount: 0 };

  const forfeited = [];
  let totalForfeitedAmount = 0;

  for (const w of active) {
    const forfeitAmount = computeForfeitAmount(w);
    totalForfeitedAmount += forfeitAmount;

    w.status = 'forfeited';
    await w.save();
    forfeited.push({ wagering: w, forfeitAmount });
  }
  totalForfeitedAmount = parseFloat(totalForfeitedAmount.toFixed(2));

  if (totalForfeitedAmount > 0) {
    const user = await User.findById(userId);
    const balanceBefore = user.balance;
    user.balance = Math.max(0, parseFloat((user.balance - totalForfeitedAmount).toFixed(2)));
    await user.save();

    await Transaction.create({
      userId,
      type: 'bonus_forfeit',
      amount: -(balanceBefore - user.balance),
      balanceBefore,
      balanceAfter: user.balance,
      note: 'Aktif bonus wagering çekim talebiyle feshedildi',
    });
  }

  return { items: forfeited, totalForfeitedAmount };
}

/**
 * Kullanıcının aktif (henüz wagering'i tamamlanmamış) bonuslarının toplamı.
 * Bu tutar user.balance içinde yer alır ama çekilemez (bkz. getSpendableBreakdown).
 */
export async function getLockedAmount(userId) {
  const active = await BonusWagering.find({ userId, status: 'active' }).select('bonusAmount');
  const total = active.reduce((sum, w) => sum + w.bonusAmount, 0);
  return parseFloat(total.toFixed(2));
}

/**
 * Kullanıcının balance/locked/withdrawable dökümü.
 * withdrawable = balance - locked (asla negatif değil).
 */
export async function getSpendableBreakdown(userId) {
  const user = await User.findById(userId);
  if (!user) return { balance: 0, locked: 0, withdrawable: 0 };
  const locked = await getLockedAmount(userId);
  const withdrawable = Math.max(0, parseFloat((user.balance - locked).toFixed(2)));
  return { balance: user.balance, locked, withdrawable };
}

export { DEFAULT_WEIGHTS };