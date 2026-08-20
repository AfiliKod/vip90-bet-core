import assert from 'node:assert/strict';
import { getChangedEntries, tokenCssVar } from './editorLogic.js';

const tokens = [
  { id: 'primary', cssVar: '--color-primary', value: '#00d4ff', type: 'color' },
  { id: 'accent', cssVar: '--color-accent', value: '#7c3aed', type: 'color' },
  { id: 'radiusMd', cssVar: '--radius-md', value: '0.75rem', type: 'radius' },
];

// getChangedEntries — yalnızca gerçekten değişmiş taslak değerleri döner
assert.deepEqual(
  getChangedEntries(tokens, {}),
  [],
  'boş taslakta değişiklik yok',
);

assert.deepEqual(
  getChangedEntries(tokens, { primary: '#ff0000' }),
  [{ id: 'primary', value: '#ff0000' }],
  'sadece değişen token döner',
);

assert.deepEqual(
  getChangedEntries(tokens, { primary: '#00d4ff' }),
  [],
  'taslak mevcut değerle aynıysa değişiklik sayılmaz',
);

assert.deepEqual(
  getChangedEntries(tokens, { primary: '  #ff0000  ' }),
  [{ id: 'primary', value: '#ff0000' }],
  'baştaki/sondaki boşluk kırpılır',
);

assert.deepEqual(
  getChangedEntries(tokens, { primary: '   ' }),
  [],
  'sadece boşluktan oluşan taslak değişiklik sayılmaz (geçersiz, gönderilmez)',
);

assert.deepEqual(
  getChangedEntries(tokens, { primary: '#ff0000', accent: '#00ff00', radiusMd: '0.75rem' }),
  [{ id: 'primary', value: '#ff0000' }, { id: 'accent', value: '#00ff00' }],
  'birden çok değişiklik, değişmeyenler hariç, tanım sırasında döner',
);

assert.deepEqual(
  getChangedEntries(tokens, { unknownId: '#fff' }),
  [],
  'tanımlı olmayan bir id taslakta olsa bile yok sayılır',
);

// tokenCssVar — id -> cssVar eşlemesi, önizleme enjeksiyonu için
assert.equal(tokenCssVar(tokens, 'primary'), '--color-primary');
assert.equal(tokenCssVar(tokens, 'unknown-id'), null, 'tanımsız id için null döner');

console.log('editorLogic.test.js: tüm assertion\'lar geçti');
