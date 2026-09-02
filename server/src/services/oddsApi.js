/* ============================================================
   The Odds API — veri çekme ve VIP90.bet şemasına dönüştürme
   ============================================================ */

const BASE_URL = 'https://api.the-odds-api.com/v4';

// Hangi sporları senkronize edeceğiz
const SPORTS_TO_SYNC = [
  { key: 'basketball_nba',                    sport: 'basketball', league: 'NBA',                    flag: '🇺🇸' },
  { key: 'basketball_wnba',                   sport: 'basketball', league: 'WNBA',                   flag: '🇺🇸' },
  { key: 'tennis_atp_french_open',            sport: 'tennis',     league: 'Roland Garros (ATP)',    flag: '🎾' },
  { key: 'tennis_wta_french_open',            sport: 'tennis',     league: 'Roland Garros (WTA)',    flag: '🎾' },
  { key: 'soccer_conmebol_copa_libertadores', sport: 'football',   league: 'Copa Libertadores',      flag: '🌎' },
  { key: 'soccer_conmebol_copa_sudamericana', sport: 'football',   league: 'Copa Sudamericana',      flag: '🌎' },
  { key: 'soccer_brazil_serie_b',             sport: 'football',   league: 'Brezilya Serie B',       flag: '🇧🇷' },
  { key: 'soccer_norway_eliteserien',         sport: 'football',   league: 'Eliteserien',            flag: '🇳🇴' },
  { key: 'soccer_sweden_allsvenskan',         sport: 'football',   league: 'Allsvenskan',            flag: '🇸🇪' },
  { key: 'soccer_spain_segunda_division',     sport: 'football',   league: 'La Liga 2',              flag: '🇪🇸' },
  { key: 'soccer_japan_j_league',             sport: 'football',   league: 'J League',               flag: '🇯🇵' },
  { key: 'soccer_chile_campeonato',           sport: 'football',   league: 'Primera División (Şili)',flag: '🇨🇱' },
  { key: 'mma_mixed_martial_arts',            sport: 'mma',        league: 'MMA',                    flag: '🥊' },
  { key: 'icehockey_nhl',                     sport: 'icehockey',  league: 'NHL',                    flag: '🏒' },
];

async function apiFetch(path) {
  const url = `${BASE_URL}${path}${path.includes('?') ? '&' : '?'}apiKey=${process.env.ODDS_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body.message || body.error_code || res.statusText;
    const err = new Error(`Odds API hatası: ${res.status} — ${msg}`);
    if (body.error_code === 'OUT_OF_USAGE_CREDITS') err.quotaExceeded = true;
    throw err;
  }
  return res.json();
}

/* En güvenilir bahisçiden oranı al — önce Betfair, sonra ilk bulunan */
function pickBestOdds(bookmakers, marketKey) {
  const priority = ['pinnacle', 'betfair_ex_eu', 'williamhill', 'bet365', 'unibet_eu'];
  for (const key of priority) {
    const bm = bookmakers.find(b => b.key === key);
    const market = bm?.markets.find(m => m.key === marketKey);
    if (market) return market.outcomes;
  }
  // Herhangi birinden al
  for (const bm of bookmakers) {
    const market = bm.markets.find(m => m.key === marketKey);
    if (market) return market.outcomes;
  }
  return null;
}

/* API event → VIP90.bet Market formatı */
function buildMarkets(bookmakers) {
  const markets = [];

  // Maç Sonucu (h2h)
  const h2hOutcomes = pickBestOdds(bookmakers, 'h2h');
  if (h2hOutcomes) {
    markets.push({
      type: 'maç_sonucu',
      label: 'Maç Sonucu',
      odds: h2hOutcomes.map(o => ({
        id: o.name.toLowerCase().replace(/\s+/g, '_').substring(0, 20),
        label: o.name,
        value: +o.price.toFixed(2),
        isActive: true,
      })),
    });
  }

  // Alt/Üst (totals)
  const totalsOutcomes = pickBestOdds(bookmakers, 'totals');
  if (totalsOutcomes && totalsOutcomes.length >= 2) {
    const point = totalsOutcomes[0]?.point;
    markets.push({
      type: 'alt_üst',
      label: `Alt/Üst ${point || ''}`,
      odds: totalsOutcomes.map(o => ({
        id: o.name === 'Over' ? 'üst' : 'alt',
        label: `${o.name === 'Over' ? 'Üst' : 'Alt'} ${o.point || ''}`.trim(),
        value: +o.price.toFixed(2),
        isActive: true,
      })),
    });
  }

  return markets;
}

/* Tüm senkronize edilecek sporların etkinliklerini çek */
export async function fetchAllEvents() {
  const results = [];

  for (const sport of SPORTS_TO_SYNC) {
    try {
      const events = await apiFetch(
        `/sports/${sport.key}/odds?regions=eu&markets=h2h,totals&oddsFormat=decimal&dateFormat=iso`
      );

      for (const e of events) {
        if (!e.bookmakers?.length) continue;

        const markets = buildMarkets(e.bookmakers);
        if (!markets.length) continue;

        results.push({
          externalId: e.id,
          sport: sport.sport,
          league: sport.league,
          leagueFlag: sport.flag,
          homeTeam: { name: e.home_team, country: '' },
          awayTeam: { name: e.away_team, country: '' },
          startTime: new Date(e.commence_time),
          status: 'upcoming',
          markets,
        });
      }

      console.log(`  ${sport.league}: ${events.length} events`);
    } catch (e) {
      if (e.quotaExceeded) throw e;
      console.error(`  ${sport.league} error:`, e.message);
    }
  }

  return results;
}

/* Tek bir spor için güncel oranları çek (periyodik güncelleme) */
export async function fetchOddsForSport(sportKey) {
  return apiFetch(
    `/sports/${sportKey}/odds?regions=eu&markets=h2h,totals&oddsFormat=decimal&dateFormat=iso`
  );
}

export { SPORTS_TO_SYNC, buildMarkets };
