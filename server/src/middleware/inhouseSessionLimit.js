import User from '../models/User.js';
import {
  beginInhouseSession,
  closeInhouseSession,
  getActiveInhouseSession,
  isSessionExpired,
  resolveSessionLimitMinutes,
  touchInhouseSession,
} from '../services/inhouseSession.js';

/**
 * In-house oturum tavanı + sayaç (2026-10-08).
 *
 * İki bağlama:
 *  - `/launch`  → oturumu başlatır/devam ettirir; tavan aşıldıysa ESKİ oturumu
 *    kapatıp yenisini açar (`req.inhouseSessionRestarted`), böylece sağlayıcı
 *    tarafında yeni bir oturum/token elde edilir.
 *  - `/callback` (debit) → her turda tavanı denetler; aşıldıysa oturumu
 *    kapatır ve `{ approved:false, reason:'SESSION_LIMIT_REACHED' }` döner
 *    (engine `BET_REJECTED` üretir, para hareketi olmaz).
 *
 * Neden `launch`'a bakmak yetmez: crash/roulette gibi uzun ömürlü soket oyunları
 * oyuncu ekrandan çıkmadan saatlerce açık kalabiliyor — tavan ancak her turda
 * denetlenince gerçekten sınırlar.
 */
export function enforceInhouseSessionLimit({
  findUser = (id) => User.findById(id).select('responsibleLimits').lean(),
  // /callback oturumsuz gelir: oyuncu HMAC doğrulamasından sonra gövdedeki
  // externalPlayerId ile çözülür (test için DI).
  findPlayer = (externalPlayerId) => User.findOne({
    $or: [{ _id: externalPlayerId }, { username: externalPlayerId }],
  }).select('_id').lean(),
  sessionService = {
    beginInhouseSession,
    closeInhouseSession,
    getActiveInhouseSession,
    touchInhouseSession,
    resolveSessionLimitMinutes,
    isSessionExpired,
  },
} = {}) {
  return async function inhouseSessionLimit(req, res, next) {
    try {
      const isDebit = req.body?.type === 'debit';
      const isLaunch = req.path === '/launch' || req.path === '/launch/';
      if (!isDebit && !isLaunch) return next();
      if (isLaunch && !req.user?.id) return next();   // launch her zaman oturum ister

      // ── Callback (debit): tavan denetimi + sayaç ──────────────────────
      if (isDebit) {
        const { userId, bet } = await resolvePlayer(req, findPlayer);
        if (!userId) return next();                   // oyuncu çözülemedi → bu katmanın işi değil

        const limitMinutes = await resolveLimit(userId, findUser, sessionService);
        const active = await sessionService.getActiveInhouseSession({ userId });
        if (active && isSessionExpired(active, limitMinutes)) {
          await sessionService.closeInhouseSession({ userId, reason: 'max_duration' });
          return res.status(403).json({ approved: false, reason: 'SESSION_LIMIT_REACHED' });
        }
        await sessionService.touchInhouseSession({ userId, bet });
        return next();
      }

      // ── Launch: oturum başlat/devam ───────────────────────────────────
      const { userId } = await resolvePlayer(req, findPlayer);
      if (!userId) return next();
      const { restarted } = await sessionService.beginInhouseSession({
        userId,
        gameId: req.body?.gameId,
        limitMinutes: await resolveLimit(userId, findUser, sessionService),
      });
      req.inhouseSessionRestarted = restarted;
      return next();
    } catch (err) {
      // Oturum defteri hatası oyun akışını durdurmaz (fail-open, services/inhouseSession.js).
      return next(err);
    }
  };
}

async function resolvePlayer(req, findPlayer) {
  if (req.user?.id) return { userId: String(req.user.id), bet: 0 };
  const externalPlayerId = req.body?.externalPlayerId;
  if (!externalPlayerId) return { userId: null, bet: 0 };
  try {
    const user = await findPlayer(externalPlayerId);
    return {
      userId: user?._id ? String(user._id) : null,
      bet: Number(req.body?.bet) || Number(req.body?.amount) || 0,
    };
  } catch {
    return { userId: null, bet: 0 };
  }
}

async function resolveLimit(userId, findUser, sessionService) {
  try {
    const user = await findUser(userId);
    return sessionService.resolveSessionLimitMinutes(user?.responsibleLimits?.sessionTimeoutMin);
  } catch {
    return sessionService.resolveSessionLimitMinutes(null);
  }
}