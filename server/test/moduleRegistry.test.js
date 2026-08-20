import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createModuleStore, MODULE_DEFINITIONS } from '../src/modules/registry.js';

describe('MODULE_DEFINITIONS', () => {
  test('çekirdek platform (in-house oyunlar) bir modül değildir', () => {
    assert.ok(!MODULE_DEFINITIONS.some(m => m.id === 'core'));
  });

  test('üç satılabilir modülü tanımlar: betting, casino-content, live-casino', () => {
    assert.deepStrictEqual(MODULE_DEFINITIONS.map(m => m.id).sort(),
      ['betting', 'casino-content', 'live-casino']);
  });

  test('her tanım id + title + description taşır', () => {
    for (const m of MODULE_DEFINITIONS) {
      assert.strictEqual(typeof m.id, 'string');
      assert.strictEqual(typeof m.title, 'string');
      assert.strictEqual(typeof m.description, 'string');
    }
  });
});

describe('createModuleStore', () => {
  const store = (dbFlags = {}, opts = {}) => createModuleStore({
    load: async () => dbFlags,
    now: () => 1000,
    ttlMs: 30_000,
    ...opts,
  });

  test('DB’de kayıt yoksa modül varsayılan olarak kapalıdır', async () => {
    const s = store({});
    assert.strictEqual(await s.isEnabled('betting'), false);
  });

  test('DB’de enabled=true ise modül açıktır', async () => {
    const s = store({ betting: true });
    assert.strictEqual(await s.isEnabled('betting'), true);
  });

  test('tanımsız modül id’si için false döner (throw etmez)', async () => {
    const s = store({});
    assert.strictEqual(await s.isEnabled('nonexistent'), false);
  });

  test('list() tüm tanımları enabled durumuyla birlikte döndürür — tek doğruluk kaynağı', async () => {
    const s = store({ betting: true, 'casino-content': false });
    const list = await s.list();
    assert.strictEqual(list.length, 3);
    const betting = list.find(m => m.id === 'betting');
    assert.strictEqual(betting.enabled, true);
    assert.strictEqual(betting.title, 'Spor ve Canlı Bahis');
    const liveCasino = list.find(m => m.id === 'live-casino');
    assert.strictEqual(liveCasino.enabled, false);
  });

  test('load patlarsa hepsi kapalı sayılır, throw etmez (fail-closed)', async () => {
    const s = createModuleStore({ load: async () => { throw new Error('db down'); }, now: () => 1000 });
    assert.strictEqual(await s.isEnabled('betting'), false);
    assert.deepStrictEqual((await s.list()).map(m => m.enabled), [false, false, false]);
  });

  test('TTL süresince DB tekrar sorgulanmaz', async () => {
    let calls = 0;
    let t = 1000;
    const s = createModuleStore({ load: async () => { calls++; return { betting: true }; }, now: () => t, ttlMs: 5000 });
    await s.isEnabled('betting');
    t += 1000;
    await s.isEnabled('betting');
    assert.strictEqual(calls, 1);
    t += 10000;
    await s.isEnabled('betting');
    assert.strictEqual(calls, 2);
  });

  test('invalidate() önbelleği temizler', async () => {
    let calls = 0;
    const s = createModuleStore({ load: async () => { calls++; return {}; }, now: () => 1000 });
    await s.isEnabled('betting');
    s.invalidate();
    await s.isEnabled('betting');
    assert.strictEqual(calls, 2);
  });
});
