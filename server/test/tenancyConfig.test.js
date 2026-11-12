import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  readTenancyConfig,
  getTenancyMode,
  getTenancyEnforcement,
  validateTenancyStartup,
  assertTenancyStartup,
  TenancyStartupError,
  getDemoFlags,
  isDemoBotsEnabled,
  isDemoFakeWinnersEnabled,
  isDemoDataEnabled,
  requireDemoFlag,
} from '../src/config/tenancy.js';

const MULTI_OK = { TENANCY_MODE: 'multi', JWT_STAFF_SECRET: 's', OPERATOR_SECRET_ENCRYPTION_KEY: 'k' };

test('defaults to single/off with no demo flags', () => {
  assert.deepEqual(readTenancyConfig({}), { mode: 'single', enforcement: 'off',
    demoRequested: { bots: false, fakeWinners: false, instantDeposit: false, data: false }, errors: [] });
});
test('multi defaults enforcement to enforce', () => {
  assert.equal(getTenancyEnforcement({ TENANCY_MODE: 'multi' }), 'enforce');
});
test('trims and lower-cases', () => {
  assert.equal(getTenancyMode({ TENANCY_MODE: ' Multi ' }), 'multi');
  assert.equal(readTenancyConfig({ DEMO_BOTS: 'TRUE' }).demoRequested.bots, true);
  assert.equal(readTenancyConfig({ DEMO_BOTS: '1' }).demoRequested.bots, false);
});
test('single mode with every demo flag and enforce is valid', () => {
  assert.deepEqual(validateTenancyStartup({ TENANCY_ENFORCEMENT: 'enforce', DEMO_BOTS: 'true',
    DEMO_FAKE_WINNERS: 'true', DEMO_INSTANT_DEPOSIT: 'true', DEMO_DATA: 'true' }), []);
});
test('typo in mode is refused, not treated as single', () => {
  assert.deepEqual(validateTenancyStartup({ TENANCY_MODE: 'mulit' }),
    ['TENANCY_MODE must be "single" or "multi" (got "mulit")']);
});
test('invalid enforcement is refused', () => {
  assert.match(validateTenancyStartup({ TENANCY_ENFORCEMENT: 'strict' })[0], /TENANCY_ENFORCEMENT must be/);
});
test('multi with all secrets and default enforcement is valid', () => {
  assert.deepEqual(validateTenancyStartup(MULTI_OK), []);
});
test('multi refuses log enforcement', () => {
  assert.deepEqual(validateTenancyStartup({ ...MULTI_OK, TENANCY_ENFORCEMENT: 'log' }),
    ['TENANCY_MODE=multi requires TENANCY_ENFORCEMENT=enforce (got "log")']);
});
test('multi refuses each demo flag', () => {
  const demoFlagNames = ['DEMO_BOTS', 'DEMO_FAKE_WINNERS', 'DEMO_INSTANT_DEPOSIT', 'DEMO_DATA'];
  for (const name of demoFlagNames) {
    assert.deepEqual(validateTenancyStartup({ ...MULTI_OK, [name]: 'true' }),
      [`TENANCY_MODE=multi does not allow ${name}=true`]);
  }
});
test('multi refuses missing or empty secrets', () => {
  assert.deepEqual(validateTenancyStartup({ TENANCY_MODE: 'multi', JWT_STAFF_SECRET: '  ' }), [
    'TENANCY_MODE=multi requires JWT_STAFF_SECRET',
    'TENANCY_MODE=multi requires OPERATOR_SECRET_ENCRYPTION_KEY',
  ]);
});
test('assertTenancyStartup throws with all problems', () => {
  assert.throws(() => assertTenancyStartup({ TENANCY_MODE: 'multi', DEMO_DATA: 'true' }),
    (e) => e instanceof TenancyStartupError && e.code === 'TENANCY_STARTUP' && e.problems.length === 3);
  assert.doesNotThrow(() => assertTenancyStartup({}));
});
test('effective demo flags: on in single only when requested, never in multi', () => {
  assert.deepEqual(getDemoFlags({}), { bots: false, fakeWinners: false, instantDeposit: false, data: false });
  assert.equal(isDemoBotsEnabled({ DEMO_BOTS: 'true' }), true);
  assert.equal(isDemoFakeWinnersEnabled({ DEMO_FAKE_WINNERS: 'true' }), true);
  assert.equal(isDemoDataEnabled({ DEMO_DATA: 'true' }), true);
  assert.deepEqual(getDemoFlags({ TENANCY_MODE: 'multi', DEMO_BOTS: 'true', DEMO_DATA: 'true' }),
    { bots: false, fakeWinners: false, instantDeposit: false, data: false });
});
test('requireDemoFlag answers 404 when off and passes when on', () => {
  const mw = requireDemoFlag('data');
  assert.equal(mw.demoFlag, 'data');

  const originalDemoData = process.env.DEMO_DATA;
  const originalTenancyMode = process.env.TENANCY_MODE;

  try {
    // (a) delete DEMO_DATA → 404 DEMO_FEATURE_DISABLED
    delete process.env.DEMO_DATA;
    const req = {};
    const res = {};
    const next = (err) => {
      assert.equal(err.status, 404);
      assert.equal(err.code, 'DEMO_FEATURE_DISABLED');
    };
    mw(req, res, next);

    // (b) DEMO_DATA='true' → next called with no argument (undefined)
    process.env.DEMO_DATA = 'true';
    const next2 = (err) => {
      assert.equal(err, undefined);
    };
    mw({}, {}, next2);

    // (c) DEMO_DATA='true' and TENANCY_MODE='multi' → 404
    process.env.TENANCY_MODE = 'multi';
    const next3 = (err) => {
      assert.equal(err.status, 404);
      assert.equal(err.code, 'DEMO_FEATURE_DISABLED');
    };
    mw({}, {}, next3);
  } finally {
    if (originalDemoData === undefined) {
      delete process.env.DEMO_DATA;
    } else {
      process.env.DEMO_DATA = originalDemoData;
    }
    if (originalTenancyMode === undefined) {
      delete process.env.TENANCY_MODE;
    } else {
      process.env.TENANCY_MODE = originalTenancyMode;
    }
  }
});
test('requireDemoFlag rejects unknown flag names', () => {
  assert.throws(() => requireDemoFlag('robots'), TypeError);
});