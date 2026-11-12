import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startDemoJobs } from '../src/jobs/demoJobs.js';

const fake = () => {
  const calls = [];
  return {
    calls,
    starters: {
      bots: () => calls.push('bots'),
      fakeWinners: () => calls.push('fakeWinners'),
      data: async () => calls.push('data'),
    },
  };
};

test('starts nothing by default', async () => {
  const f = fake();
  assert.deepEqual(await startDemoJobs({ env: {}, starters: f.starters }), []);
  assert.deepEqual(f.calls, []);
});

test('starts only the enabled jobs', async () => {
  const f = fake();
  assert.deepEqual(
    await startDemoJobs({ env: { DEMO_FAKE_WINNERS: 'true', DEMO_DATA: 'true' }, starters: f.starters }),
    ['fakeWinners', 'data'],
  );
  assert.deepEqual(f.calls, ['fakeWinners', 'data']);
});

test('starts nothing in multi mode even when flags are set', async () => {
  const f = fake();
  assert.deepEqual(
    await startDemoJobs({ env: { TENANCY_MODE: 'multi', DEMO_BOTS: 'true' }, starters: f.starters }),
    [],
  );
  assert.deepEqual(f.calls, []);
});
