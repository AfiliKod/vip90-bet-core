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
const { default: NgrDefinition } = await import('../src/models/NgrDefinition.js');
const { default: AuditLog } = await import('../src/models/AuditLog.js');
const { signStaffAccess } = await import('../src/services/staffSession.js');
const { runAsPlatform } = await import('../src/tenancy/context.js');

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9d_t5';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  await NgrDefinition.createIndexes();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('Platform NGR definitions API supports CRUD, version cloning, and rejects double deductions with 400', async () => {
  const staff = await StaffAccount.create({ email: 'ngrapi@example.com', username: 'ngrapi', password: 'pwd', status: 'active' });
  const perm = await Permission.findOneAndUpdate(
    { key: 'platform:billing:manage' },
    { $setOnInsert: { key: 'platform:billing:manage', name: 'Manage Billing', category: 'platform' } },
    { upsert: true, new: true }
  );
  const role = await Role.create({ name: 'billing_mgr', displayName: 'Billing Manager', scopeType: 'platform', permissions: [perm._id] });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'platform' });

  const token = signStaffAccess(staff, { scopeType: 'platform', amr: ['pwd', 'otp'] });
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const createRes = await fetch(`${base}/api/platform/billing/ngr-definitions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: 'Standard RevShare NGR',
        description: 'Standard formula',
        ggrComponents: ['casino', 'sports'],
        items: [
          { category: 'bonus', label: 'Bonus Cost', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } },
          { category: 'tax', label: 'Gaming Tax', enabled: true, source: 'rate', params: { target: 'ggr', rate: 0.05 } },
        ],
      }),
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.equal(created.version, 1);

    const badRes = await fetch(`${base}/api/platform/billing/ngr-definitions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: 'Invalid Formula',
        items: [
          { category: 'bonus', label: 'Bonus 1', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } },
          { category: 'bonus', label: 'Bonus 2', enabled: true, source: 'rate', params: { target: 'ggr', rate: 0.1 } },
        ],
      }),
    });
    assert.equal(badRes.status, 400);
    const badBody = await badRes.json();
    assert.equal(badBody.error?.code || badBody.code, 'ERR_NGR_DUPLICATE_CATEGORY');

    const versionRes = await fetch(`${base}/api/platform/billing/ngr-definitions/${created._id}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        items: [
          { category: 'bonus', label: 'Bonus Cost', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } },
          { category: 'chargeback', label: 'Chargebacks', enabled: true, source: 'stat_field', params: { field: 'chargebacks' } },
        ],
      }),
    });
    assert.equal(versionRes.status, 201);
    const v2 = await versionRes.json();
    assert.equal(v2.version, 2);
    assert.equal(v2.name, created.name);

    const auditActions = await runAsPlatform('test-platform-ngr-audit', () => AuditLog
      .find({ targetId: { $in: [String(created._id), String(v2._id)] } })
      .distinct('action'));
    assert.deepEqual(auditActions.sort(), ['billing:ngr_definition:create', 'billing:ngr_definition:new_version']);
  } finally {
    server.close();
  }
});

test('Platform NGR definitions endpoints return 404 in single mode', async () => {
  process.env.TENANCY_MODE = 'single';
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/platform/billing/ngr-definitions`);
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.error, 'NOT_FOUND');
  } finally {
    server.close();
    process.env.TENANCY_MODE = 'multi';
  }
});

test('partner commercial terms are validated: no built-in rate, NGR needs an existing definition version', async () => {
  const { assertValidCommercialTerms } = await import('../src/platform/services/commercialTerms.js');
  await assert.rejects(assertValidCommercialTerms({ model: 'revshare_ggr', base: 'ggr' }), { code: 'ERR_TERMS_RATE' });
  await assert.rejects(assertValidCommercialTerms({ model: 'revshare_ngr', base: 'ngr', rate: 0.2 }), { code: 'ERR_TERMS_NGR_DEFINITION' });
  await assert.rejects(
    assertValidCommercialTerms({ model: 'revshare_ngr', base: 'ngr', rate: 0.2, ngrDefinitionId: new mongoose.Types.ObjectId(), ngrDefinitionVersion: 1 }),
    { code: 'ERR_TERMS_NGR_DEFINITION' },
  );
  await assertValidCommercialTerms({ model: 'revshare_ggr', base: 'ggr', rate: 0.2 });
});
