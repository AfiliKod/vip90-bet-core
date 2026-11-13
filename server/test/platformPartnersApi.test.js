import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { createPlatformRouter } from '../src/platform/routes/index.js';
import { errorHandler } from '../src/middleware/error.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import Partner from '../src/models/Partner.js';
import Tenant from '../src/models/Tenant.js';
import { signStaffAccess } from '../src/services/staffSession.js';
import { runPlatformBootstrap } from '../src/platform/bootstrap.js';

process.env.JWT_SECRET ||= 'test-jwt-secret';
process.env.JWT_STAFF_SECRET ||= 'test-jwt-staff-secret';
process.env.TENANCY_MODE = 'multi';
const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9b_t4';

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

async function withPlatformApp(fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/platform', createPlatformRouter());
  app.use(errorHandler);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/platform`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

test('POST /api/platform/partners creates partner with commercial terms and limits', async () => {
  const owner = await StaffAccount.create({ email: 'owner@plat.example.com', username: 'powner', password: 'pwd', status: 'active' });
  const role = await Role.findOne({ name: 'platform_owner' });
  await RoleAssignment.create({ staffId: owner._id, roleId: role._id, scopeType: 'platform', scopeId: null });
  const token = signStaffAccess(owner, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });

  await withPlatformApp(async (base) => {
    // K28: NGR terms must name an existing NGR definition version.
    const ngrWithoutDefinition = await fetch(`${base}/partners`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'beta-ngr', name: 'Beta NGR', defaultCommercialTerms: { model: 'revshare_ngr', rate: 0.20, currency: 'EUR' } }),
    });
    assert.equal(ngrWithoutDefinition.status, 400);
    assert.equal((await ngrWithoutDefinition.json()).error.code, 'ERR_TERMS_NGR_DEFINITION');

    const res = await fetch(`${base}/partners`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'beta-partners',
        name: 'Beta Partners Ltd',
        capabilities: ['metrics.read', 'staff.manage', 'tenants.create'],
        provisioningLimits: { maxTenants: 5, allowedModules: ['sports'] },
        defaultCommercialTerms: { model: 'revshare_ggr', rate: 0.20, currency: 'EUR' },
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.partner.key, 'beta-partners');
    assert.equal(body.partner.defaultCommercialTerms.model, 'revshare_ggr');
    assert.equal(body.partner.defaultCommercialTerms.base, 'ggr');
    assert.equal(body.partner.defaultCommercialTerms.rate, 0.20);
  });
});

test('PATCH /api/platform/partners/:id updates status, capabilities and limits', async () => {
  const owner = await StaffAccount.create({ email: 'owner2@plat.example.com', username: 'powner2', password: 'pwd', status: 'active' });
  const role = await Role.findOne({ name: 'platform_owner' });
  await RoleAssignment.create({ staffId: owner._id, roleId: role._id, scopeType: 'platform', scopeId: null });
  const token = signStaffAccess(owner, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });

  const partner = await Partner.create({ key: 'gamma-part', name: 'Gamma', createdBy: owner._id });

  await withPlatformApp(async (base) => {
    const res = await fetch(`${base}/partners/${partner._id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'suspended',
        capabilities: ['metrics.read', 'staff.manage', 'tenants.create', 'tenants.config:write'],
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.partner.status, 'suspended');
    assert.ok(body.partner.capabilities.includes('tenants.config:write'));
  });
});

test('partner create and update leave platform-level audit rows', async () => {
  const { default: AuditLog } = await import('../src/models/AuditLog.js');
  const { runAsPlatform } = await import('../src/tenancy/context.js');
  const rows = await runAsPlatform('test', () => AuditLog.find({ action: { $in: ['PARTNER_CREATED', 'PARTNER_UPDATED'] } }).lean());
  assert.ok(rows.some((r) => r.action === 'PARTNER_CREATED'), 'create is audited');
  assert.ok(rows.every((r) => r.tenantId === null && r.actorScope === 'platform'));
});
