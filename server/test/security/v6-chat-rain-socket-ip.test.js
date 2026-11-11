// V6 follow-up — the staff socket event chat:rain honours ADMIN_ALLOWED_IPS.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { io as ioc } from 'socket.io-client';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_v6_rain_ip?replicaSet=rs0';

let connected = false;
try { await mongoose.connect(URI, { serverSelectionTimeoutMS: 3000 }); connected = true; } catch { /* skip */ }
const opts = { skip: !connected && 'MongoDB not available' };

describe('V6 chat:rain is subject to ADMIN_ALLOWED_IPS', () => {
  let User, Role, Permission, ChatRain, srv, io, port, admin, role;
  const sockets = [];
  const s = Date.now();

  before(async () => {
    if (!connected) return;
    ({ default: User } = await import('../../src/models/User.js'));
    ({ default: Role } = await import('../../src/models/Role.js'));
    ({ default: Permission } = await import('../../src/models/Permission.js'));
    ({ default: ChatRain } = await import('../../src/models/ChatRain.js'));
    const { initChatSocket } = await import('../../src/services/chat.js');
    const perm = await Permission.findOneAndUpdate(
      { key: 'admin:users:balance' },
      { $setOnInsert: { key: 'admin:users:balance', name: 'balance', category: 'users' } },
      { upsert: true, new: true },
    );
    role = await Role.create({ name: `v6ip_${s}`, displayName: 'v6ip', permissions: [perm._id] });
    admin = await User.create({ username: `v6ip_${s}`, email: `v6ip_${s}@test.dev`, password: 'x'.repeat(10), role: 'admin', roles: [role._id], balance: 1000 });
    srv = http.createServer();
    io = new Server(srv);
    initChatSocket(io);
    await new Promise((r) => srv.listen(0, r));
    port = srv.address().port;
  });

  after(async () => {
    delete process.env.ADMIN_ALLOWED_IPS;
    for (const c of sockets) c.close();
    if (io) io.close();
    if (connected) {
      await User.deleteMany({ _id: admin?._id });
      await Role.deleteOne({ _id: role?._id });
      await mongoose.disconnect();
    }
  });

  function rainFrom(xff) {
    return new Promise((resolve, reject) => {
      const token = jwt.sign({ id: String(admin._id), role: 'admin', tokenVersion: 0 }, process.env.JWT_SECRET);
      const c = ioc(`http://localhost:${port}/chat`, { auth: { token }, extraHeaders: { 'x-forwarded-for': xff }, reconnection: false, transports: ['websocket'] });
      sockets.push(c);
      c.on('connect_error', reject);
      c.on('chat:error', (d) => resolve(d));
      c.on('chat:rainCreated', (d) => resolve({ created: true, ...d }));
      c.on('connect', () => c.emit('chat:rain', { roomId: String(new mongoose.Types.ObjectId()), totalAmount: 30, requestId: `v6ip-${xff}` }));
    });
  }

  it('refused from an IP outside the allowlist, reaches createRain from inside it', opts, async () => {
    process.env.ADMIN_ALLOWED_IPS = '203.0.113.0/24';
    const out = await rainFrom('198.51.100.9');
    assert.ok(out.message, 'chat:error expected');
    assert.match(out.message, /IP/);
    const inside = await rainFrom('203.0.113.7');
    assert.doesNotMatch(inside.message || '', /IP/, 'allowed IP gets past the allowlist (fails later on the missing room)');
    assert.equal(await ChatRain.countDocuments({ createdBy: admin._id }), 0);
  });
});
