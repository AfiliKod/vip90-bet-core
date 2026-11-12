import { Router } from 'express';
import { requireStaff, requireStaffPermission } from '../../middleware/auth.js';
import {
  listTenants,
  createTenant,
  getTenant,
  changeTenantStatus,
  issueWriteGrant,
  revokeWriteGrant,
  reissueTenantOwnerInvite,
  requirePlatformOwner,
} from '../controllers/platformTenantsController.js';
import { listDomains, verifyDns, refreshTls } from '../controllers/platformDomainsController.js';
import { getScopeGates } from '../controllers/platformSystemController.js';
import { listPlatformStaff } from '../controllers/platformStaffController.js';
import {
  listPartners,
  createPartner,
  getPartner,
  updatePartner,
} from '../controllers/platformPartnersController.js';

const TENANTS_MANAGE = 'platform:tenants:manage';
const ROLES_MANAGE = 'platform:roles:manage';
const PARTNERS_MANAGE = 'platform:partners:manage';

export function createPlatformRouter() {
  const router = Router();

  router.use(requireStaff('platform'));

  router.get('/system/scope-gates', requireStaffPermission(TENANTS_MANAGE), getScopeGates);
  router.get('/tenants', requireStaffPermission(TENANTS_MANAGE), listTenants);
  router.post('/tenants', requireStaffPermission(TENANTS_MANAGE), createTenant);
  router.get('/tenants/:id', requireStaffPermission(TENANTS_MANAGE), getTenant);
  router.patch('/tenants/:id/status', requireStaffPermission(TENANTS_MANAGE), changeTenantStatus);
  router.post('/tenants/:id/write-grants', requireStaffPermission(TENANTS_MANAGE), requirePlatformOwner, issueWriteGrant);
  router.delete('/tenants/:id/write-grants/:grantId', requireStaffPermission(TENANTS_MANAGE), requirePlatformOwner, revokeWriteGrant);
  router.post('/tenants/:id/owner-invite', requireStaffPermission(TENANTS_MANAGE), reissueTenantOwnerInvite);
  router.get('/tenants/:id/domains', requireStaffPermission(TENANTS_MANAGE), listDomains);
  router.post('/tenants/:id/domains/:domainId/verify-dns', requireStaffPermission(TENANTS_MANAGE), verifyDns);
  router.post('/tenants/:id/domains/:domainId/sync-tls', requireStaffPermission(TENANTS_MANAGE), refreshTls);
  router.get('/domains', requireStaffPermission(TENANTS_MANAGE), listDomains);
  router.get('/staff', requireStaffPermission(ROLES_MANAGE), listPlatformStaff);
  router.get('/partners', requireStaffPermission(PARTNERS_MANAGE), listPartners);
  router.post('/partners', requireStaffPermission(PARTNERS_MANAGE), createPartner);
  router.get('/partners/:id', requireStaffPermission(PARTNERS_MANAGE), getPartner);
  router.patch('/partners/:id', requireStaffPermission(PARTNERS_MANAGE), updatePartner);

  return router;
}
