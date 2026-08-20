import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectSession, makeGuestOnly } from '../src/middleware/guestOnly.js';

/** Geçerli imza taklidi: token 'ok:' ile başlarsa payload döner, aksi halde atar. */
const verifier = prefix => token => {
  if (!token.startsWith(prefix)) throw new Error('invalid');
  return JSON.parse(token.slice(prefix.length));
};

const deps = (users = {}) => ({
  verifyAccess: verifier('access:'),
  verifyRefresh: verifier('refresh:'),
  findUser: async id => users[id] || null,
});

const reqWith = ({ bearer, cookie } = {}) => ({
  headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  cookies: cookie ? { refreshToken: cookie } : {},
});

describe('detectSession', () => {
  test('hiç token yoksa oturum yok', async () => {
    assert.strictEqual(await detectSession(reqWith(), deps()), false);
  });

  test('geçerli access token oturum sayılır', async () => {
    const req = reqWith({ bearer: 'access:{"id":"u1"}' });
    assert.strictEqual(await detectSession(req, deps()), true);
  });

  test('süresi dolmuş/bozuk access token oturum sayılmaz', async () => {
    const req = reqWith({ bearer: 'bozuk-token' });
    assert.strictEqual(await detectSession(req, deps()), false);
  });

  test('tokenVersion uyuşan refresh cookie oturum sayılır', async () => {
    const req = reqWith({ cookie: 'refresh:{"id":"u1","family":3}' });
    assert.strictEqual(await detectSession(req, deps({ u1: { tokenVersion: 3 } })), true);
  });

  test('iptal edilmiş refresh cookie oturum sayılmaz (girişi kilitlemez)', async () => {
    const req = reqWith({ cookie: 'refresh:{"id":"u1","family":2}' });
    assert.strictEqual(await detectSession(req, deps({ u1: { tokenVersion: 7 } })), false);
  });

  test('kullanıcısı silinmiş refresh cookie oturum sayılmaz', async () => {
    const req = reqWith({ cookie: 'refresh:{"id":"yok","family":0}' });
    assert.strictEqual(await detectSession(req, deps()), false);
  });

  test('bozuk refresh cookie oturum sayılmaz', async () => {
    const req = reqWith({ cookie: 'çöp' });
    assert.strictEqual(await detectSession(req, deps()), false);
  });
});

describe('guestOnly middleware', () => {
  const run = async (req, d) => {
    const calls = [];
    await makeGuestOnly(d)(req, {}, err => calls.push(err));
    return calls[0];
  };

  test('oturumsuz istek geçer', async () => {
    assert.strictEqual(await run(reqWith(), deps()), undefined);
  });

  test('oturumlu istek 403 ALREADY_AUTHENTICATED ile reddedilir', async () => {
    const err = await run(reqWith({ bearer: 'access:{"id":"u1"}' }), deps());
    assert.strictEqual(err.status, 403);
    assert.strictEqual(err.code, 'ALREADY_AUTHENTICATED');
  });

  test('oturum tespiti patlarsa istek engellenmez', async () => {
    const broken = { ...deps(), verifyAccess: () => { throw Object.assign(new Error('db down')); },
      findUser: async () => { throw new Error('db down'); } };
    const err = await run(reqWith({ cookie: 'refresh:{"id":"u1","family":0}' }), broken);
    assert.strictEqual(err, undefined);
  });
});
