import mongoose from 'mongoose';
import Bet from '../models/Bet.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Event from '../models/Event.js';
import { createError } from '../middleware/error.js';

export async function place(req, res, next) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { selections, type, stake } = req.validated;
    const user = await User.findById(req.user.id).session(session);
    if (!user) throw createError(404,'USER_NOT_FOUND','Kullanıcı bulunamadı');
    if (user.balance < stake) throw createError(400,'INSUFFICIENT_BALANCE','Yetersiz bakiye');

    // Oranları doğrula
    for (const sel of selections) {
      const event = await Event.findById(sel.eventId).session(session);
      if (!event || event.status === 'finished' || event.status === 'cancelled')
        throw createError(400,'EVENT_UNAVAILABLE','Etkinlik bahse kapalı');
      const market = event.markets.find(m => m.type === sel.marketType);
      const odd = market?.odds.find(o => o.id === sel.oddId && o.isActive);
      if (!odd) throw createError(400,'ODD_UNAVAILABLE','Oran mevcut değil');
      if (Math.abs(odd.value - sel.oddValue) > 0.1)
        throw createError(400,'ODD_CHANGED','Oran değişti, lütfen tekrar kontrol edin');
    }

    const totalOdds = type === 'combo'
      ? selections.reduce((acc, s) => acc * s.oddValue, 1)
      : selections[0].oddValue;
    const potentialWin = +(stake * totalOdds).toFixed(2);

    const balanceBefore = user.balance;
    user.balance = +(user.balance - stake).toFixed(2);
    await user.save({ session });

    const bet = await Bet.create([{ userId: user._id, selections, type, stake, totalOdds: +totalOdds.toFixed(3), potentialWin, status:'pending' }], { session });
    await Transaction.create([{ userId: user._id, type:'bet', amount: -stake, balanceBefore, balanceAfter: user.balance, referenceId: bet[0]._id }], { session });

    await session.commitTransaction();
    res.status(201).json({ bet: bet[0], newBalance: user.balance });
  } catch(e) {
    await session.abortTransaction();
    next(e);
  } finally { session.endSession(); }
}

export async function getById(req, res, next) {
  try {
    const bet = await Bet.findOne({ _id: req.params.id, userId: req.user.id });
    if (!bet) return res.status(404).json({ error:{ code:'NOT_FOUND', message:'Bahis bulunamadı' } });
    res.json({ bet });
  } catch(e) { next(e); }
}
