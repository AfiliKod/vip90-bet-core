import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import Role from '../../src/models/Role.js';
import Permission from '../../src/models/Permission.js';
import { initDefaultPermissions, initDefaultRoles, assertCanGrantRole } from '../../src/services/permissions.js';
import { createUser, assignUserRole, createRoleHandler, updateRoleHandler } from '../../src/controllers/admin.js';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/v21_role_grant_test';

function call(fn, req) {
  return new Promise((resolve) => {
    const res = { status(c) { this.code = c; return this; }, json(b) { resolve({ status: this.code || 200, body: b }); } };
    fn(req, res, (e) => resolve({ status: e.status, error: e.code, message: e.message }));
  });
}

describe('V21 rol atama yetkisi', async () => {
  let connected = false;
  try { await mongoose.connect(URI, { serverSelectionTimeoutMS: 2000 }); connected = true; } catch { /* skip */ }
  const opts = { skip: !connected && 'MongoDB yok' };
  after(async () => { if (connected) await mongoose.disconnect(); });

  let perms;
  const mkRole = (name, keys) => Role.create({ name, displayName: name, permissions: keys.map((k) => perms[k]) });
  const mkActor = async (name, keys) => {
    const role = await mkRole(`r_${name}`, keys);
    return User.create({ username: name, email: `${name}@example.com`, password: 'Pass1234!', role: 'admin', roles: [role._id] });
  };
  const create = (actor, body) => call(createUser, {
    validated: { password: 'Pass1234!', ...body, email: `${body.username}@example.com` },
    user: { id: String(actor._id) },
  });

  beforeEach(async () => {
    if (!connected) return;
    await Promise.all([User.deleteMany({}), Role.deleteMany({}), Permission.deleteMany({})]);
    await initDefaultPermissions();
    await initDefaultRoles();
    perms = Object.fromEntries((await Permission.find()).map((p) => [p.key, p._id]));
  });

  it('only admin:users:write cannot create an admin, and no user is left behind', opts, async () => {
    const actor = await mkActor('actor1', ['admin:users:write']);
    const r = await create(actor, { username: 'victim1', role: 'admin' });
    assert.equal(r.status, 403);
    assert.equal(r.error, 'FORBIDDEN');
    assert.equal(await User.countDocuments({ username: 'victim1' }), 0);
  });

  it('roles:write + users:write without the default admin permissions: 403 ROLE_GRANT_FORBIDDEN, no user created', opts, async () => {
    const actor = await mkActor('actor2', ['admin:users:write', 'admin:roles:write']);
    const r = await create(actor, { username: 'victim2', role: 'admin', roles: [] });
    assert.equal(r.status, 403);
    assert.equal(r.error, 'ROLE_GRANT_FORBIDDEN');
    assert.equal(await User.countDocuments({ username: 'victim2' }), 0);
  });

  it('explicit roles with a permission the actor lacks: 403, no user created', opts, async () => {
    const actor = await mkActor('actor3', ['admin:users:write', 'admin:roles:write']);
    const sup = await Role.findOne({ name: 'super_admin' });
    const r = await create(actor, { username: 'victim3', role: 'admin', roles: [sup._id] });
    assert.equal(r.status, 403);
    assert.equal(r.error, 'ROLE_GRANT_FORBIDDEN');
    assert.equal(await User.countDocuments({ username: 'victim3' }), 0);
  });

  it('super_admin can create an admin (201, default admin role assigned)', opts, async () => {
    const sup = await Role.findOne({ name: 'super_admin' });
    const actor = await User.create({ username: 'boss', email: 'boss@example.com', password: 'Pass1234!', role: 'admin', roles: [sup._id] });
    const r = await create(actor, { username: 'newadmin', role: 'admin' });
    assert.equal(r.status, 201);
    const u = await User.findOne({ username: 'newadmin' }).populate('roles');
    assert.deepEqual(u.roles.map((x) => x.name), ['admin']);
  });

  it('assignUserRole: role with a permission the actor lacks is refused; a subset role is assigned', opts, async () => {
    const actor = await mkActor('actor4', ['admin:users:write', 'admin:roles:write', 'admin:settings:read']);
    const target = await User.create({ username: 'tgt', email: 'tgt@example.com', password: 'Pass1234!' });
    const sup = await Role.findOne({ name: 'super_admin' });
    const bad = await call(assignUserRole, { params: { id: String(target._id) }, validated: { roleId: String(sup._id) }, user: { id: String(actor._id) } });
    assert.equal(bad.status, 403);
    assert.equal(bad.error, 'ROLE_GRANT_FORBIDDEN');
    assert.equal((await User.findById(target._id)).roles.length, 0);
    const sub = await mkRole('subset', ['admin:settings:read']);
    const ok = await call(assignUserRole, { params: { id: String(target._id) }, validated: { roleId: String(sub._id) }, user: { id: String(actor._id) } });
    assert.equal(ok.status, 200);
    assert.equal((await User.findById(target._id)).roles.length, 1);
  });

  it('editing your own role to add a permission you lack: 403, role unchanged', opts, async () => {
    const actor = await mkActor('actor6', ['admin:users:write', 'admin:roles:write']);
    const own = actor.roles[0];
    const all = Object.values(perms);
    const r = await call(updateRoleHandler, { params: { id: String(own) }, validated: { permissions: all }, user: { id: String(actor._id) } });
    assert.equal(r.status, 403);
    assert.equal(r.error, 'ROLE_GRANT_FORBIDDEN');
    assert.equal((await Role.findById(own)).permissions.length, 2);
  });

  it('creating a role with a permission you lack: 403, nothing created', opts, async () => {
    const actor = await mkActor('actor7', ['admin:users:write', 'admin:roles:write']);
    const r = await call(createRoleHandler, { validated: { name: 'evil', displayName: 'Evil', permissions: [perms['admin:settings:write']] }, user: { id: String(actor._id) } });
    assert.equal(r.status, 403);
    assert.equal(await Role.countDocuments({ name: 'evil' }), 0);
  });

  it('PUT on the system admin role is rejected and its permissions are unchanged', opts, async () => {
    const sup = await Role.findOne({ name: 'super_admin' });
    const actor = await User.create({ username: 'boss2', email: 'boss2@example.com', password: 'Pass1234!', role: 'admin', roles: [sup._id] });
    const adminRole = await Role.findOne({ name: 'admin' });
    const before = adminRole.permissions.length;
    const r = await call(updateRoleHandler, { params: { id: String(adminRole._id) }, validated: { permissions: [perms['admin:roles:write']] }, user: { id: String(actor._id) } });
    assert.match(r.message, /System roles/);
    assert.equal((await Role.findById(adminRole._id)).permissions.length, before);
    // regular actor too
    const weak = await mkActor('actor8', ['admin:roles:write']);
    await call(updateRoleHandler, { params: { id: String(adminRole._id) }, validated: { permissions: Object.values(perms) }, user: { id: String(weak._id) } });
    assert.equal((await Role.findById(adminRole._id)).permissions.length, before);
  });

  it('super_admin can still create and update non-system roles', opts, async () => {
    const sup = await Role.findOne({ name: 'super_admin' });
    const actor = await User.create({ username: 'boss3', email: 'boss3@example.com', password: 'Pass1234!', role: 'admin', roles: [sup._id] });
    const c = await call(createRoleHandler, { validated: { name: 'custom', displayName: 'Custom', permissions: [perms['admin:settings:write']] }, user: { id: String(actor._id) } });
    assert.equal(c.status, 200);
    const u = await call(updateRoleHandler, { params: { id: String(c.body.role._id) }, validated: { permissions: [perms['admin:settings:write'], perms['admin:users:read']] }, user: { id: String(actor._id) } });
    assert.equal(u.status, 200);
    assert.equal((await Role.findById(c.body.role._id)).permissions.length, 2);
  });

  it('createUser fails closed when the default admin role document is missing', opts, async () => {
    const sup = await Role.findOne({ name: 'super_admin' });
    const actor = await User.create({ username: 'boss4', email: 'boss4@example.com', password: 'Pass1234!', role: 'admin', roles: [sup._id] });
    await Role.deleteOne({ name: 'admin' });
    const r = await create(actor, { username: 'orphan', role: 'admin' });
    assert.ok(r.status >= 400);
    assert.equal(await User.countDocuments({ username: 'orphan' }), 0);
  });

  it('assertCanGrantRole: unknown role is 404', opts, async () => {
    const actor = await mkActor('actor5', []);
    await assert.rejects(() => assertCanGrantRole(actor._id, new mongoose.Types.ObjectId()), (e) => e.status === 404);
  });
});
