import { getCurrentTenantId } from './context.js';
import { getDefaultTenantId } from './defaultTenantId.js';
import { getTenancyMode } from '../config/tenancy.js';
import { TenantScopeError } from './errors.js';

export const PLATFORM_JOB_REASONS = Object.freeze({
  EVENT_CLEANUP: 'event-cleanup',
  AUDIT_RETENTION: 'audit-retention',
});

function unscoped() {
  return new TenantScopeError('A tenant id is required for this operation', { reason: 'unscoped' });
}

export function optionalTenantId(explicit = null) {
  const id = explicit || getCurrentTenantId();
  if (id) return String(id);
  if (getTenancyMode() === 'single') {
    const fallback = getDefaultTenantId();
    return fallback ? String(fallback) : null;
  }
  throw unscoped();
}

export function requireTenantId(explicit = null) {
  const id = optionalTenantId(explicit);
  if (!id) throw unscoped();
  return id;
}

function roomSuffix(suffix, label) {
  const value = String(suffix ?? '').trim();
  if (!value) throw new TypeError(`${label} is required`);
  return value;
}

// Today's room names. Used only in single mode before the default tenant exists
// (G1 not run yet), so behaviour stays exactly as before the upgrade. The lint
// (Task 9) allows these literals in this file only.
export const LEGACY_ADMIN_ROOM = 'role:admin';
const legacyChatRoom = (roomId) => `room:${roomId}`;

/** Single mode with no tenant yet: callers fall back to today's room names. */
function legacyMode(tenantId) {
  return getTenancyMode() === 'single' && !optionalTenantId(tenantId);
}

export function tenantRoom(tenantId, suffix) {
  return `t:${requireTenantId(tenantId)}:${suffix}`;
}

export function adminRoom(tenantId = null) {
  if (legacyMode(tenantId)) return LEGACY_ADMIN_ROOM;
  return tenantRoom(tenantId, 'admin');
}

/** null in legacy single mode: the caller broadcasts globally, exactly as today. */
export function clientsRoom(tenantId = null) {
  if (legacyMode(tenantId)) return null;
  return tenantRoom(tenantId, 'clients');
}

export function chatRoom(tenantId, roomId) {
  const id = roomSuffix(roomId, 'roomId');
  if (legacyMode(tenantId)) return legacyChatRoom(id);
  return tenantRoom(tenantId, `chat:${id}`);
}

export function liveRoom(tenantId, gameId) {
  return tenantRoom(tenantId, `live:${roomSuffix(gameId, 'gameId')}`);
}

export function cachePrefix(tenantId = null) {
  const id = optionalTenantId(tenantId);
  return id ? `t:${id}:` : 'g:';
}

export function cacheKey(prefix, tenantId = null) {
  return `${cachePrefix(tenantId)}${prefix}`;
}
