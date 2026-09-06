import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import GameSettings from '../src/models/GameSettings.js';
import { initDefaultGameSettings, getGameSettings, getAllGameSettings, updateGameSettings, getCrashSettingsForOperator, getRouletteSettingsForOperator } from '../src/services/gameSettings.js';

describe('Game Settings', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_gamesettings');
    // Eski test DB'lerinde partial-olmayan `gameId_1` unique index kalıntısı
    // olabilir (schema artık operatorId + iki partial unique index
    // tanımlıyor, bkz. models/GameSettings.js) — production'daki
    // scripts/migrations/add-operator-to-game-settings.mjs'nin test
    // ortamındaki eşdeğeri.
    await GameSettings.syncIndexes();
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
      assert.equal(count, 13);

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

    it('should create default settings for the 5 newly wired games', async () => {
      await initDefaultGameSettings();

      const mines = await GameSettings.findOne({ gameId: 'inhouse-mines' });
      assert.ok(mines);
      assert.equal(mines.gameTitle, 'Mines');
      assert.equal(mines.minesPayoutFactor, 0.78);
      assert.equal(mines.minesMinBet, 1);
      assert.equal(mines.minesMaxBet, 50000);

      const dice = await GameSettings.findOne({ gameId: 'inhouse-dice' });
      assert.ok(dice);
      assert.equal(dice.gameTitle, 'Dice');
      assert.equal(dice.dicePayoutFactor, 78);

      const limbo = await GameSettings.findOne({ gameId: 'inhouse-limbo' });
      assert.ok(limbo);
      assert.equal(limbo.gameTitle, 'Limbo');
      assert.equal(limbo.limboHouseEdgePercent, 20);

      const hilo = await GameSettings.findOne({ gameId: 'inhouse-hilo' });
      assert.ok(hilo);
      assert.equal(hilo.gameTitle, 'Hi-Lo');
      assert.equal(hilo.hiloPayoutFactor, 0.78);

      const dragonTiger = await GameSettings.findOne({ gameId: 'inhouse-dragontiger' });
      assert.ok(dragonTiger);
      assert.equal(dragonTiger.gameTitle, 'Dragon Tiger');
      assert.equal(dragonTiger.dragonTigerWinMultiplier, 1.6);
      assert.equal(dragonTiger.dragonTigerTieMultiplier, 13);
      assert.equal(dragonTiger.dragonTigerTiePushMultiplier, 0.5);
    });

    it('should create default settings for the 6 Faz-2 games', async () => {
      await initDefaultGameSettings();

      const plinko = await GameSettings.findOne({ gameId: 'inhouse-plinko' });
      assert.ok(plinko);
      assert.equal(plinko.plinkoPayoutScale, 1.0);

      const wheel = await GameSettings.findOne({ gameId: 'inhouse-wheel' });
      assert.ok(wheel);
      assert.equal(wheel.wheelPayoutScale, 1.0);

      const keno = await GameSettings.findOne({ gameId: 'inhouse-keno' });
      assert.ok(keno);
      assert.equal(keno.kenoPayoutScale, 1.0);

      const baccarat = await GameSettings.findOne({ gameId: 'inhouse-baccarat' });
      assert.ok(baccarat);
      assert.equal(baccarat.baccaratBankerMultiplier, 1.7);
      assert.equal(baccarat.baccaratPlayerMultiplier, 1.75);
      assert.equal(baccarat.baccaratTieMultiplier, 8);

      const blackjack = await GameSettings.findOne({ gameId: 'inhouse-blackjack' });
      assert.ok(blackjack);
      assert.equal(blackjack.blackjackPayoutMult, 2.0);
      assert.equal(blackjack.blackjackWinMult, 1.4);
      assert.equal(blackjack.dealerHitsSoft17, true);

      const vp = await GameSettings.findOne({ gameId: 'inhouse-videopoker' });
      assert.ok(vp);
      assert.equal(vp.vpJacksOrBetterMult, 0.8);
      assert.equal(vp.vpRoyalFlushMult, 656);
    });

    it('should not create duplicates on second call', async () => {
      await initDefaultGameSettings();
      const count1 = await GameSettings.countDocuments();
      await initDefaultGameSettings();
      const count2 = await GameSettings.countDocuments();
      assert.equal(count1, count2);
    });

    // Regresyon: crashGame.js ve rouletteGame.js her ikisi de sunucu
    // açılışında ilk turda bu fonksiyonu tetikleyebilir — eşzamanlı
    // çağrılar find+create yarışında tekilliği bozup gameId başına iki
    // kayıt oluşturabiliyordu (unique index sessizce etkisizdi, çünkü
    // şemada aynı alan için hem `unique: true` hem ayrı bir
    // `schema.index()` tanımlıydı — Mongoose ikisini çakışan indeks
    // olarak görüp index'i düzgün kurmuyordu).
    it('should not create duplicates when called concurrently', async () => {
      await Promise.all([
        initDefaultGameSettings(),
        initDefaultGameSettings(),
        initDefaultGameSettings(),
      ]);
      const crashCount = await GameSettings.countDocuments({ gameId: 'inhouse-crash' });
      const rouletteCount = await GameSettings.countDocuments({ gameId: 'inhouse-roulette' });
      assert.equal(crashCount, 1);
      assert.equal(rouletteCount, 1);
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
      assert.equal(settings.length, 13);
      assert.deepEqual(settings.map(s => s.gameId), [
        'inhouse-baccarat', 'inhouse-blackjack', 'inhouse-crash', 'inhouse-dice',
        'inhouse-dragontiger', 'inhouse-hilo', 'inhouse-keno', 'inhouse-limbo',
        'inhouse-mines', 'inhouse-plinko', 'inhouse-roulette', 'inhouse-videopoker',
        'inhouse-wheel',
      ]);
    });
  });

  describe('getCrashSettingsForOperator', () => {
    it('should lazy-seed and return operator-scoped crash settings', async () => {
      const mongoose = (await import('mongoose')).default;
      const operatorId = new mongoose.Types.ObjectId();

      const crash = await getCrashSettingsForOperator(operatorId);
      assert.ok(crash);
      assert.equal(crash.gameId, 'inhouse-crash');
      assert.equal(String(crash.operatorId), String(operatorId));
    });

    it('should isolate settings between two operators', async () => {
      const mongoose = (await import('mongoose')).default;
      const opA = new mongoose.Types.ObjectId();
      const opB = new mongoose.Types.ObjectId();

      const crashA = await getCrashSettingsForOperator(opA);
      crashA.crashHouseEdgePercent = 4;
      await crashA.save();

      const crashB = await getCrashSettingsForOperator(opB);
      assert.equal(crashB.crashHouseEdgePercent, 20); // varsayılan, opA'nın değişikliğinden etkilenmemeli
    });
  });

  describe('getRouletteSettingsForOperator', () => {
    it('should lazy-seed and return operator-scoped roulette settings', async () => {
      const mongoose = (await import('mongoose')).default;
      const operatorId = new mongoose.Types.ObjectId();

      const roulette = await getRouletteSettingsForOperator(operatorId);
      assert.ok(roulette);
      assert.equal(roulette.gameId, 'inhouse-roulette');
      assert.equal(String(roulette.operatorId), String(operatorId));
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

    it('should update mines settings with change log', async () => {
      await initDefaultGameSettings();

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      const result = await updateGameSettings('inhouse-mines', {
        minesPayoutFactor: 0.9,
        minesMinBet: 5,
        minesMaxBet: 10000,
      }, admin._id, { reason: 'RTP artışı' });

      assert.equal(result.settings.minesPayoutFactor, 0.9);
      assert.equal(result.settings.minesMinBet, 5);
      assert.equal(result.settings.minesMaxBet, 10000);
      assert.equal(result.changes.length, 3);
    });

    it('should update baccarat multipliers with change log', async () => {
      await initDefaultGameSettings();

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      const result = await updateGameSettings('inhouse-baccarat', {
        baccaratBankerMultiplier: 1.95,
        baccaratPlayerMultiplier: 2.0,
        baccaratTieMultiplier: 9,
      }, admin._id, { reason: 'Standart bakara oranlarına yaklaştırma' });

      assert.equal(result.settings.baccaratBankerMultiplier, 1.95);
      assert.equal(result.settings.baccaratPlayerMultiplier, 2.0);
      assert.equal(result.settings.baccaratTieMultiplier, 9);
      assert.equal(result.changes.length, 3);
    });

    it('should toggle blackjack dealerHitsSoft17 and payout multipliers', async () => {
      await initDefaultGameSettings();

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      const result = await updateGameSettings('inhouse-blackjack', {
        dealerHitsSoft17: false,
        blackjackPayoutMult: 2.5,
        blackjackWinMult: 2.0,
      }, admin._id, { reason: 'Standart 3:2 + S17 kuralına dönüş' });

      assert.equal(result.settings.dealerHitsSoft17, false);
      assert.equal(result.settings.blackjackPayoutMult, 2.5);
      assert.equal(result.settings.blackjackWinMult, 2.0);
      assert.equal(result.changes.length, 3);
    });

    it('should reject plinko max bet below min bet', async () => {
      await initDefaultGameSettings();

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      try {
        await updateGameSettings('inhouse-plinko', {
          plinkoMinBet: 100,
          plinkoMaxBet: 10,
        }, admin._id);
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('Max bet min betten büyük olmalı'));
      }
    });

    it('should reject dragon tiger max bet below min bet', async () => {
      await initDefaultGameSettings();

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      try {
        await updateGameSettings('inhouse-dragontiger', {
          dragonTigerMinBet: 100,
          dragonTigerMaxBet: 10,
        }, admin._id);
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('Max bet min betten büyük olmalı'));
      }
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