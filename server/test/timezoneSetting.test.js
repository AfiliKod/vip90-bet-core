import { test, describe } from 'node:test';
import assert from 'node:assert';
import { TIMEZONE_KEY, DEFAULT_TIMEZONE, createTimezoneStore } from '../src/services/timezone.js';

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
    async saveSetting(key, value, updatedBy) {
      store.set(key, String(value));
      return true;
    },
  };
}

describe('createTimezoneStore — operatör saat dilimi ayarı', () => {
  test('DB kaydı yoksa varsayılan Europe/Istanbul döner', async () => {
    const backend = fakeBackend();
    const s = createTimezoneStore(backend);
    assert.strictEqual(await s.get(), 'Europe/Istanbul');
  });

  test('DB değeri varsa o döner', async () => {
    const backend = fakeBackend({ initial: { [TIMEZONE_KEY]: 'Europe/Berlin' } });
    const s = createTimezoneStore(backend);
    assert.strictEqual(await s.get(), 'Europe/Berlin');
  });

  test('set geçerli IANA bölgesini kaydeder ve önbelleği yeniler', async () => {
    const backend = fakeBackend();
    const s = createTimezoneStore(backend);
    await s.set('America/New_York', 'admin-1');
    assert.strictEqual(backend.store.get(TIMEZONE_KEY), 'America/New_York');
    assert.strictEqual(await s.get(), 'America/New_York'); // TTL cache eski değeri vermemeli
  });

  test('set geçersiz bölgeyi VALIDATION ile reddeder, kaydetmez', async () => {
    const backend = fakeBackend();
    const s = createTimezoneStore(backend);
    await assert.rejects(() => s.set('Mars/Olympus', 'a'), /VALIDATION/);
    assert.strictEqual(backend.store.size, 0);
  });

  test('okuma patlarsa varsayılana düşer (fail-safe)', async () => {
    const backend = fakeBackend({ initial: { [TIMEZONE_KEY]: 'Europe/Berlin' } });
    backend.setFailReads(true);
    const s = createTimezoneStore(backend);
    assert.strictEqual(await s.get(), DEFAULT_TIMEZONE);
  });

  test('TTL içinde tekrar okuma DB\'ye gitmez', async () => {
    const backend = fakeBackend({ initial: { [TIMEZONE_KEY]: 'Europe/Berlin' } });
    let reads = 0;
    const s = createTimezoneStore({
      ...backend,
      async loadSetting(key) { reads++; return backend.loadSetting(key); },
    }, );
    await s.get();
    await s.get();
    assert.strictEqual(reads, 1);
  });
});
