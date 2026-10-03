import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import ActivityEvent from '../src/models/ActivityEvent.js';

describe('ActivityEvent modeli', () => {
  before(async () => {
    await mongoose.connect('mongodb://localhost:27017/betzone_test_activity_event');
  });
  after(async () => { await mongoose.disconnect(); });
  beforeEach(async () => { await ActivityEvent.deleteMany({}); });

  it('gerekli alanlar olmadan doğrulama hatası verir', async () => {
    await assert.rejects(() => ActivityEvent.create({}));
  });

  it('geçerli bir event oluşturur ve enum dışı type reddedilir', async () => {
    const userId = new mongoose.Types.ObjectId();
    const ev = await ActivityEvent.create({ type: 'deposit', userId, status: 'completed', summary: 'test' });
    assert.ok(ev._id);
    await assert.rejects(() => ActivityEvent.create({ type: 'not_a_type', userId, status: 'x', summary: 'x' }));
  });

  it('createdAt üzerinde 30 günlük TTL index tanımlı', async () => {
    const indexes = await ActivityEvent.collection.indexes();
    const ttl = indexes.find(i => i.expireAfterSeconds !== undefined);
    assert.ok(ttl, 'TTL index bulunamadı');
    assert.equal(ttl.expireAfterSeconds, 60 * 60 * 24 * 30);
  });
});
