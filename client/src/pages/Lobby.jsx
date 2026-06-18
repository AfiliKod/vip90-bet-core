import { useEffect, useState, useMemo } from 'react';
import { useEventsStore, groupByLeague } from '../store/eventsStore';
import { SPORT_META } from '../utils/sportMeta';
import LeagueGroup from '../components/LeagueGroup';
import BetSlip from '../components/BetSlip';
import HeroSlider from '../components/HeroSlider';

export default function Lobby() {
  const {
    sport, statusFilter, setStatusFilter,
    events, isLoading, fetchEvents, initSocket, cleanup,
    selectedSport, selectedLeague,
  } = useEventsStore();
  const [openDrawerId, setOpenDrawerId] = useState(null);
  const [search, setSearch] = useState('');
  const [collapsedSports, setCollapsedSports] = useState({});

  useEffect(() => { initSocket(); return cleanup; }, []);
  useEffect(() => { fetchEvents(sport, statusFilter); }, [sport, statusFilter]);

  // Filtreli ve lig-gruplu etkinlikler
  const groupedEvents = useMemo(() => {
    let evs = events;
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
  }, [events, selectedSport, selectedLeague, search]);

  // Spor hiyerarşisi (sadece tüm sporlar gösterildiğinde ve lig filtresi yokken)
  const hierarchicalGroups = useMemo(() => {
    if (selectedSport !== 'all' || selectedLeague) return null;
    let evs = events;
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
    for (const [sport, sportEvs] of sportMap) {
      result.set(sport, groupByLeague(sportEvs));
    }
    return result.size > 0 ? result : null;
  }, [events, selectedSport, selectedLeague, search]);

  function handleToggleDrawer(eventId) {
    setOpenDrawerId(prev => prev === eventId ? null : eventId);
  }

  return (
    <div>
      <HeroSlider />
      <div className="max-w-full px-4 py-4 flex gap-4">
        {/* Ana içerik */}
        <main className="flex-1 min-w-0">
          <div className="flex gap-2 mb-4 items-center flex-wrap">
            {[['', 'Tümü'], ['live', '🔴 Canlı'], ['upcoming', 'Yaklaşan']].map(([v, l]) => (
              <button key={v} onClick={() => setStatusFilter(v)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                  statusFilter === v
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'text-text-3 hover:text-text-2 border border-transparent'
                }`}>
                {l}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Takım veya lig ara..."
              className="ml-auto bg-bg-card border border-white/10 rounded-lg px-3 py-1 text-xs text-text-1 focus:outline-none focus:border-primary/50 w-44"
            />
          </div>

          {isLoading ? (
            <div className="text-center text-text-3 py-16">Yükleniyor...</div>
          ) : (hierarchicalGroups !== null ? hierarchicalGroups.size === 0 : groupedEvents.size === 0) ? (
            <div className="text-center text-text-3 py-16">Etkinlik bulunamadı</div>
          ) : hierarchicalGroups !== null ? (
            <div>
              {[...hierarchicalGroups.entries()].map(([sport, leagueMap]) => {
                const meta = SPORT_META[sport] ?? { icon: '🏆', label: sport };
                const totalCount = [...leagueMap.values()].reduce((n, evs) => n + evs.length, 0);
                const isCollapsed = !!collapsedSports[sport];
                return (
                  <div key={sport} className="mb-2">
                    <button
                      onClick={() => setCollapsedSports(prev => ({ ...prev, [sport]: !prev[sport] }))}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-card border border-white/10 text-sm font-semibold text-text-1 hover:bg-bg-hover transition mb-1"
                    >
                      <span>{meta.icon}</span>
                      <span className="flex-1 text-left">{meta.label}</span>
                      <span className="text-xs text-text-3 font-normal">{totalCount} etkinlik</span>
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
