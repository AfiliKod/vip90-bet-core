import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import OperatorFeePlan from '../src/models/OperatorFeePlan.js';
import PartnerStatement from '../src/models/PartnerStatement.js';
import StatementLine from '../src/models/StatementLine.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Tenant from '../src/models/Tenant.js';
import Partner from '../src/models/Partner.js';
import { PERMISSION_DEFS } from '../src/services/permissions.js';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9c_t1';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all([
    OperatorFeePlan.init(),
    PartnerStatement.init(),
    StatementLine.init(),
  ]);
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('OperatorFeePlan enforces partial unique active plan per tenant and validates K20 sportsbook fee', async () => {
  const staff = await StaffAccount.create({ email: 'planowner@example.com', username: 'planowner', password: 'pwd', status: 'active' });
  const tenant = await Tenant.create({ key: 'fee-op-1', name: 'Fee Op 1' });

  const plan1 = await OperatorFeePlan.create({
    tenantId: tenant._id,
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

  assert.equal(plan1.sportsbookFee.model, 'both');
  assert.equal(plan1.sportsbookFee.fixedMonthlyFee, 2500);
  assert.equal(plan1.sportsbookFee.turnoverRate, 0.015);
  assert.ok(plan1.legalRetentionUntil >= new Date(Date.now() + 4 * 365 * 86400 * 1000));

  await assert.rejects(
    () => OperatorFeePlan.create({
      tenantId: tenant._id,
      validFrom: new Date('2026-11-15T00:00:00.000Z'),
      validTo: null,
      sportsbookFee: { model: 'fixed', fixedMonthlyFee: 3000, currency: 'TRY' },
      createdBy: staff._id,
    }),
    /E11000/
  );

  plan1.validTo = new Date('2026-11-15T00:00:00.000Z');
  await plan1.save();

  const plan2 = await OperatorFeePlan.create({
    tenantId: tenant._id,
    validFrom: new Date('2026-11-15T00:00:00.000Z'),
    validTo: null,
    sportsbookFee: { model: 'turnover_percentage', turnoverRate: 0.02, currency: 'TRY' },
    createdBy: staff._id,
  });
  assert.ok(plan2._id);
});

test('PartnerStatement enforces unique statementNumber, currency, and immutability once issued', async () => {
  const staff = await StaffAccount.create({ email: 'stmtstaff@example.com', username: 'stmtstaff', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'stmt-partner', name: 'Stmt Partner', createdBy: staff._id });

  const stmt = await PartnerStatement.create({
    statementNumber: 'STMT-2026-11-P1-TRY',
    partnerId: partner._id,
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    currency: 'TRY',
    direction: 'revenue_share',
    status: 'draft',
    grossAmount: 15000.50,
    adjustmentsAmount: 0,
    netAmount: 15000.50,
    finalAmount: 15000.50,
    linesCount: 10,
    createdBy: staff._id,
  });

  assert.equal(stmt.status, 'draft');
  assert.equal(stmt.currency, 'TRY');
  assert.ok(stmt.legalRetentionUntil >= new Date(Date.now() + 4 * 365 * 86400 * 1000));

  await assert.rejects(
    () => PartnerStatement.create({
      statementNumber: 'STMT-2026-11-P1-TRY',
      partnerId: partner._id,
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      currency: 'TRY',
      status: 'draft',
      createdBy: staff._id,
    }),
    /E11000/
  );

  stmt.status = 'issued';
  stmt.issuedAt = new Date();
  stmt.issuedBy = staff._id;
  await stmt.save();

  stmt.grossAmount = 99999;
  await assert.rejects(
    () => stmt.save(),
    (err) => err.code === 'ERR_STATEMENT_IMMUTABLE'
  );
});

test('StatementLine validates line types and associates with statement', async () => {
  const staff = await StaffAccount.create({ email: 'linestaff@example.com', username: 'linestaff', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'line-partner', name: 'Line Partner', createdBy: staff._id });
  const tenant = await Tenant.create({ key: 'line-tenant', name: 'Line Tenant' });

  const stmt = await PartnerStatement.create({
    statementNumber: 'STMT-2026-11-LINES-TRY',
    partnerId: partner._id,
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    currency: 'TRY',
    status: 'draft',
    createdBy: staff._id,
  });

  const line = await StatementLine.create({
    statementId: stmt._id,
    partnerId: partner._id,
    tenantId: tenant._id,
    type: 'commission',
    date: '2026-11-05',
    currency: 'TRY',
    baseMetric: 'ggr',
    baseAmount: 10000,
    rate: 0.15,
    amount: 1500,
    description: '15% GGR Commission for Fee Op',
  });

  assert.equal(line.type, 'commission');
  assert.equal(line.amount, 1500);

  const adjLine = await StatementLine.create({
    statementId: stmt._id,
    partnerId: partner._id,
    type: 'adjustment',
    currency: 'TRY',
    baseMetric: 'manual',
    baseAmount: 0,
    rate: 0,
    amount: -250,
    description: 'Manual credit adjustment for promotion refund',
    reason: 'Approved ticket #1042',
    createdBy: staff._id,
  });

  assert.equal(adjLine.type, 'adjustment');
  assert.equal(adjLine.amount, -250);
});

test('Permissions catalogue includes platform billing and partner billing keys', () => {
  const keys = new Set(PERMISSION_DEFS.map((p) => p.key));
  assert.ok(keys.has('platform:billing:read'), 'platform:billing:read must exist');
  assert.ok(keys.has('platform:billing:manage'), 'platform:billing:manage must exist');
  assert.ok(keys.has('platform:reports:read'), 'platform:reports:read must exist');
  assert.ok(keys.has('partner:billing:read'), 'partner:billing:read must exist');
});
