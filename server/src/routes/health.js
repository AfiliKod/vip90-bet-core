import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { requirePermission } from '../services/permissions.js';
import * as ctrl from '../controllers/health.js';

const r = Router();

// Admin — health dashboard
r.get('/', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.getHealthOverview);
r.get('/services', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.getServiceHealth);
r.get('/system', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.getSystemHealth);
r.get('/metrics', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.getMetrics);
r.post('/check', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.forceHealthCheck);

export default r;
