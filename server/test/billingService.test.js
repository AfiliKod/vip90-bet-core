import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  generatePartnerStatements,
  issueStatement,
  addStatementAdjustment,
  voidStatement,
} from '../src/platform/services/billingService.js';
import PartnerStatement from '../src/models/PartnerStatement.js';
import StatementLine from '../src/models/StatementLine.js';
import TenantDailyStat from '../src/models/TenantDailyStat.js';
import Partner from '../src/models/Partner.js';
import PartnerOperatorLink from '../src/models/PartnerOperatorLink.js';
import Tenant from '../src/models/Tenant.js';
import StaffAccount from '../src/models/StaffAccount.js';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9c_t3';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all([
    PartnerStatement.createIndexes(),
    StatementLine.createIndexes(),
    TenantDailyStat.createIndexes(),
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

test('generatePartnerStatements generates draft statements and is idempotent', async () => {
  const staff = await StaffAccount.create({ email: 'gen@example.com', username: 'gen', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'gen-p1', name: 'Gen Partner', createdBy: staff._id });
  const tenant = await Tenant.create({ key: 'gen-t1', name: 'Gen Tenant' });

  await PartnerOperatorLink.create({
    partnerId: partner._id,
    tenantId: tenant._id,
    validFrom: new Date('2026-11-01T00:00:00.000Z'),
    validTo: null,
    commercialTerms: { model: 'revshare_ggr', rate: 0.20, currency: 'TRY' },
    createdBy: staff._id,
  });

  await TenantDailyStat.create({
    tenantId: tenant._id,
    date: '2026-11-05',
    currency: 'TRY',
    casinoGgr: 10000,
    sportsGgrRealized: 5000,
  });

  const [stmt1] = await generatePartnerStatements({
    partnerId: partner._id,
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    staffId: staff._id,
  });

  assert.ok(stmt1);
  assert.equal(stmt1.status, 'draft');
  assert.equal(stmt1.grossAmount, 3000.00);
  assert.equal(stmt1.netAmount, 3000.00);

  const [stmt2] = await generatePartnerStatements({
    partnerId: partner._id,
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    staffId: staff._id,
  });

  assert.equal(String(stmt1._id), String(stmt2._id));
  assert.equal(stmt2.grossAmount, 3000.00);
});

test('issueStatement locks statement and prevents regeneration or direct edits', async () => {
  const staff = await StaffAccount.create({ email: 'issue@example.com', username: 'issue', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'issue-p', name: 'Issue Partner', createdBy: staff._id });

  const stmt = await PartnerStatement.create({
    statementNumber: 'STMT-2026-11-ISSUE-TRY',
    partnerId: partner._id,
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    currency: 'TRY',
    status: 'draft',
    grossAmount: 5000,
    netAmount: 5000,
    finalAmount: 5000,
    createdBy: staff._id,
  });

  const issued = await issueStatement({ statementId: stmt._id, staffId: staff._id });
  assert.equal(issued.status, 'issued');
  assert.ok(issued.issuedAt);

  await assert.rejects(
    () => generatePartnerStatements({
      partnerId: partner._id,
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      staffId: staff._id,
    }),
    (err) => err.code === 'ERR_STATEMENT_ALREADY_ISSUED'
  );
});

test('addStatementAdjustment appends line and updates netAmount on issued statement', async () => {
  const staff = await StaffAccount.create({ email: 'adj@example.com', username: 'adj', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'adj-p', name: 'Adj Partner', createdBy: staff._id });

  const stmt = await PartnerStatement.create({
    statementNumber: 'STMT-2026-11-ADJ-TRY',
    partnerId: partner._id,
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    currency: 'TRY',
    status: 'issued',
    grossAmount: 10000,
    adjustmentsAmount: 0,
    netAmount: 10000,
    finalAmount: 10000,
    issuedAt: new Date(),
    createdBy: staff._id,
  });

  const updated = await addStatementAdjustment({
    statementId: stmt._id,
    amount: -500,
    description: 'Promotional credit adjustment',
    reason: 'Approved manual claim',
    staffId: staff._id,
  });

  assert.equal(updated.adjustmentsAmount, -500);
  assert.equal(updated.netAmount, 9500);
  assert.equal(updated.finalAmount, 9500);

  const lines = await StatementLine.find({ statementId: stmt._id });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].amount, -500);
});
