import AdminAction from '../models/AdminAction.js';

// Admin action logger middleware (Phase C4)
// req.user must exist (use after requireAdmin)
// Kullanım: router.post('/...', requireAdmin, auditLog('USER_BAN'), handler)

export function auditLog(action, options = {}) {
  return async (req, res, next) => {
    // Response tamamlandıktan sonra log
    res.on('finish', () => {
      // Sadece 2xx-3xx başarılı işlemleri logla (opsiyonel)
      const success = res.statusCode < 400;
      if (!success && !options.logFailures) return;

      const resourceId = req.params?.id || req.body?.userId || req.body?.id || null;
      const resource = options.resource || req.baseUrl?.split('/').pop() || null;

      AdminAction.create({
        actorId: req.user.id,
        actorUsername: req.user.username || 'unknown',
        action,
        resource,
        resourceId: resourceId ? String(resourceId) : null,
        before: options.captureBefore ? req.auditBefore : null,
        after: options.captureAfter ? req.body : null,
        ip: req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || null,
        userAgent: req.headers['user-agent'] || null,
        success,
        note: options.note || '',
      }).catch(err => console.error('[audit] log failed:', err.message));
    });
    next();
  };
}

export async function logAdminAction(actor, action, data = {}) {
  return AdminAction.create({
    actorId: actor.id,
    actorUsername: actor.username,
    action,
    ...data,
  });
}