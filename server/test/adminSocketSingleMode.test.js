// Single mode before the default tenant exists (G1 not run): sockets are
// unbound, and an admin with admin:activity:read must still join the admin
// room and receive admin events, exactly as before İP-7.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.TENANCY_MODE = 'single';
delete process.env.ADMIN_ALLOWED_IPS;
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_admin_socket_single';
let User; let Role; let Permission; let initSocket; let adminRoom; let setDefaultTenantId;

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  ({ default: User } = await import('../src/models/User.js'));
  ({ default: Role } = await import('../src/models/Role.js'));
  ({ default: Permission } = await import('../src/models/Permission.js'));
  ({ initSocket } = await import('../src/socket/handler.js'));
  ({ adminRoom } = await import('../src/tenancy/tenantKeys.js'));
  ({ setDefaultTenantId } = await import('../src/tenancy/defaultTenantId.js'));
  setDefaultTenantId(null);
  const { initDefaultPermissions } = await import('../src/services/permissions.js');
  await initDefaultPermissions();
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function admin(username, keys) {
  const ids = (await Permission.find({ key: { $in: keys } })).map((p) => p._id);
  const role = await Role.create({ name: `r_${username}`, displayName: username, permissions: ids });
  return User.create({ username, email: `${username}@test.example.com`, password: 'Pass1234!', role: 'admin', roles: [role._id] });
}

test('without a default tenant an admin with admin:activity:read joins the admin room', async () => {
  const httpServer = http.createServer();
  const io = new Server(httpServer);
  initSocket(io);
  await new Promise((res) => httpServer.listen(0, '127.0.0.1', res));
  const url = `http://127.0.0.1:${httpServer.address().port}`;
  const joins = async (user) => {
    const c = ioClient(url, { transports: ['websocket'], forceNew: true });
    await new Promise((res) => c.on('connect', res));
    const token = jwt.sign({ id: user._id, role: user.role, tokenVersion: 0 }, process.env.JWT_SECRET);
    c.emit('subscribe:admin', { token });
    await new Promise((r) => setTimeout(r, 300));
    const got = new Promise((res) => { c.once('activity:new', () => res(true)); setTimeout(() => res(false), 300); });
    io.to(adminRoom()).emit('activity:new', { probe: true });
    const out = await got;
    c.close();
    return out;
  };
  try {
    assert.equal(await joins(await admin('reader', ['admin:activity:read'])), true);
    assert.equal(await joins(await admin('noperm', [])), false);
  } finally {
    io.close();
  }
});
