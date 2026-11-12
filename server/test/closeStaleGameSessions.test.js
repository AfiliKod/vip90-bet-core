// server/test/closeStaleGameSessions.test.js
//
// NOT (mocking yaklaşımı — bkz. activityFeed.test.js ve task-2-report.md):
// Node'da `import * as socketEmitter from '...'` non-configurable bir module
// namespace exotic object döndürür; `mock.method(socketEmitter, 'getIO', fn)`
// "Cannot redefine property" ile patlar. Bu modül activityFeed.js'ten ayrı
// olduğu için KENDİ yerel settable-seam'ini tutar (slikairController.js'teki
// _setSlikairService deseniyle tutarlı) — testler yalnızca seam üzerinden mocklar.
import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import ActivityEvent from '../src/models/ActivityEvent.js';
// Side-effect import: populate('userId', 'username') için User şemasının
// mongoose'a kayıtlı olması gerekir — yoksa "Schema hasn't been registered
// for model User" hatası populate'i düşürür ve emit hiç tetiklenmez
// (bkz. activityFeed.test.js).
import '../src/models/User.js';
import Tenant from '../src/models/Tenant.js';
import { setDefaultTenantId } from '../src/tenancy/defaultTenantId.js';
import { adminRoom } from '../src/tenancy/tenantKeys.js';
import { closeStaleGameSessions, _setIOGetter, _getIOGetter } from '../src/jobs/closeStaleGameSessions.js';

const ORIGINAL_IO_GETTER = _getIOGetter();
// Own test database; never read MONGODB_URI (it may point to a real database).
const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://localhost:27017/vip90_test_ip7_t6_close_stale';
let T1;

describe('closeStaleGameSessions', () => {
  before(async () => {
    await mongoose.connect(TEST_DB);
    await mongoose.connection.dropDatabase();
    const tenant = await Tenant.create({ key: 't1closestale', name: 'T1', status: 'active' });
    T1 = tenant._id;
    setDefaultTenantId(T1);
  });
  after(async () => {
    _setIOGetter(ORIGINAL_IO_GETTER);
    setDefaultTenantId(null);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    await ActivityEvent.deleteMany({});
    _setIOGetter(ORIGINAL_IO_GETTER);
  });

  it('10 dakikadan eski aktif oturumu ended yapar ve activity:update yayınlar', async () => {
    const emit = mock.fn();
    const rooms = [];
    _setIOGetter(() => ({ to: (room) => { rooms.push(room); return { emit }; } }));

    const userId = new mongoose.Types.ObjectId();
    const ev = await ActivityEvent.create({
      type: 'game_session', userId, status: 'active', summary: 'x', data: { roundCount: 3 }, tenantId: T1,
    });
    // NOT: mongoose 8'de { timestamps: true } şemalarda updateOne varsayılan
    // olarak updatedAt'i "şimdi"ye zorlar, $set'teki manuel değeri ezer —
    // { timestamps: false } opsiyonu olmadan bu backdate testi hiç işe yaramaz
    // (bkz. activityFeed.test.js'teki aynı not, Task 3'te doğrulandı).
    await ActivityEvent.updateOne(
      { _id: ev._id },
      { $set: { updatedAt: new Date(Date.now() - 11 * 60 * 1000) } },
      { timestamps: false },
    );

    const closed = await closeStaleGameSessions();

    assert.equal(closed, 1);
    const fresh = await ActivityEvent.findById(ev._id);
    assert.equal(fresh.status, 'ended');
    assert.equal(emit.mock.calls[0].arguments[0], 'activity:update');
    assert.equal(rooms[0], adminRoom(T1));
  });

  it('taze (10 dakikadan yeni) aktif oturuma dokunmaz', async () => {
    _setIOGetter(() => ({ to: () => ({ emit: mock.fn() }) }));
    const userId = new mongoose.Types.ObjectId();
    const ev = await ActivityEvent.create({ type: 'game_session', userId, status: 'active', summary: 'x', data: {}, tenantId: T1 });

    const closed = await closeStaleGameSessions();

    assert.equal(closed, 0);
    const fresh = await ActivityEvent.findById(ev._id);
    assert.equal(fresh.status, 'active');
  });
});
