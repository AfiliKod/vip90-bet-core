import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  defineTenantModel,
  getTenantModel,
  listTenantModelNames,
} from '../src/tenancy/models.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { setConnectionResolver } from '../src/tenancy/connections.js';
import { isTenantCollection } from '../src/tenancy/tenantScoped.js';

// Own test databases; never read MONGODB_URI (it may point to a real database).
const BASE = (process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017').replace(/\/+$/, '');
const DB_A = `${BASE}/vip90_test_tenancy_routing_a`;
const DB_B = `${BASE}/vip90_test_tenancy_routing_b`;
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

describe('tenant model routing', () => {
  let connB;
  let Widget;
  const savedEnforcement = process.env.TENANCY_ENFORCEMENT;

  before(async () => {
    process.env.TENANCY_ENFORCEMENT = 'log';
    await mongoose.connect(DB_A);
    connB = await mongoose.createConnection(DB_B).asPromise();
    await mongoose.connection.dropDatabase();
    await connB.dropDatabase();
    Widget = defineTenantModel('TenancyRoutingWidget', new mongoose.Schema({ name: String }));
  });
  after(async () => {
    setConnectionResolver(null);
    await mongoose.connection.dropDatabase();
    await connB.dropDatabase();
    await connB.close();
    await mongoose.disconnect();
    if (savedEnforcement === undefined) delete process.env.TENANCY_ENFORCEMENT;
    else process.env.TENANCY_ENFORCEMENT = savedEnforcement;
  });

  it('defineTenantModel returns the default-connection model with the plugin', () => {
    assert.equal(Widget.db, mongoose.connection);
    assert.ok(Widget.schema.path('tenantId'));
    assert.ok(isTenantCollection(Widget.collection.collectionName));
    assert.deepEqual(listTenantModelNames(), ['TenancyRoutingWidget']);
  });
  it('duplicate definition throws', () => {
    assert.throws(() => defineTenantModel('TenancyRoutingWidget', new mongoose.Schema({})), /already defined/);
  });
  it('unknown model throws', () => assert.throws(() => getTenantModel('Nope'), /Unknown tenant model/));
  it('outside ctx and for default-routed tenants, getTenantModel is the default model', () => {
    assert.equal(getTenantModel('TenancyRoutingWidget'), Widget);
    runWithTenant(T1, () => assert.equal(getTenantModel('TenancyRoutingWidget'), Widget));
  });
  it('a tenant routed to a second connection writes there without code changes', async () => {
    setConnectionResolver((id) => (String(id) === String(T2) ? connB : mongoose.connection));
    try {
      const doc = await runWithTenant(T2, () => getTenantModel('TenancyRoutingWidget').create({ name: 'b' }));
      await runWithTenant(T1, () => getTenantModel('TenancyRoutingWidget').create({ name: 'a' }));
      assert.equal(String(doc.tenantId), String(T2));
      assert.equal(await connB.db.collection('tenancyroutingwidgets').countDocuments(), 1);
      assert.equal(await mongoose.connection.db.collection('tenancyroutingwidgets').countDocuments(), 1);
      const m1 = runWithTenant(T2, () => getTenantModel('TenancyRoutingWidget'));
      const m2 = runWithTenant(T2, () => getTenantModel('TenancyRoutingWidget'));
      assert.equal(m1, m2);
      assert.equal(m1.db, connB);
    } finally {
      setConnectionResolver(null);
    }
  });
});
