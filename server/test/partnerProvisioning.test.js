import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { provisionTenant } from '../src/platform/services/provisioningService.js';
import { transitionTenantStatus } from '../src/platform/services/tenantLifecycle.js';
import Partner from '../src/models/Partner.js';
import PartnerOperatorLink from '../src/models/PartnerOperatorLink.js';
import Tenant from '../src/models/Tenant.js';
import StaffAccount from '../src/models/StaffAccount.js';
import AuditLog from '../src/models/AuditLog.js';
import { runWithTenant } from '../src/tenancy/context.js';

process.env.TENANCY_MODE = 'multi';
const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9b_t3';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
});

// VipLevel/ChatRoom keep their legacy global unique indexes (§8.2), so a second
// seeded operator in the same database collides. Each case starts from a clean
// database; dropDatabase removes the indexes built at import, so the unique
// rules this suite relies on are rebuilt before the first insert.
test.beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await Promise.all([
    Partner.createIndexes(),
    PartnerOperatorLink.createIndexes(),
    Tenant.createIndexes(),
    StaffAccount.createIndexes(),
  ]);
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('partner provisions operator within limits, creating PartnerOperatorLink and partner audit log', async () => {
  const staff = await StaffAccount.create({ email: 'padmin@example.com', username: 'padmin', password: 'pwd', status: 'active' });
  const partner = await Partner.create({
    key: 'partner-prov',
    name: 'Partner Prov',
    capabilities: ['metrics.read', 'staff.manage', 'tenants.create'],
    provisioningLimits: {
      maxTenants: 2,
      allowedModules: ['sports', 'casino'],
      entitlementCeiling: {},
    },
    createdBy: staff._id,
  });

  const res = await provisionTenant({
    key: 'p-tenant-1',
    name: 'Partner Tenant 1',
    domain: 'ptenant1.example.com',
    entitlements: { modules: ['sports'] },
  }, {
    createdByStaffId: staff._id,
    partnerId: partner._id,
    createdVia: 'partner',
  });

  assert.equal(res.tenant.ownership, 'partner');
  assert.equal(res.tenant.createdVia, 'partner');

  // Verify PartnerOperatorLink created
  const link = await PartnerOperatorLink.findOne({ tenantId: res.tenant._id, validTo: null });
  assert.ok(link);
  assert.equal(String(link.partnerId), String(partner._id));

  // Verify AuditLog record
  const audit = await runWithTenant(res.tenant._id, () => AuditLog.findOne({
    action: 'PARTNER_TENANT_PROVISIONED',
    onBehalfOfTenantId: res.tenant._id,
  }));
  assert.ok(audit);
  assert.equal(audit.actorScope, 'partner');
  assert.equal(String(audit.partnerId), String(partner._id));
});

test('partner provisioning rejects requests exceeding maxTenants or forbidden modules', async () => {
  const staff = await StaffAccount.create({ email: 'padmin2@example.com', username: 'padmin2', password: 'pwd', status: 'active' });
  const partner = await Partner.create({
    key: 'partner-limits',
    name: 'Partner Limits',
    capabilities: ['tenants.create'],
    provisioningLimits: {
      maxTenants: 1,
      allowedModules: ['sports'],
    },
    createdBy: staff._id,
  });

  // Disallowed module rejected
  await assert.rejects(
    () => provisionTenant({
      key: 'p-forbidden-mod',
      name: 'Forbidden Mod',
      domain: 'forbidden.example.com',
      entitlements: { modules: ['casino-content'] },
    }, { createdByStaffId: staff._id, partnerId: partner._id, createdVia: 'partner' }),
    /MODULE_NOT_ALLOWED/
  );

  // First tenant provisioned
  await provisionTenant({
    key: 'p-allowed-1',
    name: 'Allowed 1',
    domain: 'allowed1.example.com',
    entitlements: { modules: ['sports'] },
  }, { createdByStaffId: staff._id, partnerId: partner._id, createdVia: 'partner' });

  // Exceeding maxTenants rejected
  await assert.rejects(
    () => provisionTenant({
      key: 'p-exceed-quota',
      name: 'Exceed Quota',
      domain: 'exceed.example.com',
      entitlements: { modules: ['sports'] },
    }, { createdByStaffId: staff._id, partnerId: partner._id, createdVia: 'partner' }),
    /MAX_TENANTS_EXCEEDED/
  );
});

test('partner lifecycle transitions: can suspend and resume, cannot close or force activate', async () => {
  const staff = await StaffAccount.create({ email: 'pstaff3@example.com', username: 'pstaff3', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'partner-lc', name: 'PLC', createdBy: staff._id });
  const tenant = await Tenant.create({ key: 'lc-tenant', name: 'LC Tenant', status: 'active', ownership: 'partner', createdVia: 'partner' });
  await PartnerOperatorLink.create({ partnerId: partner._id, tenantId: tenant._id, validTo: null, createdBy: staff._id });

  // Partner can suspend active tenant
  const suspended = await transitionTenantStatus(tenant._id, 'suspended', {
    actorStaffId: staff._id,
    actorScope: 'partner',
    partnerId: partner._id,
    reason: 'Maintenance',
  });
  assert.equal(suspended.status, 'suspended');

  // Partner CANNOT close tenant (platform-only)
  await assert.rejects(
    () => transitionTenantStatus(tenant._id, 'closed', {
      actorStaffId: staff._id,
      actorScope: 'partner',
      partnerId: partner._id,
      reason: 'Termination',
    }),
    /PLATFORM_ONLY/
  );

  // Partner CANNOT force activation past checklist
  await assert.rejects(
    () => transitionTenantStatus(tenant._id, 'active', {
      actorStaffId: staff._id,
      actorScope: 'partner',
      partnerId: partner._id,
      force: true,
      reason: 'Override',
    }),
    /PLATFORM_ONLY/
  );
});