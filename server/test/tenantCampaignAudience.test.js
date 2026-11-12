import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import PlayerSegment from '../src/models/PlayerSegment.js';
import SystemMailTemplate from '../src/models/SystemMailTemplate.js';
import SmsTemplate from '../src/models/SmsTemplate.js';
import Tenant from '../src/models/Tenant.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { getCurrentTenantId } from '../src/tenancy/context.js';
import { resolveAudience, runDueScheduledMailsForAllTenants } from '../src/services/systemMail.js';
import { resolveRecipients, runDueScheduledSmsForAllTenants } from '../src/services/smsTemplate.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://localhost:27017/vip90_test_ip7_t5';
let T1; let T2;

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  const t1 = await Tenant.create({ key: 't1campaign', name: 'T1', status: 'active' });
  const t2 = await Tenant.create({ key: 't2campaign', name: 'T2', status: 'active' });
  T1 = t1._id;
  T2 = t2._id;
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
beforeEach(async () => {
  await User.deleteMany({});
  await PlayerSegment.deleteMany({});
  await SystemMailTemplate.deleteMany({});
  await SmsTemplate.deleteMany({});
});

describe('campaign audience isolation', () => {
  it('resolves only the current tenant users for type=all', async () => {
    await User.create([
      { username: 't1mail', email: 't1mail@test.com', password: 'x', tenantId: T1, isActive: true },
      { username: 't2mail', email: 't2mail@test.com', password: 'x', tenantId: T2, isActive: true },
    ]);
    const result = await runWithTenant(T1, () => resolveAudience({ type: 'all' }));
    assert.equal(result.users.length, 1);
    assert.equal(result.users[0].username, 't1mail');
  });

  it('a segment from another tenant resolves to zero users', async () => {
    const foreign = await runWithTenant(T2, () => PlayerSegment.create({
      name: 'T2 segment', slug: 't2-segment', criteria: { balance: { min: 0 } },
    }));
    await User.create([
      { username: 't1seg', email: 't1seg@test.com', password: 'x', tenantId: T1, isActive: true },
      { username: 't2seg', email: 't2seg@test.com', password: 'x', tenantId: T2, isActive: true },
    ]);
    const result = await runWithTenant(T1, () => resolveAudience({ type: 'segments', segmentIds: [foreign._id] }));
    assert.equal(result.users.length, 0);
  });

  it('SMS recipients are tenant-filtered for type=all', async () => {
    await User.create([
      { username: 't1sms', email: 't1sms@test.com', password: 'x', tenantId: T1, isActive: true, phone: '+905550000001' },
      { username: 't2sms', email: 't2sms@test.com', password: 'x', tenantId: T2, isActive: true, phone: '+905550000002' },
    ]);
    const result = await runWithTenant(T1, () => resolveRecipients({ audienceType: 'all' }));
    assert.deepEqual(result.recipients.map((u) => u.username), ['t1sms']);
  });

  it('scheduled mail runs once per active tenant', async () => {
    const seen = [];
    const results = await runDueScheduledMailsForAllTenants(new Date(), {
      run: async (now) => {
        const tid = getCurrentTenantId();
        seen.push({ tid: String(tid), now: now.toISOString() });
        return 1;
      },
    });
    assert.equal(results.length, 2);
    assert.deepEqual(seen.map((s) => s.tid).sort(), [String(T1), String(T2)].sort());
  });

  it('scheduled SMS runs once per active tenant', async () => {
    const seen = [];
    await runDueScheduledSmsForAllTenants(new Date(), {
      run: async () => {
        seen.push(String(getCurrentTenantId()));
        return 2;
      },
    });
    assert.deepEqual(seen.sort(), [String(T1), String(T2)].sort());
  });
});
