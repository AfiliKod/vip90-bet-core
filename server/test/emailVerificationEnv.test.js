/**
 * Email verification is required in production only (EMAIL_VERIFICATION_REQUIRED).
 * Run: node --test server/test/emailVerificationEnv.test.js
 */
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import { register, login, isEmailVerificationRequired } from '../src/controllers/auth.js';

process.env.JWT_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';

function fakeRes() {
  const res = { statusCode: 200, body: null, cookies: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.cookie = (k, v) => { res.cookies[k] = v; return res; };
  return res;
}
async function call(fn, req) {
  const res = fakeRes();
  let err = null;
  await fn({ ip: '127.0.0.1', headers: { host: 'localhost' }, protocol: 'http', get: () => 'localhost', ...req }, res, (e) => { err = e; });
  return { status: err ? err.status : res.statusCode, err, body: res.body, cookies: res.cookies };
}
const regReq = (username) => ({
  validated: { username, email: `${username}@test.com`, password: 'Passw0rd!', acceptedTerms: true, acceptedKvkk: true },
});
const loginReq = (username) => ({ body: { username, password: 'Passw0rd!' }, validated: { username, password: 'Passw0rd!' } });

describe('isEmailVerificationRequired', () => {
  it('varsayılan: yalnız NODE_ENV=production zorunlu', () => {
    assert.equal(isEmailVerificationRequired({ NODE_ENV: 'production' }), true);
    assert.equal(isEmailVerificationRequired({ NODE_ENV: 'development' }), false);
    assert.equal(isEmailVerificationRequired({}), false);
  });
  it('EMAIL_VERIFICATION_REQUIRED varsayılanı iki yönde ezer', () => {
    assert.equal(isEmailVerificationRequired({ NODE_ENV: 'production', EMAIL_VERIFICATION_REQUIRED: 'false' }), false);
    assert.equal(isEmailVerificationRequired({ NODE_ENV: 'development', EMAIL_VERIFICATION_REQUIRED: 'true' }), true);
    assert.equal(isEmailVerificationRequired({ NODE_ENV: 'production', EMAIL_VERIFICATION_REQUIRED: '' }), true);
  });
});

describe('Kayıt/giriş — doğrulama zorunluluğu', () => {
  const saved = process.env.EMAIL_VERIFICATION_REQUIRED;
  before(async () => { await mongoose.connect('mongodb://localhost:27017/betzone_test_email_verification_env'); });
  after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  beforeEach(async () => { await User.deleteMany({}); });
  afterEach(() => {
    if (saved === undefined) delete process.env.EMAIL_VERIFICATION_REQUIRED;
    else process.env.EMAIL_VERIFICATION_REQUIRED = saved;
  });

  it('zorunlu değilse: kayıt doğrulanmış açılır ve oturum döner', async () => {
    process.env.EMAIL_VERIFICATION_REQUIRED = 'false';
    const r = await call(register, regReq('devuser'));
    assert.equal(r.status, 201, r.err?.message);
    assert.ok(r.body.accessToken);
    assert.ok(r.cookies.refreshToken);
    const u = await User.findOne({ username: 'devuser' }).select('+emailVerificationToken');
    assert.equal(u.emailVerified, true);
    assert.equal(u.emailVerificationToken, null);
  });

  it('zorunluysa: kayıt doğrulanmamış açılır, token dönmez, giriş 403', async () => {
    process.env.EMAIL_VERIFICATION_REQUIRED = 'true';
    const r = await call(register, regReq('produser'));
    assert.equal(r.status, 201, r.err?.message);
    assert.equal(r.body.accessToken, undefined);
    const u = await User.findOne({ username: 'produser' }).select('+emailVerificationToken');
    assert.equal(u.emailVerified, false);
    assert.ok(u.emailVerificationToken);
    const l = await call(login, loginReq('produser'));
    assert.equal(l.status, 403);
    assert.equal(l.err.code, 'EMAIL_NOT_VERIFIED');
  });

  it('zorunlu değilse: doğrulanmamış eski hesap da giriş yapabilir', async () => {
    process.env.EMAIL_VERIFICATION_REQUIRED = 'false';
    await User.create({ username: 'olduser', email: 'old@test.com', password: 'Passw0rd!', emailVerified: false });
    const l = await call(login, loginReq('olduser'));
    assert.equal(l.status, 200, l.err?.message);
    assert.ok(l.body.accessToken);
  });
});
