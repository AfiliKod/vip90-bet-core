process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.OPERATOR_SECRET_ENCRYPTION_KEY ||= 'e'.repeat(64);
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import mongoose from 'mongoose';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/v11_sumsub_rawbody_test';
const SECRET = 'v11_webhook_secret';

describe('V11 Sumsub webhook raw body through the real app', async () => {
  let connected = false;
  try { await mongoose.connect(URI, { serverSelectionTimeoutMS: 2000 }); connected = true; } catch { /* skip */ }
  const opts = { skip: !connected && 'MongoDB yok' };
  let server; let base; let User; let user; let kycConfig;

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
    if (connected) {
      if (user) await User.deleteMany({ _id: user._id });
      const Setting = (await import('../../src/models/Setting.js')).default;
      await Setting.deleteMany({ key: 'SUMSUB_WEBHOOK_SECRET' });
      kycConfig?.invalidate();
      await mongoose.disconnect();
    }
  });

  const sign = (raw, secret = SECRET) => crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const post = (raw, headers = {}) => fetch(`${base}/api/webhook/sumsub`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: raw,
  });
  const now = () => String(Math.floor(Date.now() / 1000));
  // Whitespace + key order differ from JSON.stringify(JSON.parse(raw)).
  const rawFor = () => `{ "payload" : { "externalUserId":"${user._id}" } ,\n "type":"applicantPending" }`;

  it('setup', opts, async () => {
    ({ default: User } = await import('../../src/models/User.js'));
    ({ kycConfig } = await import('../../src/config/kyc.js'));
    const { createApp } = await import('../../src/app.js');
    await kycConfig.set('SUMSUB_WEBHOOK_SECRET', SECRET, null);
    kycConfig.invalidate();
    await User.deleteMany({ username: 'v11sumsubuser' });
    user = await User.create({ username: 'v11sumsubuser', email: 'v11sumsub@example.com', password: 'Pass1234!' });
    server = createApp().listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  it('correctly signed non-canonical raw body verifies and is processed', opts, async () => {
    const raw = rawFor();
    assert.notEqual(raw, JSON.stringify(JSON.parse(raw)));
    const r = await post(raw, { 'x-app-signature': sign(raw), 'x-app-timestamp': now() });
    assert.equal(r.status, 200);
    const u = await User.findById(user._id);
    assert.equal(u.kycStatus, 'pending');
  });

  it('missing signature -> 401', opts, async () => {
    assert.equal((await post(rawFor(), { 'x-app-timestamp': now() })).status, 401);
  });

  it('tampered body -> 401', opts, async () => {
    const raw = rawFor();
    const r = await post(raw.replace('applicantPending', 'applicantReviewed'), { 'x-app-signature': sign(raw), 'x-app-timestamp': now() });
    assert.equal(r.status, 401);
  });

  it('signature of the re-serialized JSON (not the raw bytes) -> 401', opts, async () => {
    const raw = rawFor();
    const r = await post(raw, { 'x-app-signature': sign(JSON.stringify(JSON.parse(raw))), 'x-app-timestamp': now() });
    assert.equal(r.status, 401);
  });

  it('wrong-length signature -> 401, not 200', opts, async () => {
    const raw = rawFor();
    const r = await post(raw, { 'x-app-signature': 'abc', 'x-app-timestamp': now() });
    assert.equal(r.status, 401);
  });

  it('timestamp older than 5 minutes -> 401', opts, async () => {
    const raw = rawFor();
    const old = String(Math.floor(Date.now() / 1000) - 600);
    assert.equal((await post(raw, { 'x-app-signature': sign(raw), 'x-app-timestamp': old })).status, 401);
  });

  it('empty body -> 401', opts, async () => {
    assert.equal((await post('', { 'x-app-signature': sign(''), 'x-app-timestamp': now() })).status, 401);
  });

  it('unreadable secret still -> 503', opts, async () => {
    const saved = process.env.OPERATOR_SECRET_ENCRYPTION_KEY;
    delete process.env.OPERATOR_SECRET_ENCRYPTION_KEY;
    kycConfig.invalidate();
    try {
      const raw = rawFor();
      assert.equal((await post(raw, { 'x-app-signature': sign(raw), 'x-app-timestamp': now() })).status, 503);
    } finally {
      process.env.OPERATOR_SECRET_ENCRYPTION_KEY = saved;
      kycConfig.invalidate();
    }
  });
});
