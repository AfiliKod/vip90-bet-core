import assert from 'node:assert/strict';
import { filterAndOrderByCodes } from './featuredOrder.js';

const games = [
  { game_code: 'a', title: 'A' },
  { game_code: 'b', title: 'B' },
  { game_code: 'c', title: 'C' },
];

assert.deepEqual(filterAndOrderByCodes(games, []), [], 'boş kod listesi boş sonuç verir');
assert.deepEqual(filterAndOrderByCodes(games, undefined), [], 'undefined kod listesi boş sonuç verir');

assert.deepEqual(
  filterAndOrderByCodes(games, ['c', 'a']),
  [games[2], games[0]],
  'yalnızca listedeki oyunlar, verilen sırayla döner',
);

assert.deepEqual(
  filterAndOrderByCodes(games, ['x', 'a', 'y']),
  [games[0]],
  'kataloğda olmayan kodlar sessizce elenir',
);

assert.deepEqual(
  filterAndOrderByCodes(games, ['a', 'a']),
  [games[0]],
  'tekrar eden kod tek sonuç üretir (filter, kod başına en fazla bir eşleşme bulur)',
);

console.log('featuredOrder.test.js: tüm assertion\'lar geçti');
