import assert from 'node:assert/strict';
import { buildSummaryTree } from './summaryTree.js';

const rows = [
  { sport: 'basketball', country: 'ABD', league: 'NBA', count: 12 },
  { sport: 'football', country: 'İngiltere', league: 'Premier Lig', count: 10 },
  { sport: 'football', country: 'Türkiye', league: 'Süper Lig', count: 9 },
  { sport: 'football', country: 'Türkiye', league: '1. Lig', count: 4 },
  { sport: 'football', country: 'İspanya', league: 'La Liga', count: 20 },
];
const tree = buildSummaryTree(rows);

// Futbol her zaman ilk (basketbol count'u tek lig 12; futbol toplam 43)
assert.equal(tree.sports[0].sport, 'football', 'futbol ilk sırada olmalı');
assert.equal(tree.sports[0].count, 43, 'futbol toplam count');
assert.equal(tree.sports[1].sport, 'basketball');

// Futbol ligleri: Türkiye önce (count desc → Süper Lig, 1. Lig), sonra diğerleri count desc (La Liga 20, Premier 10)
const fbLeagues = tree.sports[0].leagues.map(l => l.league);
assert.deepEqual(fbLeagues, ['Süper Lig', '1. Lig', 'La Liga', 'Premier Lig'], 'Türkiye ligleri önce, sonra count desc');

console.log('summaryTree testleri geçti');
