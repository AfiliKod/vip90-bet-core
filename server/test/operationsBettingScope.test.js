import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Event from '../src/models/Event.js';
import Bet from '../src/models/Bet.js';
import { ReconciliationJob } from '../src/models/Reconciliation.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { getReconciliationJob } from '../src/controllers/reconciliation.js';
import { settle as settleEvent } from '../src/controllers/events.js';
import { getBetById } from '../src/controllers/bets.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip5_t6';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

let jobT1, eventCAT, betT1;

before(async () => {
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

test('tenant staff attempting manual event settle receives 403 (requires platform permission)', async () => {
  const req = {
    params: { id: String(eventCAT._id) },
    staff: { scope: 'tenant', id: new mongoose.Types.ObjectId() },
    tenant: { id: T1 },
    body: { outcome: 'team_a' },
  };
  const res = { json: () => assert.fail('should not succeed') };

  await assert.rejects(
    async () => settleEvent(req, res, (e) => { throw e; }),
    (e) => e.status === 403 && e.code === 'FORBIDDEN'
  );
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

test('platform staff settling event succeeds', async () => {
  const liveEvent = await Event.create({
    name: 'Team C vs Team D',
    sport: 'football',
    league: 'La Liga',
    startTime: new Date(),
    status: 'live',
  });
  const req = {
    params: { id: String(liveEvent._id) },
    staff: { scope: 'platform', id: new mongoose.Types.ObjectId() },
    body: { outcome: 'team_c' },
  };
  let jsonOutput = null;
  const res = { json: (data) => { jsonOutput = data; } };

  await settleEvent(req, res, (e) => { throw e; });
  assert.ok(jsonOutput);
  const updated = await Event.findById(liveEvent._id);
  assert.equal(updated.status, 'finished');
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
