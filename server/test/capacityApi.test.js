// İP-10a — capacity surfaces: GET /api/platform/system/capacity permission
// (multi mode), the capacity field on GET /api/health/status in both modes,
// and the single-mode 404 for the platform route.
const savedEnv = {};
for (const key of [
  'NODE_ENV', 'TENANCY_MODE', 'TENANCY_ENFORCEMENT', 'ADMIN_ALLOWED_IPS',
  'PLATFORM_HOST', 'SCOPE_GATE_ENV', 'JWT_SECRET', 'JWT_STAFF_SECRET',
  'OPERATOR_SECRET_ENCRYPTION_KEY', 'AUDIT_RETENTION_DAYS',
  'CAPACITY_SOCKETS_P95', 'CAPACITY_EVENT_LOOP_P99_MS', 'CAPACITY_CPU_PCT',
]) {
  savedEnv[key] = process.env[key];
}
process.env.NODE_ENV = 'test';
process.env.TENANCY_MODE = 'multi';
process.env.TENANCY_ENFORCEMENT = 'enforce';
process.env.JWT_SECRET ||= 'ip10a_capacity_player_secret';
process.env.JWT_STAFF_SECRET ||= 'ip10a_capacity_staff_secret';
process.env.OPERATOR_SECRET_ENCRYPTION_KEY ||= 'a'.repeat(64);
process.env.PLATFORM_HOST = 'console.example.com';
process.env.AUDIT_RETENTION_DAYS = '';
delete process.env.ADMIN_ALLOWED_IPS;
delete process.env.SCOPE_GATE_ENV;
delete process.env.CAPACITY_SOCKETS_P95;
delete process.env.CAPACITY_EVENT_LOOP_P99_MS;
delete process.env.CAPACITY_CPU_PCT;

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import express from 'express';

const { default: StaffAccount } = await import('../src/models/StaffAccount.js');
const { default: Role } = await import('../src/models/Role.js');
const { default: RoleAssignment } = await import('../src/models/RoleAssignment.js');
const { default: Permission } = await import('../src/models/Permission.js');
const { default: CapacityWindow } = await import('../src/models/CapacityWindow.js');
const { default: Tenant } = await import('../src/models/Tenant.js');
const { default: Domain } = await import('../src/models/Domain.js');
const { createPlatformRouter } = await import('../src/platform/routes/index.js');
const { signStaffAccess } = await import('../src/services/staffSession.js');
const { createApp } = await import('../src/app.js');
const { errorHandler } = await import('../src/middleware/error.js');
const { clearDomainHostCache } = await import('../src/middleware/tenantHost.js');

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip10a_api';
const PLATFORM_HOST = 'console.example.com';

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  clearDomainHostCache();
  // Minimal RBAC seed (the full platform bootstrap builds every compound
  // index and is exercised by platformApi/platformConsoleAcceptance already).
  const manage = await Permission.create({ key: 'platform:tenants:manage', name: 'Tenants manage', category: 'platform' });
  const billingRead = await Permission.create({ key: 'platform:billing:read', name: 'Billing read', category: 'platform' });
  await Role.create({ name: 'platform_owner', displayName: 'Platform Sahibi', scopeType: 'platform', scopeId: null, permissions: [manage._id] });
  await Role.create({ name: 'platform_finance', displayName: 'Platform Finans', scopeType: 'platform', scopeId: null, permissions: [billingRead._id] });
  await CapacityWindow.init();
});

after(async () => {
  clearDomainHostCache();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function platformStaff(roleName, email) {
  const staff = await StaffAccount.create({ email, username: email.split('@')[0], password: 'pwd-not-used', status: 'active' });
  const role = await Role.findOne({ name: roleName, scopeType: 'platform' });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'platform', scopeId: null });
  return signStaffAccess(staff, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });
}

async function withPlatformApi(fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/platform', createPlatformRouter());
  app.use(errorHandler);
  const server = app.listen(0);
  try {
    await fn(`http://127.0.0.1:${server.address().port}/api/platform`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET /api/platform/system/capacity: tenants:manage reads the evaluation', async () => {
  await CapacityWindow.create({
    windowStart: new Date(), host: 'test-host', pid: 1, socketsP95: 2500, eventLoopP99Ms: 5, cpuPct: 10,
  });
  const token = await platformStaff('platform_owner', 'capacity-owner@example.com');
  await withPlatformApi(async (base) => {
    const res = await fetch(`${base}/system/capacity`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.state, 'exceeded');
    assert.equal(body.sockets.state, 'exceeded');
    assert.equal(body.sockets.value, 2500);
    assert.equal(body.sockets.threshold, 2000);
    assert.equal(body.eventLoop.state, 'ok');
    assert.equal(body.cpu.state, 'ok');
    assert.equal(body.cpu.requiredWindows, 3);
  });
});

test('GET /api/platform/system/capacity: without the permission 403, without a token 401', async () => {
  const financeToken = await platformStaff('platform_finance', 'capacity-finance@example.com');
  await withPlatformApi(async (base) => {
    const refused = await fetch(`${base}/system/capacity`, { headers: { Authorization: `Bearer ${financeToken}` } });
    assert.equal(refused.status, 403);
    const anonymous = await fetch(`${base}/system/capacity`);
    assert.equal(anonymous.status, 401);
  });
});

test('GET /api/health/status gains capacity without changing existing fields (multi)', async () => {
  // health/status is a tenant-facing route: in multi mode it is served on a
  // verified tenant host (the platform host has no tenant context).
  const tenant = await Tenant.create({ key: 'capacity-op', name: 'Capacity Operator', status: 'active' });
  const tenantHost = 'capacity-operator.example.com';
  await Domain.create({ host: tenantHost, tenantId: tenant._id, isPrimary: true, purpose: 'player', verifiedAt: new Date() });
  clearDomainHostCache();
  const app = createApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    // node:http keeps the explicit Host header (undici fetch normalizes it away).
    const res = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1', port: server.address().port, path: '/api/health/status', headers: { host: tenantHost },
      }, (r) => {
        let text = '';
        r.setEncoding('utf8');
        r.on('data', (chunk) => { text += chunk; });
        r.on('end', () => resolve({ status: r.statusCode, text }));
      });
      req.setTimeout(20000, () => req.destroy(new Error('health/status request timed out')));
      req.on('error', reject);
      req.end();
    });
    assert.equal(res.status, 200, res.text);
    const body = JSON.parse(res.text);
    assert.equal(body.api, 'up');
    assert.equal(body.db, 'up');
    assert.ok('onlineCount' in body);
    assert.ok('payment' in body);
    assert.ok(body.capacity, 'capacity field must be present');
    assert.equal(body.capacity.state, 'exceeded'); // window from the first test
    assert.equal(body.capacity.sockets.value, 2500);
    assert.ok(body.capacity.eventLoop);
    assert.ok(body.capacity.cpu);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('single mode: the platform capacity route is 404, health/status still reports capacity', async () => {
  process.env.TENANCY_MODE = 'single';
  process.env.TENANCY_ENFORCEMENT = 'off';
  clearDomainHostCache();
  const app = createApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const platform = await fetch(`${base}/api/platform/system/capacity`);
    assert.equal(platform.status, 404);

    const status = await fetch(`${base}/api/health/status`);
    assert.equal(status.status, 200);
    const body = await status.json();
    assert.ok(body.capacity);
    assert.equal(typeof body.capacity.state, 'string');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    process.env.TENANCY_MODE = 'multi';
    process.env.TENANCY_ENFORCEMENT = 'enforce';
    clearDomainHostCache();
  }
});