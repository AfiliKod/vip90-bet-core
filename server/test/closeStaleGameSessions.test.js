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
import { closeStaleGameSessions, _setIOGetter, _getIOGetter } from '../src/jobs/closeStaleGameSessions.js';

const ORIGINAL_IO_GETTER = _getIOGetter();

describe('closeStaleGameSessions', () => {
  before(async () => {
    await mongoose.connect('mongodb://localhost:27017/betzone_test_close_stale_sessions');
  });
  after(async () => {
    _setIOGetter(ORIGINAL_IO_GETTER);
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    await ActivityEvent.deleteMany({});
    _setIOGetter(ORIGINAL_IO_GETTER);
  });

  it('10 dakikadan eski aktif oturumu ended yapar ve activity:update yayınlar', async () => {
    const emit = mock.fn();
    _setIOGetter(() => ({ to: () => ({ emit }) }));

    const userId = new mongoose.Types.ObjectId();
    const ev = await ActivityEvent.create({
      type: 'game_session', userId, status: 'active', summary: 'x', data: { roundCount: 3 },
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
  });

  it('taze (10 dakikadan yeni) aktif oturuma dokunmaz', async () => {
    _setIOGetter(() => ({ to: () => ({ emit: mock.fn() }) }));
    const userId = new mongoose.Types.ObjectId();
    const ev = await ActivityEvent.create({ type: 'game_session', userId, status: 'active', summary: 'x', data: {} });

    const closed = await closeStaleGameSessions();

    assert.equal(closed, 0);
    const fresh = await ActivityEvent.findById(ev._id);
    assert.equal(fresh.status, 'active');
  });
});
