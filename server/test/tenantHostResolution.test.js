import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Domain from '../src/models/Domain.js';
import Tenant from '../src/models/Tenant.js';
import { resolveTenantHost, clearDomainHostCache } from '../src/middleware/tenantHost.js';
import { getCurrentTenantId } from '../src/tenancy/context.js';
import { setDefaultTenantId } from '../src/tenancy/defaultTenantId.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip3_t4';

describe('Tenant Host Resolution Middleware', () => {
  let defaultTenant, customTenant;

  before(async () => {
    await mongoose.connect(TEST_DB);
    await Domain.deleteMany({});
    await Tenant.deleteMany({});
    defaultTenant = await Tenant.create({ key: 'default', name: 'Default Tenant', isDefault: true, status: 'active' });
    customTenant = await Tenant.create({ key: 'operator-b', name: 'Operator B', isDefault: false, status: 'active' });
    await Domain.create({ host: 'operator-b.com', tenantId: customTenant._id, isPrimary: true, purpose: 'player', verifiedAt: new Date() });
    await Domain.create({ host: 'unverified-c.com', tenantId: customTenant._id, isPrimary: false, purpose: 'player' });
    setDefaultTenantId(defaultTenant._id);
  });

  after(async () => {
    setDefaultTenantId(null);
    await Domain.deleteMany({});
    await Tenant.deleteMany({});
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(() => {
    clearDomainHostCache();
  });

  it('resolves registered domain and sets ambient tenantContext', async () => {
    const mw = resolveTenantHost({ getTenancyMode: () => 'multi' });
    const req = { hostname: 'Operator-B.com', headers: { host: 'Operator-B.com:443' } };
    const res = {};
    let ambientTenantId = null;
    await new Promise((resolve, reject) => {
      mw(req, res, (err) => {
        if (err) return reject(err);
        ambientTenantId = getCurrentTenantId();
        resolve();
      });
    });
    assert.equal(String(req.tenant.id), String(customTenant._id));
    assert.equal(String(ambientTenantId), String(customTenant._id));
  });

  it('falls back to default tenant in single mode for unknown domain', async () => {
    const mw = resolveTenantHost({ getTenancyMode: () => 'single' });
    const req = { hostname: 'unknown-domain.com', headers: { host: 'unknown-domain.com' } };
    const res = {};
    await new Promise((resolve) => mw(req, res, resolve));
    assert.equal(String(req.tenant.id), String(defaultTenant._id));
    assert.equal(req.tenant.isDefault, true);
  });

  it('always uses the default tenant in single mode, including for registered domains', async () => {
    const mw = resolveTenantHost({ getTenancyMode: () => 'single' });
    const req = { hostname: 'operator-b.com', headers: { host: 'operator-b.com' } };
    await new Promise((resolve) => mw(req, {}, resolve));
    assert.equal(String(req.tenant.id), String(defaultTenant._id));
    assert.equal(req.tenant.isDefault, true);
  });

  it('returns 404 in multi mode for unknown domain', async () => {
    const mw = resolveTenantHost({ getTenancyMode: () => 'multi' });
    const req = { hostname: 'unknown-domain.com', headers: { host: 'unknown-domain.com' } };
    let statusSent = null;
    let jsonSent = null;
    await new Promise((resolve) => {
      const res = {
        status(s) { statusSent = s; return this; },
        json(j) { jsonSent = j; resolve(); },
      };
      mw(req, res, resolve);
    });
    assert.equal(statusSent, 404);
    assert.equal(jsonSent.error, 'TENANT_NOT_FOUND');
  });

  async function runMulti(req) {
    const mw = resolveTenantHost({ getTenancyMode: () => 'multi' });
    let status = null;
    await new Promise((resolve) => {
      const res = { status(x) { status = x; return this; }, json() { resolve(); } };
      mw(req, res, () => resolve());
    });
    return status;
  }

  it('multi mode: an unverified domain never resolves (spec §9 G-11)', async () => {
    const req = { hostname: 'unverified-c.com', headers: { host: 'unverified-c.com' } };
    assert.equal(await runMulti(req), 404);
    assert.equal(req.tenant, undefined);
  });

  it('multi mode: a raw X-Forwarded-Host header cannot select another tenant', async () => {
    // Express only maps X-Forwarded-Host into req.hostname when trust proxy is set.
    const req = { hostname: 'unknown-domain.com', headers: { host: 'unknown-domain.com', 'x-forwarded-host': 'operator-b.com' } };
    assert.equal(await runMulti(req), 404);
    assert.equal(req.tenant, undefined);
  });

  it('single mode without a default tenant yet: request continues unbound, never fails', async () => {
    setDefaultTenantId(null);
    try {
      const mw = resolveTenantHost({ getTenancyMode: () => 'single' });
      const req = { hostname: 'localhost', headers: { host: 'localhost:3000' } };
      let err;
      await new Promise((resolve) => mw(req, {}, (e) => { err = e; resolve(); }));
      assert.equal(err, undefined);
      assert.equal(req.tenant, undefined);
    } finally {
      setDefaultTenantId(defaultTenant._id);
    }
  });
});
