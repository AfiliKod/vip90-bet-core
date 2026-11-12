import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  tenantScoped,
  SCOPED_QUERY_OPS,
  registerTenantCollection,
  isTenantCollection,
  getScopeViolationStats,
  resetScopeViolationStats,
} from '../src/tenancy/tenantScoped.js';
import { runWithTenant, runAsPlatform } from '../src/tenancy/context.js';
import { TenantScopeError } from '../src/tenancy/errors.js';

// Own test database; never read MONGODB_URI (it may point to a real database).
const BASE = (process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017').replace(/\/+$/, '');
const DB_URI = `${BASE}/vip90_test_tenancy_plugin`;

const Widget = mongoose.model('TenancyPluginWidget', new mongoose.Schema({ name: String }).plugin(tenantScoped));

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

describe('tenantScoped plugin', () => {
  const savedMode = process.env.TENANCY_MODE;
  const savedInfo = console.info;
  const savedWarn = console.warn;

  before(async () => {
    delete process.env.TENANCY_MODE; // single mode; enforcement comes from withEnforcement
    console.info = () => {};
    console.warn = () => {};
    await mongoose.connect(DB_URI);
    await mongoose.connection.dropDatabase();
    await Widget.init();
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
    await runAsPlatform('test seed', async () => {
      await Widget.deleteMany({});
      await Widget.create([
        { name: 'a1', tenantId: T1 },
        { name: 'a2', tenantId: T1 },
        { name: 'b1', tenantId: T2 },
      ]);
    });
  });

  it('exports the frozen scoped op list', () => {
    assert.ok(Object.isFrozen(SCOPED_QUERY_OPS));
    assert.ok(SCOPED_QUERY_OPS.includes('findOneAndDelete'));
    assert.equal(Widget.schema.$tenantScoped, true);
  });
  it('adds a tenantId path when missing', () => assert.ok(Widget.schema.path('tenantId')));
  it('off: unscoped find returns everything and nothing is stamped', () => withEnforcement('off', async () => {
    assert.equal((await Widget.find()).length, 3);
    const d = await runWithTenant(T1, () => Widget.create({ name: 'n' }));
    assert.equal(d.tenantId, undefined);
  }));
  it('log: tenant ctx find is scoped', () => withEnforcement('log', async () => {
    assert.equal((await runWithTenant(T1, () => Widget.find())).length, 2);
    assert.equal(await runWithTenant(T2, () => Widget.countDocuments()), 1);
  }));
  it('log: findById of another tenant doc returns null', () => withEnforcement('log', async () => {
    const other = await runAsPlatform('t', () => Widget.findOne({ tenantId: T2 }));
    assert.equal(await runWithTenant(T1, () => Widget.findById(other._id)), null);
  }));
  it('log: updateMany/deleteMany only touch own tenant', () => withEnforcement('log', async () => {
    await runWithTenant(T1, () => Widget.updateMany({}, { $set: { name: 'x' } }));
    assert.equal(await runAsPlatform('t', () => Widget.countDocuments({ name: 'x' })), 2);
    await runWithTenant(T2, () => Widget.deleteMany({}));
    assert.equal(await runAsPlatform('t', () => Widget.countDocuments()), 2);
  }));
  it('log: unscoped query outside ctx warns and counts', () => withEnforcement('log', async () => {
    resetScopeViolationStats();
    assert.equal((await Widget.find()).length, 3);
    assert.equal(getScopeViolationStats().count, 1);
    assert.equal(getScopeViolationStats().lastSample.op, 'find');
  }));
  it('enforce: unscoped find throws TenantScopeError', () => withEnforcement('enforce', async () => {
    await assert.rejects(Widget.find(), (e) => e instanceof TenantScopeError && e.reason === 'unscoped');
  }));
  it('enforce: explicit tenantId filter outside ctx is allowed', () => withEnforcement('enforce', async () => {
    assert.equal((await Widget.find({ tenantId: T1 })).length, 2);
  }));
  it('enforce: cross-tenant filter in ctx throws, same id as string does not', () => withEnforcement('enforce', async () => {
    await assert.rejects(runWithTenant(T1, () => Widget.find({ tenantId: T2 })), (e) => e.reason === 'cross_tenant');
    assert.equal((await runWithTenant(T1, () => Widget.find({ tenantId: String(T1) }))).length, 2);
  }));
  it('enforce: platform ctx bypasses', () => withEnforcement('enforce', async () => {
    assert.equal((await runAsPlatform('t', () => Widget.find())).length, 3);
  }));
  it('enforce: create stamps tenantId; mismatching tenantId throws', () => withEnforcement('enforce', async () => {
    const d = await runWithTenant(T1, () => Widget.create({ name: 'new' }));
    assert.equal(String(d.tenantId), String(T1));
    await assert.rejects(runWithTenant(T1, () => Widget.create({ name: 'bad', tenantId: T2 })), (e) => e.reason === 'cross_tenant');
    await assert.rejects(Widget.create({ name: 'orphan' }), TenantScopeError);
  }));
  it('enforce: insertMany stamps every doc', () => withEnforcement('enforce', async () => {
    const docs = await runWithTenant(T2, () => Widget.insertMany([{ name: 'a' }, { name: 'b' }]));
    assert.ok(docs.every((d) => String(d.tenantId) === String(T2)));
  }));
  it('enforce: bulkWrite only inside runAsPlatform', () => withEnforcement('enforce', async () => {
    const ops = [{ updateOne: { filter: { name: 'zzz' }, update: { $set: { name: 'y' } } } }];
    await assert.rejects(runWithTenant(T1, () => Widget.bulkWrite(ops)), TenantScopeError);
    await runAsPlatform('t', () => Widget.bulkWrite(ops));
  }));
  it('tenant collection registry', () => {
    registerTenantCollection('tenancypluginwidgets');
    assert.equal(isTenantCollection('tenancypluginwidgets'), true);
    assert.equal(isTenantCollection('events'), false);
  });
});
