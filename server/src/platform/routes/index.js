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
import {
  getCrossTenantReportHandler,
  getSportsbookReportHandler,
  getPartnerBalancesReportHandler,
  exportCrossTenantCsvHandler,
  exportSportsbookCsvHandler,
} from '../controllers/platformReportsController.js';
import {
  listOperatorFeePlans,
  createOrUpdateFeePlan,
  listStatements,
  getStatement,
  generateStatementsHandler,
  issueStatementHandler,
  addAdjustmentHandler,
  voidStatementHandler,
  exportStatementCsvHandler,
} from '../controllers/platformBillingController.js';

const TENANTS_MANAGE = 'platform:tenants:manage';
const ROLES_MANAGE = 'platform:roles:manage';
const PARTNERS_MANAGE = 'platform:partners:manage';
const REPORTS_READ = 'platform:reports:read';
const BILLING_READ = 'platform:billing:read';
const BILLING_MANAGE = 'platform:billing:manage';

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
  router.get('/billing/plans', requireStaffPermission(BILLING_READ), listOperatorFeePlans);
  router.post('/billing/plans', requireStaffPermission(BILLING_MANAGE), createOrUpdateFeePlan);
  router.get('/billing/statements', requireStaffPermission(BILLING_READ), listStatements);
  router.get('/billing/statements/:id', requireStaffPermission(BILLING_READ), getStatement);
  router.post('/billing/statements/generate', requireStaffPermission(BILLING_MANAGE), generateStatementsHandler);
  router.post('/billing/statements/:id/issue', requireStaffPermission(BILLING_MANAGE), issueStatementHandler);
  router.post('/billing/statements/:id/adjustments', requireStaffPermission(BILLING_MANAGE), addAdjustmentHandler);
  router.post('/billing/statements/:id/void', requireStaffPermission(BILLING_MANAGE), voidStatementHandler);
  router.get('/billing/statements/:id/export', requireStaffPermission(BILLING_READ), exportStatementCsvHandler);

  router.get('/reports/cross-tenant', requireStaffPermission(REPORTS_READ), getCrossTenantReportHandler);
  router.get('/reports/sportsbook-odds', requireStaffPermission(REPORTS_READ), getSportsbookReportHandler);
  router.get('/reports/cross-tenant/export', requireStaffPermission(REPORTS_READ), exportCrossTenantCsvHandler);
  router.get('/reports/sportsbook-odds/export', requireStaffPermission(REPORTS_READ), exportSportsbookCsvHandler);
  router.get('/reports/partner-balances', requireStaffPermission(REPORTS_READ), getPartnerBalancesReportHandler);
  router.get('/reports/commercial-balances', requireStaffPermission(REPORTS_READ), getPartnerBalancesReportHandler);

  return router;
}
