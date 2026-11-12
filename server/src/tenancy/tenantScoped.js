import mongoose from 'mongoose';
import { getTenancyEnforcement, getTenancyMode } from '../config/tenancy.js';
import { tenantContext } from './context.js';
import { getDefaultTenantId } from './defaultTenantId.js';
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

/** `log` mode warning window: at most one line per model+op (spec §6.3 G7). */
export const WARN_WINDOW_MS = 60_000;

/** Last warning time per `<model>|<op>`, so an old install is not flooded. */
const lastWarnAt = new Map();

/** Violation counters collected in `log` mode. */
export function getScopeViolationStats() {
  return { count: stats.count, lastSample: stats.lastSample };
}

/** Reset the violation counters and warning window (tests, diagnostics). */
export function resetScopeViolationStats() {
  stats.count = 0;
  stats.lastSample = null;
  lastWarnAt.clear();
}

/**
 * Report a scope violation. In `log` mode it counts and warns; in `enforce`
 * mode it throws a TenantScopeError. Callers must not invoke it in `off` mode.
 * Every call is counted; the warning line is rate limited per model+op.
 * @param {{ model: string|null, op: string|null, reason?: 'unscoped'|'cross_tenant' }} details
 * @param {{ now?: number, windowMs?: number }} [limits] Clock injection (tests)
 */
export function reportViolation(
  { model, op, reason = 'unscoped' },
  { now = Date.now(), windowMs = WARN_WINDOW_MS } = {},
) {
  if (getTenancyEnforcement() === 'enforce') {
    throw new TenantScopeError(`[tenancy] ${reason} ${op} on ${model}`, { model, op, reason });
  }
  stats.count += 1;
  stats.lastSample = { model, op, reason, stack: new Error().stack };

  const key = `${model}|${op}`;
  const previous = lastWarnAt.get(key);
  if (previous !== undefined && now - previous < windowMs) return;
  lastWarnAt.set(key, now);
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
/** Context captured when an Aggregate is built (see `captureAggregateContext`). */
const AGG_CTX = Symbol('tenancy.aggregateCtx');
const WRAPPED_AGG = Symbol('tenancy.wrappedAggregate');

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

/** Single mode: the tenant of the ambient context, else the default tenant. */
function singleModeTenantId(ctx) {
  if (getTenancyMode() !== 'single') return null;
  if (ctx?.mode === 'tenant' && ctx.tenantId) return ctx.tenantId;
  return getDefaultTenantId();
}

function stampDefaultTenant(doc, ctx) {
  // Single mode stamps even with enforcement 'off' and inside a request bound by
  // resolveTenantHost (which runs every request in the default tenant's context).
  const tenantId = singleModeTenantId(ctx);
  if (!tenantId || hasValue(doc.tenantId)) return;
  doc.tenantId = tenantId;
}

function updateSetsTenantId(update) {
  return Object.prototype.hasOwnProperty.call(update, 'tenantId') ||
    Object.prototype.hasOwnProperty.call(update.$set || {}, 'tenantId') ||
    Object.prototype.hasOwnProperty.call(update.$setOnInsert || {}, 'tenantId');
}

/** Stamp the default tenant on an unscoped single-mode upsert before scoping it. */
function stampDefaultTenantOnUpsert() {
  const ctx = queryContext(this);
  const tenantId = singleModeTenantId(ctx);
  if (!tenantId || !this.getOptions().upsert) return;

  const update = this.getUpdate();
  if (!update || Array.isArray(update) || updateSetsTenantId(update)) return;
  this.setUpdate({ ...update, $setOnInsert: { ...(update.$setOnInsert || {}), tenantId } });
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

/**
 * Same laziness problem as queries: the Aggregate that `Model.aggregate()`
 * returns executes on await, usually after the tenant run has exited. Wrap the
 * model's `aggregate` so the instance remembers the context it was built in.
 */
function captureAggregateContext(model) {
  const Base = model.aggregate;
  if (typeof Base !== 'function' || Base[WRAPPED_AGG]) return;
  function TenantAggregate(pipeline, options) {
    const aggregate = Base.call(this, pipeline, options);
    if (aggregate && typeof aggregate === 'object') aggregate[AGG_CTX] = tenantContext.get();
    return aggregate;
  }
  TenantAggregate[WRAPPED_AGG] = true;
  model.aggregate = TenantAggregate;
}

function aggregateContext(aggregate) {
  return aggregate[AGG_CTX] ?? tenantContext.get();
}

/** Stages MongoDB requires at the head of a pipeline, so the tenant $match follows them. */
const LEAD_STAGES = ['$geoNear', '$search', '$searchMeta', '$vectorSearch'];

function isLeadStage(stage) {
  return !!stage && LEAD_STAGES.some((op) => Object.prototype.hasOwnProperty.call(stage, op));
}

/**
 * A `$lookup` into a tenant collection must carry the tenant guard from
 * `tenantLookup`, and a `$unionWith` into one cannot carry it at all.
 */
function guardTenantJoins(pipeline, model) {
  for (const stage of pipeline) {
    if (!stage || typeof stage !== 'object') continue;
    if (Object.prototype.hasOwnProperty.call(stage, '$lookup')) {
      const lookup = stage.$lookup;
      if (!lookup || !isTenantCollection(lookup.from)) continue;
      if (lookup.let?.tenantTid !== '$tenantId') {
        reportViolation({ model, op: 'aggregate', reason: 'cross_tenant' });
      }
    }
    if (Object.prototype.hasOwnProperty.call(stage, '$unionWith')) {
      const target = stage.$unionWith?.coll;
      if (isTenantCollection(target)) {
        reportViolation({ model, op: 'aggregate', reason: 'cross_tenant' });
      }
    }
  }
}

/** Aggregate pre-hook: scope the pipeline and reject tenant-leaking joins. */
function scopeAggregate(next) {
  if (getTenancyEnforcement() === 'off') return next();
  const ctx = aggregateContext(this);
  if (ctx && ctx.mode === 'platform') return next();
  const model = this._model?.modelName ?? null;
  const pipeline = this.pipeline();

  try {
    if (ctx && ctx.mode === 'tenant') {
      // aggregate does not cast, so the ObjectId must be injected as-is
      const at = isLeadStage(pipeline[0]) ? 1 : 0;
      pipeline.splice(at, 0, { $match: { tenantId: ctx.tenantId } });
    } else {
      const first = pipeline[0];
      const scoped = !!first && Object.prototype.hasOwnProperty.call(first, '$match') &&
        !!first.$match && Object.prototype.hasOwnProperty.call(first.$match, 'tenantId');
      if (!scoped) reportViolation({ model, op: 'aggregate' });
    }
    guardTenantJoins(pipeline, model);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Builds a `$lookup` that only joins rows of the same tenant as the outer
 * document, so it passes the aggregate guard. Use it instead of a raw `$lookup`
 * against a tenant collection. The `let` names must start with a lowercase
 * letter: MongoDB rejects user variables beginning with an underscore.
 * @param {{ from: string, localField: string, foreignField: string, as: string, pipeline?: object[] }} options
 * @returns {{$lookup: object}}
 */
export function tenantLookup({ from, localField, foreignField, as, pipeline = [] }) {
  return {
    $lookup: {
      from,
      as,
      let: { tenantLk: `$${localField}`, tenantTid: '$tenantId' },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: [`$${foreignField}`, '$$tenantLk'] },
                { $eq: ['$tenantId', '$$tenantTid'] },
              ],
            },
          },
        },
        ...pipeline,
      ],
    },
  };
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
 * Single mode stays on `off` until the G3 backfill is complete (spec §6.3 G7), so
 * documents without a `tenantId` are still read by older installs.
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
  schema.on('init', captureAggregateContext);

  schema.pre(['findOneAndUpdate', 'updateOne', 'updateMany', 'replaceOne'], { document: false, query: true }, stampDefaultTenantOnUpsert);
  schema.pre(SCOPED_QUERY_OPS, { document: false, query: true }, scopeQuery);
  schema.pre('aggregate', scopeAggregate);

  // estimatedDocumentCount cannot take a filter, so it is platform-only.
  schema.pre('estimatedDocumentCount', { document: false, query: true }, function () {
    if (getTenancyEnforcement() === 'off') return;
    const ctx = queryContext(this);
    if (ctx && ctx.mode === 'platform') return;
    reportViolation({ model: this.model?.modelName ?? null, op: 'estimatedDocumentCount' });
  });

  // Only new documents are checked; İP-2 makes tenantId immutable.
  schema.pre('save', function (next) {
    if (!this.isNew) return next();
    const ctx = tenantContext.get();
    stampDefaultTenant(this, ctx);
    if (getTenancyEnforcement() === 'off') return next();
    if (ctx && ctx.mode === 'platform') return next();
    try {
      stampDoc(this, ctx, this.constructor.modelName, 'save');
      next();
    } catch (err) {
      next(err);
    }
  });

  schema.pre('insertMany', function (next, docs) {
    const ctx = tenantContext.get();
    const list = Array.isArray(docs) ? docs : [docs];
    for (const doc of list) {
      if (doc && typeof doc === 'object') stampDefaultTenant(doc, ctx);
    }
    if (getTenancyEnforcement() === 'off') return next();
    if (ctx && ctx.mode === 'platform') return next();
    try {
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
