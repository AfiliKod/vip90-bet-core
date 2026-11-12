import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { createPartnerRouter } from '../src/platform/routes/partner.js';
import { errorHandler } from '../src/middleware/error.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import Partner from '../src/models/Partner.js';
import PartnerStatement from '../src/models/PartnerStatement.js';
import StatementLine from '../src/models/StatementLine.js';
import Permission from '../src/models/Permission.js';
import Tenant from '../src/models/Tenant.js';
import { signStaffAccess } from '../src/services/staffSession.js';

process.env.JWT_SECRET ||= 'test-jwt-secret';
process.env.JWT_STAFF_SECRET ||= 'test-jwt-staff-secret';
process.env.TENANCY_MODE = 'multi';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9c_t6';

let metricsPerm;

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all([
    Partner.createIndexes(),
    PartnerStatement.createIndexes(),
    StatementLine.createIndexes(),
    Role.createIndexes(),
    StaffAccount.createIndexes(),
    RoleAssignment.createIndexes(),
    Tenant.createIndexes(),
  ]);

  metricsPerm = await Permission.findOneAndUpdate(
    { key: 'partner:metrics:read' },
    { $setOnInsert: { key: 'partner:metrics:read', name: 'Partner metrics', category: 'partner' } },
    { upsert: true, new: true },
  );
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/partner', createPartnerRouter());
  app.use(errorHandler);
  const server = app.listen(0);
  const port = server.address().port;
  return { server, base: `http://127.0.0.1:${port}` };
}

test('Partner staff can view own issued statements and lines', async () => {
  const staff = await StaffAccount.create({ email: 'pstaff1@example.com', username: 'pstaff1', password: 'pwd', status: 'active' });
  const partner1 = await Partner.create({ key: 'p1', name: 'Partner One', createdBy: staff._id });
  const role = await Role.create({
    name: 'partner_analyst',
    displayName: 'Analyst',
    scopeType: 'partner',
    scopeId: partner1._id,
    permissions: [metricsPerm._id],
  });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'partner', scopeId: partner1._id });

  const tenant = await Tenant.create({ key: 'op-alpha', name: 'Operator Alpha' });

  const stmt = await PartnerStatement.create({
    statementNumber: 'STMT-P1-TRY',
    partnerId: partner1._id,
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    currency: 'TRY',
    status: 'issued',
    grossAmount: 4000,
    netAmount: 4000,
    finalAmount: 4000,
    issuedAt: new Date(),
    createdBy: staff._id,
  });

  const line = await StatementLine.create({
    statementId: stmt._id,
    partnerId: partner1._id,
    tenantId: tenant._id,
    type: 'commission',
    date: '2026-11-05',
    currency: 'TRY',
    baseMetric: 'ggr',
    baseAmount: 20000,
    rate: 0.20,
    amount: 4000,
    description: 'Commission',
  });

  const token = signStaffAccess(staff, { scopeType: 'partner', scopeId: partner1._id, amr: ['pwd', 'otp'] });
  const { server, base } = await createServer();

  try {
    const res = await fetch(`${base}/api/partner/statements`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.statements.length, 1);
    assert.equal(body.statements[0].netAmount, 4000);

    const detailRes = await fetch(`${base}/api/partner/statements/${stmt._id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(detailRes.status, 200);
    const detailBody = await detailRes.json();
    assert.equal(detailBody.lines.length, 1);
    assert.equal(detailBody.statement.statementNumber, 'STMT-P1-TRY');
    assert.equal(detailBody.lines[0].tenantId.key, 'op-alpha');

    // Zero player PII verification (K27)
    const jsonStr = JSON.stringify(detailBody);
    assert.equal(jsonStr.includes('userId'), false, 'Response must not contain userId');
    assert.equal(jsonStr.includes('playerId'), false, 'Response must not contain playerId');
    assert.equal(jsonStr.includes('playerEmail'), false, 'Response must not contain playerEmail');
  } finally {
    server.close();
  }
});

test('Partner staff requesting another partner statement returns 404 NOT_FOUND (prevent IDOR)', async () => {
  const staff = await StaffAccount.create({ email: 'pstaff2@example.com', username: 'pstaff2', password: 'pwd', status: 'active' });
  const partner1 = await Partner.create({ key: 'p-own', name: 'Own Partner', createdBy: staff._id });
  const partner2 = await Partner.create({ key: 'p-other', name: 'Other Partner', createdBy: staff._id });

  const role = await Role.create({
    name: 'partner_analyst_2',
    displayName: 'Analyst',
    scopeType: 'partner',
    scopeId: partner1._id,
    permissions: [metricsPerm._id],
  });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'partner', scopeId: partner1._id });

  const otherStmt = await PartnerStatement.create({
    statementNumber: 'STMT-P2-SECRET',
    partnerId: partner2._id,
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    currency: 'TRY',
    status: 'issued',
    grossAmount: 99999,
    netAmount: 99999,
    createdBy: staff._id,
  });

  const token = signStaffAccess(staff, { scopeType: 'partner', scopeId: partner1._id, amr: ['pwd', 'otp'] });
  const { server, base } = await createServer();

  try {
    const res = await fetch(`${base}/api/partner/statements/${otherStmt._id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Strict 404 per K27 / §9 G-3 to prevent entity leakage
    assert.equal(res.status, 404);

    const exportRes = await fetch(`${base}/api/partner/statements/${otherStmt._id}/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(exportRes.status, 404);
  } finally {
    server.close();
  }
});

test('Partner staff cannot view draft or voided statements', async () => {
  const staff = await StaffAccount.create({ email: 'pstaff3@example.com', username: 'pstaff3', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'p-draft-test', name: 'Draft Partner', createdBy: staff._id });
  const role = await Role.create({
    name: 'partner_analyst_3',
    displayName: 'Analyst',
    scopeType: 'partner',
    scopeId: partner._id,
    permissions: [metricsPerm._id],
  });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'partner', scopeId: partner._id });

  const draftStmt = await PartnerStatement.create({
    statementNumber: 'STMT-P-DRAFT',
    partnerId: partner._id,
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    currency: 'TRY',
    status: 'draft',
    grossAmount: 1000,
    netAmount: 1000,
    createdBy: staff._id,
  });

  const voidedStmt = await PartnerStatement.create({
    statementNumber: 'STMT-P-VOIDED',
    partnerId: partner._id,
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    currency: 'TRY',
    status: 'voided',
    grossAmount: 2000,
    netAmount: 2000,
    createdBy: staff._id,
  });

  const token = signStaffAccess(staff, { scopeType: 'partner', scopeId: partner._id, amr: ['pwd', 'otp'] });
  const { server, base } = await createServer();

  try {
    const listRes = await fetch(`${base}/api/partner/statements`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(listRes.status, 200);
    const body = await listRes.json();
    assert.equal(body.statements.length, 0);

    const draftDetail = await fetch(`${base}/api/partner/statements/${draftStmt._id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(draftDetail.status, 404);

    const voidedDetail = await fetch(`${base}/api/partner/statements/${voidedStmt._id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(voidedDetail.status, 404);
  } finally {
    server.close();
  }
});

test('Partner staff can export statement to CSV', async () => {
  const staff = await StaffAccount.create({ email: 'pstaff4@example.com', username: 'pstaff4', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'p-csv-test', name: 'CSV Partner', createdBy: staff._id });
  const role = await Role.create({
    name: 'partner_analyst_4',
    displayName: 'Analyst',
    scopeType: 'partner',
    scopeId: partner._id,
    permissions: [metricsPerm._id],
  });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'partner', scopeId: partner._id });

  const stmt = await PartnerStatement.create({
    statementNumber: 'STMT-P-CSV-01',
    partnerId: partner._id,
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    currency: 'TRY',
    status: 'issued',
    grossAmount: 5000,
    netAmount: 5000,
    createdBy: staff._id,
  });

  await StatementLine.create({
    statementId: stmt._id,
    partnerId: partner._id,
    type: 'commission',
    date: '2026-11-10',
    currency: 'TRY',
    baseMetric: 'ggr',
    baseAmount: 25000,
    rate: 0.20,
    amount: 5000,
    description: 'Commission for 2026-11-10',
  });

  const token = signStaffAccess(staff, { scopeType: 'partner', scopeId: partner._id, amr: ['pwd', 'otp'] });
  const { server, base } = await createServer();

  try {
    const res = await fetch(`${base}/api/partner/statements/${stmt._id}/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/csv');
    assert.ok(res.headers.get('content-disposition')?.includes('STMT-P-CSV-01.csv'));

    const text = await res.text();
    assert.ok(text.includes('Date,Type,Description,Base Amount,Rate,Amount,Currency'));
    assert.ok(text.includes('Commission for 2026-11-10'));
    assert.ok(text.includes('5000'));
  } finally {
    server.close();
  }
});

test('Invalid statement id returns 404 NOT_FOUND', async () => {
  const staff = await StaffAccount.create({ email: 'pstaff5@example.com', username: 'pstaff5', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'p-invalid-id', name: 'Invalid ID Partner', createdBy: staff._id });
  const role = await Role.create({
    name: 'partner_analyst_5',
    displayName: 'Analyst',
    scopeType: 'partner',
    scopeId: partner._id,
    permissions: [metricsPerm._id],
  });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'partner', scopeId: partner._id });

  const token = signStaffAccess(staff, { scopeType: 'partner', scopeId: partner._id, amr: ['pwd', 'otp'] });
  const { server, base } = await createServer();

  try {
    const res = await fetch(`${base}/api/partner/statements/not-a-valid-id`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 404);

    const exportRes = await fetch(`${base}/api/partner/statements/not-a-valid-id/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(exportRes.status, 404);
  } finally {
    server.close();
  }
});
