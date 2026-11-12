import Tenant from '../../models/Tenant.js';
import AuditLog from '../../models/AuditLog.js';
import { runWithTenant } from '../../tenancy/context.js';
import { evaluateGoLiveChecklist } from './goLiveChecklist.js';
import { createError } from '../../middleware/error.js';

// provisioning → active | closed; active ⇄ suspended; any non-closed → closed.
// `closed` is terminal (K26: export, legal retention, controlled deletion).
export const ALLOWED_TRANSITIONS = {
  provisioning: ['active', 'closed'],
  active: ['suspended', 'closed'],
  suspended: ['active', 'closed'],
  closed: [],
};

/** Retention after closure: AUDIT_RETENTION_DAYS, never below five years (K24). */
export function legalRetentionDays(env = process.env) {
  const configured = Number.parseInt(env.AUDIT_RETENTION_DAYS || '', 10);
  return Math.max(Number.isNaN(configured) ? 1825 : configured, 1825);
}

export async function transitionTenantStatus(tenantId, newStatus, { actorStaffId, force = false, reason = '' } = {}) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw createError(404, 'TENANT_NOT_FOUND', 'Tenant not found');

  const currentStatus = tenant.status;
  if (currentStatus === newStatus) return { status: currentStatus };
  if (!(ALLOWED_TRANSITIONS[currentStatus] || []).includes(newStatus)) {
    throw createError(409, 'INVALID_TRANSITION', `Tenant cannot move from ${currentStatus} to ${newStatus}`);
  }
  if (force && !String(reason).trim()) {
    throw createError(400, 'REASON_REQUIRED', 'A forced transition needs a reason');
  }

  if (newStatus === 'active') {
    const checklist = await evaluateGoLiveChecklist(tenantId);
    if (!checklist.allPassed && !force) {
      const failed = Object.entries(checklist.gates).filter(([, v]) => !v.passed).map(([k]) => k);
      throw createError(409, 'CHECKLIST_INCOMPLETE', `CHECKLIST_INCOMPLETE: Cannot activate tenant. Incomplete gates: ${failed.join(', ')}`);
    }
  }

  tenant.status = newStatus;
  let retentionLockUntil = null;

  if (newStatus === 'closed') {
    tenant.closedAt = new Date();
    // K24 / K26: deletion locked for the legal retention period.
    retentionLockUntil = new Date(Date.now() + legalRetentionDays() * 86400 * 1000);
    tenant.legalRetentionUntil = retentionLockUntil;
  }

  await tenant.save();

  await runWithTenant(tenant._id, () => AuditLog.create({
    actorType: 'admin',
    actorUsername: 'platform',
    actorScope: 'platform',
    actorStaffId,
    onBehalfOfTenantId: tenant._id,
    action: `TENANT_STATUS_${newStatus.toUpperCase()}`,
    category: 'system',
    targetType: 'system',
    targetId: tenant._id.toString(),
    reason,
    metadata: { previousStatus: currentStatus, newStatus, force },
  }));

  return { status: newStatus, tenantId, retentionLockUntil };
}