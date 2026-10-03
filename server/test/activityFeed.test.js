// server/test/activityFeed.test.js (bu dosyaya Task 3'te upsertGameSession testleri de eklenecek)
//
// NOT (mocking yaklaşımı — bkz. task-2-report.md "Fix" bölümü):
// Node'da `import * as socketEmitter from '...'` bir "module namespace exotic
// object" döndürür; spec gereği configurable:false'tur, bu yüzden
// `mock.method(socketEmitter, 'getIO', fn)` "Cannot redefine property" ile
// patlar (Node 22.13.1 ve 23.7.0'da doğrudan Object.defineProperty ile de
// doğrulandı, test runner'a özgü bir hata değil). Bunun yerine bu depoda
// zaten kanıtlanmış settable-seam deseni kullanılıyor (bkz.
// slikairController.js'teki _setSlikairService/_getSlikairService) —
// activityFeed.js artık _setIOGetter/_getIOGetter export ediyor. Bu, hiçbir
// deneysel bayrak gerektirmez.
import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import ActivityEvent from '../src/models/ActivityEvent.js';
import User from '../src/models/User.js';
import { logActivity, upsertGameSession, _setIOGetter, _getIOGetter } from '../src/services/activityFeed.js';

const ORIGINAL_IO_GETTER = _getIOGetter();

describe('activityFeed — logActivity', () => {
  before(async () => {
    await mongoose.connect('mongodb://localhost:27017/betzone_test_activity_feed');
  });
  after(async () => {
    _setIOGetter(ORIGINAL_IO_GETTER);
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    await ActivityEvent.deleteMany({});
    await User.deleteMany({});
    _setIOGetter(ORIGINAL_IO_GETTER);
  });

  it('ActivityEvent oluşturur ve role:admin odasına username populate edilmiş activity:new yayınlar', async () => {
    const emit = mock.fn();
    const to = mock.fn(() => ({ emit }));
    _setIOGetter(() => ({ to }));

    const user = await User.create({ username: 'activitytestuser', email: 'activitytestuser@test.com', password: 'x' });
    const ev = await logActivity({
      type: 'deposit', userId: user._id, status: 'completed', summary: '₺50 yatırma (credit_card)',
      amount: 50, currency: 'TRY', referenceId: new mongoose.Types.ObjectId(), referenceModel: 'Transaction',
    });

    assert.ok(ev._id);
    const stored = await ActivityEvent.findById(ev._id);
    assert.equal(stored.type, 'deposit');

    assert.equal(to.mock.calls[0].arguments[0], 'role:admin');
    assert.equal(emit.mock.calls[0].arguments[0], 'activity:new');
    assert.equal(emit.mock.calls[0].arguments[1].type, 'deposit');
    assert.equal(emit.mock.calls[0].arguments[1].userId.username, 'activitytestuser', 'Canlı push\'ta userId username ile populate edilmiş olmalı (Users.jsx ?openUser= linki buna dayanıyor)');
  });

  it('getIO null dönerse (socket henüz kurulmamış) sessizce atlar, hata fırlatmaz', async () => {
    _setIOGetter(() => null);
    const userId = new mongoose.Types.ObjectId();
    const ev = await logActivity({ type: 'deposit', userId, status: 'completed', summary: 'x' });
    assert.ok(ev._id);
  });

  it('DB yazma hatası dışarı fırlatılmaz, null döner (asıl işlemi etkilememeli)', async () => {
    mock.method(ActivityEvent, 'create', async () => { throw new Error('DB down'); });
    const result = await logActivity({ type: 'deposit', userId: new mongoose.Types.ObjectId(), status: 'completed', summary: 'x' });
    assert.equal(result, null);
    mock.restoreAll();
  });
});

describe('activityFeed — upsertGameSession', () => {
  // NOT: Brief'te "ayrı before/after gerekmiyor" deniyordu (aynı dosya, aynı
  // describe dışı bağlantı varsayımıyla) ama Task 2'nin after() hook'u
  // mongoose.disconnect() çağırıyor ve bu, describe 2 başlamadan ÖNCE
  // çalışıyor (node:test top-level describe'ları sıralı çalıştırıyor,
  // --test-concurrency=1 ile de doğrulandı — race değil). Bu yüzden burada
  // kendi before/after'ımızı ekliyoruz; Task 2'nin before/after'ına dokunmuyoruz.
  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect('mongodb://localhost:27017/betzone_test_activity_feed');
    }
  });
  after(async () => {
    _setIOGetter(ORIGINAL_IO_GETTER);
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    await ActivityEvent.deleteMany({});
    _setIOGetter(ORIGINAL_IO_GETTER);
  });

  it('aktif oturum yoksa yeni bir tane açar (status: active, roundCount: 1)', async () => {
    const emit = mock.fn();
    _setIOGetter(() => ({ to: () => ({ emit }) }));
    const userId = new mongoose.Types.ObjectId();

    await upsertGameSession({ userId, gameId: 'crash', gameTitle: 'Crash', bet: 10, net: -10 });

    const events = await ActivityEvent.find({ userId, type: 'game_session' });
    assert.equal(events.length, 1);
    assert.equal(events[0].status, 'active');
    assert.equal(events[0].data.roundCount, 1);
    assert.equal(events[0].data.totalBet, 10);
    assert.equal(events[0].data.totalNet, -10);
    assert.equal(emit.mock.calls[0].arguments[0], 'activity:new');
  });

  it('10 dakika içindeki bir sonraki turda var olan aktif oturumu günceller (yeni event AÇMAZ)', async () => {
    const emit = mock.fn();
    _setIOGetter(() => ({ to: () => ({ emit }) }));
    const userId = new mongoose.Types.ObjectId();

    await upsertGameSession({ userId, gameId: 'crash', gameTitle: 'Crash', bet: 10, net: -10 });
    await upsertGameSession({ userId, gameId: 'crash', gameTitle: 'Crash', bet: 20, net: 15 });

    const events = await ActivityEvent.find({ userId, type: 'game_session' });
    assert.equal(events.length, 1, 'İkinci çağrı yeni event açmamalı, var olanı güncellemeli');
    assert.equal(events[0].data.roundCount, 2);
    assert.equal(events[0].data.totalBet, 30);
    assert.equal(events[0].data.totalNet, 5);
    assert.equal(emit.mock.calls[1].arguments[0], 'activity:update');
  });

  it('10 dakikadan eski bir aktif oturumdan sonra YENİ bir oturum açar (eskisini günceLLEMEZ)', async () => {
    _setIOGetter(() => ({ to: () => ({ emit: mock.fn() }) }));
    const userId = new mongoose.Types.ObjectId();

    await upsertGameSession({ userId, gameId: 'crash', gameTitle: 'Crash', bet: 10, net: -10 });
    // Var olan event'in updatedAt'ini 11 dakika öncesine çek.
    // NOT: mongoose 8'de { timestamps: true } şemalarda updateMany/updateOne
    // varsayılan olarak updatedAt'i "şimdi"ye zorlar, $set'teki manuel
    // değeri ezer (bkz. mongoose "Automatic Timestamps on updates" davranışı)
    // — { timestamps: false } opsiyonu olmadan bu backdate testi hiç
    // işe yaramaz, session hep "aktif pencere içinde" görünür.
    await ActivityEvent.updateMany({ userId, type: 'game_session' }, { $set: { updatedAt: new Date(Date.now() - 11 * 60 * 1000) } }, { timestamps: false });

    await upsertGameSession({ userId, gameId: 'crash', gameTitle: 'Crash', bet: 20, net: 15 });

    const events = await ActivityEvent.find({ userId, type: 'game_session' }).sort({ createdAt: 1 });
    assert.equal(events.length, 2, 'Eski aktif oturum 10 dk penceresini aştığı için yeni bir oturum açılmalı');
    assert.equal(events[1].data.roundCount, 1);
  });

  it('farklı bir oyuna geçilse de summary oturumun kendi data.gameTitle\'ı ile kalır', async () => {
    _setIOGetter(() => ({ to: () => ({ emit: mock.fn() }) }));
    const userId = new mongoose.Types.ObjectId();

    await upsertGameSession({ userId, gameId: 'crash', gameTitle: 'Crash', bet: 10, net: -10 });
    await upsertGameSession({ userId, gameId: 'mines', gameTitle: 'Mines', bet: 20, net: 15 });

    const events = await ActivityEvent.find({ userId, type: 'game_session' });
    assert.equal(events.length, 1, 'Farklı oyun 10 dk penceresi içinde oturumu bölmeli değil, güncellemeli');
    assert.match(events[0].summary, /^Crash — 2 tur, 30₺ bahis$/, 'Summary oturumun ilk oyununu (data.gameTitle) yansıtmalı, çağrının gameTitle\'ını değil');
    assert.equal(events[0].data.gameId, 'crash', 'data.gameId oluşturulurken donmuş kalmalı');
    assert.equal(events[0].data.gameTitle, 'Crash', 'data.gameTitle oluşturulurken donmuş kalmalı');
    assert.equal(events[0].data.roundCount, 2, 'Toplamak per-user olduğu için roundCount yine artmalı');
    assert.equal(events[0].data.totalBet, 30);
    assert.equal(events[0].data.totalNet, 5);
  });
});
