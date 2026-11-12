import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createError } from './error.js';
import { enforceAdminIp } from './adminIpAllowlist.js';
import StaffAccount from '../models/StaffAccount.js';
import Tenant from '../models/Tenant.js';
import { getTenancyMode } from '../config/tenancy.js';
import { runWithTenant, tenantContext } from '../tenancy/context.js';
import { getStaffAuthState, verifyStaffAccess } from '../services/staffSession.js';
import { staffHasPermission } from '../services/permissions.js';
import PlatformWriteGrant from '../models/PlatformWriteGrant.js';
import Partner from '../models/Partner.js';
import PartnerOperatorLink from '../models/PartnerOperatorLink.js';
import PartnerGrant from '../models/PartnerGrant.js';

const SAFE_TENANT_ROUTE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

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
  if (req.tenant?.id) {
    return runWithTenant(req.tenant.id, continueRequest, {
      brandId: req.tenant.brandId ?? null,
      actor: { kind: 'staff', id: staff.id, scope: staff.scope },
    });
  }
  if (!context) return continueRequest();
  return tenantContext.run(Object.freeze({
    ...context,
    actor: { kind: 'staff', id: staff.id, scope: staff.scope },
  }), continueRequest);
}

async function auditPlatformReadOnlyViolation(req, payload) {
  try {
    const [{ default: AuditLog }, staff] = await Promise.all([
      import('../models/AuditLog.js'),
      StaffAccount.findById(payload.sub).select('username').lean(),
    ]);
    const method = String(req.method || '').toUpperCase();
    const route = req.originalUrl || req.baseUrl || req.path || '';

    await runWithTenant(req.tenant.id, () => AuditLog.create({
      actorType: 'admin',
      actorUsername: staff?.username || String(payload.sub),
      actorScope: 'platform',
      actorStaffId: payload.sub,
      onBehalfOfTenantId: req.tenant.id,
      action: 'PLATFORM_READ_ONLY',
      category: 'system',
      targetType: 'system',
      ipAddress: req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || null,
      userAgent: req.headers['user-agent'] || null,
      reason: 'Platform staff are read-only on tenant routes',
      success: false,
      errorMessage: 'PLATFORM_READ_ONLY',
      metadata: { route, method },
    }));
  } catch (error) {
    console.error('[auth] platform read-only audit log failed:', error.message);
  }
}

async function auditPlatformWriteException(req, payload, grant) {
  const [{ default: AuditLog }, staff] = await Promise.all([
    import('../models/AuditLog.js'),
    StaffAccount.findById(payload.sub).select('username').lean(),
  ]);
  const method = String(req.method || '').toUpperCase();
  const route = req.originalUrl || req.baseUrl || req.path || '';

  await runWithTenant(req.tenant.id, () => AuditLog.create({
    actorType: 'admin',
    actorUsername: staff?.username || String(payload.sub),
    actorScope: 'platform',
    actorStaffId: payload.sub,
    onBehalfOfTenantId: req.tenant.id,
    action: 'PLATFORM_WRITE_EXCEPTION',
    category: 'system',
    targetType: 'system',
    ipAddress: req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || null,
    userAgent: req.headers['user-agent'] || null,
    reason: grant.reason,
    metadata: {
      grantId: grant._id,
      route,
      method,
    },
  }));
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

      const partnerTenantRequest = allowedScope === 'tenant' && payload.scp === 'partner';
      if (allowedScope && payload.scp !== allowedScope && payload.scp !== 'platform' && !partnerTenantRequest) {
        return next(createError(403, 'FORBIDDEN', 'Bu işlem için yetki yok'));
      }
      if (payload.scp === 'partner') {
        const partner = await Partner.findById(payload.sid).lean();
        if (!partner) {
          if (partnerTenantRequest) {
            return next(createError(403, 'FORBIDDEN', 'Bu işlem için yetki yok'));
          }
          return next(createError(404, 'PARTNER_NOT_FOUND', 'Partner bulunamadı'));
        }
        if (partner.status === 'suspended') {
          return next(createError(403, 'PARTNER_SUSPENDED', 'Partner hesabı askıya alınmış'));
        }
        if (partner.status === 'closed') {
          return next(createError(403, 'PARTNER_CLOSED', 'Partner hesabı kapatılmış'));
        }
        req.partner = partner;
      }
      if (allowedScope === 'tenant' && payload.scp === 'platform') {
        const tenantId = req.headers['x-tenant-id'];
        if (!tenantId) {
          return next(createError(400, 'TENANT_REQUIRED', 'Kiracı kimliği gerekli'));
        }
        if (!mongoose.isObjectIdOrHexString(tenantId)) {
          return next(createError(404, 'TENANT_NOT_FOUND', 'Kiracı bulunamadı'));
        }
        const tenant = await Tenant.findOne({ _id: tenantId, status: { $ne: 'closed' } }).lean();
        if (!tenant) {
          return next(createError(404, 'TENANT_NOT_FOUND', 'Kiracı bulunamadı'));
        }
        req.tenant = {
          id: tenant._id,
          brandId: null,
        };
      }
      if (partnerTenantRequest) {
        const tenantId = req.headers['x-tenant-id'];
        if (!tenantId) {
          return next(createError(400, 'TENANT_REQUIRED', 'Kiracı kimliği gerekli'));
        }
        if (!mongoose.isObjectIdOrHexString(tenantId)) {
          return next(createError(404, 'TENANT_NOT_FOUND', 'Kiracı bulunamadı'));
        }
        const link = await PartnerOperatorLink.findOne({
          partnerId: payload.sid,
          tenantId,
          validTo: null,
        }).lean();
        if (!link) {
          return next(createError(404, 'TENANT_NOT_FOUND', 'Kiracı bulunamadı'));
        }
        // A partner reaches tenant routes only under an active PartnerGrant
        // (spec §4.3, K27); route-level scopes are checked by enforcePartnerGrant.
        const now = new Date();
        const grant = await PartnerGrant.findOne({
          partnerId: payload.sid,
          tenantId: link.tenantId,
          validFrom: { $lte: now },
          expiresAt: { $gt: now },
          revokedAt: null,
        }).lean();
        if (!grant) {
          return next(createError(403, 'PARTNER_GRANT_REQUIRED', 'Bu kiracı için etkin partner izni yok'));
        }
        req.partnerGrant = grant;
        req.tenant = { id: link.tenantId, brandId: null };
      }
      if (payload.scp === 'tenant' && String(payload.sid) !== String(req.tenant?.id)) {
        return next(createError(403, 'CROSS_TENANT_ACCESS', 'Farklı kiracıya erişim reddedildi'));
      }

      if (allowedScope === 'tenant' && payload.scp === 'platform' && req.method &&
          !SAFE_TENANT_ROUTE_METHODS.has(String(req.method || '').toUpperCase())) {
        const activeGrant = await PlatformWriteGrant.findOne({
          staffId: payload.sub,
          tenantId: req.tenant.id,
          expiresAt: { $gt: new Date() },
          revokedAt: null,
          status: 'active',
        });

        if (!activeGrant) {
          await auditPlatformReadOnlyViolation(req, payload);
          return next(createError(403, 'PLATFORM_READ_ONLY', 'Platform personeli kiracı rotalarında yalnızca okuma yapabilir'));
        }

        req.platformWriteGrant = activeGrant;
        await auditPlatformWriteException(req, payload, activeGrant);
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
        partnerCapabilities: req.staff.scope === 'partner' ? (req.partner?.capabilities ?? null) : null,
      });
      if (!allowed) return next(createError(403, 'FORBIDDEN', `Yetki yok: ${permissionKey}`));
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
