import { useEffect, useState, useMemo } from 'react';
import { useEventsStore, groupByLeague } from '../store/eventsStore';
import { SPORT_META } from '../utils/sportMeta';
import LeagueGroup from '../components/LeagueGroup';
import BetSlip from '../components/BetSlip';

export default function Live() {
  const {
    events, isLoading, fetchEvents, initSocket, cleanup,
    selectedSport, selectedLeague,
  } = useEventsStore();
  const [openDrawerId, setOpenDrawerId] = useState(null);
  const [search, setSearch] = useState('');
  const [collapsedSports, setCollapsedSports] = useState({});

  useEffect(() => {
    initSocket();
    fetchEvents('all', 'live');
    return cleanup;
  }, []);

  const liveEvents = useMemo(() => events.filter(e => e.status === 'live'), [events]);

  const groupedEvents = useMemo(() => {
    let evs = liveEvents;
    if (selectedSport !== 'all') evs = evs.filter(e => e.sport === selectedSport);
    if (selectedLeague) evs = evs.filter(e => {
      const key = e.country ? `${e.country} > ${e.league}` : e.league;
      return key === selectedLeague;
    });
    if (search.trim()) {
      const q = search.toLowerCase();
      evs = evs.filter(e =>
        e.homeTeam.name.toLowerCase().includes(q) ||
        e.awayTeam.name.toLowerCase().includes(q) ||
        e.league.toLowerCase().includes(q)
      );
    }
    return groupByLeague(evs);
  }, [liveEvents, selectedSport, selectedLeague, search]);

  const hierarchicalGroups = useMemo(() => {
    if (selectedSport !== 'all' || selectedLeague) return null;
    let evs = liveEvents;
    if (search.trim()) {
      const q = search.toLowerCase();
      evs = evs.filter(e =>
        e.homeTeam.name.toLowerCase().includes(q) ||
        e.awayTeam.name.toLowerCase().includes(q) ||
        e.league.toLowerCase().includes(q)
      );
    }
    const sportMap = new Map();
    for (const ev of evs) {
      if (!ev.sport) continue;
      if (!sportMap.has(ev.sport)) sportMap.set(ev.sport, []);
      sportMap.get(ev.sport).push(ev);
    }
    const result = new Map();
    for (const [s, sportEvs] of sportMap) {
      result.set(s, groupByLeague(sportEvs));
    }
    return result.size > 0 ? result : null;
  }, [liveEvents, selectedSport, selectedLeague, search]);

  function handleToggleDrawer(eventId) {
    setOpenDrawerId(prev => prev === eventId ? null : eventId);
  }

  return (
    <div className="max-w-full px-4 py-4">
      {/* Başlık */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-live animate-pulse shrink-0" />
          <h1 className="text-base font-bold text-text-1">Canlı Bahis</h1>
          {liveEvents.length > 0 && (
            <span className="text-[11px] bg-live/15 text-live px-2 py-0.5 rounded-full font-semibold border border-live/20">
              {liveEvents.length} maç
            </span>
          )}
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Takım veya lig ara..."
          className="ml-auto bg-bg-card border border-white/10 rounded-lg px-3 py-1 text-xs text-text-1 focus:outline-none focus:border-primary/50 w-44"
        />
      </div>

      <div className="flex gap-4">
        <main className="flex-1 min-w-0">
          {isLoading ? (
            <div className="text-center text-text-3 py-16">Yükleniyor...</div>
          ) : (hierarchicalGroups !== null ? hierarchicalGroups.size === 0 : groupedEvents.size === 0) ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-text-3">
              <span className="text-5xl opacity-40">🔴</span>
              <p className="text-sm font-medium">Şu an canlı maç bulunmuyor</p>
              <p className="text-xs opacity-60">Maçlar başladığında burada görünecek</p>
            </div>
          ) : hierarchicalGroups !== null ? (
            <div>
              {[...hierarchicalGroups.entries()].map(([s, leagueMap]) => {
                const meta = SPORT_META[s] ?? { icon: '🏆', label: s };
                const totalCount = [...leagueMap.values()].reduce((n, evs) => n + evs.length, 0);
                const isCollapsed = !!collapsedSports[s];
                return (
                  <div key={s} className="mb-2">
                    <button
                      onClick={() => setCollapsedSports(prev => ({ ...prev, [s]: !prev[s] }))}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-card border border-white/10 text-sm font-semibold text-text-1 hover:bg-bg-hover transition mb-1"
                    >
                      <span>{meta.icon}</span>
                      <span className="flex-1 text-left">{meta.label}</span>
                      <span className="text-xs text-text-3 font-normal">{totalCount} maç</span>
                      <span className="text-xs text-text-3">{isCollapsed ? '▸' : '▾'}</span>
                    </button>
                    {!isCollapsed && (
                      <div className="ml-2">
                        {[...leagueMap.entries()].map(([league, evs]) => (
                          <LeagueGroup
                            key={league}
                            league={league}
                            leagueFlag={evs[0]?.leagueFlag ?? '🏆'}
                            events={evs}
                            openDrawerId={openDrawerId}
                            onToggleDrawer={handleToggleDrawer}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              {[...groupedEvents.entries()].map(([league, evs]) => (
                <LeagueGroup
                  key={league}
                  league={league}
                  leagueFlag={evs[0]?.leagueFlag ?? '🏆'}
                  events={evs}
                  openDrawerId={openDrawerId}
                  onToggleDrawer={handleToggleDrawer}
                />
              ))}
            </div>
          )}
        </main>

        <BetSlip />
      </div>
    </div>
  );
}
