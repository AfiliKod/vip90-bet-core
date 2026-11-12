import Tenant from '../models/Tenant.js';
import { getIO } from '../services/socketEmitter.js';
import { adminRoom, clientsRoom } from '../tenancy/tenantKeys.js';
import { getTenancyMode } from '../config/tenancy.js';

export function publishToRoom(room, event, payload, { namespace = null, io = getIO() } = {}) {
  if (!io) return false;
  const target = namespace ? io.of(namespace) : io;
  if (room === null) target.emit(event, payload);
  else target.to(room).emit(event, payload);
  return true;
}

export function publishToTenant(event, payload, {
  tenantId = null, room = 'clients', namespace = null, io = null,
} = {}) {
  const target = room === 'admin' ? adminRoom(tenantId) : clientsRoom(tenantId);
  return publishToRoom(target, event, payload, { namespace, ...(io ? { io } : {}) });
}

export function publishToTenantAdmins(event, payload, { tenantId = null, io = null } = {}) {
  return publishToTenant(event, payload, { tenantId, room: 'admin', ...(io ? { io } : {}) });
}

export async function publishToAllTenants(event, payload, {
  tenants = null, room = 'clients', io = null,
} = {}) {
  const list = tenants || await Tenant.find({ status: 'active' }).select('_id').lean();
  // Single mode before the default tenant exists: broadcast as today.
  if (list.length === 0 && getTenancyMode() === 'single') {
    return publishToRoom(room === 'admin' ? adminRoom(null) : null, event, payload, io ? { io } : {}) ? 1 : 0;
  }
  let sent = 0;
  for (const tenant of list) {
    if (publishToTenant(event, payload, { tenantId: tenant._id, room, ...(io ? { io } : {}) })) sent += 1;
  }
  return sent;
}
