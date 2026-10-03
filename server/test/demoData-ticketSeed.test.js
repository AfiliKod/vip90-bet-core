// server/test/demoData-ticketSeed.test.js
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Ticket from '../src/models/Ticket.js';
import ActivityEvent from '../src/models/ActivityEvent.js';
import { _setIOGetter, _getIOGetter } from '../src/services/activityFeed.js';
import * as ticketSeed from '../src/services/demoData/ticketSeed.js';

const ORIGINAL_IO_GETTER = _getIOGetter();

describe('demoData/ticketSeed', () => {
  before(async () => {
    _setIOGetter(() => null);
    await mongoose.connect('mongodb://localhost:27017/betzone_test_demo_data_tickets');
  });
  after(async () => {
    _setIOGetter(ORIGINAL_IO_GETTER);
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    _setIOGetter(() => null);
    await User.deleteMany({});
    await Ticket.deleteMany({});
    await ActivityEvent.deleteMany({});
  });

  it('load(N) N destek talebi üretir, her biri en az 1 mesaj içerir', async () => {
    const result = await ticketSeed.load(12);
    assert.equal(result.created, 12);
    const tickets = await Ticket.find({ isSeed: true });
    for (const t of tickets) assert.ok(t.messages.length >= 1);
  });

  it('clear() seed talepleri siler', async () => {
    await ticketSeed.load(4);
    const result = await ticketSeed.clear();
    assert.equal(result.deleted, 4);
  });

  it('liveTick() 1 açık talep oluşturur, ActivityEvent üretmez (kapsam dışı)', async () => {
    await ticketSeed.load(1);
    const result = await ticketSeed.liveTick();
    assert.ok(result);
    assert.equal(await ActivityEvent.countDocuments({}), 0);
  });
});
