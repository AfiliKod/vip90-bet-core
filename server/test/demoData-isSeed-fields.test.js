import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import CasinoRound from '../src/models/CasinoRound.js';
import ActivityEvent from '../src/models/ActivityEvent.js';
import { _setIOGetter, _getIOGetter } from '../src/services/activityFeed.js';
import { randomInt, randomFloat, pick, pickWeighted, randomPastDate } from '../src/services/demoData/randomUtils.js';

const ORIGINAL_IO_GETTER = _getIOGetter();

describe('isSeed alanları + insertMany mimari varsayımı', () => {
  before(async () => {
    _setIOGetter(() => null);
    await mongoose.connect('mongodb://localhost:27017/betzone_test_demo_data_isseed');
  });
  after(async () => {
    _setIOGetter(ORIGINAL_IO_GETTER);
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    await User.deleteMany({});
    await CasinoRound.deleteMany({});
    await ActivityEvent.deleteMany({});
  });

  it('isSeed varsayılan olarak false', async () => {
    const user = await User.create({ username: 'plainuser1', email: 'plainuser1@test.com', password: 'x' });
    assert.equal(user.isSeed, false);
  });

  it('isSeed:true ile oluşturulabilir', async () => {
    const user = await User.create({ username: 'seeduser1', email: 'seeduser1@test.com', password: 'x', isSeed: true });
    assert.equal(user.isSeed, true);
  });

  it('insertMany post-save hook\'ları ÇALIŞTIRMAZ (ActivityEvent üretmez) ve explicit createdAt korunur', async () => {
    const user = await User.create({ username: 'roundowner1', email: 'roundowner1@test.com', password: 'x', isSeed: true });
    const historicalDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await CasinoRound.insertMany([{
      userId: user._id, gameId: 'dice', gameTitle: 'Dice', provider: 'inhouse',
      bet: 10, payout: 0, net: -10, balanceBefore: 1000, balanceAfter: 990,
      isSeed: true, createdAt: historicalDate,
    }]);

    const round = await CasinoRound.findOne({ userId: user._id });
    assert.equal(round.createdAt.getTime(), historicalDate.getTime(), 'insertMany explicit createdAt\'i korumalı');

    const events = await ActivityEvent.find({ userId: user._id });
    assert.equal(events.length, 0, 'insertMany post-save hook\'unu tetiklememeli (ActivityEvent oluşmamalı)');
  });

  it('.save() ile oluşturulan CasinoRound normal şekilde ActivityEvent üretir (kontrast testi)', async () => {
    const user = await User.create({ username: 'roundowner2', email: 'roundowner2@test.com', password: 'x', isSeed: true });
    const round = new CasinoRound({
      userId: user._id, gameId: 'dice', gameTitle: 'Dice', provider: 'inhouse',
      bet: 10, payout: 0, net: -10, balanceBefore: 1000, balanceAfter: 990, isSeed: true,
    });
    await round.save();

    const events = await ActivityEvent.find({ userId: user._id, type: 'game_session' });
    assert.equal(events.length, 1, '.save() normal hook akışını tetiklemeli');
  });
});

describe('randomUtils', () => {
  it('randomInt aralık içinde tam sayı döner', () => {
    for (let i = 0; i < 50; i++) {
      const n = randomInt(5, 10);
      assert.ok(n >= 5 && n <= 10 && Number.isInteger(n));
    }
  });

  it('randomFloat aralık içinde ondalıklı döner', () => {
    const f = randomFloat(1, 2, 2);
    assert.ok(f >= 1 && f <= 2);
  });

  it('pick dizideki bir elemanı döner', () => {
    const arr = ['a', 'b', 'c'];
    assert.ok(arr.includes(pick(arr)));
  });

  it('pickWeighted ağırlık 0 olan değeri hiç döndürmez', () => {
    for (let i = 0; i < 30; i++) {
      assert.notEqual(pickWeighted([['never', 0], ['always', 100]]), 'never');
    }
  });

  it('randomPastDate şimdi ile maxDaysAgo arasında bir tarih döner', () => {
    const d = randomPastDate(90);
    const now = Date.now();
    const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;
    assert.ok(d.getTime() <= now && d.getTime() >= ninetyDaysAgo);
  });
});
