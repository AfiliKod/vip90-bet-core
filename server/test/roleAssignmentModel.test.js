import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Role from '../src/models/Role.js';
import RoleAssignment, { assertNoPartnerSelfAssignment } from '../src/models/RoleAssignment.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip3_t2';

describe('Scoped Role & RoleAssignment Models', () => {
  before(async () => {
    await mongoose.connect(TEST_DB);
    await Role.init();
    await RoleAssignment.init();
    await Role.deleteMany({});
    await RoleAssignment.deleteMany({});
  });

  after(async () => {
    await Role.deleteMany({});
    await RoleAssignment.deleteMany({});
    try {
      await mongoose.connection.dropDatabase();
    } catch {
      // Ignore drop database errors
    }
    await mongoose.disconnect();
  });

  it('allows same role name across different scopes', async () => {
    const r1 = await Role.create({ name: 'admin', displayName: 'Platform Admin', scopeType: 'platform', scopeId: null });
    const tenantId = new mongoose.Types.ObjectId();
    const r2 = await Role.create({ name: 'admin', displayName: 'Tenant Admin', scopeType: 'tenant', scopeId: tenantId });
    assert.ok(r1._id);
    assert.ok(r2._id);
  });

  it('rejects duplicate role name within same scope', async () => {
    await assert.rejects(
      () => Role.create({ name: 'admin', displayName: 'Dup', scopeType: 'platform', scopeId: null }),
      /E11000/
    );
  });

  it('enforces unique RoleAssignment per staff, scope, and role', async () => {
    const staffId = new mongoose.Types.ObjectId();
    const roleId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();
    await RoleAssignment.create({ staffId, roleId, scopeType: 'tenant', scopeId: tenantId });
    await assert.rejects(
      () => RoleAssignment.create({ staffId, roleId, scopeType: 'tenant', scopeId: tenantId }),
      /E11000/
    );
  });

  it('defaults Role scopeType to tenant and scopeId to null', async () => {
    const r = await Role.create({ name: 'support_agent', displayName: 'Support Agent' });
    assert.equal(r.scopeType, 'tenant');
    assert.equal(r.scopeId, null);
  });

  it('rejects invalid scopeType for Role and RoleAssignment', async () => {
    await assert.rejects(
      () => Role.create({ name: 'invalid_role', displayName: 'Invalid', scopeType: 'super_scope' }),
      /is not a valid enum value|validation failed/i
    );
    const staffId = new mongoose.Types.ObjectId();
    const roleId = new mongoose.Types.ObjectId();
    await assert.rejects(
      () => RoleAssignment.create({ staffId, roleId, scopeType: 'super_scope' }),
      /is not a valid enum value|validation failed/i
    );
  });

  it('assertNoPartnerSelfAssignment allows assignment when staff has no partner role', async () => {
    const staffId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();
    await assert.doesNotReject(() => assertNoPartnerSelfAssignment(staffId, tenantId));
  });

  it('assertNoPartnerSelfAssignment allows assignment when partner is not linked to tenant', async () => {
    const staffId = new mongoose.Types.ObjectId();
    const partnerId = new mongoose.Types.ObjectId();
    const roleId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();

    await RoleAssignment.create({ staffId, roleId, scopeType: 'partner', scopeId: partnerId });
    await assert.doesNotReject(() => assertNoPartnerSelfAssignment(staffId, tenantId));
  });

  it('assertNoPartnerSelfAssignment rejects when partner is linked via partneroperatorlinks collection', async () => {
    const staffId = new mongoose.Types.ObjectId();
    const partnerId = new mongoose.Types.ObjectId();
    const roleId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();

    await RoleAssignment.create({ staffId, roleId, scopeType: 'partner', scopeId: partnerId });
    await mongoose.connection.collection('partneroperatorlinks').insertOne({
      partnerId,
      tenantId,
      validFrom: new Date(),
      validTo: null,
    });

    await assert.rejects(
      () => assertNoPartnerSelfAssignment(staffId, tenantId),
      /PARTNER_SELF_ASSIGNMENT_FORBIDDEN/
    );

    // Pre-save hook should also reject creating the tenant assignment
    const tenantRoleId = new mongoose.Types.ObjectId();
    await assert.rejects(
      () => RoleAssignment.create({ staffId, roleId: tenantRoleId, scopeType: 'tenant', scopeId: tenantId }),
      /PARTNER_SELF_ASSIGNMENT_FORBIDDEN/
    );

    await mongoose.connection.collection('partneroperatorlinks').deleteMany({});
  });

  it('assertNoPartnerSelfAssignment rejects when tenant has partnerId', async () => {
    const staffId = new mongoose.Types.ObjectId();
    const partnerId = new mongoose.Types.ObjectId();
    const roleId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();

    await RoleAssignment.create({ staffId, roleId, scopeType: 'partner', scopeId: partnerId });
    await mongoose.connection.collection('tenants').insertOne({
      _id: tenantId,
      key: 'test-tenant-partner',
      name: 'Test Tenant Partner',
      partnerId,
      status: 'active',
    });

    await assert.rejects(
      () => assertNoPartnerSelfAssignment(staffId, tenantId),
      /PARTNER_SELF_ASSIGNMENT_FORBIDDEN/
    );

    await mongoose.connection.collection('tenants').deleteOne({ _id: tenantId });
  });
});
