import { test, describe } from 'node:test';
import assert from 'node:assert';
import { buildSummaryTree } from '../src/utils/summaryTree.js';

const ROWS = [
  { sport: 'football', country: 'Türkiye', league: 'Süper Lig', count: 10 },
  { sport: 'football', country: 'England', league: 'Premier League', count: 50 },
  { sport: 'basketball', country: 'USA', league: 'NBA', count: 100 },
  { sport: 'basketball', country: 'Türkiye', league: 'BSL', count: 5 },
];

describe('buildSummaryTree', () => {
  test('varsayılan: football ilk spor, Türkiye ilk ülke (geriye dönük uyumluluk)', () => {
    const { sports } = buildSummaryTree(ROWS);
    assert.strictEqual(sports[0].sport, 'football');
    assert.strictEqual(sports[1].sport, 'basketball');
    const football = sports[0];
    assert.strictEqual(football.leagues[0].country, 'Türkiye');
    assert.strictEqual(football.leagues[1].country, 'England');
  });

  test('override: prioritySport=basketball ise basketball ilk sırada', () => {
    const { sports } = buildSummaryTree(ROWS, { prioritySport: 'basketball' });
    assert.strictEqual(sports[0].sport, 'basketball');
    assert.strictEqual(sports[1].sport, 'football');
  });

  test('override: priorityCountry=USA ise USA ligleri o spor içinde ilk sırada', () => {
    const { sports } = buildSummaryTree(ROWS, { priorityCountry: 'USA' });
    const basketball = sports.find(s => s.sport === 'basketball');
    assert.strictEqual(basketball.leagues[0].country, 'USA');
  });

  test('eşleşen öncelik yoksa (örn. yanlış yazım) count desc sıralamaya düşer', () => {
    const { sports } = buildSummaryTree(ROWS, { prioritySport: 'nonexistent-sport' });
    // Hiçbiri önceliğe uymuyor, ikisi de count'a göre sıralanır: basketball (105) > football (60)
    assert.strictEqual(sports[0].sport, 'basketball');
  });

  test('sport toplam count, o sporun ligleri toplamına eşit', () => {
    const { sports } = buildSummaryTree(ROWS);
    const basketball = sports.find(s => s.sport === 'basketball');
    assert.strictEqual(basketball.count, 105);
  });

  test('league/sport eksik satırlar atlanır', () => {
    const { sports } = buildSummaryTree([...ROWS, { sport: '', country: 'X', league: 'Y', count: 1 }, { sport: 'tennis', country: 'X', league: '', count: 1 }]);
    assert.ok(!sports.some(s => s.sport === '' || s.sport === 'tennis'));
  });
});
