import { test, describe } from 'node:test';
import assert from 'node:assert';
import { THEME_PRESETS, THEME_PRESET_IDS } from '../src/theme/presets.js';
import { THEME_TOKEN_DEFINITIONS } from '../src/theme/registry.js';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

describe('THEME_PRESETS (A6)', () => {
  test('tam olarak 3 hazır tema paketi tanımlı', () => {
    assert.strictEqual(THEME_PRESETS.length, 3);
  });

  test('id\'ler benzersiz', () => {
    const ids = THEME_PRESETS.map(p => p.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  test('her paket, THEME_TOKEN_DEFINITIONS\'taki tüm token id\'lerini kapsıyor — kısmi/tutarsız paket yok', () => {
    const allTokenIds = THEME_TOKEN_DEFINITIONS.map(t => t.id);
    for (const preset of THEME_PRESETS) {
      for (const tokenId of allTokenIds) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(preset.tokens, tokenId),
          `${preset.id} paketi "${tokenId}" token'ını kapsamıyor`,
        );
      }
    }
  });

  test('her pakette color tipi token\'lar geçerli hex değer taşıyor', () => {
    const colorTokenIds = THEME_TOKEN_DEFINITIONS.filter(t => t.type === 'color').map(t => t.id);
    for (const preset of THEME_PRESETS) {
      for (const tokenId of colorTokenIds) {
        assert.match(preset.tokens[tokenId], HEX_RE, `${preset.id}.${tokenId} geçerli hex değil`);
      }
    }
  });

  test('paketler birbirinden farklı — aynı üç renk paleti tekrarlanmıyor', () => {
    const signatures = THEME_PRESETS.map(p => `${p.tokens.primary}|${p.tokens.accent}`);
    assert.strictEqual(new Set(signatures).size, signatures.length);
  });

  test('THEME_PRESET_IDS, THEME_PRESETS ile senkron', () => {
    assert.deepStrictEqual(THEME_PRESET_IDS, THEME_PRESETS.map(p => p.id));
  });
});
