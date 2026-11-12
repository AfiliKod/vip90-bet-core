import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import { buildCompoundIndexes, INDEX_MIGRATION_NAME } from '../src/tenancy/indexBuilder.js';
import migration from '../migrations/0006_tenancy_compound_indexes.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip2_t8';

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('INDEX_MIGRATION_NAME constant is tenancy-003-compound-indexes', () => {
  assert.equal(INDEX_MIGRATION_NAME, 'tenancy-003-compound-indexes');
});

test('0006_tenancy_compound_indexes satisfies migration contract', () => {
  assert.equal(migration.name, 'tenancy-003-compound-indexes');
  assert.equal(migration.version, '1.2.0');
  assert.equal(typeof migration.up, 'function');
});

test('buildCompoundIndexes creates compound indexes while keeping legacy indexes', async () => {
  // Simulate legacy global index
  await User.collection.createIndex({ username: 1 }, { unique: true, name: 'username_1' });

  const res = await buildCompoundIndexes();
  assert.ok(res.created.length > 0);

  const indexes = await User.collection.listIndexes().toArray();
  const indexNames = indexes.map(i => i.name);

  // Both legacy global unique and new compound unique exist simultaneously
  assert.ok(indexNames.includes('username_1'), 'legacy username_1 index must be preserved');
  assert.ok(
    indexNames.includes('tenant_username_uniq') || indexNames.some(n => n.includes('tenantId_1_username_1')),
    'new compound index must exist'
  );
});

test('buildCompoundIndexes is idempotent: subsequent runs preserve existing compound indexes', async () => {
  const rerun = await buildCompoundIndexes();
  assert.equal(rerun.created.length, 0);
  assert.ok(rerun.preserved.length > 0);

  const indexes = await User.collection.listIndexes().toArray();
  const indexNames = indexes.map(i => i.name);
  assert.ok(indexNames.includes('username_1'), 'legacy username_1 index remains preserved');
  assert.ok(
    indexNames.includes('tenant_username_uniq') || indexNames.some(n => n.includes('tenantId_1_username_1')),
    'compound index remains present'
  );
});

test('migration up() executes buildCompoundIndexes successfully', async () => {
  await migration.up();
  const indexes = await User.collection.listIndexes().toArray();
  assert.ok(indexes.map(i => i.name).includes('tenant_username_uniq'));
});

test('loadAllModels registers the tenant indexes of every model file', async () => {
  const { loadAllModels } = await import('../src/tenancy/indexBuilder.js');
  const { listTenantIndexes } = await import('../src/tenancy/indexRegistry.js');
  const n = await loadAllModels();
  assert.ok(n > 20);
  const models = new Set(listTenantIndexes().map((i) => i.modelName));
  for (const m of ['User', 'Transaction', 'Bet', 'ChatRoom', 'RiskRule']) assert.ok(models.has(m), m);
});
