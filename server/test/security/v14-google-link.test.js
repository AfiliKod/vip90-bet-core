process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import { findOrCreateGoogleUser, getGoogleUserInfo, linkGoogleAccount, setOAuthState } from '../../src/services/socialAuth.js';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/v14_google_link_test';
const NAMES = ['v14local1', 'v14local2', 'v14local3', 'v14local4', 'google_v14new1xxx', 'google_v14v2id1xy', 'v14link1', 'v14link2', 'v14diffem1'];

describe('V14 Google otomatik bağlama', async () => {
  let connected = false;
  try { await mongoose.connect(URI, { serverSelectionTimeoutMS: 2000 }); connected = true; } catch { /* skip */ }
  const opts = { skip: !connected && 'MongoDB yok' };
  const clean = () => User.deleteMany({ username: { $in: NAMES } });
  after(async () => { if (connected) await clean(); });

  it('doğrulanmamış yerel hesap Google ile otomatik bağlanmaz', opts, async () => {
    await clean();
    await User.create({ username: 'v14local1', email: 'v14local1@example.com', password: 'x'.repeat(10), emailVerified: false });
    await assert.rejects(
      findOrCreateGoogleUser({ sub: 'v14g1', email: 'v14local1@example.com', verified_email: true }),
      (e) => e.code === 'GOOGLE_LINK_REQUIRED' && e.status === 409,
    );
    const u = await User.findOne({ username: 'v14local1' });
    assert.ok(!u.googleId);
  });

  it('doğrulanmış yerel hesap bağlanır', opts, async () => {
    await clean();
    const u = await User.create({ username: 'v14local2', email: 'v14local2@example.com', password: 'x'.repeat(10), emailVerified: true });
    const linked = await findOrCreateGoogleUser({ sub: 'v14g2', email: 'v14local2@example.com', verified_email: true });
    assert.equal(String(linked._id), String(u._id));
    assert.equal(linked.googleId, 'v14g2');
  });

  it('Google tarafı doğrulanmamışsa doğrulanmış yerel hesap da bağlanmaz', opts, async () => {
    await clean();
    await User.create({ username: 'v14local3', email: 'v14local3@example.com', password: 'x'.repeat(10), emailVerified: true });
    await assert.rejects(
      findOrCreateGoogleUser({ sub: 'v14g3', email: 'v14local3@example.com', verified_email: false }),
      (e) => e.code === 'GOOGLE_LINK_REQUIRED',
    );
  });

  it('zaten bağlı hesap emailVerified false olsa da girer', opts, async () => {
    await clean();
    const u = await User.create({ username: 'v14local4', email: 'v14local4@example.com', password: 'x'.repeat(10), emailVerified: false, googleId: 'v14g4' });
    const found = await findOrCreateGoogleUser({ sub: 'v14g4', email: 'v14local4@example.com', verified_email: true });
    assert.equal(String(found._id), String(u._id));
  });

  it('googleId ile bağlı hesap, yerel e-postası Google e-postasından farklıysa da tekrar girer', opts, async () => {
    await clean();
    const u = await User.create({ username: 'v14diffem1', email: 'v14local@example.com', password: 'x'.repeat(10), emailVerified: true, googleId: 'v14gdiff1', googleEmail: 'v14other@gmail.test' });
    const found = await findOrCreateGoogleUser({ sub: 'v14gdiff1', email: 'v14other@gmail.test', verified_email: true });
    assert.equal(String(found._id), String(u._id));
    assert.equal(await User.countDocuments({ googleId: 'v14gdiff1' }), 1);
  });

  it('yeni kullanıcı emailVerified Google beyanına göre', opts, async () => {
    await clean();
    const a = await findOrCreateGoogleUser({ sub: 'v14new1xxxx', email: 'v14new1@example.com', verified_email: true });
    assert.equal(a.emailVerified, true);
  });
});

describe('V14 getGoogleUserInfo', () => {
  const orig = globalThis.fetch;
  const stub = (body) => { globalThis.fetch = async () => ({ ok: true, json: async () => body }); };
  after(() => { globalThis.fetch = orig; });

  it('verified_email:false reddedilir', async () => {
    stub({ sub: 's', email: 'a@b.dev', verified_email: false });
    await assert.rejects(getGoogleUserInfo('t'), (e) => e.code === 'GOOGLE_EMAIL_UNVERIFIED' && e.status === 403);
  });
  it('alan yoksa reddedilir', async () => {
    stub({ sub: 's', email: 'a@b.dev' });
    await assert.rejects(getGoogleUserInfo('t'), (e) => e.code === 'GOOGLE_EMAIL_UNVERIFIED');
  });
  it('verified_email:true ve email_verified:true kabul edilir', async () => {
    stub({ sub: 's', email: 'a@b.dev', verified_email: true });
    assert.equal((await getGoogleUserInfo('t')).sub, 's');
    stub({ sub: 's', email: 'a@b.dev', email_verified: true });
    assert.equal((await getGoogleUserInfo('t')).sub, 's');
  });
});

describe('V14 v2 userinfo kimliği ve link akışı', async () => {
  let connected = false;
  try { await mongoose.connect(URI, { serverSelectionTimeoutMS: 2000 }); connected = true; } catch { /* skip */ }
  const opts = { skip: !connected && 'MongoDB yok' };
  const orig = globalThis.fetch;
  const stubGoogle = (profile) => {
    globalThis.fetch = async (url) => (String(url).includes('userinfo')
      ? { ok: true, json: async () => profile }
      : { ok: true, json: async () => ({ access_token: 'at' }) });
  };
  const clean = () => User.deleteMany({ username: { $in: ['google_v14v2id1xy', 'v14link1', 'v14link2'] } });
  after(async () => { globalThis.fetch = orig; if (connected) { await clean(); await mongoose.disconnect(); } });

  it('v2 payload (id, sub yok) googleId olarak id saklanır', opts, async () => {
    await clean();
    stubGoogle({ id: 'v14v2id1xyz', email: 'v14v2@example.com', verified_email: true });
    const profile = await getGoogleUserInfo('t');
    assert.equal(profile.sub, 'v14v2id1xyz');
    const u = await findOrCreateGoogleUser(profile);
    assert.equal(u.googleId, 'v14v2id1xyz');
  });

  it('id/sub olmayan payload reddedilir', async () => {
    stubGoogle({ email: 'x@example.com', verified_email: true });
    await assert.rejects(getGoogleUserInfo('t'), (e) => e.code === 'GOOGLE_PROFILE_INVALID');
    await assert.rejects(findOrCreateGoogleUser({ email: 'x@example.com', verified_email: true }), (e) => e.code === 'GOOGLE_PROFILE_INVALID');
  });

  it('link: farklı Google e-postası emailVerified yapmaz', opts, async () => {
    await clean();
    const u = await User.create({ username: 'v14link1', email: 'v14link1@example.com', password: 'x'.repeat(10), emailVerified: false });
    stubGoogle({ id: 'v14lk1', email: 'attacker@example.com', verified_email: true });
    const out = await linkGoogleAccount(u._id, 'code', setOAuthState('google', String(u._id)));
    assert.equal(out.googleId, 'v14lk1');
    assert.equal(out.emailVerified, false);
  });

  it('link: aynı (büyük/küçük harf farkıyla) e-posta emailVerified yapar', opts, async () => {
    await clean();
    const u = await User.create({ username: 'v14link2', email: 'v14link2@example.com', password: 'x'.repeat(10), emailVerified: false });
    stubGoogle({ id: 'v14lk2', email: 'V14Link2@Example.COM', verified_email: true });
    const out = await linkGoogleAccount(u._id, 'code', setOAuthState('google', String(u._id)));
    assert.equal(out.emailVerified, true);
  });
});
