process.env.JWT_SECRET = 'test-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
import { it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createChallengeToken, challengeKey, acquireChallenge, releaseChallenge, claimChallenge } from '../../src/services/twoFactorChallenge.js';
import { verifySocketUser } from '../../src/services/socketAuth.js';
import { initSocket } from '../../src/socket/handler.js';
import { initChatSocket } from '../../src/services/chat.js';
import { makeGuestOnly, guestOnly } from '../../src/middleware/guestOnly.js';

const tok = () => createChallengeToken({ _id: 'u1', tokenVersion: 0 }, 'pwd');

function captureNamespaces(init) {
  const mw = {};
  const io = {
    on() {}, emit() {}, use() {},
    of(ns) { return { use(fn) { mw[ns] = fn; }, on() {}, emit() {} }; },
  };
  init(io);
  return mw;
}
const runMw = (fn, token) => new Promise((resolve) => {
  const socket = { handshake: { auth: { token } } };
  fn(socket, (err) => resolve({ err, socket }));
});

it('challenge yalnız challenge anahtarıyla doğrulanır, JWT_SECRET ile doğrulanmaz', () => {
  const t = tok();
  assert.throws(() => jwt.verify(t, process.env.JWT_SECRET));
  assert.equal(jwt.verify(t, challengeKey()).purpose, '2fa');
  assert.ok(claimChallenge(t));
});

it('socket doğrulayıcısı challenge ve purpose taşıyan token\'ı reddeder (DB\'ye gitmeden)', async () => {
  assert.equal(await verifySocketUser(tok()), null);
  const sameKeyPurpose = jwt.sign({ id: 'u1', purpose: '2fa' }, process.env.JWT_SECRET);
  assert.equal(await verifySocketUser(sameKeyPurpose), null);
});

it('/live ve /chat handshake challenge ve purpose token\'ı reddeder', async () => {
  const live = captureNamespaces(initSocket)['/live'];
  const chat = captureNamespaces(initChatSocket)['/chat'];
  const purposeTok = jwt.sign({ id: 'u1', purpose: '2fa' }, process.env.JWT_SECRET);
  for (const mw of [live, chat]) {
    assert.ok((await runMw(mw, tok())).err);
    assert.ok((await runMw(mw, purposeTok)).err);
  }
});

it('guestOnly challenge token\'ını oturum saymaz', async () => {
  const purposeTok = jwt.sign({ id: 'u1', purpose: '2fa' }, process.env.JWT_SECRET);
  for (const t of [tok(), purposeTok]) {
    const err = await new Promise((resolve) => guestOnly({ headers: { authorization: `Bearer ${t}` }, cookies: {} }, {}, resolve));
    assert.equal(err, undefined);
  }
});

it('acquireChallenge eşzamanlı ikinci alımı reddeder', () => {
  const p = claimChallenge(tok());
  assert.equal(acquireChallenge(p.jti), true);
  assert.equal(acquireChallenge(p.jti), false);
  releaseChallenge(p.jti);
  assert.equal(acquireChallenge(p.jti), true);
});
