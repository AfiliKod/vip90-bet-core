import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { requireStaff } from '../src/middleware/auth.js';
import { signStaffAccess } from '../src/services/staffSession.js';
import AuditLog from '../src/models/AuditLog.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Tenant from '../src/models/Tenant.js';
import { runWithTenant } from '../src/tenancy/context.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://localhost:27017/vip90_test_ip5_t12';

function run(middleware, req) {
  return new Promise((resolve) => middleware(req, {}, (error) => resolve({ error, req })));
}

function requestFor(token, method, tenantId) {
  return {
    method,
    originalUrl: '/api/admin/tenant-resource',
    headers: {
      authorization: `Bearer ${token}`,
      'x-tenant-id': String(tenantId),
    },
  };
}

let originalEnv;
let tenant;
let platformStaff;
let tenantStaff;

before(async () => {
  originalEnv = {
    ADMIN_ALLOWED_IPS: process.env.ADMIN_ALLOWED_IPS,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_STAFF_SECRET: process.env.JWT_STAFF_SECRET,
    TENANCY_ENFORCEMENT: process.env.TENANCY_ENFORCEMENT,
    TENANCY_MODE: process.env.TENANCY_MODE,
  };
  process.env.JWT_SECRET = 'ip5-t12-player-secret';
  process.env.JWT_STAFF_SECRET = 'ip5-t12-staff-secret';
  process.env.TENANCY_MODE = 'multi';
  process.env.TENANCY_ENFORCEMENT = 'enforce';
  delete process.env.ADMIN_ALLOWED_IPS;

  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  tenant = await Tenant.create({ key: 'ip5-t12-tenant', name: 'T12 Tenant', status: 'active' });
  [platformStaff, tenantStaff] = await StaffAccount.create([
    { email: 't12-platform@example.test', username: 't12-platform', password: 'Password123!' },
    { email: 't12-tenant@example.test', username: 't12-tenant', password: 'Password123!' },
  ]);
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('platform staff may read a selected tenant route', async () => {
  const token = signStaffAccess(platformStaff, {
    scopeType: 'platform',
    amr: ['pwd', 'otp'],
  });

  const { error, req } = await run(requireStaff('tenant'), requestFor(token, 'GET', tenant._id));

  assert.equal(error, undefined);
  assert.equal(req.staff.scope, 'platform');
  assert.equal(String(req.tenant.id), String(tenant._id));
});

test('platform staff write requests are rejected and audited', async () => {
  const token = signStaffAccess(platformStaff, {
    scopeType: 'platform',
    amr: ['pwd', 'otp'],
  });

  for (const method of ['POST', 'PATCH', 'DELETE']) {
    const { error } = await run(requireStaff('tenant'), requestFor(token, method, tenant._id));
    assert.equal(error?.status, 403);
    assert.equal(error?.code, 'PLATFORM_READ_ONLY');
  }

  const logs = await runWithTenant(tenant._id, () =>
    AuditLog.find({ action: 'PLATFORM_READ_ONLY' }).sort({ createdAt: 1 }).lean()
  );
  assert.equal(logs.length, 3);
  for (const [index, method] of ['POST', 'PATCH', 'DELETE'].entries()) {
    const log = logs[index];
    assert.equal(String(log.actorStaffId), String(platformStaff._id));
    assert.equal(log.actorScope, 'platform');
    assert.equal(String(log.tenantId), String(tenant._id));
    assert.equal(String(log.onBehalfOfTenantId), String(tenant._id));
    assert.equal(log.metadata.route, '/api/admin/tenant-resource');
    assert.equal(log.metadata.method, method);
  }
});

test('tenant staff remain able to write their own tenant route', async () => {
  const token = signStaffAccess(tenantStaff, {
    scopeType: 'tenant',
    scopeId: tenant._id,
    amr: ['pwd', 'otp'],
  });
  const req = requestFor(token, 'POST', tenant._id);
  req.tenant = { id: tenant._id };

  const { error } = await run(requireStaff('tenant'), req);

  assert.equal(error, undefined);
  const platformWriteLogs = await runWithTenant(tenant._id, () =>
    AuditLog.countDocuments({ action: 'PLATFORM_READ_ONLY' })
  );
  assert.equal(platformWriteLogs, 3);
});
