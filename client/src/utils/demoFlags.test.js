import { it } from 'node:test';
import assert from 'node:assert/strict';
import { NO_DEMO_FLAGS, isNavItemVisible, filterNavByDemoFlags } from './demoFlags.js';

const groups = [
  { id: 'g1', items: [{ id: 'a' }, { id: 'b', demoFlags: ['data'] }] },
  { id: 'demo', items: [{ id: 'd', demoFlags: ['data'] }, { id: 'w', demoFlags: ['fakeWinners'] }] },
];

it('hides flagged items and empty groups when flags are off', () => {
  assert.deepEqual(filterNavByDemoFlags(groups, NO_DEMO_FLAGS), [{ id: 'g1', items: [{ id: 'a' }] }]);
});

it('shows an item when any of its flags is on', () => {
  const out = filterNavByDemoFlags(groups, { ...NO_DEMO_FLAGS, fakeWinners: true });
  assert.deepEqual(out.map((g) => g.items.map((i) => i.id)), [['a'], ['w']]);
});

it('does not mutate its input', () => {
  filterNavByDemoFlags(groups, NO_DEMO_FLAGS);
  assert.equal(groups[1].items.length, 2);
});

it('NO_DEMO_FLAGS is frozen and all false; unflagged items are always visible', () => {
  assert.ok(Object.isFrozen(NO_DEMO_FLAGS));
  assert.deepEqual(NO_DEMO_FLAGS, { bots: false, fakeWinners: false, instantDeposit: false, data: false });
  assert.equal(isNavItemVisible({ id: 'x' }, NO_DEMO_FLAGS), true);
  assert.equal(isNavItemVisible({ id: 'y', demoFlags: ['data', 'bots'] }, { ...NO_DEMO_FLAGS, bots: true }), true);
  assert.equal(isNavItemVisible({ id: 'z', demoFlags: ['data'] }, NO_DEMO_FLAGS), false);
});

it('real nav config: demo items carry their flags', async () => {
  const { ADMIN_NAV_GROUPS } = await import('../components/admin/adminNav.config.js');
  const items = ADMIN_NAV_GROUPS.flatMap((g) => g.items);
  assert.deepEqual(items.find((i) => i.id === 'demo-data').demoFlags, ['data']);
  assert.deepEqual(items.find((i) => i.id === 'bots').demoFlags, ['fakeWinners']);
  assert.equal(filterNavByDemoFlags(ADMIN_NAV_GROUPS, NO_DEMO_FLAGS).some((g) => g.id === 'demo-simulation'), false);
});
