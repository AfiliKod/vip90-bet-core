import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { requireAuth, requireStaff } from '../src/middleware/auth.js';
import { signAccess } from '../src/services/session.js';
import { signStaffAccess } from '../src/services/staffSession.js';
import { staffSocketAuthMiddleware } from '../src/services/socketAuth.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Tenant from '../src/models/Tenant.js';
import { tenantContext } from '../src/tenancy/context.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip3_t11';

function run(middleware, req) {
  return new Promise((resolve) => middleware(req, {}, (error) => resolve({
    error,
    req,
    context: tenantContext.get(),
  })));
}

function runSocket(middleware, socket) {
  return new Promise((resolve) => middleware(socket, (error) => resolve({ error, socket })));
}

describe('§8.1 tenancy identity cross-checks', () => {
  let tenantOne;
  let tenantTwo;
  let closedTenant;
  let staff;
  let originalEnv;

  before(async () => {
    originalEnv = {
      ADMIN_ALLOWED_IPS: process.env.ADMIN_ALLOWED_IPS,
      JWT_SECRET: process.env.JWT_SECRET,
      JWT_STAFF_SECRET: process.env.JWT_STAFF_SECRET,
      TENANCY_MODE: process.env.TENANCY_MODE,
    };
    process.env.JWT_SECRET = 'ip3-t11-player-secret';
    process.env.JWT_STAFF_SECRET = 'ip3-t11-staff-secret';
    process.env.TENANCY_MODE = 'multi';
    delete process.env.ADMIN_ALLOWED_IPS;

    await mongoose.connect(TEST_DB);
    await mongoose.connection.dropDatabase();
    [tenantOne, tenantTwo, closedTenant] = await Tenant.create([
      { key: 'ip3-t11-one', name: 'Tenant One', status: 'active' },
      { key: 'ip3-t11-two', name: 'Tenant Two', status: 'active' },
      { key: 'ip3-t11-closed', name: 'Closed Tenant', status: 'closed' },
    ]);
    staff = await StaffAccount.create({
      email: 'identity-cross-checks@example.test',
      username: 'identity-cross-checks',
      password: 'Password123!',
    });
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('rejects player and tenant-staff token replay on another tenant', async () => {
    const playerToken = signAccess({
      _id: new mongoose.Types.ObjectId(),
      role: 'user',
      tenantId: tenantOne._id,
      tokenVersion: 0,
    });
    const playerResult = await run(requireAuth, {
      headers: { authorization: `Bearer ${playerToken}` },
      tenant: { id: tenantTwo._id },
    });
    assert.equal(playerResult.error?.status, 401);
    assert.equal(playerResult.error?.code, 'CROSS_TENANT_TOKEN');

    const tenantStaffToken = signStaffAccess(staff, {
      scopeType: 'tenant',
      scopeId: tenantOne._id,
      amr: ['pwd', 'otp'],
    });
    const staffResult = await run(requireStaff('tenant'), {
      headers: { authorization: `Bearer ${tenantStaffToken}` },
      tenant: { id: tenantTwo._id },
    });
    assert.equal(staffResult.error?.status, 403);
    assert.equal(staffResult.error?.code, 'CROSS_TENANT_ACCESS');
  });

  it('rejects a tenant-staff socket handshake for another tenant', async () => {
    const token = signStaffAccess(staff, {
      scopeType: 'tenant',
      scopeId: tenantOne._id,
      amr: ['pwd', 'otp'],
    });
    const { error } = await runSocket(staffSocketAuthMiddleware, {
      handshake: { auth: { token } },
      request: { tenant: { id: tenantTwo._id } },
    });
    assert.ok(error);
  });

  it('enforces the multi-mode and single-mode staff 2FA matrix', async () => {
    const passwordOnly = signStaffAccess(staff, {
      scopeType: 'tenant',
      scopeId: tenantOne._id,
      amr: ['pwd'],
    });
    const multiResult = await run(requireStaff('tenant'), {
      headers: { authorization: `Bearer ${passwordOnly}` },
      tenant: { id: tenantOne._id },
    });
    assert.equal(multiResult.error?.status, 403);
    assert.equal(multiResult.error?.code, 'TWO_FACTOR_REQUIRED');

    process.env.TENANCY_MODE = 'single';
    const singleResult = await run(requireStaff('tenant'), {
      headers: { authorization: `Bearer ${passwordOnly}` },
      tenant: { id: tenantOne._id },
    });
    assert.equal(singleResult.error, undefined);
    process.env.TENANCY_MODE = 'multi';
  });

  it('requires platform staff to select a live tenant for tenant routes', async () => {
    const token = signStaffAccess(staff, {
      scopeType: 'platform',
      amr: ['pwd', 'otp'],
    });

    const missingTenant = await run(requireStaff('tenant'), {
      headers: { authorization: `Bearer ${token}` },
      tenant: { id: tenantOne._id },
    });
    assert.equal(missingTenant.error?.status, 400);
    assert.equal(missingTenant.error?.code, 'TENANT_REQUIRED');

    const selectedTenant = await run(requireStaff('tenant'), {
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': String(tenantTwo._id),
      },
      tenant: { id: tenantOne._id },
    });
    assert.equal(selectedTenant.error, undefined);
    assert.equal(String(selectedTenant.req.tenant.id), String(tenantTwo._id));
    assert.equal(String(selectedTenant.context.tenantId), String(tenantTwo._id));
    assert.deepEqual(selectedTenant.context.actor, {
      kind: 'staff',
      id: String(staff._id),
      scope: 'platform',
    });

    const unknownTenant = await run(requireStaff('tenant'), {
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': String(new mongoose.Types.ObjectId()),
      },
    });
    assert.equal(unknownTenant.error?.status, 404);
    assert.equal(unknownTenant.error?.code, 'TENANT_NOT_FOUND');

    const closed = await run(requireStaff('tenant'), {
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': String(closedTenant._id),
      },
    });
    assert.equal(closed.error?.status, 404);
    assert.equal(closed.error?.code, 'TENANT_NOT_FOUND');
  });

  it('keeps partner staff out of tenant-scoped routes', async () => {
    const token = signStaffAccess(staff, {
      scopeType: 'partner',
      scopeId: new mongoose.Types.ObjectId(),
      amr: ['pwd', 'otp'],
    });
    const { error } = await run(requireStaff('tenant'), {
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': String(tenantOne._id),
      },
      tenant: { id: tenantOne._id },
    });
    assert.equal(error?.status, 403);
    assert.equal(error?.code, 'FORBIDDEN');
  });
});
