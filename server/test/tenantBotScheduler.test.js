import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import User from '../src/models/User.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { setDefaultTenantId } from '../src/tenancy/defaultTenantId.js';
import { clientsRoom } from '../src/tenancy/tenantKeys.js';
import { setIO } from '../src/services/socketEmitter.js';
import { buildInternalHeaders } from '../src/services/internalApi.js';
import { executeBotAction, emitBotAction, runBotSchedulerForTenant } from '../src/services/bot.js';

process.env.JWT_SECRET ||= 'test_jwt_secret_ip7_bot_0123456789abcdef';
process.env.INTERNAL_API_TOKEN = 'internal-bot-token';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip7_t7';
const T1 = new mongoose.Types.ObjectId();
const ORIGINAL_MODE = process.env.TENANCY_MODE;
const ORIGINAL_FETCH = globalThis.fetch;

function fakeIO() {
  const calls = [];
  return {
    calls,
    io: { to: (room) => ({ emit: (event, payload) => calls.push({ room, event, payload }) }) },
  };
}

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
});
after(async () => {
  globalThis.fetch = ORIGINAL_FETCH;
  setIO(null);
  setDefaultTenantId(null);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (ORIGINAL_MODE === undefined) delete process.env.TENANCY_MODE;
  else process.env.TENANCY_MODE = ORIGINAL_MODE;
});
beforeEach(() => {
  process.env.TENANCY_MODE = 'single';
  setDefaultTenantId(T1);
});

describe('bot tenant attribution', () => {
  it('builds internal headers with the tenant and the configured token', () => {
    assert.deepEqual(buildInternalHeaders(T1), {
      'x-internal-tenant': String(T1),
      'x-internal-token': 'internal-bot-token',
    });
  });

  it('sends the tenant header and a JWT carrying tid on the loopback call', async () => {
    const bot = await runWithTenant(T1, () => User.create({
      username: 'bot_t1', email: 'bot_t1@test.com', password: 'x', isBot: true, tenantId: T1,
      balance: 1000,
      botProfile: {
        botType: 'casual',
        behavior: { betIntervalMinMs: 1000, betIntervalMaxMs: 2000, minBetPercent: 1, maxBetPercent: 2, riskLevel: 30 },
        limits: { maxDailyLoss: 1000, maxDailyBets: 100, minBalanceToPlay: 10 },
        currentState: 'idle',
        stats: { totalBets: 0, totalWagered: 0, totalWon: 0, lastActiveAt: null },
        nextActionAt: new Date(0),
      },
    }));
    let captured = null;
    globalThis.fetch = mock.fn(async (url, options) => {
      captured = { url, options };
      return { ok: true, json: async () => ({ payout: 0 }) };
    });
    const result = await runWithTenant(T1, () => executeBotAction(bot._id));
    assert.equal(result.executed, true);
    assert.equal(captured.options.headers['x-internal-tenant'], String(T1));
    assert.equal(captured.options.headers['x-internal-token'], 'internal-bot-token');
    const payload = jwt.decode(captured.options.headers.Authorization.replace('Bearer ', ''));
    assert.equal(String(payload.tid), String(T1));
  });

  it('publishes bot:action to the tenant clients room', async () => {
    const { io, calls } = fakeIO();
    setIO(io);
    emitBotAction({ _id: new mongoose.Types.ObjectId(), username: 'bot_t1', tenantId: T1 }, { betAmount: 10 });
    assert.equal(calls[0].room, clientsRoom(T1));
    assert.equal(calls[0].event, 'bot:action');
  });

  it('does not run the scheduler in multi mode', async () => {
    process.env.TENANCY_MODE = 'multi';
    const results = await runBotSchedulerForTenant({ tenantId: T1 });
    assert.deepEqual(results, []);
  });
});
