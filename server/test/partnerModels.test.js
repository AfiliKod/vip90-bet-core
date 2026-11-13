import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Partner from '../src/models/Partner.js';
import PartnerOperatorLink from '../src/models/PartnerOperatorLink.js';
import PartnerGrant, { PARTNER_GRANT_SCOPES } from '../src/models/PartnerGrant.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Tenant from '../src/models/Tenant.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import { PERMISSION_DEFS } from '../src/services/permissions.js';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9b_t1';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  // dropDatabase removes the indexes built at import; the unique rules under
  // test need them back before the first insert.
  await Promise.all([Partner.createIndexes(), PartnerOperatorLink.createIndexes()]);
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('Partner model enforces key regex and K27 default capabilities', async () => {
  const staff = await StaffAccount.create({ email: 'owner@example.com', username: 'owner', password: 'pwd', status: 'active' });

  // Invalid key rejected
  await assert.rejects(
    () => Partner.create({ key: 'INVALID_KEY!', name: 'Partner One', createdBy: staff._id }),
    /validation failed|ValidationError/i
  );

  const partner = await Partner.create({
    key: 'partner-alpha',
    name: 'Partner Alpha',
    createdBy: staff._id,
  });

  assert.equal(partner.key, 'partner-alpha');
  assert.equal(partner.status, 'active');
  // K27 defaults
  assert.deepEqual(partner.capabilities, ['metrics.read', 'staff.manage']);
  assert.equal(partner.provisioningLimits.maxTenants, 1);
  assert.deepEqual(partner.defaultCommercialTerms.model, 'revshare_ggr');
  assert.equal(partner.defaultCommercialTerms.rate, null); // K28: no built-in commercial rate
});

test('PartnerOperatorLink enforces at most one active link per tenant via partial unique index', async () => {
  const staff = await StaffAccount.create({ email: 'owner2@example.com', username: 'owner2', password: 'pwd', status: 'active' });
  const partner1 = await Partner.create({ key: 'partner-one', name: 'P1', createdBy: staff._id });
  const partner2 = await Partner.create({ key: 'partner-two', name: 'P2', createdBy: staff._id });
  const tenant = await Tenant.create({ key: 'link-op', name: 'Link Op', domain: 'link.example.com' });

  // First active link
  await PartnerOperatorLink.create({
    partnerId: partner1._id,
    tenantId: tenant._id,
    validFrom: new Date(),
    validTo: null,
    createdBy: staff._id,
  });

  // Second active link for the same tenant must fail with E11000 duplicate key
  await assert.rejects(
    () => PartnerOperatorLink.create({
      partnerId: partner2._id,
      tenantId: tenant._id,
      validFrom: new Date(),
      validTo: null,
      createdBy: staff._id,
    }),
    /E11000/
  );

  // Closing the first link allows a new active link
  await PartnerOperatorLink.updateOne({ tenantId: tenant._id, validTo: null }, { validTo: new Date(), endReason: 'transferred' });

  const secondLink = await PartnerOperatorLink.create({
    partnerId: partner2._id,
    tenantId: tenant._id,
    validFrom: new Date(),
    validTo: null,
    createdBy: staff._id,
  });
  assert.ok(secondLink._id);
});

test('PartnerGrant validates scopes and enforces maximum 90 days validity', async () => {
  const staff = await StaffAccount.create({ email: 'tenantowner@example.com', username: 'top', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'partner-grantee', name: 'PG', createdBy: staff._id });
  const tenant = await Tenant.create({ key: 'grant-op', name: 'Grant Op', domain: 'grant.example.com' });

  // Invalid scope rejected
  await assert.rejects(
    () => PartnerGrant.create({
      partnerId: partner._id,
      tenantId: tenant._id,
      scopes: ['invalid:scope'],
      grantedBy: staff._id,
      reason: 'Support request',
      validFrom: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    }),
    /validation failed|ValidationError/i
  );

  // Exceeding 90 days rejected
  const moreThan90Days = new Date(Date.now() + 91 * 86400000);
  await assert.rejects(
    () => PartnerGrant.create({
      partnerId: partner._id,
      tenantId: tenant._id,
      scopes: ['players:read'],
      grantedBy: staff._id,
      reason: 'Audit inspection',
      validFrom: new Date(),
      expiresAt: moreThan90Days,
    }),
    /exceed 90 days/i
  );

  // Valid grant within 90 days succeeds
  const validGrant = await PartnerGrant.create({
    partnerId: partner._id,
    tenantId: tenant._id,
    scopes: ['players:read', 'support:write'],
    grantedBy: staff._id,
    reason: 'Player support investigation',
    validFrom: new Date(),
    expiresAt: new Date(Date.now() + 30 * 86400000),
  });
  assert.ok(validGrant._id);
  assert.equal(validGrant.status, 'active');
});

test('assertNoPartnerSelfAssignment prevents partner staff from getting tenant role on linked operator', async () => {
  const pStaff = await StaffAccount.create({ email: 'pstaff@example.com', username: 'pstaff', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'partner-linked', name: 'PL', createdBy: pStaff._id });
  const tenant = await Tenant.create({ key: 'linked-tenant', name: 'LT', domain: 'lt.example.com' });

  await PartnerOperatorLink.create({
    partnerId: partner._id,
    tenantId: tenant._id,
    validFrom: new Date(),
    validTo: null,
    createdBy: pStaff._id,
  });

  const pRole = await Role.create({ name: 'custom_partner_role', displayName: 'P Role', scopeType: 'partner', scopeId: partner._id });
  const tRole = await Role.create({ name: 'custom_tenant_role', displayName: 'T Role', scopeType: 'tenant', scopeId: tenant._id });

  // Assign partner role
  await RoleAssignment.create({ staffId: pStaff._id, roleId: pRole._id, scopeType: 'partner', scopeId: partner._id });

  // Attempting to assign tenant role on linked tenant must throw PARTNER_SELF_ASSIGNMENT_FORBIDDEN
  await assert.rejects(
    () => RoleAssignment.create({ staffId: pStaff._id, roleId: tRole._id, scopeType: 'tenant', scopeId: tenant._id }),
    (err) => err.code === 'PARTNER_SELF_ASSIGNMENT_FORBIDDEN'
  );
});

test('Permissions catalogue includes admin:partner-grants:* keys', () => {
  const keys = new Set(PERMISSION_DEFS.map((p) => p.key));
  assert.ok(keys.has('admin:partner-grants:read'), 'admin:partner-grants:read must exist');
  assert.ok(keys.has('admin:partner-grants:write'), 'admin:partner-grants:write must exist');
});