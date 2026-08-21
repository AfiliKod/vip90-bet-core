import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { spinLimiter } from '../middleware/rateLimit.js';
import User from '../models/User.js';
import CasinoRound from '../models/CasinoRound.js';

const r = Router();

// ── POST /api/casino/spin — bakiye güncelle + CasinoRound kaydet ─────────────
r.post('/spin', requireAuth, spinLimiter, async (req, res, next) => {
  try {
    const { bet, payout, gameId, gameTitle, provider } = req.body;
    if (!bet || typeof bet !== 'number' || bet <= 0)
      return res.status(400).json({ error: { code: 'INVALID_BET', message: 'Geçersiz bahis miktarı' } });
    if (typeof payout !== 'number' || payout < 0 || payout > bet * 1000)
      return res.status(400).json({ error: { code: 'INVALID_PAYOUT', message: 'Geçersiz ödeme miktarı' } });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND' } });

    const netChange = (payout ?? 0) - bet;
    const netChangeRounded = parseFloat(netChange.toFixed(2));
    const updated = await User.findOneAndUpdate(
      { _id: req.user.id, balance: { $gte: bet } },
      { $inc: { balance: netChangeRounded } },
      { new: true }
    );
    if (!updated) {
      return res.status(400).json({ error: { code: 'INSUFFICIENT_BALANCE', message: 'Yetersiz bakiye' } });
    }
    const balanceBefore = parseFloat((updated.balance - netChangeRounded).toFixed(2));
    user.balance = updated.balance;

    if (gameId) {
      CasinoRound.create({
        userId: req.user.id,
        gameId,
        gameTitle: gameTitle || '',
        provider: provider || '',
        bet,
        payout: payout ?? 0,
        net: netChange,
        balanceBefore,
        balanceAfter: user.balance,
      }).catch(() => {});
    }

    res.json({ balance: user.balance, netChange });
  } catch (e) { next(e); }
});

export default r;
