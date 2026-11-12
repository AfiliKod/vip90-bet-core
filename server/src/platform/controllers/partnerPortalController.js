import crypto from 'node:crypto';
import mongoose from 'mongoose';
import PartnerOperatorLink from '../../models/PartnerOperatorLink.js';
import Tenant from '../../models/Tenant.js';
import Domain from '../../models/Domain.js';
import AuditLog from '../../models/AuditLog.js';
import StaffAccount from '../../models/StaffAccount.js';
import Role from '../../models/Role.js';
import RoleAssignment from '../../models/RoleAssignment.js';
import { runWithTenant } from '../../tenancy/context.js';
import { saveScopedSetting } from '../../services/settings.js';
import { encryptSensitive } from '../../utils/secretCrypto.js';
import { provisionTenant } from '../services/provisioningService.js';
import { transitionTenantStatus } from '../services/tenantLifecycle.js';
import { createStaffInvite } from '../services/staffInvite.js';
import { buildInviteUrl } from './platformTenantsController.js';
import { writePlatformLevelAudit } from '../services/platformAudit.js';
import { createError } from '../../middleware/error.js';

function validId(id) {
  return mongoose.isObjectIdOrHexString(id);
}

async function assertLinkedTenant(partnerId, tenantId) {
  if (!validId(tenantId)) {
    throw createError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
  }
  const link = await PartnerOperatorLink.findOne({
    partnerId,
    tenantId,
    validTo: null,
  }).lean();
  if (!link) {
    throw createError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
  }
  return link;
}

async function writePartnerTenantAudit(req, tenantId, action, capability, { targetId = null, metadata = {} } = {}) {
  await runWithTenant(tenantId, () => AuditLog.create({
    actorType: 'admin',
    actorUsername: req.staff.username || 'partner',
    actorScope: 'partner',
    actorStaffId: req.staff.id,
    partnerId: req.partner._id,
    onBehalfOfTenantId: tenantId,
    action,
    category: 'system',
    targetType: 'system',
    targetId: targetId == null ? null : String(targetId),
    capability,
    ipAddress: req.ip || null,
    userAgent: req.headers['user-agent'] || null,
    metadata,
  }));
}

async function writePartnerLevelAudit(req, action, { targetId = null, metadata = {} } = {}) {
  await writePlatformLevelAudit(req, action, {
    targetId,
    metadata: { ...metadata, partnerId: req.partner._id },
  });
}

async function findPartnerStaff(partnerId, staffId) {
  if (!validId(staffId)) throw createError(404, 'STAFF_NOT_FOUND', 'Staff account not found');
  const assignment = await RoleAssignment.findOne({
    staffId,
    scopeType: 'partner',
    scopeId: partnerId,
  }).lean();
  if (!assignment) throw createError(404, 'STAFF_NOT_FOUND', 'Staff account not found');
  const staff = await StaffAccount.findById(staffId);
  if (!staff) throw createError(404, 'STAFF_NOT_FOUND', 'Staff account not found');
  return staff;
}

async function holdsPartnerRole(staffId, partnerId, roleName) {
  const role = await Role.findOne({ name: roleName, scopeType: 'partner', scopeId: null }).select('_id').lean();
  if (!role) return false;
  return Boolean(await RoleAssignment.exists({ staffId, roleId: role._id, scopeType: 'partner', scopeId: partnerId }));
}

export async function getPartnerMe(req, res, next) {
  try {
    res.json({
      partner: req.partner,
      capabilities: req.partner.capabilities || [],
    });
  } catch (err) {
    next(err);
  }
}

export async function listPartnerTenants(req, res, next) {
  try {
    const links = await PartnerOperatorLink.find({
      partnerId: req.partner._id,
      validTo: null,
    }).populate('tenantId').lean();

    const tenants = links.map((link) => link.tenantId).filter(Boolean);
    res.json({ tenants });
  } catch (err) {
    next(err);
  }
}

export async function getPartnerTenant(req, res, next) {
  try {
    await assertLinkedTenant(req.partner._id, req.params.id);
    const tenant = await Tenant.findById(req.params.id).lean();
    if (!tenant) throw createError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
    const domains = await Domain.find({ tenantId: tenant._id }).lean();
    res.json({ tenant, domains });
  } catch (err) {
    next(err);
  }
}

export async function createPartnerTenant(req, res, next) {
  try {
    const result = await provisionTenant(req.body, {
      createdByStaffId: req.staff.id,
      partnerId: req.partner._id,
      createdVia: 'partner',
    });
    const { ownerInvite, ...tenant } = result;
    res.status(201).json({
      ...tenant,
      ownerInviteUrl: ownerInvite ? buildInviteUrl(req, ownerInvite.token) : null,
    });
  } catch (err) {
    next(err);
  }
}

export async function changePartnerTenantStatus(req, res, next) {
  try {
    await assertLinkedTenant(req.partner._id, req.params.id);
    const { status, reason } = req.body;
    const result = await transitionTenantStatus(req.params.id, status, {
      actorStaffId: req.staff.id,
      actorScope: 'partner',
      partnerId: req.partner._id,
      force: false,
      reason,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function reissuePartnerTenantOwnerInvite(req, res, next) {
  try {
    await assertLinkedTenant(req.partner._id, req.params.id);
    const ownerRole = await Role.findOne({ name: 'tenant_owner', scopeType: 'tenant', scopeId: null }).select('_id').lean();
    const assignment = ownerRole && await RoleAssignment.findOne({
      roleId: ownerRole._id,
      scopeType: 'tenant',
      scopeId: req.params.id,
    }).sort({ createdAt: 1 }).lean();
    if (!assignment) throw createError(404, 'TENANT_OWNER_NOT_FOUND', 'Tenant owner not found');
    const owner = await StaffAccount.findOne({ _id: assignment.staffId, status: 'active' }).select('_id lastLoginAt').lean();
    if (!owner) throw createError(404, 'TENANT_OWNER_NOT_FOUND', 'Tenant owner not found');
    if (owner.lastLoginAt) {
      throw createError(409, 'OWNER_ALREADY_ACTIVE', 'The tenant owner has already signed in; they reset their own password');
    }

    const invite = await createStaffInvite(owner._id, { createdBy: req.staff.id });
    await writePartnerTenantAudit(req, req.params.id, 'PARTNER_TENANT_OWNER_INVITE_REISSUED', 'tenants.staff:write', {
      targetId: owner._id,
      metadata: { staffId: owner._id },
    });
    res.json({ inviteUrl: buildInviteUrl(req, invite.token), expiresAt: invite.expiresAt });
  } catch (err) {
    next(err);
  }
}

export async function updatePartnerTenantIntegrations(req, res, next) {
  try {
    await assertLinkedTenant(req.partner._id, req.params.id);
    const { provider, credentials } = req.body || {};
    if (!provider || typeof provider !== 'string' || !credentials || typeof credentials !== 'object' || Array.isArray(credentials)) {
      throw createError(400, 'INVALID_INTEGRATION', 'Provider and credentials are required');
    }

    await runWithTenant(req.params.id, () => saveScopedSetting(
      `integrations.${provider.trim().toLowerCase()}.credentials`,
      encryptSensitive(JSON.stringify(credentials)),
      req.staff.id,
    ));
    await runWithTenant(req.params.id, () => AuditLog.create({
      actorType: 'admin',
      actorUsername: req.staff.username || 'partner',
      actorScope: 'partner',
      actorStaffId: req.staff.id,
      partnerId: req.partner._id,
      onBehalfOfTenantId: req.params.id,
      action: 'PARTNER_INTEGRATION_CONFIGURED',
      category: 'provider',
      targetType: 'setting',
      capability: 'tenants.integrations',
      metadata: { provider: provider.trim().toLowerCase() },
    }));

    res.json({ ok: true, provider: provider.trim().toLowerCase(), configured: true });
  } catch (err) {
    next(err);
  }
}

export async function listPartnerStaff(req, res, next) {
  try {
    const assignments = await RoleAssignment.find({
      scopeType: 'partner',
      scopeId: req.partner._id,
    }).populate({ path: 'staffId', select: 'email username status twoFactor lastLoginAt createdAt' })
      .populate({ path: 'roleId', select: 'name displayName' })
      .lean();
    const staff = assignments.filter((assignment) => assignment.staffId).map((assignment) => ({
      ...assignment.staffId,
      assignment: { _id: assignment._id, role: assignment.roleId },
    }));
    res.json({ staff });
  } catch (err) {
    next(err);
  }
}

export async function invitePartnerStaff(req, res, next) {
  try {
    const { email, username, roleName = 'partner_ops' } = req.body || {};
    if (!email || typeof email !== 'string') throw createError(400, 'EMAIL_REQUIRED', 'Email is required');

    const role = await Role.findOne({ name: roleName, scopeType: 'partner', scopeId: null }).select('_id').lean();
    if (!role) throw createError(404, 'ROLE_NOT_FOUND', 'Partner role not found');
    // No escalation: only a partner_admin may hand out partner_admin.
    if (roleName === 'partner_admin' && !(await holdsPartnerRole(req.staff.id, req.partner._id, 'partner_admin'))) {
      throw createError(403, 'FORBIDDEN', 'Only a partner admin can invite another partner admin');
    }

    const normalizedEmail = email.toLowerCase().trim();
    let staff = await StaffAccount.findOne({ email: normalizedEmail }).select('+password');
    if (staff) {
      const ownAssignment = await RoleAssignment.exists({ staffId: staff._id, scopeType: 'partner', scopeId: req.partner._id });
      if (!ownAssignment) throw createError(409, 'STAFF_EMAIL_TAKEN', 'Staff account already exists');
      // A colleague who already signs in resets their own password; a new
      // invitation would let the inviter take the account over.
      if (staff.lastLoginAt) throw createError(409, 'STAFF_ALREADY_ACTIVE', 'This staff member has already signed in');
    } else {
      staff = await StaffAccount.create({
        email: normalizedEmail,
        username: username || normalizedEmail.split('@')[0],
        password: crypto.randomBytes(16).toString('base64url'),
        status: 'active',
        twoFactor: { enabled: false },
        createdBy: req.staff.id,
      });
    }

    await RoleAssignment.findOneAndUpdate(
      { staffId: staff._id, roleId: role._id, scopeType: 'partner', scopeId: req.partner._id },
      { $setOnInsert: { staffId: staff._id, roleId: role._id, scopeType: 'partner', scopeId: req.partner._id, grantedBy: req.staff.id } },
      { upsert: true, setDefaultsOnInsert: true },
    );
    const invite = await createStaffInvite(staff._id, { createdBy: req.staff.id });
    await writePartnerLevelAudit(req, 'PARTNER_STAFF_INVITED', {
      targetId: staff._id,
      metadata: { staffId: staff._id, roleName },
    });
    res.status(201).json({ staff: staff.toSafeObject(), inviteUrl: buildInviteUrl(req, invite.token), expiresAt: invite.expiresAt });
  } catch (err) {
    next(err);
  }
}

export async function suspendPartnerStaff(req, res, next) {
  try {
    const staff = await findPartnerStaff(req.partner._id, req.params.id);
    if (String(staff._id) === String(req.staff.id)) {
      throw createError(400, 'CANNOT_SUSPEND_SELF', 'You cannot suspend your own account');
    }
    if (await holdsPartnerRole(staff._id, req.partner._id, 'partner_admin')
      && !(await holdsPartnerRole(req.staff.id, req.partner._id, 'partner_admin'))) {
      throw createError(403, 'FORBIDDEN', 'Only a partner admin can suspend a partner admin');
    }
    staff.status = 'suspended';
    staff.tokenVersion = (staff.tokenVersion || 0) + 1;
    await staff.save();
    await writePartnerLevelAudit(req, 'PARTNER_STAFF_SUSPENDED', {
      targetId: staff._id,
      metadata: { staffId: staff._id },
    });
    res.json({ staff: staff.toSafeObject() });
  } catch (err) {
    next(err);
  }
}
