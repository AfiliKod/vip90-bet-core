import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Domain from '../src/models/Domain.js';
import Transaction from '../src/models/Transaction.js';
import CryptoDeposit from '../src/models/CryptoDeposit.js';
import InhouseCallbackReceipt from '../src/models/InhouseCallbackReceipt.js';
import ChatRoom from '../src/models/ChatRoom.js';
import VipLevel from '../src/models/VipLevel.js';
import { buildCompoundIndexes, loadAllModels } from '../src/tenancy/indexBuilder.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip2_t9_unique_indexes';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();
const savedEnforcement = process.env.TENANCY_ENFORCEMENT;

// Generated from Model.schema.indexes() and checked against origin/main. New
// Tenant and Domain models are deliberately absent because they did not exist
// on origin/main; tenant compound indexes live in indexRegistry, not schemas.
const LEGACY_UNIQUE_INDEXES = {
  Agent: [{ keys: { userId: 1 }, options: { unique: true, background: true } }],
  Brand: [{ keys: { slug: 1 }, options: { unique: true, background: true } }],
  CasinoPromoGrant: [
    { keys: { callId: 1 }, options: { unique: true, sparse: true, background: true } },
    { keys: { gplayId: 1 }, options: { unique: true, partialFilterExpression: { kind: 'bonusCall', status: 'pending' }, background: true } },
  ],
  ChatRain: [{ keys: { requestId: 1 }, options: { unique: true, sparse: true, background: true } }],
  ChatRoom: [
    { keys: { name: 1 }, options: { unique: true, background: true } },
    { keys: { slug: 1 }, options: { unique: true, background: true } },
  ],
  ChatTip: [{ keys: { requestId: 1 }, options: { unique: true, sparse: true, background: true } }],
  CryptoDeposit: [{ keys: { txHash: 1 }, options: { unique: true, background: true } }],
  Currency: [{ keys: { code: 1 }, options: { unique: true, background: true } }],
  Event: [{ keys: { externalId: 1 }, options: { unique: true, sparse: true, background: true } }],
  GameSettings: [
    { keys: { gameId: 1 }, options: { name: 'gameId_legacy_unique', unique: true, partialFilterExpression: { operatorId: null }, background: true } },
    { keys: { operatorId: 1, gameId: 1 }, options: { name: 'operatorId_gameId_unique', unique: true, partialFilterExpression: { operatorId: { $type: 'objectId' } }, background: true } },
  ],
  InhouseCallbackReceipt: [{ keys: { txnId: 1 }, options: { unique: true, background: true } }],
  Jurisdiction: [{ keys: { code: 1 }, options: { unique: true, background: true } }],
  Migration: [{ keys: { name: 1 }, options: { unique: true, background: true } }],
  Permission: [{ keys: { key: 1 }, options: { unique: true, background: true } }],
  PlayerSegment: [{ keys: { slug: 1 }, options: { unique: true, background: true } }],
  ReferralTree: [{ keys: { userId: 1 }, options: { unique: true, background: true } }],
  RiskProfile: [{ keys: { playerId: 1 }, options: { unique: true, background: true } }],
  RiskRule: [{ keys: { name: 1 }, options: { unique: true, background: true } }],
  // İP-3 adds the scoped compound unique (spec §5.2). It is a superset of the legacy
  // name_1 key, so it can never fail on existing single-mode data. Reviewed 2026-11-12.
  // New platform models in İP-3/İP-5 (no legacy data). Reviewed 2026-11-12.
  TenantDailyStat: [{ keys: { tenantId: 1, brandId: 1, date: 1, currency: 1 }, options: { unique: true, background: true } }],
  StaffAccount: [{ keys: { email: 1 }, options: { unique: true, background: true } }],
  // İP-9b platform model (no legacy data). Reviewed 2026-11-13.
  Partner: [{ keys: { key: 1 }, options: { unique: true, background: true } }],
  RoleAssignment: [{ keys: { staffId: 1, roleId: 1, scopeType: 1, scopeId: 1 }, options: { unique: true, background: true } }],
  Role: [
    { keys: { name: 1 }, options: { unique: true, background: true } },
    { keys: { scopeType: 1, scopeId: 1, name: 1 }, options: { unique: true, background: true } },
  ],
  Setting: [{ keys: { key: 1 }, options: { unique: true, background: true } }],
  SlikairPayment: [{ keys: { requestId: 1 }, options: { unique: true, background: true } }],
  SmsTemplate: [{ keys: { key: 1 }, options: { unique: true, background: true } }],
  StaticPage: [{ keys: { slug: 1 }, options: { unique: true, background: true } }],
  SystemMailTemplate: [{ keys: { event: 1 }, options: { unique: true, background: true } }],
  Transaction: [{ keys: { idempotencyKey: 1 }, options: { unique: true, sparse: true, background: true } }],
  User: [
    { keys: { username: 1 }, options: { unique: true, background: true } },
    { keys: { email: 1 }, options: { unique: true, background: true } },
    { keys: { googleId: 1 }, options: { sparse: true, unique: true, background: true } },
    { keys: { telegramId: 1 }, options: { sparse: true, unique: true, background: true } },
    { keys: { walletAddress: 1 }, options: { unique: true, sparse: true, background: true } },
    { keys: { phone: 1 }, options: { unique: true, partialFilterExpression: { phone: { $type: 'string' } }, background: true } },
  ],
  VipLevel: [{ keys: { level: 1 }, options: { unique: true, background: true } }],
};

function schemaUniqueIndexes(model) {
  return model.schema.indexes()
    .filter(([, options]) => options.unique)
    .map(([keys, options]) => ({ keys, options }));
}

before(async () => {
  process.env.TENANCY_ENFORCEMENT = 'off';
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  await Promise.all([
    User.init(),
    Domain.init(),
    Transaction.init(),
    CryptoDeposit.init(),
    InhouseCallbackReceipt.init(),
    ChatRoom.init(),
    VipLevel.init(),
  ]);
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (savedEnforcement === undefined) delete process.env.TENANCY_ENFORCEMENT;
  else process.env.TENANCY_ENFORCEMENT = savedEnforcement;
});

test('legacy unique indexes are unchanged', async () => {
  await loadAllModels();
  const files = (await readdir(new URL('../src/models/', import.meta.url)))
    .filter((file) => file.endsWith('.js'));

  for (const file of files) {
    const module = await import(new URL(`../src/models/${file}`, import.meta.url));
    const models = Object.values(module).filter((value) => value?.schema && value?.modelName);
    assert.ok(models.length > 0, `${file} must export at least one Mongoose model`);
    for (const model of models) {
      if (model.modelName === 'Tenant' || model.modelName === 'Domain') continue;
      assert.deepEqual(
        schemaUniqueIndexes(model),
        LEGACY_UNIQUE_INDEXES[model.modelName] ?? [],
        `${model.modelName}: legacy unique indexes changed`,
      );
    }
  }
});

test('§8.2: compound indexes are built without syncIndexes', async () => {
  const originalSyncIndexes = mongoose.Model.syncIndexes;
  mongoose.Model.syncIndexes = async () => {
    throw new Error('syncIndexes must not be called by G4');
  };
  try {
    const result = await buildCompoundIndexes({ background: false });
    assert.ok(result.created.length > 0);
  } finally {
    mongoose.Model.syncIndexes = originalSyncIndexes;
  }

  const userIndexes = await User.collection.listIndexes().toArray();
  assert.ok(userIndexes.some((index) => index.name === 'username_1'));
  assert.ok(userIndexes.some((index) => index.name === 'tenant_username_uniq'));
});

test('§8.2: legacy global User uniques remain active alongside compound uniques', async () => {
  await User.create({ tenantId: T1, username: 'shared_player', email: 'shared@test.com', password: 'password123' });
  await assert.rejects(
    () => User.create({ tenantId: T2, username: 'shared_player', email: 'other@test.com', password: 'password123' }),
    /E11000/,
  );
  await assert.rejects(
    () => User.create({ tenantId: T2, username: 'other_player', email: 'shared@test.com', password: 'password123' }),
    /E11000/,
  );
});

test('§8.2: ChatRoom and VipLevel legacy global uniques remain active across tenants', async () => {
  await ChatRoom.create({ tenantId: T1, name: 'VIP Lounge', slug: 'vip-lounge' });
  await assert.rejects(
    () => ChatRoom.create({ tenantId: T2, name: 'VIP Lounge Two', slug: 'vip-lounge' }),
    /E11000/,
  );

  await VipLevel.create({ tenantId: T1, level: 5, name: 'Gold', xpRequired: 5000 });
  await assert.rejects(
    () => VipLevel.create({ tenantId: T2, level: 5, name: 'Gold', xpRequired: 5000 }),
    /E11000/,
  );
});

test('§8.2: Domain.host, Transaction.idempotencyKey, CryptoDeposit.txHash and InhouseCallbackReceipt.txnId remain globally unique', async () => {
  await Domain.create({ host: 'app.vip90.bet', tenantId: T1 });
  await assert.rejects(() => Domain.create({ host: 'app.vip90.bet', tenantId: T2 }), /E11000/);

  const transaction = {
    userId: new mongoose.Types.ObjectId(),
    type: 'deposit',
    amount: 100,
    balanceBefore: 0,
    balanceAfter: 100,
    idempotencyKey: 'idemp_unique_key_1',
  };
  await Transaction.create({ ...transaction, tenantId: T1 });
  await assert.rejects(() => Transaction.create({ ...transaction, tenantId: T2 }), /E11000/);

  const cryptoDeposit = {
    userId: new mongoose.Types.ObjectId(),
    txHash: '0xunique_crypto_hash',
    toAddress: '0xrecipient',
    usdtAmount: 10,
    creditedTRY: 350,
  };
  await CryptoDeposit.create({ ...cryptoDeposit, tenantId: T1 });
  await assert.rejects(() => CryptoDeposit.create({ ...cryptoDeposit, tenantId: T2 }), /E11000/);

  const receipt = {
    txnId: 'provider-transaction-1',
    direction: 'debit',
    operatorGameId: 'crash',
    externalPlayerId: 'player-1',
    approved: true,
    responsePayload: { balance: 100 },
  };
  await InhouseCallbackReceipt.create({ ...receipt, tenantId: T1 });
  await assert.rejects(() => InhouseCallbackReceipt.create({ ...receipt, tenantId: T2 }), /E11000/);
});
