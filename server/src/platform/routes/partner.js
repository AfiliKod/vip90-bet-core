import { Router } from 'express';
import { requireStaff, requireStaffPermission } from '../../middleware/auth.js';
import { getPortfolioMetricsHandler, getTenantMetricsHandler } from '../controllers/partnerMetricsController.js';

export function createPartnerRouter() {
  const router = Router();

  router.use(requireStaff('partner'));

  router.get('/metrics', requireStaffPermission('partner:metrics:read'), getPortfolioMetricsHandler);
  router.get('/tenants/:id/metrics', requireStaffPermission('partner:metrics:read'), getTenantMetricsHandler);

  return router;
}
