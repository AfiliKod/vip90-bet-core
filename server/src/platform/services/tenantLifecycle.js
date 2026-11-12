import Tenant from '../../models/Tenant.js';
import AuditLog from '../../models/AuditLog.js';
import { runWithTenant } from '../../tenancy/context.js';
import { evaluateGoLiveChecklist } from './goLiveChecklist.js';

export async function transitionTenantStatus(tenantId, newStatus, { actorStaffId, force = false, reason = '' } = {}) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new Error('Tenant not found');

  const currentStatus = tenant.status;
  if (currentStatus === newStatus) return { status: currentStatus };

  if (newStatus === 'active') {
    const checklist = await evaluateGoLiveChecklist(tenantId);
    if (!checklist.allPassed && !force) {
      const failed = Object.entries(checklist.gates).filter(([, v]) => !v.passed).map(([k]) => k);
      throw new Error(`CHECKLIST_INCOMPLETE: Cannot activate tenant. Incomplete gates: ${failed.join(', ')}`);
    }
  }

  tenant.status = newStatus;
  let retentionLockUntil = null;

  if (newStatus === 'closed') {
    tenant.closedAt = new Date();
    // K24 / K26: 5-year retention lock
    const retentionYears = 5;
    retentionLockUntil = new Date(Date.now() + retentionYears * 365 * 86400 * 1000);
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