import { it } from 'node:test';
import assert from 'node:assert/strict';
import { hashToken } from '../../src/utils/tokenHash.js';

it('hashToken deterministik ve 64 hex', () => {
  const raw = 'abc123';
  assert.match(hashToken(raw), /^[a-f0-9]{64}$/);
  assert.equal(hashToken(raw), hashToken(raw));
  assert.notEqual(hashToken(raw), raw);
});
