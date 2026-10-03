import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import CasinoRound from '../src/models/CasinoRound.js';
import ActivityEvent from '../src/models/ActivityEvent.js';
import { _setIOGetter, _getIOGetter } from '../src/services/activityFeed.js';
import * as casinoSeed from '../src/services/demoData/casinoSeed.js';

const ORIGINAL_IO_GETTER = _getIOGetter();

describe('demoData/casinoSeed', () => {
  before(async () => {
    _setIOGetter(() => null);
    await mongoose.connect('mongodb://localhost:27017/betzone_test_demo_data_casino');
  });
  after(async () => {
    _setIOGetter(ORIGINAL_IO_GETTER);
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    _setIOGetter(() => null);
    await User.deleteMany({});
    await CasinoRound.deleteMany({});
    await ActivityEvent.deleteMany({});
  });

  it('load(N) havuz boşken otomatik minimal havuz oluşturur, N round üretir', async () => {
    const result = await casinoSeed.load(10);
    assert.equal(result.created, 10);
    assert.equal(await CasinoRound.countDocuments({ isSeed: true }), 10);
  });

  it('insertMany ile oluşturulan round\'lar ActivityEvent üretmez', async () => {
    await casinoSeed.load(10);
    assert.equal(await ActivityEvent.countDocuments({}), 0);
  });

  it('clear() tüm seed round\'ları siler', async () => {
    await casinoSeed.load(5);
    const result = await casinoSeed.clear();
    assert.equal(result.deleted, 5);
    assert.equal(await CasinoRound.countDocuments({}), 0);
  });

  it('liveTick() gerçek .save() akışıyla game_session ActivityEvent\'i üretir', async () => {
    await casinoSeed.load(1);
    const result = await casinoSeed.liveTick();
    assert.ok(result);
    const round = await CasinoRound.findById(result.roundId);
    assert.equal(round.provider, 'inhouse');
    const events = await ActivityEvent.find({ type: 'game_session' });
    assert.equal(events.length, 1);
  });
});
