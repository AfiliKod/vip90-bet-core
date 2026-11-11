import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import { verifyEmail, resetPassword } from '../../src/controllers/auth.js';
import { hashToken } from '../../src/utils/tokenHash.js';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/v1_token_lookup_test';

describe('hash\'li token aramaları (verifyEmail / resetPassword)', async () => {
  let connected = false;
  try { await mongoose.connect(URI, { serverSelectionTimeoutMS: 2000 }); connected = true; } catch { /* skip */ }
  const opts = { skip: !connected && 'MongoDB yok' };
  after(async () => {
    if (connected) { await User.deleteMany({ username: /^v1tok/ }); await mongoose.disconnect(); }
  });
  const call = (fn, req) => new Promise((resolve, reject) => fn(req, { json: resolve }, (e) => (e ? reject(e) : resolve(null))));
  const rawOf = (u) => User.collection.findOne({ _id: u._id });

  it('verifyEmail: e-postadaki ham token çözülür, alan null\'lanır; hash\'in kendisi çalışmaz', opts, async () => {
    await User.deleteMany({ username: 'v1tokv' });
    const raw = 'a1'.repeat(32);
    const u = await User.create({ username: 'v1tokv', email: 'v1tokv@example.com', password: 'x'.repeat(10),
      emailVerificationToken: hashToken(raw), emailVerificationExpires: new Date(Date.now() + 60000) });
    await assert.rejects(() => call(verifyEmail, { validated: { token: hashToken(raw) } }), /Geçersiz/);
    await call(verifyEmail, { validated: { token: raw } });
    const doc = await rawOf(u);
    assert.equal(doc.emailVerified, true);
    assert.equal(doc.emailVerificationToken, null);
  });

  it('resetPassword: ham token çözülür, alan null\'lanır, ikinci kullanım reddedilir', opts, async () => {
    await User.deleteMany({ username: 'v1tokr' });
    const raw = 'b2'.repeat(32);
    const u = await User.create({ username: 'v1tokr', email: 'v1tokr@example.com', password: 'x'.repeat(10),
      passwordResetToken: hashToken(raw), passwordResetExpires: new Date(Date.now() + 60000) });
    await assert.rejects(() => call(resetPassword, { validated: { token: hashToken(raw), newPassword: 'NewPass123' } }), /Geçersiz/);
    await call(resetPassword, { validated: { token: raw, newPassword: 'NewPass123' } });
    const doc = await rawOf(u);
    assert.equal(doc.passwordResetToken, null);
    assert.match(doc.password, /^\$2/);
    await assert.rejects(() => call(resetPassword, { validated: { token: raw, newPassword: 'Other12345' } }), /Geçersiz/);
  });
});
