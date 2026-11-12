import PartnerGrant from '../models/PartnerGrant.js';
import PartnerOperatorLink from '../models/PartnerOperatorLink.js';
import AuditLog from '../models/AuditLog.js';
import { runWithTenant } from '../tenancy/context.js';
import { createError } from '../middleware/error.js';

export async function listGrants(req, res, next) {
  try {
    const grants = await PartnerGrant.find({ tenantId: req.tenant.id })
      .populate('partnerId', 'name key')
      .populate('grantedBy', 'username email')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ grants });
  } catch (err) {
    next(err);
  }
}

export async function issueGrant(req, res, next) {
  try {
    const { partnerId, scopes, reason, durationDays = 30 } = req.body;
    if (!partnerId || !scopes || !reason) {
      throw createError(400, 'MISSING_FIELDS', 'Partner ID, scopes, and reason required');
    }

    if (req.staff.scope === 'partner') {
      throw createError(403, 'SELF_GRANT_FORBIDDEN', 'Partners cannot issue grants to themselves');
    }

    const link = await PartnerOperatorLink.findOne({ partnerId, tenantId: req.tenant.id, validTo: null });
    if (!link) throw createError(400, 'PARTNER_NOT_LINKED', 'Partner is not linked to this operator');

    const durationMs = Math.min(Number(durationDays), 90) * 86400000;
    const expiresAt = new Date(Date.now() + durationMs);
    const grant = await PartnerGrant.create({
      partnerId,
      tenantId: req.tenant.id,
      scopes,
      reason,
      validFrom: new Date(),
      expiresAt,
      grantedBy: req.staff.id,
    });

    await runWithTenant(req.tenant.id, () => AuditLog.create({
      actorType: 'admin',
      actorUsername: req.staff.username || 'tenant_admin',
      actorScope: 'tenant',
      actorStaffId: req.staff.id,
      onBehalfOfTenantId: req.tenant.id,
      action: 'PARTNER_GRANT_ISSUED',
      category: 'system',
      targetType: 'system',
      targetId: grant._id.toString(),
      metadata: { partnerId, scopes, durationDays },
    }));

    res.status(201).json({ grant });
  } catch (err) {
    next(err);
  }
}

export async function revokeGrant(req, res, next) {
  try {
    const grant = await PartnerGrant.findOne({ _id: req.params.id, tenantId: req.tenant.id });
    if (!grant) throw createError(404, 'GRANT_NOT_FOUND', 'Grant not found');

    grant.revokedAt = new Date();
    grant.revokedBy = req.staff.id;
    await grant.save();

    await runWithTenant(req.tenant.id, () => AuditLog.create({
      actorType: 'admin',
      actorUsername: req.staff.username || 'tenant_admin',
      actorScope: 'tenant',
      actorStaffId: req.staff.id,
      onBehalfOfTenantId: req.tenant.id,
      action: 'PARTNER_GRANT_REVOKED',
      category: 'system',
      targetType: 'system',
      targetId: grant._id.toString(),
    }));

    res.json({ ok: true, grant });
  } catch (err) {
    next(err);
  }
}
