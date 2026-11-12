import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Tenant from '../src/models/Tenant.js';
import Migration from '../src/models/Migration.js';
import User from '../src/models/User.js';
import Transaction from '../src/models/Transaction.js';
import { discoverMigrations } from '../migrations/index.js';
import { backfillTenantId, BACKFILL_MIGRATION_NAME, DEFAULT_BATCH_SIZE } from '../src/tenancy/backfill.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip2_t7';

let savedEnforcement;
let savedMode;

const db = () => mongoose.connection.db;
const unassigned = (coll) => db().collection(coll).countDocuments({
  $or: [{ tenantId: null }, { tenantId: { $exists: false } }],
});

before(async () => {
  savedEnforcement = process.env.TENANCY_ENFORCEMENT;
  savedMode = process.env.TENANCY_MODE;
  process.env.TENANCY_MODE = 'single';
  process.env.TENANCY_ENFORCEMENT = 'off';
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

test('backfill assigns default tenant to unassigned documents in batches and tracks progress', async () => {
  const defaultTenant = await Tenant.create({ key: 'default', name: 'Default', isDefault: true });

  // Seed raw documents without tenantId
  const rawUsers = Array.from({ length: 25 }, (_, i) => ({
    username: `legacy_user_${i}`,
    email: `legacy_${i}@test.com`,
  }));
  await User.collection.insertMany(rawUsers);

  // Run backfill with small batch size 10 to test multi-batch iteration
  const res = await backfillTenantId({
    batchSize: 10,
    targetTenantId: defaultTenant._id,
  });

  assert.equal(DEFAULT_BATCH_SIZE, 10_000, 'G3 batches 10.000 documents');
  assert.equal(await User.countDocuments({ tenantId: defaultTenant._id }), 25);
  assert.equal(await User.countDocuments({ tenantId: null }), 0);

  const mig = await Migration.findOne({ name: BACKFILL_MIGRATION_NAME });
  assert.ok(mig);
  assert.equal(mig.version, '1.2.0');
  assert.equal(mig.progress.users.status, 'completed');
  assert.equal(mig.progress.users.processed, 25);

  assert.equal(res.collections.users.total, 25);
  assert.equal(res.collections.users.updated, 25);
  assert.equal(res.collections.users.status, 'completed');
  assert.ok(Number.isFinite(res.durationMs));
});

test('backfill walks every registered tenant collection plus transactions_dedupe_archive', async () => {
  await Migration.deleteMany({});
  await User.collection.deleteMany({});
  await Transaction.collection.deleteMany({});
  await db().collection('transactions_dedupe_archive').deleteMany({});
  const defaultTenant = await Tenant.findOne({ isDefault: true });

  await User.collection.insertMany([{ username: 't2_user', email: 't2@test.com' }]);
  await Transaction.collection.insertMany([
    { userId: new mongoose.Types.ObjectId(), type: 'deposit', amount: 100, balanceBefore: 0, balanceAfter: 100 },
    { userId: new mongoose.Types.ObjectId(), type: 'withdrawal', amount: 50, balanceBefore: 100, balanceAfter: 50, tenantId: null },
  ]);
  // Not a model: the dedupe archive is backfilled because the collection exists.
  await db().collection('transactions_dedupe_archive').insertMany([{ tenantId: null }, { idempotencyKey: 'dup_1' }]);

  const res = await backfillTenantId({ targetTenantId: defaultTenant._id });

  for (const coll of ['users', 'transactions', 'transactions_dedupe_archive']) {
    assert.equal(res.collections[coll].status, 'completed', coll);
    assert.equal(await unassigned(coll), 0, coll);
    assert.equal(await db().collection(coll).countDocuments({ tenantId: defaultTenant._id }),
      res.collections[coll].total, coll);
  }
  assert.equal(res.collections.users.updated, 1);
  assert.equal(res.collections.transactions.updated, 2);
  assert.equal(res.collections.transactions_dedupe_archive.updated, 2);
});

test('a run killed halfway resumes from the stored checkpoint without duplicate work', async () => {
  await Migration.deleteMany({});
  await User.collection.deleteMany({});
  const defaultTenant = await Tenant.findOne({ isDefault: true });

  const inserted = await User.collection.insertMany(Array.from({ length: 25 }, (_, i) => ({
    username: `resume_user_${i}`,
    email: `resume_${i}@test.com`,
  })));
  const ids = Object.values(inserted.insertedIds);

  // Simulate the process being killed after the second batch has been checkpointed.
  await assert.rejects(
    () => backfillTenantId({
      batchSize: 10,
      targetTenantId: defaultTenant._id,
      onProgress: ({ processed }) => {
        if (processed === 10) throw new Error('SIGTERM');
      },
    }),
    /SIGTERM/,
  );

  const halted = await Migration.findOne({ name: BACKFILL_MIGRATION_NAME });
  assert.equal(halted.progress.users.status, 'in_progress');
  assert.equal(halted.progress.users.processed, 10);
  assert.equal(halted.progress.users.lastId, String(ids[9]));
  assert.equal(await User.collection.countDocuments({ tenantId: defaultTenant._id }), 10);

  const reports = [];
  const res = await backfillTenantId({
    batchSize: 10,
    targetTenantId: defaultTenant._id,
    onProgress: (report) => reports.push(report),
  });

  // The checkpoint is counted towards the total: batches 2 and 3 of the whole run.
  assert.deepEqual(reports.map(r => r.processed), [20, 25]);
  assert.equal(res.collections.users.updated, 25);
  assert.equal(res.collections.users.status, 'completed');
  assert.equal(await User.collection.countDocuments({ tenantId: defaultTenant._id }), 25);
  assert.equal(await unassigned('users'), 0);

  const rerunReports = [];
  const rerun = await backfillTenantId({
    batchSize: 10,
    targetTenantId: defaultTenant._id,
    onProgress: (report) => rerunReports.push(report),
  });
  assert.equal(rerun.collections.users.updated, 25, 'a finished collection keeps its total');
  assert.deepEqual(rerunReports.filter(r => r.collection === 'users'), [], 'finished collections are not re-scanned');
});

test('backfill refuses to mark a collection complete while a document stayed unassigned', async () => {
  await Migration.deleteMany({});
  await User.collection.deleteMany({});
  const defaultTenant = await Tenant.findOne({ isDefault: true });

  await User.collection.insertMany(Array.from({ length: 15 }, (_, i) => ({
    username: `race_user_${i}`,
    email: `race_${i}@test.com`,
  })));

  let injected = false;
  await assert.rejects(
    () => backfillTenantId({
      batchSize: 10,
      targetTenantId: defaultTenant._id,
      // A legacy writer adds an older document while the batch is in flight;
      // the checkpoint has already moved past its _id.
      onProgress: () => {
        if (injected) return;
        injected = true;
        return User.collection.insertOne({
          _id: new mongoose.Types.ObjectId(Math.floor(Date.now() / 1000) - 3600),
          username: 'race_late',
          email: 'race_late@test.com',
        });
      },
    }),
    /unassigned documents remaining/,
  );

  const failed = await Migration.findOne({ name: BACKFILL_MIGRATION_NAME });
  assert.equal(failed.progress.users.status, 'in_progress', 'a failed collection is never marked completed');
  assert.equal(await unassigned('users'), 1);
});

test('backfill resolves the default tenant itself and runs as a platform job', async () => {
  await Migration.deleteMany({});
  await User.collection.deleteMany({});
  const defaultTenant = await Tenant.findOne({ isDefault: true });
  await User.collection.insertMany([{ username: 't4_user', email: 't4@test.com' }]);

  process.env.TENANCY_ENFORCEMENT = 'enforce';
  try {
    // Outside a platform run an unscoped read is rejected; the backfill must not be.
    await assert.rejects(
      () => User.countDocuments({ tenantId: null }),
      (err) => err.name === 'TenantScopeError',
    );

    const res = await backfillTenantId();

    assert.equal(res.collections.users.updated, 1);
    assert.equal(await User.collection.countDocuments({ tenantId: defaultTenant._id }), 1);
    assert.equal(await unassigned('users'), 0);
  } finally {
    process.env.TENANCY_ENFORCEMENT = 'off';
  }
});

test('backfill refuses to run and records nothing without a default tenant (G1 first)', async () => {
  await Migration.deleteMany({});
  await Tenant.deleteMany({});

  await assert.rejects(() => backfillTenantId(), /default tenant/);
  assert.equal(await Migration.countDocuments({ name: BACKFILL_MIGRATION_NAME }), 0);
});

test('the G3 migration file satisfies the runner contract', async () => {
  const found = await discoverMigrations();
  const g3 = found.find(m => m.name === BACKFILL_MIGRATION_NAME);
  assert.ok(g3, 'tenancy-002-backfill-tenant-id must be discovered');
  assert.equal(g3.version, '1.2.0');
  assert.equal(typeof g3.up, 'function');
});
