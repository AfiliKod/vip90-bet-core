import { getTenancyMode } from '../config/tenancy.js';
import { TenantScopeError } from './errors.js';

/**
 * Query filter for a record addressed by id from a request (İP-5, spec §9 G-3).
 *
 * Multi mode: the filter always carries the request tenant, so another tenant's id
 * answers "not found" (404). A request without a resolved tenant is refused.
 *
 * Single mode: the filter is returned unchanged. There is only one tenant, so no
 * cross-tenant access exists, and adding the default tenant would hide records that
 * the G3 backfill has not stamped yet (e.g. on an install where the backfill is
 * still running or failed).
 *
 * @param {{ tenant?: { id?: unknown } }} req
 * @param {object} [base]
 * @returns {object}
 */
export function tenantFilter(req, base = {}) {
  if (getTenancyMode() !== 'multi') return { ...base };
  const tenantId = req?.tenant?.id;
  if (!tenantId) throw new TenantScopeError('Request has no resolved tenant', { reason: 'unscoped' });
  return { ...base, tenantId };
}

/**
 * The request tenant id to scope a lookup with: the tenant in multi mode, `null` in
 * single mode (same reasoning as tenantFilter). Services treat `null` as "no tenant
 * filter".
 * @param {{ tenant?: { id?: unknown } }} req
 * @returns {unknown|null}
 */
export function scopeTenantId(req) {
  if (getTenancyMode() !== 'multi') return null;
  const tenantId = req?.tenant?.id;
  if (!tenantId) throw new TenantScopeError('Request has no resolved tenant', { reason: 'unscoped' });
  return tenantId;
}
