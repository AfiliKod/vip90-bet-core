process.env.JWT_SECRET = 'test-secret';
import { it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createChallengeToken, claimChallenge, markChallengeUsed, recordChallengeFailure } from '../../src/services/twoFactorChallenge.js';

it('challenge tek kullanımlık', () => {
  const token = createChallengeToken({ _id: 'u1', tokenVersion: 3 }, 'pwd');
  const p = claimChallenge(token);
  assert.equal(p.purpose, '2fa');
  markChallengeUsed(p.jti);
  assert.throws(() => claimChallenge(token), /kullanılmış/);
});

it('5 hatalı denemeden sonra kilitlenir', () => {
  const token = createChallengeToken({ _id: 'u2', tokenVersion: 0 }, 'pwd');
  const p = claimChallenge(token);
  for (let i = 0; i < 4; i++) assert.equal(claimChallenge(token).jti, p.jti);
  assert.throws(() => claimChallenge(token), (e) => e.code === 'TOO_MANY_ATTEMPTS' || /deneme/.test(e.message));
  assert.equal(recordChallengeFailure(p.jti).locked, true);
});

it('oturum token\'ı (purpose yok) ve yanlış imza challenge olarak kabul edilmez', () => {
  const session = jwt.sign({ id: 'u3', jti: 'x' }, process.env.JWT_SECRET);
  assert.throws(() => claimChallenge(session), (e) => e.code === 'INVALID_CHALLENGE');
  const forged = jwt.sign({ id: 'u3', purpose: '2fa', jti: 'x' }, 'other-secret');
  assert.throws(() => claimChallenge(forged), (e) => e.code === 'INVALID_CHALLENGE');
});

it('süresi dolmuş challenge reddedilir', () => {
  const expired = jwt.sign({ id: 'u4', purpose: '2fa', jti: 'e1' }, process.env.JWT_SECRET, { expiresIn: -10 });
  assert.throws(() => claimChallenge(expired), (e) => e.code === 'INVALID_CHALLENGE');
});
