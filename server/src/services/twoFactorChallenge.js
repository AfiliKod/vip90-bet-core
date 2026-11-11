import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { createError } from '../middleware/error.js';

// Şifre (veya cüzdan/sosyal) adımı geçen, 2FA'lı hesap için kısa ömürlü,
// tek kullanımlık "ikinci faktör bekleniyor" anahtarı. Bu token bir OTURUM
// DEĞİLDİR: purpose:'2fa' taşır ve requireAuth tarafından reddedilir.
// Tek kullanım / deneme sayacı süreç belleğindedir (tek örnek dağıtım varsayımı);
// çok örnekli kurulumda paylaşımlı depo gerekir. Süre sınırı JWT exp'tir.
const TTL = '5m';
const TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const state = new Map();

// Challenge DISTINCT bir anahtarla imzalanır: JWT_SECRET ile doğrulayan hiçbir
// mevcut yer (socket, guestOnly, requireAuth...) bu token'ı oturum sanamaz.
export function challengeKey() {
  return crypto.createHash('sha256').update(`${process.env.JWT_SECRET}:2fa-challenge`).digest();
} // jti -> { used, attempts, expiresAt }

function sweep() {
  const now = Date.now();
  for (const [jti, e] of state) if (e.expiresAt <= now) state.delete(jti);
}

function entry(jti) {
  let e = state.get(jti);
  if (!e) { e = { used: false, attempts: 0, expiresAt: Date.now() + TTL_MS + 60_000 }; state.set(jti, e); }
  return e;
}

export function createChallengeToken(user, method) {
  sweep();
  return jwt.sign({
    id: String(user._id), purpose: '2fa', amr: [method],
    tokenVersion: user.tokenVersion || 0, jti: crypto.randomUUID(),
  }, challengeKey(), { expiresIn: TTL });
}

export function claimChallenge(token) {
  let payload;
  try { payload = jwt.verify(token, challengeKey()); }
  catch { throw createError(401, 'INVALID_CHALLENGE', 'Geçersiz doğrulama anahtarı'); }
  if (payload.purpose !== '2fa' || !payload.jti) throw createError(401, 'INVALID_CHALLENGE', 'Geçersiz doğrulama anahtarı');
  const e = entry(payload.jti);
  if (e.attempts >= MAX_ATTEMPTS) { e.used = true; throw createError(429, 'TOO_MANY_ATTEMPTS', 'Çok fazla doğrulama denemesi'); }
  if (e.used) throw createError(401, 'CHALLENGE_USED', 'Doğrulama anahtarı kullanılmış');
  e.attempts += 1;
  return payload;
}

export function markChallengeUsed(jti) { entry(jti).used = true; }

export function recordChallengeFailure(jti) {
  const e = entry(jti);
  if (e.attempts >= MAX_ATTEMPTS) e.used = true;
  return { locked: e.used };
}

// Eşzamanlı gönderimi engelle: claim'den hemen sonra (await öncesi) alınır.
export function acquireChallenge(jti) {
  const e = entry(jti);
  if (e.used || e.inFlight) return false;
  e.inFlight = true;
  return true;
}
export function releaseChallenge(jti) { entry(jti).inFlight = false; }
