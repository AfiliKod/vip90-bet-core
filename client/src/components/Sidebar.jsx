import { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEventsStore } from '../store/eventsStore';
import { useSettingsStore } from '../store/settingsStore';
import { SPORT_META } from '../utils/sportMeta';
import { BRAND_GRADIENT, BRAND_GLOW } from '../styles/brand';

const SPORT_ORDER = [
  'football', 'basketball', 'tennis', 'volleyball', 'icehockey',
  'handball', 'boxing', 'baseball', 'americanfootball', 'rugby',
  'mma', 'golf', 'cricket', 'snooker', 'darts', 'waterpolo', 'futsal', 'esports',
];

export default function Sidebar() {
  const {
    events,
    selectedSport, selectedLeague,
    setSportFilter, setLeagueFilter,
  } = useEventsStore();

  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isLivePage = pathname === '/canli';

  const favoriteSports = useSettingsStore(s => s.preferences.favoriteSports);

  const sportLeagueMap = {};
  for (const ev of events) {
    if (!ev.sport) continue;
    const key = ev.country ? `${ev.country} > ${ev.league}` : ev.league;
    if (!sportLeagueMap[ev.sport]) sportLeagueMap[ev.sport] = {};
    if (!sportLeagueMap[ev.sport][key]) sportLeagueMap[ev.sport][key] = [];
    sportLeagueMap[ev.sport][key].push(ev);
  }

  const liveCount = events.filter(e => e.status === 'live').length;

  const allSportsInEvents = Object.keys(sportLeagueMap);
  const orderedSports = SPORT_ORDER.filter(s => sportLeagueMap[s]);
  const unorderedSports = allSportsInEvents.filter(s => !SPORT_ORDER.includes(s)).sort();
  const sports = [...orderedSports, ...unorderedSports]
    .sort((a, b) => {
      const aFav = favoriteSports.includes(a) ? -1 : 0;
      const bFav = favoriteSports.includes(b) ? -1 : 0;
      return aFav - bFav;
    });

  const [expanded, setExpanded] = useState(
    Object.fromEntries(sports.map(s => [s, s === selectedSport]))
  );

  function toggleSport(sport) {
    setExpanded(prev => ({ ...prev, [sport]: !prev[sport] }));
  }

  return (
    <aside className="hidden md:flex w-[200px] shrink-0 bg-bg-base border-r border-white/10 flex-col overflow-y-auto">

      <div className="px-3 pt-4 pb-1">
        <button
          onClick={() => navigate('/canli')}
          className={`relative w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-all overflow-hidden ${
            isLivePage
              ? 'text-white'
              : 'text-text-2 hover:bg-[#00d4ff14] hover:text-text-1'
          }`}
          style={isLivePage ? {
            background: 'linear-gradient(90deg, #ef444422 0%, #7c3aed22 100%)',
            boxShadow: 'inset 2px 0 0 #ef4444',
          } : {}}
        >
          <span className="w-5 text-center text-sm">🔴</span>
          <span className="flex-1 text-left font-bold">Canlı</span>
          {liveCount > 0 && (
            <span className="bg-live text-white rounded-full px-1.5 py-px text-[10px] font-bold min-w-[18px] text-center shadow-[0_0_8px_rgba(239,68,68,0.6)]">
              {liveCount}
            </span>
          )}
        </button>

        {/* Tümü */}
        <button
          onClick={() => { setSportFilter('all'); if (isLivePage) navigate('/'); }}
          className={`relative w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-all overflow-hidden mt-1 ${
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
            {events.length}
          </span>
        </button>
      </div>

      {/* Spor kategorileri + ligler */}
      <div className="px-3 pb-1">
        {sports.map(sport => {
          const meta = SPORT_META[sport];
          const leagues = sportLeagueMap[sport];
          const totalCount = Object.values(leagues).reduce((n, evs) => n + evs.length, 0);
          const isActive = selectedSport === sport && !selectedLeague;
          const isOpen = !!expanded[sport];

          return (
            <div key={sport}>
              <button
                onClick={() => { toggleSport(sport); setSportFilter(sport); }}
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
                  {Object.entries(leagues)
                    .sort(([, a], [, b]) => b.length - a.length)
                    .slice(0, 8)
                    .map(([league, evs]) => {
                      const isLeagueActive = selectedLeague === league && selectedSport === sport;
                      return (
                        <button
                          key={league}
                          onClick={() => setLeagueFilter(sport, league)}
                          className={`w-full flex items-center gap-1 py-[5px] px-1.5 rounded text-[10px] transition text-left ${
                            isLeagueActive
                              ? 'text-cyan-400 font-bold bg-[#00d4ff14] border border-[#00d4ff44]'
                              : 'text-text-3 hover:text-text-2'
                          }`}
                        >
                          <span className="flex-1 truncate">
                            {league.includes(' > ')
                              ? <><span className="text-text-3 opacity-60">{league.split(' > ').slice(0,-1).join(' › ')} › </span>{league.split(' > ').at(-1)}</>
                              : league}
                          </span>
                          <span className="shrink-0 text-[9px]">{evs.length}</span>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
      </div>

    </aside>
  );
}