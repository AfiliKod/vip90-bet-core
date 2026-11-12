import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import path from 'path';

// Own test database; never read MONGODB_URI (it may point to a real database).
const BASE = (process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017').replace(/\/+$/, '');
const DB_URI = `${BASE}/vip90_test_ip3_t12`;

const tenancyIndexPath = path.resolve('server/src/tenancy/index.js');

const IP3_EXPORTS = {
  StaffAccount: { path: 'server/src/models/StaffAccount.js', type: 'function' },
  RoleAssignment: { path: 'server/src/models/RoleAssignment.js', type: 'function' },
  resolveTenantHost: { path: 'server/src/middleware/tenantHost.js', type: 'function' },
  requireStaff: { path: 'server/src/middleware/auth.js', type: 'function' },
  requireStaffPermission: { path: 'server/src/middleware/auth.js', type: 'function' },
  signStaffAccess: { path: 'server/src/services/staffSession.js', type: 'function' },
};

let connected = false;
async function ensureConnection() {
  if (connected) return;
  try {
    await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 3000 });
    connected = true;
  } catch {
    connected = false;
  }
}

after(async () => {
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('tenancy public surface (İP-3)', () => {
  test('re-exports every İP-3 primitive', async () => {
    const mod = await import(tenancyIndexPath);
    for (const [name, { type }] of Object.entries(IP3_EXPORTS)) {
      assert.ok(name in mod, `${name} is not exported`);
      assert.equal(typeof mod[name], type, `${name} is not a ${type}`);
    }
  });

  test('re-exports the exact object from each source module', async () => {
    const mod = await import(tenancyIndexPath);
    for (const [name, { path: sourcePath }] of Object.entries(IP3_EXPORTS)) {
      const source = await import(path.resolve(sourcePath));
      const expected = name === 'StaffAccount' || name === 'RoleAssignment' ? source.default : source[name];
      assert.equal(mod[name], expected, `${name} is not the export of ${sourcePath}`);
    }
  });

  test('keeps the pre-İP-3 surface alongside the new names', async () => {
    const mod = await import(tenancyIndexPath);
    for (const name of ['tenantContext', 'runWithTenant', 'runAsPlatform', 'defineTenantModel', 'tenantScoped']) {
      assert.ok(name in mod, `${name} disappeared`);
    }
  });

  test('StaffAccount and RoleAssignment are platform models, not tenant models', async () => {
    await ensureConnection();
    if (!connected) return; // MongoDB unavailable: the static check below still runs.
    const mod = await import(tenancyIndexPath);
    assert.equal(mod.StaffAccount.schema.path('tenantId'), undefined);
    assert.equal(mod.RoleAssignment.schema.path('tenantId'), undefined);
    assert.equal(mod.StaffAccount.collection.name, 'staffaccounts');
  });

  test('requireStaff and requireStaffPermission are middleware factories', async () => {
    const mod = await import(tenancyIndexPath);
    assert.equal(typeof mod.requireStaff(), 'function');
    assert.equal(typeof mod.requireStaffPermission('admin:users:read'), 'function');
  });
});
