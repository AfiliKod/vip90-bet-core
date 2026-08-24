import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import {
  createBot, getAllBots, getBotById, updateBot, deleteBot, getBotStats,
  getActiveBots, getBotPresets, BOT_PRESETS, scheduleNextAction,
  getBotsNeedingAction, executeBotAction, startAllBots, stopAllBots,
} from '../src/services/bot.js';

process.env.JWT_SECRET ||= 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-jwt-refresh-secret';

describe('Bot Service (User-based, P3)', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_bots');
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('BOT_PRESETS / getBotPresets', () => {
    it('should have all preset types with required behavior fields', () => {
      for (const type of ['casual', 'aggressive', 'conservative', 'high_roller', 'bonus_hunter']) {
        const preset = BOT_PRESETS[type];
        assert.ok(preset);
        assert.ok(preset.betIntervalMinMs);
        assert.ok(preset.betIntervalMaxMs);
        assert.ok(preset.minBetPercent);
        assert.ok(preset.maxBetPercent);
        assert.ok(preset.riskLevel >= 0);
      }
    });

    it('should return all presets via getBotPresets', () => {
      assert.equal(Object.keys(getBotPresets()).length, 5);
    });
  });

  describe('createBot', () => {
    it('should create a real User with isBot:true and preset behavior', async () => {
      const admin = await User.create({ username: 'admin1', email: 'admin1@example.com', password: 'password123', role: 'admin' });

      const bot = await createBot({ username: 'testbot1', email: 'bot1@example.com', botType: 'aggressive', notes: 'test' }, admin._id);

      assert.ok(bot);
      assert.equal(bot.username, 'testbot1');
      assert.equal(bot.isBot, true);
      assert.equal(bot.botProfile.botType, 'aggressive');
      assert.equal(bot.botProfile.behavior.riskLevel, 80);
      assert.equal(bot.botProfile.createdBy.toString(), admin._id.toString());

      // Gerçek bir User kaydı olduğunu doğrula — ayrı bir koleksiyon değil
      const found = await User.findOne({ username: 'testbot1' });
      assert.ok(found);
      assert.equal(found.isBot, true);
    });

    it('should create bot with custom behavior overrides layered on preset', async () => {
      const admin = await User.create({ username: 'admin2', email: 'admin2@example.com', password: 'password123', role: 'admin' });

      const bot = await createBot({ username: 'testbot2', email: 'bot2@example.com', botType: 'casual', behavior: { riskLevel: 99 } }, admin._id);

      assert.equal(bot.botProfile.behavior.riskLevel, 99);
      assert.equal(bot.botProfile.behavior.betIntervalMinMs, 30000);
    });

    it('should throw error for duplicate username/email', async () => {
      const admin = await User.create({ username: 'admin3', email: 'admin3@example.com', password: 'password123', role: 'admin' });
      await createBot({ username: 'dupebot', email: 'dupe1@example.com' }, admin._id);

      await assert.rejects(
        () => createBot({ username: 'dupebot', email: 'dupe2@example.com' }, admin._id),
        /already exists/,
      );
    });
  });

  describe('getAllBots', () => {
    it('should return paginated bots, excluding non-bot users', async () => {
      const admin = await User.create({ username: 'admin4', email: 'admin4@example.com', password: 'password123', role: 'admin' });
      await User.create({ username: 'humanuser', email: 'human@example.com', password: 'password123' }); // not a bot

      for (let i = 1; i <= 5; i++) {
        await createBot({ username: `bot${i}`, email: `bot${i}@example.com`, botType: i % 2 === 0 ? 'aggressive' : 'casual' }, admin._id);
      }

      const result = await getAllBots({ page: 1, limit: 2 });
      assert.equal(result.bots.length, 2);
      assert.equal(result.total, 5); // human excluded
      assert.equal(result.pages, 3);
    });

    it('should filter by status and botType', async () => {
      const admin = await User.create({ username: 'admin5', email: 'admin5@example.com', password: 'password123', role: 'admin' });
      const bot1 = await createBot({ username: 'activebot', email: 'active@example.com', botType: 'casual' }, admin._id);
      const bot2 = await createBot({ username: 'inactivebot', email: 'inactive@example.com', botType: 'aggressive' }, admin._id);
      await User.findByIdAndUpdate(bot2._id, { isActive: false });

      const activeBots = await getAllBots({ status: 'active' });
      assert.equal(activeBots.total, 1);
      assert.equal(activeBots.bots[0].username, 'activebot');

      const casualBots = await getAllBots({ botType: 'casual' });
      assert.equal(casualBots.total, 1);
      assert.equal(casualBots.bots[0].username, bot1.username);
    });
  });

  describe('updateBot', () => {
    it('should update notes and behavior fields', async () => {
      const admin = await User.create({ username: 'admin6', email: 'admin6@example.com', password: 'password123', role: 'admin' });
      const bot = await createBot({ username: 'updateme', email: 'update@example.com' }, admin._id);

      const updated = await updateBot(bot._id, { notes: 'Updated note', behavior: { riskLevel: 50 } });

      assert.equal(updated.botProfile.notes, 'Updated note');
      assert.equal(updated.botProfile.behavior.riskLevel, 50);
    });

    it('should apply preset when botType changed', async () => {
      const admin = await User.create({ username: 'admin7', email: 'admin7@example.com', password: 'password123', role: 'admin' });
      const bot = await createBot({ username: 'typechange', email: 'tc@example.com', botType: 'casual' }, admin._id);

      const updated = await updateBot(bot._id, { botType: 'aggressive' });

      assert.equal(updated.botProfile.botType, 'aggressive');
      assert.equal(updated.botProfile.behavior.riskLevel, 80);
    });
  });

  describe('getBotById / getBotStats', () => {
    it('should return bot by ID', async () => {
      const admin = await User.create({ username: 'admin9', email: 'admin9@example.com', password: 'password123', role: 'admin' });
      const bot = await createBot({ username: 'statbot', email: 'stat@example.com', botType: 'high_roller' }, admin._id);

      const found = await getBotById(bot._id);
      assert.ok(found);
      assert.equal(found.username, 'statbot');
      assert.equal(found.botProfile.botType, 'high_roller');
    });

    it('should return stats', async () => {
      const admin = await User.create({ username: 'admin10', email: 'admin10@example.com', password: 'password123', role: 'admin' });
      const bot = await createBot({ username: 'statbot2', email: 'stat2@example.com' }, admin._id);

      const stats = await getBotStats(bot._id);
      assert.ok(stats);
      assert.equal(stats.botId.toString(), bot._id.toString());
      assert.equal(typeof stats.totalBets, 'number');
    });
  });

  describe('getActiveBots / deleteBot', () => {
    it('should return only active bots', async () => {
      const admin = await User.create({ username: 'admin11', email: 'admin11@example.com', password: 'password123', role: 'admin' });
      await createBot({ username: 'active1', email: 'act1@example.com' }, admin._id);
      const bot2 = await createBot({ username: 'inactive1', email: 'inact1@example.com' }, admin._id);
      await User.findByIdAndUpdate(bot2._id, { isActive: false });

      const active = await getActiveBots();
      assert.equal(active.length, 1);
      assert.equal(active[0].username, 'active1');
    });

    it('should delete the bot User document', async () => {
      const admin = await User.create({ username: 'admin12', email: 'admin12@example.com', password: 'password123', role: 'admin' });
      const bot = await createBot({ username: 'deletebot', email: 'delete@example.com' }, admin._id);
      await deleteBot(bot._id);

      assert.equal(await User.findById(bot._id), null);
    });
  });

  describe('scheduleNextAction / getBotsNeedingAction', () => {
    it('should schedule nextActionAt within the behavior interval window', async () => {
      const admin = await User.create({ username: 'admin13', email: 'admin13@example.com', password: 'password123', role: 'admin' });
      const bot = await createBot({ username: 'schedbot', email: 'sched@example.com', botType: 'casual' }, admin._id);

      const before = Date.now();
      const next = scheduleNextAction(bot);
      const delta = next.getTime() - before;

      assert.ok(delta >= BOT_PRESETS.casual.betIntervalMinMs - 100);
      assert.ok(delta <= BOT_PRESETS.casual.betIntervalMaxMs + 100);
    });

    it('should only surface active bots whose nextActionAt has passed', async () => {
      const admin = await User.create({ username: 'admin14', email: 'admin14@example.com', password: 'password123', role: 'admin' });
      const dueBot = await createBot({ username: 'duebot', email: 'due@example.com' }, admin._id);
      dueBot.botProfile.currentState = 'playing';
      dueBot.botProfile.nextActionAt = new Date(Date.now() - 1000);
      await dueBot.save();

      const notDueBot = await createBot({ username: 'notduebot', email: 'notdue@example.com' }, admin._id);
      notDueBot.botProfile.currentState = 'playing';
      notDueBot.botProfile.nextActionAt = new Date(Date.now() + 60000);
      await notDueBot.save();

      const needing = await getBotsNeedingAction();
      assert.equal(needing.length, 1);
      assert.equal(needing[0].username, 'duebot');
    });
  });

  describe('executeBotAction — limit/guard branches (no network call)', () => {
    it('stops the bot when the daily loss limit is exceeded', async () => {
      const admin = await User.create({ username: 'admin15', email: 'admin15@example.com', password: 'password123', role: 'admin' });
      const bot = await createBot({ username: 'lossbot', email: 'loss@example.com', limits: { maxDailyLoss: 100 } }, admin._id);
      bot.balance = 1000;
      bot.botProfile.currentState = 'playing';
      bot.botProfile.nextActionAt = new Date(Date.now() - 1000);
      bot.botProfile.stats.dailyBetsSince = new Date();
      bot.botProfile.stats.totalWagered = 500;
      await bot.save();

      const result = await executeBotAction(bot._id);
      assert.equal(result.executed, false);
      assert.match(result.reason, /Daily loss limit/);

      const fresh = await User.findById(bot._id);
      assert.equal(fresh.isActive, false);
      assert.equal(fresh.botProfile.currentState, 'stopped');
    });

    it('puts the bot on break when balance is below the play threshold', async () => {
      const admin = await User.create({ username: 'admin16', email: 'admin16@example.com', password: 'password123', role: 'admin' });
      const bot = await createBot({ username: 'brokebot', email: 'broke@example.com', limits: { minBalanceToPlay: 50 } }, admin._id);
      bot.balance = 5;
      bot.botProfile.currentState = 'playing';
      bot.botProfile.nextActionAt = new Date(Date.now() - 1000);
      await bot.save();

      const result = await executeBotAction(bot._id);
      assert.equal(result.executed, false);
      assert.match(result.reason, /Insufficient balance/);
    });

    it('does nothing when nextActionAt is still in the future', async () => {
      const admin = await User.create({ username: 'admin17', email: 'admin17@example.com', password: 'password123', role: 'admin' });
      const bot = await createBot({ username: 'futurebot', email: 'future@example.com' }, admin._id);
      bot.botProfile.nextActionAt = new Date(Date.now() + 60000);
      await bot.save();

      const result = await executeBotAction(bot._id);
      assert.equal(result.executed, false);
      assert.match(result.reason, /Not time yet/);
    });
  });

  describe('startAllBots / stopAllBots', () => {
    it('should transition active bots into playing state and back to stopped', async () => {
      const admin = await User.create({ username: 'admin18', email: 'admin18@example.com', password: 'password123', role: 'admin' });
      await createBot({ username: 'ctrl1', email: 'ctrl1@example.com' }, admin._id);
      await createBot({ username: 'ctrl2', email: 'ctrl2@example.com' }, admin._id);

      const started = await startAllBots();
      assert.equal(started, 2);
      const playing = await User.find({ isBot: true, 'botProfile.currentState': 'playing' });
      assert.equal(playing.length, 2);

      const stopped = await stopAllBots();
      assert.equal(stopped, 2);
      const stoppedBots = await User.find({ isBot: true, 'botProfile.currentState': 'stopped' });
      assert.equal(stoppedBots.length, 2);
    });
  });
});
