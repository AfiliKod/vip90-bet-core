import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import ChatRoom from '../src/models/ChatRoom.js';
import Ticket from '../src/models/Ticket.js';
import { runAsPlatform, runWithTenant } from '../src/tenancy/context.js';
import { sendTip } from '../src/services/chat.js';
import { updateRoom, deleteMessage } from '../src/controllers/chat.js';
import { getTicketById } from '../src/controllers/ticket.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip5_t4_chat_support';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

let u1, u2, roomT1, ticketT1;

const savedMode = process.env.TENANCY_MODE;
before(async () => {
  // Cross-tenant isolation is a multi-mode property (scopeTenantId is null in single mode).
  process.env.TENANCY_MODE = 'multi';
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  u1 = await runWithTenant(T1, () => User.create({ username: 'tipper_t1', email: 't1@chat.example.com', password: 'x'.repeat(10), balance: 500 }));
  u2 = await runWithTenant(T2, () => User.create({ username: 'receiver_t2', email: 't2@chat.example.com', password: 'x'.repeat(10), balance: 100 }));

  roomT1 = await runWithTenant(T1, () => ChatRoom.create({
    name: 'T1 Lounge',
    slug: 't1-lounge',
    isActive: true,
  }));

  ticketT1 = await runWithTenant(T1, () => Ticket.create({
    userId: u1._id,
    subject: 'Issue with T1',
    status: 'open',
  }));
});

after(async () => {
  if (savedMode === undefined) delete process.env.TENANCY_MODE; else process.env.TENANCY_MODE = savedMode;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('sendTip rejects cross-tenant recipient with RECIPIENT_NOT_FOUND', async () => {
  await runWithTenant(T1, async () => {
    await assert.rejects(
      async () => sendTip(u1._id, u2._id, roomT1._id, 50, 'cross-tenant tip'),
      (err) => err.status === 404 && err.code === 'RECIPIENT_NOT_FOUND'
    );
  });

  // Verify balances untouched
  const refU1 = await runAsPlatform('test: verify balance', () => User.findById(u1._id));
  const refU2 = await runAsPlatform('test: verify balance', () => User.findById(u2._id));
  assert.equal(refU1.balance, 500);
  assert.equal(refU2.balance, 100);
});

test('T2 staff moderating T1 room or viewing T1 ticket receives 404', async () => {
  const reqRoom = { params: { id: String(roomT1._id) }, tenant: { id: T2 }, validated: { name: 'Renamed' } };
  const reqTicket = { params: { id: String(ticketT1._id) }, tenant: { id: T2 }, user: { id: new mongoose.Types.ObjectId() } };
  const res = { json: () => assert.fail('should not succeed') };

  await runWithTenant(T2, async () => {
    await assert.rejects(
      async () => updateRoom(reqRoom, res, (err) => { throw err; }),
      (err) => err.status === 404
    );
    await assert.rejects(
      async () => getTicketById(reqTicket, res, (err) => { throw err; }),
      (err) => err.status === 404
    );
  });
});
