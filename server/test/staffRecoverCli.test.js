import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import StaffAccount from '../src/models/StaffAccount.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import Tenant from '../src/models/Tenant.js';
import { runStaffRecover } from '../../scripts/staff-recover.mjs';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip3_t7';
// The CLI refuses to run against a database other than the one this process is
// connected to; the test preload may suffix the name, so pass the connected one.
const connectedUri = () => `mongodb://127.0.0.1:27017/${mongoose.connection.name}`;

describe('Staff Recovery CLI (G5)', () => {
  let defaultTenant;

  before(async () => {
    await mongoose.connect(TEST_DB);
    await Promise.all([StaffAccount.deleteMany({}), Role.deleteMany({}), RoleAssignment.deleteMany({}), Tenant.deleteMany({})]);
    defaultTenant = await Tenant.create({ key: 'default', name: 'Default', isDefault: true, status: 'active' });
    await Role.create({ name: 'platform_owner', displayName: 'PO', scopeType: 'platform', scopeId: null });
    await Role.create({ name: 'tenant_owner', displayName: 'TO', scopeType: 'tenant', scopeId: null });
  });

  after(async () => {
    await Promise.all([StaffAccount.deleteMany({}), Role.deleteMany({}), RoleAssignment.deleteMany({}), Tenant.deleteMany({})]);
    await mongoose.disconnect();
  });

  it('resets password and bumps tokenVersion', async () => {
    const staff = await StaffAccount.create({ email: 'locked@test.com', username: 'locked', password: 'old', tokenVersion: 0 });
    const res = await runStaffRecover(['--email', 'locked@test.com', '--reset-password', 'NewSecurePass123!'], { dbUri: connectedUri() });
    assert.equal(res.success, true);

    const updated = await StaffAccount.findById(staff._id).select('+password');
    assert.equal(await updated.comparePassword('NewSecurePass123!'), true);
    assert.equal(updated.tokenVersion, 1);
  });

  it('resets 2FA on account', async () => {
    const staff = await StaffAccount.create({
      email: '2fa_locked@test.com', username: 'tfa', password: 'pwd',
      twoFactor: { enabled: true, secretEnc: 'enc:xxx' },
    });
    const res = await runStaffRecover(['--email', '2fa_locked@test.com', '--reset-2fa'], { dbUri: connectedUri() });
    assert.equal(res.success, true);

    const updated = await StaffAccount.findById(staff._id);
    assert.equal(updated.twoFactor.enabled, false);
  });

  it('promotes staff to owner across platform and default tenant', async () => {
    const staff = await StaffAccount.create({ email: 'promote@test.com', username: 'prom', password: 'pwd' });
    const res = await runStaffRecover(['--email', 'promote@test.com', '--promote-owner'], { dbUri: connectedUri() });
    assert.equal(res.success, true);

    const assignments = await RoleAssignment.find({ staffId: staff._id }).populate('roleId');
    const roles = assignments.map(a => a.roleId.name);
    assert.ok(roles.includes('platform_owner'));
    assert.ok(roles.includes('tenant_owner'));
  });
});
