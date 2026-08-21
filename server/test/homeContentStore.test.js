import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createHomeContentStore, DEFAULT_HOME_CONTENT, HOME_SECTION_IDS, HOME_BANNER_IDS } from '../src/pages/registry.js';

describe('HOME_SECTION_IDS / HOME_BANNER_IDS', () => {
  test('8 bölüm id\'si tanımlı', () => {
    assert.strictEqual(HOME_SECTION_IDS.length, 8);
    assert.ok(HOME_SECTION_IDS.includes('hero'));
  });

  test('3 banner id\'si tanımlı', () => {
    assert.strictEqual(HOME_BANNER_IDS.length, 3);
    assert.ok(HOME_BANNER_IDS.includes('deneme-bonusu'));
  });
});

describe('createHomeContentStore', () => {
  const store = (rawValue, opts = {}) => createHomeContentStore({
    load: async () => rawValue,
    now: () => 1000,
    ttlMs: 30_000,
    ...opts,
  });

  test('DB\'de kayıt yoksa (null) varsayılan boş içeriğe düşer', async () => {
    const s = store(null);
    const content = await s.get();
    assert.deepStrictEqual(content, DEFAULT_HOME_CONTENT);
  });

  test('geçerli JSON kaydı parse edilip döner', async () => {
    const s = store(JSON.stringify({ sectionOrder: ['hero'], banners: [{ id: 'a' }] }));
    const content = await s.get();
    assert.deepStrictEqual(content, { sectionOrder: ['hero'], banners: [{ id: 'a' }] });
  });

  test('bozuk JSON varsayılana düşer, throw etmez', async () => {
    const s = store('{not valid json');
    const content = await s.get();
    assert.deepStrictEqual(content, DEFAULT_HOME_CONTENT);
  });

  test('eksik alanlar (sectionOrder veya banners yok) boş diziye tamamlanır', async () => {
    const s = store(JSON.stringify({ sectionOrder: ['hero'] }));
    const content = await s.get();
    assert.deepStrictEqual(content, { sectionOrder: ['hero'], banners: [] });
  });

  test('load patlarsa varsayılana düşer, throw etmez', async () => {
    const s = createHomeContentStore({ load: async () => { throw new Error('db down'); }, now: () => 1000 });
    const content = await s.get();
    assert.deepStrictEqual(content, DEFAULT_HOME_CONTENT);
  });

  test('null değer de (henüz hiç kaydedilmemiş) doğru cache\'lenir, tekrar tekrar load çağırmaz', async () => {
    let calls = 0;
    const s = createHomeContentStore({ load: async () => { calls++; return null; }, now: () => 1000 });
    await s.get();
    await s.get();
    assert.strictEqual(calls, 1);
  });

  test('invalidate() önbelleği temizler', async () => {
    let calls = 0;
    const s = createHomeContentStore({ load: async () => { calls++; return null; }, now: () => 1000 });
    await s.get();
    s.invalidate();
    await s.get();
    assert.strictEqual(calls, 2);
  });
});
