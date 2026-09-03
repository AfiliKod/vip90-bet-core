import { it, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Setting from '../src/models/Setting.js';
import Event from '../src/models/Event.js';
import { getRecentWinners } from '../src/services/liveGameStream.js';
import { setModuleEnabled, invalidateModules } from '../src/modules/index.js';
import {
  DEFAULT_CONFIG, loadConfig, saveConfig, getConfig, getPoolSize,
  regeneratePool, fireFakeWin, releaseBettingWinsForEvent,
} from '../src/services/fakeWinners.js';

const DB_URI = process.env.MONGODB_URI_FAKE_WINNERS_TEST || 'mongodb://localhost:27017/betzone_test_fake_winners';

before(async () => {
  await mongoose.connect(DB_URI);
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

beforeEach(async () => {
  await Setting.deleteMany({});
  await loadConfig(); // DB'de override yok → DEFAULT_CONFIG'e döner
});

describe('loadConfig / saveConfig', () => {
  it('DB\'de override yoksa DEFAULT_CONFIG döner', async () => {
    const cfg = await loadConfig();
    assert.deepEqual(cfg, DEFAULT_CONFIG);
  });

  it('saveConfig kısmi güncellemeyi DB\'ye yazar ve mevcut değerleri korur', async () => {
    const cfg = await saveConfig({ poolMin: 10, poolMax: 20 });
    assert.equal(cfg.poolMin, 10);
    assert.equal(cfg.poolMax, 20);
    assert.equal(cfg.amountMin, DEFAULT_CONFIG.amountMin); // dokunulmayan alan korunur

    // Kalıcılık: yeniden yüklendiğinde de aynı değer gelir
    const reloaded = await loadConfig();
    assert.equal(reloaded.poolMin, 10);
  });

  it('saveConfig sonrası getConfig() güncel değeri döner', async () => {
    await saveConfig({ enabled: false });
    assert.equal(getConfig().enabled, false);
  });
});

describe('regeneratePool', () => {
  it('havuz büyüklüğü poolMin–poolMax aralığında', async () => {
    await saveConfig({ poolMin: 5, poolMax: 15 });
    regeneratePool();
    const size = getPoolSize();
    assert.ok(size >= 5 && size <= 15, `beklenen 5-15 arası, gelen: ${size}`);
  });

  it('poolMin === poolMax ise havuz tam o büyüklükte', async () => {
    await saveConfig({ poolMin: 7, poolMax: 7 });
    regeneratePool();
    assert.equal(getPoolSize(), 7);
  });
});

describe('fireFakeWin', () => {
  it('enabled:false iken kazanan eklemez', async () => {
    await saveConfig({ enabled: false, poolMin: 3, poolMax: 3 });
    regeneratePool();
    const before = getRecentWinners(50).length;
    await fireFakeWin();
    assert.equal(getRecentWinners(50).length, before);
  });

  it('enabled:true iken gerçek addRecentWinner mekanizmasıyla bir kazanan ekler', async () => {
    await saveConfig({ enabled: true, poolMin: 3, poolMax: 3, amountMin: 100, amountMax: 200 });
    regeneratePool();
    const beforeCount = getRecentWinners(50).length;
    await fireFakeWin();
    const winners = getRecentWinners(50);
    assert.equal(winners.length, beforeCount + 1);

    const w = winners[0]; // en yeni en başta (unshift)
    assert.ok(w.username.length > 0);
    assert.ok(w.gameId.startsWith('inhouse-'));
    assert.ok(w.amount >= 100 && w.amount <= 200, `beklenen 100-200 arası, gelen: ${w.amount}`);
    assert.equal(w.currency, 'TRY');
    // Kozmetik kazanan gerçek bir User'a bağlı değil — userId sentetik
    assert.ok(String(w.userId).startsWith('fake-'));
  });

  it('kazanan isimleri havuzdan seçilir', async () => {
    await saveConfig({ enabled: true, poolMin: 2, poolMax: 2 });
    regeneratePool();
    await fireFakeWin();
    const w = getRecentWinners(1)[0];
    assert.match(w.username, /^[A-ZÇĞİÖŞÜ][a-zçğıöşü]+ [A-Z]\.$/);
  });
});

describe('fireFakeWin — kazanç alanları (Çekirdek/Casino/Bahisler)', () => {
  afterEach(async () => {
    await setModuleEnabled('casino-content', false);
    await setModuleEnabled('betting', false);
    invalidateModules();
  });

  it('includeCasinoWins/includeBettingWins false iken her zaman in-house kazananı üretir', async () => {
    await saveConfig({ enabled: true, poolMin: 2, poolMax: 2, includeCasinoWins: false, includeBettingWins: false });
    regeneratePool();
    await fireFakeWin();
    const w = getRecentWinners(1)[0];
    assert.ok(w.gameId.startsWith('inhouse-'));
  });

  it('includeBettingWins true ama betting modülü kapalıyken bahis kazananı ÜRETMEZ (çekirdeğe düşer)', async () => {
    await saveConfig({ enabled: true, poolMin: 2, poolMax: 2, includeCasinoWins: false, includeBettingWins: true });
    await setModuleEnabled('betting', false);
    regeneratePool();
    await fireFakeWin();
    const w = getRecentWinners(1)[0];
    assert.ok(!w.gameId.startsWith('bet-'));
  });

  describe('bahis kazananları — maç bitene kadar BİRİKİR, hemen yayınlanmaz', () => {
    let liveEvent;

    beforeEach(async () => {
      await Event.deleteMany({});
      liveEvent = await Event.create({
        sport: 'football', league: 'Test Ligi', status: 'live', startTime: new Date(),
        homeTeam: { name: 'Ev Sahibi' }, awayTeam: { name: 'Deplasman' },
      });
    });

    afterEach(async () => { await Event.deleteMany({}); });

    it('canlı etkinlik varken "betting" alanı seçilince HEMEN kazanan yayınlamaz, sayaç biriktirir', async () => {
      await saveConfig({ enabled: true, poolMin: 2, poolMax: 2, includeCasinoWins: false, includeBettingWins: true });
      await setModuleEnabled('betting', true);
      regeneratePool();
      const beforeCount = getRecentWinners(50).length;
      // Rastgele seçim 'core' da çıkabilir; birkaç deneme sonunda toplam
      // kazanan sayısı DEĞİŞMEMİŞ olmalı (betting turları sessizce birikir).
      for (let i = 0; i < 20; i++) await fireFakeWin();
      const afterCount = getRecentWinners(50).length;
      assert.ok(afterCount - beforeCount < 20, 'bazı turlar biriken bahis kazananı olmalı, hepsi hemen yayınlanmamalı');
      const winners = getRecentWinners(50);
      assert.ok(!winners.some(w => w.gameId.startsWith('bet-')), 'etkinlik bitmeden bet- önekli kazanan olmamalı');
    });

    it('releaseBettingWinsForEvent: etkinlik bitince biriken TÜM kazananlar tek seferde, etkinlik adıyla yayınlanır', async () => {
      await saveConfig({ enabled: true, poolMin: 3, poolMax: 3, includeCasinoWins: false, includeBettingWins: true });
      await setModuleEnabled('betting', true);
      regeneratePool();
      // Yalnızca 'betting' alanı seçilsin diye casino/core'u pratikte elemek yerine,
      // canlı etkinlik olduğu sürece queueBettingWin'in gerçekten sayaç
      // artırdığını görene kadar dener (aynı yukarıdaki test gibi rastgelelik var).
      for (let i = 0; i < 30; i++) await fireFakeWin();

      const beforeCount = getRecentWinners(50).length;
      releaseBettingWinsForEvent(liveEvent);
      const winners = getRecentWinners(50);
      const bettingWinners = winners.filter(w => w.gameId === `bet-${liveEvent._id}`);

      if (bettingWinners.length === 0) {
        // 30 denemede hiç 'betting' turu çıkmadıysa (düşük ihtimal ama rastgele)
        // release'in en azından hata vermediğini doğrulamak yeterli.
        assert.equal(getRecentWinners(50).length, beforeCount);
        return;
      }
      for (const w of bettingWinners) {
        assert.equal(w.gameTitle, 'Ev Sahibi - Deplasman');
        assert.ok(String(w.userId).startsWith('fake-'));
      }
      // İkinci çağrı aynı etkinlik için tekrar kazanan üretmemeli (sayaç tüketildi).
      const afterFirstRelease = getRecentWinners(50).length;
      releaseBettingWinsForEvent(liveEvent);
      assert.equal(getRecentWinners(50).length, afterFirstRelease);
    });
  });

  it('includeCasinoWins true ama casino-content modülü kapalıyken casino kazananı ÜRETMEZ', async () => {
    await saveConfig({ enabled: true, poolMin: 2, poolMax: 2, includeCasinoWins: true, includeBettingWins: false });
    await setModuleEnabled('casino-content', false);
    regeneratePool();
    await fireFakeWin();
    const w = getRecentWinners(1)[0];
    assert.ok(!w.gameId.startsWith('palace-'));
  });
});
