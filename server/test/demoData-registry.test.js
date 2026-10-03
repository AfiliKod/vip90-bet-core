// server/test/demoData-registry.test.js
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Transaction from '../src/models/Transaction.js';
import Bet from '../src/models/Bet.js';
import Event from '../src/models/Event.js';
import CasinoRound from '../src/models/CasinoRound.js';
import KycDocument from '../src/models/KycDocument.js';
import RiskEvaluation from '../src/models/RiskEvaluation.js';
import RiskFinding from '../src/models/RiskFinding.js';
import Ticket from '../src/models/Ticket.js';
import Agent from '../src/models/Agent.js';
import ReferralCommission from '../src/models/ReferralCommission.js';
import BankDepositRequest from '../src/models/BankDepositRequest.js';
import CryptoDeposit from '../src/models/CryptoDeposit.js';
import SlikairPayment from '../src/models/SlikairPayment.js';
import { _setIOGetter, _getIOGetter } from '../src/services/activityFeed.js';
import * as registry from '../src/services/demoData/registry.js';

const ORIGINAL_IO_GETTER = _getIOGetter();
const ALL_MODELS = [User, Transaction, Bet, Event, CasinoRound, KycDocument, RiskEvaluation, RiskFinding, Ticket, Agent, ReferralCommission, BankDepositRequest, CryptoDeposit, SlikairPayment];

describe('demoData/registry', () => {
  before(async () => {
    _setIOGetter(() => null);
    await mongoose.connect('mongodb://localhost:27017/betzone_test_demo_data_registry');
  });
  after(async () => {
    _setIOGetter(ORIGINAL_IO_GETTER);
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    _setIOGetter(() => null);
    for (const m of ALL_MODELS) await m.deleteMany({});
  });

  it('CATEGORY_IDS 8 kategorinin tamamını içerir', () => {
    assert.deepEqual(registry.CATEGORY_IDS, ['users', 'sports', 'casino', 'kyc', 'risk', 'tickets', 'agents', 'payments']);
  });

  it('isValidCategory geçersiz kategori için false döner', () => {
    assert.equal(registry.isValidCategory('unknown'), false);
    assert.equal(registry.isValidCategory('users'), true);
  });

  it('loadCategory + getStatus tüm kategorilerin sayısını doğru döner', async () => {
    await registry.loadCategory('users', 20);
    await registry.loadCategory('sports', 10);
    await registry.loadCategory('casino', 10);
    const status = await registry.getStatus();
    assert.ok(status.users.count >= 20);
    assert.equal(status.sports.count, 10);
    assert.equal(status.casino.count, 10);
    assert.equal(status.tickets.count, 0);
  });

  it('clearCategory("users") bağımlı TÜM kategorileri cascade temizler', async () => {
    await registry.loadCategory('users', 20);
    await registry.loadCategory('sports', 10);
    await registry.loadCategory('casino', 10);
    await registry.loadCategory('kyc', 5);
    await registry.loadCategory('risk', 5);
    await registry.loadCategory('tickets', 5);
    await registry.loadCategory('agents', 2);
    await registry.loadCategory('payments', 5);

    await registry.clearCategory('users');

    const status = await registry.getStatus();
    for (const id of registry.CATEGORY_IDS) {
      assert.equal(status[id].count, 0, `${id} cascade sonrası boş olmalı`);
    }
  });

  it('clearCategory diğer kategoriler için bağımsız çalışır (users\'a dokunmaz)', async () => {
    await registry.loadCategory('users', 20);
    await registry.loadCategory('sports', 10);
    await registry.clearCategory('sports');
    const status = await registry.getStatus();
    assert.equal(status.sports.count, 0);
    assert.ok(status.users.count >= 20);
  });

  it('runLiveTick() havuz varken hata fırlatmadan çalışır', async () => {
    await registry.loadCategory('users', 20);
    await registry.loadCategory('sports', 5);
    await registry.loadCategory('casino', 5);
    const results = await registry.runLiveTick();
    assert.ok(Array.isArray(results));
    assert.ok(results.length >= 1);
  });

  it('clearAll() isSeed:false gerçek verilere dokunmaz (yalnızca seed siler)', async () => {
    const realUser = await User.create({
      username: 'realuser_keep', email: 'realuser_keep@test.com', password: 'x', isSeed: false,
    });
    await Transaction.create({
      userId: realUser._id, type: 'deposit', amount: 100,
      balanceBefore: 0, balanceAfter: 100, isSeed: false,
    });
    await CasinoRound.create({
      userId: realUser._id, gameId: 'dice', gameTitle: 'Dice', provider: 'inhouse',
      bet: 10, payout: 0, net: -10, balanceBefore: 100, balanceAfter: 90, isSeed: false,
    });

    await registry.loadCategory('users', 5);
    await registry.loadCategory('casino', 3);
    await registry.clearAll();

    assert.equal(await User.countDocuments({ isSeed: true }), 0, 'seed kullanıcılar silinmeli');
    assert.equal(await CasinoRound.countDocuments({ isSeed: true }), 0, 'seed round\'lar silinmeli');
    assert.equal(await User.countDocuments({ isSeed: false }), 1, 'gerçek kullanıcı kalmalı');
    assert.equal(await Transaction.countDocuments({ isSeed: false }), 1, 'gerçek transaction kalmalı');
    assert.equal(await CasinoRound.countDocuments({ isSeed: false }), 1, 'gerçek casino round kalmalı');
    assert.ok(await User.exists({ _id: realUser._id }), 'gerçek kullanıcı belgesi kaybolmamalı');
  });

  it('clearCategory("sports") isSeed:false Bet/Event dokunmaz', async () => {
    const realUser = await User.create({
      username: 'realuser_bet', email: 'realuser_bet@test.com', password: 'x', isSeed: false,
    });
    const realEvent = await Event.create({
      externalId: 'real-event-1', sport: 'Football', league: 'TLG', country: 'TR',
      homeTeam: { name: 'A', country: 'TR' }, awayTeam: { name: 'B', country: 'TR' },
      startTime: new Date(Date.now() + 86400000), status: 'upcoming', isSeed: false,
      markets: [{ type: 'maç_sonucu', label: 'Maç Sonucu', odds: [{ id: 'ms1', label: '1', value: 2 }] }],
    });
    await Bet.create({
      userId: realUser._id,
      selections: [{
        eventId: realEvent._id, marketType: 'maç_sonucu', oddId: 'ms1', oddLabel: '1',
        oddValue: 2, eventLabel: 'A - B', outcome: 'won',
      }],
      type: 'single', stake: 50, totalOdds: 2, potentialWin: 100, status: 'won', isSeed: false,
    });

    await registry.loadCategory('users', 5);
    await registry.loadCategory('sports', 3);
    await registry.clearCategory('sports');

    assert.equal(await Bet.countDocuments({ isSeed: true }), 0);
    assert.equal(await Event.countDocuments({ isSeed: true }), 0);
    assert.equal(await Bet.countDocuments({ isSeed: false }), 1, 'gerçek bet kalmalı');
    assert.equal(await Event.countDocuments({ isSeed: false }), 1, 'gerçek event kalmalı');
    assert.equal(await User.countDocuments({ isSeed: true }), 5, 'sports.clear users\'a dokunmamalı');
    assert.equal(await User.countDocuments({ isSeed: false }), 1, 'gerçek kullanıcı kalmalı');
  });
});
