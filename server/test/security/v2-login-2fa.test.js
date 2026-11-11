process.env.OPERATOR_SECRET_ENCRYPTION_KEY = 'c'.repeat(64);
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import speakeasy from 'speakeasy';
import jwt from 'jsonwebtoken';
import User from '../../src/models/User.js';
import LoginAttempt from '../../src/models/LoginAttempt.js';
import { issueSession } from '../../src/services/session.js';
import { login, verifyLogin2fa, refresh } from '../../src/controllers/auth.js';
import { requireAuth } from '../../src/middleware/auth.js';
import { encryptTwoFactorSecret, writeBackupCodes } from '../../src/services/twoFactorAuth.js';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/v2_login_2fa_test';

describe('V2 giriş 2FA', async () => {
  let connected = false;
  try { await mongoose.connect(URI, { serverSelectionTimeoutMS: 2000 }); connected = true; } catch { /* skip */ }
  const opts = { skip: !connected && 'MongoDB yok' };
  const names = ['v2plain', 'v2tfa'];
  after(async () => {
    if (connected) { await User.deleteMany({ username: { $in: names } }); await LoginAttempt.deleteMany({ username: { $in: names } }); await mongoose.disconnect(); }
  });

  const secret = speakeasy.generateSecret({ length: 20 }).base32;
  const totp = () => speakeasy.totp({ secret, encoding: 'base32' });
  const call = (fn, req) => new Promise((resolve, reject) => {
    const res = { cookies: {}, cookie(n, v) { this.cookies[n] = v; }, json(b) { resolve({ body: b, res }); }, status() { return this; } };
    fn({ headers: {}, cookies: {}, ip: '127.0.0.1', ...req }, res, (e) => reject(e));
  });
  const fail = (fn, req) => call(fn, req).then(() => assert.fail('hata bekleniyordu'), (e) => e);

  async function seed(username, tfa) {
    await User.deleteMany({ username });
    await LoginAttempt.deleteMany({ username });
    const u = await User.create({ username, email: `${username}@test.dev`, password: 'Passw0rd!x', emailVerified: true });
    if (tfa) {
      await User.collection.updateOne({ _id: u._id }, { $set: {
        twoFactorEnabled: true,
        twoFactorSecret: encryptTwoFactorSecret(secret),
        twoFactorBackupCodes: writeBackupCodes(['abcd1234']),
      } });
    }
    return User.findById(u._id);
  }

  it('2FA kapalı: issueSession access+refresh döner, tokenVersion artar', opts, async () => {
    const u = await seed('v2plain', false);
    const before = u.tokenVersion || 0;
    const s = await issueSession(u, { method: 'pwd' });
    assert.equal(s.requires2fa, false);
    assert.ok(s.accessToken && s.refreshToken);
    assert.equal((await User.findById(u._id)).tokenVersion, before + 1);
    assert.deepEqual(jwt.verify(s.accessToken, process.env.JWT_SECRET).amr, ['pwd']);
  });

  it('2FA açık: issueSession yalnız challenge döner, tokenVersion değişmez', opts, async () => {
    const u = await seed('v2tfa', true);
    const before = u.tokenVersion || 0;
    const s = await issueSession(u, { method: 'wallet' });
    assert.equal(s.requires2fa, true);
    assert.ok(s.challengeToken);
    assert.equal(s.accessToken, undefined);
    assert.equal(s.refreshToken, undefined);
    assert.equal((await User.findById(u._id)).tokenVersion, before);
  });

  it('login: 2FA\'lı hesapta token, cookie ve kullanıcı nesnesi yok', opts, async () => {
    await seed('v2tfa', true);
    const { body, res } = await call(login, { validated: { username: 'v2tfa', password: 'Passw0rd!x' } });
    assert.equal(body.requires2fa, true);
    assert.ok(body.challengeToken);
    assert.deepEqual(Object.keys(body).sort(), ['challengeToken', 'requires2fa']);
    assert.equal(res.cookies.refreshToken, undefined);
  });

  it('verifyLogin2fa: doğru TOTP oturum verir, challenge tek kullanımlık, access token çalışır', opts, async () => {
    await seed('v2tfa', true);
    const { body: ch } = await call(login, { validated: { username: 'v2tfa', password: 'Passw0rd!x' } });
    const { body, res } = await call(verifyLogin2fa, { validated: { challengeToken: ch.challengeToken, token: totp() } });
    assert.ok(body.accessToken);
    assert.deepEqual(body.amr, ['pwd', 'otp']);
    assert.ok(res.cookies.refreshToken);
    assert.equal(body.user.twoFactorSecret, undefined);
    // eski challenge yeniden kullanılamaz
    const e = await fail(verifyLogin2fa, { validated: { challengeToken: ch.challengeToken, token: totp() } });
    assert.equal(e.code, 'CHALLENGE_USED');
    // üretilen access token gerçekten geçerli bir oturum
    const r = await new Promise((resolve) => {
      const req = { headers: { authorization: `Bearer ${body.accessToken}` }, method: 'GET', originalUrl: '/x' };
      requireAuth(req, {}, (err) => resolve({ err, req }));
    });
    assert.equal(r.err, undefined);
  });

  it('verifyLogin2fa: yanlış kod 401, 5 denemede kilit', opts, async () => {
    await seed('v2tfa', true);
    const { body: ch } = await call(login, { validated: { username: 'v2tfa', password: 'Passw0rd!x' } });
    const e = await fail(verifyLogin2fa, { validated: { challengeToken: ch.challengeToken, token: '000000' } });
    assert.equal(e.status ?? e.statusCode, 401);
    for (let i = 0; i < 4; i++) await fail(verifyLogin2fa, { validated: { challengeToken: ch.challengeToken, token: '000000' } });
    const locked = await fail(verifyLogin2fa, { validated: { challengeToken: ch.challengeToken, token: totp() } });
    assert.equal(locked.code, 'TOO_MANY_ATTEMPTS');
  });

  it('verifyLogin2fa: yedek kod bir kez çalışır', opts, async () => {
    await seed('v2tfa', true);
    const c1 = (await call(login, { validated: { username: 'v2tfa', password: 'Passw0rd!x' } })).body;
    const ok = await call(verifyLogin2fa, { validated: { challengeToken: c1.challengeToken, token: 'abcd1234' } });
    assert.ok(ok.body.accessToken);
    const c2 = (await call(login, { validated: { username: 'v2tfa', password: 'Passw0rd!x' } })).body;
    const e = await fail(verifyLogin2fa, { validated: { challengeToken: c2.challengeToken, token: 'abcd1234' } });
    assert.equal(e.status ?? e.statusCode, 401);
  });

  it('challenge sonrası tokenVersion değiştiyse (2FA açma/parola) reddedilir; eski refresh TOKEN_REVOKED', opts, async () => {
    const u = await seed('v2plain', false);
    const s = await issueSession(u, { method: 'pwd' });
    await User.updateOne({ _id: u._id }, { $inc: { tokenVersion: 1 } }); // 2FA açma -> invalidateUserTokens
    const e = await fail(refresh, { cookies: { refreshToken: s.refreshToken } });
    assert.equal(e.code, 'TOKEN_REVOKED');
  });

  it('paralel gönderim: yalnız biri oturum alır (TOTP)', opts, async () => {
    await seed('v2tfa', true);
    const { body: ch } = await call(login, { validated: { username: 'v2tfa', password: 'Passw0rd!x' } });
    const v = { validated: { challengeToken: ch.challengeToken, token: totp() } };
    const r = await Promise.allSettled([call(verifyLogin2fa, v), call(verifyLogin2fa, v)]);
    assert.equal(r.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal(r.filter(x => x.status === 'rejected').length, 1);
  });

  it('paralel gönderim: aynı yedek kod iki oturum üretmez', opts, async () => {
    await seed('v2tfa', true);
    const c1 = (await call(login, { validated: { username: 'v2tfa', password: 'Passw0rd!x' } })).body;
    const c2 = (await call(login, { validated: { username: 'v2tfa', password: 'Passw0rd!x' } })).body;
    const r = await Promise.allSettled([
      call(verifyLogin2fa, { validated: { challengeToken: c1.challengeToken, token: 'abcd1234' } }),
      call(verifyLogin2fa, { validated: { challengeToken: c2.challengeToken, token: 'abcd1234' } }),
    ]);
    assert.equal(r.filter(x => x.status === 'fulfilled').length, 1);
  });

  it('hesap başına yanlış 2FA sınırı: farklı IP/challenge ile aşılamaz', opts, async () => {
    const u = await seed('v2tfa', true);
    for (let i = 0; i < 10; i++) {
      await LoginAttempt.create({ userId: u._id, username: 'v2tfa', ip: `10.0.0.${i}`, success: false, failReason: 'wrong_2fa' });
    }
    // yeni challenge de verilmez (parola doğru olsa bile)
    const e = await fail(login, { validated: { username: 'v2tfa', password: 'Passw0rd!x' } });
    assert.equal(e.code, 'TOO_MANY_ATTEMPTS');
    // doğru kodla bile mevcut challenge reddedilir
    const { createChallengeToken } = await import('../../src/services/twoFactorChallenge.js');
    const t = createChallengeToken(u, 'pwd');
    const e2 = await fail(verifyLogin2fa, { ip: '198.51.100.9', validated: { challengeToken: t, token: totp() } });
    assert.equal(e2.code, 'TOO_MANY_ATTEMPTS');
  });

  it('15 eşzamanlı yanlış tahmin (15 challenge): en çok 10 doğrulama, sonra doğru kod da reddedilir', opts, async () => {
    const u = await seed('v2tfa', true);
    const { createChallengeToken } = await import('../../src/services/twoFactorChallenge.js');
    const tokens = Array.from({ length: 15 }, () => createChallengeToken(u, 'pwd'));
    const r = await Promise.allSettled(tokens.map((t, i) =>
      call(verifyLogin2fa, { ip: `8.8.8.${i}`, validated: { challengeToken: t, token: '000000' } })));
    const codes = r.map(x => x.reason?.code);
    assert.equal(codes.filter(c => c === 'INVALID_2FA').length <= 10, true);
    assert.equal(codes.filter(c => c === 'TOO_MANY_ATTEMPTS').length >= 5, true);
    assert.equal(codes.filter(c => c === 'INVALID_2FA').length + codes.filter(c => c === 'TOO_MANY_ATTEMPTS').length, 15);
    const fresh = createChallengeToken(u, 'pwd');
    const e = await fail(verifyLogin2fa, { ip: '198.51.100.7', validated: { challengeToken: fresh, token: totp() } });
    assert.equal(e.code, 'TOO_MANY_ATTEMPTS');
  });
});
