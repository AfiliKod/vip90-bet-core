// Bonus Call + Freeround ödül yaşam döngüsü (spec: "Servis katmanı").
// Sağlayıcıya provider.js -> getIgames() üzerinden gider; testte
// igamesSession._setIgamesService ile mock'lanır.
//
// Kural: her sağlayıcı çağrısından önce kayıt 'pending' yazılır, sonuç ne olursa
// olsun kayıt son durumuna güncellenir ve ham yanıt saklanır; hata fırlatılmadan
// önce kayıt kaydedilir.
import CasinoPromoGrant, { effectiveStatus } from '../../models/CasinoPromoGrant.js';
import User from '../../models/User.js';
import { createError } from '../../middleware/error.js';
import { getIgames } from './provider.js';
import { isProviderOk, toPromoError } from './providerErrors.js';
import { PROMO_LIMITS, FREEROUND_EXPIRATION_UNIT } from './limits.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const ONLINE_WINDOW_MS = 30 * 60 * 1000;

// Test için override: palaceUserCode yokken hesap açan fonksiyon (varsayılan: igames.js ensureIgamesUser).
let _ensureUser = null;
export function _setEnsureIgamesUser(fn) { _ensureUser = fn; }
async function ensureUser(userId) {
  if (_ensureUser) return _ensureUser(userId);
  const mod = await import('../../premium/igames/igames.js');
  return mod.ensureIgamesUser(userId);
}

function actorFields(actor = {}) {
  const f = {};
  if (actor.id) {
    f.grantedBy = actor.id;
    f.grantedByUsername = actor.username || null;
  } else if (actor.system) {
    f.grantedByUsername = `system:${actor.system}`;
  }
  return f;
}

// Sağlayıcı çağrısı: fırlatma (network/HTTP hata) ya da HTTP 200 + code != 0 → { ok:false, error, raw }.
async function callProvider(fn) {
  try {
    const result = await fn();
    if (!isProviderOk(result)) return { ok: false, error: toPromoError(result), raw: result?.data ?? null, result };
    return { ok: true, raw: result.data, result };
  } catch (e) {
    return { ok: false, error: toPromoError(e), raw: { message: e.message }, result: null };
  }
}

function toHttpError(perr) {
  return createError(perr.httpStatus, perr.code, perr.message);
}

async function failGrant(grant, perr, raw) {
  grant.status = 'failed';
  grant.error = { code: perr.code, message: perr.message };
  grant.providerResponse = raw;
  await grant.save();
  throw toHttpError(perr);
}

function findGrantOr404(grantId, kind) {
  return CasinoPromoGrant.findById(grantId).then(g => {
    if (!g || g.kind !== kind) throw createError(404, 'PROMO_GRANT_NOT_FOUND', 'Ödül kaydı bulunamadı');
    return g;
  });
}

// ─── Bonus Call ────────────────────────────────────────────────────────────

export async function startBonusCall({ actor, gplayId, setPoint, memo }) {
  gplayId = Number(gplayId);
  setPoint = Number(setPoint);
  if (!Number.isFinite(gplayId) || gplayId <= 0) throw createError(400, 'PROMO_INVALID_PARAMS', 'gplay_id geçersiz');
  if (!Number.isFinite(setPoint) || setPoint <= 0) throw createError(400, 'PROMO_INVALID_PARAMS', 'Tutar geçersiz');
  if (setPoint > PROMO_LIMITS.maxSetPoint) {
    throw createError(400, 'PROMO_ABOVE_MAX', `Bonus call tutarı en fazla ${PROMO_LIMITS.maxSetPoint} olabilir`);
  }

  const igames = await getIgames();

  let online;
  try { online = await igames.getOnlineGames(); } catch (e) { throw toHttpError(toPromoError(e)); }
  if (!isProviderOk(online)) throw toHttpError(toPromoError(online));
  const rows = Array.isArray(online.data?.data) ? online.data.data : [];
  const play = rows.find(r => Number(r.gplay_id) === gplayId);
  if (!play) throw createError(404, 'PLAY_NOT_ACTIVE', 'Oyun oturumu artık açık değil; listeyi yenileyin');
  if (!play.call_enable) throw createError(409, 'CALL_NOT_AVAILABLE', 'Bu oturumda bonus çağrısı şu an verilemiyor');

  const dup = await CasinoPromoGrant.findOne({ kind: 'bonusCall', gplayId, status: { $in: ['pending', 'running'] } }).lean();
  if (dup) throw createError(409, 'PROMO_CALL_DUPLICATE', 'Bu oturumda zaten bir bonus call var');

  const cfg = await getCallMin(igames);
  if (cfg != null && setPoint < cfg) {
    throw createError(400, 'PROMO_BELOW_MIN', `Bonus call tutarı en az ${cfg} olmalı`);
  }

  let user = play.user_code != null ? await User.findOne({ palaceUserCode: String(play.user_code) }) : null;
  if (!user && play.user_name) user = await User.findOne({ username: play.user_name });
  if (!user) throw createError(404, 'PROMO_USER_NOT_FOUND', 'Oturumun oyuncusu sistemde bulunamadı');

  let grant;
  try {
    grant = await CasinoPromoGrant.create({
      kind: 'bonusCall',
      user: user._id,
      username: user.username,
      palaceUserCode: play.user_code != null ? String(play.user_code) : user.palaceUserCode,
      providerId: play.provider_id ?? null,
      providerName: play.provider_name ?? null,
      gameCode: play.game_code ?? null,
      gameName: play.game_name ?? null,
      memo: memo || '',
      gplayId,
      setPoint,
      winTotal: 0,
      status: 'pending',
      ...actorFields(actor),
    });
  } catch (e) {
    // Çift tıklama: partial unique index (yalnızca pending) devreye girdi.
    if (e?.code === 11000) throw createError(409, 'PROMO_CALL_DUPLICATE', 'Bu oturumda zaten bir bonus call var');
    throw e;
  }

  const r = await callProvider(() => igames.startBonusCall(gplayId, setPoint, 1, memo || null));
  if (!r.ok) return failGrant(grant, r.error, r.raw);

  const callId = r.raw?.data?.call_id ?? r.raw?.call_id;
  grant.status = 'running';
  if (callId != null) grant.callId = Number(callId);
  grant.providerResponse = r.raw;
  await grant.save();
  return grant.toObject();
}

async function getCallMin(igames) {
  try {
    const cfg = await igames.getCallConfig();
    if (!isProviderOk(cfg)) return null;
    const v = Number(cfg.data?.data?.call_min);
    return Number.isFinite(v) ? v : null;
  } catch { return null; }
}

export async function cancelBonusCall({ actor, grantId }) {
  const grant = await findGrantOr404(grantId, 'bonusCall');
  if (grant.status !== 'running' || grant.callId == null) {
    throw createError(409, 'PROMO_NOT_CANCELLABLE', 'Yalnızca çalışan bir bonus call iptal edilebilir');
  }
  const igames = await getIgames();
  const r = await callProvider(() => igames.cancelBonusCall(grant.callId));
  grant.providerResponse = r.raw;
  if (r.ok) {
    grant.status = 'cancelled';
    grant.cancelledAt = new Date();
    await grant.save();
    return grant.toObject();
  }
  if (r.error.code === 'PROMO_CALL_ENDED') {
    // Bilgi, hata değil: çağrı zaten bitmiş.
    grant.status = 'completed';
    grant.completedAt = new Date();
    await grant.save();
    return grant.toObject();
  }
  // Sağlayıcı reddetti: çağrı hâlâ çalışıyor sayılır, hata izi kaydedilir.
  grant.error = { code: r.error.code, message: r.error.message };
  await grant.save();
  throw toHttpError(r.error);
}

// ─── Freeround ─────────────────────────────────────────────────────────────

export async function createFreeRound({
  actor, userId, providerId, gameCode, gameName, rounds, bet, win = 0, scenario = null, expiresAt, memo,
}) {
  rounds = Number(rounds);
  bet = Number(bet);
  win = Number(win);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > PROMO_LIMITS.maxRounds) {
    throw createError(400, 'PROMO_INVALID_PARAMS', `Tur sayısı 1-${PROMO_LIMITS.maxRounds} arasında tamsayı olmalı`);
  }
  if (!Number.isFinite(bet) || bet <= 0) throw createError(400, 'PROMO_INVALID_PARAMS', 'Bahis 0\'dan büyük olmalı');
  if (!Number.isFinite(win) || win < 0) throw createError(400, 'PROMO_INVALID_PARAMS', 'Kazanç tavanı negatif olamaz');
  if (bet * rounds > PROMO_LIMITS.maxFreeRoundValue) {
    throw createError(400, 'PROMO_ABOVE_MAX', `Toplam bahis değeri en fazla ${PROMO_LIMITS.maxFreeRoundValue} olabilir`);
  }
  if (providerId == null || !Number.isFinite(Number(providerId)) || !gameCode) {
    throw createError(400, 'PROMO_INVALID_PARAMS', 'Sağlayıcı ve oyun zorunlu');
  }
  const exp = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  const now = Date.now();
  if (Number.isNaN(exp.getTime()) || exp.getTime() <= now) {
    throw createError(400, 'PROMO_INVALID_EXPIRY', 'Bitiş tarihi gelecekte olmalı');
  }
  if (exp.getTime() > now + PROMO_LIMITS.maxExpiryDays * DAY_MS) {
    throw createError(400, 'PROMO_INVALID_EXPIRY', `Bitiş tarihi en fazla ${PROMO_LIMITS.maxExpiryDays} gün sonra olabilir`);
  }
  if (scenario != null && scenario !== '' && !Number.isInteger(Number(scenario))) {
    throw createError(400, 'PROMO_INVALID_PARAMS', 'Senaryo tamsayı olmalı');
  }
  const scen = scenario == null || scenario === '' ? null : Number(scenario);

  const user = await User.findById(userId);
  if (!user) throw createError(404, 'PROMO_USER_NOT_FOUND', 'Oyuncu bulunamadı');

  let palaceUserCode = user.palaceUserCode;
  if (!palaceUserCode) {
    try { palaceUserCode = await ensureUser(user._id); }
    catch (e) { throw toHttpError(toPromoError(e)); }
  }

  const grant = await CasinoPromoGrant.create({
    kind: 'freeRound',
    user: user._id,
    username: user.username,
    palaceUserCode: String(palaceUserCode),
    providerId: Number(providerId),
    gameCode: String(gameCode),
    gameName: gameName || null,
    memo: memo || '',
    rounds, bet, win, scenario: scen,
    expiresAt: exp,
    winTotal: null,
    status: 'pending',
    ...actorFields(actor),
  });

  const body = {
    user_code: Number.isFinite(Number(palaceUserCode)) ? Number(palaceUserCode) : palaceUserCode,
    provider_id: Number(providerId),
    game_symbol: String(gameCode),
    bet, win, rounds,
    expirationDate: FREEROUND_EXPIRATION_UNIT === 'seconds' ? Math.floor(exp.getTime() / 1000) : exp.getTime(),
  };
  if (scen != null) body.scenario = scen;

  const igames = await getIgames();
  const r = await callProvider(() => igames.createFreeRound(body));
  if (!r.ok) return failGrant(grant, r.error, r.raw);

  // Varsayım (spec md.4): fr_id yanıtta dönmeyebilir; dönerse kaydet.
  const d = r.raw?.data;
  const frId = d?.fr_id ?? d?.frId ?? d?.id ?? null;
  grant.status = 'active';
  grant.frId = frId != null ? String(frId) : null;
  grant.providerResponse = r.raw;
  await grant.save();
  return grant.toObject();
}

export async function cancelFreeRound({ actor, grantId }) {
  const grant = await findGrantOr404(grantId, 'freeRound');
  if (grant.status !== 'active' || effectiveStatus(grant) !== 'active' || !grant.frId) {
    throw createError(409, 'PROMO_NOT_CANCELLABLE', 'Bu freeround iptal edilemez (kimlik yok, süresi dolmuş ya da aktif değil)');
  }
  const igames = await getIgames();
  const r = await callProvider(() => igames.cancelFreeRound(grant.frId));
  grant.providerResponse = r.raw;
  if (!r.ok) {
    grant.error = { code: r.error.code, message: r.error.message };
    await grant.save();
    throw toHttpError(r.error);
  }
  grant.status = 'cancelled';
  grant.cancelledAt = new Date();
  await grant.save();
  return grant.toObject();
}

// ─── Listeleme / senkron / callback ────────────────────────────────────────

function escapeRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export async function listGrants({ kind, status, username, from, to, page = 1, limit = 25 } = {}) {
  const now = new Date();
  const q = {};
  if (kind) q.kind = kind;
  if (status === 'expired') { q.status = 'active'; q.expiresAt = { $lte: now }; }
  else if (status === 'active') { q.status = 'active'; q.$or = [{ expiresAt: null }, { expiresAt: { $gt: now } }]; }
  else if (status) q.status = status;
  if (username) q.username = { $regex: escapeRegex(username), $options: 'i' };
  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = new Date(from);
    if (to) q.createdAt.$lte = new Date(to);
  }
  page = Math.max(1, Number(page) || 1);
  limit = Math.min(100, Math.max(1, Number(limit) || 25));

  const [rows, total] = await Promise.all([
    CasinoPromoGrant.find(q).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    CasinoPromoGrant.countDocuments(q),
  ]);
  const items = rows.map(g => ({ ...g, status: effectiveStatus(g, now) }));
  return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

export async function syncBonusCallsFromOnline(onlineRows, now = new Date()) {
  const rows = Array.isArray(onlineRows) ? onlineRows : [];
  const running = await CasinoPromoGrant.find({ kind: 'bonusCall', status: 'running' });
  let updated = 0;
  for (const g of running) {
    const row = rows.find(r => (g.callId != null && Number(r.call_id) === g.callId)
      || (!r.call_id && g.gplayId != null && Number(r.gplay_id) === g.gplayId));
    let changed = false;
    if (row) {
      const callWin = Number(row.call_win);
      if (Number.isFinite(callWin) && callWin > (g.winTotal || 0)) { g.winTotal = callWin; changed = true; }
      if (Number(row.call_status) === 2 || Number(row.call_status) === 3 || row.callend_flag) {
        g.status = 'completed'; g.completedAt = now; changed = true;
      }
    } else if (now.getTime() - new Date(g.createdAt).getTime() > ONLINE_WINDOW_MS) {
      // Oturum online listesinde artık yok ve kayıt 30 dk'dan eski: oturum kapandı.
      g.status = 'completed'; g.completedAt = now; changed = true;
    }
    if (changed) { await g.save(); updated++; }
  }
  return updated;
}

export async function recordBonusCallWin({ callId, amount }) {
  const n = Number(amount);
  if (callId == null || !Number.isFinite(Number(callId)) || !Number.isFinite(n)) return;
  await CasinoPromoGrant.updateOne({ kind: 'bonusCall', callId: Number(callId) }, { $inc: { winTotal: n } });
}

export async function getPromoConfig() {
  const igames = await getIgames();
  let callMin = null; let agentBalance = null; let agentCurrency = null;
  try {
    const cfg = await igames.getCallConfig();
    if (isProviderOk(cfg)) { const v = Number(cfg.data?.data?.call_min); callMin = Number.isFinite(v) ? v : null; }
  } catch { /* alan null kalır */ }
  try {
    const info = await igames.getAgentInfo();
    if (isProviderOk(info)) {
      const b = Number(info.data?.data?.balance);
      agentBalance = Number.isFinite(b) ? b : null;
      agentCurrency = info.data?.data?.currency ?? null;
    }
  } catch { /* alan null kalır */ }
  return { callMin, agentBalance, agentCurrency };
}
