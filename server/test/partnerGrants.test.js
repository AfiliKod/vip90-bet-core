import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { requireStaff } from '../src/middleware/auth.js';
import { enforcePartnerGrant } from '../src/middleware/partnerGrantGuard.js';
import partnerGrantsRouter from '../src/routes/partnerGrants.js';
import { errorHandler } from '../src/middleware/error.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Partner from '../src/models/Partner.js';
import PartnerOperatorLink from '../src/models/PartnerOperatorLink.js';
import PartnerGrant from '../src/models/PartnerGrant.js';
import Tenant from '../src/models/Tenant.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import Permission from '../src/models/Permission.js';
import AuditLog from '../src/models/AuditLog.js';
import { signStaffAccess } from '../src/services/staffSession.js';
import { runWithTenant } from '../src/tenancy/context.js';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9b_t7';
let originalEnv;

test.before(async () => {
  originalEnv = {
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_STAFF_SECRET: process.env.JWT_STAFF_SECRET,
    TENANCY_MODE: process.env.TENANCY_MODE,
  };
  process.env.JWT_SECRET = 'ip9b-t7-player-secret';
  process.env.JWT_STAFF_SECRET = 'ip9b-t7-staff-secret';
  process.env.TENANCY_MODE = 'multi';
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all([
    StaffAccount.createIndexes(),
    Partner.createIndexes(),
    PartnerOperatorLink.createIndexes(),
    PartnerGrant.createIndexes(),
    Tenant.createIndexes(),
    Role.createIndexes(),
    RoleAssignment.createIndexes(),
    Permission.createIndexes(),
    AuditLog.createIndexes(),
  ]);
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('tenant staff can issue and revoke PartnerGrant', async () => {
  const tStaff = await StaffAccount.create({ email: 'towner@example.com', username: 'towner', password: 'pwd', status: 'active' });
  const tenant = await Tenant.create({ key: 'grants-t1', name: 'GT1' });
  const partner = await Partner.create({ key: 'grants-p1', name: 'GP1', createdBy: tStaff._id });
  await PartnerOperatorLink.create({ partnerId: partner._id, tenantId: tenant._id, validTo: null, createdBy: tStaff._id });

  const permissions = await Permission.create([
    { key: 'admin:partner-grants:read', name: 'Read partner grants', category: 'settings' },
    { key: 'admin:partner-grants:write', name: 'Write partner grants', category: 'settings' },
  ]);
  const role = await Role.create({
    name: 'tenant_owner',
    displayName: 'TO',
    permissions: permissions.map((permission) => permission._id),
    scopeType: 'tenant',
    scopeId: tenant._id,
  });
  await RoleAssignment.create({ staffId: tStaff._id, roleId: role._id, scopeType: 'tenant', scopeId: tenant._id });
  const token = signStaffAccess(tStaff, { scopeType: 'tenant', scopeId: tenant._id, amr: ['pwd', 'otp'] });

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.tenant = { id: tenant._id }; next(); });
  app.use('/api/admin/partner-grants', partnerGrantsRouter);
  app.use(errorHandler);

  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/admin/partner-grants`;

  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partnerId: partner._id,
        scopes: ['players:read', 'support:write'],
        reason: 'Temporary support inspection',
        durationDays: 30,
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.grant._id);

    const revokeRes = await fetch(`${base}/${body.grant._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(revokeRes.status, 200);
    const revoked = await PartnerGrant.findById(body.grant._id);
    assert.ok(revoked.revokedAt);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('partner staff access with valid grant succeeds and writes audit log; financial mutations blocked', async () => {
  const pStaff = await StaffAccount.create({ email: 'pstaff@example.com', username: 'pstaff', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'p-access', name: 'PA', createdBy: pStaff._id });
  const tenant = await Tenant.create({ key: 't-access', name: 'TA' });
  await PartnerOperatorLink.create({ partnerId: partner._id, tenantId: tenant._id, validTo: null, createdBy: pStaff._id });

  const grant = await PartnerGrant.create({
    partnerId: partner._id,
    tenantId: tenant._id,
    scopes: ['players:read'],
    grantedBy: pStaff._id,
    reason: 'Investigate dispute',
    validFrom: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
  });
  const pToken = signStaffAccess(pStaff, { scopeType: 'partner', scopeId: partner._id, amr: ['pwd', 'otp'] });

  const app = express();
  app.use(express.json());
  app.get('/api/admin/users', requireStaff('tenant'), enforcePartnerGrant('players:read'), (req, res) => {
    res.json({ ok: true, users: [] });
  });
  app.post('/api/admin/users/:id/balance', requireStaff('tenant'), enforcePartnerGrant('finance:write'), (req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const res = await fetch(`${base}/api/admin/users`, {
      headers: { Authorization: `Bearer ${pToken}`, 'X-Tenant-Id': String(tenant._id) },
    });
    assert.equal(res.status, 200);

    const audit = await runWithTenant(tenant._id, () => AuditLog.findOne({
      action: 'PARTNER_DATA_ACCESS',
      onBehalfOfTenantId: tenant._id,
    }));
    assert.ok(audit);
    assert.equal(audit.actorScope, 'partner');
    assert.equal(String(audit.grantId), String(grant._id));

    const finRes = await fetch(`${base}/api/admin/users/123/balance`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pToken}`, 'X-Tenant-Id': String(tenant._id) },
      body: JSON.stringify({ amount: 100 }),
    });
    assert.equal(finRes.status, 403);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('a linked partner without an active grant is refused on tenant routes; partners never manage grants', async () => {
  const pStaff = await StaffAccount.create({ email: 'nogrant@example.com', username: 'nogrant', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'p-nogrant', name: 'PN', createdBy: pStaff._id });
  const tenant = await Tenant.create({ key: 't-nogrant', name: 'TN' });
  await PartnerOperatorLink.create({ partnerId: partner._id, tenantId: tenant._id, validTo: null, createdBy: pStaff._id });
  // An expired grant does not count.
  await PartnerGrant.create({
    partnerId: partner._id, tenantId: tenant._id, scopes: ['players:read'], grantedBy: pStaff._id,
    reason: 'old', validFrom: new Date(Date.now() - 3 * 86400000), expiresAt: new Date(Date.now() - 86400000),
  });
  const pToken = signStaffAccess(pStaff, { scopeType: 'partner', scopeId: partner._id, amr: ['pwd', 'otp'] });

  const app = express();
  app.use(express.json());
  app.get('/api/admin/anything', requireStaff('tenant'), (req, res) => res.json({ ok: true }));
  app.use('/api/admin/partner-grants', partnerGrantsRouter);
  app.use(errorHandler);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: `Bearer ${pToken}`, 'X-Tenant-Id': String(tenant._id), 'Content-Type': 'application/json' };
  try {
    const res = await fetch(`${base}/api/admin/anything`, { headers });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.code, 'PARTNER_GRANT_REQUIRED');

    await PartnerGrant.create({
      partnerId: partner._id, tenantId: tenant._id, scopes: ['players:read'], grantedBy: pStaff._id,
      reason: 'now', validFrom: new Date(), expiresAt: new Date(Date.now() + 3600000),
    });
    const selfGrant = await fetch(`${base}/api/admin/partner-grants`, {
      method: 'POST', headers, body: JSON.stringify({ partnerId: partner._id, scopes: ['finance:read'], reason: 'x', days: 1 }),
    });
    assert.equal(selfGrant.status, 403);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
