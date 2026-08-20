import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createFeaturedGamesStore, DEFAULT_FEATURED_GAMES } from '../src/games/registry.js';

describe('createFeaturedGamesStore', () => {
  const store = (rawValue, opts = {}) => createFeaturedGamesStore({
    load: async () => rawValue,
    now: () => 1000,
    ttlMs: 30_000,
    ...opts,
  });

  test('DB\'de kayıt yoksa (null) boş listeye düşer', async () => {
    const s = store(null);
    assert.deepStrictEqual(await s.get(), DEFAULT_FEATURED_GAMES);
  });

  test('geçerli JSON dizi kaydı parse edilip döner', async () => {
    const s = store(JSON.stringify(['a', 'b', 'c']));
    assert.deepStrictEqual(await s.get(), ['a', 'b', 'c']);
  });

  test('bozuk JSON boş listeye düşer, throw etmez', async () => {
    const s = store('{not valid');
    assert.deepStrictEqual(await s.get(), []);
  });

  test('dizi olmayan (ör. obje) JSON boş listeye düşer', async () => {
    const s = store(JSON.stringify({ not: 'an array' }));
    assert.deepStrictEqual(await s.get(), []);
  });

  test('dizideki string olmayan öğeler elenir', async () => {
    const s = store(JSON.stringify(['a', 42, null, 'b']));
    assert.deepStrictEqual(await s.get(), ['a', 'b']);
  });

  test('load patlarsa boş listeye düşer, throw etmez', async () => {
    const s = createFeaturedGamesStore({ load: async () => { throw new Error('db down'); }, now: () => 1000 });
    assert.deepStrictEqual(await s.get(), []);
  });

  test('invalidate() önbelleği temizler', async () => {
    let calls = 0;
    const s = createFeaturedGamesStore({ load: async () => { calls++; return null; }, now: () => 1000 });
    await s.get();
    s.invalidate();
    await s.get();
    assert.strictEqual(calls, 2);
  });
});
