import Domain from '../models/Domain.js';
import { getTenancyMode } from '../config/tenancy.js';
import { runWithTenant } from '../tenancy/context.js';
import { getDefaultTenantId } from '../tenancy/defaultTenantId.js';

const DOMAIN_CACHE_TTL_MS = 60_000;
const domainHostCache = new Map();

function normalizeHost(host) {
  return String(host || '').trim().toLowerCase().replace(/:(?:80|443)$/, '');
}

async function findDomainByHost(host) {
  const cached = domainHostCache.get(host);
  if (cached && cached.expiresAt > Date.now()) return cached.domain;

  // Only verified domains resolve (spec §9 G-11): an unverified host never
  // reaches a tenant.
  const domain = await Domain.findOne({ host, verifiedAt: { $ne: null } }).lean();
  domainHostCache.set(host, {
    domain,
    expiresAt: Date.now() + DOMAIN_CACHE_TTL_MS,
  });
  return domain;
}

/** Clear one normalized hostname from the cache, or every cached hostname. */
export function clearDomainHostCache(host = null) {
  if (host === null) {
    domainHostCache.clear();
    return;
  }
  domainHostCache.delete(normalizeHost(host));
}

/**
 * Resolve the request hostname to a tenant and bind it to the request context.
 * @param {{ getTenancyMode?: () => 'single'|'multi' }} [options]
 * @returns {import('express').RequestHandler}
 */
export function resolveTenantHost(options = {}) {
  const resolveMode = options.getTenancyMode || getTenancyMode;

  return async function tenantHostResolution(req, res, next) {
    try {
      // req.hostname honours X-Forwarded-Host only when Express 'trust proxy' is
      // set; reading the raw header would let any client pick another tenant.
      const host = normalizeHost(req.hostname);
      const tenancyMode = resolveMode();

      if (tenancyMode === 'single') {
        // Single mode never changes behaviour: no DB lookup per request, never 404.
        // Without a default tenant yet (G1 not run), the request continues unbound.
        const defaultTenantId = getDefaultTenantId();
        if (!defaultTenantId) return next();
        req.tenant = {
          id: defaultTenantId,
          brandId: null,
          host,
          isDefault: true,
        };
      } else {
        const domain = await findDomainByHost(host);
        if (!domain) {
          return res.status(404).json({ error: 'TENANT_NOT_FOUND', message: 'Domain not registered' });
        }
        req.tenant = {
          id: domain.tenantId,
          brandId: domain.brandId,
          host: domain.host,
          isPrimary: domain.isPrimary,
          purpose: domain.purpose,
        };
      }

      return runWithTenant(req.tenant.id, next, { brandId: req.tenant.brandId ?? null });
    } catch (error) {
      return next(error);
    }
  };
}
