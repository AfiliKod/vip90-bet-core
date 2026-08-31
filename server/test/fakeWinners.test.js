import { it, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Setting from '../src/models/Setting.js';
import { getRecentWinners } from '../src/services/liveGameStream.js';
import {
  DEFAULT_CONFIG, loadConfig, saveConfig, getConfig, getPoolSize,
  regeneratePool, fireFakeWin,
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
    fireFakeWin();
    assert.equal(getRecentWinners(50).length, before);
  });

  it('enabled:true iken gerçek addRecentWinner mekanizmasıyla bir kazanan ekler', async () => {
    await saveConfig({ enabled: true, poolMin: 3, poolMax: 3, amountMin: 100, amountMax: 200 });
    regeneratePool();
    const beforeCount = getRecentWinners(50).length;
    fireFakeWin();
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
    fireFakeWin();
    const w = getRecentWinners(1)[0];
    assert.match(w.username, /^[A-ZÇĞİÖŞÜ][a-zçğıöşü]+ [A-Z]\.$/);
  });
});
