import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Promotion from '../src/models/Promotion.js';
import PlayerSegment from '../src/models/PlayerSegment.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { claim, list as listPromotions } from '../src/controllers/promotions.js';
import { getSegmentById, updateSegment, deleteSegment } from '../src/controllers/playerSegment.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip5_t3_promo_segment';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

let u2, promoT1, segmentT1;

const savedMode = process.env.TENANCY_MODE;
before(async () => {
  // Cross-tenant isolation is a multi-mode property (scopeTenantId is null in single mode).
  process.env.TENANCY_MODE = 'multi';
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  u2 = await runWithTenant(T2, () => User.create({
    username: 'player2_t2',
    email: 'p2@t2.test',
    password: 'pass',
    balance: 0,
  }));

  promoT1 = await runWithTenant(T1, () => Promotion.create({
    type: 'welcome',
    title: 'T1 Welcome Bonus',
    amount: 100,
    isActive: true,
    wageringMultiplier: 30,
    claimedBy: [],
  }));

  segmentT1 = await runWithTenant(T1, () => PlayerSegment.create({
    name: 'T1 VIPs',
    slug: 't1-vips',
    rules: { minDeposit: 1000 },
  }));
});

after(async () => {
  if (savedMode === undefined) delete process.env.TENANCY_MODE; else process.env.TENANCY_MODE = savedMode;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('T2 player claiming T1 promotion receives 404', async () => {
  const req = {
    params: { id: String(promoT1._id) },
    user: { id: String(u2._id) },
    tenant: { id: T2 },
    validated: { acceptedBonusTerms: true },
  };
  const res = { json: () => assert.fail('should not succeed') };

  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => claim(req, res, (err) => { throw err; }),
      (err) => err.status === 404
    );
  });
});

test('T2 staff accessing T1 player segment by id receives 404', async () => {
  const req = {
    params: { id: String(segmentT1._id) },
    tenant: { id: T2 },
    body: { name: 'Attempted Update' },
  };
  const res = { json: () => assert.fail('should not succeed') };

  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => getSegmentById(req, res, (err) => { throw err; }),
      (err) => err.status === 404
    );
    await assert.rejects(
      async () => updateSegment(req, res, (err) => { throw err; }),
      (err) => err.status === 404
    );
    await assert.rejects(
      async () => deleteSegment(req, res, (err) => { throw err; }),
      (err) => err.status === 404
    );
  });
});
