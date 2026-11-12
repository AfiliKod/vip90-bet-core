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
import OperatorFeePlan from '../src/models/OperatorFeePlan.js';
import PartnerStatement from '../src/models/PartnerStatement.js';
import StatementLine from '../src/models/StatementLine.js';
import { signStaffAccess } from '../src/services/staffSession.js';
import { runPlatformBootstrap } from '../src/platform/bootstrap.js';

process.env.JWT_SECRET ||= 'test-jwt-secret';
process.env.JWT_STAFF_SECRET ||= 'test-jwt-staff-secret';
process.env.TENANCY_MODE = 'multi';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9c_t4';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all([
    StaffAccount.createIndexes(),
    Role.createIndexes(),
    RoleAssignment.createIndexes(),
    Partner.createIndexes(),
    Tenant.createIndexes(),
    OperatorFeePlan.createIndexes(),
    PartnerStatement.createIndexes(),
    StatementLine.createIndexes(),
  ]);
  await runPlatformBootstrap({ env: { TENANCY_MODE: 'multi', TENANCY_ENFORCEMENT: 'enforce' } });
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/platform', createPlatformRouter());
  app.use(errorHandler);
  const server = app.listen(0);
  const port = server.address().port;
  return { server, base: `http://127.0.0.1:${port}` };
}

async function platformStaff(email, username, roleName) {
  const staff = await StaffAccount.create({ email, username, password: 'pwd', status: 'active' });
  const role = await Role.findOne({ name: roleName, scopeType: 'platform', scopeId: null });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'platform', scopeId: null });
  return staff;
}

test('POST /api/platform/billing/plans creates and updates K20 fee plan', async () => {
  const staff = await platformStaff('powner@example.com', 'powner', 'platform_owner');
  const tenant = await Tenant.create({ key: 'plan-tenant', name: 'Plan Tenant' });

  const token = signStaffAccess(staff, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });
  const { server, base } = await createServer();

  try {
    const res = await fetch(`${base}/api/platform/billing/plans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        tenantId: tenant._id,
        sportsbookFee: { model: 'both', fixedMonthlyFee: 2000, turnoverRate: 0.015, currency: 'TRY' },
      }),
    });

    assert.equal(res.status, 201, await res.clone().text());
    const body = await res.json();
    assert.equal(body.sportsbookFee.model, 'both');
    assert.equal(body.sportsbookFee.fixedMonthlyFee, 2000);
  } finally {
    server.close();
  }
});

test('POST /api/platform/billing/statements/generate triggers generation', async () => {
  const staff = await platformStaff('pfinance@example.com', 'pfinance', 'platform_finance');
  const partner = await Partner.create({ key: 'api-partner', name: 'API Partner', createdBy: staff._id });

  const token = signStaffAccess(staff, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });
  const { server, base } = await createServer();

  try {
    const res = await fetch(`${base}/api/platform/billing/statements/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        partnerId: partner._id,
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.statements));
  } finally {
    server.close();
  }
});
