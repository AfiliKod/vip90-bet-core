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
const { default: Tenant } = await import('../src/models/Tenant.js');
const { default: ProviderFeeSchedule } = await import('../src/models/ProviderFeeSchedule.js');
const { default: AuditLog } = await import('../src/models/AuditLog.js');
const { signStaffAccess } = await import('../src/services/staffSession.js');
const { runAsPlatform } = await import('../src/tenancy/context.js');

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/core_ip9f_provider_fee_api';

async function startServer() {
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function staffWithPermission(key, suffix) {
  const staff = await StaffAccount.create({ email: `provider-${suffix}@example.com`, username: `provider_${suffix}`, password: 'pwd', status: 'active' });
  const permission = await Permission.create({ key, name: key, category: 'platform' });
  const role = await Role.create({ name: `provider_${suffix}`, displayName: `Provider ${suffix}`, scopeType: 'platform', permissions: [permission._id] });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'platform', scopeId: null });
  return { staff, token: signStaffAccess(staff, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] }) };
}

test.before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  await Promise.all([ProviderFeeSchedule.createIndexes(), StaffAccount.createIndexes(), Role.createIndexes(), RoleAssignment.createIndexes(), Permission.createIndexes(), Tenant.createIndexes()]);
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('provider fee schedule API enforces billing permissions, closes amendments, and audits writes', async () => {
  const manager = await staffWithPermission('platform:billing:manage', 'manager');
  const reader = await staffWithPermission('platform:billing:read', 'reader');
  const tenant = await Tenant.create({ key: 'provider-fee-tenant', name: 'Provider Fee Tenant' });
  const { server, base } = await startServer();

  try {
    const deniedCreate = await fetch(`${base}/api/platform/billing/provider-fee-schedules`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${reader.token}` },
      body: JSON.stringify({ provider: 'igames', rateOfGgr: 0.1, currency: 'TRY', validFrom: '2026-11-01' }),
    });
    assert.equal(deniedCreate.status, 403);

    const first = await fetch(`${base}/api/platform/billing/provider-fee-schedules`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${manager.token}` },
      body: JSON.stringify({ tenantId: tenant._id, provider: 'igames', rateOfGgr: 0.1, currency: 'TRY', validFrom: '2026-11-01', minimumMonthlyFee: 25 }),
    });
    assert.equal(first.status, 201, await first.clone().text());
    const firstSchedule = await first.json();

    const amendment = await fetch(`${base}/api/platform/billing/provider-fee-schedules`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${manager.token}` },
      body: JSON.stringify({ tenantId: tenant._id, provider: 'igames', rateOfGgr: 0.2, currency: 'TRY', validFrom: '2026-11-15' }),
    });
    assert.equal(amendment.status, 201, await amendment.clone().text());
    const amendmentSchedule = await amendment.json();
    const closedFirst = await ProviderFeeSchedule.findById(firstSchedule._id).lean();
    assert.equal(closedFirst.validTo.toISOString(), '2026-11-15T00:00:00.000Z');

    const list = await fetch(`${base}/api/platform/billing/provider-fee-schedules`, { headers: { Authorization: `Bearer ${reader.token}` } });
    assert.equal(list.status, 200);
    assert.equal((await list.json()).schedules.length, 2);

    const close = await fetch(`${base}/api/platform/billing/provider-fee-schedules/${amendmentSchedule._id}/close`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${manager.token}` }, body: JSON.stringify({ validTo: '2026-11-30' }),
    });
    assert.equal(close.status, 200);

    const actions = await runAsPlatform('test-provider-fee-audit', () => AuditLog.find({ targetType: 'provider_fee_schedule' }).distinct('action'));
    assert.deepEqual(actions.sort(), ['billing:provider_fee_schedule:close', 'billing:provider_fee_schedule:create']);
  } finally {
    server.close();
  }
});

test('provider fee schedule platform API is absent in single mode', async () => {
  process.env.TENANCY_MODE = 'single';
  const { server, base } = await startServer();
  try {
    assert.equal((await fetch(`${base}/api/platform/billing/provider-fee-schedules`)).status, 404);
  } finally {
    server.close();
    process.env.TENANCY_MODE = 'multi';
  }
});
