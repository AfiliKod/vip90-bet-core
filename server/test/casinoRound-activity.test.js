// server/test/casinoRound-activity.test.js
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import CasinoRound from '../src/models/CasinoRound.js';
import ActivityEvent from '../src/models/ActivityEvent.js';
import { _setIOGetter } from '../src/services/activityFeed.js';

describe('CasinoRound post-save — activity entegrasyonu', () => {
  before(async () => {
    await mongoose.connect('mongodb://localhost:27017/betzone_test_casinoround_activity');
  });
  after(async () => { await mongoose.disconnect(); });
  beforeEach(async () => {
    _setIOGetter(() => null);
    await User.deleteMany({});
    await CasinoRound.deleteMany({});
    await ActivityEvent.deleteMany({});
  });

  it("provider='inhouse' bir CasinoRound oluşunca game_session event'i açılır", async () => {
    const user = await User.create({ username: 'cru1', email: 'cru1@test.com', password: 'x', balance: 100 });
    await CasinoRound.create({
      userId: user._id, gameId: 'crash', gameTitle: 'Crash', provider: 'inhouse',
      bet: 10, payout: 0, net: -10, balanceBefore: 100, balanceAfter: 90,
    });

    const events = await ActivityEvent.find({ userId: user._id, type: 'game_session' });
    assert.equal(events.length, 1);
    assert.equal(events[0].data.roundCount, 1);
  });

  it("provider='igames' için game_session event'i AÇILMAZ (kapsam dışı)", async () => {
    const user = await User.create({ username: 'cru2', email: 'cru2@test.com', password: 'x', balance: 100 });
    await CasinoRound.create({
      userId: user._id, gameId: 'slot1', gameTitle: 'Slot', provider: 'igames',
      bet: 10, payout: 0, net: -10, balanceBefore: 100, balanceAfter: 90,
    });

    const events = await ActivityEvent.find({ userId: user._id, type: 'game_session' });
    assert.equal(events.length, 0);
  });
});
