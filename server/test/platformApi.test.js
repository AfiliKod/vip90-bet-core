import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { createPlatformRouter } from '../src/platform/routes/index.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import { signStaffAccess } from '../src/services/staffSession.js';
import { runPlatformBootstrap } from '../src/platform/bootstrap.js';

process.env.JWT_SECRET ||= 'platform-api-test-secret';
process.env.TENANCY_MODE = 'multi';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9a_t8';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  await runPlatformBootstrap({ env: { TENANCY_MODE: 'multi', TENANCY_ENFORCEMENT: 'enforce' } });
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('GET /api/platform/system/scope-gates returns N6 gate telemetry', async () => {
  const staff = await StaffAccount.create({ email: 'api@example.com', username: 'apiuser', password: 'pwd', status: 'active' });
  const role = await Role.findOne({ name: 'platform_owner' });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'platform', scopeId: null });

  const token = signStaffAccess(staff, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });

  const app = express();
  app.use(express.json());
  app.use('/api/platform', createPlatformRouter());

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/platform/system/scope-gates`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.staging);
    assert.ok(body.production);
  } finally {
    server.close();
  }
});

// ── Security behaviour of the platform API ────────────────────────────────
import { errorHandler } from '../src/middleware/error.js';
import Tenant from '../src/models/Tenant.js';
import Domain from '../src/models/Domain.js';
import StaffInvite from '../src/platform/models/StaffInvite.js';

async function platformStaff(roleName, email) {
  const staff = await StaffAccount.create({ email, username: email.split('@')[0], password: 'pwd-not-used', status: 'active' });
  const role = await Role.findOne({ name: roleName, scopeType: 'platform' });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'platform', scopeId: null });
  return staff;
}

async function withApp(fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/platform', createPlatformRouter());
  app.use(errorHandler);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/platform`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

const call = (base, token, method, path, body) => fetch(`${base}${path}`, {
  method,
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
});

test('a platform token without a completed second factor is refused', async () => {
  const staff = await platformStaff('platform_owner', 'nootp@platform.example.com');
  const token = signStaffAccess(staff, { scopeType: 'platform', scopeId: null, amr: ['pwd'] });
  await withApp(async (base) => {
    const res = await call(base, token, 'GET', '/tenants');
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.code, 'TWO_FACTOR_REQUIRED');
  });
});

test('provisioning returns the owner invitation once and a re-run returns none', async () => {
  const owner = await platformStaff('platform_owner', 'owner1@platform.example.com');
  const token = signStaffAccess(owner, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });
  const body = { key: 'omega', name: 'Omega', domain: 'omega.example.com', ownerEmail: 'boss@omega.example.com' };
  await withApp(async (base) => {
    const first = await call(base, token, 'POST', '/tenants', body);
    assert.equal(first.status, 201);
    const created = await first.json();
    assert.match(created.ownerInviteUrl, /\/console\/accept-invite\?token=/);
    assert.equal(await StaffInvite.countDocuments(), 1);

    const again = await call(base, token, 'POST', '/tenants', body);
    assert.equal(again.status, 201);
    assert.equal((await again.json()).ownerInviteUrl, null);
    assert.equal(await Tenant.countDocuments({ key: 'omega' }), 1);
  });
});

test('write grants: owner only, reason required, at most 24 hours', async () => {
  const owner = await platformStaff('platform_owner', 'owner2@platform.example.com');
  const ops = await platformStaff('platform_ops', 'ops@platform.example.com');
  const tenant = await Tenant.create({ key: 'sigma', name: 'Sigma', status: 'active' });
  const ownerToken = signStaffAccess(owner, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });
  const opsToken = signStaffAccess(ops, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });
  await withApp(async (base) => {
    const path = `/tenants/${tenant._id}/write-grants`;
    assert.equal((await call(base, opsToken, 'POST', path, { staffId: ops._id, reason: 'fix', durationHours: 1 })).status, 403);
    assert.equal((await call(base, ownerToken, 'POST', path, { staffId: ops._id, durationHours: 1 })).status, 400);
    assert.equal((await call(base, ownerToken, 'POST', path, { staffId: ops._id, reason: 'fix', durationHours: 25 })).status, 400);
  });
});

test('a domain of another tenant is not reachable through this tenant', async () => {
  const owner = await platformStaff('platform_owner', 'owner3@platform.example.com');
  const token = signStaffAccess(owner, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });
  const a = await Tenant.create({ key: 'alpha9', name: 'A', status: 'provisioning' });
  const b = await Tenant.create({ key: 'beta9', name: 'B', status: 'provisioning' });
  const foreign = await Domain.create({ host: 'b9.example.com', tenantId: b._id, isPrimary: true, purpose: 'player' });
  await withApp(async (base) => {
    const res = await call(base, token, 'POST', `/tenants/${a._id}/domains/${foreign._id}/verify-dns`);
    assert.equal(res.status, 404);
  });
});

test('closing a tenant twice maps to INVALID_TRANSITION, not a 500', async () => {
  const owner = await platformStaff('platform_owner', 'owner4@platform.example.com');
  const token = signStaffAccess(owner, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });
  const t = await Tenant.create({ key: 'zeta9', name: 'Z', status: 'active' });
  await withApp(async (base) => {
    assert.equal((await call(base, token, 'PATCH', `/tenants/${t._id}/status`, { status: 'closed', reason: 'end' })).status, 200);
    const res = await call(base, token, 'PATCH', `/tenants/${t._id}/status`, { status: 'active', force: true, reason: 'x' });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.code, 'INVALID_TRANSITION');
  });
});

test('an owner who already signed in cannot be re-invited by platform staff', async () => {
  const owner = await platformStaff('platform_owner', 'owner5@platform.example.com');
  const token = signStaffAccess(owner, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });
  await withApp(async (base) => {
    const created = await (await call(base, token, 'POST', '/tenants', {
      key: 'rho', name: 'Rho', domain: 'rho.example.com', ownerEmail: 'boss@rho.example.com',
    })).json();
    const tenantId = created.tenantId;
    assert.equal((await call(base, token, 'POST', `/tenants/${tenantId}/owner-invite`)).status, 200);
    await StaffAccount.updateOne({ email: 'boss@rho.example.com' }, { lastLoginAt: new Date() });
    const res = await call(base, token, 'POST', `/tenants/${tenantId}/owner-invite`);
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.code, 'OWNER_ALREADY_ACTIVE');
  });
});
