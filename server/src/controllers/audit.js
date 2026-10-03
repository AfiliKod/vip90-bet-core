import * as auditService from '../services/audit.js';

/**
 * List audit logs
 */
export async function listLogs(req, res, next) {
  try {
    const { page, limit, actorId, actorType, category, action, targetType, targetId, startDate, endDate, success } = req.query;
    const result = await auditService.getAuditLogs({
      page, limit, actorId, actorType, category, action, targetType, targetId, startDate, endDate, success,
    });
    res.json(result);
  } catch (e) { next(e); }
}

/**
 * Get audit statistics
 */
export async function getStats(req, res, next) {
  try {
    const { startDate, endDate, category } = req.query;
    const stats = await auditService.getAuditStats({ startDate, endDate, category });
    res.json({ stats });
  } catch (e) { next(e); }
}

/**
 * Export audit logs
 */
export async function exportLogs(req, res, next) {
  try {
    const { startDate, endDate, category, format = 'csv' } = req.query;
    const csv = await auditService.exportAuditLogs({ startDate, endDate, category });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (e) { next(e); }
}

/**
 * Get audit logs for a specific target
 */
export async function getTargetLogs(req, res, next) {
  try {
    const { targetType, targetId } = req.params;
    const { limit = 50 } = req.query;
    const logs = await auditService.getAuditLogsForTarget(targetType, targetId, Number(limit));
    res.json({ logs });
  } catch (e) { next(e); }
}
