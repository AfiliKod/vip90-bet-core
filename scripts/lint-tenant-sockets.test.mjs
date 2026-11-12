import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanSource, scanTree } from './lint-tenant-sockets.mjs';

test('flags io.emit', () => {
  const found = scanSource("io.emit('winners:new', {})", 'a.js');
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, 'no-global-io-emit');
  assert.equal(found[0].line, 1);
});

test('flags the role:admin room', () => {
  const found = scanSource("io.to('role:admin').emit('x')", 'a.js');
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, 'no-admin-role-room');
});

test('allows tenant room helpers', () => {
  assert.deepEqual(scanSource("io.to(adminRoom(tid)).emit('x')", 'a.js'), []);
  assert.deepEqual(scanSource("publishToTenant('x', payload)", 'a.js'), []);
});

test('ignores comment-only mentions', () => {
  assert.deepEqual(scanSource('// io.emit was banned; role:admin is gone', 'a.js'), []);
  assert.deepEqual(scanSource(' * role:admin is legacy', 'a.js'), []);
});

test('the real server tree is clean', () => {
  assert.deepEqual(scanTree('server/src'), []);
});