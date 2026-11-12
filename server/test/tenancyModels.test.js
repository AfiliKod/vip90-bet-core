import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Tenant from '../src/models/Tenant.js';
import Domain from '../src/models/Domain.js';

// Own test database; never read MONGODB_URI (it may point to a real database).
const BASE = (process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017').replace(/\/+$/, '');
const DB_URI = `${BASE}/vip90_test_tenancy_models`;

describe('Tenant and Domain models', () => {
  before(async () => {
    await mongoose.connect(DB_URI);
    await mongoose.connection.dropDatabase();
    await Tenant.init();
    await Domain.init();
  });
  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('creates a tenant with defaults', async () => {
    const t = await Tenant.create({ key: 'acme', name: 'Acme' });
    assert.equal(t.status, 'provisioning'); assert.equal(t.isDefault, false);
    assert.equal(t.ownership, 'direct'); assert.equal(t.providerOperatorId, undefined);
  });
  it('key is unique, lower-cased and validated', async () => {
    await Tenant.create({ key: 'Beta', name: 'B' });
    assert.equal((await Tenant.findOne({ key: 'beta' })).key, 'beta');
    await assert.rejects(Tenant.create({ key: 'beta', name: 'B2' }), /E11000/);
    await assert.rejects(Tenant.create({ key: '-bad', name: 'x' }), /validation/i);
  });
  it('key is immutable', async () => {
    const t = await Tenant.create({ key: 'gamma', name: 'G' });
    t.key = 'delta'; await t.save();
    assert.equal((await Tenant.findById(t._id)).key, 'gamma');
  });
  it('only one isDefault tenant', async () => {
    await Tenant.create({ key: 'd1', name: 'D1', isDefault: true });
    await assert.rejects(Tenant.create({ key: 'd2', name: 'D2', isDefault: true }), /E11000/);
    await Tenant.create({ key: 'n1', name: 'N1' }); await Tenant.create({ key: 'n2', name: 'N2' }); // many non-default ok
  });
  it('providerOperatorId unique but optional', async () => {
    const op = new mongoose.Types.ObjectId();
    await Tenant.create({ key: 'p1', name: 'P1', providerOperatorId: op });
    await assert.rejects(Tenant.create({ key: 'p2', name: 'P2', providerOperatorId: op }), /E11000/);
  });
  it('status enum enforced', async () => {
    await assert.rejects(Tenant.create({ key: 's1', name: 'S', status: 'live' }), /validation/i);
  });
  it('domain host normalised and globally unique', async () => {
    const [a, b] = await Tenant.create([{ key: 'ha', name: 'A' }, { key: 'hb', name: 'B' }]);
    const d = await Domain.create({ host: ' Shop.Example.COM ', tenantId: a._id });
    assert.equal(d.host, 'shop.example.com'); assert.equal(d.purpose, 'player'); assert.equal(d.tls.status, 'none');
    await assert.rejects(Domain.create({ host: 'shop.example.com', tenantId: b._id }), /E11000/);
  });
  it('domain host rejects scheme, path and spaces; keeps port', async () => {
    const t = await Tenant.create({ key: 'hc', name: 'C' });
    for (const host of ['https://x.example', 'x.example/path', 'a b.example']) {
      await assert.rejects(Domain.create({ host, tenantId: t._id }), /validation/i);
    }
    assert.equal((await Domain.create({ host: 'localhost:5173', tenantId: t._id })).host, 'localhost:5173');
  });
  it('domain requires tenantId', async () => {
    await assert.rejects(Domain.create({ host: 'orphan.example' }), /validation/i);
  });
});
