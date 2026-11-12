import mongoose from 'mongoose';
import Tenant from '../../models/Tenant.js';
import StaffAccount from '../../models/StaffAccount.js';
import Role from '../../models/Role.js';
import RoleAssignment from '../../models/RoleAssignment.js';
import PlatformWriteGrant from '../../models/PlatformWriteGrant.js';
import AuditLog from '../../models/AuditLog.js';
import { createError } from '../../middleware/error.js';
import { runWithTenant } from '../../tenancy/context.js';
import { provisionTenant } from '../services/provisioningService.js';
import { createStaffInvite } from '../services/staffInvite.js';
import { evaluateGoLiveChecklist } from '../services/goLiveChecklist.js';
import { transitionTenantStatus } from '../services/tenantLifecycle.js';

const MAX_WRITE_GRANT_MS = 24 * 60 * 60 * 1000;

function validId(id) {
  return mongoose.isObjectIdOrHexString(id);
}

async function findTenant(id) {
  if (!validId(id)) throw createError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
  const tenant = await Tenant.findById(id);
  if (!tenant) throw createError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
  return tenant;
}

export async function writePlatformAudit(req, tenantId, action, { targetId, reason = '', metadata = {} } = {}) {
  const staff = await StaffAccount.findById(req.staff.id).select('username').lean();
  await runWithTenant(tenantId, () => AuditLog.create({
    actorType: 'admin',
    actorUsername: staff?.username || 'platform',
    actorScope: 'platform',
    actorStaffId: req.staff.id,
    onBehalfOfTenantId: tenantId,
    action,
    category: 'system',
    targetType: 'system',
    targetId: targetId ? String(targetId) : null,
    reason,
    ipAddress: req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || null,
    userAgent: req.headers['user-agent'] || null,
    metadata,
  }));
}

export async function requirePlatformOwner(req, res, next) {
  try {
    const ownerRole = await Role.findOne({ name: 'platform_owner', scopeType: 'platform', scopeId: null }).select('_id').lean();
    const assignment = ownerRole && await RoleAssignment.exists({
      staffId: req.staff.id,
      roleId: ownerRole._id,
      scopeType: 'platform',
      scopeId: null,
    });
    if (!assignment) return next(createError(403, 'FORBIDDEN', 'Platform owner role required'));
    return next();
  } catch (error) {
    return next(error);
  }
}

export async function listTenants(req, res, next) {
  try {
    const tenants = await Tenant.find({}).sort({ createdAt: -1 }).lean();
    res.json({ tenants });
  } catch (error) {
    next(error);
  }
}

export async function createTenant(req, res, next) {
  try {
    const result = await provisionTenant(req.body || {}, { createdByStaffId: req.staff.id });
    const { ownerInvite, ...tenant } = result;
    const ownerInviteUrl = ownerInvite ? buildInviteUrl(req, ownerInvite.token) : null;

    res.status(201).json({ ...tenant, ownerInviteUrl });
  } catch (error) {
    next(error);
  }
}

export async function getTenant(req, res, next) {
  try {
    const tenant = await findTenant(req.params.id);
    const checklist = await evaluateGoLiveChecklist(tenant._id);
    res.json({ tenant, checklist });
  } catch (error) {
    next(error);
  }
}

export async function changeTenantStatus(req, res, next) {
  try {
    const tenant = await findTenant(req.params.id);
    const { status, force = false, reason = '' } = req.body || {};
    const result = await transitionTenantStatus(tenant._id, status, {
      actorStaffId: req.staff.id,
      force: Boolean(force),
      reason,
    });
    await writePlatformAudit(req, tenant._id, 'PLATFORM_TENANT_STATUS_CHANGED', {
      targetId: tenant._id,
      reason,
      metadata: { status, force: Boolean(force) },
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

function grantExpiry(body, now = new Date()) {
  const requested = body?.expiresAt ? new Date(body.expiresAt) : null;
  const durationHours = Number(body?.durationHours);
  const expiresAt = requested && !Number.isNaN(requested.getTime())
    ? requested
    : new Date(now.getTime() + durationHours * 60 * 60 * 1000);

  if (!Number.isFinite(durationHours) && !requested) {
    throw createError(400, 'INVALID_WRITE_GRANT_DURATION', 'A write grant duration is required');
  }
  if (expiresAt <= now || expiresAt.getTime() - now.getTime() > MAX_WRITE_GRANT_MS) {
    throw createError(400, 'INVALID_WRITE_GRANT_DURATION', 'Write grants may last at most 24 hours');
  }
  return expiresAt;
}

export async function issueWriteGrant(req, res, next) {
  try {
    const tenant = await findTenant(req.params.id);
    const { staffId, reason } = req.body || {};
    if (!validId(staffId)) throw createError(404, 'STAFF_NOT_FOUND', 'Staff account not found');
    if (!String(reason || '').trim()) throw createError(400, 'REASON_REQUIRED', 'A write grant reason is required');
    const staff = await StaffAccount.findOne({ _id: staffId, status: 'active' }).select('_id').lean();
    if (!staff) throw createError(404, 'STAFF_NOT_FOUND', 'Staff account not found');

    const expiresAt = grantExpiry(req.body);
    const grant = await PlatformWriteGrant.create({
      staffId: staff._id,
      tenantId: tenant._id,
      reason: String(reason).trim(),
      expiresAt,
      grantedBy: req.staff.id,
    });
    await writePlatformAudit(req, tenant._id, 'PLATFORM_WRITE_GRANT_ISSUED', {
      targetId: grant._id,
      reason: grant.reason,
      metadata: { staffId: grant.staffId, expiresAt: grant.expiresAt },
    });
    res.status(201).json({ grant });
  } catch (error) {
    next(error);
  }
}

export async function revokeWriteGrant(req, res, next) {
  try {
    const tenant = await findTenant(req.params.id);
    if (!validId(req.params.grantId)) throw createError(404, 'WRITE_GRANT_NOT_FOUND', 'Write grant not found');
    const grant = await PlatformWriteGrant.findOne({ _id: req.params.grantId, tenantId: tenant._id });
    if (!grant) throw createError(404, 'WRITE_GRANT_NOT_FOUND', 'Write grant not found');

    if (!grant.revokedAt) {
      grant.revokedAt = new Date();
      grant.status = 'revoked';
      await grant.save();
      await writePlatformAudit(req, tenant._id, 'PLATFORM_WRITE_GRANT_REVOKED', {
        targetId: grant._id,
        reason: grant.reason,
        metadata: { staffId: grant.staffId },
      });
    }
    res.json({ grant });
  } catch (error) {
    next(error);
  }
}

export function platformOrigin(req) {
  const configured = String(process.env.PLATFORM_HOST || '').trim().replace(/\/$/, '');
  if (configured) {
    if (/^https?:\/\//i.test(configured)) return configured;
    return `${req.protocol}://${configured}`;
  }
  // req.hostname honours X-Forwarded-Host only behind a trusted proxy.
  return `${req.protocol}://${req.hostname}`;
}

export function buildInviteUrl(req, token) {
  return `${platformOrigin(req)}/console/accept-invite?token=${encodeURIComponent(token)}`;
}

export async function reissueTenantOwnerInvite(req, res, next) {
  try {
    const tenant = await findTenant(req.params.id);
    const ownerRole = await Role.findOne({ name: 'tenant_owner', scopeType: 'tenant', scopeId: null }).select('_id').lean();
    const assignment = ownerRole && await RoleAssignment.findOne({
      roleId: ownerRole._id,
      scopeType: 'tenant',
      scopeId: tenant._id,
    }).sort({ createdAt: 1 }).lean();
    if (!assignment) throw createError(404, 'TENANT_OWNER_NOT_FOUND', 'Tenant owner not found');
    const owner = await StaffAccount.findOne({ _id: assignment.staffId, status: 'active' }).select('_id lastLoginAt').lean();
    if (!owner) throw createError(404, 'TENANT_OWNER_NOT_FOUND', 'Tenant owner not found');
    // K23: platform staff must not be able to take over an owner who already
    // uses the account; a re-issued link would let them set its password.
    if (owner.lastLoginAt) {
      throw createError(409, 'OWNER_ALREADY_ACTIVE', 'The tenant owner has already signed in; they reset their own password');
    }

    const invite = await createStaffInvite(owner._id, { createdBy: req.staff.id });
    await writePlatformAudit(req, tenant._id, 'TENANT_OWNER_INVITE_REISSUED', {
      targetId: owner._id,
      metadata: { staffId: owner._id },
    });
    res.json({ inviteUrl: buildInviteUrl(req, invite.token), expiresAt: invite.expiresAt });
  } catch (error) {
    next(error);
  }
}
