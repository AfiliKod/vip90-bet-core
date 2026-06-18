import { useEffect, useState, useMemo } from 'react';
import { useEventsStore, groupByLeague } from '../store/eventsStore';
import { SPORT_META } from '../utils/sportMeta';
import LeagueGroup from '../components/LeagueGroup';
import BetSlip from '../components/BetSlip';
import HeroSlider from '../components/HeroSlider';

export default function Bahis() {
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

  // Canlı etkinlikler bu sayfada gösterilmez
  const baseEvents = useMemo(() => events.filter(e => e.status !== 'live'), [events]);

  const groupedEvents = useMemo(() => {
    let evs = baseEvents;
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
  }, [baseEvents, selectedSport, selectedLeague, search]);

  const hierarchicalGroups = useMemo(() => {
    if (selectedSport !== 'all' || selectedLeague) return null;
    let evs = baseEvents;
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
  }, [baseEvents, selectedSport, selectedLeague, search]);

  function handleToggleDrawer(eventId) {
    setOpenDrawerId(prev => prev === eventId ? null : eventId);
  }

  return (
    <div>
      <HeroSlider />
      <div className="max-w-full px-4 py-4 flex gap-4">
        <main className="flex-1 min-w-0">
          <div className="flex gap-2 mb-4 items-center flex-wrap">
            {[['', 'Tümü'], ['upcoming', 'Yaklaşanlar']].map(([v, l]) => (
              <button key={v} onClick={() => setStatusFilter(v)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                  statusFilter === v || (v === '' && statusFilter === 'live')
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
