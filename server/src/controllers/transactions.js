import mongoose from 'mongoose';
import crypto from 'crypto';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { createError } from '../middleware/error.js';
import { formatMoney } from '../currency/index.js';
import { createTransaction } from '../services/ledger.js';
import { updateDailyStats } from '../services/responsibleGaming.js';
import { withTransactionRetry } from '../utils/transactionRetry.js';

export async function deposit(req, res, next) {
  const session = await mongoose.startSession();
  try {
    const newBalance = await withTransactionRetry(session, async () => {
      const { amount } = req.validated;
      const user = await User.findById(req.user.id).session(session);
      if (!user) throw createError(404, 'USER_NOT_FOUND', 'Kullanıcı bulunamadı');

      const balanceBefore = user.balance;
      user.balance = +(user.balance + amount).toFixed(2);
      await user.save({ session });

      // SECURITY FIX (C5): Use UUID instead of Date.now() for idempotency key
      // Date.now() produces identical keys under concurrent requests
      const idempotencyKey = `deposit_${req.user.id}_${amount}_${crypto.randomUUID()}`;

      await createTransaction({
        userId: user._id,
        type: 'deposit',
        amount,
        balanceBefore,
        balanceAfter: user.balance,
        idempotencyKey,
        source: 'player',
        metadata: { method: req.body?.method || 'bank_transfer' },
      }, { session });

      return user.balance;
    });
    await updateDailyStats(req.user.id, 'deposit', req.validated.amount).catch((e) => {
      console.error('[RG] updateDailyStats (deposit) failed:', e.message);
    });
    res.json({ newBalance, message: `${await formatMoney(req.validated.amount)} yatırıldı` });
  } catch(e) { next(e); }
  finally { session.endSession(); }
}

export async function withdraw(req, res, next) {
  try {
    const { amount, confirmForfeit } = req.validated;
    const { getSpendableBreakdown, forfeitActiveWagerings, previewForfeitAmount } = await import('../services/wagering.js');
    const breakdown = await getSpendableBreakdown(req.user.id);

    if (amount > breakdown.withdrawable) {
      if (breakdown.locked <= 0) throw createError(400, 'INSUFFICIENT_BALANCE', 'Yetersiz bakiye');
      if (!confirmForfeit) {
        throw createError(409, 'ACTIVE_BONUS_LOCK', `Bu çekim ${await formatMoney(breakdown.locked)} tutarındaki aktif bonusunuzu iptal eder. Onaylıyor musunuz?`);
      }
      // Forfeit geri dönüşsüz — önce, işe yarayıp yaramayacağını (state
      // değiştirmeden) doğrula. Fresh/az ilerlemiş bonuslarda forfeitRatio
      // yükseldikçe forfeit sonrası withdrawable, forfeit-öncesi withdrawable'ı
      // aşamayabilir (bkz. #17 final review Finding 1) — bu durumda bonusu
      // boşuna yakmadan önce çekimi reddet.
      const forfeitPreview = await previewForfeitAmount(req.user.id);
      const predictedWithdrawable = Math.max(0, parseFloat((breakdown.balance - forfeitPreview).toFixed(2)));
      if (predictedWithdrawable < amount) {
        throw createError(400, 'INSUFFICIENT_BALANCE', 'Bonus feshi bile bu tutarı çekmeye yetmiyor. Yetersiz bakiye.');
      }
      await forfeitActiveWagerings(req.user.id);
    }

    const session = await mongoose.startSession();
    try {
      const newBalance = await withTransactionRetry(session, async () => {
        const user = await User.findById(req.user.id).session(session);
        if (user.balance < amount) throw createError(400,'INSUFFICIENT_BALANCE','Yetersiz bakiye');

        const balanceBefore = user.balance;
        user.balance = +(user.balance - amount).toFixed(2);
        await user.save({ session });

        // SECURITY FIX (C5): Use UUID instead of Date.now() for idempotency key
        const idempotencyKey = `withdraw_${req.user.id}_${amount}_${crypto.randomUUID()}`;

        await createTransaction({
          userId: user._id,
          type: 'withdraw',
          amount: -amount,
          balanceBefore,
          balanceAfter: user.balance,
          idempotencyKey,
          source: 'player',
          metadata: { method: req.body?.method || 'bank_transfer' },
        }, { session });

        return user.balance;
      });
      res.json({ newBalance, message: `${await formatMoney(amount)} çekildi` });
    } finally {
      session.endSession();
    }
  } catch(e) { next(e); }
}
