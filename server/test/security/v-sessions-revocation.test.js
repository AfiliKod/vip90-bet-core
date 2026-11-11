process.env.JWT_SECRET = 'test-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import { issueSession, signAccess, signRefresh } from '../../src/services/session.js';
import { refresh } from '../../src/controllers/auth.js';
import { updateUser, deleteUser } from '../../src/controllers/admin.js';
import { requireAuth, invalidateTokenVersionCache } from '../../src/middleware/auth.js';
import { verifySocketUser } from '../../src/services/socketAuth.js';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/v_sessions_revocation_test';
const NAMES = ['vsrsusp1', 'vsrdel1', 'vsrok1', 'vsrbot1'];

describe('Askıya alınan/silinen hesabın oturumları kesilir', async () => {
  let connected = false;
  try { await mongoose.connect(URI, { serverSelectionTimeoutMS: 2000 }); connected = true; } catch { /* skip */ }
  const opts = { skip: !connected && 'MongoDB yok' };
  after(async () => { if (connected) { await User.deleteMany({ username: { $in: NAMES } }); await mongoose.disconnect(); } });

  const mk = (username, extra = {}) => User.create({ username, email: `${username}@test.dev`, password: 'Passw0rd!x', emailVerified: true, ...extra });
  const callRefresh = (token) => new Promise((resolve) => {
    const res = { cookies: {}, cookie(n, v) { this.cookies[n] = v; }, json(b) { resolve({ ok: true, body: b }); }, status() { return this; } };
    refresh({ cookies: { refreshToken: token } }, res, (e) => resolve({ ok: false, err: e }));
  });
  const callAdmin = (fn, req) => new Promise((resolve, reject) => {
    const res = { status() { return this; }, json(b) { resolve(b); } };
    fn({ user: { id: String(new mongoose.Types.ObjectId()) }, ...req }, res, reject); // V5: actor required
  });
  const authed = (token) => new Promise((resolve) => {
    requireAuth({ headers: { authorization: `Bearer ${token}` }, method: 'GET', originalUrl: '/x' }, {}, (e) => resolve(!e));
  });

  for (const [label, extra] of [['askıda', { isActive: false }], ['silinmiş', { deletedAt: new Date(), isActive: true }]]) {
    it(`${label} hesap: issueSession (cüzdan/google/telegram) 403 ACCOUNT_BANNED`, opts, async () => {
      await User.deleteMany({ username: 'vsrsusp1' });
      const u = await mk('vsrsusp1', extra);
      for (const method of ['wallet', 'google', 'telegram']) {
        await assert.rejects(issueSession(u, { method }), (e) => e.code === 'ACCOUNT_BANNED' && e.status === 403);
      }
    });
  }

  it('askıya alınan hesap: refresh, requireAuth ve socket reddedilir', opts, async () => {
    await User.deleteMany({ username: 'vsrsusp1' });
    const u = await mk('vsrsusp1');
    assert.equal(await authed(signAccess(u)), true);
    assert.ok(await verifySocketUser(signAccess(u)));
    const a = signAccess(u); const r = signRefresh(u);
    await User.collection.updateOne({ _id: u._id }, { $set: { isActive: false } });
    invalidateTokenVersionCache(u._id);
    assert.equal((await callRefresh(r)).ok, false);
    assert.equal(await authed(a), false);
    assert.equal(await verifySocketUser(a), null);
  });

  it('aktif hesabın refresh\'i çalışır', opts, async () => {
    await User.deleteMany({ username: 'vsrok1' });
    const u = await mk('vsrok1');
    assert.equal((await callRefresh(signRefresh(u))).ok, true);
  });

  it('silinmiş hesap: refresh, requireAuth ve socket reddedilir', opts, async () => {
    await User.deleteMany({ username: 'vsrdel1' });
    const u = await mk('vsrdel1');
    const a = signAccess(u); const r = signRefresh(u);
    await User.collection.updateOne({ _id: u._id }, { $set: { deletedAt: new Date() } });
    invalidateTokenVersionCache(u._id);
    assert.equal((await callRefresh(r)).ok, false);
    assert.equal(await authed(a), false);
    assert.equal(await verifySocketUser(a), null);
  });

  it('kaydı olmayan kullanıcının token\'ı reddedilir', opts, async () => {
    const ghost = { _id: new mongoose.Types.ObjectId(), role: 'user', tokenVersion: 0 };
    const a = signAccess(ghost);
    assert.equal(await authed(a), false);
    assert.equal(await verifySocketUser(a), null);
  });

  it('updateUser isActive:false tokenVersion artırır, diğer alanlar artırmaz', opts, async () => {
    await User.deleteMany({ username: 'vsrok1' });
    const u = await mk('vsrok1');
    const a = signAccess(u);
    assert.equal(await authed(a), true);
    await callAdmin(updateUser, { params: { id: String(u._id) }, body: { kycVerified: true } });
    assert.equal((await User.findById(u._id)).tokenVersion || 0, 0);
    assert.equal(await authed(a), true);
    await callAdmin(updateUser, { params: { id: String(u._id) }, body: { isActive: false } });
    assert.equal((await User.findById(u._id)).tokenVersion, 1);
    assert.equal(await authed(a), false);
    assert.equal(await verifySocketUser(a), null);
  });

  it('deleteUser tokenVersion artırır ve açık oturumu keser', opts, async () => {
    await User.deleteMany({ username: 'vsrdel1' });
    const u = await mk('vsrdel1');
    const a = signAccess(u); const r = signRefresh(u);
    assert.equal(await authed(a), true);
    await callAdmin(deleteUser, { params: { id: String(u._id) } });
    assert.equal((await User.findById(u._id)).tokenVersion, 1);
    assert.equal(await authed(a), false);
    assert.equal((await callRefresh(r)).ok, false);
  });

  it('bot kullanıcı (isBot, isActive varsayılan true) token\'ı kabul edilir', opts, async () => {
    await User.deleteMany({ username: 'vsrbot1' });
    const bot = await mk('vsrbot1', { isBot: true });
    assert.equal(bot.isActive, true);
    assert.equal(await authed(signAccess(bot)), true);
  });
});
