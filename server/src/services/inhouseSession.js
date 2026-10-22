import InhousePlaySession from '../models/InhousePlaySession.js';

/**
 * In-house oturum tavanı (2026-10-08).
 *
 * Varsayılan tavan: `INHOUSE_SESSION_MAX_MINUTES` (default 120 dk). Oyuncu
 * kendi limitini kurmuşsa (`responsibleLimits.sessionTimeoutMin`) O KAZANIR —
 * oyuncunun seçtiği daha kısa süre uygulanır. Rakam operatör kararıdır:
 * env ile değiştirilebilir, kod değiştirmeden.
 *
 * Tüm fonksiyonlar DB hatasında **fail-open** döner: oturum defteri
 * denetim için vardır; Mongo zaten düşmüşse oyun akışı da çalışmıyor ve
 * burada üstüne ikinci bir kesinti yaratmak yanlış olur.
 */

const DEFAULT_MAX_MINUTES = 120;
const MIN_LIMIT_MINUTES = 5;
const MAX_LIMIT_MINUTES = 1440;

export function defaultSessionMaxMinutes(env = process.env) {
  const raw = Number(env.INHOUSE_SESSION_MAX_MINUTES);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_MAX_MINUTES;
  return clampMinutes(raw);
}

/** Oyuncu limiti varsa o kazanır; yoksa platform varsayılanı. */
export function resolveSessionLimitMinutes(playerSessionTimeoutMin, platformMax = defaultSessionMaxMinutes()) {
  const player = Number(playerSessionTimeoutMin);
  if (Number.isFinite(player) && player > 0) return clampMinutes(player);
  return clampMinutes(platformMax);
}

function clampMinutes(minutes) {
  return Math.min(MAX_LIMIT_MINUTES, Math.max(MIN_LIMIT_MINUTES, Math.round(minutes)));
}

/** Oturum tavanı aşıldı mı? */
export function isSessionExpired(session, limitMinutes, now = Date.now()) {
  if (!session?.startedAt) return false;
  const started = new Date(session.startedAt).getTime();
  if (Number.isNaN(started)) return false;
  return (now - started) >= limitMinutes * 60_000;
}

/**
 * Oturum başlat/devam ettir. Tavan aşıldıysa mevcut oturumu kapatıp yenisini
 * açar ve `restarted: true` döner (çağıran taraf oyuncuya yeni oturum bildirir).
 */
export async function beginInhouseSession({ userId, gameId, limitMinutes, now = new Date(), model = InhousePlaySession }) {
  try {
    const active = await model.findOne({ userId, status: 'active' }).sort({ startedAt: -1 }).lean();
    const limit = resolveSessionLimitMinutes(limitMinutes);

    if (!active) {
      const session = await model.create({ userId, gameId, startedAt: now, lastActivityAt: now });
      return { session, restarted: false, limitMinutes: limit };
    }

    if (isSessionExpired(active, limit, now.getTime())) {
      await model.updateOne(
        { _id: active._id },
        { $set: { status: 'closed', closedAt: now, closeReason: 'max_duration' } },
      );
      const session = await model.create({ userId, gameId, startedAt: now, lastActivityAt: now });
      return { session, restarted: true, previous: active, limitMinutes: limit };
    }

    // Devam eden oturum: oyun değişmiş olabilir, ilk oyunu güncelle.
    if (active.gameId !== gameId) {
      await model.updateOne({ _id: active._id }, { $set: { gameId, lastActivityAt: now } });
    }
    return { session: active, restarted: false, limitMinutes: limit };
  } catch (e) {
    console.warn('[inhouseSession] başlatılamadı (fail-open):', e.message);
    return { session: null, restarted: false, limitMinutes: resolveSessionLimitMinutes(limitMinutes) };
  }
}

/** Tur sonrası oturum sayacı (denetim raporu için). */
export async function touchInhouseSession({ userId, bet = 0, now = new Date(), model = InhousePlaySession }) {
  try {
    await model.updateOne(
      { userId, status: 'active' },
      { $set: { lastActivityAt: now }, $inc: { rounds: 1, totalBet: Number(bet) || 0 } },
    );
  } catch (e) {
    console.warn('[inhouseSession] sayaç güncellenemedi (fail-open):', e.message);
  }
}

export async function getActiveInhouseSession({ userId, model = InhousePlaySession }) {
  try {
    return await model.findOne({ userId, status: 'active' }).sort({ startedAt: -1 }).lean();
  } catch {
    return null;
  }
}

export async function closeInhouseSession({ userId, reason = 'player_closed', now = new Date(), model = InhousePlaySession }) {
  try {
    await model.updateMany(
      { userId, status: 'active' },
      { $set: { status: 'closed', closedAt: now, closeReason: reason } },
    );
  } catch (e) {
    console.warn('[inhouseSession] kapatılamadı (fail-open):', e.message);
  }
}