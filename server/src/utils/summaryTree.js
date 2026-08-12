// Kaynağın "market"/etkinlik özet ağacını sıralar.
// rows: [{ sport, country, league, count }]
// Kural: futbol her zaman ilk (sonra count desc); spor içinde Türkiye ligleri
// önce (count desc), sonra diğer ülkeler (count desc).
const FOOTBALL = 'football';
const TURKEY = 'Türkiye';

export function buildSummaryTree(rows) {
  const sportMap = new Map();
  for (const r of rows) {
    if (!r.sport || !r.league) continue;
    if (!sportMap.has(r.sport)) sportMap.set(r.sport, { sport: r.sport, count: 0, leagues: [] });
    const s = sportMap.get(r.sport);
    s.count += r.count;
    s.leagues.push({ country: r.country || '', league: r.league, count: r.count });
  }
  const sports = [...sportMap.values()];
  for (const s of sports) {
    s.leagues.sort((a, b) => {
      const at = a.country === TURKEY ? 0 : 1;
      const bt = b.country === TURKEY ? 0 : 1;
      if (at !== bt) return at - bt;
      return b.count - a.count;
    });
  }
  sports.sort((a, b) => {
    const af = a.sport === FOOTBALL ? 0 : 1;
    const bf = b.sport === FOOTBALL ? 0 : 1;
    if (af !== bf) return af - bf;
    return b.count - a.count;
  });
  return { sports };
}
