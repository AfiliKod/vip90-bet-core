import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { requirePermission } from '../services/permissions.js';
import * as ctrl from '../controllers/playerSegment.js';

const r = Router();

// Admin — player segments
r.get('/', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.getSegmentsHandler);
r.post('/', requireAuth, requireAdmin, requirePermission('admin:settings:write'), ctrl.createSegmentHandler);
r.get('/slug/:slug', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.getSegmentBySlugHandler);
r.get('/:id', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.getSegmentById);
r.patch('/:id', requireAuth, requireAdmin, requirePermission('admin:settings:write'), ctrl.updateSegment);
r.delete('/:id', requireAuth, requireAdmin, requirePermission('admin:settings:write'), ctrl.deleteSegment);
r.post('/:id/compute', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.computeSegmentPlayers);
r.get('/:id/players', requireAuth, requireAdmin, requirePermission('admin:users:read'), ctrl.getSegmentPlayers);
r.get('/:id/stats', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.getSegmentStats);
r.post('/update-stats', requireAuth, requireAdmin, requirePermission('admin:settings:write'), ctrl.updateAllSegmentStatsHandler);

export default r;
