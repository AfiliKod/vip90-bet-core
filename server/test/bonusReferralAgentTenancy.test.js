import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import BonusWagering from '../src/models/BonusWagering.js';
import CasinoPromoGrant from '../src/models/CasinoPromoGrant.js';
import ReferralCommission from '../src/models/ReferralCommission.js';
import ReferralTree from '../src/models/ReferralTree.js';
import Agent from '../src/models/Agent.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { isTenantCollection } from '../src/tenancy/tenantScoped.js';
import { listTenantIndexes } from '../src/tenancy/indexRegistry.js';

// Stamping only happens when the tenantScoped plugin is active.
process.env.TENANCY_ENFORCEMENT = 'enforce';

// Own test database; never read MONGODB_URI (it may point to a real database).
const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip2_t3';
const T1 = new mongoose.Types.ObjectId();

const MODELS = { BonusWagering, CasinoPromoGrant, ReferralCommission, ReferralTree, Agent };

const EXPECTED_INDEXES = {
  BonusWagering: [
    { keys: { tenantId: 1, userId: 1, status: 1 }, options: { name: 'tenant_userId_status' } },
    { keys: { tenantId: 1, status: 1, deadline: 1 }, options: { name: 'tenant_status_deadline' } },
  ],
  CasinoPromoGrant: [
    { keys: { tenantId: 1, callId: 1 }, options: { unique: true, sparse: true, name: 'tenant_callId_uniq' } },
    { keys: { tenantId: 1, gplayId: 1 }, options: { unique: true, partialFilterExpression: { kind: 'bonusCall', status: 'pending' }, name: 'tenant_gplayId_uniq' } },
    { keys: { tenantId: 1, kind: 1, createdAt: -1 }, options: { name: 'tenant_kind_createdAt' } },
    { keys: { tenantId: 1, user: 1, createdAt: -1 }, options: { name: 'tenant_user_createdAt' } },
  ],
  ReferralCommission: [
    { keys: { tenantId: 1, referrerId: 1, status: 1, createdAt: -1 }, options: { name: 'tenant_referrerId_status_createdAt' } },
    { keys: { tenantId: 1, bettorId: 1, createdAt: -1 }, options: { name: 'tenant_bettorId_createdAt' } },
    { keys: { tenantId: 1, status: 1, createdAt: -1 }, options: { name: 'tenant_status_createdAt' } },
  ],
  ReferralTree: [
    { keys: { tenantId: 1, userId: 1 }, options: { unique: true, name: 'tenant_userId_uniq' } },
  ],
  Agent: [
    { keys: { tenantId: 1, userId: 1 }, options: { name: 'tenant_userId' } },
    { keys: { tenantId: 1, isActive: 1 }, options: { name: 'tenant_isActive' } },
  ],
};

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('Bonus, Referral and Agent collections are registered as tenant collections', () => {
  for (const c of ['bonuswagerings', 'casinopromogrants', 'referralcommissions', 'referraltrees', 'agents']) {
    assert.ok(isTenantCollection(c), `expected ${c} to be tenant collection`);
  }

  const registered = listTenantIndexes();
  for (const [modelName, specs] of Object.entries(EXPECTED_INDEXES)) {
    const model = MODELS[modelName];
    const path = model.schema.path('tenantId');
    assert.equal(path.options.immutable, true, `${modelName}: tenantId must be immutable`);
    assert.equal(path.options.required, false, `${modelName}: tenantId stays optional until İP-8`);
    // Mongoose's untouched default is null (inherit the connection setting).
    assert.equal(model.schema.options.autoIndex, null, `${modelName}: autoIndex must stay untouched`);

    // The plain tenantId index stays on the field; compound ones live in the registry.
    const schemaIndexes = model.schema.indexes();
    assert.ok(
      schemaIndexes.some(([keys]) => keys.tenantId === 1 && Object.keys(keys).length === 1),
      `${modelName}: missing the single-field tenantId index`
    );
    const schemaCompound = schemaIndexes.filter(([keys]) => keys.tenantId !== undefined && Object.keys(keys).length > 1);
    assert.deepEqual(schemaCompound, [], `${modelName}: compound indexes must not be declared on the schema`);
    assert.deepEqual(
      registered.filter(i => i.modelName === modelName).map(({ keys, options }) => ({ keys, options })),
      specs,
      `${modelName}: unexpected registry entry set`
    );
  }
});

test('ReferralCommission has currency field defaulting to TRY (K14)', async () => {
  const comm = await runWithTenant(T1, () =>
    ReferralCommission.create({
      referrerId: new mongoose.Types.ObjectId(),
      bettorId: new mongoose.Types.ObjectId(),
      level: 1,
      houseProfit: 100,
      commissionAmount: 10,
      commissionRate: 10,
      source: 'sports',
    })
  );
  assert.equal(comm.currency, 'TRY');
  assert.equal(String(comm.tenantId), String(T1));
});

test('Agent and ReferralTree stamp tenantId from ambient context', async () => {
  const uid1 = new mongoose.Types.ObjectId();
  const tree = await runWithTenant(T1, () => ReferralTree.create({ userId: uid1 }));
  assert.equal(String(tree.tenantId), String(T1));

  const uid2 = new mongoose.Types.ObjectId();
  const agent = await runWithTenant(T1, () => Agent.create({ userId: uid2 }));
  assert.equal(String(agent.tenantId), String(T1));
});
