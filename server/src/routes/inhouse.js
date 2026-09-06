import { Router } from 'express';
import { getRecentWinners } from '../services/liveGameStream.js';

/**
 * TÜM 13 in-house oyunun gerçek mantığı artık burada DEĞİL — çok-kiracılı
 * provider mimarisine taşındı (bkz. server/src/provider/games/{crashGame,
 * rouletteGame,instantGames,sessionGames}.js, server/src/provider/routes/
 * games.js — /api/provider/v1/games/*). Bu dosyada yalnızca herkese açık,
 * gerçek oyun mantığından bağımsız yardımcı uç kaldı.
 */
const router = Router();

// GET /inhouse/recent-winners — "son kazananlar" şeridinin ilk yükleme verisi.
// Herkese açık: misafir kullanıcılar da anasayfadaki sosyal-kanıt şeridini
// görebilmeli (`WinnersPanel`/`RecentWinnersTicker` login şartı aramıyor).
// Canlı güncellemeler soket üzerinden 'winners:new' event'iyle gelir (P4).
router.get('/recent-winners', (req, res) => {
  res.json({ winners: getRecentWinners() });
});

export default router;
