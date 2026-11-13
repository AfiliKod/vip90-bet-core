import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  generatePartnerStatements,
  issueStatement,
  addStatementAdjustment,
  voidStatement,
  assertNgrDefinitionNotIssued,
} from '../src/platform/services/billingService.js';
import PartnerStatement from '../src/models/PartnerStatement.js';
import StatementLine from '../src/models/StatementLine.js';
import TenantDailyStat from '../src/models/TenantDailyStat.js';
import Partner from '../src/models/Partner.js';
import PartnerOperatorLink from '../src/models/PartnerOperatorLink.js';
import Tenant from '../src/models/Tenant.js';
import StaffAccount from '../src/models/StaffAccount.js';
import NgrDefinition from '../src/models/NgrDefinition.js';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9d_t4';

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
    NgrDefinition.createIndexes(),
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

test('generatePartnerStatements generates statement with NGR deductions and tracks ngrDefinitionsUsed', async () => {
  const staff = await StaffAccount.create({ email: 'ngr-staff@example.com', username: 'ngrstaff', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'p-ngr-test', name: 'NGR Partner Test', createdBy: staff._id });
  const tenant = await Tenant.create({ key: 't-ngr-test', name: 'NGR Tenant Test' });

  const ngrDef = await NgrDefinition.create({
    name: 'Tier1 NGR Definition',
    version: 1,
    ggrComponents: ['casino', 'sports'],
    items: [
      { category: 'bonus', label: 'Bonus Cost', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } },
      { category: 'chargeback', label: 'Chargebacks', enabled: true, source: 'stat_field', params: { field: 'chargebacks' } },
      { category: 'tax', label: 'Gaming Tax', enabled: true, source: 'rate', params: { target: 'ggr', rate: 0.05 } },
    ],
    createdBy: staff._id,
  });

  await PartnerOperatorLink.create({
    partnerId: partner._id,
    tenantId: tenant._id,
    validFrom: new Date('2026-11-01T00:00:00.000Z'),
    validTo: null,
    commercialTerms: {
      model: 'revshare_ngr',
      base: 'ngr',
      rate: 0.20,
      currency: 'TRY',
      ngrDefinitionId: ngrDef._id,
      ngrDefinitionVersion: 1,
      negativeBaseHandling: 'zero_floor',
    },
    createdBy: staff._id,
  });

  // GGR: 10,000 Casino + 2,000 Sports = 12,000
  // Deductions: Bonus 1,500 + Chargebacks 250 + Tax @ 5% (600) = 2,350
  // Net NGR: 12,000 - 2,350 = 9,650 -> Commission @ 20% = 1,930.00 TRY
  await TenantDailyStat.create({
    tenantId: tenant._id,
    date: '2026-11-15',
    currency: 'TRY',
    casinoGgr: 10000,
    sportsGgrRealized: 2000,
    bonusCost: 1500,
    chargebacks: 250,
  });

  const [stmt] = await generatePartnerStatements({
    partnerId: partner._id,
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    staffId: staff._id,
  });

  assert.ok(stmt);
  assert.equal(stmt.status, 'draft');
  assert.equal(stmt.grossAmount, 1930.00);
  assert.equal(stmt.netAmount, 1930.00);

  // Check ngrDefinitionsUsed in statement metadata
  assert.ok(Array.isArray(stmt.metadata?.ngrDefinitionsUsed));
  assert.equal(stmt.metadata.ngrDefinitionsUsed.length, 1);
  assert.equal(String(stmt.metadata.ngrDefinitionsUsed[0].id), String(ngrDef._id));
  assert.equal(stmt.metadata.ngrDefinitionsUsed[0].version, 1);

  // Check StatementLine metadata and baseMetric
  const lines = await StatementLine.find({ statementId: stmt._id });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].baseMetric, 'ngr');
  assert.equal(lines[0].baseAmount, 9650.00);
  assert.equal(lines[0].rate, 0.20);
  assert.equal(lines[0].amount, 1930.00);

  const meta = lines[0].metadata;
  assert.equal(meta.ggr, 12000.00);
  assert.equal(meta.totalDeductions, 2350.00);
  assert.equal(meta.ngr, 9650.00);
  assert.equal(meta.deductions.length, 3);
  assert.equal(meta.deductions.find((d) => d.category === 'bonus').amount, 1500.00);
  assert.equal(meta.deductions.find((d) => d.category === 'chargeback').amount, 250.00);
  assert.equal(meta.deductions.find((d) => d.category === 'tax').amount, 600.00);
});

test('assertNgrDefinitionNotIssued prevents modifying NGR definition version tied to an issued statement', async () => {
  const staff = await StaffAccount.create({ email: 'freeze-staff@example.com', username: 'freezestaff', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'p-freeze-test', name: 'Freeze Partner Test', createdBy: staff._id });
  const tenant = await Tenant.create({ key: 't-freeze-test', name: 'Freeze Tenant Test' });

  const ngrDef = await NgrDefinition.create({
    name: 'Freeze NGR Definition',
    version: 1,
    ggrComponents: ['casino'],
    items: [
      { category: 'bonus', label: 'Bonus Cost', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } },
    ],
    createdBy: staff._id,
  });

  await PartnerOperatorLink.create({
    partnerId: partner._id,
    tenantId: tenant._id,
    validFrom: new Date('2026-11-01T00:00:00.000Z'),
    validTo: null,
    commercialTerms: {
      model: 'revshare_ngr',
      base: 'ngr',
      rate: 0.15,
      currency: 'TRY',
      ngrDefinitionId: ngrDef._id,
      ngrDefinitionVersion: 1,
    },
    createdBy: staff._id,
  });

  await TenantDailyStat.create({
    tenantId: tenant._id,
    date: '2026-11-10',
    currency: 'TRY',
    casinoGgr: 5000,
    bonusCost: 500,
  });

  const [stmt] = await generatePartnerStatements({
    partnerId: partner._id,
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    staffId: staff._id,
  });

  // While draft, definition is not locked
  await assert.doesNotReject(() => assertNgrDefinitionNotIssued(ngrDef._id, 1));

  // Issue statement
  await issueStatement({ statementId: stmt._id, staffId: staff._id });

  // Now definition version 1 is locked
  await assert.rejects(
    () => assertNgrDefinitionNotIssued(ngrDef._id, 1),
    (err) => err.code === 'ERR_NGR_DEFINITION_IN_USE' && (err.statusCode === 409 || err.status === 409)
  );

  // Different version of same definition is not locked
  await assert.doesNotReject(() => assertNgrDefinitionNotIssued(ngrDef._id, 2));

  // Different definition id is not locked
  await assert.doesNotReject(() => assertNgrDefinitionNotIssued(new mongoose.Types.ObjectId(), 1));
});
