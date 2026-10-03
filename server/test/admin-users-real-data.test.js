/**
 * Admin Users — facets / kpis / satır başına kycTier+riskTier / status=vip.
 * Controller'lar fake req/res ile doğrudan çağrılır (admin-activity-endpoint.test.js deseni).
 *
 * Çalıştırmak için: NODE_ENV=test node --test test/admin-users-real-data.test.js
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import VipLevel from '../src/models/VipLevel.js';
import RiskProfile from '../src/models/RiskProfile.js';
import Permission from '../src/models/Permission.js';
import Role from '../src/models/Role.js';
import { getUsers, getUsersFacets, getUsersKpis } from '../src/controllers/admin.js';
import { requirePermission, initDefaultPermissions, initDefaultRoles } from '../src/services/permissions.js';
import adminRouter from '../src/routes/admin.js';

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
async function call(fn, query = {}) {
  const res = fakeRes();
  let err = null;
  await fn({ query }, res, (e) => { err = e; });
  assert.equal(err, null, err?.message);
  return res.body;
}
const DAY = 24 * 60 * 60 * 1000;
let n = 0;
const mk = (extra = {}) => { n += 1; return User.create({ username: `usr${n}`, email: `usr${n}@t.com`, password: 'x', ...extra }); };

describe('Admin Users — gerçek veri uçları', () => {
  before(async () => { await mongoose.connect('mongodb://localhost:27017/betzone_test_admin_users_real'); });
  after(async () => { await mongoose.disconnect(); });
  beforeEach(async () => {
    await Promise.all([User, VipLevel, RiskProfile, Permission, Role].map(M => M.deleteMany({})));
  });

  it('facets: durum sayaçları ve VIP (taban seviye üstü) doğru', async () => {
    const bronze = await VipLevel.create({ level: 1, name: 'Bronze', xpRequired: 0 });
    const gold = await VipLevel.create({ level: 3, name: 'Gold', xpRequired: 1000 });
    await mk({ vipLevel: bronze._id });
    await mk({ vipLevel: gold._id });
    await mk({ isActive: false });
    await mk({ deletedAt: new Date() });
    await mk({ vipLevel: gold._id, deletedAt: new Date() }); // silinmiş VIP sayılmaz
    const f = await call(getUsersFacets);
    assert.deepEqual(f, { all: 5, active: 2, suspended: 1, deleted: 2, vip: 1 });
  });

  it('kpis: aktif30d, kycPending, avgBalance, newToday; delta null', async () => {
    await mk({ balance: 100, lastLoginAt: new Date() });
    await mk({ balance: 300, lastLoginAt: new Date(Date.now() - 40 * DAY) });
    await mk({ balance: 200, kycStatus: 'pending' });
    await mk({ balance: 9999, kycStatus: 'under_review', deletedAt: new Date() });
    const old = await mk({ balance: 400, kycStatus: 'approved' });
    await User.collection.updateOne({ _id: old._id }, { $set: { createdAt: new Date(Date.now() - 3 * DAY) } });
    const k = await call(getUsersKpis);
    assert.equal(k.active30d, 1);
    assert.equal(k.kycPending, 2);
    assert.equal(k.avgBalance, 250); // silinmiş hariç: (100+300+200+400)/4
    assert.equal(k.newToday, 4);
    assert.equal(k.active30dDeltaPct, null);
    assert.equal(k.avgBalanceDeltaPct, null);
  });

  it('getUsers: kycTier/riskTier toplu eklenir, profili olmayana null', async () => {
    const a = await mk({ kycStatus: 'approved' });
    const b = await mk();
    await RiskProfile.create({ playerId: a._id, riskLevel: 'HIGH' });
    const body = await call(getUsers);
    const byName = Object.fromEntries(body.users.map(u => [u.username, u]));
    assert.equal(byName[a.username].kycTier, 'approved');
    assert.equal(byName[a.username].riskTier, 'high');
    assert.equal(byName[b.username].kycTier, 'not_started');
    assert.equal(byName[b.username].riskTier, null);
    assert.equal(byName[a.username].password, undefined);
  });

  it('getUsers: status=vip yalnız taban üstü seviyeleri döndürür', async () => {
    const bronze = await VipLevel.create({ level: 1, name: 'Bronze', xpRequired: 0 });
    const gold = await VipLevel.create({ level: 3, name: 'Gold', xpRequired: 1000 });
    await mk({ vipLevel: bronze._id });
    const v = await mk({ vipLevel: gold._id });
    const body = await call(getUsers, { status: 'vip' });
    assert.equal(body.total, 1);
    assert.equal(body.users[0].username, v.username);
  });

  it('izin: admin:users:read olmayan 403; rotalar bu izinle bağlı', async () => {
    await initDefaultPermissions();
    await initDefaultRoles();
    const u = await mk({ role: 'user' });
    const res = fakeRes();
    let err = null;
    await requirePermission('admin:users:read')({ user: { id: u._id } }, res, (e) => { if (e) err = e; });
    assert.equal(err?.status, 403);
    for (const path of ['/users/facets', '/users/kpis']) {
      const layer = adminRouter.stack.find(l => l.route?.path === path && l.route.methods.get);
      assert.ok(layer, `${path} rotası yok`);
      assert.equal(layer.route.stack.length, 2, `${path} requirePermission ile korunmalı`);
    }
  });
});
