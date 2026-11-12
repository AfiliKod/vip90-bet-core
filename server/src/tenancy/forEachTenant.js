import Tenant from '../models/Tenant.js';
import { runWithTenant } from './context.js';
import { getTenancyMode } from '../config/tenancy.js';

/**
 * Run a tenant-wide job for every tenant of `status`, each in its own tenant
 * context and sequentially, so one tenant cannot starve or leak into another.
 * A failing tenant is logged and recorded as `error`; the loop continues.
 * @param {(tenant: object) => any} fn
 * @param {{ status?: string | string[] }} [options]
 * @returns {Promise<Array<{ tenantId: import('mongoose').Types.ObjectId, result?: any, error?: Error }>>}
 */
export async function forEachTenant(fn, { status = 'active' } = {}) {
  const tenants = await Tenant.find({ status: { $in: [].concat(status) } }).sort({ _id: 1 }).lean();
  const results = [];
  // Single mode before the default tenant exists (G1 not run): run the job once
  // without a tenant context, exactly as before the upgrade, instead of silently
  // skipping it.
  if (tenants.length === 0 && getTenancyMode() === 'single') {
    try {
      results.push({ tenantId: null, result: await fn(null) });
    } catch (error) {
      console.error(`[tenancy] forEachTenant (single, no tenant): ${error.message}`);
      results.push({ tenantId: null, error });
    }
    return results;
  }
  for (const tenant of tenants) {
    try {
      const result = await runWithTenant(tenant._id, () => fn(tenant));
      results.push({ tenantId: tenant._id, result });
    } catch (error) {
      console.error(`[tenancy] forEachTenant ${tenant.key}: ${error.message}`);
      results.push({ tenantId: tenant._id, error });
    }
  }
  return results;
}
