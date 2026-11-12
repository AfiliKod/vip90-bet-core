import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import Transaction from '../../src/models/Transaction.js';
import transactionsRoutes from '../../src/routes/transactions.js';
import { errorHandler } from '../../src/middleware/error.js';
import { isDemoInstantDepositEnabled, isMultiTenancyMode } from '../../src/config/demoFlags.js';
import { runAsPlatform } from '../../src/tenancy/context.js';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/betzone_test_v4_demo?replicaSet=rs0';
process.env.JWT_SECRET ||= 'v4-demo-deposit-test-secret';

describe('V4 demo instant deposit flag (pure logic)', () => {
  it('is off by default and for anything but "true"', () => {
    assert.equal(isDemoInstantDepositEnabled({}), false);
    assert.equal(isDemoInstantDepositEnabled({ DEMO_INSTANT_DEPOSIT: 'false' }), false);
    assert.equal(isDemoInstantDepositEnabled({ DEMO_INSTANT_DEPOSIT: '1' }), false);
  });
  it('is on when explicitly true in single mode', () => {
    assert.equal(isDemoInstantDepositEnabled({ DEMO_INSTANT_DEPOSIT: 'true' }), true);
    assert.equal(isDemoInstantDepositEnabled({ DEMO_INSTANT_DEPOSIT: 'TRUE', TENANCY_MODE: 'single' }), true);
  });
  it('is forced off in multi tenancy mode', () => {
    assert.equal(isMultiTenancyMode({ TENANCY_MODE: 'Multi' }), true);
    assert.equal(isMultiTenancyMode({}), false);
    assert.equal(isDemoInstantDepositEnabled({ DEMO_INSTANT_DEPOSIT: 'true', TENANCY_MODE: 'multi' }), false);
  });
});

describe('V4 POST /api/transactions/deposit (HTTP)', () => {
  let server, base, user, skip = false;
  const saved = { d: process.env.DEMO_INSTANT_DEPOSIT, t: process.env.TENANCY_MODE };

  before(async () => {
    try {
      await mongoose.connect(URI, { serverSelectionTimeoutMS: 3000 });
    } catch { skip = true; return; }
    const app = express();
    app.use(express.json());
    app.use('/api/transactions', transactionsRoutes);
    app.use(errorHandler);
    await new Promise((r) => { server = app.listen(0, r); });
    base = `http://127.0.0.1:${server.address().port}`;
    user = await User.create({ username: `v4_${Date.now()}`, email: `v4_${Date.now()}@test.example`, password: 'pass12345', balance: 0 });
  });

  after(async () => {
    for (const [k, v] of [['DEMO_INSTANT_DEPOSIT', saved.d], ['TENANCY_MODE', saved.t]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    if (server) await new Promise((r) => server.close(r));
    if (!skip) {
      await Transaction.deleteMany({ userId: user._id });
      await User.deleteOne({ _id: user._id });
      await mongoose.disconnect();
    }
  });

  const post = async () => {
    const r = await fetch(`${base}/api/transactions/deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ id: String(user._id), role: 'user', tokenVersion: user.tokenVersion ?? 0 }, process.env.JWT_SECRET)}` },
      body: JSON.stringify({ amount: 100 }),
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };

  it('flag unset -> 404 DEMO_FEATURE_DISABLED, no balance change, no transaction', { skip: false }, async (t) => {
    if (skip) return t.skip('no MongoDB');
    delete process.env.DEMO_INSTANT_DEPOSIT; delete process.env.TENANCY_MODE;
    const before = await Transaction.countDocuments({ userId: user._id });
    const r = await post();
    assert.equal(r.status, 404);
    assert.equal(r.body.error.code, 'DEMO_FEATURE_DISABLED');
    // Multi mode enforces tenant scope on User (İP-2): the test's own check reads as platform.
    const after = await runAsPlatform('test: verify balance', () => User.findById(user._id).lean());
    assert.equal(after.balance, 0);
    assert.equal(await Transaction.countDocuments({ userId: user._id }), before);
  });

  it('TENANCY_MODE=multi with the flag on -> 404', async (t) => {
    if (skip) return t.skip('no MongoDB');
    process.env.DEMO_INSTANT_DEPOSIT = 'true'; process.env.TENANCY_MODE = 'multi';
    const r = await post();
    assert.equal(r.status, 404);
    assert.equal(r.body.error.code, 'DEMO_FEATURE_DISABLED');
    // Multi mode enforces tenant scope on User (İP-2): the test's own check reads as platform.
    const after = await runAsPlatform('test: verify balance', () => User.findById(user._id).lean());
    assert.equal(after.balance, 0);
  });

  it('DEMO_INSTANT_DEPOSIT=true (single) -> 200 and balance grows', async (t) => {
    if (skip) return t.skip('no MongoDB');
    process.env.DEMO_INSTANT_DEPOSIT = 'true'; delete process.env.TENANCY_MODE;
    const r = await post();
    assert.equal(r.status, 200);
    assert.equal((await User.findById(user._id).lean()).balance, 100);
    assert.equal(await Transaction.countDocuments({ userId: user._id, type: 'deposit' }), 1);
  });
});
