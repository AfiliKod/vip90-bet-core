import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Tenant from '../src/models/Tenant.js';
import { runBonusExpiryJobOnce } from '../src/jobs/bonusExpiry.js';
import { runKycExpiryJobOnce } from '../src/jobs/kycExpiry.js';
import { runCryptoWithdrawalReconcileOnce } from '../src/jobs/cryptoWithdrawalReconcile.js';
import { runCleanupOnce } from '../src/jobs/cleanup.js';
import { getCurrentTenantId, tenantContext, runAsPlatform } from '../src/tenancy/context.js';

// Own test database; never read MONGODB_URI (it may point to a real database).
const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://localhost:27017/vip90_test_ip7_t6';
let T1; let T2;

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  const [t1, t2] = await Tenant.create([
    { key: 't1jobs', name: 'T1', status: 'active' },
    { key: 't2jobs', name: 'T2', status: 'active' },
    { key: 't3jobs', name: 'T3', status: 'suspended' },
  ]);
  T1 = t1._id;
  T2 = t2._id;
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
beforeEach(async () => {
  await Tenant.updateMany({ key: { $in: ['t1jobs', 't2jobs'] } }, { $set: { status: 'active' } });
});

describe('per-tenant job loops', () => {
  it('runs bonus expiry once for each active tenant in its own context', async () => {
    const seen = [];
    const results = await runBonusExpiryJobOnce({
      run: async () => { seen.push(String(getCurrentTenantId())); return { processed: 1, deducted: 0 }; },
    });
    assert.deepEqual(seen.sort(), [String(T1), String(T2)].sort());
    assert.equal(results.length, 2);
    assert.equal(results[0].result.processed, 1);
  });

  it('runs kyc expiry once per active tenant', async () => {
    const seen = [];
    await runKycExpiryJobOnce({ run: async () => { seen.push(String(getCurrentTenantId())); return 3; } });
    assert.deepEqual(seen.sort(), [String(T1), String(T2)].sort());
  });

  it('runs crypto reconciliation once per active tenant', async () => {
    const seen = [];
    await runCryptoWithdrawalReconcileOnce({
      run: async () => { seen.push(String(getCurrentTenantId())); return { waiting: 0 }; },
    });
    assert.deepEqual(seen.sort(), [String(T1), String(T2)].sort());
  });

  it('keeps going when one tenant fails', async () => {
    let calls = 0;
    const results = await runBonusExpiryJobOnce({
      run: async () => {
        calls += 1;
        if (calls === 1) throw new Error('tenant one failed');
        return { processed: 0, deducted: 0 };
      },
    });
    assert.equal(results.length, 2);
    assert.ok(results.some((r) => r.error));
    assert.ok(results.some((r) => r.result));
  });

  it('runs event cleanup explicitly as platform, not per tenant', async () => {
    let reason = null;
    let mode = null;
    const result = await runCleanupOnce({
      platform: async (why, fn) => { reason = why; return runAsPlatform(why, fn); },
      updateMany: async () => ({ modifiedCount: 0 }),
      deleteMany: async () => ({ deletedCount: 0 }),
      onPlatform: () => { mode = tenantContext.get()?.mode; },
    });
    assert.equal(reason, 'event-cleanup');
    assert.equal(mode, 'platform');
    assert.deepEqual(result, { archived: 0, stale: 0, farFuture: 0, deleted: 0 });
  });
});
