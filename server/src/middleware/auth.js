import jwt from 'jsonwebtoken';
import { createError } from './error.js';

// ── Token version cache (30s TTL) ────────────────────────────────────────────
// Avoids DB hit on every authenticated request while ensuring revoked tokens
// (password change, email change, role demotion) are rejected within 30 seconds.
const _tokenVersionCache = new Map();
const TOKEN_VERSION_CACHE_TTL = 30_000;

async function getTokenVersion(userId) {
  const cached = _tokenVersionCache.get(userId);
  if (cached && Date.now() - cached.ts < TOKEN_VERSION_CACHE_TTL) {
    return cached.version;
  }
  // Lazy import to avoid circular dependency at module load time
  const { default: User } = await import('../models/User.js');
  const user = await User.findById(userId).select('tokenVersion').lean();
  const version = user?.tokenVersion ?? 0;
  _tokenVersionCache.set(userId, { version, ts: Date.now() });
  return version;
}

/**
 * Bump tokenVersion for a user, invalidating all existing JWTs.
 * Call this when: password change, email change, role demotion, account suspension.
 */
export async function invalidateUserTokens(userId) {
  const { default: User } = await import('../models/User.js');
  await User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } });
  _tokenVersionCache.delete(String(userId));
}

/**
 * 2026-09-23 kök neden bulgusu: controllers/auth.js'in refresh() fonksiyonu
 * her /auth/refresh çağrısında tokenVersion'ı KENDİSİ artırıp DB'ye yazıyor
 * (rotasyon — refresh token reuse tespiti), ama bu cache'i hiç haberdar
 * etmiyordu. Sonuç: yeni basılan (geçerli!) access token'ın gömülü
 * tokenVersion'ı, getTokenVersion()'ın hâlâ döndürdüğü 30 saniyelik eski
 * önbellek değerinden yüksek kalıyor — her istek "tokenVersion uyuşmazlığı"
 * ile 401 alıyordu, üstelik istemcinin otomatik retry'ı her denemede YENİ
 * bir refresh (yeni bir rotasyon artışı) tetikleyip DB değerini önbellekten
 * daha da uzaklaştırıyordu (bkz. production log: token 427→430 giderken
 * cache 426'da donuk kaldı). refresh() rotasyondan hemen sonra bunu çağırmalı.
 */
export function invalidateTokenVersionCache(userId) {
  _tokenVersionCache.delete(String(userId));
}

// 2026-09-23: production'da aralıklı, kendiliğinden düzelen 401'ler gözlendi
// (aynı admin oturumu, aynı token, saniyeler arayla bir kez 401 bir kez 200) —
// hiçbir dal buraya kadar log basmıyordu, kök neden sabitlenemedi. Bu üç log
// satırı yalnızca REDDEDEN dallarda çalışır, tokenın kendisini değil ilk/son
// birkaç karakterini yazar (üretim log'unda tam JWT'nin görünmesini önlemek için).
function tokenFingerprint(token) {
  if (!token) return null;
  return token.length > 16 ? `${token.slice(0, 8)}…${token.slice(-8)} (len ${token.length})` : `(len ${token.length})`;
}

export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    console.warn(`[requireAuth] token yok — ${req.method} ${req.originalUrl}, Authorization header: ${req.headers.authorization ? 'var ama Bearer değil/boş' : 'yok'}`);
    return next(createError(401, 'UNAUTHORIZED', 'Token gerekli'));
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Token version check — rejects JWTs issued before last password/email/role change
    const dbVersion = await getTokenVersion(payload.id);
    if ((payload.tokenVersion ?? 0) !== dbVersion) {
      console.warn(`[requireAuth] tokenVersion uyuşmazlığı — ${req.method} ${req.originalUrl}, userId=${payload.id}, token.tokenVersion=${payload.tokenVersion ?? 0}, db.tokenVersion=${dbVersion}, token=${tokenFingerprint(token)}`);
      return next(createError(401, 'INVALID_TOKEN', 'Token geçersiz'));
    }

    req.user = payload;
    next();
  } catch (e) {
    console.warn(`[requireAuth] jwt.verify başarısız — ${req.method} ${req.originalUrl}, hata: ${e.name}: ${e.message}, token=${tokenFingerprint(token)}`);
    next(createError(401, 'INVALID_TOKEN', 'Geçersiz token'));
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return next(createError(403, 'FORBIDDEN', 'Admin yetkisi gerekli'));
  next();
}
