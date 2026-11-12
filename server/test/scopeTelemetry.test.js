import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  ScopeGateDay, recordScopeViolation, startScopeTelemetry, evaluateGate, installScopeTelemetry, utcDay,
  STAGING_REQUIRED_DAYS,
} from '../src/platform/services/scopeTelemetry.js';
import { reportViolation, resetScopeViolationStats } from '../src/tenancy/tenantScoped.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9a_t7_scope';
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-12-01T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY);

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  await ScopeGateDay.init();
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
beforeEach(async () => {
  await ScopeGateDay.deleteMany({});
});

test('no telemetry yet: the gate has not started and does not pass', async () => {
  const gate = await evaluateGate({ environment: 'staging', requiredDays: 14, now: NOW });
  assert.equal(gate.started, false);
  assert.equal(gate.gatePassed, false);
});

test('14 clean days since start pass the staging gate; 13 do not', async () => {
  await startScopeTelemetry({ environment: 'staging', now: daysAgo(13) });
  let gate = await evaluateGate({ environment: 'staging', requiredDays: STAGING_REQUIRED_DAYS, now: NOW });
  assert.equal(gate.consecutiveCleanDays, 14);
  assert.equal(gate.gatePassed, true);

  await ScopeGateDay.deleteMany({});
  await startScopeTelemetry({ environment: 'staging', now: daysAgo(12) });
  gate = await evaluateGate({ environment: 'staging', requiredDays: STAGING_REQUIRED_DAYS, now: NOW });
  assert.equal(gate.consecutiveCleanDays, 13);
  assert.equal(gate.gatePassed, false);
});

test('a violation resets the clean streak to the days after it', async () => {
  await startScopeTelemetry({ environment: 'staging', now: daysAgo(20) });
  await recordScopeViolation({ environment: 'staging', event: { model: 'User', op: 'find', reason: 'unscoped' }, now: daysAgo(3) });
  const gate = await evaluateGate({ environment: 'staging', requiredDays: 14, now: NOW });
  assert.equal(gate.consecutiveCleanDays, 3);
  assert.equal(gate.totalViolations, 1);
  assert.equal(gate.lastViolationDay, utcDay(daysAgo(3)));
  assert.equal(gate.lastSample.model, 'User');
  assert.equal(gate.gatePassed, false);
});

test('environments are measured separately', async () => {
  await startScopeTelemetry({ environment: 'production', now: daysAgo(6) });
  await recordScopeViolation({ environment: 'staging', event: {}, now: NOW });
  const prod = await evaluateGate({ environment: 'production', requiredDays: 7, now: NOW });
  assert.equal(prod.consecutiveCleanDays, 7);
  assert.equal(prod.gatePassed, true);
});

test('an enforce-mode TenantScopeError is persisted for the configured environment', async () => {
  const prevEnf = process.env.TENANCY_ENFORCEMENT;
  const prevMode = process.env.TENANCY_MODE;
  process.env.TENANCY_MODE = 'multi';
  process.env.TENANCY_ENFORCEMENT = 'enforce';
  const stop = installScopeTelemetry({ environment: 'staging' });
  try {
    resetScopeViolationStats();
    assert.throws(() => reportViolation({ model: 'Transaction', op: 'find' }), /unscoped find on Transaction/);
    let row = null;
    for (let i = 0; i < 50; i += 1) {
      row = await ScopeGateDay.findOne({ environment: 'staging', day: utcDay() }).lean();
      if (row?.count === 1) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(row.count, 1);
    assert.equal(row.lastSample.model, 'Transaction');
  } finally {
    stop();
    if (prevEnf === undefined) delete process.env.TENANCY_ENFORCEMENT; else process.env.TENANCY_ENFORCEMENT = prevEnf;
    if (prevMode === undefined) delete process.env.TENANCY_MODE; else process.env.TENANCY_MODE = prevMode;
  }
});

test('without SCOPE_GATE_ENV nothing is recorded', async () => {
  const stop = installScopeTelemetry({ environment: undefined });
  stop();
  assert.equal(await ScopeGateDay.countDocuments(), 0);
});
