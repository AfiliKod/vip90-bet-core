import crypto from 'node:crypto';
import Tenant from '../models/Tenant.js';
import { runWithTenant } from '../tenancy/context.js';
import { TenantScopeError } from '../tenancy/errors.js';

// Behind a reverse proxy on the same host every request arrives from loopback, so the
// loopback check alone proves nothing: INTERNAL_API_TOKEN (compared in constant time)
// is the real guard, and without a configured token this middleware does nothing.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function defaultIsLoopback(req) {
  return LOOPBACK.has(String(req.socket?.remoteAddress || ''));
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function createInternalTenantMiddleware({
  token = process.env.INTERNAL_API_TOKEN,
  findTenant = (id) => Tenant.findOne({ _id: id, status: 'active' }).lean(),
  isLoopback = defaultIsLoopback,
} = {}) {
  return async function internalTenant(req, res, next) {
    const headers = req.headers || {};
    const tenantId = headers['x-internal-tenant'];
    if (!tenantId) return next();
    if (!token || !safeEqual(headers['x-internal-token'] || '', token)) return next();
    if (!isLoopback(req)) return next();
    try {
      const tenant = await findTenant(String(tenantId));
      if (!tenant) {
        return res.status(404).json({ error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' } });
      }
      req.tenant = {
        id: String(tenant._id),
        brandId: null,
        host: headers.host || '',
        source: 'internal',
      };
      return runWithTenant(req.tenant.id, next, { brandId: null });
    } catch (error) {
      if (error instanceof TenantScopeError || error?.name === 'CastError') {
        return res.status(404).json({ error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' } });
      }
      return next(error);
    }
  };
}

export function resolveInternalTenant() {
  return createInternalTenantMiddleware();
}
