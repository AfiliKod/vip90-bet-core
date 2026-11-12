import jwt from 'jsonwebtoken';
import { createError } from './error.js';
import { enforceAdminIp } from './adminIpAllowlist.js';
import StaffAccount from '../models/StaffAccount.js';
import { getTenancyMode } from '../config/tenancy.js';
import { tenantContext } from '../tenancy/context.js';
import { getStaffAuthState, verifyStaffAccess } from '../services/staffSession.js';
import { staffHasPermission } from '../services/permissions.js';

// ── Token version cache (30s TTL) ────────────────────────────────────────────
// Avoids DB hit on every authenticated request while ensuring revoked tokens
// (password change, email change, role demotion) are rejected within 30 seconds.
const _tokenVersionCache = new Map();
const TOKEN_VERSION_CACHE_TTL = 30_000;

export async function getAuthState(userId) {
  const cached = _tokenVersionCache.get(userId);
  if (cached && Date.now() - cached.ts < TOKEN_VERSION_CACHE_TTL) {
    return cached;
  }
  // Lazy import to avoid circular dependency at module load time
  const { default: User } = await import('../models/User.js');
  const user = await User.findById(userId).select('tokenVersion isSeed isActive deletedAt').lean();
  // isSeed: admin demo-veri üreticisinin hesapları — kimlik doğrulaması asla
  // geçmez (login'de de reddedilir). Önceden alınmış token'ları da keser.
  // revoked: kayıt yok, askıda (isActive false) veya silinmiş — token'lar anında kesilir.
  const revoked = !user || user.isActive === false || !!user.deletedAt;
  const state = { version: user?.tokenVersion ?? 0, isSeed: user?.isSeed === true, revoked, ts: Date.now() };
  _tokenVersionCache.set(userId, state);
  return state;
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
 * tokenVersion'ı, getAuthState()'in hâlâ döndürdüğü 30 saniyelik eski
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

    // purpose taşıyan token (örn. 2FA challenge) bir oturum değildir.
    if (payload.purpose) return next(createError(401, 'INVALID_TOKEN', 'Token geçersiz'));
    // JWT_STAFF_SECRET is optional in single mode, so audience is the hard
    // boundary when staff and player tokens share JWT_SECRET.
    if (payload.aud === 'staff' || payload.aud === 'staff-refresh') {
      return next(createError(401, 'INVALID_TOKEN', 'Token geçersiz'));
    }
    if (getTenancyMode() === 'multi' && (
      payload.aud !== 'player'
      || payload.typ !== 'player'
      || !payload.sub
      || !payload.tid
    )) {
      return next(createError(401, 'INVALID_TOKEN', 'Token geçersiz'));
    }

    const userId = payload.id ?? payload.sub;
    if (!userId) return next(createError(401, 'INVALID_TOKEN', 'Token geçersiz'));

    if (payload.tid && req.tenant?.id && String(payload.tid) !== String(req.tenant.id)) {
      return next(createError(401, 'CROSS_TENANT_TOKEN', 'Farklı kiracı için düzenlenmiş token'));
    }

    // Token version check — rejects JWTs issued before last password/email/role change
    const { version: dbVersion, isSeed, revoked } = await getAuthState(userId);
    if (isSeed || revoked) {
      console.warn(`[requireAuth] demo/seed/askıdaki/silinmiş hesap reddedildi — ${req.method} ${req.originalUrl}, userId=${payload.id}`);
      return next(createError(401, 'INVALID_TOKEN', 'Token geçersiz'));
    }
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

function setStaffActor(next, req, res, staff) {
  const context = tenantContext.get();
  const continueRequest = () => enforceAdminIp(req, res, next);
  if (!context) return continueRequest();
  return tenantContext.run(Object.freeze({
    ...context,
    actor: { kind: 'staff', id: staff.id, scope: staff.scope },
  }), continueRequest);
}

export function requireStaff(allowedScope = null) {
  return async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return next(createError(401, 'UNAUTHORIZED', 'Token gerekli'));

    let payload;
    try {
      payload = verifyStaffAccess(token);
    } catch {
      return next(createError(401, 'INVALID_TOKEN', 'Geçersiz token'));
    }

    if (payload.aud !== 'staff' || payload.typ !== 'staff' || !payload.sub) {
      return next(createError(401, 'INVALID_TOKEN', 'Geçersiz token'));
    }

    try {
      const { version, revoked } = await getStaffAuthState(payload.sub);
      if (revoked || (payload.tv ?? 0) !== version) {
        return next(createError(401, 'INVALID_TOKEN', 'Geçersiz token'));
      }

      const hasOtp = Array.isArray(payload.amr) && payload.amr.includes('otp');
      if (getTenancyMode() === 'multi') {
        if (!hasOtp) return next(createError(403, 'TWO_FACTOR_REQUIRED', 'İki faktörlü doğrulama gerekli'));
      } else {
        const staff = await StaffAccount.findById(payload.sub).select('twoFactor.enabled').lean();
        if (staff?.twoFactor?.enabled && !hasOtp) {
          return next(createError(403, 'TWO_FACTOR_REQUIRED', 'İki faktörlü doğrulama gerekli'));
        }
      }

      if (allowedScope && payload.scp !== allowedScope && payload.scp !== 'platform') {
        return next(createError(403, 'FORBIDDEN', 'Bu işlem için yetki yok'));
      }
      if (payload.scp === 'tenant' && String(payload.sid) !== String(req.tenant?.id)) {
        return next(createError(403, 'CROSS_TENANT_ACCESS', 'Farklı kiracıya erişim reddedildi'));
      }

      req.staff = {
        id: payload.sub,
        scope: payload.scp,
        scopeId: payload.sid,
        amr: payload.amr,
      };
      return setStaffActor(next, req, res, req.staff);
    } catch (error) {
      return next(error);
    }
  };
}

export async function requireAdmin(req, res, next) {
  if (req.staff) {
    // Same meaning as today's role === 'admin': any tenant or platform staff
    // member. Fine-grained access stays with requirePermission on each route.
    if (!['tenant', 'platform'].includes(req.staff.scope)) {
      return next(createError(403, 'FORBIDDEN', 'Admin yetkisi gerekli'));
    }
  } else if (req.user?.role !== 'admin') {
    return next(createError(403, 'FORBIDDEN', 'Admin yetkisi gerekli'));
  }
  // V6: ADMIN_ALLOWED_IPS her personel ucunda geçerli (yalnız /api/admin mount'unda değil).
  return enforceAdminIp(req, res, next);
}

export function requireStaffPermission(permissionKey) {
  return async (req, res, next) => {
    if (!req.staff) return next(createError(401, 'UNAUTHORIZED', 'Token gerekli'));
    try {
      const allowed = await staffHasPermission(req.staff.id, permissionKey, {
        scopeType: req.staff.scope,
        scopeId: req.staff.scopeId,
      });
      if (!allowed) return next(createError(403, 'FORBIDDEN', `Yetki yok: ${permissionKey}`));
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
