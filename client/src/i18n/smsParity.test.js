/**
 * SMS i18n parite denetimi — `npm test` içinde kalıcı.
 *
 * Kapsam bilinçli olarak SMS ile sınırlı: 8 sözlüğün TAMAMINI karşılaştıran
 * genel bir parite testi bu depoda yok (parite bir gelenek, denetim değil) ve
 * tüm sözlükleri kilitlemek SMS dışı alanlara da müdahale etmeyi gerektirirdi.
 * Buradaki kural, bu özellikten doğan anahtarların 8 dilde de bulunması ve
 * aynı `{param}` yer tutucularını taşımasıdır — çeviri atlama/boş bırakma
 * hatası tam burada yakalanır.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import tr from './dictionaries/tr.js';
import en from './dictionaries/en.js';
import de from './dictionaries/de.js';
import es from './dictionaries/es.js';
import pt from './dictionaries/pt.js';
import ja from './dictionaries/ja.js';
import ko from './dictionaries/ko.js';
import th from './dictionaries/th.js';

const DICTIONARIES = { tr, en, de, es, pt, ja, ko, th };

/** Bu özellikten doğan anahtarlar: SMS Gateway + SMS şablon sayfası + nav +
 *  modül kartı başlıkları. */
const PREFIXES = ['admin.smsGateway.', 'admin.smsTemplates.', 'admin.smsSenders.'];
const EXACT_KEYS = [
  'admin.nav.smsTemplates',
  'admin.moduleCards.title.smsGateway',
  'admin.moduleCards.desc.smsGateway',
];

const ownedKeys = Object.keys(tr)
  .filter(k => PREFIXES.some(p => k.startsWith(p)) || EXACT_KEYS.includes(k))
  .sort();

// `core.js` ile aynı anahtar kuralı (tire/alt çizgi yasak).
const KEY_RE = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/;
const placeholdersOf = value => [...String(value).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

describe('SMS i18n paritesi', () => {
  test('bu özellik için anahtar listesi boş değil (filtre bozulmadı)', () => {
    assert.ok(ownedKeys.length > 230, `beklenenden az anahtar: ${ownedKeys.length}`);
  });

  test('her anahtar 8 sözlükte de mevcut', () => {
    for (const key of ownedKeys) {
      for (const [lang, dict] of Object.entries(DICTIONARIES)) {
        assert.ok(key in dict, `${lang}: eksik anahtar → ${key}`);
      }
    }
  });

  test('hiçbir dilde boş çeviri kalmaz', () => {
    for (const key of ownedKeys) {
      for (const [lang, dict] of Object.entries(DICTIONARIES)) {
        const value = dict[key];
        assert.ok(typeof value === 'string' && value.trim().length > 0, `${lang}: boş çeviri → ${key}`);
      }
    }
  });

  test('anahtar biçimi geçerli (tire/alt çizgi/büyük harfle başlama yok)', () => {
    for (const key of ownedKeys) {
      assert.match(key, KEY_RE, `geçersiz anahtar biçimi → ${key}`);
    }
  });

  test('yer tutucular dil başına aynı (farklı dil eksik parametre göstermez)', () => {
    for (const key of ownedKeys) {
      const expected = placeholdersOf(tr[key]);
      for (const [lang, dict] of Object.entries(DICTIONARIES)) {
        assert.deepStrictEqual(
          placeholdersOf(dict[key]),
          expected,
          `${lang}: yer tutucu uyuşmazlığı → ${key} (tr: ${expected.join(',')})`,
        );
      }
    }
  });

  test('çeviriler topluca İngilizce kopya değil (placeholder doldurulmamış mı?)', () => {
    // Bu depoda geçmişte 6 dil, `en.js`'in birebir kopyası olarak bırakılmıştı.
    // Tam liste yerine ORAN denetlenir: kardeş diller arasında gerçekten aynı
    // kalan kelimeler vardır ("System"/"System", "Wallet"/"Wallet",
    // "Segment"/"Segment"), ana anahtar listesi hâline getirmek kırılgandır.
    // Eşik: %25. Bugün gerçek değerler en yüksek %9.8 (de).
    const threshold = 0.25;
    for (const lang of ['de', 'es', 'pt', 'ja', 'ko', 'th']) {
      const dict = DICTIONARIES[lang];
      const identical = ownedKeys.filter(key => dict[key] === en[key]);
      const ratio = identical.length / ownedKeys.length;
      assert.ok(
        ratio <= threshold,
        `${lang}: anahtarların %${(ratio * 100).toFixed(1)}'i İngilizce kopyası (eşik %${threshold * 100})\n  → ${identical.slice(0, 8).join(', ')}`,
      );
    }
  });

  test('sözlükler arasında SMS alanında ek/fazla anahtar farkı yok', () => {
    const reference = new Set(ownedKeys);
    for (const [lang, dict] of Object.entries(DICTIONARIES)) {
      const mine = new Set(Object.keys(dict).filter(k => PREFIXES.some(p => k.startsWith(p)) || EXACT_KEYS.includes(k)));
      for (const key of mine) assert.ok(reference.has(key), `${lang}: fazlalık anahtar → ${key}`);
      for (const key of reference) assert.ok(mine.has(key), `${lang}: eksik anahtar → ${key}`);
    }
  });
});