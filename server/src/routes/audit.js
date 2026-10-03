import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import * as ctrl from '../controllers/audit.js';

const r = Router();
r.use(requireAuth, requireAdmin);

// List audit logs
r.get('/logs', ctrl.listLogs);

// Get audit statistics
r.get('/stats', ctrl.getStats);

// Export audit logs
r.get('/export', ctrl.exportLogs);

// Get audit logs for a specific target
r.get('/target/:targetType/:targetId', ctrl.getTargetLogs);

export default r;
