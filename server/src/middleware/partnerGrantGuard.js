import PartnerGrant from '../models/PartnerGrant.js';
import PartnerOperatorLink from '../models/PartnerOperatorLink.js';
import AuditLog from '../models/AuditLog.js';
import { runWithTenant } from '../tenancy/context.js';
import { createError } from './error.js';

const FORBIDDEN_PARTNER_ACTIONS = new Set([
  'balance:adjust',
  'withdrawal:approve',
  'kyc:document:download',
  'kyc:approve',
]);

export function enforcePartnerGrant(requiredScope) {
  return async (req, res, next) => {
    if (req.staff?.scope !== 'partner') return next();

    try {
      if (FORBIDDEN_PARTNER_ACTIONS.has(requiredScope) || req.baseUrl?.includes('balance')) {
        return next(createError(403, 'FORBIDDEN', 'Partner staff cannot perform financial operations or download KYC documents'));
      }

      const partnerId = req.staff.scopeId;
      const tenantId = req.tenant?.id;
      if (!tenantId) return next(createError(400, 'TENANT_REQUIRED', 'Tenant ID is required'));

      const link = await PartnerOperatorLink.findOne({ partnerId, tenantId, validTo: null });
      if (!link) return next(createError(404, 'TENANT_NOT_FOUND', 'Tenant not found'));

      const now = new Date();
      const grant = await PartnerGrant.findOne({
        partnerId,
        tenantId,
        scopes: requiredScope,
        validFrom: { $lte: now },
        expiresAt: { $gt: now },
        revokedAt: null,
      });
      if (!grant) {
        return next(createError(403, 'PARTNER_GRANT_REQUIRED', `Active PartnerGrant for scope '${requiredScope}' required`));
      }

      await runWithTenant(tenantId, () => AuditLog.create({
        actorType: 'admin',
        actorUsername: req.staff.username || 'partner_staff',
        actorScope: 'partner',
        actorStaffId: req.staff.id,
        partnerId,
        onBehalfOfTenantId: tenantId,
        grantId: grant._id,
        action: 'PARTNER_DATA_ACCESS',
        category: 'system',
        targetType: 'system',
        reason: grant.reason,
        metadata: { scope: requiredScope, route: req.originalUrl },
      }));

      req.partnerGrant = grant;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
