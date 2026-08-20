import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createBrandingStore, BRANDING_FIELD_DEFINITIONS } from '../src/branding/registry.js';

describe('BRANDING_FIELD_DEFINITIONS', () => {
  test('her tanım id + type + label taşır', () => {
    for (const f of BRANDING_FIELD_DEFINITIONS) {
      assert.strictEqual(typeof f.id, 'string');
      assert.strictEqual(typeof f.label, 'string');
      assert.ok(['text', 'image', 'font'].includes(f.type));
    }
  });

  test('metin alanları maxLength, dosya alanları maxBytes taşır', () => {
    for (const f of BRANDING_FIELD_DEFINITIONS) {
      if (f.type === 'text') assert.strictEqual(typeof f.maxLength, 'number');
      else assert.strictEqual(typeof f.maxBytes, 'number');
    }
  });

  test('siteName, logo, favicon, fontFamily, fontFile tanımlı', () => {
    const ids = BRANDING_FIELD_DEFINITIONS.map(f => f.id);
    for (const id of ['siteName', 'logo', 'favicon', 'fontFamily', 'fontFile']) {
      assert.ok(ids.includes(id), `${id} eksik`);
    }
  });
});

describe('createBrandingStore', () => {
  const store = (dbValues = {}, opts = {}) => createBrandingStore({
    load: async () => dbValues,
    now: () => 1000,
    ttlMs: 30_000,
    ...opts,
  });

  test('DB’de override yoksa varsayılan (null/tanım default) değeri döner', async () => {
    const s = store({});
    const values = await s.getValues();
    assert.strictEqual(values.siteName, null);
  });

  test('DB’de override varsa onu döner', async () => {
    const s = store({ siteName: 'VIP90.bet Pro' });
    const values = await s.getValues();
    assert.strictEqual(values.siteName, 'VIP90.bet Pro');
  });

  test('list() tüm tanımları değer+kaynak bilgisiyle döner', async () => {
    const s = store({ siteName: 'VIP90.bet Pro' });
    const list = await s.list();
    const siteName = list.find(f => f.id === 'siteName');
    assert.strictEqual(siteName.value, 'VIP90.bet Pro');
    assert.strictEqual(siteName.source, 'db');
    const logo = list.find(f => f.id === 'logo');
    assert.strictEqual(logo.source, 'default');
  });

  test('load patlarsa boş değerlere düşer, throw etmez', async () => {
    const s = createBrandingStore({ load: async () => { throw new Error('db down'); }, now: () => 1000 });
    const values = await s.getValues();
    assert.strictEqual(values.siteName, null);
  });

  test('invalidate() önbelleği temizler', async () => {
    let calls = 0;
    const s = createBrandingStore({ load: async () => { calls++; return {}; }, now: () => 1000 });
    await s.getValues();
    s.invalidate();
    await s.getValues();
    assert.strictEqual(calls, 2);
  });
});
