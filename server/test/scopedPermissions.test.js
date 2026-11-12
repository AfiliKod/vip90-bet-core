import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Permission from '../src/models/Permission.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import StaffAccount from '../src/models/StaffAccount.js';
import {
  syncMissingPermissions,
  initDefaultScopedRoles,
  getStaffEffectivePermissions,
  validateRolePermissions,
  PARTNER_PERMISSION_DEFS,
} from '../src/services/permissions.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip3_t3';

describe('Scoped Permissions & Role System', () => {
  before(async () => {
    await mongoose.connect(TEST_DB);
    await Promise.all([Permission.deleteMany({}), Role.deleteMany({}), RoleAssignment.deleteMany({}), StaffAccount.deleteMany({})]);
  });

  after(async () => {
    await Promise.all([Permission.deleteMany({}), Role.deleteMany({}), RoleAssignment.deleteMany({}), StaffAccount.deleteMany({})]);
    await mongoose.disconnect();
  });

  it('syncs partner and platform permissions into catalog', async () => {
    await syncMissingPermissions();
    const partnerPerm = await Permission.findOne({ key: 'partner:metrics:read' });
    const platformPerm = await Permission.findOne({ key: 'platform:events:settle' });
    assert.ok(partnerPerm);
    assert.ok(platformPerm);
  });

  it('prevents assigning platform:* permissions to tenant scope', () => {
    assert.throws(
      () => validateRolePermissions('tenant', ['admin:users:read', 'platform:events:settle']),
      /PLATFORM_PERMISSION_FORBIDDEN/
    );
  });

  it('caps partner permissions by capability set (R10)', async () => {
    const staff = await StaffAccount.create({ email: 'partner_staff@test.com', username: 'pstaff', password: 'pwd' });
    const perm1 = await Permission.findOne({ key: 'partner:metrics:read' });
    const perm2 = await Permission.findOne({ key: 'partner:tenants:create' });
    const role = await Role.create({
      name: 'partner_role', displayName: 'PR', scopeType: 'partner', scopeId: null,
      permissions: [perm1._id, perm2._id],
    });
    const partnerId = new mongoose.Types.ObjectId();
    await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'partner', scopeId: partnerId });

    // Allowed capability set only includes metrics.read
    const perms = await getStaffEffectivePermissions(staff._id, {
      scopeType: 'partner',
      scopeId: partnerId,
      partnerCapabilities: ['metrics.read'], // maps to partner:metrics:read
    });
    assert.ok(perms.has('partner:metrics:read'));
    assert.equal(perms.has('partner:tenants:create'), false);
  });
});
