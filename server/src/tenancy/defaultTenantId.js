import mongoose from 'mongoose';

let defaultTenantId = null;

/** Set the default tenant id used to stamp single-mode records; null clears it. */
export function setDefaultTenantId(id) {
  if (id === null) {
    defaultTenantId = null;
    return;
  }
  if (id instanceof mongoose.Types.ObjectId) {
    defaultTenantId = id;
    return;
  }
  if (typeof id === 'string' && /^[0-9a-f]{24}$/i.test(id)) {
    defaultTenantId = new mongoose.Types.ObjectId(id);
    return;
  }
  throw new TypeError(`Invalid default tenantId: ${id}`);
}

/** Return the default tenant id retained during single-mode boot, if any. */
export function getDefaultTenantId() {
  return defaultTenantId;
}
