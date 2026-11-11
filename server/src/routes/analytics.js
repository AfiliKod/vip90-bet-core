import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { requirePermission } from '../services/permissions.js';
import * as ctrl from '../controllers/analytics.js';

const r = Router();
r.use(requireAuth, requireAdmin, requirePermission('admin:reports:read'));

r.get('/overview', ctrl.getOverview);
r.get('/revenue-overview', ctrl.getRevenueOverview);
r.get('/users',    ctrl.getUserAnalytics);
r.get('/casino',   ctrl.getCasinoAnalytics);
r.get('/finance',  ctrl.getFinanceAnalytics);
r.get('/sports',   ctrl.getSportsAnalytics);

export default r;
