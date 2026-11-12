/**
 * İP-5 Task 1 (spec §6.1, §6.3 G7): the single-mode TENANCY_ENFORCEMENT default.
 *
 * `log` makes the plugin add `{ tenantId }` to reads that run inside a tenant
 * context, so a document the G3 backfill has not stamped would drop out of the
 * result. The default therefore engages only once
 * `Migration{name:'tenancy-002-backfill-tenant-id'}` records every collection as
 * completed; an explicit TENANCY_ENFORCEMENT always wins.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  readTenancyConfig,
  getTenancyMode,
  getTenancyEnforcement,
  isBackfillProgressComplete,
  isTenantIdBackfillComplete,
  setTenantIdBackfillComplete,
  refreshTenantIdBackfillGate,
} from '../src/config/tenancy.js';
import {
  tenantScoped,
  reportViolation,
  getScopeViolationStats,
  resetScopeViolationStats,
  WARN_WINDOW_MS,
} from '../src/tenancy/tenantScoped.js';
import { runWithTenant, runAsPlatform } from '../src/tenancy/context.js';
import { TenantScopeError } from '../src/tenancy/errors.js';
import Migration from '../src/models/Migration.js';
// The name is taken from the G3 backfill itself, so these two cannot drift apart.
import { BACKFILL_MIGRATION_NAME } from '../src/tenancy/backfill.js';

// Own test database; MONGODB_URI is never read (it may point at a real database).
const BASE = (process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017').replace(/\/+$/, '');
const HAS_DB_NAME = /^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]/.test(BASE);
const DB_URI = HAS_DB_NAME ? BASE : `${BASE}/vip90_test_ip5_t1_enforcement`;

const T1 = new mongoose.Types.ObjectId();

/** Rows written without a tenant, to show what the gate protects. */
const Legacy = mongoose.model(
  'Ip5T1LegacyRow',
  new mongoose.Schema({ name: String }).plugin(tenantScoped),
);

/** Run `fn` with the G7 gate forced to `complete`, restoring it afterwards. */
async function withGate(complete, fn) {
  const previous = isTenantIdBackfillComplete();
  setTenantIdBackfillComplete(complete);
  try {
    return await fn();
  } finally {
    setTenantIdBackfillComplete(previous);
  }
}

/** Run `fn` with these env vars set (null deletes them), restoring the previous values. */
async function withEnv(overrides, fn) {
  const saved = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    saved.set(key, Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : null);
    if (value === null) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/** Run `fn` with console.warn and console.info captured; returns the warn lines. */
async function withLogsCaptured(fn) {
  const lines = [];
  const savedWarn = console.warn;
  const savedInfo = console.info;
  console.warn = (...args) => lines.push(args.join(' '));
  console.info = () => {};
  try {
    await fn();
  } finally {
    console.warn = savedWarn;
    console.info = savedInfo;
  }
  return lines;
}

before(async () => {
  await mongoose.connect(DB_URI);
  await mongoose.connection.dropDatabase();
  await Legacy.init();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('single mode keeps the off default while the G3 backfill is outstanding', async () => {
  await withGate(false, async () => {
    assert.equal(readTenancyConfig({ TENANCY_MODE: 'single' }).enforcement, 'off');
    assert.equal(readTenancyConfig({ TENANCY_MODE: 'single', TENANCY_ENFORCEMENT: '' }).enforcement, 'off');
    assert.equal(getTenancyEnforcement({ TENANCY_MODE: 'single' }), 'off');
  });
});

test('single mode defaults to log once the G3 backfill is complete (G7)', async () => {
  await withGate(true, async () => {
    assert.equal(readTenancyConfig({ TENANCY_MODE: 'single' }).enforcement, 'log');
    assert.equal(readTenancyConfig({ TENANCY_MODE: 'single', TENANCY_ENFORCEMENT: '' }).enforcement, 'log');
    assert.equal(getTenancyEnforcement({ TENANCY_MODE: 'single' }), 'log');
  });
});

test('multi mode always defaults to enforce, gated or not', async () => {
  assert.equal(getTenancyMode({ TENANCY_MODE: 'multi' }), 'multi');
  for (const complete of [false, true]) {
    await withGate(complete, async () => {
      assert.equal(readTenancyConfig({ TENANCY_MODE: 'multi' }).enforcement, 'enforce');
    });
  }
});

test('an explicit TENANCY_ENFORCEMENT beats the gated default', async () => {
  await withGate(true, async () => {
    assert.equal(readTenancyConfig({ TENANCY_MODE: 'single', TENANCY_ENFORCEMENT: 'off' }).enforcement, 'off');
    assert.equal(readTenancyConfig({ TENANCY_MODE: 'single', TENANCY_ENFORCEMENT: ' Log ' }).enforcement, 'log');
    assert.equal(readTenancyConfig({ TENANCY_MODE: 'single', TENANCY_ENFORCEMENT: 'enforce' }).enforcement, 'enforce');
    assert.deepEqual(readTenancyConfig({ TENANCY_MODE: 'single', TENANCY_ENFORCEMENT: 'off' }).errors, []);
  });
});

test('an invalid value falls back to the gated default and records one error', async () => {
  for (const [complete, expected] of [[true, 'log'], [false, 'off']]) {
    await withGate(complete, async () => {
      const cfg = readTenancyConfig({ TENANCY_MODE: 'single', TENANCY_ENFORCEMENT: 'invalid_mode' });
      assert.equal(cfg.enforcement, expected);
      assert.equal(cfg.errors.length, 1);
      assert.match(cfg.errors[0], /TENANCY_ENFORCEMENT must be "off", "log" or "enforce"/);
    });
  }
});

test('isBackfillProgressComplete needs a recorded map with every collection completed', () => {
  assert.equal(isBackfillProgressComplete(undefined), false);
  assert.equal(isBackfillProgressComplete(null), false);
  assert.equal(isBackfillProgressComplete({}), false);
  assert.equal(isBackfillProgressComplete('users'), false);
  assert.equal(isBackfillProgressComplete([{ status: 'completed' }]), false);
  assert.equal(isBackfillProgressComplete({ users: { status: 'completed' } }), true);
  assert.equal(isBackfillProgressComplete({ users: { status: 'completed' }, bets: { status: 'completed' } }), true);
  assert.equal(isBackfillProgressComplete({ users: { status: 'completed' }, bets: { status: 'in_progress' } }), false);
  assert.equal(isBackfillProgressComplete({ users: { lastId: null, processed: 0 } }), false);
});

test('refreshTenantIdBackfillGate reads the G3 record from the database', async () => {
  const savedWarn = console.warn;
  console.warn = () => {};
  try {
    await Migration.deleteMany({});
    setTenantIdBackfillComplete(true); // must be replaced by the read, not left over

    assert.equal(await refreshTenantIdBackfillGate(), false, 'no G3 record yet');
    assert.equal(getTenancyEnforcement({ TENANCY_MODE: 'single' }), 'off');

    await Migration.create({
      name: BACKFILL_MIGRATION_NAME,
      version: '1.2.0',
      progress: { users: { status: 'in_progress', processed: 40 } },
    });
    assert.equal(await refreshTenantIdBackfillGate(), false, 'a collection still walking keeps it off');

    await Migration.updateOne(
      { name: BACKFILL_MIGRATION_NAME },
      { $set: { 'progress.users.status': 'completed', 'progress.bets.status': 'in_progress' } },
    );
    assert.equal(await refreshTenantIdBackfillGate(), false, 'a collection added later keeps it off');

    await Migration.updateOne(
      { name: BACKFILL_MIGRATION_NAME },
      { $set: { 'progress.bets.status': 'completed', 'progress.bets.completedAt': new Date() } },
    );
    assert.equal(await refreshTenantIdBackfillGate(), true);
    assert.equal(isTenantIdBackfillComplete(), true);
    assert.equal(getTenancyEnforcement({ TENANCY_MODE: 'single' }), 'log');

    await Migration.deleteMany({});
    assert.equal(await refreshTenantIdBackfillGate(), false, 'every read follows the record');
  } finally {
    setTenantIdBackfillComplete(false);
    await Migration.deleteMany({});
    console.warn = savedWarn;
  }
});

test('an unreadable G3 record keeps the gate closed and never throws', async () => {
  const lines = await withLogsCaptured(async () => {
    const complete = await refreshTenantIdBackfillGate({
      migration: { findOne: () => { throw new Error('db down'); } },
    });
    assert.equal(complete, false);
    assert.equal(isTenantIdBackfillComplete(), false);
  });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /G3 backfill status unreadable, staying off/);
});

test('log mode counts the violation, warns once and does not throw', async () => {
  resetScopeViolationStats();
  const lines = await withLogsCaptured(async () => {
    await withGate(true, () => withEnv({ TENANCY_MODE: 'single', TENANCY_ENFORCEMENT: null }, () => {
      assert.doesNotThrow(() => {
        reportViolation({ model: 'User', op: 'find', reason: 'unscoped' });
      });
    }));
  });
  const stats = getScopeViolationStats();
  assert.equal(stats.count, 1);
  assert.equal(stats.lastSample.model, 'User');
  assert.equal(stats.lastSample.op, 'find');
  assert.equal(stats.lastSample.reason, 'unscoped');
  assert.deepEqual(lines, ['[tenancy] unscoped find on User']);
  resetScopeViolationStats();
});

test('log mode rate limits one line per model+op per minute but keeps counting', async () => {
  resetScopeViolationStats();
  const t0 = 1_000_000_000;
  const lines = await withLogsCaptured(async () => {
    await withEnv({ TENANCY_ENFORCEMENT: 'log' }, () => {
      reportViolation({ model: 'User', op: 'find' }, { now: t0 });
      reportViolation({ model: 'User', op: 'find' }, { now: t0 + 1_000 });
      reportViolation({ model: 'User', op: 'countDocuments' }, { now: t0 + 1_000 });
      reportViolation({ model: 'Bet', op: 'find' }, { now: t0 + 1_000 });
      reportViolation({ model: 'User', op: 'find' }, { now: t0 + WARN_WINDOW_MS });
    });
  });
  assert.equal(getScopeViolationStats().count, 5, 'silence must not lose a count');
  assert.deepEqual(lines, [
    '[tenancy] unscoped find on User',
    '[tenancy] unscoped countDocuments on User',
    '[tenancy] unscoped find on Bet',
    '[tenancy] unscoped find on User',
  ]);
  resetScopeViolationStats();
});

test('enforce mode throws TenantScopeError instead of counting', async () => {
  resetScopeViolationStats();
  const lines = await withLogsCaptured(async () => {
    await withEnv({ TENANCY_ENFORCEMENT: 'enforce' }, () => {
      assert.throws(
        () => reportViolation({ model: 'User', op: 'find', reason: 'unscoped' }),
        (e) => e instanceof TenantScopeError && e.model === 'User' && e.reason === 'unscoped',
      );
    });
  });
  assert.equal(getScopeViolationStats().count, 0);
  assert.equal(getScopeViolationStats().lastSample, null);
  assert.deepEqual(lines, []);
});

test('the gate is what keeps unbacked single-mode rows readable', async () => {
  await withEnv({ TENANCY_MODE: 'single', TENANCY_ENFORCEMENT: null }, async () => {
    await withLogsCaptured(async () => {
      await runAsPlatform('test seed unbacked row', async () => {
        await Legacy.deleteMany({});
        await Legacy.create({ name: 'no tenant yet' });
      });

      const gated = await withGate(true, async () => {
        return runWithTenant(T1, async () => Legacy.find({}));
      });
      const ungated = await withGate(false, async () => {
        return runWithTenant(T1, async () => Legacy.find({}));
      });

      assert.equal(ungated.length, 1, 'off: unstamped rows are still read');
      assert.equal(gated.length, 0, 'log: the tenant filter hides unstamped rows');
      await Legacy.deleteMany({});
    });
  });
});
