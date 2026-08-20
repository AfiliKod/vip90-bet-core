import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Bot from '../src/models/Bot.js';
import { createBot, getAllBots, getBotById, updateBot, deleteBot, getBotStats, getActiveBots, getBotPresets, BOT_PRESETS } from '../src/services/bot.js';

describe('Bot Service', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_bots');
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Bot.deleteMany({});
    await User.deleteMany({});
  });

  describe('BOT_PRESETS', () => {
    it('should have all preset types', () => {
      assert.ok(BOT_PRESETS.casual);
      assert.ok(BOT_PRESETS.aggressive);
      assert.ok(BOT_PRESETS.conservative);
      assert.ok(BOT_PRESETS.high_roller);
      assert.ok(BOT_PRESETS.bonus_hunter);
    });

    it('should have required behavior properties', () => {
      for (const [, preset] of Object.entries(BOT_PRESETS)) {
        assert.ok(preset.betIntervalMin);
        assert.ok(preset.betIntervalMax);
        assert.ok(preset.minBetPercent);
        assert.ok(preset.maxBetPercent);
        assert.ok(preset.riskLevel);
      }
    });
  });

  describe('getBotPresets', () => {
    it('should return all presets', () => {
      const presets = getBotPresets();
      assert.equal(Object.keys(presets).length, 5);
    });
  });

  describe('createBot', () => {
    it('should create a new bot with preset behavior', async () => {
      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      const bot = await createBot({
        username: 'testbot1',
        email: 'bot1@example.com',
        password: 'password123',
        botType: 'aggressive',
        notes: 'Test aggressive bot',
      }, admin._id);

      assert.ok(bot);
      assert.equal(bot.username, 'testbot1');
      assert.equal(bot.botType, 'aggressive');
      assert.equal(bot.isBot, true);
      assert.equal(bot.behavior.riskLevel, 80);
      assert.equal(bot.createdBy.toString(), admin._id.toString());
    });

    it('should create bot with custom behavior overrides', async () => {
      const admin = await User.create({
        username: 'admin2',
        email: 'admin2@example.com',
        password: 'password123',
        role: 'admin',
      });

      const bot = await createBot({
        username: 'testbot2',
        email: 'bot2@example.com',
        password: 'password123',
        botType: 'casual',
        behavior: { riskLevel: 99 }, // Override
      }, admin._id);

      assert.equal(bot.behavior.riskLevel, 99); // Custom value
      assert.equal(bot.behavior.betIntervalMin, 30000); // Preset value
    });

    it('should throw error for duplicate username', async () => {
      const admin = await User.create({
        username: 'admin3',
        email: 'admin3@example.com',
        password: 'password123',
        role: 'admin',
      });

      await createBot({
        username: 'dupebot',
        email: 'dupe1@example.com',
        password: 'password123',
      }, admin._id);

      try {
        await createBot({
          username: 'dupebot',
          email: 'dupe2@example.com',
          password: 'password123',
        }, admin._id);
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('already exists'));
      }
    });
  });

  describe('getAllBots', () => {
    it('should return paginated bots', async () => {
      const admin = await User.create({
        username: 'admin4',
        email: 'admin4@example.com',
        password: 'password123',
        role: 'admin',
      });

      for (let i = 1; i <= 5; i++) {
        await createBot({
          username: `bot${i}`,
          email: `bot${i}@example.com`,
          password: 'password123',
          botType: i % 2 === 0 ? 'aggressive' : 'casual',
        }, admin._id);
      }

      const result = await getAllBots({ page: 1, limit: 2 });
      assert.equal(result.bots.length, 2);
      assert.equal(result.total, 5);
      assert.equal(result.pages, 3);
    });

    it('should filter by status', async () => {
      const admin = await User.create({
        username: 'admin5',
        email: 'admin5@example.com',
        password: 'password123',
        role: 'admin',
      });

      const bot1 = await createBot({ username: 'activebot', email: 'active@example.com', password: 'pass', isActive: true }, admin._id);
      const bot2 = await createBot({ username: 'inactivebot', email: 'inactive@example.com', password: 'pass', isActive: false }, admin._id);

      // Need to update second bot to inactive
      await Bot.findByIdAndUpdate(bot2._id, { isActive: false });

      const activeBots = await getAllBots({ status: 'active' });
      assert.equal(activeBots.total, 1);
      assert.equal(activeBots.bots[0].username, 'activebot');

      const inactiveBots = await getAllBots({ status: 'inactive' });
      assert.equal(inactiveBots.total, 1);
    });

    it('should filter by botType', async () => {
      const admin = await User.create({
        username: 'admin6',
        email: 'admin6@example.com',
        password: 'password123',
        role: 'admin',
      });

      await createBot({ username: 'botc1', email: 'c1@example.com', password: 'pass', botType: 'casual' }, admin._id);
      await createBot({ username: 'bota1', email: 'a1@example.com', password: 'pass', botType: 'aggressive' }, admin._id);

      const casualBots = await getAllBots({ botType: 'casual' });
      assert.equal(casualBots.total, 1);
      assert.equal(casualBots.bots[0].botType, 'casual');
    });
  });

  describe('updateBot', () => {
    it('should update bot settings', async () => {
      const admin = await User.create({
        username: 'admin7',
        email: 'admin7@example.com',
        password: 'password123',
        role: 'admin',
      });

      const bot = await createBot({ username: 'updateme', email: 'update@example.com', password: 'pass' }, admin._id);
      
      const updated = await updateBot(bot._id, { notes: 'Updated note', behavior: { riskLevel: 50 } });
      
      assert.equal(updated.notes, 'Updated note');
      assert.equal(updated.behavior.riskLevel, 50);
    });

    it('should apply preset when botType changed', async () => {
      const admin = await User.create({
        username: 'admin8',
        email: 'admin8@example.com',
        password: 'password123',
        role: 'admin',
      });

      const bot = await createBot({ username: 'typechange', email: 'tc@example.com', password: 'pass', botType: 'casual' }, admin._id);
      
      const updated = await updateBot(bot._id, { botType: 'aggressive' });
      
      assert.equal(updated.botType, 'aggressive');
      assert.equal(updated.behavior.riskLevel, 80);
    });
  });

  describe('getBotById / getBotStats', () => {
    it('should return bot by ID', async () => {
      const admin = await User.create({
        username: 'admin9',
        email: 'admin9@example.com',
        password: 'password123',
        role: 'admin',
      });

      const bot = await createBot({ username: 'statbot', email: 'stat@example.com', password: 'pass', botType: 'high_roller' }, admin._id);
      
      const found = await getBotById(bot._id);
      assert.ok(found);
      assert.equal(found.username, 'statbot');
      assert.equal(found.botType, 'high_roller');
    });

    it('should return stats', async () => {
      const admin = await User.create({
        username: 'admin10',
        email: 'admin10@example.com',
        password: 'password123',
        role: 'admin',
      });

      const bot = await createBot({ username: 'statbot2', email: 'stat2@example.com', password: 'pass' }, admin._id);
      
      const stats = await getBotStats(bot._id);
      assert.ok(stats);
      assert.equal(stats.botId.toString(), bot._id.toString());
      assert.ok(typeof stats.totalBets === 'number');
    });
  });

  describe('getActiveBots / getBotPresets', () => {
    it('should return active bots', async () => {
      const admin = await User.create({
        username: 'admin11',
        email: 'admin11@example.com',
        password: 'password123',
        role: 'admin',
      });

      await createBot({ username: 'active1', email: 'act1@example.com', password: 'pass', isActive: true }, admin._id);
      const bot2 = await createBot({ username: 'inactive1', email: 'inact1@example.com', password: 'pass', isActive: true }, admin._id);
      await Bot.findByIdAndUpdate(bot2._id, { isActive: false });

      const active = await getActiveBots();
      assert.equal(active.length, 1);
      assert.equal(active[0].username, 'active1');
    });

    it('should return presets', () => {
      const presets = getBotPresets();
      assert.ok(presets.casual);
      assert.ok(presets.aggressive);
      assert.ok(presets.high_roller);
    });
  });

  describe('deleteBot', () => {
    it('should delete bot', async () => {
      const admin = await User.create({
        username: 'admin12',
        email: 'admin12@example.com',
        password: 'password123',
        role: 'admin',
      });

      const bot = await createBot({ username: 'deletebot', email: 'delete@example.com', password: 'pass' }, admin._id);
      await deleteBot(bot._id);

      const found = await Bot.findById(bot._id);
      assert.equal(found, null);
    });
  });
});