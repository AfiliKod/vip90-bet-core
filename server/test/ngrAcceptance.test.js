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
const { default: TenantDailyStat } = await import('../src/models/TenantDailyStat.js');
const { default: NgrDefinition } = await import('../src/models/NgrDefinition.js');
const { default: PartnerStatement } = await import('../src/models/PartnerStatement.js');
const { default: StatementLine } = await import('../src/models/StatementLine.js');
const { default: User } = await import('../src/models/User.js');
const { default: Transaction } = await import('../src/models/Transaction.js');
const { signStaffAccess } = await import('../src/services/staffSession.js');
const { runWithTenant } = await import('../src/tenancy/context.js');
const { aggregateTenantDailyStat } = await import('../src/services/tenantDailyStat.js');

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9d_t8';

async function startApp() {
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return {
    server,
    base: `http://127.0.0.1:${server.address().port}`,
  };
}

async function createPermission(key, category) {
  return Permission.findOneAndUpdate(
    { key },
    { $setOnInsert: { key, name: key, category } },
    { upsert: true, new: true },
  );
}

async function expectDefinitionRejection(base, ownerToken, payload, code) {
  const response = await fetch(`${base}/api/platform/billing/ngr-definitions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error?.code || body.code, code);
}

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
    TenantDailyStat.createIndexes(),
    NgrDefinition.createIndexes(),
    PartnerStatement.createIndexes(),
    StatementLine.createIndexes(),
    User.createIndexes(),
    Transaction.createIndexes(),
  ]);
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('İP-9d K28 acceptance: NGR lifecycle is precise, isolated, and unavailable in single mode', async () => {
  const platformOwner = await StaffAccount.create({
    email: 'ngr-owner@example.com', username: 'ngr_owner', password: 'pwd', status: 'active',
  });
  const partnerStaff = await StaffAccount.create({
    email: 'ngr-partner@example.com', username: 'ngr_partner', password: 'pwd', status: 'active',
  });
  const otherPartnerStaff = await StaffAccount.create({
    email: 'other-partner@example.com', username: 'other_partner', password: 'pwd', status: 'active',
  });

  const ownerPermissions = await Promise.all([
    'platform:billing:manage',
    'platform:billing:read',
    'platform:partners:manage',
  ].map((key) => createPermission(key, 'platform')));
  const partnerPermission = await createPermission('partner:metrics:read', 'partner');

  const ownerRole = await Role.create({
    name: 'ngr_platform_owner', displayName: 'NGR Platform Owner', scopeType: 'platform',
    permissions: ownerPermissions.map((permission) => permission._id),
  });
  await RoleAssignment.create({ staffId: platformOwner._id, roleId: ownerRole._id, scopeType: 'platform' });

  const partner = await Partner.create({ key: 'ngr-partner', name: 'NGR Partner', createdBy: platformOwner._id });
  const otherPartner = await Partner.create({ key: 'other-partner', name: 'Other Partner', createdBy: platformOwner._id });
  const partnerRole = await Role.create({
    name: 'ngr_partner_reader', displayName: 'NGR Partner Reader', scopeType: 'partner', scopeId: partner._id,
    permissions: [partnerPermission._id],
  });
  const otherPartnerRole = await Role.create({
    name: 'other_partner_reader', displayName: 'Other Partner Reader', scopeType: 'partner', scopeId: otherPartner._id,
    permissions: [partnerPermission._id],
  });
  await Promise.all([
    RoleAssignment.create({ staffId: partnerStaff._id, roleId: partnerRole._id, scopeType: 'partner', scopeId: partner._id }),
    RoleAssignment.create({ staffId: otherPartnerStaff._id, roleId: otherPartnerRole._id, scopeType: 'partner', scopeId: otherPartner._id }),
  ]);

  const tenant = await Tenant.create({ key: 'ngr-operator', name: 'NGR Operator', status: 'active' });
  const ownerToken = signStaffAccess(platformOwner, { scopeType: 'platform', amr: ['pwd', 'otp'] });
  const partnerToken = signStaffAccess(partnerStaff, { scopeType: 'partner', scopeId: partner._id, amr: ['pwd', 'otp'] });
  const otherPartnerToken = signStaffAccess(otherPartnerStaff, { scopeType: 'partner', scopeId: otherPartner._id, amr: ['pwd', 'otp'] });
  const { server, base } = await startApp();

  try {
    await expectDefinitionRejection(base, ownerToken, {
      name: 'Duplicate Category',
      items: [
        { category: 'bonus', label: 'First bonus', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } },
        { category: 'bonus', label: 'Second bonus', enabled: true, source: 'rate', params: { target: 'ggr', rate: 0.01 } },
      ],
    }, 'ERR_NGR_DUPLICATE_CATEGORY');
    await expectDefinitionRejection(base, ownerToken, {
      name: 'Duplicate Other Label',
      items: [
        { category: 'other', label: 'Hosting', enabled: true, source: 'fixed', params: { amount: 100, period: 'day' } },
        { category: 'other', label: 'Hosting', enabled: true, source: 'fixed', params: { amount: 50, period: 'day' } },
      ],
    }, 'ERR_NGR_DUPLICATE_LABEL');
    await expectDefinitionRejection(base, ownerToken, {
      name: 'Duplicate Physical Source',
      items: [
        { category: 'bonus', label: 'Bonus', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } },
        { category: 'other', label: 'Duplicate field', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } },
      ],
    }, 'ERR_NGR_DUPLICATE_SOURCE');
    await expectDefinitionRejection(base, ownerToken, {
      name: 'Already Net of Bonus',
      ggrAlreadyNetOf: ['bonus'],
      items: [
        { category: 'bonus', label: 'Bonus', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } },
      ],
    }, 'ERR_NGR_ALREADY_NET_OF');

    const definitionResponse = await fetch(`${base}/api/platform/billing/ngr-definitions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        name: 'Acceptance NGR',
        ggrComponents: ['casino', 'sports'],
        items: [
          { category: 'bonus', label: 'Bonus cost', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } },
          { category: 'chargeback', label: 'Chargebacks', enabled: true, source: 'stat_field', params: { field: 'chargebacks' } },
          { category: 'provider_fee', label: 'Provider fee', enabled: true, source: 'rate', params: { target: 'ggr', rate: 0.10 } },
          { category: 'tax', label: 'Gaming tax', enabled: true, source: 'rate', params: { target: 'ggr', rate: 0.15 } },
          { category: 'other', label: 'Hosting', enabled: true, source: 'fixed', params: { amount: 150, period: 'day' } },
        ],
      }),
    });
    assert.equal(definitionResponse.status, 201);
    const ngrDefinition = await definitionResponse.json();

    await PartnerOperatorLink.create({
      partnerId: partner._id,
      tenantId: tenant._id,
      validFrom: new Date('2026-11-01T00:00:00.000Z'),
      validTo: new Date('2026-11-16T00:00:00.000Z'),
      commercialTerms: {
        model: 'revshare_ngr', base: 'ngr', rate: 0.20, currency: 'TRY',
        ngrDefinitionId: ngrDefinition._id, ngrDefinitionVersion: 1,
      },
      createdBy: platformOwner._id,
    });
    await PartnerOperatorLink.create({
      partnerId: partner._id,
      tenantId: tenant._id,
      validFrom: new Date('2026-11-16T00:00:00.000Z'),
      commercialTerms: {
        model: 'revshare_ngr', base: 'ngr', rate: 0.10, currency: 'TRY',
        ngrDefinitionId: ngrDefinition._id, ngrDefinitionVersion: 1,
      },
      createdBy: platformOwner._id,
    });

    /*
     * Worked cents example (one rounding per deduction/commission line):
     * TRY 2026-11-10: 1,200,000 GGR - (150,000 bonus + 25,000 chargebacks
     * + 120,000 provider fee + 180,000 tax + 15,000 hosting) = 710,000 NGR;
     * @20% = 142,000 cents. TRY 2026-11-20: 600,000 - 225,000 = 375,000;
     * @10% = 37,500 cents. TRY statement = 179,500 cents (1,795.00).
     * EUR 2026-11-15: 100,000 - 55,000 = 45,000 NGR; @20% = 9,000 cents.
     */
    await TenantDailyStat.insertMany([
      { tenantId: tenant._id, date: '2026-11-10', currency: 'TRY', casinoGgr: 10000, sportsGgrRealized: 2000, bonusCost: 1500, chargebacks: 250 },
      { tenantId: tenant._id, date: '2026-11-20', currency: 'TRY', casinoGgr: 5000, sportsGgrRealized: 1000, bonusCost: 500, chargebacks: 100 },
      { tenantId: tenant._id, date: '2026-11-15', currency: 'EUR', casinoGgr: 800, sportsGgrRealized: 200, bonusCost: 100, chargebacks: 50 },
    ]);

    const generateResponse = await fetch(`${base}/api/platform/billing/statements/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ partnerId: partner._id, periodStart: '2026-11-01', periodEnd: '2026-11-30' }),
    });
    assert.equal(generateResponse.status, 200);
    const { statements } = await generateResponse.json();
    assert.equal(statements.length, 2);
    const statementByCurrency = new Map(statements.map((statement) => [statement.currency, statement]));
    assert.equal(Math.round(statementByCurrency.get('TRY').grossAmount * 100), 179500);
    assert.equal(Math.round(statementByCurrency.get('EUR').grossAmount * 100), 9000);

    const tryLines = await StatementLine.find({ statementId: statementByCurrency.get('TRY')._id }).sort({ date: 1 }).lean();
    assert.deepEqual(tryLines.map((line) => Math.round(line.amount * 100)), [142000, 37500]);
    assert.ok(tryLines.every((line) => line.baseMetric === 'ngr'));
    assert.deepEqual(tryLines[0].metadata.deductions.map((deduction) => Math.round(deduction.amount * 100)), [150000, 25000, 120000, 180000, 15000]);

    const missingRatePartner = await Partner.create({ key: 'missing-rate', name: 'Missing Rate', createdBy: platformOwner._id });
    const missingRateTenant = await Tenant.create({ key: 'missing-rate-operator', name: 'Missing Rate Operator', status: 'active' });
    await PartnerOperatorLink.create({
      partnerId: missingRatePartner._id, tenantId: missingRateTenant._id,
      validFrom: new Date('2026-11-01T00:00:00.000Z'),
      commercialTerms: { model: 'revshare_ggr', base: 'ggr', currency: 'TRY' },
      createdBy: platformOwner._id,
    });
    await TenantDailyStat.create({ tenantId: missingRateTenant._id, date: '2026-11-10', currency: 'TRY', casinoGgr: 1 });
    const missingRateResponse = await fetch(`${base}/api/platform/billing/statements/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ partnerId: missingRatePartner._id, periodStart: '2026-11-01', periodEnd: '2026-11-30' }),
    });
    assert.equal(missingRateResponse.status, 409);
    const missingRateBody = await missingRateResponse.json();
    assert.equal(missingRateBody.error?.code || missingRateBody.code, 'ERR_COMMERCIAL_TERMS_MISSING');

    for (const statement of statements) {
      const issueResponse = await fetch(`${base}/api/platform/billing/statements/${statement._id}/issue`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      assert.equal(issueResponse.status, 200);
    }

    const lockedResponse = await fetch(`${base}/api/platform/billing/ngr-definitions/${ngrDefinition._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ description: 'Attempted mutation of issued version' }),
    });
    assert.equal(lockedResponse.status, 409);
    const lockedBody = await lockedResponse.json();
    assert.equal(lockedBody.error?.code || lockedBody.code, 'ERR_NGR_DEFINITION_IN_USE');
    const versionResponse = await fetch(`${base}/api/platform/billing/ngr-definitions/${ngrDefinition._id}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ description: 'New mutable version' }),
    });
    assert.equal(versionResponse.status, 201);
    assert.equal((await versionResponse.json()).version, 2);

    const ownStatementResponse = await fetch(`${base}/api/partner/statements/${statementByCurrency.get('TRY')._id}`, {
      headers: { Authorization: `Bearer ${partnerToken}` },
    });
    assert.equal(ownStatementResponse.status, 200);
    const ownStatement = await ownStatementResponse.json();
    assert.equal(Math.round(ownStatement.statement.netAmount * 100), 179500);
    assert.equal(ownStatement.lines[0].baseMetric, 'ngr');
    assert.equal(ownStatement.lines[0].metadata.deductions.length, 5);
    const foreignStatementResponse = await fetch(`${base}/api/partner/statements/${statementByCurrency.get('TRY')._id}`, {
      headers: { Authorization: `Bearer ${otherPartnerToken}` },
    });
    assert.equal(foreignStatementResponse.status, 404);
    const foreignStatementBody = await foreignStatementResponse.json();
    assert.equal(foreignStatementBody.error?.code || foreignStatementBody.code || foreignStatementBody.error, 'NOT_FOUND');

    const chargebackTenant = await Tenant.create({ key: 'no-chargeback-source', name: 'No Chargeback Source', status: 'active' });
    const chargebackPlayer = await runWithTenant(chargebackTenant._id, () => User.create({
      username: 'chargeback_test_player', email: 'chargeback-player@example.com', password: 'pwd',
    }));
    await runWithTenant(chargebackTenant._id, () => Transaction.insertMany([
      { userId: chargebackPlayer._id, type: 'reversal', amount: -100, balanceBefore: 100, balanceAfter: 0, currency: 'TRY', status: 'completed', createdAt: new Date('2026-11-12T12:00:00.000Z') },
      { userId: chargebackPlayer._id, type: 'refund', amount: 100, balanceBefore: 0, balanceAfter: 100, currency: 'TRY', status: 'completed', createdAt: new Date('2026-11-12T13:00:00.000Z') },
    ]));
    const noChargebackSourceStat = await aggregateTenantDailyStat(chargebackTenant._id, '2026-11-12');
    assert.equal(noChargebackSourceStat.chargebacks, 0);
    assert.equal(noChargebackSourceStat.providerFees, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  process.env.TENANCY_MODE = 'single';
  const { server: singleServer, base: singleBase } = await startApp();
  try {
    const response = await fetch(`${singleBase}/api/platform/billing/ngr-definitions`);
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.error?.code || body.code || body.error, 'NOT_FOUND');
  } finally {
    await new Promise((resolve) => singleServer.close(resolve));
    process.env.TENANCY_MODE = 'multi';
  }
});
