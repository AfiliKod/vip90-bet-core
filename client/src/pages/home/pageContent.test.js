import assert from 'node:assert/strict';
import { DEFAULT_SECTION_ORDER, resolveSectionOrder, resolveBanners } from './pageContent.js';

// resolveSectionOrder
assert.deepEqual(resolveSectionOrder(undefined), DEFAULT_SECTION_ORDER, 'override yoksa varsayılan tam sıra');
assert.deepEqual(resolveSectionOrder(null), DEFAULT_SECTION_ORDER, 'null da varsayılana düşer');
assert.deepEqual(resolveSectionOrder([]), DEFAULT_SECTION_ORDER, 'boş dizi de varsayılana düşer (sayfa boş kalmasın)');
assert.deepEqual(
  resolveSectionOrder(['features', 'hero']),
  ['features', 'hero'],
  'geçerli özel sıra aynen korunur',
);
assert.deepEqual(
  resolveSectionOrder(['hero', 'not-a-real-section', 'features']),
  ['hero', 'features'],
  'tanınmayan bölüm id\'si elenir',
);
assert.deepEqual(
  resolveSectionOrder(['not-a-real-section']),
  DEFAULT_SECTION_ORDER,
  'hiç geçerli id kalmazsa varsayılana düşülür',
);
assert.deepEqual(
  resolveSectionOrder(['hero']),
  ['hero'],
  'tek bölüm = diğerleri gizli (kısmi sıra desteklenir)',
);

// resolveBanners
const base = [
  { id: 'a', title: 'A Başlık', desc: 'A açıklama', cta: 'A git', image: 'a.png' },
  { id: 'b', title: 'B Başlık', desc: 'B açıklama', cta: 'B git', image: 'b.png' },
];

assert.deepEqual(resolveBanners(base, undefined), base, 'override yoksa base aynen döner');
assert.deepEqual(resolveBanners(base, []), base, 'boş override dizisi de base\'e düşer');

assert.deepEqual(
  resolveBanners(base, [{ id: 'b' }, { id: 'a' }]),
  [base[1], base[0]],
  'yeniden sıralama uygulanır, görsel alanlar (image) base\'ten korunur',
);

assert.deepEqual(
  resolveBanners(base, [{ id: 'a', title: 'Yeni Başlık' }]),
  [{ ...base[0], title: 'Yeni Başlık' }],
  'metin override edilir, diğer alanlar (desc/cta/image) base\'ten korunur; belirtilmeyen banner gizlenir',
);

assert.deepEqual(
  resolveBanners(base, [{ id: 'unknown-id' }]),
  base,
  'yalnızca bilinmeyen id\'ler varsa base\'e düşülür (sayfa boş kalmasın)',
);

assert.deepEqual(
  resolveBanners(base, [{ id: 'a', title: '   ' }]),
  [{ ...base[0] }],
  'boşluktan ibaret override metni yok sayılır, base değeri korunur',
);

console.log('pageContent.test.js: tüm assertion\'lar geçti');
