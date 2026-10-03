// server/test/admin-activity-endpoint.test.js
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import ActivityEvent from '../src/models/ActivityEvent.js';
import User from '../src/models/User.js';
import Permission from '../src/models/Permission.js';
import Role from '../src/models/Role.js';
import { listActivity } from '../src/controllers/admin.js';
import { requirePermission, initDefaultPermissions, initDefaultRoles } from '../src/services/permissions.js';

function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

describe('GET /admin/activity — listActivity', () => {
  before(async () => {
    await mongoose.connect('mongodb://localhost:27017/betzone_test_admin_activity_endpoint');
  });
  after(async () => { await mongoose.disconnect(); });
  beforeEach(async () => {
    await ActivityEvent.deleteMany({});
    await User.deleteMany({});
    await Permission.deleteMany({});
    await Role.deleteMany({});
  });

  it('son event\'leri en yeniden eskiye sayfalar', async () => {
    const userId = new mongoose.Types.ObjectId();
    await ActivityEvent.create({ type: 'deposit', userId, status: 'completed', summary: 'a' });
    await ActivityEvent.create({ type: 'bet_placed', userId, status: 'pending', summary: 'b' });

    const req = { query: {} };
    const res = fakeRes();
    await listActivity(req, res, () => {});

    assert.equal(res.body.events.length, 2);
    assert.equal(res.body.events[0].summary, 'b'); // en yeni önce
  });

  it('type filtresi uygular', async () => {
    const userId = new mongoose.Types.ObjectId();
    await ActivityEvent.create({ type: 'deposit', userId, status: 'completed', summary: 'a' });
    await ActivityEvent.create({ type: 'bet_placed', userId, status: 'pending', summary: 'b' });

    const req = { query: { type: 'deposit' } };
    const res = fakeRes();
    await listActivity(req, res, () => {});

    assert.equal(res.body.events.length, 1);
    assert.equal(res.body.events[0].type, 'deposit');
  });

  it('page=0 sayfa 1 gibi davranır, 500 vermez', async () => {
    const userId = new mongoose.Types.ObjectId();
    await ActivityEvent.create({ type: 'deposit', userId, status: 'completed', summary: 'a' });
    await ActivityEvent.create({ type: 'bet_placed', userId, status: 'pending', summary: 'b' });

    const req = { query: { page: '0' } };
    const res = fakeRes();
    let nextErr = null;
    await listActivity(req, res, (e) => { nextErr = e; });

    assert.equal(nextErr, null);
    assert.equal(res.body.page, 1);
    assert.equal(res.body.events.length, 2);
    assert.equal(res.body.events[0].summary, 'b');
  });

  it('limit=0 tüm doc\'ları getirir, limit=-5 en az 1\'e clamplenir, pages finite', async () => {
    const userId = new mongoose.Types.ObjectId();
    await ActivityEvent.create({ type: 'deposit', userId, status: 'completed', summary: 'a' });
    await ActivityEvent.create({ type: 'bet_placed', userId, status: 'pending', summary: 'b' });
    await ActivityEvent.create({ type: 'withdraw', userId, status: 'completed', summary: 'c' });

    // limit=0 → default 20 → 3 doc, 1 sayfa
    const resZero = fakeRes();
    let errZero = null;
    await listActivity({ query: { limit: '0' } }, resZero, (e) => { errZero = e; });
    assert.equal(errZero, null);
    assert.equal(resZero.body.events.length, 3);
    assert.equal(resZero.body.pages, 1);

    // limit=-5 → 1'e clamplenir → sayfalanır ama pages finite
    const resNeg = fakeRes();
    let errNeg = null;
    await listActivity({ query: { limit: '-5' } }, resNeg, (e) => { errNeg = e; });
    assert.equal(errNeg, null);
    assert.equal(resNeg.body.events.length, 1);
    assert.equal(resNeg.body.pages, 3);
    assert.ok(Number.isFinite(resNeg.body.pages));
  });

  it('non-numeric page/limit 500 veya NaN vermez', async () => {
    const userId = new mongoose.Types.ObjectId();
    await ActivityEvent.create({ type: 'deposit', userId, status: 'completed', summary: 'a' });

    const req = { query: { page: 'abc', limit: 'xyz' } };
    const res = fakeRes();
    let nextErr = null;
    await listActivity(req, res, (e) => { nextErr = e; });

    assert.equal(nextErr, null);
    assert.equal(res.body.page, 1);
    assert.equal(res.body.pages, 1);
    assert.ok(Number.isFinite(res.body.pages));
    assert.equal(res.body.events.length, 1);
  });
});

// Spec §Test (2026-09-22-admin-activity-feed-design.md:115): "GET /admin/activity:
// izin kontrolü (admin:activity:read olmadan 403)". Route requirePermission ile
// bağlı (routes/admin.js:73) — burada middleware, admin-create-user.test.js'teki
// fake req/res/next deseniyle doğrudan çağrılıyor (bu depoda HTTP+JWT admin
// harness'i yok, bkz. slikair-payout.test.js notu).
describe('GET /admin/activity — requirePermission(admin:activity:read)', () => {
  before(async () => {
    await mongoose.connect('mongodb://localhost:27017/betzone_test_admin_activity_endpoint');
  });
  after(async () => { await mongoose.disconnect(); });
  beforeEach(async () => {
    await ActivityEvent.deleteMany({});
    await User.deleteMany({});
    await Permission.deleteMany({});
    await Role.deleteMany({});
  });

  it('admin:activity:read izni OLMAYAN istek 403 FORBIDDEN ile reddedilir', async () => {
    await initDefaultPermissions();
    await initDefaultRoles();

    // role=user, roles[] boş → hiçbir granular izni yok (H1: role===admin tek başına yetmiyor)
    const user = await User.create({ username: 'nopermuser', email: 'nopermuser@test.com', password: 'x', role: 'user' });

    const mw = requirePermission('admin:activity:read');
    const req = { user: { id: user._id } };
    const res = fakeRes();
    let nextErr = null;
    await mw(req, res, (e) => { if (e) nextErr = e; });

    assert.ok(nextErr, 'izin yoksa next(error) çağrılmalı');
    assert.equal(nextErr.status, 403);
    assert.equal(nextErr.code, 'FORBIDDEN');
    assert.equal(nextErr.message, 'Yetki yok: admin:activity:read');
  });

  it('admin:activity:read izni OLAN istek middleware\'den geçer ve listActivity başarıyla döner', async () => {
    await initDefaultPermissions();
    await initDefaultRoles();
    const superAdminRole = await Role.findOne({ name: 'super_admin' });
    assert.ok(superAdminRole, 'super_admin rolü seed edilmeli');
    const user = await User.create({ username: 'activityadmin', email: 'activityadmin@test.com', password: 'x', role: 'admin', roles: [superAdminRole._id] });

    const userId = new mongoose.Types.ObjectId();
    await ActivityEvent.create({ type: 'deposit', userId, status: 'completed', summary: 'a' });

    const mw = requirePermission('admin:activity:read');
    const req = { user: { id: user._id }, query: {} };
    const res = fakeRes();
    let nextErr = null;
    // requirePermission başarida next() argümansız çağırır → sadece hata varsa ata
    await mw(req, res, (e) => { if (e) nextErr = e; });
    assert.equal(nextErr, null, nextErr?.message);

    // Middleware izin verdi → controller başarıyla çalışmalı
    await listActivity(req, res, (e) => { if (e) nextErr = e; });
    assert.equal(nextErr, null, nextErr?.message);
    assert.ok(res.body);
    assert.equal(res.body.events.length, 1);
    assert.equal(res.body.events[0].type, 'deposit');
  });
});
