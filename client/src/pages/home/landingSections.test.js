import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDING_SECTION_IDS, resolveLandingSections, pickEventsWithOdds } from './landingSections.js';
import { DEFAULT_SECTION_ORDER } from './pageContent.js';
import { HOME_SECTION_IDS } from '../../../../server/src/pages/registry.js';

test('default order mixes sports and casino rows', () => {
  assert.deepEqual(resolveLandingSections(undefined), ['hero', 'liveBets', 'casinoGames', 'sportsBets', 'inhouseGames']);
});

test('saved admin order is followed and hidden sections stay hidden', () => {
  assert.deepEqual(resolveLandingSections(['inhouseGames', 'hero', 'sportsBets']), ['inhouseGames', 'hero', 'sportsBets']);
});

test('legacy ids in a saved order are ignored on the landing page', () => {
  assert.deepEqual(resolveLandingSections(['quickNav', 'liveBets', 'features']), ['liveBets']);
});

test('betting module off drops both sports rows', () => {
  assert.deepEqual(resolveLandingSections(undefined, { betting: false }), ['hero', 'casinoGames', 'inhouseGames']);
});

test('casino-content module off drops provider game rows but keeps our own games', () => {
  assert.deepEqual(resolveLandingSections(undefined, { casino: false }), ['hero', 'liveBets', 'sportsBets', 'inhouseGames']);
});

test('unknown module state counts as available', () => {
  assert.deepEqual(resolveLandingSections(undefined, { betting: undefined }), resolveLandingSections(undefined));
});

test('every landing and client section id is accepted by the server validator', () => {
  for (const id of [...LANDING_SECTION_IDS, ...DEFAULT_SECTION_ORDER]) assert.ok(HOME_SECTION_IDS.includes(id), id);
});

test('pickEventsWithOdds keeps order, skips events without odds, caps the count', () => {
  const evs = [{ id: 1, ok: true }, { id: 2, ok: false }, { id: 3, ok: true }, { id: 4, ok: true }];
  assert.deepEqual(pickEventsWithOdds(evs, e => e.ok, 2).map(e => e.id), [1, 3]);
  assert.deepEqual(pickEventsWithOdds(undefined, () => true), []);
  assert.deepEqual(pickEventsWithOdds([null, { id: 5, ok: true }], e => e.ok).map(e => e.id), [5]);
});
