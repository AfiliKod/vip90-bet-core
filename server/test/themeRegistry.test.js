import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createThemeStore, THEME_TOKEN_DEFINITIONS } from '../src/theme/registry.js';

describe('THEME_TOKEN_DEFINITIONS', () => {
  test('her tanım id + cssVar + default + type taşır', () => {
    for (const t of THEME_TOKEN_DEFINITIONS) {
      assert.strictEqual(typeof t.id, 'string');
      assert.ok(t.cssVar.startsWith('--'));
      assert.strictEqual(typeof t.default, 'string');
      assert.ok(['color', 'font', 'radius', 'shadow'].includes(t.type));
    }
  });

  test('primary ve accent tanımlı — mevcut tasarımın gerçek renkleri', () => {
    const ids = THEME_TOKEN_DEFINITIONS.map(t => t.id);
    assert.ok(ids.includes('primary'));
    assert.ok(ids.includes('accent'));
  });
});

describe('createThemeStore', () => {
  const store = (dbValues = {}, opts = {}) => createThemeStore({
    load: async () => dbValues,
    now: () => 1000,
    ttlMs: 30_000,
    ...opts,
  });

  test('DB’de override yoksa varsayılan değeri döner', async () => {
    const s = store({});
    const overrides = await s.getCssVars();
    assert.strictEqual(overrides['--color-primary'], '#00d4ff');
  });

  test('DB’de override varsa onu döner', async () => {
    const s = store({ primary: '#ff0000' });
    const overrides = await s.getCssVars();
    assert.strictEqual(overrides['--color-primary'], '#ff0000');
  });

  test('getCssVars tüm tanımlı token’ları döner — kısmi override tam kümeyi bozmaz', async () => {
    const s = store({ primary: '#ff0000' });
    const overrides = await s.getCssVars();
    assert.strictEqual(overrides['--color-accent'], '#7c3aed'); // varsayılanda kaldı
  });

  test('list() tüm tanımları değer+kaynak bilgisiyle döner', async () => {
    const s = store({ primary: '#ff0000' });
    const list = await s.list();
    const primary = list.find(t => t.id === 'primary');
    assert.strictEqual(primary.value, '#ff0000');
    assert.strictEqual(primary.source, 'db');
    const accent = list.find(t => t.id === 'accent');
    assert.strictEqual(accent.source, 'default');
  });

  test('load patlarsa varsayılanlara düşer, throw etmez', async () => {
    const s = createThemeStore({ load: async () => { throw new Error('db down'); }, now: () => 1000 });
    const overrides = await s.getCssVars();
    assert.strictEqual(overrides['--color-primary'], '#00d4ff');
  });

  test('invalidate() önbelleği temizler', async () => {
    let calls = 0;
    const s = createThemeStore({ load: async () => { calls++; return {}; }, now: () => 1000 });
    await s.getCssVars();
    s.invalidate();
    await s.getCssVars();
    assert.strictEqual(calls, 2);
  });
});
