import mongoose from 'mongoose';

let resolver = null;

/**
 * Per-tenant connection resolver. By default every tenant resolves to the
 * shared mongoose.connection; multi-database deployments (or tests) plug a
 * custom resolver in with setConnectionResolver().
 * @param {import('mongoose').Types.ObjectId|null} tenantId
 * @returns {import('mongoose').Connection}
 */
export function resolveConnection(tenantId) {
  if (resolver) return resolver(tenantId);
  return mongoose.connection;
}

/**
 * Install a custom resolver. Passing null restores the default behaviour
 * (every tenant uses mongoose.connection).
 * @param {((tenantId: import('mongoose').Types.ObjectId|null) => import('mongoose').Connection)|null} fn
 */
export function setConnectionResolver(fn) {
  if (fn == null) {
    resolver = null;
    return;
  }
  if (typeof fn !== 'function') {
    throw new TypeError('setConnectionResolver expects a function or null');
  }
  resolver = fn;
}
