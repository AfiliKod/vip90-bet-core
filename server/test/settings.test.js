import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createSettingsStore, maskSecret } from '../src/services/settings.js';

/** Sahte saat + sayılabilir DB yüklemesiyle izole bir store kurar. */
function setup({ db = {}, env = {}, failLoad = false } = {}) {
  let now = 1_000_000;
  let loadCount = 0;
  const store = createSettingsStore({
    load: async () => {
      loadCount++;
      if (failLoad) throw new Error('DB erişilemiyor');
      return { ...db };
    },
    env,
    now: () => now,
  });
  return { store, advance: ms => { now += ms; }, loads: () => loadCount };
}

describe('kaynak önceliği', () => {
  test('DB değeri env değerini ezer', async () => {
    const { store } = setup({ db: { TELEGRAM_BOT_TOKEN: 'db-token' }, env: { TELEGRAM_BOT_TOKEN: 'env-token' } });
    assert.strictEqual(await store.get('TELEGRAM_BOT_TOKEN'), 'db-token');
  });

  test('DB’de yoksa env’e düşer', async () => {
    const { store } = setup({ db: {}, env: { TELEGRAM_BOT_TOKEN: 'env-token' } });
    assert.strictEqual(await store.get('TELEGRAM_BOT_TOKEN'), 'env-token');
  });

  test('hiçbirinde yoksa null döner', async () => {
    const { store } = setup();
    assert.strictEqual(await store.get('TELEGRAM_BOT_TOKEN'), null);
  });

  test('DB’de boş string env’i ezmez', async () => {
    const { store } = setup({ db: { ALERT_EMAIL_TO: '' }, env: { ALERT_EMAIL_TO: 'admin@vip90.bet' } });
    assert.strictEqual(await store.get('ALERT_EMAIL_TO'), 'admin@vip90.bet');
  });

  test('DB okunamazsa env’e düşer — alarm hattı DB ile birlikte ölmez', async () => {
    const { store } = setup({ env: { TELEGRAM_BOT_TOKEN: 'env-token' }, failLoad: true });
    assert.strictEqual(await store.get('TELEGRAM_BOT_TOKEN'), 'env-token');
  });
});

describe('cache', () => {
  test('TTL içinde DB’ye bir kez gider', async () => {
    const { store, loads } = setup({ db: { A: '1' } });
    await store.get('A');
    await store.get('A');
    assert.strictEqual(loads(), 1);
  });

  test('TTL dolunca yeniden yükler', async () => {
    const { store, advance, loads } = setup({ db: { A: '1' } });
    await store.get('A');
    advance(31_000);
    await store.get('A');
    assert.strictEqual(loads(), 2);
  });

  test('invalidate sonrası hemen yeniden yükler', async () => {
    const { store, loads } = setup({ db: { A: '1' } });
    await store.get('A');
    store.invalidate();
    await store.get('A');
    assert.strictEqual(loads(), 2);
  });
});

describe('maskSecret', () => {
  test('uzun değerin baş ve son dördünü gösterir', () => {
    assert.strictEqual(maskSecret('8412abcdefgh9f3a'), '8412…9f3a');
  });

  test('kısa değeri tamamen maskeler', () => {
    assert.strictEqual(maskSecret('kisa'), '••••');
  });

  test('boş değer için null döner', () => {
    assert.strictEqual(maskSecret(''), null);
    assert.strictEqual(maskSecret(null), null);
  });
});
