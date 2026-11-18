// İP-10a — capacity measurement: window aggregation math, threshold evaluation
// (incl. the CPU 3-in-7-days rule), sampler persistence and liveness, and the
// once-per-state-change alerts with the multi-mode platform activity event.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import mongoose from 'mongoose';
import CapacityWindow from '../src/models/CapacityWindow.js';
import AuditLog from '../src/models/AuditLog.js';
import { runAsPlatform } from '../src/tenancy/context.js';
import {
  percentile,
  aggregateWindow,
  countConnectedSockets,
  capacityThresholds,
  evaluateCapacity,
  checkCapacityAlerts,
  resetCapacityAlertState,
  startCapacitySampler,
  DEFAULT_THRESHOLDS,
} from '../src/services/capacityMetrics.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip10a_capacity';
const NOW = new Date('2026-12-01T12:00:00Z');
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

const ENV_KEYS = ['CAPACITY_SOCKETS_P95', 'CAPACITY_EVENT_LOOP_P99_MS', 'CAPACITY_CPU_PCT', 'TENANCY_MODE', 'TENANCY_ENFORCEMENT'];
const savedEnv = {};

before(async () => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  await CapacityWindow.init();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

beforeEach(async () => {
  await CapacityWindow.deleteMany({});
  await AuditLog.deleteMany({});
  resetCapacityAlertState();
  for (const key of ['CAPACITY_SOCKETS_P95', 'CAPACITY_EVENT_LOOP_P99_MS', 'CAPACITY_CPU_PCT']) delete process.env[key];
  delete process.env.TENANCY_MODE;
  delete process.env.TENANCY_ENFORCEMENT;
});

const makeWindow = (overrides = {}) => CapacityWindow.create({
  windowStart: new Date(NOW.getTime() - MIN),
  host: 'test-host',
  pid: 123,
  socketsP95: 10,
  eventLoopP99Ms: 1,
  cpuPct: 5,
  ...overrides,
});

// ── Aggregation math on synthetic samples ─────────────────────────────────

test('percentile uses nearest-rank on unsorted values', () => {
  const values = Array.from({ length: 100 }, (_, i) => 100 - i); // 100..1
  assert.equal(percentile(values, 95), 95);
  assert.equal(percentile(values, 99), 99);
  assert.equal(percentile(values, 50), 50);
  assert.equal(percentile([7], 95), 7);
  assert.equal(percentile([], 95), null);
});

test('aggregateWindow: sockets p95, CPU average, event-loop p99 passthrough', () => {
  const samples = [
    { sockets: 100, cpuPct: 10 },
    { sockets: 300, cpuPct: 30 },
    { sockets: 200, cpuPct: 20 },
  ];
  const agg = aggregateWindow({ samples, eventLoopP99Ms: 12.3456 });
  assert.equal(agg.socketsP95, 300); // ceil(0.95 * 3) = 3rd of [100, 200, 300]
  assert.equal(agg.cpuPct, 20);
  assert.equal(agg.eventLoopP99Ms, 12.35);
  assert.equal(aggregateWindow({ samples: [], eventLoopP99Ms: 0 }), null);
  assert.equal(aggregateWindow({ samples: [{ sockets: 1, cpuPct: 1 }], eventLoopP99Ms: NaN }).eventLoopP99Ms, 0);
});

test('countConnectedSockets sums every namespace', () => {
  const io = {
    _nsps: new Map([
      ['/', { sockets: new Map([['a', {}], ['b', {}]]) }],
      ['/live', { sockets: new Map([['c', {}]]) }],
    ]),
  };
  assert.equal(countConnectedSockets(io), 3);
  assert.equal(countConnectedSockets(null), 0);
});

// ── Threshold evaluation ──────────────────────────────────────────────────

test('no windows yet: everything ok with null values', async () => {
  const result = await evaluateCapacity({ now: NOW });
  assert.equal(result.state, 'ok');
  assert.equal(result.sockets.value, null);
  assert.equal(result.eventLoop.value, null);
  assert.equal(result.cpu.value, null);
  assert.equal(result.windowStart, null);
});

test('sockets and event-loop: ok / approaching (70%) / exceeded', async () => {
  await makeWindow({ socketsP95: 1399, eventLoopP99Ms: 69 });
  let result = await evaluateCapacity({ now: NOW });
  assert.equal(result.sockets.state, 'ok');
  assert.equal(result.eventLoop.state, 'ok');

  await CapacityWindow.deleteMany({});
  await makeWindow({ socketsP95: 1400, eventLoopP99Ms: 70 });
  result = await evaluateCapacity({ now: NOW });
  assert.equal(result.sockets.state, 'approaching');
  assert.equal(result.eventLoop.state, 'approaching');
  assert.equal(result.state, 'approaching');

  await CapacityWindow.deleteMany({});
  await makeWindow({ socketsP95: 2000, eventLoopP99Ms: 100 });
  result = await evaluateCapacity({ now: NOW });
  assert.equal(result.sockets.state, 'approaching'); // threshold itself is not "over"
  assert.equal(result.eventLoop.state, 'approaching');

  await CapacityWindow.deleteMany({});
  await makeWindow({ socketsP95: 2001, eventLoopP99Ms: 100.5 });
  result = await evaluateCapacity({ now: NOW });
  assert.equal(result.sockets.state, 'exceeded');
  assert.equal(result.eventLoop.state, 'exceeded');
  assert.equal(result.state, 'exceeded');
});

test('CPU: exceeded only with 3+ windows over the threshold within 7 days', async () => {
  // One hot window: approaching, never exceeded on its own.
  await makeWindow({ cpuPct: 80 });
  let result = await evaluateCapacity({ now: NOW });
  assert.equal(result.cpu.state, 'approaching');
  assert.equal(result.cpu.windowsOverThreshold, 1);

  // Two hot windows in the week: still not exceeded.
  await makeWindow({ windowStart: new Date(NOW.getTime() - DAY), cpuPct: 75 });
  result = await evaluateCapacity({ now: NOW });
  assert.equal(result.cpu.state, 'approaching');
  assert.equal(result.cpu.windowsOverThreshold, 2);

  // Three hot windows in the week: exceeded.
  await makeWindow({ windowStart: new Date(NOW.getTime() - 2 * DAY), cpuPct: 71 });
  result = await evaluateCapacity({ now: NOW });
  assert.equal(result.cpu.state, 'exceeded');
  assert.equal(result.cpu.windowsOverThreshold, 3);
  assert.equal(result.state, 'exceeded');

  // A hot window older than 7 days does not count.
  await CapacityWindow.deleteMany({});
  await makeWindow({ cpuPct: 80 });
  await makeWindow({ windowStart: new Date(NOW.getTime() - DAY), cpuPct: 80 });
  await makeWindow({ windowStart: new Date(NOW.getTime() - 8 * DAY), cpuPct: 90 });
  result = await evaluateCapacity({ now: NOW });
  assert.equal(result.cpu.state, 'approaching');
  assert.equal(result.cpu.windowsOverThreshold, 2);
});

test('CPU: 70% of the threshold starts approaching, below stays ok', async () => {
  await makeWindow({ cpuPct: 48.9 });
  let result = await evaluateCapacity({ now: NOW });
  assert.equal(result.cpu.state, 'ok');

  await CapacityWindow.deleteMany({});
  await makeWindow({ cpuPct: 49 });
  result = await evaluateCapacity({ now: NOW });
  assert.equal(result.cpu.state, 'approaching');
});

test('thresholds are env-configurable with the spec defaults', async () => {
  assert.deepEqual(capacityThresholds({}), DEFAULT_THRESHOLDS);
  assert.deepEqual(capacityThresholds({ CAPACITY_SOCKETS_P95: 'abc', CAPACITY_CPU_PCT: '-5' }), DEFAULT_THRESHOLDS);

  process.env.CAPACITY_SOCKETS_P95 = '100';
  process.env.CAPACITY_EVENT_LOOP_P99_MS = '10';
  process.env.CAPACITY_CPU_PCT = '50';
  await makeWindow({ socketsP95: 101, eventLoopP99Ms: 11, cpuPct: 51 });
  const result = await evaluateCapacity({ now: NOW });
  assert.equal(result.sockets.state, 'exceeded');
  assert.equal(result.sockets.threshold, 100);
  assert.equal(result.eventLoop.state, 'exceeded');
  assert.equal(result.cpu.state, 'approaching'); // 1 of the required 3 windows
  assert.equal(result.cpu.threshold, 50);
});

// ── Sampler ───────────────────────────────────────────────────────────────

test('sampler persists a 15-minute-style window with all fields', async () => {
  const io = { _nsps: new Map([['/', { sockets: new Map([['a', {}], ['b', {}]]) }]]) };
  const stop = startCapacitySampler({ io, sampleIntervalMs: 20, windowMs: 100 });
  try {
    let row = null;
    for (let i = 0; i < 200 && !row; i += 1) {
      row = await CapacityWindow.findOne({}).lean();
      if (!row) await new Promise((r) => setTimeout(r, 25));
    }
    assert.ok(row, 'a window must be persisted');
    assert.equal(row.socketsP95, 2);
    assert.equal(row.pid, process.pid);
    assert.equal(typeof row.host, 'string');
    assert.ok(row.windowStart instanceof Date);
    assert.ok(Number.isFinite(row.cpuPct) && row.cpuPct >= 0);
    assert.ok(Number.isFinite(row.eventLoopP99Ms) && row.eventLoopP99Ms >= 0);
  } finally {
    stop();
  }
});

test('stop() ends measurement: no further windows are written', async () => {
  const stop = startCapacitySampler({ sampleIntervalMs: 20, windowMs: 60 });
  stop();
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(await CapacityWindow.countDocuments({}), 0);
});

test('an unref\'d sampler does not keep the process alive', async () => {
  const servicePath = pathToFileURL(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/services/capacityMetrics.js'),
  ).href;
  // No DB connection in the child: only the sampler runs. If its timer (or the
  // event-loop histogram) kept the loop alive, the child would never exit.
  const script = `import(${JSON.stringify(servicePath)}).then((m) => { m.startCapacitySampler({ sampleIntervalMs: 20, windowMs: 60000 }); console.log('started'); });`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
  const exit = await new Promise((resolve, reject) => {
    const killer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('child did not exit: sampler keeps the process alive')); }, 15000);
    child.on('exit', (code) => { clearTimeout(killer); resolve(code); });
    child.on('error', (err) => { clearTimeout(killer); reject(err); });
  });
  assert.equal(exit, 0);
});

// ── State-change alerts ───────────────────────────────────────────────────

test('alerts log once per state change, not per window', async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => { warnings.push(args.join(' ')); };
  try {
    await makeWindow({ socketsP95: 2500 });
    await checkCapacityAlerts({ now: NOW });
    await checkCapacityAlerts({ now: NOW }); // same state: no second line
    assert.equal(warnings.filter((w) => w.includes('[capacity] sockets exceeded')).length, 1);

    await CapacityWindow.updateMany({}, { $set: { socketsP95: 1500 } });
    await checkCapacityAlerts({ now: NOW });
    assert.equal(warnings.filter((w) => w.includes('[capacity] sockets approaching')).length, 1);

    await CapacityWindow.updateMany({}, { $set: { socketsP95: 10 } });
    await checkCapacityAlerts({ now: NOW }); // back to ok: no alert line
    assert.equal(warnings.filter((w) => w.includes('[capacity]')).length, 2);
  } finally {
    console.warn = originalWarn;
  }
});

test('multi mode writes a platform activity event per alert; single mode does not', async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await makeWindow({ socketsP95: 2500 });
    await checkCapacityAlerts({ now: NOW });
    assert.equal(await AuditLog.countDocuments({ action: 'capacity:sockets:exceeded' }), 0);

    resetCapacityAlertState();
    process.env.TENANCY_MODE = 'multi';
    await checkCapacityAlerts({ now: NOW });
    const event = await runAsPlatform('test_read', () => AuditLog.findOne({ action: 'capacity:sockets:exceeded' }).lean());
    assert.ok(event, 'multi mode must write the platform activity event');
    assert.equal(event.tenantId, null);
    assert.equal(event.actorScope, 'platform');
    assert.equal(event.actorType, 'system');
    assert.equal(event.category, 'system');
    assert.equal(event.metadata.value, 2500);
    assert.equal(event.metadata.threshold, 2000);
  } finally {
    console.warn = originalWarn;
  }
});