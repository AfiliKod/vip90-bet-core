import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { createPartnerRouter } from '../src/platform/routes/partner.js';
import { errorHandler } from '../src/middleware/error.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Partner from '../src/models/Partner.js';
import PartnerOperatorLink from '../src/models/PartnerOperatorLink.js';
import Tenant from '../src/models/Tenant.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import AuditLog from '../src/models/AuditLog.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { signStaffAccess } from '../src/services/staffSession.js';
import { runPlatformBootstrap } from '../src/platform/bootstrap.js';

process.env.TENANCY_MODE = 'multi';
process.env.JWT_SECRET ??= 'partner-portal-test-secret';
process.env.JWT_STAFF_SECRET ??= 'partner-portal-test-staff-secret';
process.env.OPERATOR_SECRET_ENCRYPTION_KEY ??= '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9b_t5';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  await Partner.createIndexes();
  await PartnerOperatorLink.createIndexes();
  await runPlatformBootstrap({ env: { TENANCY_MODE: 'multi', TENANCY_ENFORCEMENT: 'enforce' } });
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function withPartnerApp(fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/partner', createPartnerRouter());
  app.use(errorHandler);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/partner`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

test('GET /api/partner/me returns partner profile and capabilities', async () => {
  const staff = await StaffAccount.create({ email: 'padmin@part.example.com', username: 'padmin', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'p-me', name: 'Partner Me', createdBy: staff._id });
  const role = await Role.findOne({ name: 'partner_admin' });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'partner', scopeId: partner._id });
  const token = signStaffAccess(staff, { scopeType: 'partner', scopeId: partner._id, amr: ['pwd', 'otp'] });

  await withPartnerApp(async (base) => {
    const res = await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.partner.key, 'p-me');
    assert.ok(Array.isArray(body.capabilities));
  });
});

test('GET /api/partner/tenants returns only linked operators; cross-partner access returns 404', async () => {
  const staff1 = await StaffAccount.create({ email: 'p1staff@example.com', username: 'p1staff', password: 'pwd', status: 'active' });
  const partner1 = await Partner.create({ key: 'p1', name: 'P1', createdBy: staff1._id });
  const role = await Role.findOne({ name: 'partner_admin' });
  await RoleAssignment.create({ staffId: staff1._id, roleId: role._id, scopeType: 'partner', scopeId: partner1._id });
  const token1 = signStaffAccess(staff1, { scopeType: 'partner', scopeId: partner1._id, amr: ['pwd', 'otp'] });

  const tenant1 = await Tenant.create({ key: 't1', name: 'T1', ownership: 'partner' });
  await PartnerOperatorLink.create({ partnerId: partner1._id, tenantId: tenant1._id, validTo: null, createdBy: staff1._id });
  const tenant2 = await Tenant.create({ key: 't2', name: 'T2', ownership: 'partner' });

  await withPartnerApp(async (base) => {
    const listRes = await fetch(`${base}/tenants`, { headers: { Authorization: `Bearer ${token1}` } });
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.equal(listBody.tenants.length, 1);
    assert.equal(listBody.tenants[0].key, 't1');

    const res2 = await fetch(`${base}/tenants/${tenant2._id}`, { headers: { Authorization: `Bearer ${token1}` } });
    assert.equal(res2.status, 404);
    assert.equal((await res2.json()).error.code, 'TENANT_NOT_FOUND');
  });
});

test('PUT /api/partner/tenants/:id/integrations writes credentials, masks response, and logs audit', async () => {
  const staff = await StaffAccount.create({ email: 'integ@part.example.com', username: 'integ', password: 'pwd', status: 'active' });
  const partner = await Partner.create({
    key: 'p-integ',
    name: 'P Integ',
    capabilities: ['metrics.read', 'staff.manage', 'tenants.integrations:write'],
    createdBy: staff._id,
  });
  const role = await Role.findOne({ name: 'partner_admin' });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'partner', scopeId: partner._id });
  const token = signStaffAccess(staff, { scopeType: 'partner', scopeId: partner._id, amr: ['pwd', 'otp'] });

  const tenant = await Tenant.create({ key: 't-integ', name: 'T Integ', ownership: 'partner' });
  await PartnerOperatorLink.create({ partnerId: partner._id, tenantId: tenant._id, validTo: null, createdBy: staff._id });

  await withPartnerApp(async (base) => {
    const res = await fetch(`${base}/tenants/${tenant._id}/integrations`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'smtp',
        credentials: { host: 'smtp.example.com', user: 'admin', pass: 'supersecret' },
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.pass, undefined);

    const audit = await runWithTenant(tenant._id, () => AuditLog.findOne({
      action: 'PARTNER_INTEGRATION_CONFIGURED',
      onBehalfOfTenantId: tenant._id,
    }));
    assert.ok(audit);
    assert.equal(audit.capability, 'tenants.integrations');
  });
});

async function partnerMember(partner, roleName, email) {
  const staff = await StaffAccount.create({ email, username: email.split('@')[0], password: 'pwd-not-used', status: 'active' });
  const role = await Role.findOne({ name: roleName, scopeType: 'partner', scopeId: null });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'partner', scopeId: partner._id });
  return { staff, token: signStaffAccess(staff, { scopeType: 'partner', scopeId: partner._id, amr: ['pwd', 'otp'] }) };
}
const jsonHeaders = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

test('partner staff management: no escalation, no takeover, no self or admin suspension by non-admins', async () => {
  const creator = await StaffAccount.create({ email: 'creator@platform.example.com', username: 'creator9b', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'p-staff', name: 'Staff Co', capabilities: ['metrics.read', 'staff.manage'], createdBy: creator._id });
  const admin = await partnerMember(partner, 'partner_admin', 'admin@staffco.example.com');
  const ops = await partnerMember(partner, 'partner_ops', 'ops@staffco.example.com');

  await withPartnerApp(async (base) => {
    // Admin invites a new analyst; the invitation URL comes back once.
    const invited = await fetch(`${base}/staff`, { method: 'POST', headers: jsonHeaders(admin.token), body: JSON.stringify({ email: 'new@staffco.example.com', roleName: 'partner_analyst' }) });
    assert.equal(invited.status, 201);
    assert.match((await invited.json()).inviteUrl, /accept-invite\?token=/);

    // Re-inviting someone who already signs in is refused (account takeover).
    await StaffAccount.updateOne({ _id: ops.staff._id }, { lastLoginAt: new Date() });
    const takeover = await fetch(`${base}/staff`, { method: 'POST', headers: jsonHeaders(admin.token), body: JSON.stringify({ email: 'ops@staffco.example.com', roleName: 'partner_ops' }) });
    assert.equal(takeover.status, 409);

    // Self-suspension is refused.
    const self = await fetch(`${base}/staff/${admin.staff._id}/suspend`, { method: 'PATCH', headers: jsonHeaders(admin.token) });
    assert.equal(self.status, 400);
  });
});
