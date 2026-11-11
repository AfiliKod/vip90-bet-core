// V19b follow-up — tips, chat rain and the admin Slikair payout move balance
// out like a withdrawal, so they are refused while the user has an open igames
// session (active or closing); allowed again after the close.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/v19b_tip_rain_guard_test?replicaSet=rs0';
process.env.JWT_SECRET ||= 'v19b-tr-secret';
process.env.SLIKAIR_MERCHANT_ID = process.env.SLIKAIR_MERCHANT_ID || 'v19b-merchant';
process.env.SLIKAIR_MERCHANT_TOKEN = process.env.SLIKAIR_MERCHANT_TOKEN || 'v19b-token';
process.env.SLIKAIR_SITE_ID = process.env.SLIKAIR_SITE_ID || 'v19b-site';

let connected = false;
try {
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 2000 });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  connected = Boolean(hello.setName);
  if (!connected) await mongoose.disconnect();
} catch { /* skip */ }
const opts = { skip: !connected && 'MongoDB replica set not available' };

let User, CasinoSession, Role, Permission, ChatRoom, chat, slikair, ctx = {};
const made = [];
let seq = 0;
const s = Date.now();

before(async () => {
  if (!connected) return;
  ({ default: User } = await import('../../src/models/User.js'));
  ({ default: CasinoSession } = await import('../../src/models/CasinoSession.js'));
  ({ default: Role } = await import('../../src/models/Role.js'));
  ({ default: Permission } = await import('../../src/models/Permission.js'));
  ({ default: ChatRoom } = await import('../../src/models/ChatRoom.js'));
  chat = await import('../../src/services/chat.js');
  slikair = await import('../../src/controllers/slikairController.js');
  ctx.orig = slikair._getSlikairService();
  slikair._setSlikairService({ async createPayout() { throw Object.assign(new Error('stub'), { status: 400 }); } });
  const perm = await Permission.findOneAndUpdate(
    { key: 'admin:users:balance' },
    { $setOnInsert: { key: 'admin:users:balance', name: 'balance', category: 'users' } },
    { upsert: true, new: true },
  );
  ctx.role = await Role.create({ name: `v19btr_${s}`, displayName: 'v19btr', permissions: [perm._id] });
});

after(async () => {
  if (!connected) return;
  slikair._setSlikairService(ctx.orig);
  await CasinoSession.deleteMany({ userId: { $in: made } });
  await User.deleteMany({ _id: { $in: made } });
  await Role.deleteOne({ _id: ctx.role?._id });
  if (ctx.room) await ChatRoom.deleteOne({ _id: ctx.room._id });
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect();
});

async function mkUser(extra = {}) {
  seq += 1;
  const n = `v19btr_${s}_${seq}`;
  const u = await User.create({ username: n, email: `${n}@example.test`, password: 'pass12345', balance: 200, ...extra });
  made.push(u._id);
  return u;
}
const openSession = (u, status = 'active') => CasinoSession.create({
  userId: u._id, palaceUserCode: `pc_${s}_${seq}`, gameId: 'g1', initialBalance: 100, transferredAt: new Date(), status,
});

describe('V19b guard covers tip, rain and admin Slikair payout', () => {
  it('sendTip is refused while an igames session is open, allowed after close', opts, async () => {
    const from = await mkUser(); const to = await mkUser();
    const owner = await mkUser();
    ctx.room = await chat.createRoom({ name: `v19b tip ${s}` }, owner._id);
    const sess = await openSession(from);
    await assert.rejects(() => chat.sendTip(from._id, to._id, ctx.room._id, 10, '', { requestId: 'g-1' }), (e) => e.code === 'IGAMES_SESSION_OPEN');
    await CasinoSession.updateOne({ _id: sess._id }, { status: 'closing' });
    await assert.rejects(() => chat.sendTip(from._id, to._id, ctx.room._id, 10, '', { requestId: 'g-2' }), (e) => e.code === 'IGAMES_SESSION_OPEN');
    assert.equal((await User.findById(from._id).select('balance').lean()).balance, 200);
    await CasinoSession.updateOne({ _id: sess._id }, { status: 'closed' });
    const tip = await chat.sendTip(from._id, to._id, ctx.room._id, 10, '', { requestId: 'g-3' });
    assert.ok(tip);
    assert.equal((await User.findById(from._id).select('balance').lean()).balance, 190);
  });

  it('createRain is refused while the creator has an open igames session, allowed after close', opts, async () => {
    const admin = await mkUser({ role: 'admin', roles: [ctx.role._id] });
    const sess = await openSession(admin);
    const ghostRoom = new mongoose.Types.ObjectId();
    await assert.rejects(() => chat.createRain(ghostRoom, admin._id, { totalAmount: 30, requestId: 'gr-1' }), (e) => e.code === 'IGAMES_SESSION_OPEN');
    await CasinoSession.updateOne({ _id: sess._id }, { status: 'closed' });
    // past the guard now: the (nonexistent) room is what stops it
    await assert.rejects(() => chat.createRain(ghostRoom, admin._id, { totalAmount: 30, requestId: 'gr-2' }), (e) => e.code === 'NOT_FOUND');
  });

  it('admin initiatePayout is refused while the target has an open session, allowed after close', opts, async () => {
    const target = await mkUser();
    const sess = await openSession(target);
    const call = async () => {
      let err = null;
      const res = { status() { return res; }, json() { return res; } };
      await slikair.initiatePayout(
        { validated: { userId: String(target._id), amount: 40, currency: 'EUR', method: 'crypto', country: 'NLD', paymentDetails: {} }, user: { id: String(new mongoose.Types.ObjectId()) } },
        res, (e) => { err = e; },
      );
      return err;
    };
    assert.equal((await call())?.code, 'IGAMES_SESSION_OPEN');
    assert.equal((await User.findById(target._id).select('balance').lean()).balance, 200);
    await CasinoSession.updateOne({ _id: sess._id }, { status: 'closed' });
    const after = await call();
    assert.notEqual(after?.code, 'IGAMES_SESSION_OPEN');
  });
});
