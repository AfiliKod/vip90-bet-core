import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import {
  setDepositLimit,
  setLossLimit,
  setWagerLimit,
  activateCoolOff,
  activateSelfExclusion,
  checkPlayerEligibility,
  getPlayerResponsibleGamingStatus,
  getRestrictedPlayers,
  restrictAccount,
  updateDailyStats
} from '../src/services/responsibleGaming.js';

describe('Responsible Gaming Service', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_rg');
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('setDepositLimit', () => {
    it('should set deposit limit for user', async () => {
      const user = await User.create({ 
        username: 'testuser', 
        email: 'test@test.com', 
        password: 'pass123' 
      });

      await setDepositLimit(user._id, 'daily', 500);

      const updated = await User.findById(user._id);
      assert.equal(updated.responsibleLimits.depositDaily, 500);
    });
  });

  describe('setLossLimit', () => {
    it('should set loss limit for user', async () => {
      const user = await User.create({ 
        username: 'testuser', 
        email: 'test@test.com', 
        password: 'pass123' 
      });

      await setLossLimit(user._id, 'daily', 200);

      const updated = await User.findById(user._id);
      assert.equal(updated.responsibleLimits.lossDaily, 200);
    });
  });

  describe('setWagerLimit', () => {
    it('should set wager limit for user', async () => {
      const user = await User.create({ 
        username: 'testuser', 
        email: 'test@test.com', 
        password: 'pass123' 
      });

      await setWagerLimit(user._id, 'daily', 1000);

      const updated = await User.findById(user._id);
      assert.equal(updated.responsibleLimits.wagerDaily, 1000);
    });
  });

  describe('activateCoolOff', () => {
    it('should activate cool-off period', async () => {
      const user = await User.create({ 
        username: 'testuser', 
        email: 'test@test.com', 
        password: 'pass123' 
      });

      const duration = 24 * 60 * 60 * 1000; // 24 hours
      await activateCoolOff(user._id, duration, 'Personal reason');

      const updated = await User.findById(user._id);
      assert.ok(updated.responsibleLimits.coolOffUntil);
      assert.equal(updated.responsibleLimits.coolOffReason, 'Personal reason');
    });
  });

  describe('activateSelfExclusion', () => {
    it('should activate self-exclusion', async () => {
      const user = await User.create({ 
        username: 'testuser', 
        email: 'test@test.com', 
        password: 'pass123' 
      });

      const duration = 7 * 24 * 60 * 60 * 1000; // 7 days
      const until = new Date(Date.now() + duration);
      await activateSelfExclusion(user._id, until, 'Need a break');

      const updated = await User.findById(user._id);
      assert.ok(updated.responsibleLimits.selfExclusionUntil);
    });
  });

  describe('restrictAccount', () => {
    it('should restrict account', async () => {
      const admin = await User.create({ 
        username: 'admin', 
        email: 'admin@test.com', 
        password: 'pass123',
        role: 'admin'
      });

      const user = await User.create({ 
        username: 'testuser', 
        email: 'test@test.com', 
        password: 'pass123' 
      });

      await restrictAccount(user._id, 'Violation', admin._id);

      const updated = await User.findById(user._id);
      assert.equal(updated.accountRestricted, true);
      assert.equal(updated.restrictionReason, 'Violation');
    });
  });

  describe('checkPlayerEligibility', () => {
    it('should return ALLOW for eligible player', async () => {
      const user = await User.create({ 
        username: 'testuser', 
        email: 'test@test.com', 
        password: 'pass123' 
      });

      const result = await checkPlayerEligibility(user._id, 'deposit', { amount: 100 });

      assert.equal(result, 'ALLOW');
    });

    it('should return BLOCK for restricted player', async () => {
      const user = await User.create({ 
        username: 'testuser', 
        email: 'test@test.com', 
        password: 'pass123',
        accountRestricted: true
      });

      const result = await checkPlayerEligibility(user._id, 'play');

      assert.equal(result, 'BLOCK');
    });

    it('should return RESTRICT when limit exceeded', async () => {
      const user = await User.create({ 
        username: 'testuser', 
        email: 'test@test.com', 
        password: 'pass123',
        responsibleLimits: { depositDaily: 500 },
        dailyStats: { deposits: 400 }
      });

      const result = await checkPlayerEligibility(user._id, 'deposit', { amount: 200 });

      assert.equal(result, 'RESTRICT');
    });
  });

  describe('getPlayerResponsibleGamingStatus', () => {
    it('should return player status', async () => {
      const user = await User.create({
        username: 'testuser',
        email: 'test@test.com',
        password: 'pass123',
        responsibleLimits: { depositDaily: 500 }
      });

      const status = await getPlayerResponsibleGamingStatus(user._id);

      assert.ok(status);
      assert.equal(status.limits.depositDaily, 500);
    });
  });

  describe('setDepositLimit — limitType eksikse çökmemeli', () => {
    it('limitType verilmezse daily varsayılanına düşer, çökmez', async () => {
      const user = await User.create({ username: 'rg_limittype', email: 'rg_lt@test.com', password: 'pass123' });
      const limits = await setDepositLimit(user._id, undefined, 500);
      assert.strictEqual(limits.depositDaily, 500);
    });
  });

  describe('updateDailyStats wiring — deposit', () => {
    it('transactions.deposit sonrası dailyStats.deposits artmalı', async () => {
      const { deposit } = await import('../src/controllers/transactions.js');
      const user = await User.create({ username: 'rg_depwire', email: 'rg_dw@test.com', password: 'pass123', balance: 0 });
      const req = { user: { id: user._id.toString() }, validated: { amount: 250 } };
      const res = { json: () => {} };
      const next = (e) => { if (e) throw e; };
      await deposit(req, res, next);
      const fresh = await User.findById(user._id);
      assert.strictEqual(fresh.dailyStats.deposits, 250);
    });
  });

  describe('updateDailyStats wiring — wager', () => {
    it('bets.place sonrası dailyStats.wagers artmalı', async () => {
      const { place } = await import('../src/controllers/bets.js');
      const Event = (await import('../src/models/Event.js')).default;
      const user = await User.create({ username: 'rg_betwire', email: 'rg_bw@test.com', password: 'pass123', balance: 1000 });
      const event = await Event.create({
        sport: 'football', league: 'Test', country: 'Test',
        homeTeam: { name: 'A' }, awayTeam: { name: 'B' },
        status: 'upcoming', startTime: new Date(Date.now() + 3600_000),
        markets: [{ type: 'maç_sonucu', odds: [{ id: 'o1', label: '1', value: 2.0, isActive: true }] }],
      });
      const req = {
        user: { id: user._id.toString() },
        validated: { selections: [{ eventId: event._id.toString(), marketType: 'maç_sonucu', oddId: 'o1', oddValue: 2.0 }], type: 'single', stake: 100 },
      };
      const res = { status: () => res, json: () => {} };
      const next = (e) => { if (e) throw e; };
      await place(req, res, next);
      const fresh = await User.findById(user._id);
      assert.strictEqual(fresh.dailyStats.wagers, 100);
    });
  });

  describe('Weekly/Monthly RG limits', () => {
    it('weeklyLimit aşılınca RESTRICT döner', async () => {
      const user = await User.create({
        username: 'rg_weekly', email: 'rg_wk@test.com', password: 'pass123',
        responsibleLimits: { depositWeekly: 1000 },
      });
      await updateDailyStats(user._id, 'deposit', 900);
      const result = await checkPlayerEligibility(user._id, 'deposit', { amount: 200 });
      assert.strictEqual(result, 'RESTRICT');
    });

    it('yeni hafta başlayınca weeklyStats sıfırlanır', async () => {
      const user = await User.create({
        username: 'rg_weekreset', email: 'rg_wr@test.com', password: 'pass123',
      });
      await updateDailyStats(user._id, 'deposit', 500);
      let fresh = await User.findById(user._id);
      assert.strictEqual(fresh.weeklyStats.deposits, 500);

      // Geçen haftaya ait gibi göster
      fresh.weeklyStats.weekStart = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      await fresh.save();

      await updateDailyStats(user._id, 'deposit', 100);
      fresh = await User.findById(user._id);
      assert.strictEqual(fresh.weeklyStats.deposits, 100);
    });

    it('eşzamanlı updateDailyStats çağrıları hiçbir artışı kaybetmemeli', async () => {
      const user = await User.create({ username: 'rg_concurrent', email: 'rg_conc@test.com', password: 'pass123' });
      const amounts = [100, 200, 150, 300, 250, 175, 225, 125, 350, 275];
      await Promise.all(amounts.map((amt) => updateDailyStats(user._id, 'deposit', amt)));
      const fresh = await User.findById(user._id);
      const expectedTotal = amounts.reduce((a, b) => a + b, 0);
      assert.strictEqual(fresh.dailyStats.deposits, expectedTotal);
      assert.strictEqual(fresh.weeklyStats.deposits, expectedTotal);
      assert.strictEqual(fresh.monthlyStats.deposits, expectedTotal);
    });
  });

  describe('getResponsibleGamingAudit', () => {
    it('category=responsible_gaming filtresiyle gerçek audit kayıtlarını döner', async () => {
      const { logAuditEvent } = await import('../src/services/audit.js');
      const admin = await User.create({ username: 'rg_audit_admin', email: 'rg_aa@test.com', password: 'pass123', role: 'admin' });
      const player = await User.create({ username: 'rg_audit_player', email: 'rg_ap@test.com', password: 'pass123' });
      await logAuditEvent({
        actorId: admin._id, actorType: 'admin', actorUsername: 'rg_audit_admin', action: 'RESPONSIBLE_GAMING_RESTRICT',
        category: 'responsible_gaming', targetType: 'player', targetId: player._id,
      });

      const { getResponsibleGamingAudit } = await import('../src/controllers/responsibleGaming.js');
      const req = { query: {} };
      let jsonResult = null;
      const res = { json: (obj) => { jsonResult = obj; } };
      const next = (e) => { if (e) throw e; };
      await getResponsibleGamingAudit(req, res, next);
      assert.ok(jsonResult.audit.length >= 1);
      assert.strictEqual(jsonResult.audit[0].action, 'RESPONSIBLE_GAMING_RESTRICT');
    });
  });

  describe('Loss limit enforcement', () => {
    it('dailyStats.losses zaten lossDaily limitine ulaştıysa yeni bahis RESTRICT döner', async () => {
      const user = await User.create({
        username: 'rg_lossline', email: 'rg_ll@test.com', password: 'pass123',
        responsibleLimits: { lossDaily: 100 },
        dailyStats: { deposits: 0, losses: 100, wagers: 0, lastUpdated: new Date() },
      });
      const result = await checkPlayerEligibility(user._id, 'bet', { amount: 10 });
      assert.strictEqual(result, 'RESTRICT');
    });

    it('dailyStats.losses limitin altındaysa bahis ALLOW döner', async () => {
      const user = await User.create({
        username: 'rg_lossok', email: 'rg_lo@test.com', password: 'pass123',
        responsibleLimits: { lossDaily: 100 },
        dailyStats: { deposits: 0, losses: 50, wagers: 0, lastUpdated: new Date() },
      });
      const result = await checkPlayerEligibility(user._id, 'bet', { amount: 10 });
      assert.strictEqual(result, 'ALLOW');
    });
  });

  describe('getRestrictedPlayers', () => {
    it('alt çizgili type parametrelerini (self_exclusion/cool_off) normalize eder', async () => {
      const until = new Date(Date.now() + 86400_000);
      await User.create({ username: 'rg_se', email: 'rg_se@test.com', password: 'pass123', responsibleLimits: { selfExclusionUntil: until } });
      await User.create({ username: 'rg_co', email: 'rg_co@test.com', password: 'pass123', responsibleLimits: { coolOffUntil: until } });

      const se = await getRestrictedPlayers({ type: 'self_exclusion' });
      assert.ok(se.players.some(p => p.username === 'rg_se'));
      assert.ok(se.players.every(p => p.username === 'rg_se'));

      const co = await getRestrictedPlayers({ type: 'cool_off' });
      assert.ok(co.players.some(p => p.username === 'rg_co'));
      assert.ok(co.players.every(p => p.username === 'rg_co'));
    });

    it('loss_limit/wager_limit filtreleri limiti set edilmiş kullanıcıları döndürür', async () => {
      await User.create({ username: 'rg_loss', email: 'rg_loss@test.com', password: 'pass123', responsibleLimits: { lossDaily: 100 } });
      await User.create({ username: 'rg_wager', email: 'rg_wager@test.com', password: 'pass123', responsibleLimits: { wagerDaily: 500 } });
      await User.create({ username: 'rg_plain', email: 'rg_plain@test.com', password: 'pass123' });

      const loss = await getRestrictedPlayers({ type: 'loss_limit' });
      assert.ok(loss.players.some(p => p.username === 'rg_loss'));
      assert.ok(!loss.players.some(p => p.username === 'rg_plain'));

      const wager = await getRestrictedPlayers({ type: 'wager_limit' });
      assert.ok(wager.players.some(p => p.username === 'rg_wager'));
    });

    it('totalPages alanını döndürür (client pagination)', async () => {
      await User.create({ username: 'rg_page', email: 'rg_page@test.com', password: 'pass123', accountRestricted: true, restrictedAt: new Date() });
      const result = await getRestrictedPlayers({ page: 1, limit: 20, type: 'restricted' });
      assert.ok(result.totalPages >= 1);
      assert.equal(result.totalPages, result.pages);
    });
  });

  describe('restrictAccount/liftRestriction → audit log', () => {
    it('restrictAccount sonrası getResponsibleGamingAudit dolu döner', async () => {
      const admin = await User.create({ username: 'rg_audit_admin2', email: 'raa2@test.com', password: 'pass123', role: 'admin' });
      const player = await User.create({ username: 'rg_audit_player2', email: 'rap2@test.com', password: 'pass123' });

      await restrictAccount(player._id, 'test restriction', admin._id);

      const { getResponsibleGamingAudit } = await import('../src/controllers/responsibleGaming.js');
      const req = { query: {} };
      let jsonResult;
      const res = { json: (b) => { jsonResult = b; } };
      const next = (e) => { if (e) throw e; };
      await getResponsibleGamingAudit(req, res, next);

      assert.ok(jsonResult.audit.length >= 1);
      assert.strictEqual(jsonResult.audit[0].action, 'RESPONSIBLE_GAMING_RESTRICT');
    });
  });
});
