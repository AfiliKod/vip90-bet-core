import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import GameSettings from '../src/models/GameSettings.js';
import { initDefaultGameSettings, getGameSettings, getAllGameSettings, updateGameSettings, getCrashSettings, getRouletteSettings } from '../src/services/gameSettings.js';

describe('Game Settings', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_gamesettings');
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await GameSettings.deleteMany({});
  });

  describe('initDefaultGameSettings', () => {
    it('should create default settings for Crash and Roulette', async () => {
      await initDefaultGameSettings();
      
      const count = await GameSettings.countDocuments();
      assert.equal(count, 2);
      
      const crash = await GameSettings.findOne({ gameId: 'inhouse-crash' });
      assert.ok(crash);
      assert.equal(crash.gameTitle, 'Crash');
      assert.equal(crash.crashHouseEdgePercent, 20);
      assert.equal(crash.crashMinBet, 1);
      assert.equal(crash.crashMaxBet, 50000);
      
      const roulette = await GameSettings.findOne({ gameId: 'inhouse-roulette' });
      assert.ok(roulette);
      assert.equal(roulette.gameTitle, 'European Roulette');
      assert.equal(roulette.rouletteHouseEdgePercent, 2.7);
      assert.equal(roulette.rouletteMinBet, 1);
      assert.equal(roulette.rouletteMaxBet, 50000);
    });

    it('should not create duplicates on second call', async () => {
      await initDefaultGameSettings();
      const count1 = await GameSettings.countDocuments();
      await initDefaultGameSettings();
      const count2 = await GameSettings.countDocuments();
      assert.equal(count1, count2);
    });
  });

  describe('getGameSettings', () => {
    it('should return game settings by gameId', async () => {
      await initDefaultGameSettings();
      
      const crash = await getGameSettings('inhouse-crash');
      assert.ok(crash);
      assert.equal(crash.gameId, 'inhouse-crash');
      
      const roulette = await getGameSettings('inhouse-roulette');
      assert.ok(roulette);
      assert.equal(roulette.gameId, 'inhouse-roulette');
    });

    it('should return null for non-existent game', async () => {
      const settings = await getGameSettings('non-existent');
      assert.equal(settings, null);
    });
  });

  describe('getAllGameSettings', () => {
    it('should return all game settings sorted by gameId', async () => {
      await initDefaultGameSettings();
      
      const settings = await getAllGameSettings();
      assert.equal(settings.length, 2);
      assert.equal(settings[0].gameId, 'inhouse-crash');
      assert.equal(settings[1].gameId, 'inhouse-roulette');
    });
  });

  describe('getCrashSettings', () => {
    it('should return crash settings', async () => {
      await initDefaultGameSettings();
      
      const crash = await getCrashSettings();
      assert.ok(crash);
      assert.equal(crash.gameId, 'inhouse-crash');
    });
  });

  describe('getRouletteSettings', () => {
    it('should return roulette settings', async () => {
      await initDefaultGameSettings();
      
      const roulette = await getRouletteSettings();
      assert.ok(roulette);
      assert.equal(roulette.gameId, 'inhouse-roulette');
    });
  });

  describe('updateGameSettings', () => {
    it('should update crash settings with change log', async () => {
      await initDefaultGameSettings();
      
      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });
      
      const result = await updateGameSettings('inhouse-crash', {
        crashHouseEdgePercent: 15,
        crashMinBet: 2,
        crashMaxBet: 25000,
      }, admin._id, { reason: 'House edge reduced for promotion' });
      
      assert.ok(result.settings);
      assert.equal(result.settings.crashHouseEdgePercent, 15);
      assert.equal(result.settings.crashMinBet, 2);
      assert.equal(result.settings.crashMaxBet, 25000);
      assert.equal(result.settings.updatedBy.toString(), admin._id.toString());
      assert.equal(result.changes.length, 3);
      assert.equal(result.changes[0].field, 'crashHouseEdgePercent');
      assert.equal(result.changes[0].oldValue, 20);
      assert.equal(result.changes[0].newValue, 15);
      assert.equal(result.changes[0].reason, 'House edge reduced for promotion');
    });

    it('should update roulette settings with change log', async () => {
      await initDefaultGameSettings();
      
      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });
      
      const result = await updateGameSettings('inhouse-roulette', {
        rouletteHouseEdgePercent: 3.5,
        rouletteMinBet: 2,
        rouletteMaxBet: 25000,
        rouletteMaxPayout: 35,
      }, admin._id, { reason: 'Adjusted for high rollers' });
      
      assert.equal(result.settings.rouletteHouseEdgePercent, 3.5);
      assert.equal(result.settings.rouletteMinBet, 2);
      assert.equal(result.settings.rouletteMaxBet, 25000);
      assert.equal(result.settings.rouletteMaxPayout, 35);
      assert.equal(result.changes.length, 4);
    });

    it('should validate crash house edge range', async () => {
      await initDefaultGameSettings();
      
      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });
      
      try {
        await updateGameSettings('inhouse-crash', { crashHouseEdgePercent: 60 }, admin._id);
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('0-50'));
      }
    });

    it('should validate roulette house edge range', async () => {
      await initDefaultGameSettings();
      
      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });
      
      try {
        await updateGameSettings('inhouse-roulette', { rouletteHouseEdgePercent: 15 }, admin._id);
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('0-10'));
      }
    });

    it('should validate min bet positive', async () => {
      await initDefaultGameSettings();
      
      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });
      
      try {
        await updateGameSettings('inhouse-crash', { crashMinBet: 0 }, admin._id);
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('pozitif'));
      }
    });

    it('should validate max bet > min bet', async () => {
      await initDefaultGameSettings();
      
      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });
      
      try {
        await updateGameSettings('inhouse-crash', { crashMaxBet: 0.5, crashMinBet: 1 }, admin._id);
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('büyük'));
      }
    });

    it('should throw error for non-existent game', async () => {
      await initDefaultGameSettings();
      
      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });
      
      try {
        await updateGameSettings('non-existent', { crashHouseEdgePercent: 10 }, admin._id);
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('bulunamadı'));
      }
    });

    it('should throw error for no valid fields', async () => {
      await initDefaultGameSettings();
      
      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });
      
      try {
        await updateGameSettings('inhouse-crash', { invalidField: 'test' }, admin._id);
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('geçerli alan yok'));
      }
    });

    it('should accumulate change log over multiple updates', async () => {
      await initDefaultGameSettings();
      
      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });
      
      await updateGameSettings('inhouse-crash', { crashHouseEdgePercent: 15 }, admin._id, { reason: 'First change' });
      await updateGameSettings('inhouse-crash', { crashMinBet: 2 }, admin._id, { reason: 'Second change' });
      
      const settings = await GameSettings.findOne({ gameId: 'inhouse-crash' });
      assert.equal(settings.changeLog.length, 2);
      assert.equal(settings.changeLog[0].field, 'crashHouseEdgePercent');
      assert.equal(settings.changeLog[1].field, 'crashMinBet');
    });
  });
});