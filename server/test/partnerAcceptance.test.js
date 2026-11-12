// İP-9b acceptance suite: sales-partner scenario end-to-end (§8.1)
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { runPlatformBootstrap } from '../src/platform/bootstrap.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Partner from '../src/models/Partner.js';
import PartnerOperatorLink from '../src/models/PartnerOperatorLink.js';
import PartnerGrant from '../src/models/PartnerGrant.js';
import Tenant from '../src/models/Tenant.js';
import Domain from '../src/models/Domain.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import AuditLog from '../src/models/AuditLog.js';
import TenantDailyStat from '../src/models/TenantDailyStat.js';
import { signStaffAccess } from '../src/services/staffSession.js';
import { runWithTenant } from '../src/tenancy/context.js';

process.env.NODE_ENV = 'test';
process.env.TENANCY_MODE = 'multi';
process.env.TENANCY_ENFORCEMENT = 'enforce';
process.env.JWT_SECRET ||= 'ip9b-acceptance-jwt-secret';
process.env.JWT_STAFF_SECRET ||= 'ip9b-acceptance-staff-secret';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9b_t9';

let server;
let base;
let platformToken;
let partnerToken;
let partnerStaff;
let partner;
let tenant;

function jsonHeaders(token, extra = {}) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra };
}

async function createPartner(body) {
  const response = await fetch(`${base}/api/platform/partners`, {
    method: 'POST',
    headers: jsonHeaders(platformToken),
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 201);
  return (await response.json()).partner;
}

async function addPartnerStaff(partnerId, roleName, { email, username }) {
  const staff = await StaffAccount.create({ email, username, password: 'pwd', status: 'active' });
  const role = await Role.findOne({ name: roleName, scopeType: 'partner', scopeId: null });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'partner', scopeId: partnerId });
  return {
    staff,
    token: signStaffAccess(staff, { scopeType: 'partner', scopeId: partnerId, amr: ['pwd', 'otp'] }),
  };
}

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  // dropDatabase removes the partial unique link index that this suite verifies.
  await Promise.all([
    StaffAccount.createIndexes(),
    Partner.createIndexes(),
    PartnerOperatorLink.createIndexes(),
    PartnerGrant.createIndexes(),
    Tenant.createIndexes(),
    Domain.createIndexes(),
    Role.createIndexes(),
    RoleAssignment.createIndexes(),
    AuditLog.createIndexes(),
    TenantDailyStat.createIndexes(),
  ]);
  await runPlatformBootstrap({ env: { TENANCY_MODE: 'multi', TENANCY_ENFORCEMENT: 'enforce' } });

  const platformOwner = await StaffAccount.create({
    email: 'owner@platform.example.com', username: 'platform-owner', password: 'pwd', status: 'active',
  });
  const platformOwnerRole = await Role.findOne({ name: 'platform_owner', scopeType: 'platform', scopeId: null });
  await RoleAssignment.create({ staffId: platformOwner._id, roleId: platformOwnerRole._id, scopeType: 'platform', scopeId: null });
  platformToken = signStaffAccess(platformOwner, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });

  const app = createApp();
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('sales-partner end-to-end acceptance scenario', async () => {
  // The platform gives this partner the minimum additional capability set and
  // a quota of one operator.
  partner = await createPartner({
    key: 'partner-sales',
    name: 'Sales Partner One',
    capabilities: ['metrics.read', 'staff.manage', 'tenants.create', 'tenants.status:write', 'tenants.staff:write'],
    provisioningLimits: { maxTenants: 1, allowedModules: ['sports'] },
    defaultCommercialTerms: { model: 'revshare_ggr', rate: 0.15, currency: 'TRY' },
  });
  assert.equal(partner.provisioningLimits.maxTenants, 1);

  ({ staff: partnerStaff, token: partnerToken } = await addPartnerStaff(partner._id, 'partner_admin', {
    email: 'admin@salespartner.example.com', username: 'sales-admin',
  }));

  // An existing platform tenant cannot be adopted by a partner key collision.
  await Tenant.create({ key: 'existing-platform', name: 'Existing Platform' });
  const takenRes = await fetch(`${base}/api/partner/tenants`, {
    method: 'POST',
    headers: jsonHeaders(partnerToken),
    body: JSON.stringify({ key: 'existing-platform', name: 'Attempted Adoption', domain: 'existing.example.com', entitlements: { modules: ['sports'] } }),
  });
  assert.equal(takenRes.status, 409);
  assert.equal((await takenRes.json()).error.code, 'TENANT_KEY_TAKEN');

  // Provisioning is idempotent: only the first call returns the owner invite.
  const provisionBody = {
    key: 'op-alpha', name: 'Operator Alpha', domain: 'alpha.example.com',
    ownerEmail: 'owner@alpha.example.com', ownerUsername: 'alpha-owner', entitlements: { modules: ['sports'] },
  };
  const provisionRes = await fetch(`${base}/api/partner/tenants`, {
    method: 'POST', headers: jsonHeaders(partnerToken), body: JSON.stringify(provisionBody),
  });
  if (provisionRes.status !== 201) assert.fail(await provisionRes.text());
  assert.equal(provisionRes.status, 201);
  const provisioned = await provisionRes.json();
  tenant = provisioned.tenant;
  assert.equal(tenant.ownership, 'partner');
  assert.equal(tenant.createdVia, 'partner');
  assert.ok(provisioned.ownerInviteUrl);

  const repeatProvisionRes = await fetch(`${base}/api/partner/tenants`, {
    method: 'POST', headers: jsonHeaders(partnerToken), body: JSON.stringify(provisionBody),
  });
  assert.equal(repeatProvisionRes.status, 201);
  const repeated = await repeatProvisionRes.json();
  assert.equal(String(repeated.tenant._id), String(tenant._id));
  assert.equal(repeated.ownerInviteUrl, null);

  const link = await PartnerOperatorLink.findOne({ tenantId: tenant._id, validTo: null });
  assert.ok(link);
  assert.equal(String(link.partnerId), String(partner._id));

  const forbiddenModuleRes = await fetch(`${base}/api/partner/tenants`, {
    method: 'POST',
    headers: jsonHeaders(partnerToken),
    body: JSON.stringify({ key: 'op-casino', name: 'Casino Operator', domain: 'casino.example.com', entitlements: { modules: ['casino-content'] } }),
  });
  assert.equal(forbiddenModuleRes.status, 400);
  assert.equal((await forbiddenModuleRes.json()).error.code, 'MODULE_NOT_ALLOWED');

  const quotaRes = await fetch(`${base}/api/partner/tenants`, {
    method: 'POST',
    headers: jsonHeaders(partnerToken),
    body: JSON.stringify({ key: 'op-second', name: 'Second Operator', domain: 'second.example.com', entitlements: { modules: ['sports'] } }),
  });
  assert.equal(quotaRes.status, 400);
  assert.equal((await quotaRes.json()).error.code, 'MAX_TENANTS_EXCEEDED');

  // Requested force is discarded for partner calls, so the normal checklist gate applies.
  const forceRes = await fetch(`${base}/api/partner/tenants/${tenant._id}/status`, {
    method: 'PATCH', headers: jsonHeaders(partnerToken), body: JSON.stringify({ status: 'active', force: true }),
  });
  assert.equal(forceRes.status, 409);
  assert.equal((await forceRes.json()).error.code, 'CHECKLIST_INCOMPLETE');
  const closeRes = await fetch(`${base}/api/partner/tenants/${tenant._id}/status`, {
    method: 'PATCH', headers: jsonHeaders(partnerToken), body: JSON.stringify({ status: 'closed' }),
  });
  assert.equal(closeRes.status, 403);
  assert.equal((await closeRes.json()).error.code, 'PLATFORM_ONLY');

  const p2 = await createPartner({ key: 'partner-two', name: 'Partner Two' });
  const p2Staff = await addPartnerStaff(p2._id, 'partner_admin', { email: 'admin@partnertwo.example.com', username: 'two-admin' });
  const p2Tenant = await Tenant.create({ key: 'op-beta', name: 'Operator Beta', ownership: 'partner' });
  await PartnerOperatorLink.create({ partnerId: p2._id, tenantId: p2Tenant._id, validTo: null, createdBy: p2Staff.staff._id });

  for (const path of [`/api/partner/tenants/${p2Tenant._id}`, `/api/partner/tenants/${p2Tenant._id}/metrics`]) {
    const response = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${partnerToken}` } });
    assert.equal(response.status, 404);
  }
  const staffRes = await fetch(`${base}/api/partner/staff`, { headers: { Authorization: `Bearer ${partnerToken}` } });
  assert.equal(staffRes.status, 200);
  assert.ok(!(await staffRes.json()).staff.some((member) => String(member._id) === String(p2Staff.staff._id)));

  await TenantDailyStat.create({
    tenantId: tenant._id, date: '2026-11-12', casinoTurnover: 0, casinoGgr: 0,
    sportsTurnover: 40000, sportsGgrRealized: 6000, activePlayers: 4,
  });
  const metricsRes = await fetch(`${base}/api/partner/tenants/${tenant._id}/metrics`, {
    headers: { Authorization: `Bearer ${partnerToken}` },
  });
  assert.equal(metricsRes.status, 200);
  const metrics = (await metricsRes.json()).metrics;
  assert.deepEqual(Object.keys(metrics).sort(), [
    'activePlayers', 'bonusCost', 'casinoGgr', 'casinoTurnover', 'deposits', 'sportsGgrRealized', 'sportsTurnover', 'withdrawals',
  ]);
  assert.equal(metrics.sportsGgrRealized, 6000);
  assert.equal(metrics.activePlayers, '<5');

  // Role permission and partner capability are both required.
  const roleOnlyPartner = await createPartner({ key: 'role-only', name: 'Role Only' });
  const roleOnly = await addPartnerStaff(roleOnlyPartner._id, 'partner_admin', { email: 'admin@roleonly.example.com', username: 'role-only' });
  const capabilityOnlyPartner = await createPartner({
    key: 'capability-only', name: 'Capability Only', capabilities: ['metrics.read', 'tenants.create'],
  });
  const capabilityOnly = await addPartnerStaff(capabilityOnlyPartner._id, 'partner_analyst', { email: 'analyst@caponly.example.com', username: 'cap-only' });
  for (const [index, token] of [roleOnly.token, capabilityOnly.token].entries()) {
    const response = await fetch(`${base}/api/partner/tenants`, {
      method: 'POST', headers: jsonHeaders(token),
      body: JSON.stringify({ key: `denied-${index}`, name: 'Denied', domain: `denied-${index}.example.com` }),
    });
    assert.equal(response.status, 403);
  }

  const ops = await addPartnerStaff(partner._id, 'partner_ops', { email: 'ops@salespartner.example.com', username: 'sales-ops' });
  const escalationRes = await fetch(`${base}/api/partner/staff`, {
    method: 'POST', headers: jsonHeaders(ops.token),
    body: JSON.stringify({ email: 'escalated@salespartner.example.com', roleName: 'partner_admin' }),
  });
  assert.equal(escalationRes.status, 403);

  // Tenant owner can issue an active grant; partner staff cannot manage grants.
  const tenantOwnerRole = await Role.findOne({ name: 'tenant_owner', scopeType: 'tenant', scopeId: null });
  const owner = await StaffAccount.findOne({ email: 'owner@alpha.example.com' });
  const ownerToken = signStaffAccess(owner, { scopeType: 'tenant', scopeId: tenant._id, amr: ['pwd', 'otp'] });
  await Domain.updateOne({ tenantId: tenant._id, host: 'alpha.example.com' }, { verifiedAt: new Date() });
  const tenantHeaders = (token) => jsonHeaders(token, {
    'X-Forwarded-Host': 'alpha.example.com', 'X-Tenant-Id': String(tenant._id),
  });
  const noGrantRes = await fetch(`${base}/api/admin/partner-grants`, {
    method: 'POST', headers: tenantHeaders(partnerToken),
    body: JSON.stringify({ partnerId: partner._id, scopes: ['players:read'], reason: 'No grant yet', durationDays: 1 }),
  });
  assert.equal(noGrantRes.status, 403);
  assert.equal((await noGrantRes.json()).error.code, 'PARTNER_GRANT_REQUIRED');
  const grantRes = await fetch(`${base}/api/admin/partner-grants`, {
    method: 'POST', headers: tenantHeaders(ownerToken),
    body: JSON.stringify({ partnerId: partner._id, scopes: ['players:read'], reason: 'Support escalation', durationDays: 14 }),
  });
  assert.equal(tenantOwnerRole.name, 'tenant_owner');
  assert.equal(grantRes.status, 201);
  const grant = (await grantRes.json()).grant;
  assert.equal(String(grant.partnerId), String(partner._id));

  const selfGrantRes = await fetch(`${base}/api/admin/partner-grants`, {
    method: 'POST', headers: tenantHeaders(partnerToken),
    body: JSON.stringify({ partnerId: partner._id, scopes: ['finance:read'], reason: 'No self grant', durationDays: 1 }),
  });
  assert.equal(selfGrantRes.status, 403);

  const grantAudit = await runWithTenant(tenant._id, () => AuditLog.findOne({
    action: 'PARTNER_GRANT_ISSUED', onBehalfOfTenantId: tenant._id,
  }));
  assert.ok(grantAudit);
  await assert.rejects(
    () => RoleAssignment.create({ staffId: partnerStaff._id, roleId: tenantOwnerRole._id, scopeType: 'tenant', scopeId: tenant._id }),
    (error) => error.code === 'PARTNER_SELF_ASSIGNMENT_FORBIDDEN',
  );

  process.env.TENANCY_MODE = 'single';
  const singleModeServer = createApp().listen(0);
  try {
    const singleModeBase = `http://127.0.0.1:${singleModeServer.address().port}`;
    const singleModeRes = await fetch(`${singleModeBase}/api/partner/me`);
    assert.equal(singleModeRes.status, 404);
  } finally {
    process.env.TENANCY_MODE = 'multi';
    await new Promise((resolve, reject) => singleModeServer.close((error) => (error ? reject(error) : resolve())));
  }
});
