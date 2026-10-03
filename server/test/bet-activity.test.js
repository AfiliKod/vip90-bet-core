// server/test/bet-activity.test.js
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Event from '../src/models/Event.js';
import Bet from '../src/models/Bet.js';
import ActivityEvent from '../src/models/ActivityEvent.js';

describe('Bet post-save — activity entegrasyonu', () => {
  before(async () => {
    await mongoose.connect('mongodb://localhost:27017/betzone_test_bet_activity');
  });
  after(async () => { await mongoose.disconnect(); });
  beforeEach(async () => {
    await User.deleteMany({});
    await Event.deleteMany({});
    await Bet.deleteMany({});
    await ActivityEvent.deleteMany({});
  });

  it('yeni bir Bet (status: pending) oluşunca bet_placed event yazılır', async () => {
    const user = await User.create({ username: 'betuser1', email: 'betuser1@test.com', password: 'x', balance: 100 });
    const event = await Event.create({
      sport: 'football', league: 'Test Ligi', homeTeam: { name: 'A' }, awayTeam: { name: 'B' },
      startTime: new Date(Date.now() + 3600000), status: 'upcoming',
    });

    await Bet.create({
      userId: user._id,
      selections: [{ eventId: event._id, marketType: '1X2', oddId: '1', oddLabel: '1', oddValue: 2, eventLabel: 'A vs B' }],
      type: 'single', stake: 20, totalOdds: 2, potentialWin: 40, status: 'pending',
    });

    const events = await ActivityEvent.find({ userId: user._id, type: 'bet_placed' });
    assert.equal(events.length, 1);
    assert.equal(events[0].amount, 20);
    // data.selectionCount — client ActivityFeed.jsx'in renderSummary()'i
    // bunu okuyup yerelleştirilmiş metni üretiyor (denetim raporu bulgusu:
    // summary sunucuda sabit Türkçe üretiliyordu, artık client i18n'den geçiyor)
    assert.equal(events[0].data?.selectionCount, 1);
  });

  it("bir Bet 'won' olarak save edilince bet_settled event yazılır (bet_placed hâlâ 1 tane olarak durur)", async () => {
    const user = await User.create({ username: 'betuser2', email: 'betuser2@test.com', password: 'x', balance: 100 });
    const event = await Event.create({
      sport: 'football', league: 'Test Ligi', homeTeam: { name: 'A' }, awayTeam: { name: 'B' },
      startTime: new Date(Date.now() + 3600000), status: 'upcoming',
    });
    const bet = await Bet.create({
      userId: user._id,
      selections: [{ eventId: event._id, marketType: '1X2', oddId: '1', oddLabel: '1', oddValue: 2, eventLabel: 'A vs B' }],
      type: 'single', stake: 20, totalOdds: 2, potentialWin: 40, status: 'pending',
    });

    bet.status = 'won';
    bet.settledAt = new Date();
    await bet.save();

    const placed = await ActivityEvent.find({ userId: user._id, type: 'bet_placed' });
    const settled = await ActivityEvent.find({ userId: user._id, type: 'bet_settled' });
    assert.equal(placed.length, 1);
    assert.equal(settled.length, 1);
    assert.equal(settled[0].status, 'won');
    assert.equal(settled[0].amount, 40);
  });
});
