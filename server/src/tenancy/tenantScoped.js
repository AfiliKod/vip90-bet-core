import mongoose from 'mongoose';
import { getTenancyEnforcement } from '../config/tenancy.js';
import { tenantContext } from './context.js';
import { TenantScopeError } from './errors.js';

/** Query operations whose filter is scoped to the current tenant. */
export const SCOPED_QUERY_OPS = Object.freeze([
  'find',
  'findOne',
  'countDocuments',
  'distinct',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'findOneAndDelete',
]);

/** Collection names that hold tenant-owned data (used by the $lookup guard). */
const tenantCollections = new Set();

/** Register a collection name as tenant-owned. */
export function registerTenantCollection(name) {
  tenantCollections.add(String(name));
}

/** Whether `name` was registered as a tenant-owned collection. */
export function isTenantCollection(name) {
  return tenantCollections.has(String(name));
}

const stats = { count: 0, lastSample: null };

/** Violation counters collected in `log` mode. */
export function getScopeViolationStats() {
  return { count: stats.count, lastSample: stats.lastSample };
}

/** Reset the violation counters (tests, diagnostics). */
export function resetScopeViolationStats() {
  stats.count = 0;
  stats.lastSample = null;
}

/**
 * Report a scope violation. In `log` mode it counts and warns; in `enforce`
 * mode it throws a TenantScopeError. Callers must not invoke it in `off` mode.
 * @param {{ model: string|null, op: string|null, reason?: 'unscoped'|'cross_tenant' }} details
 */
export function reportViolation({ model, op, reason = 'unscoped' }) {
  if (getTenancyEnforcement() === 'enforce') {
    throw new TenantScopeError(`[tenancy] ${reason} ${op} on ${model}`, { model, op, reason });
  }
  stats.count += 1;
  stats.lastSample = { model, op, reason, stack: new Error().stack };
  console.warn(`[tenancy] unscoped ${op} on ${model}`);
}

function sameId(a, b) {
  return String(a) === String(b);
}

function hasValue(v) {
  return v !== undefined && v !== null;
}

function crossTenant(model, op) {
  return new TenantScopeError(`[tenancy] cross_tenant ${op} on ${model}`, {
    model,
    op,
    reason: 'cross_tenant',
  });
}

/** Context captured when a query object is built (see `captureQueryContext`). */
const QUERY_CTX = Symbol('tenancy.queryCtx');
const WRAPPED = Symbol('tenancy.wrappedQuery');

/**
 * Mongoose queries are lazy: `runWithTenant(t, () => Model.find())` returns a
 * thenable that executes only when awaited, often after the run has exited.
 * Subclass the model's Query constructor so each query remembers the context
 * it was built in; hooks prefer that over the context at execution time.
 */
function captureQueryContext(model) {
  const Base = model.Query;
  if (!Base || Base[WRAPPED]) return;
  function TenantQuery(...args) {
    Base.apply(this, args);
    this[QUERY_CTX] = tenantContext.get();
  }
  Object.setPrototypeOf(TenantQuery.prototype, Base.prototype);
  TenantQuery.base = Base.base;
  TenantQuery.prototype.constructor = Base.prototype.constructor;
  TenantQuery[WRAPPED] = true;
  model.Query = TenantQuery;
}

function queryContext(query) {
  return query[QUERY_CTX] ?? tenantContext.get();
}

/** Query pre-hook: inject/check `tenantId` in the filter. */
function scopeQuery() {
  if (getTenancyEnforcement() === 'off') return;
  const ctx = queryContext(this);
  if (ctx && ctx.mode === 'platform') return;
  const model = this.model?.modelName ?? null;
  const op = this.op;
  const filter = this.getFilter() || {};

  if (ctx && ctx.mode === 'tenant') {
    if (hasValue(filter.tenantId) && !sameId(filter.tenantId, ctx.tenantId)) {
      throw crossTenant(model, op);
    }
    this.setQuery({ ...filter, tenantId: ctx.tenantId });
    return;
  }

  if (!hasValue(filter.tenantId)) reportViolation({ model, op, reason: 'unscoped' });
}

/** Stamp/check `tenantId` on a document or plain object about to be inserted. */
function stampDoc(doc, ctx, model, op) {
  if (ctx && ctx.mode === 'tenant') {
    if (!hasValue(doc.tenantId)) {
      doc.tenantId = ctx.tenantId;
    } else if (!sameId(doc.tenantId, ctx.tenantId)) {
      throw crossTenant(model, op);
    }
    return;
  }
  if (!hasValue(doc.tenantId)) reportViolation({ model, op, reason: 'unscoped' });
}

/**
 * Mongoose plugin that scopes every query and write of a tenant-owned model to
 * the ambient tenant context. Behaviour depends on TENANCY_ENFORCEMENT, read on
 * every operation: `off` is a no-op, `log` warns and counts, `enforce` throws.
 * @param {mongoose.Schema} schema
 */
export function tenantScoped(schema) {
  if (!schema.path('tenantId')) {
    schema.add({ tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true } });
  }
  schema.$tenantScoped = true;

  // Model.init() emits 'init' synchronously at compile time (and on every
  // later init() call); captureQueryContext is idempotent.
  schema.on('init', captureQueryContext);

  schema.pre(SCOPED_QUERY_OPS, { document: false, query: true }, scopeQuery);

  // estimatedDocumentCount cannot take a filter, so it is platform-only.
  schema.pre('estimatedDocumentCount', { document: false, query: true }, function () {
    if (getTenancyEnforcement() === 'off') return;
    const ctx = queryContext(this);
    if (ctx && ctx.mode === 'platform') return;
    reportViolation({ model: this.model?.modelName ?? null, op: 'estimatedDocumentCount' });
  });

  // Only new documents are checked; İP-2 makes tenantId immutable.
  schema.pre('save', function (next) {
    if (!this.isNew || getTenancyEnforcement() === 'off') return next();
    const ctx = tenantContext.get();
    if (ctx && ctx.mode === 'platform') return next();
    try {
      stampDoc(this, ctx, this.constructor.modelName, 'save');
      next();
    } catch (err) {
      next(err);
    }
  });

  schema.pre('insertMany', function (next, docs) {
    if (getTenancyEnforcement() === 'off') return next();
    const ctx = tenantContext.get();
    if (ctx && ctx.mode === 'platform') return next();
    try {
      const list = Array.isArray(docs) ? docs : [docs];
      for (const doc of list) {
        if (doc && typeof doc === 'object') stampDoc(doc, ctx, this.modelName, 'insertMany');
      }
      next();
    } catch (err) {
      next(err);
    }
  });

  // bulkWrite ops are not inspected; only platform runs may use it.
  schema.pre('bulkWrite', function (next, _ops) {
    if (getTenancyEnforcement() === 'off') return next();
    const ctx = tenantContext.get();
    if (ctx && ctx.mode === 'platform') return next();
    try {
      reportViolation({ model: this.modelName, op: 'bulkWrite' });
      next();
    } catch (err) {
      next(err);
    }
  });
}

export default tenantScoped;
