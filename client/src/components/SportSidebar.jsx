import { useState } from 'react';
import { useEventsStore } from '../store/eventsStore';
import { SPORT_META, sportLabel } from '../utils/sportMeta';
import { useSettingsStore } from '../store/settingsStore';
import { translateLeagueKey } from '../utils/i18n';

const SPORT_ORDER = [
  'football', 'basketball', 'tennis', 'volleyball', 'icehockey',
  'handball', 'boxing', 'baseball', 'americanfootball', 'rugby',
  'mma', 'golf', 'cricket', 'snooker', 'darts', 'waterpolo', 'futsal', 'esports',
];

export default function SportSidebar({ sportLeagueMap }) {
  const { selectedSport, selectedLeague, setSportFilter, setLeagueFilter } = useEventsStore();
  const [expanded, setExpanded] = useState({ [selectedSport]: true });
  const lang = useSettingsStore(s => s.preferences.language);

  function toggleSport(sport) {
    setExpanded(prev => ({ ...prev, [sport]: !prev[sport] }));
  }

  const sports = Object.keys(sportLeagueMap).sort((a, b) => {
    const ia = SPORT_ORDER.indexOf(a);
    const ib = SPORT_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return (
    <nav className="w-60 shrink-0 bg-bg-card border border-white/10 rounded-xl overflow-hidden self-start sticky top-4">
      {/* Tümü */}
      <button
        onClick={() => setSportFilter('all')}
        className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold transition-colors border-b border-white/5 ${
          selectedSport === 'all' ? 'bg-primary/20 text-primary' : 'text-text-2 hover:bg-white/[0.04]'
        }`}
      >
        🏆 <span>{lang === 'en' ? 'All Sports' : 'Tüm Sporlar'}</span>
        <span className="ml-auto text-[10px] text-text-3">
          {Object.values(sportLeagueMap).reduce((n, leagues) => n + Object.values(leagues).reduce((m, evs) => m + evs.length, 0), 0)}
        </span>
      </button>

      {sports.map(sport => {
        const meta = { label: sportLabel(sport, lang), icon: SPORT_META[sport]?.icon ?? '🎯' };
        const leagues = sportLeagueMap[sport] ?? {};
        const isOpen = !!expanded[sport];
        const isActiveSport = selectedSport === sport;
        const totalCount = Object.values(leagues).reduce((n, evs) => n + evs.length, 0);

        return (
          <div key={sport} className="border-b border-white/5 last:border-0">
            <button
              onClick={() => { toggleSport(sport); setSportFilter(sport); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold transition-colors ${
                isActiveSport && !selectedLeague ? 'bg-primary/20 text-primary' : 'text-text-1 hover:bg-white/[0.04]'
              }`}
            >
              <span>{meta.icon}</span>
              <span className="flex-1 text-left">{meta.label}</span>
              <span className="text-[10px] text-text-3">{totalCount}</span>
              <span className="text-[10px] text-text-3">{isOpen ? '▾' : '▸'}</span>
            </button>

            {isOpen && (
              <div className="bg-bg-base">
                <button
                  onClick={() => setSportFilter(sport)}
                  className={`w-full flex items-center gap-2 pl-7 pr-3 py-1.5 text-[11px] transition-colors ${
                    isActiveSport && !selectedLeague ? 'text-primary' : 'text-text-3 hover:text-text-2'
                  }`}
                >
                  — {lang === 'en' ? 'All' : 'Tümü'}
                </button>
                {Object.entries(leagues).sort(([, a], [, b]) => b.length - a.length).map(([league, evs]) => (
                  <button
                    key={league}
                    onClick={() => setLeagueFilter(sport, league)}
                    className={`w-full flex items-center gap-1 pl-7 pr-3 py-1.5 text-[11px] transition-colors text-left ${
                      selectedLeague === league && selectedSport === sport
                        ? 'bg-primary/10 text-primary'
                        : 'text-text-3 hover:text-text-2'
                    }`}
                  >
                    <span className="flex-1 truncate">{translateLeagueKey(league, lang)}</span>
                    <span className="text-[10px] shrink-0">{evs.length}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
