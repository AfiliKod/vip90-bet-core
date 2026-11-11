process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
process.env.TELEGRAM_LOGIN_BOT_TOKEN ||= 'test-telegram-bot-token';
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import { registerSchema } from '../../src/validators/auth.js';
import { createUserSchema } from '../../src/validators/admin.js';

const {
  verifyTelegramWidgetData, findOrCreateTelegramUser, findOrCreateGoogleUser, handleTelegramCallback,
  linkTelegramAccount, setOAuthState,
} = await import('../../src/services/socialAuth.js');
const { ethers } = await import('ethers');
const { authenticateWithWallet, setAuthNonce, generateAuthMessage } = await import('../../src/services/web3Auth.js');
const { providerUsernameCandidates } = await import('../../src/services/providerUsername.js');

const TOKEN = process.env.TELEGRAM_LOGIN_BOT_TOKEN;
const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/f1_telegram_link_test';

function sign(data, botToken = TOKEN) {
  const s = Object.keys(data).sort().map((k) => `${k}=${data[k]}`).join('\n');
  const key = crypto.createHash('sha256').update(botToken).digest();
  return crypto.createHmac('sha256', key).update(s).digest('hex');
}
const now = () => Math.floor(Date.now() / 1000);

describe('F1 verifyTelegramWidgetData', () => {
  const data = { id: '1', username: 'x', auth_date: String(now()) };
  it('valid hash -> true', () => {
    assert.equal(verifyTelegramWidgetData({ ...data, hash: sign(data) }, TOKEN), true);
  });
  it('wrong, missing, odd-length or non-string hash -> false', () => {
    assert.equal(verifyTelegramWidgetData({ ...data, hash: 'a'.repeat(64) }, TOKEN), false);
    assert.equal(verifyTelegramWidgetData({ ...data }, TOKEN), false);
    assert.equal(verifyTelegramWidgetData({ ...data, hash: 'abc' }, TOKEN), false);
    assert.equal(verifyTelegramWidgetData({ ...data, hash: ['x'] }, TOKEN), false);
    assert.equal(verifyTelegramWidgetData({ ...data, hash: sign(data).toUpperCase() + 'zz' }, TOKEN), false);
  });
});

describe('F1 register reserves provider prefixes', () => {
  const base = { email: 'a@example.com', password: 'Abcdefg1', acceptedTerms: true, acceptedKvkk: true };
  for (const u of ['tg_x', 'TG_x', 'google_abc', 'Google_abc', 'web3_abc', 'WEB3_abc']) {
    it(`refuses ${u}`, () => {
      const r = registerSchema.safeParse({ ...base, username: u });
      assert.equal(r.success, false);
      assert.match(JSON.stringify(r.error.issues), /ayrılmış|reserved/i);
    });
  }
  it('allows normal names', () => {
    assert.equal(registerSchema.safeParse({ ...base, username: 'tgalice' }).success, true);
    assert.equal(registerSchema.safeParse({ ...base, username: 'web3fan' }).success, true);
  });
});

describe('F1 provider username candidates', () => {
  it('base, stable suffix, then random ones; all <= 30 chars and [A-Za-z0-9_]', () => {
    const c = providerUsernameCandidates(`google_${'1234567890'}`, '123456789012345678901');
    assert.equal(c[0], 'google_1234567890');
    assert.equal(c[1], 'google_1234567890_678901');
    assert.ok(c.length >= 7);
    for (const n of c) { assert.ok(n.length <= 30, n); assert.match(n, /^[A-Za-z0-9_]+$/); }
    const long = providerUsernameCandidates('tg_' + 'x'.repeat(40), 'abc-def-123456');
    for (const n of long) assert.ok(n.length <= 30, n);
    assert.equal(long[1].slice(-7), '_123456');
  });
});

describe('F1 admin createUser reserves provider prefixes', () => {
  const base = { email: 'a@example.com', password: 'Abcdefg1' };
  for (const u of ['tg_x', 'TG_x', 'google_abc', 'Google_abc', 'web3_abc', 'WEB3_abc']) {
    it(`refuses ${u}`, () => {
      const r = createUserSchema.safeParse({ ...base, username: u });
      assert.equal(r.success, false);
      assert.match(JSON.stringify(r.error.issues), /ayrılmış/);
    });
  }
  it('allows normal names', () => {
    assert.equal(createUserSchema.safeParse({ ...base, username: 'tgalice' }).success, true);
  });
});

describe('F1 Telegram login does not attach by username', async () => {
  let connected = false;
  try { await mongoose.connect(URI, { serverSelectionTimeoutMS: 2000 }); connected = true; } catch { /* skip */ }
  const opts = { skip: !connected && 'MongoDB yok' };
  const clean = () => User.deleteMany({ $or: [{ username: /^tg_f1/ }, { username: /^f1link/ }, { telegramId: /^f1id/ }] });
  after(async () => { if (connected) { await clean(); await mongoose.disconnect(); } });
  const pw = 'x'.repeat(10);

  it('local tg_ account + Telegram same username (new id) -> NEW account, old untouched', opts, async () => {
    await clean();
    const old = await User.create({ username: 'tg_f1alice', email: 'f1a@example.com', password: pw });
    const u = await findOrCreateTelegramUser({ id: 'f1id1', username: 'f1alice', first_name: 'A' });
    assert.notEqual(String(u._id), String(old._id));
    assert.equal(u.telegramId, 'f1id1');
    assert.notEqual(u.username, 'tg_f1alice');
    assert.match(u.username, /^tg_f1alice_[A-Za-z0-9_]+$/);
    assert.ok(u.username.length <= 30);
    const o = await User.findById(old._id);
    assert.ok(!o.telegramId);
  });

  it('account linked to X, same username but telegramId Y -> new account, X untouched', opts, async () => {
    await clean();
    const x = await User.create({ username: 'tg_f1bob', email: 'f1b@example.com', password: pw, telegramId: 'f1idX', telegramUsername: 'f1bob' });
    const y = await findOrCreateTelegramUser({ id: 'f1idY', username: 'f1bob' });
    assert.notEqual(String(y._id), String(x._id));
    assert.equal(y.telegramId, 'f1idY');
    const xr = await User.findById(x._id);
    assert.equal(xr.telegramId, 'f1idX');
  });

  it('telegramId match -> same account, profile refreshed', opts, async () => {
    await clean();
    const x = await User.create({ username: 'tg_f1carl', email: 'f1c@example.com', password: pw, telegramId: 'f1idC', telegramUsername: 'f1carl' });
    const u = await findOrCreateTelegramUser({ id: 'f1idC', username: 'f1carl2', first_name: 'Carl' });
    assert.equal(String(u._id), String(x._id));
    assert.equal(u.telegramUsername, 'f1carl2');
    assert.equal(u.telegramFirstName, 'Carl');
    assert.equal(await User.countDocuments({ telegramId: 'f1idC' }), 1);
  });

  it('username collision with long name stays within 30 chars', opts, async () => {
    await clean();
    const long = 'f1' + 'z'.repeat(26); // tg_ + 28 = 31 > 30 is truncated
    const a = await findOrCreateTelegramUser({ id: 'f1idL1', username: long });
    const b = await findOrCreateTelegramUser({ id: 'f1idL2', username: long });
    assert.notEqual(a.username, b.username);
    for (const n of [a.username, b.username]) {
      assert.ok(n.length <= 30, n);
      assert.match(n, /^[A-Za-z0-9_]+$/);
    }
  });

  it('linkTelegramAccount refuses a telegramId linked elsewhere (409)', opts, async () => {
    await clean();
    await User.create({ username: 'f1link1', email: 'f1l1@example.com', password: pw, telegramId: 'f1idZ' });
    const me = await User.create({ username: 'f1link2', email: 'f1l2@example.com', password: pw });
    const data = { id: 'f1idZ', username: 'z', auth_date: String(now()) };
    await assert.rejects(
      linkTelegramAccount(me._id, { ...data, hash: sign(data) }, setOAuthState('telegram', String(me._id))),
      (e) => e.status === 409 && e.code === 'TELEGRAM_ALREADY_LINKED',
    );
    assert.ok(!(await User.findById(me._id)).telegramId);
  });

  it('linkTelegramAccount rejects bad hash (400)', opts, async () => {
    await clean();
    const me = await User.create({ username: 'f1link1', email: 'f1l1@example.com', password: pw });
    const data = { id: 'f1idQ', auth_date: String(now()) };
    await assert.rejects(
      linkTelegramAccount(me._id, { ...data, hash: 'a'.repeat(64) }, setOAuthState('telegram', String(me._id))),
      (e) => e.status === 400,
    );
  });

  it('future auth_date -> 400; non-numeric -> 400; slightly future ok', opts, async () => {
    const mk = (ad) => { const d = { id: 'f1idA', username: 'f1auth', auth_date: String(ad) }; return { ...d, hash: sign(d) }; };
    await assert.rejects(handleTelegramCallback(mk(now() + 3600), setOAuthState('telegram')), (e) => e.status === 400);
    await assert.rejects(handleTelegramCallback(mk('abc'), setOAuthState('telegram')), (e) => e.status === 400);
    await assert.rejects(handleTelegramCallback(mk(now() - 25 * 3600), setOAuthState('telegram')), (e) => e.status === 400);
    await clean();
    const r = await handleTelegramCallback(mk(now() + 60), setOAuthState('telegram'));
    assert.equal(r.user.telegramId, 'f1idA');
  });

  it('concurrent first login with same new telegramId -> one account, both resolve to it', opts, async () => {
    await clean();
    await User.init();
    const p = { id: 'f1idR', username: 'f1race' };
    const [a, b] = await Promise.all([findOrCreateTelegramUser(p), findOrCreateTelegramUser(p)]);
    assert.equal(String(a._id), String(b._id));
    assert.equal(await User.countDocuments({ telegramId: 'f1idR' }), 1);
  });

  it('linkTelegramAccount refuses a state bound to another user (400 INVALID_STATE)', opts, async () => {
    await clean();
    const me = await User.create({ username: 'f1link1', email: 'f1l1@example.com', password: pw });
    const other = await User.create({ username: 'f1link2', email: 'f1l2@example.com', password: pw });
    const data = { id: 'f1idS', username: 's', auth_date: String(now()) };
    await assert.rejects(
      linkTelegramAccount(me._id, { ...data, hash: sign(data) }, setOAuthState('telegram', String(other._id))),
      (e) => e.status === 400 && e.code === 'INVALID_STATE',
    );
    assert.ok(!(await User.findById(me._id)).telegramId);
    // bound to self and unbound states still work
    const ok = await linkTelegramAccount(me._id, { ...data, hash: sign(data) }, setOAuthState('telegram', String(me._id)));
    assert.equal(ok.telegramId, 'f1idS');
    await User.updateOne({ _id: me._id }, { $unset: { telegramId: 1 } });
    const ok2 = await linkTelegramAccount(me._id, { ...data, hash: sign(data) }, setOAuthState('telegram'));
    assert.equal(ok2.telegramId, 'f1idS');
  });

  it('Google: the base name taken by another account -> suffixed name, both kept', opts, async () => {
    await User.deleteMany({ $or: [{ username: /^google_f1g/ }, { email: /@f1g\.test$/ }] });
    const sub1 = 'f1g0000000aaaaaa111111';
    const sub2 = 'f1g0000000bbbbbb222222'; // same first 10 characters
    const a = await findOrCreateGoogleUser({ sub: sub1, email: 'a@f1g.test', verified_email: true, name: 'A' });
    const b = await findOrCreateGoogleUser({ sub: sub2, email: 'b@f1g.test', verified_email: true, name: 'B' });
    assert.equal(a.username, 'google_f1g0000000');
    assert.equal(b.username, 'google_f1g0000000_222222');
    assert.equal(b.googleId, sub2);
    // a local account squatting the next candidate -> random suffix, <= 30 chars
    await User.create({ username: 'google_f1g1111111', email: 'sq@f1g.test', password: pw });
    await User.create({ username: 'google_f1g1111111_333333', email: 'sq2@f1g.test', password: pw });
    const c = await findOrCreateGoogleUser({ sub: 'f1g1111111cccccc333333', email: 'c@f1g.test', verified_email: true });
    assert.match(c.username, /^google_f1g1111111_[0-9a-f]{8}$/);
    assert.ok(c.username.length <= 30);
    // same Google account again -> same user
    const a2 = await findOrCreateGoogleUser({ sub: sub1, email: 'a@f1g.test', verified_email: true });
    assert.equal(String(a2._id), String(a._id));
    await User.deleteMany({ $or: [{ username: /^google_f1g/ }, { email: /@f1g\.test$/ }] });
  });

  it('web3: the base name taken by another account -> suffixed name; same wallet logs in again', opts, async () => {
    process.env.JWT_SECRET ||= 'test-secret';
    const wallet = ethers.Wallet.createRandom();
    const address = wallet.address.toLowerCase();
    const base = `web3_${address.slice(2, 10)}`;
    await User.deleteMany({ $or: [{ username: new RegExp(`^${base}`) }, { walletAddress: address }] });
    await User.create({ username: base, email: `sq-${address}@f1w.test`, password: pw });
    const login = async () => {
      const message = generateAuthMessage(setAuthNonce(address));
      return authenticateWithWallet({ address, signature: await wallet.signMessage(message), message });
    };
    const r = await login();
    assert.equal(r.isNewUser, true);
    assert.equal(r.user.username, `${base}_${address.slice(-6)}`);
    assert.ok(r.user.username.length <= 30);
    const again = await login();
    assert.equal(again.isNewUser, false);
    assert.equal(String(again.user._id), String(r.user._id));
    await User.deleteMany({ $or: [{ username: new RegExp(`^${base}`) }, { walletAddress: address }] });
  });
});
