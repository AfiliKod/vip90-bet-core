/**
 * Admin — createUser (phone/dateOfBirth + admin oluştururken ek rol atama)
 *
 * Controller doğrudan çağrılıyor (bu repo'da admin controller'larını HTTP
 * üzerinden admin JWT'siyle test eden bir emsal yok — bkz. slikair-payout.test.js).
 *
 * Çalıştırmak için: node --test test/admin-create-user.test.js
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Permission from '../src/models/Permission.js';
import Role from '../src/models/Role.js';
import { createUser } from '../src/controllers/admin.js';
import { initDefaultPermissions, initDefaultRoles } from '../src/services/permissions.js';

function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

async function callCreateUser(validated, callerId) {
  const req = { validated, user: { id: callerId } };
  const res = fakeRes();
  let nextErr = null;
  const next = (e) => { nextErr = e; };
  await createUser(req, res, next);
  return { res, nextErr };
}

describe('Admin — createUser', () => {
  before(async () => {
    await mongoose.connect('mongodb://localhost:27017/betzone_test_admin_create_user');
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Permission.deleteMany({});
    await Role.deleteMany({});
  });

  it('phone/dateOfBirth alanlarını kaydeder', async () => {
    const caller = await User.create({ username: 'caller1', email: 'caller1@test.com', password: 'x', role: 'admin' });

    const { res, nextErr } = await callCreateUser({
      username: 'newbie', email: 'newbie@test.com', password: 'password1', role: 'user',
      phone: '+905551234567', dateOfBirth: '1995-06-15',
    }, caller._id.toString());

    assert.equal(nextErr, null, nextErr?.message);
    assert.equal(res.statusCode, 201);

    const fresh = await User.findById(res.body.user._id);
    assert.equal(fresh.phone, '+905551234567');
    assert.equal(fresh.dateOfBirth.toISOString().slice(0, 10), '1995-06-15');
  });

  it('aynı telefon farklı biçimde yazılsa bile ikinci hesaba verilmez', async () => {
    await User.syncIndexes();
    const caller = await User.create({ username: 'caller3', email: 'caller3@test.com', password: 'x', role: 'admin' });

    const first = await callCreateUser({
      username: 'phone1', email: 'phone1@test.com', password: 'password1', role: 'user',
      phone: '+90 555 123 45 67',
    }, caller._id.toString());
    assert.equal(first.nextErr, null, first.nextErr?.message);
    assert.equal((await User.findById(first.res.body.user._id)).phone, '+905551234567');

    const dup = await callCreateUser({
      username: 'phone2', email: 'phone2@test.com', password: 'password1', role: 'user',
      phone: '0555 123 45 67',
    }, caller._id.toString());
    assert.equal(dup.nextErr?.status ?? dup.nextErr?.statusCode, 409);
    assert.equal(dup.nextErr?.code, 'PHONE_EXISTS');

    // Telefonsuz hesaplar (null) benzersizlik kuralına takılmaz
    for (const n of ['nophone1', 'nophone2']) {
      const r = await callCreateUser({ username: n, email: `${n}@test.com`, password: 'password1', role: 'user' }, caller._id.toString());
      assert.equal(r.nextErr, null, r.nextErr?.message);
    }

    // Kontrolü atlayan eşzamanlı yazım index'e takılır
    await assert.rejects(
      User.create({ username: 'race', email: 'race@test.com', password: 'x', phone: '+905551234567' }),
      (e) => e.code === 11000,
    );
  });

  it('role=user iken roles verilse bile (izin var olsa da) reddedilir', async () => {
    await initDefaultPermissions();
    await initDefaultRoles();
    const superAdminRole = await Role.findOne({ name: 'super_admin' });
    const caller = await User.create({ username: 'caller2', email: 'caller2@test.com', password: 'x', role: 'admin', roles: [superAdminRole._id] });

    const { nextErr } = await callCreateUser({
      username: 'regularuser', email: 'regularuser2@test.com', password: 'password1', role: 'user',
      roles: [superAdminRole._id.toString()],
    }, caller._id.toString());

    assert.ok(nextErr);
    assert.equal(nextErr.status, 403);
  });

  it('admin:roles:write izni olan çağıran, role=admin için ek rol atayabilir', async () => {
    await initDefaultPermissions();
    await initDefaultRoles();
    const superAdminRole = await Role.findOne({ name: 'super_admin' });
    const financeRole = await Role.findOne({ name: 'finance' });
    const caller = await User.create({ username: 'caller3', email: 'caller3@test.com', password: 'x', role: 'admin', roles: [superAdminRole._id] });

    const { res, nextErr } = await callCreateUser({
      username: 'newadmin', email: 'newadmin@test.com', password: 'password1', role: 'admin',
      roles: [financeRole._id.toString()],
    }, caller._id.toString());

    assert.equal(nextErr, null, nextErr?.message);
    assert.equal(res.statusCode, 201);

    const fresh = await User.findById(res.body.user._id);
    assert.equal(fresh.roles.length, 1);
    assert.equal(fresh.roles[0].toString(), financeRole._id.toString());
  });

  it('admin:roles:write izni OLMAYAN çağıran, role=admin için roles göndermeye çalışırsa 403 alır', async () => {
    await initDefaultPermissions();
    await initDefaultRoles();
    const supportRole = await Role.findOne({ name: 'support' }); // admin:roles:write içermiyor
    const financeRole = await Role.findOne({ name: 'finance' });
    const caller = await User.create({ username: 'caller4', email: 'caller4@test.com', password: 'x', role: 'admin', roles: [supportRole._id] });

    const { nextErr } = await callCreateUser({
      username: 'blockedadmin', email: 'blockedadmin@test.com', password: 'password1', role: 'admin',
      roles: [financeRole._id.toString()],
    }, caller._id.toString());

    assert.ok(nextErr);
    assert.equal(nextErr.status, 403);

    const created = await User.findOne({ username: 'blockedadmin' });
    assert.equal(created, null, 'İzin yoksa kullanıcı hiç oluşturulmamalı');
  });

  it('roles verilmezse (normal admin oluşturma) eskisi gibi çalışır', async () => {
    const caller = await User.create({ username: 'caller5', email: 'caller5@test.com', password: 'x', role: 'admin' });

    const { res, nextErr } = await callCreateUser({
      username: 'plainadmin', email: 'plainadmin@test.com', password: 'password1', role: 'admin',
    }, caller._id.toString());

    assert.equal(nextErr, null, nextErr?.message);
    assert.equal(res.statusCode, 201);
    const fresh = await User.findById(res.body.user._id);
    assert.equal(fresh.roles.length, 0);
  });
});
