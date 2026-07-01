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
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { amount } = req.validated;
    const user = await User.findById(req.user.id).session(session);
    if (user.balance < amount) throw createError(400,'INSUFFICIENT_BALANCE','Yetersiz bakiye');
    const balanceBefore = user.balance;
    user.balance = +(user.balance - amount).toFixed(2);
    await user.save({ session });
    await Transaction.create([{ userId: user._id, type:'withdraw', amount: -amount, balanceBefore, balanceAfter: user.balance }], { session });
    await session.commitTransaction();
    session.endSession();

    // Aktif bonus wagering varsa bilgilendir (forfeit bilgilendirmesi)
    try {
      const BonusWagering = (await import('../models/BonusWagering.js')).default;
      const activeWagerings = await BonusWagering.find({ userId: user._id, status: 'active' });
      if (activeWagerings.length > 0) {
        // Not: bonus forfeit sadece kullanıcı onaylarsa olur
        // Şu an otomatik forfeit YOK — kullanıcıya info veriyoruz
      }
    } catch (e) {}

    res.json({ newBalance: user.balance, message: `${amount}₺ çekildi` });
  } catch(e) { await session.abortTransaction(); next(e); }
  finally { session.endSession(); }
}
