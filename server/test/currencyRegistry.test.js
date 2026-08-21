import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createCurrencyStore, CURRENCY_DEFINITIONS, DEFAULT_CURRENCY_CODE, formatMoney } from '../src/currency/registry.js';

describe('CURRENCY_DEFINITIONS', () => {
  test('her tanım code + symbol + locale taşır', () => {
    for (const c of CURRENCY_DEFINITIONS) {
      assert.strictEqual(typeof c.code, 'string');
      assert.strictEqual(c.code, c.code.toUpperCase());
      assert.strictEqual(typeof c.symbol, 'string');
      assert.strictEqual(typeof c.locale, 'string');
    }
  });

  test('varsayılan TRY tanımlı', () => {
    const codes = CURRENCY_DEFINITIONS.map(c => c.code);
    assert.ok(codes.includes(DEFAULT_CURRENCY_CODE));
    assert.strictEqual(DEFAULT_CURRENCY_CODE, 'TRY');
  });
});

describe('createCurrencyStore', () => {
  const store = (dbValue = {}, opts = {}) => createCurrencyStore({
    load: async () => dbValue,
    now: () => 1000,
    ttlMs: 30_000,
    ...opts,
  });

  test('DB’de override yoksa varsayılan (TRY) döner', async () => {
    const s = store({});
    const active = await s.getActive();
    assert.strictEqual(active.code, 'TRY');
    assert.strictEqual(active.symbol, '₺');
  });

  test('DB’de geçerli bir override varsa onu döner', async () => {
    const s = store({ code: 'USD' });
    const active = await s.getActive();
    assert.strictEqual(active.code, 'USD');
    assert.strictEqual(active.symbol, '$');
  });

  test('DB’de tanımsız/bozuk bir kod varsa varsayılana düşer, throw etmez', async () => {
    const s = store({ code: 'XYZ' });
    const active = await s.getActive();
    assert.strictEqual(active.code, 'TRY');
  });

  test('load patlarsa varsayılana düşer, throw etmez', async () => {
    const s = createCurrencyStore({ load: async () => { throw new Error('db down'); }, now: () => 1000 });
    const active = await s.getActive();
    assert.strictEqual(active.code, 'TRY');
  });

  test('list() tüm desteklenen para birimlerini döner', () => {
    const s = store({});
    const list = s.list();
    assert.ok(list.some(c => c.code === 'TRY'));
    assert.ok(list.some(c => c.code === 'USD'));
  });

  test('invalidate() önbelleği temizler', async () => {
    let calls = 0;
    const s = createCurrencyStore({ load: async () => { calls++; return {}; }, now: () => 1000 });
    await s.getActive();
    s.invalidate();
    await s.getActive();
    assert.strictEqual(calls, 2);
  });

  test('TTL süresi dolmadan tekrar çağrı DB’ye gitmez', async () => {
    let calls = 0;
    let t = 1000;
    const s = createCurrencyStore({ load: async () => { calls++; return {}; }, now: () => t, ttlMs: 30_000 });
    await s.getActive();
    t += 10_000;
    await s.getActive();
    assert.strictEqual(calls, 1);
  });
});

describe('formatMoney (sunucu tarafı, mesaj metinleri için)', () => {
  const TRY = { code: 'TRY', symbol: '₺', locale: 'tr-TR' };
  const USD = { code: 'USD', symbol: '$', locale: 'en-US' };

  test('sembolü tutarın önüne koyar, iki ondalığa yuvarlar', () => {
    assert.strictEqual(formatMoney(50, TRY), '₺50.00');
  });

  test('farklı para birimiyle çağrılabilir', () => {
    assert.strictEqual(formatMoney(50, USD), '$50.00');
  });

  test('geçersiz/eksik tutarı 0 olarak ele alır, throw etmez', () => {
    assert.doesNotThrow(() => formatMoney(undefined, TRY));
    assert.strictEqual(formatMoney(undefined, TRY), '₺0.00');
  });
});
