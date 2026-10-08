import crypto from 'crypto';
import BonusWagering from '../models/BonusWagering.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import mongoose from 'mongoose';
import { createTransaction } from './ledger.js';
import { withTransactionRetry } from '../utils/transactionRetry.js';

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
      // Süresi dolmuş: kilidi açmak yerine çevrilmemiş payı geri al (bkz. expireWagering).
      await expireWagering(w);
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
    // SECURITY FIX (C6): Use atomic $inc instead of read-modify-write
    const balanceBefore = (await User.findById(userId)).balance;
    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: { balance: -totalForfeitedAmount } },
      { new: true }
    );

    // SECURITY FIX (C5): Use UUID instead of Date.now() for idempotency key
    const idempotencyKey = `forfeit_${userId}_${crypto.randomUUID()}`;

    await createTransaction({
      userId,
      type: 'bonus_forfeit',
      amount: -(balanceBefore - user.balance),
      balanceBefore,
      balanceAfter: user.balance,
      idempotencyKey,
      source: 'system',
      metadata: { forfeitedWagerings: forfeited.length, totalForfeitedAmount },
    });
  }

  return { items: forfeited, totalForfeitedAmount };
}

/**
 * Kullanıcının aktif (henüz wagering'i tamamlanmamış) bonuslarının toplamı.
 * Bu tutar user.balance içinde yer alır ama çekilemez (bkz. getSpendableBreakdown).
 */
export async function getLockedAmount(userId) {
  // Süresi dolmuş ama henüz işlenmemiş çevrimleri önce işle — aksi halde
  // çekim kapısı bunları hâlâ "kilitli" sayar ama periyodik iş/sonraki bahis
  // işlediği an kilit, çevrilmemiş pay geri alınarak kalkar.
  await expireOverdueWagerings({ userId });
  const active = await BonusWagering.find({ userId, status: 'active' }).select('bonusAmount');
  const total = active.reduce((sum, w) => sum + w.bonusAmount, 0);
  return parseFloat(total.toFixed(2));
}

/**
 * Kullanıcının balance/locked/withdrawable dökümü.
 * withdrawable = balance - locked (asla negatif değil).
 */
export async function getSpendableBreakdown(userId) {
  // Süre dolumunu bakiyeyi OKUMADAN önce işle — aksi halde geri alınan pay
  // düşülmeden önceki bakiyeyle çekilebilir tutar hesaplanır.
  await expireOverdueWagerings({ userId });
  const user = await User.findById(userId);
  if (!user) return { balance: 0, locked: 0, withdrawable: 0 };
  const locked = await getLockedAmount(userId);
  const withdrawable = Math.max(0, parseFloat((user.balance - locked).toFixed(2)));
  return { balance: user.balance, locked, withdrawable };
}

/**
 * Süresi dolan bir çevrimi sonlandırır.
 *
 * Eski davranış (2026-10-03'e kadar): `status: 'expired'` yapılıyor ve hiçbir
 * şey bakiyeden düşülmüyordu. `getLockedAmount()` yalnızca `active` kayıtları
 * saydığı için süresi dolan bonus, çevrim şartı tamamlanmadan TAMAMEN
 * çekilebilir hale geliyordu. Artık süre dolumu, oyuncunun bonusu iptal
 * etmesiyle (forfeitActiveWagerings) aynı kuralı uygular: çevrilmemiş pay
 * (`bonusAmount × kalan/gerekli`) bakiyeden geri alınır; çevrilmiş pay
 * oyuncuda kalır. Bakiye bu tutarın altına düşmüşse (bonus oynanıp
 * kaybedilmişse) yalnızca kalan bakiye alınır — bakiye asla negatife inmez.
 *
 * Eşzamanlılık: kayıt önce koşullu `findOneAndUpdate` ile `active → expired`
 * çekilir; iki süreç aynı kaydı yakalayamaz, bakiye bir kez düşer. Ledger
 * kaydı `bonus_expire_<wageringId>` anahtarıyla idempotent.
 *
 * @returns {number} bakiyeden fiilen düşülen tutar
 */
export async function expireWagering(w, now = new Date()) {
  // Durum geçişi + bakiye düşümü + ledger kaydı tek transaction'da: biri
  // başarısız olursa kayıt `active` (kilitli) kalır, kilit asla "bedavaya" açılmaz.
  const session = await mongoose.startSession();
  let outcome;
  try {
    outcome = await withTransactionRetry(session, async () => {
      const claimed = await BonusWagering.findOneAndUpdate(
        { _id: w._id, status: 'active', deadline: { $ne: null, $lt: now } },
        { $set: { status: 'expired' } },
        { new: true, session },
      );
      if (!claimed) return null;

      const forfeitAmount = computeForfeitAmount(claimed);
      let deducted = 0;
      let balanceAfter = null;
      if (forfeitAmount > 0) {
        const before = await User.findOneAndUpdate(
          { _id: claimed.userId },
          [{ $set: { balance: { $max: [0, { $round: [{ $subtract: ['$balance', forfeitAmount] }, 2] }] } } }],
          { new: false, session },
        );
        if (before) {
          const balanceBefore = before.balance;
          balanceAfter = Math.max(0, parseFloat((balanceBefore - forfeitAmount).toFixed(2)));
          deducted = parseFloat((balanceBefore - balanceAfter).toFixed(2));
          if (deducted > 0) {
            await createTransaction({
              userId: claimed.userId,
              type: 'bonus_forfeit',
              amount: -deducted,
              balanceBefore,
              balanceAfter,
              note: 'Bonus süresi doldu — çevrilmemiş pay geri alındı',
              idempotencyKey: `bonus_expire_${claimed._id}`,
              source: 'system',
              metadata: { reason: 'expired', wageringId: claimed._id, forfeitAmount, deducted },
            }, { session });
          }
        }
      }
      return { userId: claimed.userId, deducted, balanceAfter };
    });
  } finally {
    session.endSession();
  }
  if (!outcome) return 0;
  const { deducted, balanceAfter } = outcome;
  const claimed = { userId: outcome.userId };
  if (deducted > 0) {
    try {
      const { getIO } = await import('./socketEmitter.js');
      const io = getIO();
      if (io) io.to(`user:${claimed.userId}`).emit('balance:update', { balance: balanceAfter });
    } catch { /* soket yayını kritik değil */ }
  }

  // bonusBalance yalnızca gösterge (mirror) — aktif kalan çevrimlerin toplamı.
  const remaining = await BonusWagering.find({ userId: claimed.userId, status: 'active' }).select('bonusAmount');
  const locked = parseFloat(remaining.reduce((sum, r) => sum + r.bonusAmount, 0).toFixed(2));
  await User.updateOne({ _id: claimed.userId }, { $set: { bonusBalance: locked } });

  return deducted;
}

/**
 * Süresi dolmuş tüm aktif çevrimleri işler (userId verilirse yalnızca o oyuncu).
 * Periyodik iş (jobs/bonusExpiry.js) ve kilit hesabı tarafından çağrılır.
 * @returns {{ processed: number, deducted: number }}
 */
export async function expireOverdueWagerings({ userId = null, now = new Date(), limit = 500 } = {}) {
  const filter = { status: 'active', deadline: { $ne: null, $lt: now } };
  if (userId) filter.userId = userId;
  const overdue = await BonusWagering.find(filter).sort({ deadline: 1 }).limit(limit);
  let processed = 0;
  let deducted = 0;
  for (const w of overdue) {
    const d = await expireWagering(w, now);
    processed += 1;
    deducted += d;
  }
  return { processed, deducted: parseFloat(deducted.toFixed(2)) };
}

export { DEFAULT_WEIGHTS };