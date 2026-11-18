import AuditLog from '../../models/AuditLog.js';
import { runAsPlatform } from '../../tenancy/context.js';

/**
 * Activity event for platform staff about an autonomous system observation
 * (no request, no human actor): tenantId null, actorScope 'platform',
 * actorType 'system'. Used e.g. by the İP-10a capacity threshold alerts.
 */
export async function writePlatformSystemEvent(action, { targetType = 'system', targetId = null, reason = '', metadata = {} } = {}) {
  return runAsPlatform('platform_system_event', () => AuditLog.create({
    tenantId: null,
    actorType: 'system',
    actorUsername: 'system',
    actorScope: 'platform',
    action,
    category: 'system',
    targetType,
    targetId: targetId == null ? null : String(targetId),
    reason,
    metadata,
  }));
}

/**
 * Audit row for a platform-level action that belongs to no tenant (partners,
 * platform settings). Stored with tenantId null and actorScope 'platform'.
 */
export async function writePlatformLevelAudit(req, action, { targetType = 'system', targetId = null, reason = '', metadata = {} } = {}) {
  return runAsPlatform('platform_level_audit', () => AuditLog.create({
    tenantId: null,
    actorType: 'admin',
    actorUsername: req.staff?.username || String(req.staff?.id || 'platform'),
    actorScope: 'platform',
    actorStaffId: req.staff?.id || null,
    action,
    category: 'system',
    targetType,
    targetId: targetId == null ? null : String(targetId),
    ipAddress: req.ip || null,
    userAgent: req.headers?.['user-agent'] || null,
    reason,
    metadata,
  }));
}
