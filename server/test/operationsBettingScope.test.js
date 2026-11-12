import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Event from '../src/models/Event.js';
import Bet from '../src/models/Bet.js';
import { ReconciliationJob } from '../src/models/Reconciliation.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { getReconciliationJob } from '../src/controllers/reconciliation.js';
import { requirePlatformInMultiMode } from '../src/middleware/platformOnly.js';
import { getBetById } from '../src/controllers/bets.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip5_t6';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

let jobT1, eventCAT, betT1;

const savedMode = process.env.TENANCY_MODE;
before(async () => {
  // Cross-tenant isolation is a multi-mode property (scopeTenantId is null in single mode).
  process.env.TENANCY_MODE = 'multi';
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  jobT1 = await runWithTenant(T1, () => ReconciliationJob.create({
    name: 'Slikair Recon',
    type: 'transaction',
    startedBy: new mongoose.Types.ObjectId(),
    provider: 'slikair',
    status: 'completed',
    date: '2026-11-12',
  }));

  eventCAT = await Event.create({
    name: 'Team A vs Team B',
    sport: 'football',
    league: 'Premier League',
    startTime: new Date(),
    status: 'finished',
  });

  betT1 = await runWithTenant(T1, () => Bet.create({
    userId: new mongoose.Types.ObjectId(),
    eventId: eventCAT._id,
    amount: 50,
    stake: 50,
    type: 'single',
    totalOdds: 1.5,
    potentialWin: 75,
    selections: [{ eventId: eventCAT._id, oddValue: 1.5 }],
    status: 'pending',
  }));
});

after(async () => {
  if (savedMode === undefined) delete process.env.TENANCY_MODE; else process.env.TENANCY_MODE = savedMode;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('T2 staff accessing T1 reconciliation job receives 404', async () => {
  const req = { params: { id: String(jobT1._id) }, tenant: { id: T2 } };
  const res = { json: () => assert.fail('should not succeed') };

  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => getReconciliationJob(req, res, (e) => { throw e; }),
      (e) => e.status === 404
    );
  });
});

test('T2 player querying T1 bet receives 404', async () => {
  const req = {
    params: { id: String(betT1._id) },
    user: { id: new mongoose.Types.ObjectId() },
    tenant: { id: T2 },
  };
  const res = { json: () => assert.fail('should not succeed') };

  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => getBetById(req, res, (e) => { throw e; }),
      (e) => e.status === 404
    );
  });
});

test('T1 staff accessing T1 reconciliation job succeeds', async () => {
  const req = { params: { id: String(jobT1._id) }, tenant: { id: T1 } };
  let jsonOutput = null;
  const res = { json: (data) => { jsonOutput = data; } };

  await runWithTenant(T1, async () => {
    await getReconciliationJob(req, res, (e) => { throw e; });
  });
  assert.ok(jsonOutput?.job);
  assert.equal(String(jsonOutput.job._id), String(jobT1._id));
});

test('T1 player accessing own bet succeeds', async () => {
  const req = {
    params: { id: String(betT1._id) },
    user: { id: betT1.userId },
    tenant: { id: T1 },
  };
  let jsonOutput = null;
  const res = { json: (data) => { jsonOutput = data; } };

  await runWithTenant(T1, async () => {
    await getBetById(req, res, (e) => { throw e; });
  });
  assert.ok(jsonOutput?.bet);
  assert.equal(String(jsonOutput.bet._id), String(betT1._id));
});

test('T1 player accessing another T1 player bet receives 404', async () => {
  const req = {
    params: { id: String(betT1._id) },
    user: { id: new mongoose.Types.ObjectId() },
    tenant: { id: T1 },
  };
  const res = { json: () => assert.fail('should not succeed') };

  await runWithTenant(T1, async () => {
    await assert.rejects(
      async () => getBetById(req, res, (e) => { throw e; }),
      (e) => e.status === 404
    );
  });
});

function runGuard(mode, staff) {
  const prev = process.env.TENANCY_MODE;  // restored below; the suite runs in multi
  process.env.TENANCY_MODE = mode;
  try {
    let result = 'unset';
    requirePlatformInMultiMode({ staff }, {}, (e) => { result = e; });
    return result;
  } finally {
    if (prev === undefined) delete process.env.TENANCY_MODE; else process.env.TENANCY_MODE = prev;
  }
}

test('multi mode: tenant staff cannot settle an event (403 PLATFORM_ONLY, spec G-14)', () => {
  const err = runGuard('multi', { scope: 'tenant' });
  assert.equal(err.status, 403);
  assert.equal(err.code, 'PLATFORM_ONLY');
});

test('multi mode: platform staff pass the settlement guard', () => {
  assert.equal(runGuard('multi', { scope: 'platform' }), undefined);
});

test('single mode: the install admin keeps settling events (guard is a no-op)', () => {
  assert.equal(runGuard('single', undefined), undefined);
});

