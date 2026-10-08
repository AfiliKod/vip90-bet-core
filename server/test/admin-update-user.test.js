/**
 * Admin — updateUser: e-postayı doğrulanmış işaretleme (SMTP'siz kurulum).
 * Çalıştırmak için: node --test test/admin-update-user.test.js
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import { updateUser } from '../src/controllers/admin.js';
import { updateUserAdminSchema } from '../src/validators/admin.js';

async function call(id, body) {
  const parsed = updateUserAdminSchema.safeParse(body);
  if (!parsed.success) return { status: 400 };
  const res = { body: null, json(b) { this.body = b; return this; } };
  let err = null;
  await updateUser({ params: { id: String(id) }, body, validated: parsed.data }, res, (e) => { err = e; });
  return { status: err ? err.status : 200, body: res.body };
}

describe('Admin — updateUser emailVerified', () => {
  before(async () => { await mongoose.connect('mongodb://localhost:27017/betzone_test_admin_update_user'); });
  after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  beforeEach(async () => { await User.deleteMany({}); });

  it('yönetici e-postayı doğrulanmış işaretleyebilir', async () => {
    const u = await User.create({ username: 'player1', email: 'p1@test.com', password: 'x' });
    const r = await call(u._id, { emailVerified: true });
    assert.equal(r.status, 200);
    assert.equal((await User.findById(u._id)).emailVerified, true);
  });

  it('doğrulama geri alınamaz (false reddedilir)', async () => {
    const u = await User.create({ username: 'player2', email: 'p2@test.com', password: 'x', emailVerified: true });
    const r = await call(u._id, { emailVerified: false });
    assert.equal(r.status, 400);
    assert.equal((await User.findById(u._id)).emailVerified, true);
  });
});
