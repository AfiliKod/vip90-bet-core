import mongoose from 'mongoose';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { createError } from '../middleware/error.js';
import { formatMoney } from '../currency/index.js';

export async function deposit(req, res, next) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { amount } = req.validated;
    const user = await User.findById(req.user.id).session(session);
    const balanceBefore = user.balance;
    user.balance = +(user.balance + amount).toFixed(2);
    await user.save({ session });
    await Transaction.create([{ userId: user._id, type:'deposit', amount, balanceBefore, balanceAfter: user.balance }], { session });
    await session.commitTransaction();
    res.json({ newBalance: user.balance, message: `${await formatMoney(amount)} yatırıldı` });
  } catch(e) { await session.abortTransaction(); next(e); }
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
    session.startTransaction();
    try {
      const user = await User.findById(req.user.id).session(session);
      if (user.balance < amount) throw createError(400,'INSUFFICIENT_BALANCE','Yetersiz bakiye');
      const balanceBefore = user.balance;
      user.balance = +(user.balance - amount).toFixed(2);
      await user.save({ session });
      await Transaction.create([{ userId: user._id, type:'withdraw', amount: -amount, balanceBefore, balanceAfter: user.balance }], { session });
      await session.commitTransaction();
      res.json({ newBalance: user.balance, message: `${await formatMoney(amount)} çekildi` });
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }
  } catch(e) { next(e); }
}
