import { Router } from 'express';
import { requireStaff, requireStaffPermission } from '../../middleware/auth.js';
import { getPortfolioMetricsHandler, getTenantMetricsHandler } from '../controllers/partnerMetricsController.js';
import {
  getPartnerMe,
  listPartnerTenants,
  getPartnerTenant,
  createPartnerTenant,
  changePartnerTenantStatus,
  reissuePartnerTenantOwnerInvite,
  updatePartnerTenantIntegrations,
  listPartnerStaff,
  invitePartnerStaff,
  suspendPartnerStaff,
} from '../controllers/partnerPortalController.js';

export function createPartnerRouter() {
  const router = Router();

  router.use(requireStaff('partner'));

  router.get('/me', getPartnerMe);
  router.get('/metrics', requireStaffPermission('partner:metrics:read'), getPortfolioMetricsHandler);
  router.get('/tenants', requireStaffPermission('partner:metrics:read'), listPartnerTenants);
  router.post('/tenants', requireStaffPermission('partner:tenants:create'), createPartnerTenant);
  router.get('/tenants/:id', requireStaffPermission('partner:metrics:read'), getPartnerTenant);
  router.get('/tenants/:id/metrics', requireStaffPermission('partner:metrics:read'), getTenantMetricsHandler);
  router.patch('/tenants/:id/status', requireStaffPermission('partner:tenants:status:write'), changePartnerTenantStatus);
  router.post('/tenants/:id/owner-invite', requireStaffPermission('partner:tenants:staff:write'), reissuePartnerTenantOwnerInvite);
  router.put('/tenants/:id/integrations', requireStaffPermission('partner:tenants:integrations:write'), updatePartnerTenantIntegrations);
  router.get('/staff', requireStaffPermission('partner:staff:write'), listPartnerStaff);
  router.post('/staff', requireStaffPermission('partner:staff:write'), invitePartnerStaff);
  router.patch('/staff/:id/suspend', requireStaffPermission('partner:staff:write'), suspendPartnerStaff);

  return router;
}
