import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { requireStaff, requireAuth } from '../src/middleware/auth.js';
import { signStaffAccess } from '../src/services/staffSession.js';
import { signAccess } from '../src/services/session.js';
import StaffAccount from '../src/models/StaffAccount.js';
import { socketAuthMiddleware, staffSocketAuthMiddleware, verifySocketUser } from '../src/services/socketAuth.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip3_t8';

function run(middleware, req) {
  return new Promise((resolve) => middleware(req, {}, (error) => resolve({ error, req })));
}

function runSocket(middleware, socket) {
  return new Promise((resolve) => middleware(socket, (error) => resolve({ error, socket })));
}

describe('requireStaff & requireAuth Middlewares', () => {
  process.env.JWT_SECRET = 'player_secret_32_bytes_long_12345!';
  process.env.JWT_STAFF_SECRET = 'staff_secret_32_bytes_long_12345!';

  let staff;

  before(async () => {
    await mongoose.connect(TEST_DB);
    await StaffAccount.deleteMany({});
    staff = await StaffAccount.create({ email: 'auth_test@test.com', username: 'authtest', password: 'pwd', tokenVersion: 0 });
  });

  after(async () => {
    await StaffAccount.deleteMany({});
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('rejects player token when presented to requireStaff', async () => {
    const playerToken = signAccess({ _id: new mongoose.Types.ObjectId(), role: 'admin', tokenVersion: 0 });
    const { error } = await run(requireStaff(), { headers: { authorization: `Bearer ${playerToken}` }, tenant: { id: new mongoose.Types.ObjectId() } });
    assert.equal(error?.status, 401);
  });

  it('enforces 2FA in multi mode for staff token', async () => {
    process.env.TENANCY_MODE = 'multi';
    const pwdOnlyToken = signStaffAccess(staff, { scopeType: 'tenant', scopeId: staff._id, amr: ['pwd'] });
    const { error } = await run(requireStaff(), { headers: { authorization: `Bearer ${pwdOnlyToken}` }, tenant: { id: staff._id } });
    assert.equal(error?.status, 403);
    assert.equal(error?.code, 'TWO_FACTOR_REQUIRED');
    delete process.env.TENANCY_MODE;
  });

  it('rejects staff token when tenant scope sid does not match req.tenant.id', async () => {
    const tenantA = new mongoose.Types.ObjectId();
    const tenantB = new mongoose.Types.ObjectId();
    const token = signStaffAccess(staff, { scopeType: 'tenant', scopeId: tenantA, amr: ['pwd'] });
    const { error } = await run(requireStaff(), { headers: { authorization: `Bearer ${token}` }, tenant: { id: tenantB } });
    assert.equal(error?.status, 403);
    assert.equal(error?.code, 'CROSS_TENANT_ACCESS');
  });

  it('keeps the token families separate when JWT_STAFF_SECRET is unset', async () => {
    delete process.env.JWT_STAFF_SECRET;
    const staffToken = signStaffAccess(staff, { scopeType: 'platform', amr: ['pwd'] });
    const playerToken = signAccess({ _id: new mongoose.Types.ObjectId(), role: 'admin', tokenVersion: 0 });

    const playerRoute = await run(requireAuth, { headers: { authorization: `Bearer ${staffToken}` } });
    const staffRoute = await run(requireStaff(), { headers: { authorization: `Bearer ${playerToken}` } });
    assert.equal(playerRoute.error?.status, 401);
    assert.equal(staffRoute.error?.status, 401);
    assert.equal(await verifySocketUser(staffToken), null);

    process.env.JWT_STAFF_SECRET = 'staff_secret_32_bytes_long_12345!';
  });

  it('keeps player sockets player-only and binds staff socket data to its tenant scope', async () => {
    const tenantA = new mongoose.Types.ObjectId();
    const tenantB = new mongoose.Types.ObjectId();
    const token = signStaffAccess(staff, { scopeType: 'tenant', scopeId: tenantA, amr: ['pwd'] });
    const playerSocket = { handshake: { auth: { token } } };
    const wrongTenantSocket = { handshake: { auth: { token, tenantId: tenantB } } };
    const matchingTenantSocket = { handshake: { auth: { token, tenantId: tenantA } } };

    assert.ok((await runSocket(socketAuthMiddleware, playerSocket)).error);
    assert.ok((await runSocket(staffSocketAuthMiddleware, wrongTenantSocket)).error);
    assert.equal((await runSocket(staffSocketAuthMiddleware, matchingTenantSocket)).error, undefined);
    assert.deepEqual(matchingTenantSocket.data, {
      tenantId: tenantA.toString(),
      actor: { kind: 'staff', id: staff._id.toString(), scope: 'tenant' },
    });
  });
});
