import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import VipLevel from '../src/models/VipLevel.js';
import Transaction from '../src/models/Transaction.js';
import { awardXp, getVipStatus, initDefaultVipLevels, getAllVipLevels, upsertVipLevel, deleteVipLevel, XP_RATES } from '../src/services/vip.js';

describe('VIP Service', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test');
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await VipLevel.deleteMany({});
    await Transaction.deleteMany({});
  });

  describe('initDefaultVipLevels', () => {
    it('should create default VIP levels when none exist', async () => {
      // Clear any existing levels first
      await VipLevel.deleteMany({});
      const levels = await initDefaultVipLevels();
      assert.equal(levels.length, 5);
      
      const count = await VipLevel.countDocuments();
      assert.equal(count, 5);
    });

    it('should not create levels if they already exist', async () => {
      // First create the levels
      await initDefaultVipLevels();
      
      // Then try to create again - should return early
      const levels = await initDefaultVipLevels();
      assert.equal(levels, undefined); // returns early
      
      const count = await VipLevel.countDocuments();
      assert.equal(count, 5);
    });
  });

  describe('awardXp', () => {
    beforeEach(async () => {
      await initDefaultVipLevels();
    });

    it('should award XP for sports bets (1 XP per 10 wagered)', async () => {
      const user = await User.create({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      });

      const result = await awardXp(user._id, 100, 'sports');
      
      assert.equal(result.xpAwarded, 10); // 100 * 0.1 = 10
      assert.equal(result.leveledUp, false);
      assert.equal(result.vipXp, 10);
    });

    it('should award XP for casino bets (1 XP per 20 wagered)', async () => {
      const user = await User.create({
        username: 'testuser2',
        email: 'test2@example.com',
        password: 'password123',
      });

      const result = await awardXp(user._id, 100, 'casino');
      
      assert.equal(result.xpAwarded, 5); // 100 * 0.05 = 5
      assert.equal(result.leveledUp, false);
      assert.equal(result.vipXp, 5);
    });

    it('should not award XP for amounts below minimum', async () => {
      const user = await User.create({
        username: 'testuser3',
        email: 'test3@example.com',
        password: 'password123',
      });

      // 5 currency units * 0.1 = 0.5 XP -> floor = 0
      const result = await awardXp(user._id, 5, 'sports');
      
      assert.equal(result.xpAwarded, 0);
      assert.equal(result.leveledUp, false);
    });

    it('should level up user when XP threshold reached', async () => {
      const user = await User.create({
        username: 'testuser4',
        email: 'test4@example.com',
        password: 'password123',
      });

      // Give enough XP to reach Silver (1000 XP)
      const result = await awardXp(user._id, 10000, 'sports'); // 10000 * 0.1 = 1000 XP
      
      assert.equal(result.xpAwarded, 1000);
      assert.equal(result.leveledUp, true);
      assert.equal(result.newLevel.level, 2);
      assert.equal(result.newLevel.name, 'Silver');
      assert.equal(result.vipLevel.toString(), result.newLevel._id.toString());
    });

    it('should give level reward when leveling up', async () => {
      const user = await User.create({
        username: 'testuser5',
        email: 'test5@example.com',
        password: 'password123',
      });

      // Level up to Silver (10 reward)
      const result = await awardXp(user._id, 10000, 'sports');
      
      assert.ok(result.reward);
      assert.equal(result.reward.amount, 10);
      assert.equal(result.reward.type, 'balance');
      assert.equal(result.reward.levelName, 'Silver');
      
      // Check balance was updated
      const updatedUser = await User.findById(user._id);
      assert.equal(updatedUser.balance, 10);
      
      // Check transaction was created
      const tx = await Transaction.findOne({ userId: user._id, type: 'bonus' });
      assert.ok(tx);
      assert.equal(tx.amount, 10);
      assert.equal(tx.note, 'VIP seviye ödülü: Silver');
    });

    it('should not level down if user loses XP (not possible in current design)', async () => {
      const user = await User.create({
        username: 'testuser6',
        email: 'test6@example.com',
        password: 'password123',
      });

      // First reach Gold
      await awardXp(user._id, 50000, 'sports'); // 5000 XP -> Gold
      const userAfterGold = await User.findById(user._id).populate('vipLevel');
      assert.equal(userAfterGold.vipLevel.level, 3);

      // Award more XP, should stay at Gold or go higher
      const result = await awardXp(user._id, 10000, 'sports'); // 1000 more XP
      assert.ok(result.leveledUp === false || result.newLevel.level >= 3);
    });

    it('should accumulate totalXpEarned for leaderboards', async () => {
      const user = await User.create({
        username: 'testuser7',
        email: 'test7@example.com',
        password: 'password123',
      });

      await awardXp(user._id, 1000, 'sports'); // 100 XP
      await awardXp(user._id, 2000, 'sports'); // 200 XP
      
      const updatedUser = await User.findById(user._id);
      assert.equal(updatedUser.totalXpEarned, 300);
      assert.equal(updatedUser.vipXp, 300);
    });

    it('should return 0 XP for invalid bet type', async () => {
      const user = await User.create({
        username: 'testuser8',
        email: 'test8@example.com',
        password: 'password123',
      });

      const result = await awardXp(user._id, 1000, 'invalid');
      assert.equal(result.xpAwarded, 0);
    });
  });

  describe('getVipStatus', () => {
    beforeEach(async () => {
      await initDefaultVipLevels();
    });

    it('should return current VIP status with progress', async () => {
      const user = await User.create({
        username: 'testuser9',
        email: 'test9@example.com',
        password: 'password123',
      });

      const status = await getVipStatus(user._id);
      
      assert.ok(status);
      assert.equal(status.vipXp, 0);
      assert.equal(status.totalXpEarned, 0);
      // New users are auto-assigned to Bronze (level 1) since xpRequired: 0
      assert.ok(status.currentLevel);
      assert.equal(status.currentLevel.level, 1);
      assert.equal(status.currentLevel.name, 'Bronze');
      assert.ok(status.nextLevel);
      assert.equal(status.nextLevel.level, 2);
      assert.equal(status.progressPercent, 0);
    });

    it('should show progress towards next level', async () => {
      const user = await User.create({
        username: 'testuser10',
        email: 'test10@example.com',
        password: 'password123',
      });

      // Give 500 XP (halfway to Silver at 1000)
      await awardXp(user._id, 5000, 'sports'); // 500 XP
      
      const status = await getVipStatus(user._id);
      
      assert.equal(status.vipXp, 500);
      assert.equal(status.currentLevel.level, 1); // Bronze
      assert.equal(status.nextLevel.level, 2); // Silver
      assert.equal(status.progressPercent, 50); // 500/1000 = 50%
    });

    it('should show 100% at max level', async () => {
      const user = await User.create({
        username: 'testuser11',
        email: 'test11@example.com',
        password: 'password123',
      });

      // Give enough for Diamond (50000 XP)
      await awardXp(user._id, 500000, 'sports'); // 50000 XP
      
      const status = await getVipStatus(user._id);
      
      assert.equal(status.currentLevel.level, 5); // Diamond
      assert.equal(status.nextLevel, null); // No next level
      assert.equal(status.progressPercent, 100);
    });
  });

  describe('getAllVipLevels', () => {
    it('should return all active VIP levels sorted by level', async () => {
      await initDefaultVipLevels();
      
      const levels = await getAllVipLevels();
      assert.equal(levels.length, 5);
      assert.equal(levels[0].level, 1);
      assert.equal(levels[4].level, 5);
    });
  });

  describe('upsertVipLevel', () => {
    it('should create new VIP level', async () => {
      const level = await upsertVipLevel({
        level: 6,
        name: 'Ruby',
        xpRequired: 100000,
        cashbackPercent: 15,
        rewardAmount: 1000,
      });
      
      assert.equal(level.level, 6);
      assert.equal(level.name, 'Ruby');
      assert.equal(level.xpRequired, 100000);
    });

    it('should update existing VIP level', async () => {
      await upsertVipLevel({ level: 1, name: 'Bronze', xpRequired: 0 });
      
      const level = await upsertVipLevel({
        level: 1,
        name: 'Bronze Updated',
        xpRequired: 0,
        cashbackPercent: 1,
      });
      
      assert.equal(level.name, 'Bronze Updated');
      assert.equal(level.cashbackPercent, 1);
    });
  });

  describe('deleteVipLevel', () => {
    beforeEach(async () => {
      await initDefaultVipLevels();
    });

    it('should delete VIP level with no assigned users', async () => {
      // Delete Diamond (level 5) - no users assigned yet
      const result = await deleteVipLevel(5);
      assert.ok(result);
      
      const count = await VipLevel.countDocuments();
      assert.equal(count, 4);
    });

    it('should throw error if users are assigned to level', async () => {
      const user = await User.create({
        username: 'testuser12',
        email: 'test12@example.com',
        password: 'password123',
      });

      // Assign user to Silver level
      const silver = await VipLevel.findOne({ level: 2 });
      user.vipLevel = silver._id;
      await user.save();

      try {
        await deleteVipLevel(2);
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('Cannot delete level 2'));
      }
    });
  });
});