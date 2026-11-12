import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import ActivityEvent from '../src/models/ActivityEvent.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { setDefaultTenantId } from '../src/tenancy/defaultTenantId.js';
import { adminRoom, clientsRoom, liveRoom } from '../src/tenancy/tenantKeys.js';
import { setIO } from '../src/services/socketEmitter.js';
import { logActivity, _setIOGetter as setActivityIOGetter, _getIOGetter as getActivityIOGetter } from '../src/services/activityFeed.js';
import { createTicket } from '../src/services/ticket.js';
import { addRecentWinner, getRecentWinners, subscribeToGameStream, emitGameUpdate } from '../src/services/liveGameStream.js';
import { broadcastOnlineCount, getOnlineCount } from '../src/services/onlineCount.js';
import { publishToAllTenants } from '../src/socket/publish.js';
import Tenant from '../src/models/Tenant.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip7_t4';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();
const ORIGINAL_GETTER = getActivityIOGetter();

function fakeIO() {
  const calls = [];
  const io = {
    engine: { clientsCount: 2 },
    sockets: { adapter: { rooms: new Map() } },
    to(room) { return { emit: (event, payload) => calls.push({ room, event, payload }) }; },
    of(namespace) {
      return { to: (room) => ({ emit: (event, payload) => calls.push({ namespace, room, event, payload }) }) };
    },
  };
  return { io, calls };
}

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  await Tenant.create([
    { _id: T1, key: 't1broadcast', name: 'T1', status: 'active' },
    { _id: T2, key: 't2broadcast', name: 'T2', status: 'active' },
  ]);
});
after(async () => {
  setActivityIOGetter(ORIGINAL_GETTER);
  setIO(null);
  setDefaultTenantId(null);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
beforeEach(async () => {
  await User.deleteMany({});
  await ActivityEvent.deleteMany({});
  setActivityIOGetter(ORIGINAL_GETTER);
  setDefaultTenantId(null);
});

describe('tenant-scoped broadcasts', () => {
  it('publishes activity:new to the tenant admin room', async () => {
    const { io, calls } = fakeIO();
    setActivityIOGetter(() => io);
    const user = await User.create({ username: 't1activity', email: 't1activity@test.com', password: 'x', tenantId: T1 });
    await runWithTenant(T1, () => logActivity({ type: 'deposit', userId: user._id, status: 'completed', summary: 'x' }));
    assert.equal(calls[0].room, adminRoom(T1));
    assert.equal(calls[0].event, 'activity:new');
  });

  it('publishes ticket:new to the tenant admin room', async () => {
    setDefaultTenantId(T1);
    const { io, calls } = fakeIO();
    setIO(io);
    const player = await User.create({ username: 't1ticket', email: 't1ticket@test.com', password: 'x', tenantId: T1 });
    await runWithTenant(T1, () => createTicket(player._id, 'Konu', 'Mesaj'));
    const event = calls.find((c) => c.event === 'ticket:new');
    assert.equal(event.room, adminRoom(T1));
  });

  it('keeps winners:new inside the tenant clients room and isolates the recent list', async () => {
    setDefaultTenantId(T1);
    const { io, calls } = fakeIO();
    setIO(io);
    await runWithTenant(T1, () => addRecentWinner({ tenantId: T1, username: 't1winner', gameId: 'crash', amount: 10 }));
    assert.equal(calls[0].room, clientsRoom(T1));
    assert.equal(calls[0].event, 'winners:new');
    assert.equal(getRecentWinners(20, T1).length, 1);
    assert.equal(getRecentWinners(20, T2).length, 0);
  });

  it('broadcasts online:count only to the tenant room', () => {
    setDefaultTenantId(T1);
    const { io, calls } = fakeIO();
    io.sockets.adapter.rooms.set(clientsRoom(T1), { size: 4 });
    setIO(io);
    broadcastOnlineCount(T1);
    assert.equal(calls.at(-1).room, clientsRoom(T1));
    assert.equal(calls.at(-1).payload.count, 4);
    assert.equal(getOnlineCount(T1), 4);
  });

  it('routes game:update to the tenant-prefixed /live room', () => {
    setDefaultTenantId(T1);
    const { io, calls } = fakeIO();
    setIO(io);
    subscribeToGameStream('s1', 'crash', T1);
    emitGameUpdate('crash', { multiplier: 2 }, T1);
    assert.equal(calls.at(-1).namespace, '/live');
    assert.equal(calls.at(-1).room, liveRoom(T1, 'crash'));
  });

  it('enumerates active tenants instead of io.emit for platform-wide updates', async () => {
    const { io, calls } = fakeIO();
    const sent = await publishToAllTenants('odds:update', { eventId: 'e1' }, { io });
    assert.equal(sent, 2);
    assert.deepEqual(
      calls.map((c) => c.room).sort(),
      [clientsRoom(T1), clientsRoom(T2)].sort(),
    );
  });
});
