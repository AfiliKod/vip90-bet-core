import { test, describe } from 'node:test';
import assert from 'node:assert';
import { LOCALE_KEY, DEFAULT_LOCALE, SUPPORTED_LOCALES, createLocaleStore } from '../src/services/locale.js';

function fakeBackend({ initial = {} } = {}) {
  const store = new Map(Object.entries(initial));
  let failReads = false;
  return {
    store,
    setFailReads(v) { failReads = v; },
    async loadSetting(key) {
      if (failReads) throw new Error('db yok');
      return store.get(key) ?? null;
    },
    async saveSetting(key, value) {
      store.set(key, String(value));
      return true;
    },
  };
}

describe('createLocaleStore — sitenin varsayılan frontend dili', () => {
  test('DB kaydı yoksa varsayılan tr döner', async () => {
    const backend = fakeBackend();
    const s = createLocaleStore(backend);
    assert.strictEqual(await s.get(), 'tr');
  });

  test('DB değeri varsa o döner', async () => {
    const backend = fakeBackend({ initial: { [LOCALE_KEY]: 'en' } });
    const s = createLocaleStore(backend);
    assert.strictEqual(await s.get(), 'en');
  });

  test('set geçerli bir dili kaydeder ve önbelleği yeniler', async () => {
    const backend = fakeBackend();
    const s = createLocaleStore(backend);
    await s.set('de', 'admin-1');
    assert.strictEqual(backend.store.get(LOCALE_KEY), 'de');
    assert.strictEqual(await s.get(), 'de'); // TTL cache eski değeri vermemeli
  });

  test('set desteklenmeyen dili VALIDATION ile reddeder, kaydetmez', async () => {
    const backend = fakeBackend();
    const s = createLocaleStore(backend);
    await assert.rejects(() => s.set('fr', 'a'), /VALIDATION/);
    assert.strictEqual(backend.store.size, 0);
  });

  test('okuma patlarsa varsayılana düşer (fail-safe)', async () => {
    const backend = fakeBackend({ initial: { [LOCALE_KEY]: 'en' } });
    backend.setFailReads(true);
    const s = createLocaleStore(backend);
    assert.strictEqual(await s.get(), DEFAULT_LOCALE);
  });

  test('TTL içinde tekrar okuma DB\'ye gitmez', async () => {
    const backend = fakeBackend({ initial: { [LOCALE_KEY]: 'en' } });
    let reads = 0;
    const s = createLocaleStore({
      ...backend,
      async loadSetting(key) { reads++; return backend.loadSetting(key); },
    });
    await s.get();
    await s.get();
    assert.strictEqual(reads, 1);
  });

  test('tüm SUPPORTED_LOCALES geçerli kabul edilir', async () => {
    const backend = fakeBackend();
    const s = createLocaleStore(backend);
    for (const locale of SUPPORTED_LOCALES) {
      await s.set(locale, 'a');
      assert.strictEqual(await s.get(), locale);
    }
  });
});
