/**
 * CRAZY WHEEL admin alan-bloğu bekçisi — `npm test` içinde kalıcı.
 *
 * Kapanış hedefi: GameSettings.jsx'teki `FIELDS_BY_GAME[s.gameId] ?? []`
 * fallback'i inhouse-crazywheel için BOŞ form üretmesin (Wheel'in yerine geçen
 * 15. oyun, ONAYLI spec 2026-11-02). Üç kat birlikte denetlenir:
 *  1) Kayıt: FIELDS_BY_GAME'de 'inhouse-crazywheel' entry'si + CRAZYWHEEL_FIELDS
 *     alan-anahtarları (Bileşen import edilemediği için kaynak-taraması —
 *     desen: client/scripts/__tests__/parse-routes.test.mjs).
 *  2) Etiket paritesi: her alan-anahtarının admin.gameSettings.field.* etiketi
 *     8/8 sözlükte var ve boş değil (desen: communicationsParity.test.js).
 *  3) Şema hizası: anahtar adları server GameSettings şeması +
 *     GAME_FIELD_META minKey/maxKey kaydıyla birebir (üç-yüzey tek-commit
 *     disiplininin client kolu).
 *
 * KING OF MONEY bekçisinden (kingofmoneySettingsParity.test.js) TEK fark:
 * Crazy Wheel'ın matematiği provider math/crazyWheelMath.js sabitlerinde MÜHÜRLÜ
 * olduğundan dördüncü kat olarak "ek knob sızamaz" bekçisi var — eski
 * `wheelPayoutScale` benzeri bir payout/house-edge/mult alanı üç yüzeyden
 * herhangi birine girerse bu test kırılır.
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

const EXPECTED_FIELDS = ['crazywheelMinBet', 'crazywheelMaxBet'];

function read(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

const page = read('client/src/pages/admin/GameSettings.jsx');
const block = page.match(/const CRAZYWHEEL_FIELDS = \[([\s\S]*?)\];/);
const registration = page.match(/const FIELDS_BY_GAME = \{([\s\S]*?)\n\};/);

describe('inhouse-crazywheel — admin GameSettings alan-bloğu', () => {
  test('CRAZYWHEEL_FIELDS tam olarak min/max alanlarını taşır', () => {
    assert.ok(block, 'CRAZYWHEEL_FIELDS bloğu bulunamadı');
    const keys = [...block[1].matchAll(/key: '([^']+)'/g)].map(m => m[1]);
    assert.deepEqual(keys, EXPECTED_FIELDS);
  });

  test('FIELDS_BY_GAME kaydı: ?? [] fallback inhouse-crazywheel için boşa düşmez', () => {
    assert.ok(registration, 'FIELDS_BY_GAME bloğu bulunamadı');
    assert.match(registration[1], /'inhouse-crazywheel':\s*CRAZYWHEEL_FIELDS/);
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
      /'inhouse-crazywheel':\s*\{[\s\S]*?minKey:\s*'crazywheelMinBet'[\s\S]*?maxKey:\s*'crazywheelMaxBet'/,
      'GAME_FIELD_META crazywheel minKey/maxKey hizası bozuldu',
    );
  });

  // MÜHÜR BEKÇİSİ (kingofmoney bekçisinde olmayan tek kat): ödemeyi oynatabilecek
  // bir alan HİÇBİR yüzeye giremez. Yorum satırları sayılmaz — yalnız alan-TANIMI
  // biçimi (`alan:` prop/entry) denetlenir; eski `wheelPayoutScale` şema/field
  // listelerinde tanımı olmadığı için burada da yakalanır.
  test('mühür: crazywheel için ek bir payout/house-edge knobu tanımlanamaz', () => {
    const knobPattern = /^crazywheel(?!MinBet$|MaxBet$)[A-Za-z]*(Payout|Scale|Mult|Edge|Rtp|House)/;

    // 1) Form alanları: CRAZYWHEEL_FIELDS yalnız bet aralığı + şemadaki tek
    //    crazywheel* alanı da iki MinBet/MaxBet prop'u olmalı.
    const formKeys = [...(block ? block[1].matchAll(/key: '([^']+)'/g) : [])].map(m => m[1]);
    assert.deepEqual(formKeys, EXPECTED_FIELDS, 'form alan listesi min/max dışına taştı');

    // 2) Şema: GameSettings.js'te crazywheel öneşli alan TANIMI birebir ikili.
    const schema = read('server/src/models/GameSettings.js');
    const schemaKeys = [...schema.matchAll(/^[ \t]*crazywheel[A-Za-z]*\s*:/gm)]
      .map(m => m[0].replace(/[^A-Za-z]/g, ''));
    assert.deepEqual(schemaKeys, EXPECTED_FIELDS, 'şemada crazywheel öneşli ek alan bitti');
    assert.ok(!schemaKeys.some(k => knobPattern.test(k)), 'şemada payout knobu tanımlandı');

    // 3) GAME_FIELD_META + OPERATOR_ALLOWED_FIELDS: minKey/maxKey (+ isActive)
    //    dışında anahtar YOK — percentField/multField bu oyun için TANIMSIZ.
    const meta = read('server/src/services/gameSettings.js');
    assert.match(
      meta,
      /'inhouse-crazywheel':\s*\{\s*minKey:\s*'crazywheelMinBet',\s*maxKey:\s*'crazywheelMaxBet'\s*\}/,
      'GAME_FIELD_META crazywheel minKey/maxKey dışı bir alan kazandı (mühür bozuldu)',
    );
    assert.match(
      meta,
      /'inhouse-crazywheel':\s*\[\s*'crazywheelMinBet',\s*'crazywheelMaxBet',\s*'isActive'\s*\]/,
      'OPERATOR_ALLOWED_FIELDS crazywheel üç anahtarın (min/max/isActive) dışına çıktı',
    );
  });
});
