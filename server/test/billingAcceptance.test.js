import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

process.env.JWT_SECRET ||= 'test-jwt-secret';
process.env.JWT_STAFF_SECRET ||= 'test-jwt-staff-secret';
process.env.TENANCY_MODE = 'multi';
process.env.TENANCY_ENFORCEMENT = 'enforce';

const { createApp } = await import('../src/app.js');
const { default: StaffAccount } = await import('../src/models/StaffAccount.js');
const { default: Role } = await import('../src/models/Role.js');
const { default: RoleAssignment } = await import('../src/models/RoleAssignment.js');
const { default: Permission } = await import('../src/models/Permission.js');
const { default: Partner } = await import('../src/models/Partner.js');
const { default: Tenant } = await import('../src/models/Tenant.js');
const { default: PartnerOperatorLink } = await import('../src/models/PartnerOperatorLink.js');
const { default: OperatorFeePlan } = await import('../src/models/OperatorFeePlan.js');
const { default: TenantDailyStat } = await import('../src/models/TenantDailyStat.js');
const { default: PartnerStatement } = await import('../src/models/PartnerStatement.js');
const { default: StatementLine } = await import('../src/models/StatementLine.js');
const { default: AuditLog } = await import('../src/models/AuditLog.js');
const { signStaffAccess } = await import('../src/services/staffSession.js');
const { runAsPlatform } = await import('../src/tenancy/context.js');

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9c_t9';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all([
    StaffAccount.createIndexes(),
    Role.createIndexes(),
    RoleAssignment.createIndexes(),
    Permission.createIndexes(),
    Partner.createIndexes(),
    Tenant.createIndexes(),
    PartnerOperatorLink.createIndexes(),
    OperatorFeePlan.createIndexes(),
    TenantDailyStat.createIndexes(),
    PartnerStatement.createIndexes(),
    StatementLine.createIndexes(),
    AuditLog.createIndexes(),
  ]);
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function createServer() {
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function createRole(name, permissions, scopeType = 'platform', scopeId = null) {
  const permissionIds = await Promise.all(permissions.map(async (key) => (
    (await Permission.findOneAndUpdate(
      { key },
      { $setOnInsert: { key, name: key, category: scopeType } },
      { upsert: true, new: true },
    ))._id
  )));
  return Role.create({ name, displayName: name, scopeType, scopeId, permissions: permissionIds });
}

async function assignRole(staff, role, scopeType = 'platform', scopeId = null) {
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType, scopeId });
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();
  return { response, body };
}

test('İP-9c billing lifecycle keeps currency, terms, issued statements, and partner boundaries isolated', async () => {
  const platformOwner = await StaffAccount.create({
    email: 'billing-owner@example.com', username: 'billing-owner', password: 'pwd', status: 'active',
  });
  const financeStaff = await StaffAccount.create({
    email: 'billing-finance@example.com', username: 'billing-finance', password: 'pwd', status: 'active',
  });
  const partnerStaff = await StaffAccount.create({
    email: 'billing-partner@example.com', username: 'billing-partner', password: 'pwd', status: 'active',
  });
  const otherPartnerStaff = await StaffAccount.create({
    email: 'billing-other-partner@example.com', username: 'billing-other-partner', password: 'pwd', status: 'active',
  });

  const ownerRole = await createRole('billing_owner_role', ['platform:partners:manage']);
  const financeRole = await createRole('billing_finance_role', [
    'platform:billing:read', 'platform:billing:manage', 'platform:reports:read',
  ]);
  await assignRole(platformOwner, ownerRole);
  await assignRole(financeStaff, financeRole);

  const ownerToken = signStaffAccess(platformOwner, { scopeType: 'platform', amr: ['pwd', 'otp'] });
  const financeToken = signStaffAccess(financeStaff, { scopeType: 'platform', amr: ['pwd', 'otp'] });
  const { server, base } = await createServer();

  try {
    const partnerCreate = await requestJson(`${base}/api/platform/partners`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        key: 'billing-partner',
        name: 'Billing Partner',
        defaultCommercialTerms: { model: 'revshare_ggr', rate: 0.10, currency: 'TRY' },
      }),
    });
    assert.equal(partnerCreate.response.status, 201, JSON.stringify(partnerCreate.body));
    const partner = partnerCreate.body.partner;

    const otherPartner = await Partner.create({
      key: 'billing-other-partner', name: 'Other Billing Partner', createdBy: platformOwner._id,
    });
    const partnerRole = await createRole('billing_partner_role', ['partner:metrics:read'], 'partner', partner._id);
    const otherPartnerRole = await createRole('billing_other_partner_role', ['partner:metrics:read'], 'partner', otherPartner._id);
    await assignRole(partnerStaff, partnerRole, 'partner', partner._id);
    await assignRole(otherPartnerStaff, otherPartnerRole, 'partner', otherPartner._id);

    const tenantTry = await Tenant.create({ key: 'billing-try', name: 'Billing TRY', status: 'active' });
    const tenantEur = await Tenant.create({ key: 'billing-eur', name: 'Billing EUR', status: 'active' });
    const feeTenant = await Tenant.create({ key: 'billing-fee', name: 'Billing Fee', status: 'active' });

    const feePlanCreate = await requestJson(`${base}/api/platform/billing/plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${financeToken}` },
      body: JSON.stringify({
        tenantId: feeTenant._id,
        sportsbookFee: { model: 'both', fixedMonthlyFee: 100, turnoverRate: 0.01, currency: 'TRY' },
      }),
    });
    assert.equal(feePlanCreate.response.status, 201, JSON.stringify(feePlanCreate.body));
    assert.equal(feePlanCreate.body.sportsbookFee.model, 'both');

    await PartnerOperatorLink.create([
      {
        partnerId: partner._id,
        tenantId: tenantTry._id,
        validFrom: new Date('2026-11-01T00:00:00.000Z'),
        validTo: new Date('2026-11-10T00:00:00.000Z'),
        commercialTerms: { model: 'revshare_ggr', rate: 0.15, currency: 'TRY' },
        createdBy: platformOwner._id,
      },
      {
        partnerId: partner._id,
        tenantId: tenantTry._id,
        validFrom: new Date('2026-11-10T00:00:00.000Z'),
        commercialTerms: { model: 'revshare_ggr', rate: 0.20, currency: 'TRY' },
        createdBy: platformOwner._id,
      },
      {
        partnerId: partner._id,
        tenantId: tenantEur._id,
        validFrom: new Date('2026-11-01T00:00:00.000Z'),
        commercialTerms: { model: 'revshare_ggr', rate: 0.10, currency: 'EUR' },
        createdBy: platformOwner._id,
      },
    ]);
    await OperatorFeePlan.create([
      {
        tenantId: tenantTry._id,
        validFrom: new Date('2026-11-01T00:00:00.000Z'),
        validTo: new Date('2026-11-10T00:00:00.000Z'),
        sportsbookFee: { model: 'turnover_percentage', turnoverRate: 0.01, currency: 'TRY' },
        createdBy: financeStaff._id,
      },
      {
        tenantId: tenantTry._id,
        validFrom: new Date('2026-11-10T00:00:00.000Z'),
        sportsbookFee: { model: 'both', fixedMonthlyFee: 500, turnoverRate: 0.02, currency: 'TRY' },
        createdBy: financeStaff._id,
      },
    ]);
    await TenantDailyStat.create([
      {
        tenantId: tenantTry._id, date: '2026-11-05', currency: 'TRY',
        casinoGgr: 10000, sportsGgrRealized: 2000, sportsTurnover: 40000,
      },
      {
        tenantId: tenantTry._id, date: '2026-11-15', currency: 'TRY',
        casinoGgr: 10000, sportsGgrRealized: 5000, sportsTurnover: 50000,
      },
      {
        tenantId: tenantEur._id, date: '2026-11-15', currency: 'EUR',
        casinoGgr: 1000, sportsGgrRealized: 200, sportsTurnover: 5000,
      },
    ]);

    const generationRequest = {
      partnerId: partner._id, periodStart: '2026-11-01', periodEnd: '2026-11-30',
    };
    const firstGeneration = await requestJson(`${base}/api/platform/billing/statements/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${financeToken}` },
      body: JSON.stringify(generationRequest),
    });
    assert.equal(firstGeneration.response.status, 200, JSON.stringify(firstGeneration.body));
    assert.equal(firstGeneration.body.statements.length, 2, 'one draft per currency');
    const statementsByCurrency = Object.fromEntries(firstGeneration.body.statements.map((statement) => [statement.currency, statement]));
    assert.equal(statementsByCurrency.TRY.grossAmount, 4800);
    assert.equal(statementsByCurrency.EUR.grossAmount, 120);

    const repeatGeneration = await requestJson(`${base}/api/platform/billing/statements/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${financeToken}` },
      body: JSON.stringify(generationRequest),
    });
    assert.equal(repeatGeneration.response.status, 200, JSON.stringify(repeatGeneration.body));
    assert.deepEqual(
      repeatGeneration.body.statements.map((statement) => String(statement._id)).sort(),
      firstGeneration.body.statements.map((statement) => String(statement._id)).sort(),
      're-running generation reuses draft statements',
    );

    const tryStatementId = statementsByCurrency.TRY._id;
    const eurStatementId = statementsByCurrency.EUR._id;
    const issue = await requestJson(`${base}/api/platform/billing/statements/${tryStatementId}/issue`, {
      method: 'POST', headers: { Authorization: `Bearer ${financeToken}` },
    });
    assert.equal(issue.response.status, 200, JSON.stringify(issue.body));
    assert.equal(issue.body.statement.status, 'issued');

    const issued = await PartnerStatement.findById(tryStatementId);
    issued.grossAmount = 99999;
    await assert.rejects(() => issued.save(), (error) => error.code === 'ERR_STATEMENT_IMMUTABLE');

    const regenerateIssued = await requestJson(`${base}/api/platform/billing/statements/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${financeToken}` },
      body: JSON.stringify(generationRequest),
    });
    assert.equal(regenerateIssued.response.status, 409);
    assert.equal(regenerateIssued.body.error.code, 'ERR_STATEMENT_ALREADY_ISSUED');

    const adjustment = await requestJson(`${base}/api/platform/billing/statements/${tryStatementId}/adjustments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${financeToken}` },
      body: JSON.stringify({ amount: -300, description: '=refund offset', reason: 'Audit review 501' }),
    });
    assert.equal(adjustment.response.status, 200, JSON.stringify(adjustment.body));
    assert.equal(adjustment.body.statement.adjustmentsAmount, -300);
    assert.equal(adjustment.body.statement.netAmount, 4500);

    const audit = await runAsPlatform('billing-acceptance-audit-check', () => AuditLog.findOne({
      action: 'billing:statement:adjust', targetId: String(tryStatementId),
    }).lean());
    assert.equal(audit.reason, 'Audit review 501');

    const voidWithoutReason = await requestJson(`${base}/api/platform/billing/statements/${eurStatementId}/void`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${financeToken}` }, body: '{}',
    });
    assert.equal(voidWithoutReason.response.status, 400);
    const voidWithReason = await requestJson(`${base}/api/platform/billing/statements/${eurStatementId}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${financeToken}` },
      body: JSON.stringify({ reason: 'Currency correction' }),
    });
    assert.equal(voidWithReason.response.status, 200, JSON.stringify(voidWithReason.body));
    assert.equal(voidWithReason.body.statement.status, 'voided');

    const partnerToken = signStaffAccess(partnerStaff, { scopeType: 'partner', scopeId: partner._id, amr: ['pwd', 'otp'] });
    const otherPartnerToken = signStaffAccess(otherPartnerStaff, { scopeType: 'partner', scopeId: otherPartner._id, amr: ['pwd', 'otp'] });
    const ownStatements = await requestJson(`${base}/api/partner/statements`, {
      headers: { Authorization: `Bearer ${partnerToken}` },
    });
    assert.equal(ownStatements.response.status, 200, JSON.stringify(ownStatements.body));
    assert.equal(ownStatements.body.statements.length, 1);
    assert.equal(ownStatements.body.statements[0].netAmount, 4500);

    const crossPartner = await requestJson(`${base}/api/partner/statements/${tryStatementId}`, {
      headers: { Authorization: `Bearer ${otherPartnerToken}` },
    });
    assert.equal(crossPartner.response.status, 404);
    assert.equal(crossPartner.body.error.code, 'NOT_FOUND');

    const partnerCsv = await fetch(`${base}/api/partner/statements/${tryStatementId}/export`, {
      headers: { Authorization: `Bearer ${partnerToken}` },
    });
    assert.equal(partnerCsv.status, 200);
    assert.match(await partnerCsv.text(), /"'=refund offset"/);

    const sportsbookReport = await requestJson(`${base}/api/platform/reports/sportsbook-odds?from=2026-11-01&to=2026-11-30&currency=TRY`, {
      headers: { Authorization: `Bearer ${financeToken}` },
    });
    assert.equal(sportsbookReport.response.status, 200, JSON.stringify(sportsbookReport.body));
    assert.equal(sportsbookReport.body.totals.sportsTurnover, 90000);
    assert.equal(sportsbookReport.body.totals.turnoverFee, 1400);
    assert.equal(sportsbookReport.body.totals.fixedFee, 500);
    assert.equal(sportsbookReport.body.totals.totalFee, 1900);

    const ngrPartner = await Partner.create({
      key: 'ngr-billing-partner', name: 'NGR Billing Partner', createdBy: platformOwner._id,
      defaultCommercialTerms: { model: 'revshare_ngr', rate: 0.10, currency: 'TRY' },
    });
    const ngrTenant = await Tenant.create({ key: 'ngr-billing-tenant', name: 'NGR Billing Tenant', status: 'active' });
    await PartnerOperatorLink.create({
      partnerId: ngrPartner._id, tenantId: ngrTenant._id, validFrom: new Date('2026-11-01T00:00:00.000Z'),
      commercialTerms: { model: 'revshare_ngr', rate: 0.10, currency: 'TRY' }, createdBy: platformOwner._id,
    });
    await TenantDailyStat.create({
      tenantId: ngrTenant._id, date: '2026-11-05', currency: 'TRY', casinoGgr: 1000,
    });
    const ngrGeneration = await requestJson(`${base}/api/platform/billing/statements/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${financeToken}` },
      body: JSON.stringify({ partnerId: ngrPartner._id, periodStart: '2026-11-01', periodEnd: '2026-11-30' }),
    });
    assert.equal(ngrGeneration.response.status, 500);
    assert.equal(ngrGeneration.body.error.code, 'ERR_NGR_NOT_IMPLEMENTED');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
