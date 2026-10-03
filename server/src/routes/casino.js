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
// provider callback (harici sağlayıcı veya in-house game-host); bu uç sonuç kabul etmez.
r.post('/spin', requireAuth, spinLimiter, validate(spinSchema), async (req, res, next) => {
  try {
    const { bet, gameId, gameTitle, provider } = req.validated;
    if (!bet || typeof bet !== 'number' || bet <= 0)
      return res.status(400).json({ error: { code: 'INVALID_BET', message: 'Geçersiz bahis miktarı' } });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND' } });

    // Sonuç/ödeme bu uçtan geçmez: harici sağlayıcı oyunları sağlayıcının imzalı
    // wallet callback'i (bet/win), in-house oyunlar game-host (inhouse-provider)
    // üzerinden aynı wallet callback akışıyla işlenir. İstemciden gelen payout
    // hiçbir zaman kabul edilmez; bu uç yalnız geriye uyumluluk için 400 döner.
    return res.status(400).json({
      error: { code: 'USE_PROVIDER_CALLBACK', message: 'Oyun sonuçları bu uçtan işlenmez: sağlayıcı oyunları sağlayıcı callback\'i, in-house oyunlar game-host üzerinden (oyun sayfasından başlatılır) işlenir.' }
    });
  } catch (e) { next(e); }
});

export default r;
