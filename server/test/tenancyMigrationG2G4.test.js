import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import Transaction from '../src/models/Transaction.js';
import { ensureDefaultTenant } from '../src/tenancy/defaultTenant.js';
import { backfillTenantId } from '../src/tenancy/backfill.js';
import { buildCompoundIndexes } from '../src/tenancy/indexBuilder.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip2_t9_migration_g2g4';
const savedEnforcement = process.env.TENANCY_ENFORCEMENT;
const savedMode = process.env.TENANCY_MODE;

function unassignedCount(collection) {
  return collection.countDocuments({ $or: [{ tenantId: null }, { tenantId: { $exists: false } }] });
}

async function transactionAmountSum() {
  const [totals] = await Transaction.collection.aggregate([
    { $group: { _id: null, amount: { $sum: '$amount' } } },
  ]).toArray();
  return totals?.amount ?? 0;
}

before(async () => {
  process.env.TENANCY_ENFORCEMENT = 'off';
  process.env.TENANCY_MODE = 'single';
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (savedEnforcement === undefined) delete process.env.TENANCY_ENFORCEMENT;
  else process.env.TENANCY_ENFORCEMENT = savedEnforcement;
  if (savedMode === undefined) delete process.env.TENANCY_MODE;
  else process.env.TENANCY_MODE = savedMode;
});

test('§8.6: legacy database upgrade rehearsal (G1 -> G3 -> G4)', async () => {
  // Populate a pre-tenancy fixture directly so no default-tenant stamping is required.
  const userDocs = Array.from({ length: 50 }, (_, i) => ({
    username: `mig_user_${i}`,
    email: `mig_${i}@test.com`,
  }));
  await User.collection.insertMany(userDocs);

  const transactionDocs = Array.from({ length: 100 }, () => ({
    userId: new mongoose.Types.ObjectId(),
    type: 'deposit',
    amount: 100,
    balanceBefore: 0,
    balanceAfter: 100,
    currency: 'TRY',
  }));
  await Transaction.collection.insertMany(transactionDocs);

  const initialUserCount = await User.collection.countDocuments({});
  const initialTransactionCount = await Transaction.collection.countDocuments({});
  const initialBalanceSum = await transactionAmountSum();
  assert.equal(await unassignedCount(User.collection), 50);
  assert.equal(await unassignedCount(Transaction.collection), 100);

  // G1: create the default tenant. Running it twice must be safe.
  const { tenant: defaultTenant } = await ensureDefaultTenant();
  assert.ok(defaultTenant);
  const rerunG1 = await ensureDefaultTenant();
  assert.equal(String(rerunG1.tenant._id), String(defaultTenant._id));

  // G3: backfill legacy records in smaller batches for this rehearsal.
  await backfillTenantId({ batchSize: 20 });
  assert.equal(await unassignedCount(User.collection), 0);
  assert.equal(await unassignedCount(Transaction.collection), 0);
  assert.equal(await User.collection.countDocuments({ tenantId: defaultTenant._id }), 50);
  assert.equal(await Transaction.collection.countDocuments({ tenantId: defaultTenant._id }), 100);
  assert.equal(await User.collection.countDocuments({}), initialUserCount);
  assert.equal(await Transaction.collection.countDocuments({}), initialTransactionCount);
  assert.equal(await transactionAmountSum(), initialBalanceSum);

  // G4: create registered compound indexes while preserving legacy indexes.
  await Promise.all([User.init(), Transaction.init()]);
  await buildCompoundIndexes({ background: false });
  const userIndexes = await User.collection.listIndexes().toArray();
  assert.ok(userIndexes.some((index) => index.name === 'username_1'));
  assert.ok(userIndexes.some((index) => index.name === 'tenant_username_uniq'));

  // Every migration action is idempotent.
  await backfillTenantId({ batchSize: 20 });
  await buildCompoundIndexes({ background: false });
  assert.equal(await User.collection.countDocuments({ tenantId: defaultTenant._id }), 50);
  assert.equal(await Transaction.collection.countDocuments({ tenantId: defaultTenant._id }), 100);
  assert.equal(await transactionAmountSum(), initialBalanceSum);
  assert.equal(await Tenant.countDocuments({ isDefault: true }), 1);
});
