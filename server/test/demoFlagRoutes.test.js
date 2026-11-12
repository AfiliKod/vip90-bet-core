import { test } from 'node:test';
import assert from 'node:assert/strict';

import adminRoutes from '../src/routes/admin.js';

const routes = adminRoutes.stack.filter((l) => l.route).map((l) => ({
  path: l.route.path, methods: Object.keys(l.route.methods), first: l.route.stack[0].handle }));
const gated = (prefix) => routes.filter((r) => r.path === prefix || r.path.startsWith(prefix + '/'));

test('every demo-data route is gated by DEMO_DATA first', () => {
  assert.equal(gated('/demo-data').length, 5);
  assert.ok(gated('/demo-data').every((r) => r.first.demoFlag === 'data'));
});
test('every bots route is gated by DEMO_BOTS first', () => {
  assert.equal(gated('/bots').length, 7);
  assert.ok(gated('/bots').every((r) => r.first.demoFlag === 'bots'));
});
test('fake-winners routes are gated by DEMO_FAKE_WINNERS first', () => {
  assert.equal(gated('/fake-winners').length, 2);
  assert.ok(gated('/fake-winners').every((r) => r.first.demoFlag === 'fakeWinners'));
});
test('no other route carries a demo gate', () => {
  const others = routes.filter((r) => !/^\/(demo-data|bots|fake-winners)/.test(r.path));
  assert.ok(others.every((r) => r.first.demoFlag === undefined));
});
test('GET /demo-flags returns the effective flags', () => {
  const r = routes.find((x) => x.path === '/demo-flags');
  assert.deepEqual(r.methods, ['get']);
  let body; process.env.DEMO_DATA = 'true';
  try { r.first({}, { json: (b) => { body = b; } }); } finally { delete process.env.DEMO_DATA; }
  assert.deepEqual(body, { bots: false, fakeWinners: false, instantDeposit: false, data: true });
});
