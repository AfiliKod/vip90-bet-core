import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Tenant from '../src/models/Tenant.js';
import { getCurrentTenantId, tenantContext } from '../src/tenancy/context.js';
import { forEachTenant } from '../src/tenancy/forEachTenant.js';

// Own test database; never read MONGODB_URI (it may point to a real database).
const BASE = (process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017').replace(/\/+$/, '');
const DB_URI = `${BASE}/vip90_test_tenancy_foreach`;

describe('forEachTenant', () => {
  before(async () => {
    await mongoose.connect(DB_URI);
    await mongoose.connection.dropDatabase();
    await Tenant.init();
    // Seeded through the driver: the single-letter keys the assertions use are
    // below Tenant's key validator, and the model must stay untouched here.
    const id = (n) => new mongoose.Types.ObjectId(String(n).padStart(24, '0'));
    await Tenant.collection.insertMany([
      { _id: id(1), key: 'a', name: 'A', status: 'active' },
      { _id: id(2), key: 'b', name: 'B', status: 'active' },
      { _id: id(3), key: 's', name: 'S', status: 'suspended' },
    ]);
  });
  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('runs fn once per active tenant, in _id order, inside its context', async () => {
    const seen = [];
    const out = await forEachTenant(async (t) => { seen.push([t.key, String(getCurrentTenantId())]); return t.key; });
    assert.deepEqual(seen.map((s) => s[0]), ['a', 'b']);
    assert.ok(seen.every(([, id], i) => id === String(out[i].tenantId)));
    assert.deepEqual(out.map((r) => r.result), ['a', 'b']);
  });
  it('status filter accepts an array', async () => {
    const out = await forEachTenant((t) => t.key, { status: ['active', 'suspended'] });
    assert.deepEqual(out.map((r) => r.result).sort(), ['a', 'b', 's']);
  });
  it('a failing tenant does not stop the rest', async () => {
    const out = await forEachTenant((t) => { if (t.key === 'a') throw new Error('boom'); return 'ok'; });
    assert.equal(out[0].error.message, 'boom'); assert.equal(out[1].result, 'ok');
  });
  it('caller context is untouched afterwards', async () => {
    await forEachTenant(() => {});
    assert.equal(tenantContext.get(), undefined);
  });
  it('runs sequentially', async () => {
    let active = 0, max = 0;
    await forEachTenant(async () => { active++; max = Math.max(max, active); await new Promise((r) => setTimeout(r, 5)); active--; });
    assert.equal(max, 1);
  });
  it('single mode without any tenant runs the job once without context (legacy behaviour)', async () => {
    const { default: TenantModel } = await import('../src/models/Tenant.js');
    const prev = process.env.TENANCY_MODE;
    process.env.TENANCY_MODE = 'single';
    const saved = await TenantModel.find({}).lean();
    await TenantModel.deleteMany({});
    try {
      let calls = 0; let ctx = 'unset';
      const results = await forEachTenant(async () => { calls += 1; ctx = getCurrentTenantId(); return 'ok'; });
      assert.equal(calls, 1);
      assert.equal(ctx, null);
      assert.deepEqual(results, [{ tenantId: null, result: 'ok' }]);
    } finally {
      if (saved.length) await TenantModel.collection.insertMany(saved);
      if (prev === undefined) delete process.env.TENANCY_MODE; else process.env.TENANCY_MODE = prev;
    }
  });
});
