/**
 * Audit Trail Service (Phase 2D)
 *
 * Provides comprehensive audit logging for all important system actions.
 */
import AuditLog from '../models/AuditLog.js';

/**
 * Log an audit event.
 *
 * @param {Object} data - Audit event data
 * @returns {Object} Created audit log
 */
export async function logAuditEvent(data) {
  const {
    actorId,
    actorType,
    actorUsername,
    action,
    category,
    targetType = null,
    targetId = null,
    before = null,
    after = null,
    ipAddress = null,
    userAgent = null,
    correlationId = null,
    reason = null,
    success = true,
    errorMessage = null,
    metadata = {},
  } = data;

  const auditLog = await AuditLog.create({
    actorId,
    actorType,
    actorUsername,
    action,
    category,
    targetType,
    targetId,
    before,
    after,
    ipAddress,
    userAgent,
    correlationId,
    reason,
    success,
    errorMessage,
    metadata,
  });

  return auditLog;
}

/**
 * Get audit logs with filtering and pagination.
 *
 * @param {Object} filters - Filter options
 * @returns {Object} Paginated audit logs
 */
export async function getAuditLogs(filters = {}) {
  const {
    page = 1,
    limit = 20,
    actorId = null,
    actorType = null,
    category = null,
    action = null,
    targetType = null,
    targetId = null,
    startDate = null,
    endDate = null,
    success = null,
  } = filters;

  const skip = (Number(page) - 1) * Number(limit);
  const query = {};

  if (actorId) query.actorId = actorId;
  if (actorType) query.actorType = actorType;
  if (category) query.category = category;
  if (action) query.action = { $regex: action, $options: 'i' };
  if (targetType) query.targetType = targetType;
  if (targetId) query.targetId = targetId;
  if (success !== null) query.success = success;

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('actorId', 'username email'),
    AuditLog.countDocuments(query),
  ]);

  return {
    logs,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
  };
}

/**
 * Get audit statistics.
 *
 * @param {Object} filters - Filter options
 * @returns {Object} Audit statistics
 */
export async function getAuditStats(filters = {}) {
  const { startDate, endDate, category } = filters;

  const match = {};
  if (category) match.category = category;
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }

  const stats = await AuditLog.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          category: '$category',
          action: '$action',
        },
        count: { $sum: 1 },
        successCount: { $sum: { $cond: ['$success', 1, 0] } },
        failureCount: { $sum: { $cond: ['$success', 0, 1] } },
      },
    },
    { $sort: { count: -1 } },
  ]);

  return stats;
}

/**
 * Get audit logs for a specific target.
 *
 * @param {String} targetType - Target type
 * @param {String} targetId - Target ID
 * @param {Number} limit - Number of logs to return
 * @returns {Array} Audit logs
 */
export async function getAuditLogsForTarget(targetType, targetId, limit = 50) {
  return AuditLog.find({ targetType, targetId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('actorId', 'username email');
}

/**
 * Get recent audit logs for a user.
 *
 * @param {String} userId - User ID
 * @param {Number} limit - Number of logs to return
 * @returns {Array} Audit logs
 */
export async function getRecentUserAuditLogs(userId, limit = 50) {
  return AuditLog.find({ actorId: userId })
    .sort({ createdAt: -1 })
    .limit(limit);
}

/**
 * Export audit logs to CSV format.
 *
 * @param {Object} filters - Filter options
 * @returns {String} CSV string
 */
export async function exportAuditLogs(filters = {}) {
  const { startDate, endDate, category } = filters;

  const query = {};
  if (category) query.category = category;
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const logs = await AuditLog.find(query)
    .sort({ createdAt: -1 })
    .limit(10000)
    .populate('actorId', 'username email');

  // Convert to CSV
  const headers = ['Date', 'Actor', 'Type', 'Action', 'Category', 'Target', 'Success', 'IP', 'Reason'];
  const rows = logs.map(log => [
    log.createdAt.toISOString(),
    log.actorUsername,
    log.actorType,
    log.action,
    log.category,
    `${log.targetType}:${log.targetId || 'N/A'}`,
    log.success,
    log.ipAddress || 'N/A',
    log.reason || 'N/A',
  ]);

  return [headers, ...rows].map(row => row.join(',')).join('\n');
}
