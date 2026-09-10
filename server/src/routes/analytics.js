import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import * as ctrl from '../controllers/analytics.js';

const r = Router();
r.use(requireAuth, requireAdmin);

r.get('/overview', ctrl.getOverview);
r.get('/revenue-overview', ctrl.getRevenueOverview);
r.get('/users',    ctrl.getUserAnalytics);
r.get('/casino',   ctrl.getCasinoAnalytics);
r.get('/finance',  ctrl.getFinanceAnalytics);
r.get('/sports',   ctrl.getSportsAnalytics);

export default r;
