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
import TenantDailyStat from '../src/models/TenantDailyStat.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import { signStaffAccess } from '../src/services/staffSession.js';

process.env.JWT_SECRET ||= 'test-jwt-secret';
process.env.JWT_STAFF_SECRET ||= 'test-jwt-staff-secret';
process.env.TENANCY_MODE = 'multi';
const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://localhost:27017/vip90_test_ip9b_t6';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  await PartnerOperatorLink.createIndexes();
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

test('GET /api/partner/metrics aggregates stats and enforces small-cell suppression (<5)', async () => {
  const staff = await StaffAccount.create({ email: 'analyst@part.example.com', username: 'analyst', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'p-metrics', name: 'PM', capabilities: ['metrics.read'], createdBy: staff._id });
  const role = await Role.create({ name: 'partner_analyst_test', displayName: 'PA', scopeType: 'partner', scopeId: partner._id });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'partner', scopeId: partner._id });
  const token = signStaffAccess(staff, { scopeType: 'partner', scopeId: partner._id, amr: ['pwd', 'otp'] });

  const t1 = await Tenant.create({ key: 'm-t1', name: 'MT1' });
  const t2 = await Tenant.create({ key: 'm-t2', name: 'MT2' });
  await PartnerOperatorLink.create({ partnerId: partner._id, tenantId: t1._id, validTo: null, createdBy: staff._id });
  await PartnerOperatorLink.create({ partnerId: partner._id, tenantId: t2._id, validTo: null, createdBy: staff._id });

  // Seed TenantDailyStat
  await TenantDailyStat.create({
    tenantId: t1._id,
    date: '2026-11-10',
    casinoTurnover: 10000,
    casinoGgr: 2000,
    activePlayers: 3, // < 5: must trigger suppression
  });
  await TenantDailyStat.create({
    tenantId: t2._id,
    date: '2026-11-10',
    casinoTurnover: 50000,
    casinoGgr: 8000,
    activePlayers: 15, // >= 5
  });

  await withPartnerApp(async (base) => {
    // 1. Operator-specific metric check with small-cell suppression
    const res1 = await fetch(`${base}/tenants/${t1._id}/metrics`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res1.status, 200);
    const body1 = await res1.json();
    assert.equal(body1.metrics.casinoGgr, 2000);
    assert.equal(body1.metrics.activePlayers, '<5'); // Masked string

    // 2. Portfolio metric aggregate
    const resAll = await fetch(`${base}/metrics`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(resAll.status, 200);
    const bodyAll = await resAll.json();
    assert.equal(bodyAll.totals.casinoTurnover, 60000);
    assert.equal(bodyAll.totals.casinoGgr, 10000);
    assert.equal(bodyAll.totals.activePlayers, 18);
  });
});
