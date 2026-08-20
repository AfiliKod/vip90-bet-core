import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import VipLevel from '../src/models/VipLevel.js';

describe('VipLevel Model', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test');
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await VipLevel.deleteMany({});
  });

  it('should create a VipLevel with required fields', async () => {
    const vipLevel = await VipLevel.create({
      level: 1,
      name: 'Bronze',
      xpRequired: 0,
    });

    assert.equal(vipLevel.level, 1);
    assert.equal(vipLevel.name, 'Bronze');
    assert.equal(vipLevel.xpRequired, 0);
    assert.equal(vipLevel.cashbackPercent, 0);
    assert.equal(vipLevel.rewardAmount, 0);
    assert.equal(vipLevel.rewardType, 'balance');
    assert.deepEqual(vipLevel.benefits, []);
    assert.equal(vipLevel.color, '#6b7280');
    assert.equal(vipLevel.icon, '★');
    assert.equal(vipLevel.isActive, true);
  });

  it('should enforce unique level', async () => {
    await VipLevel.create({ level: 1, name: 'Bronze', xpRequired: 0 });
    
    try {
      await VipLevel.create({ level: 1, name: 'Silver', xpRequired: 1000 });
      assert.fail('Should have thrown duplicate key error');
    } catch (err) {
      assert.ok(err.code === 11000 || err.message.includes('duplicate'));
    }
  });

  it('should enforce unique xpRequired is not required but level is', async () => {
    // Multiple levels can have same xpRequired (edge case), but level must be unique
    await VipLevel.create({ level: 1, name: 'Bronze', xpRequired: 0 });
    await VipLevel.create({ level: 2, name: 'Silver', xpRequired: 0 }); // same xp, different level
    
    const count = await VipLevel.countDocuments({ xpRequired: 0 });
    assert.equal(count, 2);
  });

  it('should validate min/max for cashbackPercent', async () => {
    // Valid: 0-100
    await VipLevel.create({ level: 1, name: 'Bronze', xpRequired: 0, cashbackPercent: 50 });
    
    // Invalid: > 100
    try {
      await VipLevel.create({ level: 2, name: 'Silver', xpRequired: 1000, cashbackPercent: 101 });
      assert.fail('Should have thrown validation error');
    } catch (err) {
      assert.ok(err.name === 'ValidationError');
    }
  });

  it('should validate rewardType enum', async () => {
    await VipLevel.create({ level: 1, name: 'Bronze', xpRequired: 0, rewardType: 'balance' });
    await VipLevel.create({ level: 2, name: 'Silver', xpRequired: 1000, rewardType: 'bonus' });
    
    try {
      await VipLevel.create({ level: 3, name: 'Gold', xpRequired: 5000, rewardType: 'invalid' });
      assert.fail('Should have thrown validation error');
    } catch (err) {
      assert.ok(err.name === 'ValidationError');
    }
  });

  it('should find level by XP', async () => {
    await VipLevel.create({ level: 1, name: 'Bronze', xpRequired: 0 });
    await VipLevel.create({ level: 2, name: 'Silver', xpRequired: 1000 });
    await VipLevel.create({ level: 3, name: 'Gold', xpRequired: 5000 });
    await VipLevel.create({ level: 4, name: 'Platinum', xpRequired: 20000 });
    await VipLevel.create({ level: 5, name: 'Diamond', xpRequired: 50000 });

    // XP 500 should be Bronze (level 1)
    const bronze = await VipLevel.findOne({ xpRequired: { $lte: 500 } }).sort({ xpRequired: -1 });
    assert.equal(bronze.level, 1);

    // XP 1500 should be Silver (level 2)
    const silver = await VipLevel.findOne({ xpRequired: { $lte: 1500 } }).sort({ xpRequired: -1 });
    assert.equal(silver.level, 2);

    // XP 50000 should be Diamond (level 5)
    const diamond = await VipLevel.findOne({ xpRequired: { $lte: 50000 } }).sort({ xpRequired: -1 });
    assert.equal(diamond.level, 5);
  });

  it('should return null for XP below minimum', async () => {
    await VipLevel.create({ level: 1, name: 'Bronze', xpRequired: 0 });
    
    const result = await VipLevel.findOne({ xpRequired: { $lte: -1 } }).sort({ xpRequired: -1 });
    assert.equal(result, null);
  });

  it('should allow inactive levels', async () => {
    await VipLevel.create({ level: 1, name: 'Bronze', xpRequired: 0, isActive: true });
    await VipLevel.create({ level: 2, name: 'Silver', xpRequired: 1000, isActive: false });
    
    const active = await VipLevel.find({ isActive: true });
    assert.equal(active.length, 1);
    assert.equal(active[0].level, 1);
  });
});