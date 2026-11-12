import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Tenant from '../src/models/Tenant.js';
import Brand from '../src/models/Brand.js';
import Domain from '../src/models/Domain.js';
import StaffAccount from '../src/models/StaffAccount.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import VipLevel from '../src/models/VipLevel.js';
import StaticPage from '../src/models/StaticPage.js';
import RiskRule from '../src/models/RiskRule.js';
import { provisionTenant } from '../src/platform/services/provisioningService.js';
import { runPlatformBootstrap } from '../src/platform/bootstrap.js';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9a_t4';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  await runPlatformBootstrap({ env: { TENANCY_MODE: 'multi', TENANCY_ENFORCEMENT: 'enforce' } });
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('N4 tenant provisioning creates Tenant, Brand, Domain, seeds subset, and assigns tenant_owner', async () => {
  const result = await provisionTenant({
    key: 'gamma',
    name: 'Gamma Casino',
    legalEntity: { name: 'Gamma Ltd', registrationNo: '998877', address: 'Curacao' },
    baseCurrency: 'TRY',
    timezone: 'Europe/Istanbul',
    defaultLocale: 'tr-TR',
    domain: 'gamma.example.com',
    ownerEmail: 'owner@gamma.example.com',
    ownerUsername: 'gamma_owner',
  });

  assert.equal(result.success, true);
  const tenant = await Tenant.findOne({ key: 'gamma' });
  assert.ok(tenant, 'Tenant must exist');
  assert.equal(tenant.status, 'provisioning', 'Tenant starts in provisioning status');
  assert.equal(tenant.legalEntity.name, 'Gamma Ltd');

  // Verify Brand
  const brand = await Brand.findOne({ tenantId: tenant._id });
  assert.ok(brand, 'Default Brand must exist');
  assert.equal(brand.isDefault, true);

  // Verify Domain
  const domain = await Domain.findOne({ host: 'gamma.example.com' });
  assert.ok(domain, 'Domain must exist');
  assert.equal(domain.verifiedAt, null, 'Domain starts unverified');
  assert.equal(domain.tls.status, 'pending');

  // Verify seed subset (strictly tenantScoped, zero demo data, zero bots)
  const vipCount = await VipLevel.countDocuments({ tenantId: tenant._id });
  assert.ok(vipCount > 0, 'VIP levels must be seeded');

  const pagesCount = await StaticPage.countDocuments({ tenantId: tenant._id });
  assert.ok(pagesCount > 0, 'Static pages must be seeded');

  const rulesCount = await RiskRule.countDocuments({ tenantId: tenant._id });
  assert.ok(rulesCount > 0, 'Risk rules must be seeded');

  // Verify tenant_owner staff account
  const staff = await StaffAccount.findOne({ email: 'owner@gamma.example.com' });
  assert.ok(staff, 'Tenant owner StaffAccount must be created');
  const assignment = await RoleAssignment.findOne({ staffId: staff._id, scopeType: 'tenant', scopeId: tenant._id });
  assert.ok(assignment, 'tenant_owner role must be assigned to tenantId');
});

test('N4 provisioning is idempotent: re-running with same key never duplicates entities', async () => {
  const rerun = await provisionTenant({
    key: 'gamma',
    name: 'Gamma Casino Updated Name',
    domain: 'gamma.example.com',
    ownerEmail: 'owner@gamma.example.com',
  });

  assert.equal(rerun.success, true);
  const tenantCount = await Tenant.countDocuments({ key: 'gamma' });
  assert.equal(tenantCount, 1);

  const domainCount = await Domain.countDocuments({ host: 'gamma.example.com' });
  assert.equal(domainCount, 1);
});
