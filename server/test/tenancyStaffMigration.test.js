import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import Tenant from '../src/models/Tenant.js';
import Migration from '../src/models/Migration.js';
import { migrateAdminUsersToStaff } from '../src/tenancy/staffMigration.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip3_t9';

describe('G5 Staff Migration', () => {
  let defaultTenant, superAdminRole, adminUser;

  before(async () => {
    await mongoose.connect(TEST_DB);
    await Promise.all([User.deleteMany({}), StaffAccount.deleteMany({}), Role.deleteMany({}), RoleAssignment.deleteMany({}), Tenant.deleteMany({}), Migration.deleteMany({})]);

    defaultTenant = await Tenant.create({ key: 'default', name: 'Default', isDefault: true, status: 'active' });
    superAdminRole = await Role.create({ name: 'super_admin', displayName: 'Super Admin', scopeType: 'tenant', scopeId: null });
    await Role.create({ name: 'platform_owner', displayName: 'PO', scopeType: 'platform', scopeId: null });
    await Role.create({ name: 'tenant_owner', displayName: 'TO', scopeType: 'tenant', scopeId: null });

    adminUser = await User.create({
      username: 'main_admin',
      email: 'admin@vip90.bet',
      password: 'HashedPassword123',
      role: 'admin',
      roles: [superAdminRole._id],
    });
  });

  after(async () => {
    await Promise.all([User.deleteMany({}), StaffAccount.deleteMany({}), Role.deleteMany({}), RoleAssignment.deleteMany({}), Tenant.deleteMany({}), Migration.deleteMany({})]);
    await mongoose.disconnect();
  });

  it('migrates admin User to StaffAccount preserving exact _id and assigns owner roles', async () => {
    const res = await migrateAdminUsersToStaff({ defaultTenantId: defaultTenant._id });
    assert.equal(res.migrated, 1);

    const staff = await StaffAccount.findById(adminUser._id);
    assert.ok(staff);
    assert.equal(staff.email, 'admin@vip90.bet');

    const assignments = await RoleAssignment.find({ staffId: staff._id }).populate('roleId');
    const roleNames = assignments.map(a => a.roleId.name);
    assert.ok(roleNames.includes('platform_owner'));
    assert.ok(roleNames.includes('tenant_owner'));

    const updatedUser = await User.findById(adminUser._id);
    assert.ok(updatedUser.staffMigratedAt);
    assert.equal(updatedUser.role, 'admin'); // Not demoted in single mode!
  });

  it('is completely idempotent on second run', async () => {
    const res = await migrateAdminUsersToStaff({ defaultTenantId: defaultTenant._id });
    assert.equal(res.migrated, 0);
    assert.equal(res.skipped, 1);
  });
});