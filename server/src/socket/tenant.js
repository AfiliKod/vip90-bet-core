import { getTenancyMode } from '../config/tenancy.js';
import { getDefaultTenantId } from '../tenancy/defaultTenantId.js';
import { runWithTenant } from '../tenancy/context.js';
import { resolveTenantByHost } from '../middleware/tenantHost.js';

export function createSocketTenantResolver({
  mode = getTenancyMode,
  defaultTenantId = getDefaultTenantId,
  findByHost = resolveTenantByHost,
} = {}) {
  return async function resolveSocketTenant(socket) {
    const host = socket.handshake?.headers?.host || '';
    if (mode() === 'single') {
      const id = defaultTenantId();
      return id ? { id: String(id), brandId: null, host, isDefault: true } : null;
    }
    const tenant = await findByHost(host);
    return tenant ? { ...tenant, id: String(tenant.id) } : null;
  };
}

export function socketTenantMiddleware(resolveSocketTenant) {
  return async function tenantSocketMiddleware(socket, next) {
    try {
      const tenant = await resolveSocketTenant(socket);
      // Single mode before the default tenant exists: connect unbound, as today.
      if (!tenant?.id && getTenancyMode() === 'single') return next();
      if (!tenant?.id) return next(new Error('tenant'));
      if (!socket.request) socket.request = {};
      socket.request.tenant = tenant;
      socket.data = {
        ...(socket.data || {}),
        tenantId: String(tenant.id),
        tenantBrandId: tenant.brandId ?? null,
      };
      return runWithTenant(tenant.id, next, { brandId: tenant.brandId ?? null });
    } catch {
      return next(new Error('tenant'));
    }
  };
}

export function socketPacketTenant(socket, next) {
  const tenantId = socket.data?.tenantId;
  if (!tenantId && getTenancyMode() === 'single') return next();
  if (!tenantId) return next(new Error('tenant'));
  return runWithTenant(tenantId, next, { brandId: socket.data.tenantBrandId ?? null });
}
