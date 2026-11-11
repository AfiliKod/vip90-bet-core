process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { io as ioc } from 'socket.io-client';
import User from '../../src/models/User.js';
import Role from '../../src/models/Role.js';
import Permission from '../../src/models/Permission.js';
import ChatRoom from '../../src/models/ChatRoom.js';
import ChatRain from '../../src/models/ChatRain.js';
import ChatMessage from '../../src/models/ChatMessage.js';
import Transaction from '../../src/models/Transaction.js';
import { setIO } from '../../src/services/socketEmitter.js';
import { initChatSocket, createRoom, createRain, splitRainAmount } from '../../src/services/chat.js';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_v8_rain?replicaSet=rs0';
const cents = (n) => Math.round(n * 100);

describe('V8 splitRainAmount conserves money exactly (pure)', () => {
  it('splits in cents, remainder cents go to the first recipients, sum equals the total', () => {
    assert.deepEqual(splitRainAmount(10, 3), [3.34, 3.33, 3.33]);
    assert.deepEqual(splitRainAmount(1, 3), [0.34, 0.33, 0.33]);
    assert.deepEqual(splitRainAmount(9, 3), [3, 3, 3]);
    assert.deepEqual(splitRainAmount(0.05, 3), [0.02, 0.02, 0.01]);
    for (const [total, n] of [[10, 3], [99.99, 7], [100, 50], [0.5, 50], [123.45, 11], [1, 1]]) {
      const parts = splitRainAmount(total, n);
      assert.equal(parts.length, n);
      assert.equal(parts.reduce((s, p) => s + cents(p), 0), cents(total), `${total}/${n}`);
      assert.ok(Math.max(...parts.map(cents)) - Math.min(...parts.map(cents)) <= 1);
    }
  });

  it('rejects non-positive, non-finite and sub-cent totals', () => {
    for (const bad of [0, -1, NaN, Infinity, '10', 1.001, null]) {
      assert.throws(() => splitRainAmount(bad, 3), (e) => e.code === 'INVALID_AMOUNT', String(bad));
    }
  });
});

describe('V8 chat rain is admin-only, funded, atomic and idempotent', async () => {
  let connected = false;
  try { await mongoose.connect(URI, { serverSelectionTimeoutMS: 3000 }); connected = true; } catch { /* skip */ }
  const opts = { skip: !connected && 'MongoDB (replica set) not available' };

  const s = Date.now();
  let srv, io, port, perm, role, admin, poorAdmin, adminNoPerm, player, r1, r2, r3, room, coolRoom;
  const sockets = [];

  const sign = (u, extra = {}) => jwt.sign({ id: String(u._id), role: 'user', tokenVersion: u.tokenVersion ?? 0, ...extra }, process.env.JWT_SECRET);
  const mk = (n, extra = {}) => User.create({ username: `v8_${n}_${s}`, email: `v8_${n}_${s}@test.dev`, password: 'x'.repeat(10), ...extra });
  const bal = async (u) => (await User.findById(u._id).select('balance').lean()).balance;

  function connectAs(u, extraClaims) {
    return new Promise((resolve, reject) => {
      const c = ioc(`http://localhost:${port}/chat`, { auth: { token: sign(u, extraClaims) }, reconnection: false, transports: ['websocket'] });
      sockets.push(c);
      c.on('connect', () => resolve(c));
      c.on('connect_error', reject);
    });
  }

  function emitRain(c, payload) {
    return new Promise((resolve) => {
      const done = (r) => { c.off('chat:rainCreated', onOk); c.off('chat:error', onErr); resolve(r); };
      const onOk = (d) => done({ ok: true, ...d });
      const onErr = (d) => done({ ok: false, ...d });
      c.on('chat:rainCreated', onOk);
      c.on('chat:error', onErr);
      c.emit('chat:rain', payload);
    });
  }

  async function waitInRoom(roomId, n) {
    for (let i = 0; i < 100; i++) {
      const got = await io.of('/chat').in(`room:${roomId}`).fetchSockets();
      if (got.length >= n) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('sockets did not join');
  }

  async function ledgerFor(rainId) {
    return Transaction.find({ type: 'rain', 'metadata.rainId': new mongoose.Types.ObjectId(String(rainId)) }).lean();
  }

  before(async () => {
    if (!connected) return;
    await Promise.all([ChatRain.init(), Transaction.init(), User.init()]);
    perm = await Permission.findOneAndUpdate(
      { key: 'admin:users:balance' },
      { $setOnInsert: { key: 'admin:users:balance', name: 'balance', category: 'users' } },
      { upsert: true, new: true },
    );
    role = await Role.create({ name: `v8_balance_${s}`, displayName: 'v8', permissions: [perm._id] });
    admin = await mk('admin', { role: 'admin', roles: [role._id], balance: 1000 });
    poorAdmin = await mk('pooradmin', { role: 'admin', roles: [role._id], balance: 5 });
    adminNoPerm = await mk('adminnoperm', { role: 'admin', balance: 1000 });
    player = await mk('player', { balance: 1000 });
    r1 = await mk('r1'); r2 = await mk('r2'); r3 = await mk('r3');
    room = await createRoom({ name: `v8 rain ${s}`, rainSettings: { enabled: true, minAmount: 1, maxAmount: 100, cooldown: 0, minUsers: 3 } }, admin._id);
    coolRoom = await createRoom({ name: `v8 cool ${s}`, rainSettings: { enabled: true, minAmount: 1, maxAmount: 100, cooldown: 300, minUsers: 3 } }, admin._id);

    srv = http.createServer();
    io = new Server(srv);
    initChatSocket(io);
    setIO(io);
    await new Promise((r) => srv.listen(0, r));
    port = srv.address().port;

    for (const u of [r1, r2, r3, admin]) {
      const c = await connectAs(u);
      c.emit('chat:join', { roomId: String(room._id) });
      c.emit('chat:join', { roomId: String(coolRoom._id) });
    }
    await waitInRoom(room._id, 4);
    await waitInRoom(coolRoom._id, 4);
  });

  after(async () => {
    for (const c of sockets) c.close();
    if (io) io.close();
    setIO(null);
    if (connected) {
      const ids = [admin, poorAdmin, adminNoPerm, player, r1, r2, r3].filter(Boolean).map((u) => u._id);
      await Transaction.deleteMany({ userId: { $in: ids } });
      await ChatRain.deleteMany({ roomId: { $in: [room?._id, coolRoom?._id] } });
      await ChatMessage.deleteMany({ roomId: { $in: [room?._id, coolRoom?._id] } });
      await ChatRoom.deleteMany({ _id: { $in: [room?._id, coolRoom?._id] } });
      await User.deleteMany({ _id: { $in: ids } });
      await Role.deleteOne({ _id: role?._id });
      await mongoose.disconnect();
    }
  });

  it('a player without admin:users:balance gets chat:error and no balance changes (JWT role claim is not trusted)', opts, async () => {
    const c = await connectAs(player, { role: 'admin' });
    const before = await Promise.all([player, r1, r2, r3].map(bal));
    const res = await emitRain(c, { roomId: String(room._id), totalAmount: 30, requestId: 'v8-player-1' });
    assert.equal(res.ok, false);
    assert.deepEqual(await Promise.all([player, r1, r2, r3].map(bal)), before);
    assert.equal(await ChatRain.countDocuments({ roomId: room._id, createdBy: player._id }), 0);
  });

  it('an admin role without admin:users:balance is refused (403)', opts, async () => {
    await assert.rejects(
      () => createRain(room._id, adminNoPerm._id, { totalAmount: 30, requestId: 'v8-noperm-1' }),
      (e) => e.status === 403 || e.statusCode === 403,
    );
    assert.equal(await bal(adminNoPerm), 1000);
  });

  it('missing requestId → 400 REQUEST_ID_REQUIRED, nothing written', opts, async () => {
    const before = await bal(admin);
    await assert.rejects(() => createRain(room._id, admin._id, { totalAmount: 30 }), (e) => e.code === 'REQUEST_ID_REQUIRED');
    assert.equal(await bal(admin), before);
  });

  it('an admin with insufficient balance gets an error and no balance changes', opts, async () => {
    const c = await connectAs(poorAdmin);
    const before = await Promise.all([poorAdmin, r1, r2, r3].map(bal));
    const res = await emitRain(c, { roomId: String(room._id), totalAmount: 30, requestId: 'v8-poor-1' });
    assert.equal(res.ok, false);
    assert.deepEqual(await Promise.all([poorAdmin, r1, r2, r3].map(bal)), before);
    assert.equal(await ChatRain.countDocuments({ createdBy: poorAdmin._id }), 0);
    assert.equal(await Transaction.countDocuments({ userId: poorAdmin._id }), 0);
  });

  it('amount outside the room rain bounds is refused server-side', opts, async () => {
    const before = await bal(admin);
    // 1000 / 3 recipients = 333.33 per user > rainMaxAmount 100
    await assert.rejects(() => createRain(room._id, admin._id, { totalAmount: 1000, requestId: 'v8-big-1' }), (e) => e.code === 'INVALID_AMOUNT');
    // 2 / 3 = 0.67 per user < rainMinAmount 1
    await assert.rejects(() => createRain(room._id, admin._id, { totalAmount: 2, requestId: 'v8-small-1' }), (e) => e.code === 'INVALID_AMOUNT');
    await assert.rejects(() => createRain(room._id, admin._id, { totalAmount: -30, requestId: 'v8-neg-1' }), (e) => e.code === 'INVALID_AMOUNT');
    assert.equal(await bal(admin), before);
  });

  it('successful rain debits the creator by totalAmount, credits recipients exactly totalAmount, ledger sums to 0', opts, async () => {
    const c = sockets[3]; // admin's socket (also in the room, must not receive its own rain)
    const beforeAdmin = await bal(admin);
    const beforeR = await Promise.all([r1, r2, r3].map(bal));
    const res = await emitRain(c, { roomId: String(room._id), totalAmount: 10, requestId: 'v8-ok-1' });
    assert.equal(res.ok, true, res.message);

    assert.equal(cents(await bal(admin)), cents(beforeAdmin) - 1000);
    const afterR = await Promise.all([r1, r2, r3].map(bal));
    const gained = afterR.map((b, i) => cents(b) - cents(beforeR[i]));
    assert.equal(gained.reduce((a, b) => a + b, 0), 1000);
    assert.deepEqual([...gained].sort(), [333, 333, 334]);

    const rain = await ChatRain.findById(res.rainId).lean();
    assert.equal(rain.status, 'completed');
    assert.ok(rain.requestId && rain.requestId.endsWith('v8-ok-1'));
    assert.equal(rain.recipients.length, 3);
    assert.ok(!rain.recipients.some((r) => String(r.userId) === String(admin._id)));

    const ledger = await ledgerFor(rain._id);
    assert.equal(ledger.length, 4);
    assert.equal(ledger.reduce((sum, t) => sum + cents(t.amount), 0), 0);
    const creatorTx = ledger.find((t) => String(t.userId) === String(admin._id));
    assert.equal(cents(creatorTx.amount), -1000);
    assert.equal(cents(creatorTx.balanceBefore) - cents(creatorTx.balanceAfter), 1000);
  });

  it('the same requestId emitted again (sequentially and as a double click) never debits twice', opts, async () => {
    const c = sockets[3];
    const first = await emitRain(c, { roomId: String(room._id), totalAmount: 12, requestId: 'v8-dup-1' });
    assert.equal(first.ok, true, first.message);
    const afterFirst = await Promise.all([admin, r1, r2, r3].map(bal));
    const txCount = await Transaction.countDocuments({ type: 'rain' });

    const again = await emitRain(c, { roomId: String(room._id), totalAmount: 12, requestId: 'v8-dup-1' });
    assert.equal(again.ok, true);
    assert.equal(String(again.rainId), String(first.rainId));
    assert.deepEqual(await Promise.all([admin, r1, r2, r3].map(bal)), afterFirst);
    assert.equal(await Transaction.countDocuments({ type: 'rain' }), txCount);

    // double click: two concurrent calls with one fresh requestId
    const beforeAdmin = await bal(admin);
    const results = await Promise.allSettled([
      createRain(room._id, admin._id, { totalAmount: 15, requestId: 'v8-dbl-1' }),
      createRain(room._id, admin._id, { totalAmount: 15, requestId: 'v8-dbl-1' }),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled').map((r) => String(r.value._id));
    assert.ok(ok.length >= 1);
    assert.equal(new Set(ok).size, 1);
    assert.equal(cents(await bal(admin)), cents(beforeAdmin) - 1500);
    assert.equal(await ChatRain.countDocuments({ requestId: { $regex: 'v8-dbl-1$' } }), 1);
    assert.equal((await ledgerFor(ok[0])).length, 4);
  });

  it('cooldown is enforced server-side: a second rain with a new requestId inside the cooldown writes nothing', opts, async () => {
    const first = await createRain(coolRoom._id, admin._id, { totalAmount: 9, requestId: 'v8-cool-1' });
    assert.equal(first.status, 'completed');
    const before = await Promise.all([admin, r1, r2, r3].map(bal));
    await assert.rejects(() => createRain(coolRoom._id, admin._id, { totalAmount: 9, requestId: 'v8-cool-2' }), (e) => e.code === 'RAIN_COOLDOWN');
    assert.deepEqual(await Promise.all([admin, r1, r2, r3].map(bal)), before);
  });
});
