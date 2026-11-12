import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import PlatformWriteGrant from '../src/models/PlatformWriteGrant.js';
import AuditLog from '../src/models/AuditLog.js';
import Tenant from '../src/models/Tenant.js';
import StaffAccount from '../src/models/StaffAccount.js';
import { requireStaff } from '../src/middleware/auth.js';
import { signStaffAccess } from '../src/services/staffSession.js';
import { runWithTenant } from '../src/tenancy/context.js';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://localhost:27017/vip90_test_ip9a_t3';
let originalEnv;

test.before(async () => {
  originalEnv = {
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_STAFF_SECRET: process.env.JWT_STAFF_SECRET,
    TENANCY_MODE: process.env.TENANCY_MODE,
  };
  process.env.JWT_SECRET = 'ip9a-t3-player-secret';
  process.env.JWT_STAFF_SECRET = 'ip9a-t3-staff-secret';
  process.env.TENANCY_MODE = 'multi';
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('platform staff write on tenant route blocked with PLATFORM_READ_ONLY without active grant', async () => {
  const staff = await StaffAccount.create({
    email: 'ops@example.com', username: 'opsstaff', password: 'pwd', status: 'active',
  });
  const tenant = await Tenant.create({ key: 'beta', name: 'Beta', status: 'active' });
  const token = signStaffAccess(staff, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });

  const req = {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenant._id.toString() },
    originalUrl: '/api/admin/settings',
  };
  const res = {};
  let errCalled = null;
  const next = (err) => { errCalled = err; };

  const middleware = requireStaff('tenant');
  await middleware(req, res, next);

  assert.ok(errCalled, 'Must reject with error');
  assert.equal(errCalled.status, 403);
  assert.equal(errCalled.code, 'PLATFORM_READ_ONLY');
});

test('platform staff write allowed when active PlatformWriteGrant exists and logs PLATFORM_WRITE_EXCEPTION audit', async () => {
  const staff = await StaffAccount.findOne({ email: 'ops@example.com' });
  const tenant = await Tenant.findOne({ key: 'beta' });

  const grant = await PlatformWriteGrant.create({
    staffId: staff._id,
    tenantId: tenant._id,
    reason: 'Emergency database fix',
    expiresAt: new Date(Date.now() + 3600_000),
    grantedBy: staff._id,
    status: 'active',
  });

  const token = signStaffAccess(staff, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });
  const req = {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenant._id.toString() },
    originalUrl: '/api/admin/settings',
    body: { maintenance: true },
  };
  const res = {};
  let calledNext = false;
  let errCalled = null;
  const next = (err) => {
    if (err) errCalled = err;
    else calledNext = true;
  };

  const middleware = requireStaff('tenant');
  await middleware(req, res, next);

  assert.equal(errCalled, null);
  assert.equal(calledNext, true);
  assert.ok(req.platformWriteGrant);
  assert.equal(req.platformWriteGrant._id.toString(), grant._id.toString());

  const audit = await runWithTenant(tenant._id, () => AuditLog.findOne({ action: 'PLATFORM_WRITE_EXCEPTION' }).lean());
  assert.ok(audit);
  assert.equal(String(audit.actorStaffId), String(staff._id));
  assert.equal(String(audit.metadata.grantId), String(grant._id));
});

test('expired PlatformWriteGrant cannot allow a platform staff write', async () => {
  const staff = await StaffAccount.findOne({ email: 'ops@example.com' });
  const tenant = await Tenant.findOne({ key: 'beta' });
  await PlatformWriteGrant.deleteMany({});
  await PlatformWriteGrant.create({
    staffId: staff._id,
    tenantId: tenant._id,
    reason: 'Expired maintenance window',
    expiresAt: new Date(Date.now() - 1_000),
    grantedBy: staff._id,
  });
  const token = signStaffAccess(staff, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });
  const req = {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenant._id.toString() },
    originalUrl: '/api/admin/settings',
  };
  let errCalled = null;

  await requireStaff('tenant')(req, {}, (err) => { errCalled = err; });

  assert.equal(errCalled?.status, 403);
  assert.equal(errCalled?.code, 'PLATFORM_READ_ONLY');
});
