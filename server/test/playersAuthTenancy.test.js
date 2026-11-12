import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import LoginAttempt from '../src/models/LoginAttempt.js';
import KycDocument from '../src/models/KycDocument.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { listTenantIndexes } from '../src/tenancy/indexRegistry.js';
import { isTenantCollection } from '../src/tenancy/tenantScoped.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip2_t1';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();
const savedEnforcement = process.env.TENANCY_ENFORCEMENT;

before(async () => {
  process.env.TENANCY_ENFORCEMENT = 'log';
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (savedEnforcement === undefined) delete process.env.TENANCY_ENFORCEMENT;
  else process.env.TENANCY_ENFORCEMENT = savedEnforcement;
});

test('Players & Auth models are registered as tenant collections', () => {
  assert.ok(isTenantCollection('users'));
  assert.ok(isTenantCollection('loginattempts'));
  assert.ok(isTenantCollection('kycdocuments'));
});

test('User schema has tenantId with immutable property and registered compound indexes', () => {
  const path = User.schema.path('tenantId');
  assert.ok(path);
  assert.equal(path.options.immutable, true);
  assert.equal(path.options.required, false);
  assert.equal(User.schema.options.autoIndex, null);
  for (const Model of [User, LoginAttempt, KycDocument]) {
    assert.equal(Model.schema.indexes().some(([keys]) => 'tenantId' in keys && Object.keys(keys).length > 1), false);
  }

  const indexes = listTenantIndexes().filter(({ modelName }) => modelName === 'User');
  assert.deepEqual(indexes.map(({ keys, options }) => ({ keys, options })), [
    { keys: { tenantId: 1, username: 1 }, options: { unique: true, name: 'tenant_username_uniq' } },
    { keys: { tenantId: 1, email: 1 }, options: { unique: true, name: 'tenant_email_uniq' } },
    { keys: { tenantId: 1, walletAddress: 1 }, options: { unique: true, partialFilterExpression: { walletAddress: { $type: 'string' } }, name: 'tenant_walletAddress_uniq' } },
    { keys: { tenantId: 1, phone: 1 }, options: { unique: true, partialFilterExpression: { phone: { $type: 'string' } }, name: 'tenant_phone_uniq' } },
    { keys: { tenantId: 1, googleId: 1 }, options: { unique: true, partialFilterExpression: { googleId: { $type: 'string' } }, name: 'tenant_googleId_uniq' } },
    { keys: { tenantId: 1, telegramId: 1 }, options: { unique: true, partialFilterExpression: { telegramId: { $type: 'string' } }, name: 'tenant_telegramId_uniq' } },
    { keys: { tenantId: 1, palaceUserCode: 1 }, options: { unique: true, partialFilterExpression: { palaceUserCode: { $type: 'string' } }, name: 'tenant_palaceUserCode_uniq' } },
    { keys: { tenantId: 1, createdAt: -1 }, options: { name: 'tenant_createdAt' } },
    { keys: { tenantId: 1, lastLoginAt: -1 }, options: { name: 'tenant_lastLoginAt' } },
    { keys: { tenantId: 1, isBot: 1, 'botProfile.currentState': 1 }, options: { name: 'tenant_isBot_botProfile_currentState' } },
    { keys: { tenantId: 1, cryptoDepositIndex: 1 }, options: { name: 'tenant_cryptoDepositIndex' } },
  ]);
  assert.deepEqual(
    listTenantIndexes().filter(({ modelName }) => modelName === 'LoginAttempt').map(({ keys, options }) => ({ keys, options })),
    [
      { keys: { tenantId: 1, username: 1, ip: 1 }, options: { name: 'tenant_username_ip' } },
      { keys: { tenantId: 1, createdAt: -1 }, options: { name: 'tenant_createdAt' } },
      { keys: { tenantId: 1, userId: 1, createdAt: -1 }, options: { name: 'tenant_userId_createdAt' } },
    ]
  );
  assert.deepEqual(
    listTenantIndexes().filter(({ modelName }) => modelName === 'KycDocument').map(({ keys, options }) => ({ keys, options })),
    [
      { keys: { tenantId: 1, userId: 1, documentType: 1 }, options: { name: 'tenant_userId_documentType' } },
      { keys: { tenantId: 1, userId: 1, status: 1 }, options: { name: 'tenant_userId_status' } },
      { keys: { tenantId: 1, status: 1, createdAt: -1 }, options: { name: 'tenant_status_createdAt' } },
    ]
  );
});

test('stamps tenantId from ambient context on User creation', async () => {
  const user = await runWithTenant(T1, () =>
    User.create({ username: 'player_t1', email: 'p1@test.com', password: 'password123' })
  );
  assert.equal(String(user.tenantId), String(T1));
  user.tenantId = T2;
  assert.equal(String(user.tenantId), String(T1));
});

test('LoginAttempt and KycDocument stamp tenantId from ambient context', async () => {
  const login = await runWithTenant(T1, () =>
    LoginAttempt.create({ username: 'player_t1', success: true })
  );
  assert.equal(String(login.tenantId), String(T1));

  const kyc = await runWithTenant(T1, () =>
    KycDocument.create({
      userId: new mongoose.Types.ObjectId(),
      documentType: 'passport',
      fileName: 'pass.jpg',
      fileSize: 1024,
      mimeType: 'image/jpeg',
    })
  );
  assert.equal(String(kyc.tenantId), String(T1));
});

test('optional unique User identifiers use partial filters, never sparse (compound sparse indexes null fields)', async () => {
  const { listTenantIndexes } = await import('../src/tenancy/indexRegistry.js');
  await import('../src/models/User.js');
  const user = listTenantIndexes().filter((i) => i.modelName === 'User' && i.options.unique);
  for (const f of ['walletAddress', 'googleId', 'telegramId', 'palaceUserCode', 'phone']) {
    const idx = user.find((i) => i.options.name === `tenant_${f}_uniq`);
    assert.ok(idx, f);
    assert.equal(idx.options.sparse, undefined, f);
    assert.deepEqual(idx.options.partialFilterExpression, { [f]: { $type: 'string' } }, f);
  }
});
