import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import ChatRoom from '../../src/models/ChatRoom.js';
import ChatMessage from '../../src/models/ChatMessage.js';
import AuditLog from '../../src/models/AuditLog.js';
import { deleteMessage } from '../../src/services/chat.js';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/betzone_test_v7_chat?replicaSet=rs0';

describe('V7 chat message delete ownership', () => {
  let skip = false, alice, bob, admin, room;
  const mk = (userId, message = 'hello') => ChatMessage.create({ roomId: room._id, userId, message });
  const auditCount = () => AuditLog.countDocuments({ action: 'CHAT_MESSAGE_DELETE' });

  before(async () => {
    try {
      await mongoose.connect(URI, { serverSelectionTimeoutMS: 3000 });
    } catch { skip = true; return; }
    const s = Date.now();
    const u = (n, extra = {}) => User.create({ username: `v7_${n}_${s}`, email: `v7_${n}_${s}@test.example`, password: 'pass12345', ...extra });
    alice = await u('a'); bob = await u('b'); admin = await u('adm', { role: 'admin' });
    room = await ChatRoom.create({ name: `v7room_${s}`, slug: `v7room-${s}` }).catch(() => ChatRoom.create({ name: `v7room_${s}` }));
  });

  after(async () => {
    if (!skip) {
      await ChatMessage.deleteMany({ roomId: room?._id });
      await ChatRoom.deleteOne({ _id: room?._id });
      await User.deleteMany({ _id: { $in: [alice?._id, bob?._id, admin?._id] } });
      await AuditLog.deleteMany({ actorId: { $in: [alice?._id, bob?._id, admin?._id] } });
    }
    await mongoose.disconnect();
  });

  it('player deletes own message without an audit entry', async (t) => {
    if (skip) return t.skip('no db');
    const m = await mk(alice._id);
    const before = await auditCount();
    await deleteMessage(m._id, alice._id);
    assert.equal((await ChatMessage.findById(m._id)).isDeleted, true);
    assert.equal(await auditCount(), before);
  });

  it('player cannot delete another player\'s message (403)', async (t) => {
    if (skip) return t.skip('no db');
    const m = await mk(bob._id);
    await assert.rejects(() => deleteMessage(m._id, alice._id), (e) => e.status === 403 || e.statusCode === 403);
    assert.equal((await ChatMessage.findById(m._id)).isDeleted, false);
  });

  it('admin deletes any message and it is audited', async (t) => {
    if (skip) return t.skip('no db');
    const m = await mk(bob._id);
    const before = await auditCount();
    await deleteMessage(m._id, admin._id, { admin: true, reason: 'spam' });
    assert.equal((await ChatMessage.findById(m._id)).isDeleted, true);
    assert.equal(await auditCount(), before + 1);
  });

  it('re-deleting is a no-op: no new audit entry and moderator attribution is kept', async (t) => {
    if (skip) return t.skip('no db');
    const m = await mk(alice._id);
    await deleteMessage(m._id, admin._id, { admin: true, reason: 'spam' });
    const after1 = await auditCount();
    await deleteMessage(m._id, admin._id, { admin: true, reason: 'again' });
    await deleteMessage(m._id, alice._id);
    assert.equal(await auditCount(), after1);
    const d = await ChatMessage.findById(m._id);
    assert.equal(String(d.deletedBy), String(admin._id));
    assert.equal(d.deleteReason, 'spam');
  });
});
