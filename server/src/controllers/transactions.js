import mongoose from 'mongoose';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { createError } from '../middleware/error.js';

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
    res.json({ newBalance: user.balance, message: `${amount}₺ yatırıldı` });
  } catch(e) { await session.abortTransaction(); next(e); }
  finally { session.endSession(); }
}

export async function withdraw(req, res, next) {
  try {
    const { amount, confirmForfeit } = req.validated;
    const { getSpendableBreakdown, forfeitActiveWagerings } = await import('../services/wagering.js');
    const breakdown = await getSpendableBreakdown(req.user.id);

    if (amount > breakdown.withdrawable) {
      if (breakdown.locked <= 0) throw createError(400, 'INSUFFICIENT_BALANCE', 'Yetersiz bakiye');
      if (!confirmForfeit) {
        throw createError(409, 'ACTIVE_BONUS_LOCK', `Bu çekim ₺${breakdown.locked.toFixed(2)} tutarındaki aktif bonusunuzu iptal eder. Onaylıyor musunuz?`);
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
      res.json({ newBalance: user.balance, message: `${amount}₺ çekildi` });
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }
  } catch(e) { next(e); }
}
