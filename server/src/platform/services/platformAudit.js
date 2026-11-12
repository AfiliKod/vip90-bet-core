import AuditLog from '../../models/AuditLog.js';
import { runAsPlatform } from '../../tenancy/context.js';

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
