// server/test/demoData-admin-endpoints.test.js
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Role from '../src/models/Role.js';
import Permission from '../src/models/Permission.js';
import Setting from '../src/models/Setting.js';
import { requirePermission, initDefaultPermissions, initDefaultRoles } from '../src/services/permissions.js';
import { getDemoDataStatus, loadDemoDataCategory, clearDemoDataCategory, startDemoDataLive, stopDemoDataLive } from '../src/controllers/admin.js';
import { stopDemoDataLiveJob } from '../src/jobs/demoDataLiveSimulation.js';

function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

describe('admin:demo-data:manage — izin + status/load/clear', () => {
  before(async () => {
    await mongoose.connect('mongodb://localhost:27017/betzone_test_demo_data_endpoints');
  });
  after(async () => {
    stopDemoDataLiveJob();
    // Start sonrası uçan ilk tick'in disconnect'ten önce sönmesini bekle
    await new Promise((r) => setTimeout(r, 300));
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    await User.deleteMany({});
    await Permission.deleteMany({});
    await Role.deleteMany({});
    await Setting.deleteMany({ key: 'demoData.live.config' });
    stopDemoDataLiveJob();
  });

  it('admin:demo-data:manage izni OLMAYAN istek 403 FORBIDDEN ile reddedilir', async () => {
    await initDefaultPermissions();
    await initDefaultRoles();
    const user = await User.create({ username: 'nopermuser2', email: 'nopermuser2@test.com', password: 'x', role: 'user' });

    const mw = requirePermission('admin:demo-data:manage');
    const req = { user: { id: user._id } };
    const res = fakeRes();
    let nextErr = null;
    await mw(req, res, (e) => { if (e) nextErr = e; });

    assert.ok(nextErr, 'izin yoksa next(error) çağrılmalı');
    assert.equal(nextErr.status, 403);
    assert.equal(nextErr.code, 'FORBIDDEN');
  });

  it('izin olan istek middleware\'den geçer, load → status → clear akışı çalışır', async () => {
    await initDefaultPermissions();
    await initDefaultRoles();
    const superAdminRole = await Role.findOne({ name: 'super_admin' });
    assert.ok(superAdminRole, 'super_admin rolü seed edilmeli');
    const admin = await User.create({ username: 'demodataadmin2', email: 'demodataadmin2@test.com', password: 'x', role: 'admin', roles: [superAdminRole._id] });

    const mw = requirePermission('admin:demo-data:manage');
    const req = { user: { id: admin._id } };
    const res = fakeRes();
    let nextErr = null;
    await mw(req, res, (e) => { if (e) nextErr = e; });
    assert.equal(nextErr, null, nextErr?.message);

    const loadRes = fakeRes();
    await loadDemoDataCategory({ params: { category: 'users' }, body: { count: 5 } }, loadRes, (e) => { if (e) nextErr = e; });
    assert.equal(nextErr, null, nextErr?.message);
    assert.ok(loadRes.body.created >= 5);

    const statusRes = fakeRes();
    await getDemoDataStatus({}, statusRes, (e) => { if (e) nextErr = e; });
    assert.equal(nextErr, null, nextErr?.message);
    assert.ok(statusRes.body.categories.users.count >= 5);
    assert.equal(statusRes.body.live.enabled, false);

    const clearRes = fakeRes();
    await clearDemoDataCategory({ params: { category: 'users' } }, clearRes, (e) => { if (e) nextErr = e; });
    assert.equal(nextErr, null, nextErr?.message);
    assert.ok(clearRes.body.deleted >= 5);
  });

  it('geçersiz kategori 400 döner', async () => {
    const res = fakeRes();
    await loadDemoDataCategory({ params: { category: 'unknown' }, body: { count: 5 } }, res, () => {});
    assert.equal(res.statusCode, 400);
  });

  it('count 1-10000 arasına clamp edilir', async () => {
    const res = fakeRes();
    await loadDemoDataCategory({ params: { category: 'users' }, body: { count: 99999 } }, res, () => {});
    assert.ok(res.body.created <= 10000);
  });

  it('canlı başlatma: seed kullanıcı yokken 400 NO_SEED_USERS döner', async () => {
    const res = fakeRes();
    let nextErr = null;
    await startDemoDataLive({ body: { tickIntervalMinutes: 5 } }, res, (e) => { if (e) nextErr = e; });
    assert.equal(nextErr, null, nextErr?.message);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'NO_SEED_USERS');
  });

  it('canlı başlatma: seed kullanıcı varken başarılı olur', async () => {
    const loadRes = fakeRes();
    let nextErr = null;
    await loadDemoDataCategory({ params: { category: 'users' }, body: { count: 3 } }, loadRes, (e) => { if (e) nextErr = e; });
    assert.equal(nextErr, null, nextErr?.message);

    try {
      const startRes = fakeRes();
      await startDemoDataLive({ body: { tickIntervalMinutes: 5 } }, startRes, (e) => { if (e) nextErr = e; });
      assert.equal(nextErr, null, nextErr?.message);
      assert.equal(startRes.body.enabled, true);
      assert.equal(startRes.body.tickIntervalMinutes, 5);
    } finally {
      const stopRes = fakeRes();
      await stopDemoDataLive({ body: {} }, stopRes, () => {});
      stopDemoDataLiveJob();
      // Uçan ilk tick'in kapanıştan önce tamamlanmasını bekle
      await new Promise((r) => setTimeout(r, 50));
    }
  });
});
