import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Transaction from '../src/models/Transaction.js';
import Bet from '../src/models/Bet.js';
import CasinoRound from '../src/models/CasinoRound.js';
import TenantDailyStat from '../src/models/TenantDailyStat.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { aggregateTenantDailyStat, getPartnerDailyMetrics } from '../src/services/tenantDailyStat.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9d_t2';
const T1 = new mongoose.Types.ObjectId();
const TODAY = '2026-11-12';

const savedMode = process.env.TENANCY_MODE;
before(async () => {
  // Cross-tenant isolation is a multi-mode property (tenantFilter adds the tenant there only).
  process.env.TENANCY_MODE = 'multi';
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  await Promise.all([
    User.createIndexes(),
    TenantDailyStat.createIndexes(),
    Transaction.createIndexes(),
    Bet.createIndexes(),
    CasinoRound.createIndexes(),
  ]);

  // Create real players
  const p1 = await runWithTenant(T1, () => User.create({ username: 'real_p1', email: 'p1@stat.test', password: 'test-password', createdAt: new Date('2026-11-12T01:00:00Z') }));
  const p2 = await runWithTenant(T1, () => User.create({ username: 'real_p2', email: 'p2@stat.test', password: 'test-password', createdAt: new Date('2026-11-12T02:00:00Z') }));
  // Create bot and seed players (must be excluded)
  const bot = await runWithTenant(T1, () => User.create({ username: 'bot_1', email: 'bot1@stat.test', password: 'test-password', isBot: true, createdAt: new Date('2026-11-12T03:00:00Z') }));
  const seed = await runWithTenant(T1, () => User.create({ username: 'seed_1', email: 'seed1@stat.test', password: 'test-password', isSeed: true, createdAt: new Date('2026-11-12T04:00:00Z') }));

  // Real deposits
  await runWithTenant(T1, () => Transaction.create({
    userId: p1._id,
    type: 'deposit',
    amount: 100,
    balanceBefore: 0,
    balanceAfter: 100,
    status: 'completed',
    currency: 'TRY',
    createdAt: new Date('2026-11-12T05:00:00Z'),
  }));
  // Bot deposit (must be excluded)
  await runWithTenant(T1, () => Transaction.create({
    userId: bot._id,
    type: 'deposit',
    amount: 9999,
    balanceBefore: 0,
    balanceAfter: 9999,
    status: 'completed',
    currency: 'TRY',
    createdAt: new Date('2026-11-12T05:30:00Z'),
  }));

  // Real casino rounds
  await runWithTenant(T1, () => CasinoRound.create({
    userId: p1._id,
    gameId: 'test-game',
    bet: 50,
    payout: 20,
    net: -30,
    balanceBefore: 100,
    balanceAfter: 70,
    currency: 'TRY',
    createdAt: new Date('2026-11-12T06:00:00Z'),
  }));
  // Seed casino round (must be excluded)
  await runWithTenant(T1, () => CasinoRound.create({
    userId: seed._id,
    gameId: 'test-game',
    bet: 500,
    payout: 200,
    net: -300,
    balanceBefore: 500,
    balanceAfter: 200,
    isSeed: true,
    currency: 'TRY',
    createdAt: new Date('2026-11-12T06:30:00Z'),
  }));
});

after(async () => {
  if (savedMode === undefined) delete process.env.TENANCY_MODE; else process.env.TENANCY_MODE = savedMode;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('aggregateTenantDailyStat computes correct figures and excludes bots/seeds', async () => {
  const stat = await aggregateTenantDailyStat(T1, TODAY, { currency: 'TRY' });
  assert.equal(stat.date, TODAY);
  assert.equal(stat.currency, 'TRY');
  assert.equal(stat.deposits, 100);
  assert.equal(stat.casinoTurnover, 50);
  assert.equal(stat.casinoGgr, 30);
  assert.equal(stat.newPlayers, 2); // p1 and p2 only
});

test('partner view applies small-cell suppression for activePlayers < 5 and excludes PII', async () => {
  const rows = await getPartnerDailyMetrics({ tenantId: T1, from: TODAY, to: TODAY });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].activePlayers, '<5');
  assert.equal(rows[0].deposits, 100);
  assert.equal(rows[0].email, undefined);
  assert.equal(rows[0].username, undefined);
});

test('aggregateTenantDailyStat sets chargebacks and providerFees to 0 and does not derive chargebacks from reversals or refunds', async () => {
  const T2 = new mongoose.Types.ObjectId();
  const U2 = new mongoose.Types.ObjectId();
  const DAY = '2026-11-15';
  const start = new Date(`${DAY}T10:00:00.000Z`);

  await runWithTenant(T2, () => User.create({
    _id: U2,
    username: 'player_reversal_test',
    email: 'player_reversal@stat.example.com',
    password: 'test-password',
  }));

  // Reversal transaction (e.g. deposit reversal or bet reversal)
  await runWithTenant(T2, () => Transaction.create({
    userId: U2,
    type: 'reversal',
    amount: -200,
    balanceBefore: 500,
    balanceAfter: 300,
    currency: 'TRY',
    status: 'completed',
    createdAt: start,
  }));

  // Refund transaction (failed payout returned to player wallet)
  await runWithTenant(T2, () => Transaction.create({
    userId: U2,
    type: 'refund',
    amount: -50,
    balanceBefore: 300,
    balanceAfter: 250,
    currency: 'TRY',
    status: 'completed',
    createdAt: start,
  }));

  const stat = await aggregateTenantDailyStat(T2, DAY, { currency: 'TRY' });
  // Per Reviewer Correction (2026-11-13, K28): reversals and refunds are not chargebacks; leaves chargebacks at 0
  assert.equal(stat.chargebacks, 0);
  assert.equal(stat.providerFees, 0);

  // Verify partner view includes chargebacks and providerFees (both 0)
  const rows = await getPartnerDailyMetrics({ tenantId: T2, from: DAY, to: DAY });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].chargebacks, 0);
  assert.equal(rows[0].providerFees, 0);
});

test('aggregateTenantDailyStat uses completed chargeback transactions only', async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const day = '2026-11-16';
  const createdAt = new Date(`${day}T10:00:00.000Z`);
  await runWithTenant(tenantId, () => User.create({
    _id: userId, username: 'chargeback_stat_player', email: 'chargeback-stat@example.com', password: 'test-password',
  }));
  for (const [type, amount] of [['chargeback', -125], ['chargeback', -75], ['deposit_refund', -80], ['refund', 80], ['reversal', -50]]) {
    await runWithTenant(tenantId, () => Transaction.create({
      userId, type, amount, balanceBefore: 0, balanceAfter: 0, currency: 'TRY', status: 'completed', createdAt,
    }));
  }
  await runWithTenant(tenantId, () => Transaction.create({
    userId, type: 'chargeback', amount: -999, balanceBefore: 0, balanceAfter: 0, currency: 'TRY', status: 'failed', createdAt,
  }));

  const stat = await aggregateTenantDailyStat(tenantId, day, { currency: 'TRY' });
  assert.equal(stat.chargebacks, 200);
  assert.equal(stat.chargebackCount, 2);
});
