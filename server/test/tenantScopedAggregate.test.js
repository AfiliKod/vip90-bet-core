import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  tenantScoped,
  tenantLookup,
  registerTenantCollection,
  getScopeViolationStats,
  resetScopeViolationStats,
} from '../src/tenancy/tenantScoped.js';
import { runWithTenant, runAsPlatform } from '../src/tenancy/context.js';
import { TenantScopeError } from '../src/tenancy/errors.js';

// Own test database; never read MONGODB_URI (it may point to a real database).
const BASE = (process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017').replace(/\/+$/, '');
const DB_URI = `${BASE}/vip90_test_tenancy_aggregate`;

const AggOrder = mongoose.model(
  'AggOrder',
  new mongoose.Schema({ name: String, itemKey: String }).plugin(tenantScoped),
);
const AggItem = mongoose.model(
  'AggItem',
  new mongoose.Schema({ key: String, label: String }).plugin(tenantScoped),
);

const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

/** Run `fn` with TENANCY_ENFORCEMENT set to `mode`, restoring the previous value. */
async function withEnforcement(mode, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, 'TENANCY_ENFORCEMENT');
  const prev = process.env.TENANCY_ENFORCEMENT;
  process.env.TENANCY_ENFORCEMENT = mode;
  try {
    return await fn();
  } finally {
    if (had) process.env.TENANCY_ENFORCEMENT = prev;
    else delete process.env.TENANCY_ENFORCEMENT;
  }
}

describe('tenantScoped aggregate scoping', () => {
  const savedMode = process.env.TENANCY_MODE;
  const savedInfo = console.info;
  const savedWarn = console.warn;

  before(async () => {
    delete process.env.TENANCY_MODE; // single mode; enforcement comes from withEnforcement
    console.info = () => {};
    console.warn = () => {};
    await mongoose.connect(DB_URI);
    await mongoose.connection.dropDatabase();
    registerTenantCollection(AggOrder.collection.collectionName);
    registerTenantCollection(AggItem.collection.collectionName);
    await AggOrder.init();
    await AggItem.init();
  });
  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    if (savedMode === undefined) delete process.env.TENANCY_MODE;
    else process.env.TENANCY_MODE = savedMode;
    console.info = savedInfo;
    console.warn = savedWarn;
  });
  beforeEach(async () => {
    // Same itemKey/key on both tenants: a leaking $lookup would show up.
    await runAsPlatform('test seed', async () => {
      await AggOrder.deleteMany({});
      await AggItem.deleteMany({});
      await AggOrder.create([
        { name: 'o1', itemKey: 'k1', tenantId: T1 },
        { name: 'o2', itemKey: 'k1', tenantId: T1 },
        { name: 'o3', itemKey: 'k1', tenantId: T2 },
        { name: 'o4', itemKey: 'k1', tenantId: T2 },
      ]);
      await AggItem.create([
        { key: 'k1', label: 'one', tenantId: T1 },
        { key: 'k1', label: 'two', tenantId: T2 },
      ]);
    });
  });

  it('tenant ctx aggregate sees only own rows', () => withEnforcement('enforce', async () => {
    const rows = await runWithTenant(T1, () => AggOrder.aggregate([{ $group: { _id: null, n: { $sum: 1 } } }]));
    assert.equal(rows[0].n, 2);
  }));
  it('hex string tenant in ctx still matches (ObjectId injected)', () => withEnforcement('enforce', async () => {
    const rows = await runWithTenant(String(T1), () => AggOrder.aggregate([{ $match: {} }]));
    assert.equal(rows.length, 2);
  }));
  it('no ctx without leading tenantId $match throws in enforce', () => withEnforcement('enforce', async () => {
    await assert.rejects(AggOrder.aggregate([{ $match: {} }]), TenantScopeError);
    assert.equal((await AggOrder.aggregate([{ $match: { tenantId: T1 } }])).length, 2);
  }));
  it('raw $lookup into tenant collection throws', () => withEnforcement('enforce', async () => {
    const raw = { $lookup: { from: 'aggitems', localField: 'itemKey', foreignField: 'key', as: 'item' } };
    await assert.rejects(runWithTenant(T1, () => AggOrder.aggregate([raw])), TenantScopeError);
  }));
  it('tenantLookup joins only same-tenant rows', () => withEnforcement('enforce', async () => {
    const rows = await runWithTenant(T1, () => AggOrder.aggregate([
      tenantLookup({ from: 'aggitems', localField: 'itemKey', foreignField: 'key', as: 'item' })]));
    assert.ok(rows.every((r) => r.item.length === 1 && String(r.item[0].tenantId) === String(T1)));
  }));
  it('$lookup into a platform collection is allowed', () => withEnforcement('enforce', async () => {
    await runWithTenant(T1, () => AggOrder.aggregate([{ $lookup: { from: 'tenants', localField: 'tenantId', foreignField: '_id', as: 't' } }]));
  }));
  it('platform ctx aggregate is untouched', () => withEnforcement('enforce', async () => {
    assert.equal((await runAsPlatform('t', () => AggOrder.aggregate([{ $match: {} }]))).length, 4);
  }));
  it('log mode counts unscoped aggregate', () => withEnforcement('log', async () => {
    resetScopeViolationStats(); await AggOrder.aggregate([{ $match: {} }]);
    assert.equal(getScopeViolationStats().lastSample.op, 'aggregate');
  }));
  it('off mode does not inject', () => withEnforcement('off', async () => {
    assert.equal((await runWithTenant(T1, () => AggOrder.aggregate([{ $match: {} }]))).length, 4);
  }));
});
