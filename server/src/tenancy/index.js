// Public surface for premium add-ons. Core never imports premium.
// Import all tenancy primitives so add-ons can depend on a single path.

import { tenantContext } from './context.js';
import { runWithTenant, runAsPlatform, getCurrentTenantId } from './context.js';
import { TenantScopeError } from './errors.js';
import { resolveConnection, setConnectionResolver } from './connections.js';
import { tenantScoped } from './tenantScoped.js';
import { defineTenantModel, getTenantModel, listTenantModelNames } from './models.js';
import { forEachTenant } from './forEachTenant.js';
import {
  registerTenantProvisioningHook,
  runTenantProvisioningHooks,
  registerTenantCredentialSchema,
  getTenantCredentialSchema,
  listTenantCredentialSchemas,
  validateCredentialSchema,
  _resetTenancyRegistriesForTests,
} from './provisioning.js';
import { tenantFilter } from './tenantFilter.js';
import { findPaymentForCallback, findPayoutForCallback } from './callbackAttribution.js';
import StaffAccount from '../models/StaffAccount.js';
import RoleAssignment from '../models/RoleAssignment.js';
import { resolveTenantHost } from '../middleware/tenantHost.js';
import { requireStaff, requireStaffPermission } from '../middleware/auth.js';
import { signStaffAccess } from '../services/staffSession.js';

/**
 * Build a `$lookup` pipeline scoped to the current tenant's collection.
 * @param {{ from: string, localField: string, foreignField: string, as: string, pipeline?: object[] }} opts
 * @returns object
 */
function tenantLookup({ from, localField, foreignField, as } = {}) {
  return {
    $lookup: {
      from,
      as,
      let: { __lk: '$' + localField, __tid: '$tenantId' },
    },
  };
}

/**
 * Re-exports the full tenancy surface for add-ons. Import only this file:
 *   import tenancy from '../../tenancy/index.js';
 * Core never imports premium; premium add-ons import only this file,
 * e.g. from `server/src/premium/<addon>/` `../../tenancy/index.js`.
 */

export {
  tenantContext,
  runWithTenant,
  runAsPlatform,
  getCurrentTenantId,
  TenantScopeError,
  resolveConnection,
  setConnectionResolver,
  tenantScoped,
  tenantLookup,
  defineTenantModel,
  getTenantModel,
  forEachTenant,
  registerTenantProvisioningHook,
  runTenantProvisioningHooks,
  registerTenantCredentialSchema,
  getTenantCredentialSchema,
  listTenantCredentialSchemas,
  validateCredentialSchema,
  tenantFilter,
  findPaymentForCallback,
  findPayoutForCallback,
  StaffAccount,
  RoleAssignment,
  resolveTenantHost,
  requireStaff,
  requireStaffPermission,
  signStaffAccess,
};