/**
 * Tenant-scoped site base URL resolution (spec §4.5, §6.3; İP-4 Task 5).
 *
 * The "site" URL used for e-mail links, OAuth returns and payment callbacks is
 * derived from the tenant's primary `Domain` record, never from the first origin
 * of `CLIENT_URL`. Single mode keeps the legacy `CLIENT_URL` fallback so an
 * existing install without `Domain` rows behaves exactly as before; multi mode
 * refuses to guess and throws `TenantScopeError`.
 */
import mongoose from 'mongoose';
import Domain from '../models/Domain.js';
import { getCurrentTenantId, tenantContext } from './context.js';
import { getTenancyMode } from '../config/tenancy.js';
import { TenantScopeError } from './errors.js';

const CACHE_TTL_MS = 30 * 1000;
const DEFAULT_CLIENT_URL = 'http://localhost:5173';
const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/i;

/** key: `${mode}|${tenantId}|${brandId}` -> { url, at } */
const cache = new Map();

function normalizeId(value) {
  if (value == null) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value === 'string' && mongoose.isValidObjectId(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  return null;
}

/**
 * First `CLIENT_URL` entry, used as the single-mode fallback when no primary
 * domain exists. Shared so no other module re-implements the comma split.
 * @param {string} [fallback]
 * @returns {string}
 */
export function clientUrlFallback(fallback = DEFAULT_CLIENT_URL) {
  return (process.env.CLIENT_URL || fallback).split(',')[0].trim();
}

function hostToOrigin(host) {
  return `${LOCAL_HOST_RE.test(host) ? 'http' : 'https'}://${host}`;
}

async function findPrimaryHost({ tenantId, brandId, requireVerified }) {
  const scope = { tenantId };
  if (requireVerified) scope.verifiedAt = { $ne: null };

  if (brandId) {
    const brandDomain = await Domain.findOne({ ...scope, brandId, isPrimary: true })
      .sort({ createdAt: 1 })
      .lean();
    if (brandDomain?.host) return brandDomain.host;
  }

  const tenantDomain = await Domain.findOne({ ...scope, isPrimary: true })
    .sort({ createdAt: 1 })
    .lean();
  return tenantDomain?.host ?? null;
}

/**
 * Resolve the tenant's site base URL (`scheme://host`, no trailing slash).
 * @param {mongoose.Types.ObjectId|string} [tenantId] defaults to the ambient tenant
 * @param {mongoose.Types.ObjectId|string} [brandId] defaults to the ambient brand
 * @returns {Promise<string>}
 * @throws {TenantScopeError} in multi mode when the tenant has no verified primary domain
 */
export async function getTenantBaseUrl(tenantId, brandId) {
  const mode = getTenancyMode();
  // Single mode: exact parity with today (first CLIENT_URL origin). The G1 boot
  // migration also creates Domain rows from the default brand, whose primary host
  // can differ from CLIENT_URL (e.g. a marketing domain), so Domain is never read here.
  if (mode !== 'multi') return clientUrlFallback();
  const ctx = tenantContext.get();
  const tenantKey = tenantId ?? getCurrentTenantId();
  const brandKey = brandId ?? (ctx?.mode === 'tenant' ? ctx.brandId : null);
  const tid = normalizeId(tenantKey);
  const bid = normalizeId(brandKey);

  const cacheKey = `${mode}|${tid ? String(tid) : 'none'}|${bid ? String(bid) : 'none'}`;
  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.url;

  let host = null;
  if (tid && mongoose.connection.readyState === 1) {
    host = await findPrimaryHost({ tenantId: tid, brandId: bid, requireVerified: mode === 'multi' });
  }

  if (host) {
    const url = hostToOrigin(host);
    cache.set(cacheKey, { url, at: now });
    return url;
  }

  if (mode === 'multi') {
    throw new TenantScopeError(
      `Tenant ${tid ? String(tid) : '(none)'} has no verified primary domain for its base URL`,
      { model: 'Domain', op: 'getTenantBaseUrl', reason: 'missing-domain' },
    );
  }

  return clientUrlFallback();
}

/**
 * The origin (scheme + host) of the tenant's site. Same value as the base URL:
 * generated links are root-relative (`/verify-email`, `/profile`, ...).
 * @param {mongoose.Types.ObjectId|string} [tenantId]
 * @param {mongoose.Types.ObjectId|string} [brandId]
 * @returns {Promise<string>}
 */
export async function getTenantOrigin(tenantId, brandId) {
  return getTenantBaseUrl(tenantId, brandId);
}

/**
 * Drop cached base URLs for one tenant (all entries when omitted).
 * @param {mongoose.Types.ObjectId|string} [tenantId]
 * @returns {void}
 */
export function invalidateTenantBaseUrl(tenantId) {
  if (tenantId == null) {
    cache.clear();
    return;
  }
  const id = String(normalizeId(tenantId) ?? tenantId);
  for (const key of [...cache.keys()]) {
    if (key.split('|')[1] === id) cache.delete(key);
  }
}
