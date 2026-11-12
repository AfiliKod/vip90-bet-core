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

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip5_t8_daily_stats';
const T1 = new mongoose.Types.ObjectId();
const TODAY = '2026-11-12';

const savedMode = process.env.TENANCY_MODE;
before(async () => {
  // Cross-tenant isolation is a multi-mode property (tenantFilter adds the tenant there only).
  process.env.TENANCY_MODE = 'multi';
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

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