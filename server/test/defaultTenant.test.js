import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Tenant from '../src/models/Tenant.js';
import Domain from '../src/models/Domain.js';
import Brand from '../src/models/Brand.js';
import Migration from '../src/models/Migration.js';
import { discoverMigrations } from '../migrations/index.js';
import {
  hostsFromClientUrl,
  ensureDefaultTenant,
  runTenancyBoot,
} from '../src/tenancy/defaultTenant.js';

// Own test database; never read MONGODB_URI (it may point to a real database).
const BASE = (process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017').replace(/\/+$/, '');
const DB_URI = `${BASE}/vip90_test_tenancy_default`;

describe('default tenant boot migration (G1)', () => {
  before(async () => {
    await mongoose.connect(DB_URI);
    await mongoose.connection.dropDatabase();
  });
  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    await Promise.all([
      Tenant.deleteMany({}),
      Domain.deleteMany({}),
      Brand.deleteMany({}),
      Migration.deleteMany({}),
    ]);
    await Tenant.init(); await Domain.init();
  });

  it('hostsFromClientUrl normalises, dedupes and skips junk', () => {
    assert.deepEqual(hostsFromClientUrl(' https://Site.Example/, https://site.example ,*,http://localhost:5173,not a url'),
      ['site.example', 'localhost:5173']);
    assert.deepEqual(hostsFromClientUrl(undefined), []);
  });
  it('creates exactly one default tenant and records the migration', async () => {
    const r = await ensureDefaultTenant({ env: {}, findProviderOperatorId: async () => null });
    assert.equal(r.created, true);
    assert.equal(r.tenant.key, 'default'); assert.equal(r.tenant.isDefault, true); assert.equal(r.tenant.status, 'active');
    assert.equal(r.tenant.providerOperatorId, undefined);
    assert.equal(await Migration.countDocuments({ name: 'tenancy-001-default-tenant' }), 1);
  });
  it('is idempotent', async () => {
    await ensureDefaultTenant({ env: {} });
    const r = await ensureDefaultTenant({ env: { CLIENT_URL: 'https://late.example' } });
    assert.equal(r.created, false); assert.equal(r.domainsCreated, 0);
    assert.equal(await Tenant.countDocuments({ isDefault: true }), 1);
    assert.equal(await Domain.countDocuments({ host: 'late.example' }), 0); // domain back-fill runs once
  });
  it('concurrent boots leave one default tenant', async () => {
    await Promise.all([1, 2, 3].map(() => ensureDefaultTenant({ env: {} })));
    assert.equal(await Tenant.countDocuments(), 1);
  });
  it('links the provider operator once and never overwrites', async () => {
    const op1 = new mongoose.Types.ObjectId(), op2 = new mongoose.Types.ObjectId();
    await ensureDefaultTenant({ env: {}, findProviderOperatorId: async () => op1 });
    const r = await ensureDefaultTenant({ env: {}, findProviderOperatorId: async () => op2 });
    assert.equal(String(r.tenant.providerOperatorId), String(op1));
  });
  it('creates domains from CLIENT_URL and the default brand', async () => {
    const brand = await Brand.create({ name: 'B', slug: 'b', isDefault: true,
      domains: [{ domain: 'other.example' }, { domain: 'Brand.Example', isPrimary: true }] });
    const r = await ensureDefaultTenant({ env: { CLIENT_URL: 'https://site.example,https://www.site.example' } });
    const ds = await Domain.find().sort({ _id: 1 }).lean();
    assert.deepEqual(ds.map((d) => d.host), ['site.example', 'www.site.example', 'brand.example', 'other.example']);
    assert.deepEqual(ds.filter((d) => d.isPrimary).map((d) => d.host), ['site.example']);
    assert.ok(ds.every((d) => String(d.tenantId) === String(r.tenant._id) && String(d.brandId) === String(brand._id)));
    assert.equal(r.domainsCreated, 4);
  });
  it('leaves a host owned by another tenant alone', async () => {
    const other = await Tenant.create({ key: 'other', name: 'O' });
    await Domain.create({ host: 'site.example', tenantId: other._id });
    await ensureDefaultTenant({ env: { CLIENT_URL: 'https://site.example' } });
    assert.equal(String((await Domain.findOne({ host: 'site.example' })).tenantId), String(other._id));
  });
  it('runTenancyBoot skips multi mode', async () => {
    const r = await runTenancyBoot({ env: { TENANCY_MODE: 'multi' } });
    assert.equal(r.mode, 'multi'); assert.equal(r.defaultTenant, null);
    assert.equal(await Tenant.countDocuments(), 0);
  });
  it('runTenancyBoot never throws and reports once', async () => {
    const reported = [];
    const r = await runTenancyBoot({ env: {}, ensure: async () => { throw new Error('disk full'); }, reportError: (m) => reported.push(m) });
    assert.equal(r.error, 'disk full'); assert.deepEqual(reported, ['disk full']);
  });
  it('the migration file is discovered under the shared name', async () => {
    const found = await discoverMigrations(); // from server/migrations/index.js
    assert.ok(found.some((m) => m.name === 'tenancy-001-default-tenant' && m.version === '1.1.0'));
  });
});
