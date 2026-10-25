/**
 * KING OF MONEY admin alan-bloğu bekçisi — `npm test` içinde kalıcı.
 *
 * Kapanış hedefi (RM 973): GameSettings.jsx'teki `FIELDS_BY_GAME[s.gameId] ?? []`
 * fallback'i inhouse-kingofmoney için BOŞ form üretmesin. Üç kat birlikte denetlenir:
 *  1) Kayıt: FIELDS_BY_GAME'de 'inhouse-kingofmoney' entry'si + KINGOFMONEY_FIELDS
 *     alan-anahtarları (Bileşen import edilemediği için kaynak-taraması —
 *     desen: client/scripts/__tests__/parse-routes.test.mjs).
 *  2) Etiket paritesi: her alan-anahtarının admin.gameSettings.field.* etiketi
 *     8/8 sözlükte var ve boş değil (desen: communicationsParity.test.js).
 *  3) Şema hizası: anahtar adları server GameSettings şeması +
 *     GAME_FIELD_META minKey/maxKey kaydıyla birebir (üç-yüzey tek-commit
 *     disiplininin client kolu).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import tr from './dictionaries/tr.js';
import en from './dictionaries/en.js';
import de from './dictionaries/de.js';
import es from './dictionaries/es.js';
import pt from './dictionaries/pt.js';
import ja from './dictionaries/ja.js';
import ko from './dictionaries/ko.js';
import th from './dictionaries/th.js';

const DICTS = { tr, en, de, es, pt, ja, ko, th };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const EXPECTED_FIELDS = ['kingofmoneyMinBet', 'kingofmoneyMaxBet'];

function read(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

const page = read('client/src/pages/admin/GameSettings.jsx');
const block = page.match(/const KINGOFMONEY_FIELDS = \[([\s\S]*?)\];/);
const registration = page.match(/const FIELDS_BY_GAME = \{([\s\S]*?)\n\};/);

describe('inhouse-kingofmoney — admin GameSettings alan-bloğu', () => {
  test('KINGOFMONEY_FIELDS tam olarak min/max alanlarını taşır', () => {
    assert.ok(block, 'KINGOFMONEY_FIELDS bloğu bulunamadı');
    const keys = [...block[1].matchAll(/key: '([^']+)'/g)].map(m => m[1]);
    assert.deepEqual(keys, EXPECTED_FIELDS);
  });

  test('FIELDS_BY_GAME kaydı: ?? [] fallback inhouse-kingofmoney için boşa düşmez', () => {
    assert.ok(registration, 'FIELDS_BY_GAME bloğu bulunamadı');
    assert.match(registration[1], /'inhouse-kingofmoney':\s*KINGOFMONEY_FIELDS/);
  });

  test('alan etiketleri 8/8 sözlükte var ve boş değil', () => {
    for (const key of EXPECTED_FIELDS) {
      const labelKey = `admin.gameSettings.field.${key}`;
      for (const [loc, dict] of Object.entries(DICTS)) {
        const value = dict[labelKey];
        assert.equal(typeof value, 'string', `${loc}: ${labelKey} yok`);
        assert.ok(value.trim().length > 0, `${loc}: ${labelKey} boş`);
      }
    }
  });

  test('alan adları server şemasıyla birebir (üç-yüzey hizası)', () => {
    const schema = read('server/src/models/GameSettings.js');
    for (const key of EXPECTED_FIELDS) {
      assert.ok(schema.includes(`${key}:`), `şemada ${key} prop yok`);
    }
    const meta = read('server/src/services/gameSettings.js');
    assert.match(
      meta,
      /'inhouse-kingofmoney':\s*\{[\s\S]*?minKey:\s*'kingofmoneyMinBet'[\s\S]*?maxKey:\s*'kingofmoneyMaxBet'/,
      'GAME_FIELD_META kingofmoney minKey/maxKey hizası bozuldu',
    );
  });
});
