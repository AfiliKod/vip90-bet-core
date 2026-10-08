// server/test/demoDataLiveSimulation.test.js
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Transaction from '../src/models/Transaction.js';
import Setting from '../src/models/Setting.js';
import { _setIOGetter, _getIOGetter } from '../src/services/activityFeed.js';
import * as registry from '../src/services/demoData/registry.js';
import {
  startDemoDataLiveJob, stopDemoDataLiveJob, isDemoDataLiveJobRunning, runDemoDataLiveTick, _waitForIdle,
} from '../src/jobs/demoDataLiveSimulation.js';

const ORIGINAL_IO_GETTER = _getIOGetter();

describe('jobs/demoDataLiveSimulation', () => {
  before(async () => {
    _setIOGetter(() => null);
    await mongoose.connect('mongodb://localhost:27017/betzone_test_demo_data_live_job');
  });
  after(async () => {
    _setIOGetter(ORIGINAL_IO_GETTER);
    stopDemoDataLiveJob();
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    _setIOGetter(() => null);
    stopDemoDataLiveJob();
    await User.deleteMany({});
    await Transaction.deleteMany({});
    await Setting.deleteMany({ key: 'demoData.live.config' });
  });
  afterEach(async () => {
    // start() ilk tick'i beklemeden başlatır; bitmeden sonraki teste geçilirse
    // o tick sonraki testin temizlenmiş verisine yazar.
    stopDemoDataLiveJob();
    await _waitForIdle();
  });

  it('start/stop döngüsü isDemoDataLiveJobRunning() ile izlenebilir', () => {
    assert.equal(isDemoDataLiveJobRunning(), false);
    startDemoDataLiveJob(60_000);
    assert.equal(isDemoDataLiveJobRunning(), true);
    stopDemoDataLiveJob();
    assert.equal(isDemoDataLiveJobRunning(), false);
  });

  it('tekrar start() önceki interval\'i temizler (çift interval birikmez)', () => {
    startDemoDataLiveJob(60_000);
    startDemoDataLiveJob(60_000);
    assert.equal(isDemoDataLiveJobRunning(), true);
    stopDemoDataLiveJob();
  });

  it('runDemoDataLiveTick() registry.runLiveTick()\'i çağırır, seed havuzu boşken hata fırlatmaz', async () => {
    const results = await runDemoDataLiveTick();
    assert.ok(Array.isArray(results));
  });

  it('runDemoDataLiveTick() havuz varken gerçek bir yan etki üretir', async () => {
    await registry.loadCategory('users', 20);
    // Tick rastgele bir kategori seçer; yalnız kullanıcı havuzu yüklü olduğu
    // için başka kategori (casino, spor) seçilirse null döner ve test %50'ye
    // yakın oranda düşüyordu. 0.6 → tek tick, kategori `users`, tip `deposit`.
    const realRandom = Math.random;
    Math.random = () => 0.6;
    let results;
    try {
      results = await runDemoDataLiveTick();
    } finally {
      Math.random = realRandom;
    }
    assert.deepEqual(results.map(r => r.category), ['users']);
    assert.ok(results[0].result, 'kullanıcı havuzu varken tick bir işlem üretmeli');
    assert.equal(results[0].result.type, 'deposit');
  });

  it('seed havuzu boşalınca job kendini durdurur ve Setting enabled:false yapar', async () => {
    await registry.loadCategory('users', 5);
    startDemoDataLiveJob(60_000);
    // İlk tick arka planda çalışır; havuzu boşaltmadan önce bitmesini bekle,
    // aksi halde temizlikle eşzamanlı yazıp havuzu boş göstermeyebilir.
    await _waitForIdle();
    assert.equal(isDemoDataLiveJobRunning(), true);

    await registry.clearCategory('users');
    await runDemoDataLiveTick();

    assert.equal(isDemoDataLiveJobRunning(), false, 'boş havuzda job kendini durdurmalı');
    const row = await Setting.findOne({ key: 'demoData.live.config' }).lean();
    assert.ok(row, 'Setting demoData.live.config yazılmalı');
    assert.equal(JSON.parse(row.value).enabled, false);
  });

  it('havuz boşken tekrarlı tick idempotent (job zaten durmuş, Setting stabil)', async () => {
    await runDemoDataLiveTick();
    await runDemoDataLiveTick();
    assert.equal(isDemoDataLiveJobRunning(), false);
    const row = await Setting.findOne({ key: 'demoData.live.config' }).lean();
    assert.equal(JSON.parse(row.value).enabled, false);
  });
});
