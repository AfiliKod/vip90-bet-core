import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { createPlatformRouter } from '../src/platform/routes/index.js';
import { errorHandler } from '../src/middleware/error.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import Permission from '../src/models/Permission.js';
import TenantDailyStat from '../src/models/TenantDailyStat.js';
import Tenant from '../src/models/Tenant.js';
import Partner from '../src/models/Partner.js';
import PartnerStatement from '../src/models/PartnerStatement.js';
import OperatorFeePlan from '../src/models/OperatorFeePlan.js';
import { signStaffAccess } from '../src/services/staffSession.js';

process.env.JWT_SECRET ||= 'test-jwt-secret';
process.env.JWT_STAFF_SECRET ||= 'test-jwt-staff-secret';
process.env.TENANCY_MODE = 'multi';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9c_t5';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  await Role.createIndexes();
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

test('GET /api/platform/reports/cross-tenant aggregates portfolio performance across operators', async () => {
  const staff = await StaffAccount.create({ email: 'repstaff@example.com', username: 'repstaff', password: 'pwd', status: 'active' });
  const perm = await Permission.findOneAndUpdate(
    { key: 'platform:reports:read' },
    { key: 'platform:reports:read', name: 'Platform Reports Read', category: 'platform' },
    { upsert: true, new: true }
  );
  const role = await Role.create({
    name: 'platform_owner',
    displayName: 'Owner',
    scopeType: 'platform',
    scopeId: null,
    permissions: [perm._id],
  });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'platform', scopeId: null });

  const t1 = await Tenant.create({ key: 'rep-t1', name: 'Rep T1' });
  const t2 = await Tenant.create({ key: 'rep-t2', name: 'Rep T2' });

  await TenantDailyStat.create({
    tenantId: t1._id,
    date: '2026-11-01',
    currency: 'TRY',
    casinoTurnover: 50000,
    casinoGgr: 10000,
    sportsTurnover: 20000,
    sportsGgrRealized: 4000,
  });

  await TenantDailyStat.create({
    tenantId: t2._id,
    date: '2026-11-01',
    currency: 'TRY',
    casinoTurnover: 30000,
    casinoGgr: 6000,
    sportsTurnover: 10000,
    sportsGgrRealized: 2000,
  });

  const token = signStaffAccess(staff, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });
  const { server, base } = await createServer();

  try {
    const res = await fetch(`${base}/api/platform/reports/cross-tenant?from=2026-11-01&to=2026-11-30&groupBy=tenant`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.report.length, 2);
    assert.equal(body.totals.casinoTurnover, 80000);
    assert.equal(body.totals.totalGgr, 22000); // 14000 + 8000
    assert.equal(body.currency, 'TRY');
    assert.deepEqual(body.period, { from: '2026-11-01', to: '2026-11-30' });
  } finally {
    server.close();
  }
});

test('GET /api/platform/reports/cross-tenant?groupBy=day groups portfolio performance by day', async () => {
  const staff = await StaffAccount.findOne({ email: 'repstaff@example.com' });
  const token = signStaffAccess(staff, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });
  const t1 = await Tenant.findOne({ key: 'rep-t1' });

  await TenantDailyStat.create({
    tenantId: t1._id,
    date: '2026-11-02',
    currency: 'TRY',
    casinoTurnover: 25000,
    casinoGgr: 5000,
    sportsTurnover: 10000,
    sportsGgrRealized: 1500,
  });

  const { server, base } = await createServer();

  try {
    const res = await fetch(`${base}/api/platform/reports/cross-tenant?from=2026-11-01&to=2026-11-02&groupBy=day`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.report.length, 2);
    const day1 = body.report.find((r) => r.key === '2026-11-01');
    const day2 = body.report.find((r) => r.key === '2026-11-02');
    assert.ok(day1);
    assert.ok(day2);
    assert.equal(day1.totalGgr, 22000);
    assert.equal(day2.totalGgr, 6500);
    assert.equal(body.totals.totalGgr, 28500);
  } finally {
    server.close();
  }
});

test('GET /api/platform/reports/cross-tenant validates required query parameters', async () => {
  const staff = await StaffAccount.findOne({ email: 'repstaff@example.com' });
  const token = signStaffAccess(staff, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });
  const { server, base } = await createServer();

  try {
    const resNoParams = await fetch(`${base}/api/platform/reports/cross-tenant`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(resNoParams.status, 400);

    const resNoTo = await fetch(`${base}/api/platform/reports/cross-tenant?from=2026-11-01`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(resNoTo.status, 400);
  } finally {
    server.close();
  }
});

test('GET /api/platform/reports/cross-tenant rejects staff without platform:reports:read permission', async () => {
  const noPermStaff = await StaffAccount.create({ email: 'noperms@example.com', username: 'noperms', password: 'pwd', status: 'active' });
  const noPermRole = await Role.create({
    name: 'platform_unprivileged',
    displayName: 'Unprivileged',
    scopeType: 'platform',
    scopeId: null,
    permissions: [],
  });
  await RoleAssignment.create({ staffId: noPermStaff._id, roleId: noPermRole._id, scopeType: 'platform', scopeId: null });

  const token = signStaffAccess(noPermStaff, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });
  const { server, base } = await createServer();

  try {
    const res = await fetch(`${base}/api/platform/reports/cross-tenant?from=2026-11-01&to=2026-11-30`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 403);
  } finally {
    server.close();
  }
});

test('GET /api/platform/reports/sportsbook-odds calculates fixed and turnover fees correctly per K20 fee plan', async () => {
  const staff = await StaffAccount.findOne({ email: 'repstaff@example.com' });
  const token = signStaffAccess(staff, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });
  const t1 = await Tenant.findOne({ key: 'rep-t1' });
  const t2 = await Tenant.findOne({ key: 'rep-t2' });

  // T1: 'both' (fixed 2500 + 1.5% turnover)
  await OperatorFeePlan.create({
    tenantId: t1._id,
    validFrom: new Date('2026-11-01T00:00:00.000Z'),
    validTo: null,
    sportsbookFee: {
      model: 'both',
      fixedMonthlyFee: 2500,
      turnoverRate: 0.015,
      currency: 'TRY',
    },
    createdBy: staff._id,
  });

  // T2: 'turnover_percentage' (2% turnover, no fixed fee)
  await OperatorFeePlan.create({
    tenantId: t2._id,
    validFrom: new Date('2026-11-01T00:00:00.000Z'),
    validTo: null,
    sportsbookFee: {
      model: 'turnover_percentage',
      fixedMonthlyFee: 0,
      turnoverRate: 0.02,
      currency: 'TRY',
    },
    createdBy: staff._id,
  });

  const { server, base } = await createServer();

  try {
    const res = await fetch(`${base}/api/platform/reports/sportsbook-odds?from=2026-11-01&to=2026-11-30`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.report.length, 2);

    // T1 sports turnover: 20000 (day 1) + 10000 (day 2) = 30000. Turnover fee: 30000 * 0.015 = 450. Total fee = 2500 + 450 = 2950
    const t1Report = body.report.find((r) => r.tenantKey === 'rep-t1');
    assert.ok(t1Report);
    assert.equal(t1Report.sportsTurnover, 30000);
    assert.equal(t1Report.fixedFee, 2500);
    assert.equal(t1Report.turnoverRate, 0.015);
    assert.equal(t1Report.turnoverFee, 450);
    assert.equal(t1Report.totalFee, 2950);

    // T2 sports turnover: 10000. Turnover fee: 10000 * 0.02 = 200. Total fee = 200
    const t2Report = body.report.find((r) => r.tenantKey === 'rep-t2');
    assert.ok(t2Report);
    assert.equal(t2Report.sportsTurnover, 10000);
    assert.equal(t2Report.fixedFee, 0);
    assert.equal(t2Report.turnoverRate, 0.02);
    assert.equal(t2Report.turnoverFee, 200);
    assert.equal(t2Report.totalFee, 200);

    assert.equal(body.totals.sportsTurnover, 40000);
    assert.equal(body.totals.fixedFee, 2500);
    assert.equal(body.totals.turnoverFee, 650);
    assert.equal(body.totals.totalFee, 3150);
  } finally {
    server.close();
  }
});

test('GET /api/platform/reports/cross-tenant/export streams CSV format', async () => {
  const staff = await StaffAccount.findOne({ email: 'repstaff@example.com' });
  const token = signStaffAccess(staff, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });
  const { server, base } = await createServer();

  try {
    const res = await fetch(`${base}/api/platform/reports/cross-tenant/export?from=2026-11-01&to=2026-11-30&groupBy=tenant`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/csv'));
    assert.ok(res.headers.get('content-disposition').includes('cross_tenant_report_2026-11-01_2026-11-30.csv'));

    const text = await res.text();
    const lines = text.trim().split('\n');
    assert.equal(lines[0], 'Identifier,Name,Casino Turnover,Casino GGR,Sports Turnover,Sports GGR,Total GGR');
    assert.equal(lines.length, 3); // header + 2 tenants
    assert.ok(lines.some((l) => l.includes('"rep-t1"')));
    assert.ok(lines.some((l) => l.includes('"rep-t2"')));
  } finally {
    server.close();
  }
});

test('GET /api/platform/reports/sportsbook-odds/export streams CSV format', async () => {
  const staff = await StaffAccount.findOne({ email: 'repstaff@example.com' });
  const token = signStaffAccess(staff, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });
  const { server, base } = await createServer();

  try {
    const res = await fetch(`${base}/api/platform/reports/sportsbook-odds/export?from=2026-11-01&to=2026-11-30`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/csv'));
    assert.ok(res.headers.get('content-disposition').includes('sportsbook_odds_report_2026-11-01_2026-11-30.csv'));

    const text = await res.text();
    const lines = text.trim().split('\n');
    assert.equal(lines[0], 'Tenant Key,Tenant Name,Sports Turnover,Sports GGR,Fixed Fee,Turnover Rate,Turnover Fee,Total Fee');
    assert.equal(lines.length, 3);
    assert.ok(lines.some((l) => l.includes('"rep-t1"')));
  } finally {
    server.close();
  }
});

test('GET /api/platform/reports/partner-balances aggregates partner statement balances', async () => {
  const staff = await StaffAccount.findOne({ email: 'repstaff@example.com' });
  const token = signStaffAccess(staff, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });

  const partner1 = await Partner.create({ key: 'p-alpha', name: 'Partner Alpha', createdBy: staff._id });
  const partner2 = await Partner.create({ key: 'p-beta', name: 'Partner Beta', createdBy: staff._id });

  // Partner 1: 1 issued statement (12000 TRY) and 1 settled (8000 TRY)
  await PartnerStatement.create({
    statementNumber: 'STMT-PA-01',
    partnerId: partner1._id,
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
    currency: 'TRY',
    status: 'settled',
    finalAmount: 8000,
    createdBy: staff._id,
  });

  await PartnerStatement.create({
    statementNumber: 'STMT-PA-02',
    partnerId: partner1._id,
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    currency: 'TRY',
    status: 'issued',
    finalAmount: 12000,
    createdBy: staff._id,
  });

  // Partner 2: 1 draft statement (5000 TRY)
  await PartnerStatement.create({
    statementNumber: 'STMT-PB-01',
    partnerId: partner2._id,
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    currency: 'TRY',
    status: 'draft',
    finalAmount: 5000,
    createdBy: staff._id,
  });

  const { server, base } = await createServer();

  try {
    const res = await fetch(`${base}/api/platform/reports/partner-balances?currency=TRY`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.report.length >= 2);

    const pa = body.report.find((r) => r.partnerKey === 'p-alpha');
    assert.ok(pa);
    assert.equal(pa.settledAmount, 8000);
    assert.equal(pa.issuedAmount, 12000);
    assert.equal(pa.outstandingBalance, 12000);
    assert.equal(pa.draftAmount, 0);

    const pb = body.report.find((r) => r.partnerKey === 'p-beta');
    assert.ok(pb);
    assert.equal(pb.draftAmount, 5000);
    assert.equal(pb.issuedAmount, 0);
    assert.equal(pb.outstandingBalance, 0);

    assert.equal(body.totals.issuedAmount, 12000);
    assert.equal(body.totals.settledAmount, 8000);
    assert.equal(body.totals.outstandingBalance, 12000);
    assert.equal(body.totals.draftAmount, 5000);
  } finally {
    server.close();
  }
});

test('Currency isolation: stats in another currency are not mixed into TRY report', async () => {
  const staff = await StaffAccount.findOne({ email: 'repstaff@example.com' });
  const token = signStaffAccess(staff, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });
  const t1 = await Tenant.findOne({ key: 'rep-t1' });

  // Add EUR stat for T1
  await TenantDailyStat.create({
    tenantId: t1._id,
    date: '2026-11-01',
    currency: 'EUR',
    casinoTurnover: 100000,
    casinoGgr: 20000,
    sportsTurnover: 50000,
    sportsGgrRealized: 10000,
  });

  const { server, base } = await createServer();

  try {
    // TRY query: EUR amounts must NOT be added
    const resTry = await fetch(`${base}/api/platform/reports/cross-tenant?from=2026-11-01&to=2026-11-01&currency=TRY`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(resTry.status, 200);
    const bodyTry = await resTry.json();
    assert.equal(bodyTry.currency, 'TRY');
    assert.equal(bodyTry.totals.casinoTurnover, 80000); // 50000 + 30000, NOT 180000

    // EUR query: only EUR amounts
    const resEur = await fetch(`${base}/api/platform/reports/cross-tenant?from=2026-11-01&to=2026-11-01&currency=EUR`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(resEur.status, 200);
    const bodyEur = await resEur.json();
    assert.equal(bodyEur.currency, 'EUR');
    assert.equal(bodyEur.totals.casinoTurnover, 100000);
    assert.equal(bodyEur.totals.totalGgr, 30000);
  } finally {
    server.close();
  }
});
