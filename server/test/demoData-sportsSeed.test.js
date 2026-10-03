// server/test/demoData-sportsSeed.test.js
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Event from '../src/models/Event.js';
import Bet from '../src/models/Bet.js';
import ActivityEvent from '../src/models/ActivityEvent.js';
import { _setIOGetter, _getIOGetter } from '../src/services/activityFeed.js';
import * as sportsSeed from '../src/services/demoData/sportsSeed.js';

const ORIGINAL_IO_GETTER = _getIOGetter();

describe('demoData/sportsSeed', () => {
  before(async () => {
    _setIOGetter(() => null);
    await mongoose.connect('mongodb://localhost:27017/betzone_test_demo_data_sports');
  });
  after(async () => {
    _setIOGetter(ORIGINAL_IO_GETTER);
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    _setIOGetter(() => null);
    await User.deleteMany({});
    await Event.deleteMany({});
    await Bet.deleteMany({});
    await ActivityEvent.deleteMany({});
  });

  it('load(N) seed kullanıcı havuzu boşken otomatik minimal havuz oluşturur, sonra N bahis üretir', async () => {
    const result = await sportsSeed.load(10);
    assert.equal(result.created, 10);
    assert.ok((await User.countDocuments({ isSeed: true })) >= 20);
    const bets = await Bet.find({ isSeed: true });
    assert.equal(bets.length, 10);
    for (const b of bets) {
      assert.ok(['won', 'lost'].includes(b.status));
      const daysAgo = (Date.now() - b.createdAt.getTime()) / (24 * 60 * 60 * 1000);
      assert.ok(daysAgo <= 90.01);
    }
  });

  it('demo Event havuzu 5 taneyle sınırlı kalır, tekrar load() yeni event üretmez', async () => {
    await sportsSeed.load(20);
    await sportsSeed.load(20);
    const eventCount = await Event.countDocuments({ isSeed: true });
    assert.equal(eventCount, 5);
  });

  it('insertMany ile oluşturulan bahisler ActivityEvent üretmez', async () => {
    await sportsSeed.load(10);
    assert.equal(await ActivityEvent.countDocuments({}), 0);
  });

  it('clear() bahisleri ve demo event\'leri siler', async () => {
    await sportsSeed.load(5);
    const result = await sportsSeed.clear();
    assert.equal(result.deleted, 5);
    assert.equal(result.eventsDeleted, 5);
    assert.equal(await Bet.countDocuments({}), 0);
    assert.equal(await Event.countDocuments({}), 0);
  });

  it('liveTick() gerçek .save() akışıyla bet_placed + bet_settled ActivityEvent\'i üretir', async () => {
    await sportsSeed.load(1);
    const result = await sportsSeed.liveTick();
    assert.ok(result);
    assert.ok(['won', 'lost'].includes(result.outcome));
    const bet = await Bet.findById(result.betId);
    assert.notEqual(bet.status, 'pending');
    const events = await ActivityEvent.find({ type: { $in: ['bet_placed', 'bet_settled'] } });
    assert.equal(events.length, 2);
  });
});
