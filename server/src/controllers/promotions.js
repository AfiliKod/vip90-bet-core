import mongoose from 'mongoose';
import Promotion from '../models/Promotion.js';
import User from '../models/User.js';
import BonusWagering from '../models/BonusWagering.js';
import Transaction from '../models/Transaction.js';
import { createError } from '../middleware/error.js';
import { createTransaction, adjustBalance } from '../services/ledger.js';
import { withTransactionRetry } from '../utils/transactionRetry.js';

export async function list(req, res, next) {
  try {
    const promos = await Promotion.find({ isActive:true });
    res.json({ promotions: promos });
  } catch(e) { next(e); }
}

export async function claim(req, res, next) {
  try {
    // Phase A5 — Bonus T&C zorunlu
    // SECURITY FIX (M4): Use req.validated (Zod-validated) instead of req.body
    const { acceptedBonusTerms } = req.validated;
    if (!acceptedBonusTerms) {
      throw createError(400, 'T&C_REQUIRED', 'Bonus kullanım koşullarını kabul etmelisiniz');
    }

    // V19a: claimedBy push, balance credit, ledger row and wagering record are
    // written in ONE transaction. Any failure (duplicate key, ledger or
    // wagering write) aborts all of them, so claimedBy never stays set without
    // the credit and the credit never stays without its wagering lock.
    const session = await mongoose.startSession();
    let result;
    try {
      result = await withTransactionRetry(session, async () => {
        // Read-only check first; the conditional $push below is the LAST write
        // so the hot promotion document is locked as briefly as possible when
        // many users claim the same promotion at once.
        const claimed = await Promotion.findById(req.params.id).session(session);
        if (!claimed || !claimed.isActive) throw createError(404, 'NOT_FOUND', 'Promosyon bulunamadı');
        if (claimed.claimedBy.some((id) => String(id) === String(req.user.id))) {
          throw createError(409, 'ALREADY_CLAIMED', 'Bu promosyonu daha önce kullandınız');
        }

        // Durable key: an operator clearing claimedBy cannot re-open a second
        // credit. Checked before the credit for a clear error; createTransaction
        // also throws DUPLICATE_TRANSACTION in-transaction on a racing write.
        const idempotencyKey = `promo_claim_${claimed._id}_${req.user.id}`;
        const existingTx = await Transaction.findOne({ idempotencyKey }).session(session);
        if (existingTx) throw createError(409, 'ALREADY_CLAIMED', 'Bu promosyon zaten claim edilmiş');

        // Model B (Kilitli Bakiye): bonus anında gerçek balance'a eklenir, hemen
        // oynanabilir olur. wageringRequired tamamlanana dek lockedAmount kadarı
        // çekilemez (bkz. wagering.js getLockedAmount/getSpendableBreakdown).
        const adjusted = await adjustBalance(req.user.id, claimed.amount, { session });
        if (!adjusted) throw createError(404, 'USER_NOT_FOUND', 'Kullanıcı bulunamadı');

        await createTransaction({
          userId: adjusted.doc._id,
          type: 'bonus',
          amount: claimed.amount,
          balanceBefore: adjusted.balanceBefore,
          balanceAfter: adjusted.balanceAfter,
          referenceId: claimed._id,
          note: `Promosyon: ${claimed.title}`,
          idempotencyKey,
          source: 'player',
        }, { session });

        // Wagering requirement oluştur
        const wageringMultiplier = claimed.wageringMultiplier || 35;
        const wageringRequired = parseFloat((claimed.amount * wageringMultiplier).toFixed(2));
        const deadline = claimed.deadlineDays
          ? new Date(Date.now() + claimed.deadlineDays * 24 * 60 * 60 * 1000)
          : null;

        await BonusWagering.create([{
          userId: adjusted.doc._id,
          promotionId: claimed._id,
          source: 'promotion',
          description: claimed.title,
          bonusAmount: claimed.amount,
          wageringRequired,
          wageringProgress: 0,
          multiplier: wageringMultiplier,
          gameWeights: claimed.gameWeights || undefined,
          deadline,
          status: 'active',
          acceptedTermsAt: new Date(), // Phase A5 — bonus T&C consent
        }], { session });

        // Atomic claim, last write: only one concurrent request of this user can
        // add userId to claimedBy; a loser aborts the whole transaction.
        const pushed = await Promotion.findOneAndUpdate(
          { _id: claimed._id, isActive: true, claimedBy: { $ne: req.user.id } },
          { $push: { claimedBy: req.user.id } },
          { new: true, session },
        );
        if (!pushed) {
          const now = await Promotion.findById(claimed._id).session(session);
          if (!now || !now.isActive) throw createError(404, 'NOT_FOUND', 'Promosyon bulunamadı');
          throw createError(409, 'ALREADY_CLAIMED', 'Bu promosyonu daha önce kullandınız');
        }

        return { userId: adjusted.doc._id, wageringRequired, wageringMultiplier, deadline };
      });
    } finally {
      await session.endSession();
    }
    const { wageringRequired, wageringMultiplier, deadline } = result;

    // After commit: bonusBalance is only a mirror of the locked amount (real
    // source: getLockedAmount, which runs its own expiry writes, so it stays
    // outside the transaction). Best-effort; the money is already committed.
    try {
      const { getLockedAmount } = await import('../services/wagering.js');
      await User.findByIdAndUpdate(result.userId, { bonusBalance: await getLockedAmount(result.userId) });
    } catch (e) {
      console.error('[promotions] bonusBalance mirror update failed:', e.message);
    }

    const updatedUser = await User.findById(result.userId);

    res.json({
      message: 'Bonus bakiyenize eklendi, hemen oynanabilir',
      balance: updatedUser.balance,
      bonusBalance: updatedUser.bonusBalance,
      wageringRequired,
      wageringMultiplier,
      deadline,
    });
  } catch(e) { next(e); }
}

export async function myWagerings(req, res, next) {
  try {
    const wagerings = await BonusWagering.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20);
    res.json({ wagerings });
  } catch(e) { next(e); }
}

export async function convert(req, res, next) {
  try {
    const { convertBonus } = await import('../services/wagering.js');
    const result = await convertBonus(req.params.wid, req.user.id);
    if (!result) throw createError(400, 'INVALID_STATE', 'Bu bonus dönüştürülemez (tamamlanmamış veya zaten dönüştürülmüş)');
    res.json({
      message: 'Bonus cash\'e çevrildi',
      convertedAmount: result.convertedAmount,
      newBalance: result.newBalance,
    });
  } catch(e) { next(e); }
}