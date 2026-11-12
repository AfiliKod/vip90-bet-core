import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import ChatRoom from '../src/models/ChatRoom.js';
import ChatMessage from '../src/models/ChatMessage.js';
import ChatRain from '../src/models/ChatRain.js';
import ChatTip from '../src/models/ChatTip.js';
import Ticket from '../src/models/Ticket.js';
import ActivityEvent from '../src/models/ActivityEvent.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { listTenantIndexes } from '../src/tenancy/indexRegistry.js';
import { isTenantCollection } from '../src/tenancy/tenantScoped.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip2_t4';
const T1 = new mongoose.Types.ObjectId();
const savedEnforcement = process.env.TENANCY_ENFORCEMENT;

before(async () => {
  process.env.TENANCY_ENFORCEMENT = 'enforce';
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (savedEnforcement === undefined) delete process.env.TENANCY_ENFORCEMENT;
  else process.env.TENANCY_ENFORCEMENT = savedEnforcement;
});

test('Chat, Support and Activity collections are registered as tenant collections', () => {
  for (const c of ['chatrooms', 'chatmessages', 'chatrains', 'chattips', 'tickets', 'activityevents']) {
    assert.ok(isTenantCollection(c), `expected ${c} to be tenant collection`);
  }

  for (const Model of [ChatRoom, ChatMessage, ChatRain, ChatTip, Ticket, ActivityEvent]) {
    const tenantId = Model.schema.path('tenantId');
    assert.ok(tenantId);
    assert.equal(tenantId.options.immutable, true);
    assert.equal(tenantId.options.required, false);
    assert.equal(Model.schema.options.autoIndex, null);
    assert.equal(Model.schema.indexes().some(([keys]) => Object.hasOwn(keys, 'tenantId') && Object.keys(keys).length > 1), false);
  }

  assert.deepEqual(listTenantIndexes().filter(({ modelName }) => [
    'ChatRoom', 'ChatMessage', 'ChatRain', 'ChatTip', 'Ticket', 'ActivityEvent',
  ].includes(modelName)), [
    { modelName: 'ChatRoom', keys: { tenantId: 1, name: 1 }, options: { name: 'tenant_name_uniq', unique: true } },
    { modelName: 'ChatRoom', keys: { tenantId: 1, slug: 1 }, options: { name: 'tenant_slug_uniq', unique: true } },
    { modelName: 'ChatRoom', keys: { tenantId: 1, isActive: 1, isPublic: 1 }, options: { name: 'tenant_isActive_isPublic' } },
    { modelName: 'ChatMessage', keys: { tenantId: 1, roomId: 1, createdAt: -1 }, options: { name: 'tenant_roomId_createdAt' } },
    { modelName: 'ChatMessage', keys: { tenantId: 1, userId: 1, createdAt: -1 }, options: { name: 'tenant_userId_createdAt' } },
    { modelName: 'ChatRain', keys: { tenantId: 1, roomId: 1, status: 1 }, options: { name: 'tenant_roomId_status' } },
    { modelName: 'ChatRain', keys: { tenantId: 1, createdBy: 1, createdAt: -1 }, options: { name: 'tenant_createdBy_createdAt' } },
    { modelName: 'ChatTip', keys: { tenantId: 1, fromUserId: 1, createdAt: -1 }, options: { name: 'tenant_fromUserId_createdAt' } },
    { modelName: 'ChatTip', keys: { tenantId: 1, toUserId: 1, createdAt: -1 }, options: { name: 'tenant_toUserId_createdAt' } },
    { modelName: 'ChatTip', keys: { tenantId: 1, roomId: 1, createdAt: -1 }, options: { name: 'tenant_roomId_createdAt' } },
    { modelName: 'Ticket', keys: { tenantId: 1, userId: 1, createdAt: -1 }, options: { name: 'tenant_userId_createdAt' } },
    { modelName: 'Ticket', keys: { tenantId: 1, status: 1, createdAt: -1 }, options: { name: 'tenant_status_createdAt' } },
    { modelName: 'ActivityEvent', keys: { tenantId: 1, type: 1, createdAt: -1 }, options: { name: 'tenant_type_createdAt' } },
    { modelName: 'ActivityEvent', keys: { tenantId: 1, userId: 1, status: 1, type: 1, updatedAt: -1 }, options: { name: 'tenant_userId_status_type_updatedAt' } },
    { modelName: 'ActivityEvent', keys: { tenantId: 1, createdAt: -1 }, options: { name: 'tenant_createdAt' } },
  ]);
});

test('ChatRoom, Ticket and ActivityEvent stamp tenantId from ambient context', async () => {
  const room = await runWithTenant(T1, () =>
    ChatRoom.create({ name: 'General', slug: 'general' })
  );
  assert.equal(String(room.tenantId), String(T1));

  const ticket = await runWithTenant(T1, () =>
    Ticket.create({ userId: new mongoose.Types.ObjectId(), subject: 'Help' })
  );
  assert.equal(String(ticket.tenantId), String(T1));

  const activity = await runWithTenant(T1, () =>
    ActivityEvent.create({
      type: 'deposit',
      userId: new mongoose.Types.ObjectId(),
      status: 'completed',
      summary: 'Deposit 100 TRY',
    })
  );
  assert.equal(String(activity.tenantId), String(T1));
});
