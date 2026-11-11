process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { io as ioc } from 'socket.io-client';
import User from '../../src/models/User.js';
import { invalidateUserTokens } from '../../src/middleware/auth.js';
import { verifySocketUser } from '../../src/services/socketAuth.js';
import { socketAuthMiddleware } from '../../src/services/socketAuth.js';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/v20_socket_auth_test';
const NAMES = ['v20user1', 'v20seed1'];

describe('V20 socket el sıkışmalarında tokenVersion/isSeed', async () => {
  let connected = false;
  try { await mongoose.connect(URI, { serverSelectionTimeoutMS: 2000 }); connected = true; } catch { /* skip */ }
  const opts = { skip: !connected && 'MongoDB yok' };
  const clean = () => User.deleteMany({ username: { $in: NAMES } });
  const servers = [];
  after(async () => {
    for (const s of servers) { s.io.close(); }
    if (connected) { await clean(); await mongoose.disconnect(); }
  });

  const sign = (u, extra = {}) => jwt.sign({ id: String(u._id), role: 'user', tokenVersion: u.tokenVersion ?? 0, ...extra }, process.env.JWT_SECRET);
  const mk = (username, extra = {}) => User.create({ username, email: `${username}@test.dev`, password: 'x'.repeat(10), ...extra });

  async function connect(token) {
    const srv = http.createServer();
    const io = new Server(srv);
    io.of('/live').use(socketAuthMiddleware);
    io.of('/chat').use(socketAuthMiddleware);
    await new Promise((r) => srv.listen(0, r));
    servers.push({ io });
    const port = srv.address().port;
    const out = {};
    for (const ns of ['/live', '/chat']) {
      out[ns] = await new Promise((resolve) => {
        const c = ioc(`http://localhost:${port}${ns}`, { auth: { token }, reconnection: false, transports: ['websocket'] });
        c.on('connect', () => { c.close(); resolve(true); });
        c.on('connect_error', () => { c.close(); resolve(false); });
      });
    }
    return out;
  }

  it('geçerli token /live ve /chat bağlanır', opts, async () => {
    await clean();
    const u = await mk('v20user1');
    assert.deepEqual(await connect(sign(u)), { '/live': true, '/chat': true });
  });

  it('tokenVersion DB\'de artınca aynı token reddedilir', opts, async () => {
    await clean();
    const u = await mk('v20user1');
    const t = sign(u);
    assert.ok(await verifySocketUser(t));
    await invalidateUserTokens(u._id);
    assert.equal(await verifySocketUser(t), null);
    assert.deepEqual(await connect(t), { '/live': false, '/chat': false });
  });

  it('isSeed kullanıcı reddedilir', opts, async () => {
    await clean();
    const u = await mk('v20seed1', { isSeed: true });
    assert.equal(await verifySocketUser(sign(u)), null);
    assert.deepEqual(await connect(sign(u)), { '/live': false, '/chat': false });
  });

  it('purpose:2fa token reddedilir', opts, async () => {
    await clean();
    const u = await mk('v20user1');
    assert.equal(await verifySocketUser(sign(u, { purpose: '2fa' })), null);
    assert.deepEqual(await connect(sign(u, { purpose: '2fa' })), { '/live': false, '/chat': false });
  });

  it('bozuk/boş token reddedilir', async () => {
    assert.equal(await verifySocketUser(''), null);
    assert.equal(await verifySocketUser('abc'), null);
    assert.equal(await verifySocketUser(undefined), null);
  });
});
