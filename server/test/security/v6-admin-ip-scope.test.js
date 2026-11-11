process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
delete process.env.ADMIN_ALLOWED_IPS;
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/v6_admin_ip_scope_test';

describe('V6 ADMIN_ALLOWED_IPS covers every staff endpoint, not only /api/admin', async () => {
  let connected = false;
  try { await mongoose.connect(URI, { serverSelectionTimeoutMS: 2000 }); connected = true; } catch { /* skip */ }
  const opts = { skip: !connected && 'MongoDB yok' };
  let server; let base; let miniServer; let miniBase; let User; let admin; let player;

  after(async () => {
    delete process.env.ADMIN_ALLOWED_IPS;
    if (server) await new Promise((r) => server.close(r));
    if (miniServer) await new Promise((r) => miniServer.close(r));
    if (connected) await mongoose.disconnect();
  });

  const tok = (x) => jwt.sign({ id: x._id, role: x.role, tokenVersion: x.tokenVersion || 0 }, process.env.JWT_SECRET);
  const hit = async (b, method, path, user) => {
    const res = await fetch(b + path, {
      method,
      headers: { Authorization: `Bearer ${tok(user)}`, 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : '{}',
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, code: body?.error?.code };
  };
  const blocked = (r) => r.status === 403 && r.code === 'ADMIN_IP_NOT_ALLOWED';

  // [method, path, mini-app?]
  const STAFF = [
    ['GET', '/api/tickets'],
    ['GET', '/api/chat/admin/rooms'],
    ['GET', '/api/bank/admin/pending'],
    ['POST', '/api/auth/2fa/setup'],
    ['POST', '/api/auth/2fa/verify'],
    ['POST', '/api/auth/2fa/disable'],
    ['GET', '/api/crypto/settings', true],
    ['GET', '/api/crypto/hot-wallet-balance', true],
  ];

  it('setup', opts, async () => {
    ({ default: User } = await import('../../src/models/User.js'));
    await User.deleteMany({});
    const { initDefaultPermissions, initDefaultRoles } = await import('../../src/services/permissions.js');
    const { default: Role } = await import('../../src/models/Role.js');
    await initDefaultPermissions();
    await initDefaultRoles();
    const sup = await Role.findOne({ name: 'super_admin' });
    admin = await User.create({ username: 'v6admin', email: 'v6admin@example.com', password: 'Pass1234!', role: 'admin', roles: [sup._id] });
    player = await User.create({ username: 'v6player', email: 'v6player@example.com', password: 'Pass1234!' });
    const { createApp } = await import('../../src/app.js');
    server = createApp().listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
    const { default: express } = await import('express');
    const { default: cryptoRoutes } = await import('../../src/routes/crypto.js');
    const mini = express();
    mini.use('/api/crypto', cryptoRoutes);
    miniServer = mini.listen(0);
    await new Promise((r) => miniServer.once('listening', r));
    miniBase = `http://127.0.0.1:${miniServer.address().port}`;
  });

  for (const [method, path, mini] of STAFF) {
    it(`${method} ${path}: 403 ADMIN_IP_NOT_ALLOWED from a non-allowed IP`, opts, async () => {
      process.env.ADMIN_ALLOWED_IPS = '203.0.113.0/24';
      const r = await hit(mini ? miniBase : base, method, path, admin);
      assert.ok(blocked(r), `${path} -> ${r.status} ${r.code}`);
    });
    it(`${method} ${path}: reachable from an allowed IP`, opts, async () => {
      process.env.ADMIN_ALLOWED_IPS = '127.0.0.1/32';
      const r = await hit(mini ? miniBase : base, method, path, admin);
      assert.ok(!blocked(r), `${path} -> ${r.status} ${r.code}`);
    });
    it(`${method} ${path}: unchanged when ADMIN_ALLOWED_IPS is unset`, opts, async () => {
      delete process.env.ADMIN_ALLOWED_IPS;
      const r = await hit(mini ? miniBase : base, method, path, admin);
      assert.ok(!blocked(r), `${path} -> ${r.status} ${r.code}`);
    });
  }

  it('a non-staff user still gets FORBIDDEN (role check first), never the IP error', opts, async () => {
    process.env.ADMIN_ALLOWED_IPS = '203.0.113.0/24';
    const r = await hit(base, 'GET', '/api/tickets', player);
    assert.equal(r.status, 403);
    assert.equal(r.code, 'FORBIDDEN');
  });

  it('player endpoints are unaffected by the allowlist', opts, async () => {
    process.env.ADMIN_ALLOWED_IPS = '203.0.113.0/24';
    const r = await hit(base, 'GET', '/api/auth/2fa/status', player);
    assert.ok(!blocked(r), `status -> ${r.status} ${r.code}`);
  });

  it('socket helper: allowlist honours the handshake address and the proxy hop', async () => {
    const { adminIpAllowedForSocket } = await import('../../src/middleware/adminIpAllowlist.js');
    const sock = (address, xff) => ({ handshake: { address, headers: xff ? { 'x-forwarded-for': xff } : {} } });
    const env = { ADMIN_ALLOWED_IPS: '203.0.113.0/24' };
    assert.equal(adminIpAllowedForSocket(sock('203.0.113.7'), env), true);
    assert.equal(adminIpAllowedForSocket(sock('::ffff:203.0.113.7'), env), true);
    assert.equal(adminIpAllowedForSocket(sock('198.51.100.9'), env), false);
    // behind one trusted proxy the last XFF entry is the client (same as express "trust proxy 1")
    assert.equal(adminIpAllowedForSocket(sock('10.0.0.1', '198.51.100.9, 203.0.113.7'), env), true);
    assert.equal(adminIpAllowedForSocket(sock('10.0.0.1', '203.0.113.7, 198.51.100.9'), env), false);
    assert.equal(adminIpAllowedForSocket(sock('198.51.100.9'), {}), true);
  });
});
