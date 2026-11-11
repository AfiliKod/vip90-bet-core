process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
delete process.env.ADMIN_ALLOWED_IPS;
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/v9_health_risk_test';

describe('V9 risk stats are staff-only; public health stays public', async () => {
  let connected = false;
  try { await mongoose.connect(URI, { serverSelectionTimeoutMS: 2000 }); connected = true; } catch { /* skip */ }
  const opts = { skip: !connected && 'MongoDB yok' };
  let server; let base; let superAdmin; let limitedAdmin;

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
    if (connected) await mongoose.disconnect();
  });

  const tok = (x) => jwt.sign({ id: x._id, role: x.role, tokenVersion: x.tokenVersion || 0 }, process.env.JWT_SECRET);
  const get = (path, user) => fetch(base + path, { headers: user ? { Authorization: `Bearer ${tok(user)}` } : {} });

  it('setup', opts, async () => {
    const { default: User } = await import('../../src/models/User.js');
    const { default: Role } = await import('../../src/models/Role.js');
    const { default: Permission } = await import('../../src/models/Permission.js');
    const { initDefaultPermissions, initDefaultRoles } = await import('../../src/services/permissions.js');
    await Promise.all([User.deleteMany({}), Role.deleteMany({}), Permission.deleteMany({})]);
    await initDefaultPermissions();
    await initDefaultRoles();
    const sup = await Role.findOne({ name: 'super_admin' });
    const settings = await Permission.findOne({ key: 'admin:settings:read' });
    const lim = await Role.create({ name: 'v9_limited', displayName: 'v9_limited', permissions: [settings._id] });
    superAdmin = await User.create({ username: 'v9super', email: 'v9super@example.com', password: 'Pass1234!', role: 'admin', roles: [sup._id] });
    limitedAdmin = await User.create({ username: 'v9lim', email: 'v9lim@example.com', password: 'Pass1234!', role: 'admin', roles: [lim._id] });
    const { createApp } = await import('../../src/app.js');
    server = createApp().listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  it('anonymous /api/admin/health/risk -> 401', opts, async () => {
    assert.equal((await get('/api/admin/health/risk')).status, 401);
  });
  it('admin without admin:risk:read -> 403', opts, async () => {
    assert.equal((await get('/api/admin/health/risk', limitedAdmin)).status, 403);
  });
  it('admin with admin:risk:read -> 200 JSON', opts, async () => {
    const res = await get('/api/admin/health/risk', superAdmin);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /json/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const body = await res.json();
    assert.ok(Array.isArray(body.statusStats));
  });
  it('legacy public /api/health/risk -> 404', opts, async () => {
    assert.equal((await get('/api/health/risk')).status, 404);
  });
  it('public /api/health and /api/health/status stay public JSON', opts, async () => {
    for (const p of ['/api/health', '/api/health/status']) {
      const res = await get(p);
      assert.equal(res.status, 200, p);
      assert.match(res.headers.get('content-type'), /json/);
    }
  });
});
