import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Tenant from '../src/models/Tenant.js';
import Domain from '../src/models/Domain.js';
import { createInternalTenantMiddleware } from '../src/middleware/internalTenant.js';
import { resolveTenantByHost, resolveTenantHost, clearDomainHostCache } from '../src/middleware/tenantHost.js';
import { getCurrentTenantId } from '../src/tenancy/context.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip7_t2';
const TOKEN = 'internal-test-token';
let t1; let t2;

function req({ headers = {}, remoteAddress = '127.0.0.1', hostname = 't1.test' } = {}) {
  return { headers, socket: { remoteAddress }, hostname };
}
function res() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  t1 = await Tenant.create({ key: 't1internal', name: 'T1', status: 'active' });
  t2 = await Tenant.create({ key: 't2internal', name: 'T2', status: 'active' });
  await Domain.create({ host: 't1.test', tenantId: t1._id, verifiedAt: new Date(), isPrimary: true, purpose: 'player' });
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  clearDomainHostCache();
});

describe('internal tenant header', () => {
  it('binds an active tenant for a loopback request with the exact token', async () => {
    const middleware = createInternalTenantMiddleware({ token: TOKEN });
    const request = req({ headers: { 'x-internal-tenant': String(t1._id), 'x-internal-token': TOKEN } });
    let nextCalls = 0;
    let ambient = null;
    await middleware(request, res(), () => { nextCalls += 1; ambient = getCurrentTenantId(); });
    assert.equal(nextCalls, 1);
    assert.equal(String(request.tenant.id), String(t1._id));
    assert.equal(String(ambient), String(t1._id));
  });

  it('ignores a forged token and leaves the request unbound', async () => {
    const middleware = createInternalTenantMiddleware({ token: TOKEN });
    const request = req({ headers: { 'x-internal-tenant': String(t1._id), 'x-internal-token': 'wrong' } });
    let nextCalls = 0;
    await middleware(request, res(), () => { nextCalls += 1; });
    assert.equal(nextCalls, 1);
    assert.equal(request.tenant, undefined);
  });

  it('ignores the header from a non-loopback address', async () => {
    const middleware = createInternalTenantMiddleware({ token: TOKEN });
    const request = req({
      headers: { 'x-internal-tenant': String(t1._id), 'x-internal-token': TOKEN },
      remoteAddress: '10.0.0.5',
    });
    let nextCalls = 0;
    await middleware(request, res(), () => { nextCalls += 1; });
    assert.equal(nextCalls, 1);
    assert.equal(request.tenant, undefined);
  });

  it('is a no-op when INTERNAL_API_TOKEN is not configured', async () => {
    const middleware = createInternalTenantMiddleware({ token: '' });
    const request = req({ headers: { 'x-internal-tenant': String(t1._id), 'x-internal-token': '' } });
    let nextCalls = 0;
    await middleware(request, res(), () => { nextCalls += 1; });
    assert.equal(nextCalls, 1);
    assert.equal(request.tenant, undefined);
  });

  it('404s a valid header that names a missing or inactive tenant', async () => {
    const middleware = createInternalTenantMiddleware({ token: TOKEN });
    const request = req({ headers: { 'x-internal-tenant': String(t2._id), 'x-internal-token': TOKEN } });
    const response = res();
    let nextCalls = 0;
    await Tenant.updateOne({ _id: t2._id }, { $set: { status: 'suspended' } });
    await middleware(request, response, () => { nextCalls += 1; });
    assert.equal(nextCalls, 0);
    assert.equal(response.statusCode, 404);
    assert.equal(response.body.error.code, 'TENANT_NOT_FOUND');
  });
});

describe('host resolver extraction', () => {
  it('resolves a verified domain to a tenant', async () => {
    const tenant = await resolveTenantByHost('T1.TEST:443');
    assert.equal(String(tenant.id), String(t1._id));
    assert.equal(tenant.host, 't1.test');
  });

  it('does not resolve a pre-bound tenant through the Host header again', async () => {
    const middleware = resolveTenantHost({ getTenancyMode: () => 'multi' });
    const request = req({ hostname: 'unknown.test' });
    request.tenant = { id: t2._id, brandId: null, host: 'unknown.test' };
    let nextCalls = 0;
    await middleware(request, res(), () => { nextCalls += 1; });
    assert.equal(nextCalls, 1);
    assert.equal(String(request.tenant.id), String(t2._id));
  });
});
