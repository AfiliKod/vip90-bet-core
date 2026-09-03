import { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEventsStore } from '../store/eventsStore';
import { useSettingsStore } from '../store/settingsStore';
import { SPORT_META } from '../utils/sportMeta';
import { useFormatters } from '../i18n/useFormatters.jsx';
import { BRAND_GRADIENT, BRAND_GLOW } from '../styles/brand';
import { SURFACE_CARD_BG, SURFACE_BORDER } from '../styles/surface';

const SPORT_ORDER = [
  'football', 'basketball', 'tennis', 'volleyball', 'icehockey',
  'handball', 'boxing', 'baseball', 'americanfootball', 'rugby',
  'mma', 'golf', 'cricket', 'snooker', 'darts', 'waterpolo', 'futsal', 'esports',
];

export default function Sidebar() {
  const fmt = useFormatters();
  const {
    events,
    summary,
    selectedSport, selectedLeague,
    setSportFilter, setLeagueFilter,
    setFocusLeague,
  } = useEventsStore();

  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isLivePage = pathname === '/canli';

  const favoriteSports = useSettingsStore(s => s.preferences.favoriteSports);

  // Bahis (ve genel) sayfalar: ağacı summary'den besle. Live sayfası: eski events davranışı.
  const useSummaryTree = !isLivePage && !!summary;

  // ── Summary ağacı ───────────────────────────────────────────
  // sportLeagueMap[sport] = { label, count, leagues: [{ key, country, league, count }] }
  const summarySportMap = {};
  if (useSummaryTree) {
    for (const s of summary.sports) {
      summarySportMap[s.sport] = {
        count: s.count,
        leagues: (s.leagues || []).map(lg => ({
          key: lg.country ? `${lg.country} > ${lg.league}` : lg.league,
          country: lg.country,
          league: lg.league,
          count: lg.count,
        })),
      };
    }
  }

  // ── Events ağacı (Live) ─────────────────────────────────────
  const sportLeagueMap = {};
  if (!useSummaryTree) {
    for (const ev of events) {
      if (!ev.sport) continue;
      const key = ev.country ? `${ev.country} > ${ev.league}` : ev.league;
      if (!sportLeagueMap[ev.sport]) sportLeagueMap[ev.sport] = {};
      if (!sportLeagueMap[ev.sport][key]) sportLeagueMap[ev.sport][key] = [];
      sportLeagueMap[ev.sport][key].push(ev);
    }
  }

  // Sport sırası. Summary modunda summary'nin verdiği sıra (futbol+Türkiye önce) korunur;
  // events modunda mevcut SPORT_ORDER + favori sıralaması.
  let sports;
  if (useSummaryTree) {
    sports = summary.sports.map(s => s.sport);
  } else {
    const allSportsInEvents = Object.keys(sportLeagueMap);
    const orderedSports = SPORT_ORDER.filter(s => sportLeagueMap[s]);
    const unorderedSports = allSportsInEvents.filter(s => !SPORT_ORDER.includes(s)).sort();
    sports = [...orderedSports, ...unorderedSports]
      .sort((a, b) => {
        const aFav = favoriteSports.includes(a) ? -1 : 0;
        const bFav = favoriteSports.includes(b) ? -1 : 0;
        return aFav - bFav;
      });
  }

  const [expanded, setExpanded] = useState(
    Object.fromEntries(sports.map(s => [s, s === selectedSport]))
  );

  // "Tümü" rozeti sayacı.
  const totalBadge = useSummaryTree
    ? summary.sports.reduce((n, s) => n + s.count, 0)
    : events.length;

  // Popüler Ligler (top 5).
  const topLeagues = useSummaryTree
    ? summary.sports.flatMap(s => (s.leagues || []).map(lg => ({
        sport: s.sport,
        country: lg.country,
        league: lg.league,
        key: lg.country ? `${lg.country} > ${lg.league}` : lg.league,
        count: lg.count,
      }))).sort((a, b) => b.count - a.count).slice(0, 5)
    : Object.entries(sportLeagueMap).flatMap(([sport, leagues]) =>
        Object.entries(leagues).map(([league, evs]) => ({ sport, league, key: league, evs, count: evs.length }))
      ).sort((a, b) => b.count - a.count).slice(0, 5);

  // Önemli Maçlar: summary modunda maç verisi yok → gizle.
  const importantEvents = useSummaryTree
    ? []
    : events
        .filter(e => e.status === 'live' || e.status === 'upcoming')
        .sort((a, b) => a.status === 'live' ? -1 : 1)
        .slice(0, 4);

  function toggleSport(sport) {
    setExpanded(prev => ({ ...prev, [sport]: !prev[sport] }));
  }

  // Lig tıklaması: summary modunda Bahis'te aç/scroll, events modunda filtre.
  function onLeagueClick({ sport, country, league }) {
    if (useSummaryTree) {
      setFocusLeague({ sport, country, league });
      if (pathname !== '/bahis') navigate('/bahis');
    } else {
      setLeagueFilter(sport, league);
    }
  }

  return (
    <aside
      className="hidden md:flex w-[200px] shrink-0 rounded-xl flex-col overflow-y-auto"
      style={{ background: SURFACE_CARD_BG, border: `1px solid ${SURFACE_BORDER}` }}
    >

      <div className="px-3 pt-4 pb-1">
        {/* Tümü */}
        <button
          onClick={() => { setSportFilter('all'); }}
          className={`relative w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-all overflow-hidden ${
            selectedSport === 'all' && !isLivePage
              ? 'text-black'
              : 'text-text-2 hover:bg-[#00d4ff14] hover:text-text-1'
          }`}
          style={selectedSport === 'all' && !isLivePage ? {
            background: BRAND_GRADIENT,
            boxShadow: BRAND_GLOW,
          } : {}}
        >
          <span className="w-5 text-center text-sm">🏆</span>
          <span className="flex-1 text-left font-bold">Tümü</span>
          <span className="bg-bg-hover text-text-3 rounded-full px-1.5 py-px text-[10px] min-w-[18px] text-center">
            {totalBadge}
          </span>
        </button>
      </div>

      {/* Spor kategorileri + ligler */}
      <div className="px-3">
        {sports.map(sport => {
          const meta = SPORT_META[sport] ?? { icon: '🏆', label: sport };
          // Ortak lig listesi: { key, country, league, count }
          const leagueList = useSummaryTree
            ? summarySportMap[sport].leagues
            : Object.entries(sportLeagueMap[sport])
                .map(([league, evs]) => ({ key: league, country: null, league, count: evs.length }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 8);
          const totalCount = useSummaryTree
            ? summarySportMap[sport].count
            : Object.values(sportLeagueMap[sport]).reduce((n, evs) => n + evs.length, 0);
          const isActive = selectedSport === sport && !selectedLeague;
          const isOpen = !!expanded[sport];

          return (
            <div key={sport}>
              <button
                onClick={() => { toggleSport(sport); if (!useSummaryTree) setSportFilter(sport); }}
                className={`relative w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-all overflow-hidden mt-1 ${
                  isActive
                    ? 'text-black'
                    : 'text-text-2 hover:bg-[#00d4ff14] hover:text-text-1'
                }`}
                style={isActive ? {
                  background: BRAND_GRADIENT,
                  boxShadow: BRAND_GLOW,
                } : {}}
              >
                <span className="w-5 text-center text-sm">{meta.icon}</span>
                {favoriteSports.includes(sport) && <span className="text-[8px]">⭐</span>}
                <span className="flex-1 text-left font-bold">{meta.label}</span>
                <span className="bg-bg-hover text-text-3 rounded-full px-1.5 py-px text-[10px] min-w-[18px] text-center">
                  {totalCount}
                </span>
                <span className="text-[9px] text-text-3">{isOpen ? '▾' : '▸'}</span>
              </button>

              {/* Lig listesi */}
              {isOpen && (
                <div className="ml-5 border-l border-white/10 pl-2 mb-1">
                  {leagueList.map(lg => {
                    const isLeagueActive = !useSummaryTree && selectedLeague === lg.key && selectedSport === sport;
                    return (
                      <button
                        key={lg.key}
                        onClick={() => onLeagueClick({ sport, country: lg.country, league: lg.league })}
                        className={`w-full flex items-center gap-1 py-[5px] px-1.5 rounded text-[10px] transition text-left ${
                          isLeagueActive
                            ? 'text-cyan-400 font-bold bg-[#00d4ff14] border border-[#00d4ff44]'
                            : 'text-text-3 hover:text-text-2'
                        }`}
                      >
                        <span className="flex-1 truncate">
                          {lg.key.includes(' > ')
                            ? <><span className="text-text-3 opacity-60">{lg.key.split(' > ').slice(0,-1).join(' › ')} › </span>{lg.key.split(' > ').at(-1)}</>
                            : lg.key}
                        </span>
                        <span className="shrink-0 text-[9px]">{lg.count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-3 pb-3 mt-2 border-t border-white/5 pt-3">
        {topLeagues.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-2 mb-2 px-2">Popüler Ligler</p>
            {topLeagues.map(({ sport, country, league, key, count }) => {
              const meta = SPORT_META[sport] ?? { icon: '🏆', label: sport };
              const isActive = !useSummaryTree && selectedLeague === key && selectedSport === sport;
              return (
                <button
                  key={`${sport}:${key}`}
                  onClick={() => onLeagueClick({ sport, country: country ?? null, league })}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition text-left ${
                    isActive
                      ? 'text-cyan-400 font-bold bg-[#00d4ff14] border border-[#00d4ff44]'
                      : 'text-text-2 hover:bg-[#00d4ff14]'
                  }`}
                >
                  <span className="text-sm">{meta.icon}</span>
                  <span className="flex-1 truncate font-semibold">
                    {key.includes(' > ')
                      ? <span>{key.split(' > ').at(-1)}</span>
                      : key}
                  </span>
                  <span className="shrink-0 text-[11px] text-text-3 font-bold">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {importantEvents.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-2 mb-2 px-2">Önemli Maçlar</p>
            {importantEvents.map(ev => {
              const isLive = ev.status === 'live';
              const meta = SPORT_META[ev.sport] ?? { icon: '🏆', label: ev.sport };
              const timeStr = fmt.formatTime(ev.startTime);
              return (
                <button
                  key={ev._id}
                  onClick={() => navigate(`/events/${ev._id}`)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition text-left text-text-2 hover:bg-[#00d4ff14]"
                >
                  <span className="text-sm shrink-0">{meta.icon}</span>
                  <span className="flex-1 truncate">
                    <span className="text-text-1 font-semibold">{ev.homeTeam?.name}</span>
                    <span className="text-text-3 mx-1">vs</span>
                    <span className="text-text-2">{ev.awayTeam?.name}</span>
                  </span>
                  {isLive ? (
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0 shadow-[0_0_6px_rgba(239,68,68,0.6)]" />
                  ) : (
                    <span className="text-[11px] text-text-3 font-bold shrink-0">{timeStr}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

    </aside>
  );
}