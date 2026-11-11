process.env.JWT_SECRET = 'test-secret';
import { it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../../src/middleware/auth.js';
import { createChallengeToken } from '../../src/services/twoFactorChallenge.js';

const run = (token) => new Promise((resolve) => {
  const req = { headers: { authorization: `Bearer ${token}` }, method: 'GET', originalUrl: '/x' };
  requireAuth(req, {}, (err) => resolve({ err, req }));
});

it('purpose:2fa taşıyan geçerli JWT requireAuth tarafından 401 INVALID_TOKEN ile reddedilir', async () => {
  const token = jwt.sign({ id: 'u1', purpose: '2fa', tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const { err, req } = await run(token);
  assert.equal(err.status ?? err.statusCode, 401);
  assert.equal(err.code, 'INVALID_TOKEN');
  assert.equal(req.user, undefined);
});

it('createChallengeToken çıktısı da oturum olarak kullanılamaz', async () => {
  const { err, req } = await run(createChallengeToken({ _id: 'u2', tokenVersion: 0 }, 'pwd'));
  assert.equal(err.code, 'INVALID_TOKEN');
  assert.equal(req.user, undefined);
});
