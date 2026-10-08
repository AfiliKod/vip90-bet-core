/**
 * Demo veri (isSeed) hesaplarının güvenliği — eskiden tüm seed kullanıcılar
 * kaynakta açık duran `SeedUser1234!` parolasını paylaşıyor, pozitif
 * bakiyeleri vardı ve bir kısmı (e-posta doğrulama kesim tarihinden önceye
 * tarihlendikleri için) giriş yapabiliyordu.
 *
 * Çalıştırmak için: node --test test/demoSeedSecurity.test.js
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../src/models/User.js';
import LoginAttempt from '../src/models/LoginAttempt.js';
import { login, refresh, signAccess } from '../src/controllers/auth.js';
import { requireAuth } from '../src/middleware/auth.js';
import * as userSeed from '../src/services/demoData/userSeed.js';

process.env.JWT_SECRET ||= 'test_jwt_secret_demo_seed_security_0123456789';
process.env.JWT_REFRESH_SECRET ||= 'test_refresh_secret_demo_seed_security_0123';
const OLD_PASSWORD = 'SeedUser1234!';

function call(handler, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200, cookies: {},
      status(c) { this.statusCode = c; return this; },
      json(b) { resolve({ status: this.statusCode, body: b }); },
      cookie() { return this; },
    };
    handler(req, res, (err) => resolve(err ? { status: err.status, code: err.code } : { status: 200, next: true }));
  });
}

const loginReq = (username, password) => ({
  validated: { username, password }, ip: '127.0.0.1', headers: { 'user-agent': 'test' }, cookies: {},
});

describe('Demo veri hesapları oturum açamaz', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_demo_seed_security');
  });
  after(async () => { await mongoose.disconnect(); });
  beforeEach(async () => { await User.deleteMany({}); await LoginAttempt.deleteMany({}); });

  it('eski sabit parolaya sahip, doğrulama öncesine tarihli seed hesabı giriş yapamaz', async () => {
    // Eski üreticinin yazdığı şekil: sabit parola, kesim tarihinden önce, bakiye > 0.
    await User.collection.insertOne({
      username: 'eski_seed', email: 'eski_seed@seed.local', password: await bcrypt.hash(OLD_PASSWORD, 4),
      role: 'user', isSeed: true, isActive: true, balance: 900, emailVerified: false,
      createdAt: new Date('2026-07-05'), updatedAt: new Date('2026-07-05'), tokenVersion: 0,
    });
    const r = await call(login, loginReq('eski_seed', OLD_PASSWORD));
    assert.equal(r.status, 401);
    assert.equal(r.code, 'INVALID_CREDENTIALS');
    const attempt = await LoginAttempt.findOne({ username: 'eski_seed' }).lean();
    assert.equal(attempt.failReason, 'seed_account');
  });

  it('aynı koşullardaki gerçek kullanıcı giriş yapabilir (kontrol grubu)', async () => {
    await User.collection.insertOne({
      username: 'gercek', email: 'gercek@test.com', password: await bcrypt.hash(OLD_PASSWORD, 4),
      role: 'user', isActive: true, balance: 900, emailVerified: false,
      createdAt: new Date('2026-07-05'), updatedAt: new Date('2026-07-05'), tokenVersion: 0,
    });
    const r = await call(login, loginReq('gercek', OLD_PASSWORD));
    assert.equal(r.status, 200);
    assert.ok(r.body.accessToken);
  });

  it('seed hesabına önceden basılmış access token requireAuth\'tan geçmez', async () => {
    const u = await User.create({ username: 'seed_tok', email: 'seed_tok@seed.local', password: 'Pass1234', isSeed: true });
    const token = signAccess(u);
    const r = await call(requireAuth, { headers: { authorization: `Bearer ${token}` }, method: 'GET', originalUrl: '/api/bank/withdraw' });
    assert.equal(r.status, 401);
    assert.equal(r.code, 'INVALID_TOKEN');
  });

  it('gerçek kullanıcının token\'ı requireAuth\'tan geçer (kontrol grubu)', async () => {
    const u = await User.create({ username: 'real_tok', email: 'real_tok@test.com', password: 'Pass1234' });
    const r = await call(requireAuth, { headers: { authorization: `Bearer ${signAccess(u)}` }, method: 'GET', originalUrl: '/x' });
    assert.equal(r.status, 200);
    assert.equal(r.next, true);
  });

  it('seed hesabı refresh cookie ile oturum yenileyemez', async () => {
    const u = await User.create({ username: 'seed_ref', email: 'seed_ref@seed.local', password: 'Pass1234', isSeed: true });
    const cookie = jwt.sign({ id: u._id, family: 0 }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
    const r = await call(refresh, { cookies: { refreshToken: cookie }, headers: {} });
    assert.equal(r.status, 401);
  });

  it('üretici artık bilinen bir parola yazmıyor ve her yüklemede farklı hash kullanıyor', async () => {
    await userSeed.load(2);
    const first = await User.find({ isSeed: true }).select('+password').lean();
    await userSeed.load(1);
    const all = await User.find({ isSeed: true }).select('+password').lean();
    const third = all.find(u => !first.some(f => String(f._id) === String(u._id)));
    for (const u of all) assert.equal(await bcrypt.compare(OLD_PASSWORD, u.password), false);
    assert.notEqual(third.password, first[0].password);
  });
});
