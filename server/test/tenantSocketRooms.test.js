/**
 * §8.5 socket room acceptance suite (İP-7 Task 10).
 *
 * Proves that every tenant-wide socket event reaches only the emitting
 * tenant's rooms. A failure here points back at Task 3 (binding/membership),
 * Task 4 (broadcast targets) or Task 7 (bot loopback), not at this test.
 *
 * Run: node --test --test-concurrency=1 server/test/tenantSocketRooms.test.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import ChatRoom from '../src/models/ChatRoom.js';
import Role from '../src/models/Role.js';
import { initSocket } from '../src/socket/handler.js';
import { initDefaultPermissions, initDefaultRoles } from '../src/services/permissions.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { adminRoom, chatRoom, liveRoom } from '../src/tenancy/tenantKeys.js';
import { logActivity } from '../src/services/activityFeed.js';
import { addRecentWinner, emitGameUpdate, subscribeToGameStream } from '../src/services/liveGameStream.js';
import { broadcastOnlineCount } from '../src/services/onlineCount.js';
import { emitBotAction } from '../src/services/bot.js';
import { setIO } from '../src/services/socketEmitter.js';
import { invalidateTokenVersionCache } from '../src/middleware/auth.js';

process.env.JWT_SECRET ||= 'test_jwt_secret_ip7_socket_rooms_0123456789';
process.env.TENANCY_MODE = 'multi';
process.env.TENANCY_ENFORCEMENT = 'enforce';
process.env.JWT_STAFF_SECRET ||= 'test_staff_secret_ip7_socket_rooms_0123456789';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://localhost:27017/vip90_test_ip7_t10';
let T1; let T2; let httpServer; let io; let url;
const clients = [];
let admin1; let admin2; let player1; let player2;
let room1; let room2; let superAdmin;

const tenantByKey = () => ({
  t1: { id: String(T1._id), brandId: null, host: 't1.test' },
  t2: { id: String(T2._id), brandId: null, host: 't2.test' },
});

// İP-3 player tokens carry both `id` and `sub` plus `typ`/`aud`/`tid`; multi
// mode rejects tokens without them.
function token(user, tenantId, overrides = {}) {
  return jwt.sign({
    id: String(user._id), sub: String(user._id), role: user.role, tokenVersion: 0,
    tid: String(tenantId), typ: 'player', aud: 'player', ...overrides,
  }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

function connect(path = '/', auth = {}) {
  const client = ioClient(`${url}${path}`, {
    transports: ['websocket'], forceNew: true, reconnection: false,
    auth,
  });
  clients.push(client);
  return client;
}

function connected(client) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('connect timeout')), 3000);
    client.once('connect', () => { clearTimeout(timer); resolve(); });
    client.once('connect_error', (error) => { clearTimeout(timer); reject(error); });
  });
}

function receives(client, event, timeoutMs = 400) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    client.once(event, () => { clearTimeout(timer); resolve(true); });
  });
}

async function waitForJoin(client, room, event = 'probe', ns = '/') {
  const target = ns === '/' ? io : io.of(ns);
  for (let i = 0; i < 120; i += 1) {
    const got = receives(client, event, 50);
    target.to(room).emit(event, { probe: true });
    if (await got) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
}

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  T1 = await Tenant.create({ key: 't1sockets', name: 'T1', status: 'active' });
  T2 = await Tenant.create({ key: 't2sockets', name: 'T2', status: 'active' });
  await runWithTenant(T1._id, async () => {
    await initDefaultPermissions();
    await initDefaultRoles();
    superAdmin = await Role.findOne({ name: 'super_admin' });
    admin1 = await User.create({ username: 'sock_admin_t1', email: 'sock_admin_t1@test.com', password: 'Pass1234', role: 'admin', roles: [superAdmin._id], tenantId: T1._id });
    player1 = await User.create({ username: 'sock_player_t1', email: 'sock_player_t1@test.com', password: 'Pass1234', tenantId: T1._id });
    room1 = await ChatRoom.create({ name: 'T1 room', slug: 't1-room', tenantId: T1._id });
  });
  await runWithTenant(T2._id, async () => {
    admin2 = await User.create({ username: 'sock_admin_t2', email: 'sock_admin_t2@test.com', password: 'Pass1234', role: 'admin', roles: [superAdmin._id], tenantId: T2._id });
    player2 = await User.create({ username: 'sock_player_t2', email: 'sock_player_t2@test.com', password: 'Pass1234', tenantId: T2._id });
    room2 = await ChatRoom.create({ name: 'T2 room', slug: 't2-room', tenantId: T2._id });
  });

  httpServer = http.createServer();
  io = new Server(httpServer);
  initSocket(io, {
    resolveSocketTenant: async (socket) => tenantByKey()[socket.handshake.auth?.tenantKey] || null,
  });
  setIO(io);
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${httpServer.address().port}`;
});

after(async () => {
  for (const client of clients) client.close();
  io.close();
  setIO(null);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('§8.5 tenant socket rooms', () => {
  it('T1 deposit activity reaches only the T1 admin room', async () => {
    const c1 = connect('/', { tenantKey: 't1', token: token(admin1, T1._id) });
    const c2 = connect('/', { tenantKey: 't2', token: token(admin2, T2._id) });
    await Promise.all([connected(c1), connected(c2)]);
    c1.emit('subscribe:admin', { token: token(admin1, T1._id) });
    c2.emit('subscribe:admin', { token: token(admin2, T2._id) });
    assert.equal(await waitForJoin(c1, adminRoom(T1._id)), true);
    assert.equal(await waitForJoin(c2, adminRoom(T2._id)), true);

    const denied = receives(c2, 'activity:new');
    const allowed = receives(c1, 'activity:new');
    await runWithTenant(T1._id, () => logActivity({
      type: 'deposit', userId: player1._id, status: 'completed', summary: 'T1 deposit', amount: 10,
    }));
    assert.equal(await allowed, true);
    assert.equal(await denied, false);
  });

  it('winners, online count and bot actions stay inside the tenant client room', async () => {
    const c1 = connect('/', { tenantKey: 't1' });
    const c2 = connect('/', { tenantKey: 't2' });
    await Promise.all([connected(c1), connected(c2)]);
    await new Promise((r) => setTimeout(r, 100));

    const t1Winner = receives(c1, 'winners:new');
    const t2Winner = receives(c2, 'winners:new');
    await runWithTenant(T1._id, () => addRecentWinner({ tenantId: T1._id, username: 't1sockwinner', gameId: 'crash', amount: 5 }));
    assert.equal(await t1Winner, true);
    assert.equal(await t2Winner, false);

    const t2Online = receives(c2, 'online:count');
    const t1Online = receives(c1, 'online:count');
    broadcastOnlineCount(T1._id);
    assert.equal(await t1Online, true);
    assert.equal(await t2Online, false);

    const t2Bot = receives(c2, 'bot:action');
    const t1Bot = receives(c1, 'bot:action');
    emitBotAction({ _id: new mongoose.Types.ObjectId(), username: 't1bot', tenantId: T1._id }, { betAmount: 1 });
    assert.equal(await t1Bot, true);
    assert.equal(await t2Bot, false);
  });

  it('a T1 player cannot join a T2 chat room', async () => {
    const c1 = connect('/chat', { tenantKey: 't1', token: token(player1, T1._id) });
    await connected(c1);
    const error = new Promise((resolve) => c1.once('chat:error', resolve));
    c1.emit('chat:join', { roomId: String(room2._id) });
    assert.equal((await error).code, 'ROOM_NOT_FOUND');

    const leak = receives(c1, 'chat:message');
    io.of('/chat').to(chatRoom(T2._id, room2._id)).emit('chat:message', { probe: true });
    assert.equal(await leak, false);

    c1.emit('chat:join', { roomId: String(room1._id) });
    assert.equal(await waitForJoin(c1, chatRoom(T1._id, room1._id), 'chat:message', '/chat'), true);
  });

  it('/live uses a tenant-prefixed room key', async () => {
    const p1 = connect('/live', { tenantKey: 't1', token: token(player1, T1._id) });
    const p2 = connect('/live', { tenantKey: 't2', token: token(player2, T2._id) });
    await Promise.all([connected(p1), connected(p2)]);
    p1.emit('live:subscribe', { gameId: 'inhouse-crash' });
    p2.emit('live:subscribe', { gameId: 'inhouse-crash' });
    assert.equal(await waitForJoin(p1, liveRoom(T1._id, 'inhouse-crash'), 'probe', '/live'), true);
    assert.equal(await waitForJoin(p2, liveRoom(T2._id, 'inhouse-crash'), 'probe', '/live'), true);

    const t1Update = receives(p1, 'game:update');
    const t2Update = receives(p2, 'game:update');
    subscribeToGameStream('probe-socket', 'inhouse-crash', T1._id);
    emitGameUpdate('inhouse-crash', { multiplier: 3 }, T1._id);
    assert.equal(await t1Update, true);
    assert.equal(await t2Update, false);
  });

  it('rejects a handshake whose tokenVersion was revoked', async () => {
    const oldToken = token(player1, T1._id);
    await runWithTenant(T1._id, () => User.updateOne({ _id: player1._id }, { $set: { tokenVersion: 1 } }));
    // The 30s auth-state cache would otherwise mask the revocation.
    invalidateTokenVersionCache(player1._id);
    const client = connect('/live', { tenantKey: 't1', token: oldToken });
    const error = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 3000);
      client.once('connect_error', (e) => { clearTimeout(timer); resolve(e); });
    });
    assert.ok(error, 'the handshake must be rejected');
    await runWithTenant(T1._id, () => User.updateOne({ _id: player1._id }, { $set: { tokenVersion: 0 } }));
    invalidateTokenVersionCache(player1._id);
  });
});
