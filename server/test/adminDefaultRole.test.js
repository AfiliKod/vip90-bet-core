/**
 * Panelden rol seçilmeden açılan admin, varsayılan 'admin' sistem rolünü alır.
 * Eskiden `roles: []` ile kalıyor, /api/admin/activity dahil tüm ayrıntılı
 * izinlerde 403 "Yetki yok" alıyordu (sunucu yeniden başlayana dek).
 *
 * Çalıştırmak için: node --test test/adminDefaultRole.test.js
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Role from '../src/models/Role.js';
import Permission from '../src/models/Permission.js';
import { initDefaultPermissions, initDefaultRoles, userHasPermission } from '../src/services/permissions.js';
import { createUser } from '../src/controllers/admin.js';

function callCreate(validated, actorId) {
  return new Promise((resolve) => {
    const res = { status(c) { this.code = c; return this; }, json(b) { resolve({ status: this.code, body: b }); } };
    createUser({ validated, user: { id: String(actorId) } }, res, (e) => resolve({ status: e.status, error: e.code }));
  });
}

describe('Panelden açılan admin varsayılan rolü alır', () => {
  let actor;
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_admin_default_role');
  });
  after(async () => { await mongoose.disconnect(); });
  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Role.deleteMany({}), Permission.deleteMany({})]);
    await initDefaultPermissions();
    await initDefaultRoles();
    actor = await User.create({ username: 'kurucu', email: 'kurucu@test.com', password: 'Pass1234', role: 'admin' });
  });

  it('role=admin, roles boş → admin rolü atanır, admin:activity:read izni vardır', async () => {
    const r = await callCreate({ username: 'yeni_admin', email: 'yeni_admin@test.com', password: 'Pass1234!', role: 'admin' }, actor._id);
    assert.equal(r.status, 201);
    const u = await User.findOne({ username: 'yeni_admin' }).populate('roles');
    assert.deepEqual(u.roles.map(x => x.name), ['admin']);
    assert.equal(await userHasPermission(u._id, 'admin:activity:read'), true);
    assert.equal(await userHasPermission(u._id, 'admin:roles:write'), false, 'super_admin değil, rol yönetimi yok');
    assert.deepEqual(r.body.user.roles.map(String), [String(u.roles[0]._id)]);
  });

  it('normal kullanıcıya rol atanmaz', async () => {
    await callCreate({ username: 'oyuncu', email: 'oyuncu@test.com', password: 'Pass1234!', role: 'user' }, actor._id);
    const u = await User.findOne({ username: 'oyuncu' });
    assert.equal(u.roles.length, 0);
  });
});
