process.env.OPERATOR_SECRET_ENCRYPTION_KEY = 'c'.repeat(64);
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import { getUsers, updateUser } from '../../src/controllers/admin.js';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/v1_admin_users_projection_test';
const SENSITIVE = ['password', 'twoFactorSecret', 'twoFactorBackupCodes', 'emailVerificationToken', 'passwordResetToken'];

describe('admin kullanıcı yanıtları hassas alan sızdırmaz', async () => {
  let connected = false;
  try { await mongoose.connect(URI, { serverSelectionTimeoutMS: 2000 }); connected = true; } catch { /* skip */ }
  const opts = { skip: !connected && 'MongoDB yok' };
  after(async () => {
    if (connected) { await User.deleteMany({ username: 'v1leak' }); await mongoose.disconnect(); }
  });

  async function seed() {
    await User.deleteMany({ username: 'v1leak' });
    const u = await User.create({ username: 'v1leak', email: 'v1leak@example.com', password: 'x'.repeat(10) });
    await User.collection.updateOne({ _id: u._id }, { $set: {
      twoFactorSecret: 'SECRET', twoFactorBackupCodes: ['c1'], emailVerificationToken: 'tok', passwordResetToken: 'rst',
    } });
    return u;
  }
  const call = (fn, req) => new Promise((resolve, reject) => {
    fn({ user: { id: String(new mongoose.Types.ObjectId()) }, ...req }, { json: resolve }, (e) => reject(e)); // V5: actor required
  });

  it('getUsers', opts, async () => {
    await seed();
    const out = await call(getUsers, { query: { search: 'v1leak' } });
    const row = out.users.find(r => r.username === 'v1leak');
    assert.ok(row);
    for (const k of SENSITIVE) assert.equal(k in row, false, k);
  });

  it('updateUser', opts, async () => {
    const u = await seed();
    const out = await call(updateUser, { params: { id: String(u._id) }, body: { emailVerified: true } });
    for (const k of SENSITIVE) assert.equal(k in out.user, false, k);
  });
});
