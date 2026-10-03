import crypto from 'crypto';
import mongoose from 'mongoose';
import Bet from '../models/Bet.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Event from '../models/Event.js';
import { createError } from '../middleware/error.js';
import { assertFeedFresh } from '../utils/bettingGate.js';
import { createTransaction } from '../services/ledger.js';
import { updateDailyStats } from '../services/responsibleGaming.js';
import { withTransactionRetry } from '../utils/transactionRetry.js';

export async function place(req, res, next) {
  const session = await mongoose.startSession();
  try {
    const { bet, newBalance } = await withTransactionRetry(session, async () => {
      const { selections, type, stake } = req.validated;
      const user = await User.findById(req.user.id).session(session);
      if (!user) throw createError(404,'USER_NOT_FOUND','Kullanıcı bulunamadı');
      if (user.balance < stake) throw createError(400,'INSUFFICIENT_BALANCE','Yetersiz bakiye');

      // Oranları doğrula
      for (const sel of selections) {
        const event = await Event.findById(sel.eventId).session(session);
        if (!event || event.status === 'finished' || event.status === 'cancelled')
          throw createError(400,'EVENT_UNAVAILABLE','Etkinlik bahse kapalı');
        // Oranı besleyen feed bayatsa kupon kabul edilmez — donmuş oranla bahis riski.
        assertFeedFresh(event);
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

      const created = await Bet.create([{ userId: user._id, selections, type, stake, totalOdds: +totalOdds.toFixed(3), potentialWin, status:'pending' }], { session });

      // SECURITY FIX (M5): Use UUID instead of Date.now() for idempotency key
      const idempotencyKey = `bet_${user._id}_${created[0]._id}_${stake}_${crypto.randomUUID()}`;

      await createTransaction({
        userId: user._id,
        type: 'bet',
        amount: -stake,
        balanceBefore,
        balanceAfter: user.balance,
        referenceId: created[0]._id,
        idempotencyKey,
        source: 'player',
        metadata: { selections: selections.length, totalOdds, potentialWin },
      }, { session });

      return { bet: created[0], newBalance: user.balance };
    });

    await updateDailyStats(bet.userId, 'wager', bet.stake).catch((e) => {
      console.error('[RG] updateDailyStats (wager) failed:', e.message);
    });

    // Bonus wagering credit (transaction dışında, hata olursa bet'i etkilemesin)
    try {
      const { recordWagering } = await import('../services/wagering.js');
      await recordWagering(bet.userId, 'sports', bet.stake);
    } catch (wageringErr) {
      console.error('[wagering] record error:', wageringErr.message);
    }

    res.status(201).json({ bet, newBalance });
  } catch(e) {
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
