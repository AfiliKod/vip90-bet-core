import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import SystemMailTemplate from '../src/models/SystemMailTemplate.js';
import CasinoRound from '../src/models/CasinoRound.js';
import User from '../src/models/User.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { getTemplateByEvent, invalidateMailTemplateCache, _clearMailTemplateCache } from '../src/services/mailTemplates.js';
import { getPopularGames, _clearCasinoStatsCache } from '../src/services/casinoStatsService.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://localhost:27017/vip90_test_ip7_t8';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();
const U1 = new mongoose.Types.ObjectId();
const U2 = new mongoose.Types.ObjectId();

// The plan's fixtures omit required model fields; fill them in without
// touching any assertion. Casino rounds are inserted raw so their post-save
// side effects (wagering, VIP, activity) never run in this cache test.
const mail = (tenantId, subject) => ({
  event: 'user.welcome', category: 'action', name: subject, subject, body: subject, tenantId,
});
const round = (tenantId, userId, gameId) => ({
  tenantId, userId, provider: 'igames', gameId, bet: 10, net: -10,
  balanceBefore: 100, balanceAfter: 90, createdAt: new Date(),
});

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
beforeEach(async () => {
  await SystemMailTemplate.deleteMany({});
  await CasinoRound.deleteMany({});
  await User.deleteMany({});
  invalidateMailTemplateCache(null);
  _clearMailTemplateCache();
  _clearCasinoStatsCache();
});

describe('tenant-scoped caches', () => {
  it('caches mail templates per tenant', async () => {
    await SystemMailTemplate.create([
      mail(T1, 'T1'),
      mail(T2, 'T2'),
    ]);
    const t1 = await runWithTenant(T1, () => getTemplateByEvent('user.welcome'));
    const t2 = await runWithTenant(T2, () => getTemplateByEvent('user.welcome'));
    assert.equal(t1.subject, 'T1');
    assert.equal(t2.subject, 'T2');
  });

  it('invalidating one tenant does not drop the other tenant cache entry', async () => {
    await SystemMailTemplate.create([
      mail(T1, 'T1a'),
      mail(T2, 'T2a'),
    ]);
    await runWithTenant(T1, () => getTemplateByEvent('user.welcome'));
    await runWithTenant(T2, () => getTemplateByEvent('user.welcome'));
    await runWithTenant(T1, () => invalidateMailTemplateCache('user.welcome'));
    await SystemMailTemplate.updateOne({ tenantId: T1, event: 'user.welcome' }, { $set: { subject: 'T1b' } });
    assert.equal((await runWithTenant(T1, () => getTemplateByEvent('user.welcome'))).subject, 'T1b');
    assert.equal((await runWithTenant(T2, () => getTemplateByEvent('user.welcome'))).subject, 'T2a');
  });

  it('aggregates popular games per tenant and caches separately', async () => {
    await CasinoRound.collection.insertMany([
      round(T1, U1, 't1-game'),
      round(T2, U2, 't2-game'),
    ]);
    const t1 = await runWithTenant(T1, () => getPopularGames(15));
    const t2 = await runWithTenant(T2, () => getPopularGames(15));
    assert.deepEqual(t1.map((g) => g.game_code), ['t1-game']);
    assert.deepEqual(t2.map((g) => g.game_code), ['t2-game']);
    await CasinoRound.collection.insertOne(round(T1, U1, 't1-extra'));
    assert.equal((await runWithTenant(T1, () => getPopularGames(15))).length, 1, 'second read is served from the tenant cache');
  });
});
