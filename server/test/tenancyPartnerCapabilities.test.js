import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Permission from '../src/models/Permission.js';
import Role from '../src/models/Role.js';
import RoleAssignment, { assertNoPartnerSelfAssignment } from '../src/models/RoleAssignment.js';
import StaffAccount from '../src/models/StaffAccount.js';
import {
  getStaffEffectivePermissions,
  validateRolePermissions,
} from '../src/services/permissions.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip3_t11_partner';

describe('§8.1 partner capability boundaries', () => {
  let staff;
  let partnerId;

  before(async () => {
    await mongoose.connect(TEST_DB);
    await mongoose.connection.dropDatabase();
    staff = await StaffAccount.create({
      email: 'partner-cross-checks@example.test',
      username: 'partner-cross-checks',
      password: 'Password123!',
    });
    partnerId = new mongoose.Types.ObjectId();
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('caps partner permissions to the partner and tenant-link capability sets', async () => {
    const [metrics, createTenant] = await Permission.create([
      { key: 'partner:metrics:read', name: 'Metrics', category: 'partner' },
      { key: 'partner:tenants:create', name: 'Create tenant', category: 'partner' },
    ]);
    const role = await Role.create({
      name: 'ip3-t11-partner-role',
      displayName: 'Partner cross-check role',
      scopeType: 'partner',
      permissions: [metrics._id, createTenant._id],
    });
    await RoleAssignment.create({
      staffId: staff._id,
      roleId: role._id,
      scopeType: 'partner',
      scopeId: partnerId,
    });

    const effective = await getStaffEffectivePermissions(staff._id, {
      scopeType: 'partner',
      scopeId: partnerId,
      partnerCapabilities: ['metrics.read', 'tenants.create'],
      linkCapabilities: ['metrics.read'],
    });
    assert.equal(effective.has('partner:metrics:read'), true);
    assert.equal(effective.has('partner:tenants:create'), false);
  });

  it('rejects tenant roles carrying platform permissions', () => {
    assert.throws(
      () => validateRolePermissions('tenant', ['admin:users:read', 'platform:tenants:manage']),
      (error) => error.status === 400 && error.code === 'PLATFORM_PERMISSION_FORBIDDEN',
    );
  });

  it('prevents partner staff from taking a tenant role on a linked tenant', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    await mongoose.connection.collection('partneroperatorlinks').insertOne({
      partnerId,
      tenantId,
      validFrom: new Date(),
      validTo: null,
    });

    await assert.rejects(
      () => assertNoPartnerSelfAssignment(staff._id, tenantId),
      (error) => error.statusCode === 403 && error.code === 'PARTNER_SELF_ASSIGNMENT_FORBIDDEN',
    );
    await assert.rejects(
      () => RoleAssignment.create({
        staffId: staff._id,
        roleId: new mongoose.Types.ObjectId(),
        scopeType: 'tenant',
        scopeId: tenantId,
      }),
      (error) => error.statusCode === 403 && error.code === 'PARTNER_SELF_ASSIGNMENT_FORBIDDEN',
    );
  });
});
