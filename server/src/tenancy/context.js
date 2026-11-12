import { AsyncLocalStorage } from 'node:async_hooks';
import mongoose from 'mongoose';
import { resolveConnection } from './connections.js';

/** One module-level store so every hop shares the same tenant context. */
const storage = new AsyncLocalStorage();

/**
 * The per-request tenant context: `{ tenantId, brandId, actor, mode, reason,
 * connection }`, frozen once per run.
 */
export const tenantContext = {
  /** Run `fn` with `ctx` as the ambient context; returns `fn`'s return value. */
  run(ctx, fn) {
    return storage.run(ctx, fn);
  },
  /** The frozen ctx of the active run, or `undefined` outside any run. */
  get() {
    return storage.getStore();
  },
};

/**
 * Normalise a tenant id (hex string from a JWT/URL or an ObjectId) to an
 * ObjectId. Throws TypeError for null/undefined/invalid ids so a typo can
 * never silently scope queries to the wrong tenant.
 * @param {mongoose.Types.ObjectId|string} tenantId
 * @returns {mongoose.Types.ObjectId}
 */
function normalizeTenantId(tenantId) {
  if (tenantId instanceof mongoose.Types.ObjectId) return tenantId;
  if (typeof tenantId === 'string' && /^[0-9a-f]{24}$/i.test(tenantId)) {
    return new mongoose.Types.ObjectId(tenantId);
  }
  throw new TypeError(`Invalid tenantId: ${tenantId}`);
}

/**
 * Run `fn` in tenant mode for `tenantId`. The context survives awaits,
 * Promise.all and setTimeout, and concurrent runs never see each other's
 * context (AsyncLocalStorage semantics).
 * @param {mongoose.Types.ObjectId|string} tenantId
 * @param {Function} fn
 * @param {{ brandId?: mongoose.Types.ObjectId|null, actor?: { kind: 'player'|'staff'|'system', id: any, scope: any } }} [options]
 * @returns {ReturnType<Function>}
 */
export function runWithTenant(tenantId, fn, {
  brandId = null,
  actor = { kind: 'system', id: null, scope: null },
} = {}) {
  const id = normalizeTenantId(tenantId);
  const ctx = Object.freeze({
    tenantId: id,
    brandId: brandId ?? null,
    actor,
    mode: 'tenant',
    reason: null,
    connection: resolveConnection(id),
  });
  return storage.run(ctx, fn);
}

/**
 * Run `fn` with platform-wide privileges (bypasses tenant scoping) for
 * maintenance work such as migrations or cross-tenant jobs. Always logs the
 * reason so unscoped access is auditable.
 * @param {string} reason
 * @param {Function} fn
 * @returns {ReturnType<Function>}
 */
export function runAsPlatform(reason, fn) {
  if (typeof reason !== 'string' || reason.trim() === '') {
    throw new TypeError('runAsPlatform requires a non-empty reason string');
  }
  console.info('[tenancy] runAsPlatform: ' + reason);
  const ctx = Object.freeze({
    tenantId: null,
    brandId: null,
    actor: { kind: 'system', id: null, scope: null },
    mode: 'platform',
    reason,
    connection: mongoose.connection,
  });
  return storage.run(ctx, fn);
}

/**
 * The active tenant id, or `null` outside a tenant run (including platform
 * runs, where tenant scoping is deliberately bypassed).
 * @returns {mongoose.Types.ObjectId|null}
 */
export function getCurrentTenantId() {
  const ctx = storage.getStore();
  if (!ctx || ctx.mode !== 'tenant') return null;
  return ctx.tenantId;
}
