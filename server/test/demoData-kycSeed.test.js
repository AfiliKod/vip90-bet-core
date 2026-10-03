// server/test/demoData-kycSeed.test.js
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import KycDocument from '../src/models/KycDocument.js';
import ActivityEvent from '../src/models/ActivityEvent.js';
import { _setIOGetter, _getIOGetter } from '../src/services/activityFeed.js';
import * as kycSeed from '../src/services/demoData/kycSeed.js';

const ORIGINAL_IO_GETTER = _getIOGetter();

describe('demoData/kycSeed', () => {
  before(async () => {
    _setIOGetter(() => null);
    await mongoose.connect('mongodb://localhost:27017/betzone_test_demo_data_kyc');
  });
  after(async () => {
    _setIOGetter(ORIGINAL_IO_GETTER);
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    _setIOGetter(() => null);
    await User.deleteMany({});
    await KycDocument.deleteMany({});
    await ActivityEvent.deleteMany({});
  });

  it('load(N) N belge üretir, durum karışımı pending/approved/rejected içerir', async () => {
    const result = await kycSeed.load(30);
    assert.equal(result.created, 30);
    const statuses = new Set((await KycDocument.find({ isSeed: true })).map(d => d.status));
    assert.ok(statuses.has('pending'));
  });

  it('insertMany backfill hiç ActivityEvent üretmez', async () => {
    await kycSeed.load(10);
    assert.equal(await ActivityEvent.countDocuments({}), 0);
  });

  it('clear() tüm seed belgeleri siler', async () => {
    await kycSeed.load(5);
    const result = await kycSeed.clear();
    assert.equal(result.deleted, 5);
    assert.equal(await KycDocument.countDocuments({}), 0);
  });

  it('liveTick() 1 belge oluşturur ve kyc_submitted ActivityEvent\'i manuel tetikler', async () => {
    await kycSeed.load(1);
    const result = await kycSeed.liveTick();
    assert.ok(result);
    const events = await ActivityEvent.find({ type: 'kyc_submitted', userId: result.userId });
    assert.equal(events.length, 1);
    assert.equal(events[0].data.docCount, 1);
  });
});
