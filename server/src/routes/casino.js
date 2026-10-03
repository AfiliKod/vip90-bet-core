import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { spinLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { spinSchema } from '../validators/casino.js';
import User from '../models/User.js';
import CasinoRound from '../models/CasinoRound.js';

const r = Router();

// ── POST /api/casino/spin — server-side validated spin ──────────────────────
// SECURITY FIX (C1): Client no longer submits payout. Payout is determined
// server-side via provably fair algorithm or provider callback. This endpoint
// only accepts bet amount and game metadata; payout must come from a signed
// provider callback or server-side RNG.
r.post('/spin', requireAuth, spinLimiter, validate(spinSchema), async (req, res, next) => {
  try {
    const { bet, gameId, gameTitle, provider } = req.validated;
    if (!bet || typeof bet !== 'number' || bet <= 0)
      return res.status(400).json({ error: { code: 'INVALID_BET', message: 'Geçersiz bahis miktarı' } });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND' } });

    // For in-house games, payout MUST be computed server-side.
    // Client-submitted payouts are rejected — use /api/inhouse/spin or provider callback instead.
    // This endpoint is now only for recording externally-validated spins.
    return res.status(400).json({
      error: { code: 'USE_PROVIDER_CALLBACK', message: 'Oyun sonuçları sunucu tarafında doğrulanmalıdır. Provider callback veya /api/inhouse/spin kullanın.' }
    });
  } catch (e) { next(e); }
});

export default r;
