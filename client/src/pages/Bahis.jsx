import { useEffect, useState, useMemo } from 'react';
import { useEventsStore, groupByLeague } from '../store/eventsStore';
import { SPORT_META } from '../utils/sportMeta';
import MiniEventCard from '../components/MiniEventCard';
import LeagueGroup from '../components/LeagueGroup';
import BetSlip from '../components/BetSlip';
import HeroSlider from '../components/HeroSlider';
import { BRAND_GRADIENT_H } from '../styles/brand';

function SearchInput({ value, onChange, placeholder = 'Takım veya lig ara...' }) {
  return (
    <div className="relative group w-full sm:w-64">
      <div
        className="absolute inset-0 rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: BRAND_GRADIENT_H, padding: '1px', WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude' }}
      />
      <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-cyan-400" style={{ color: '#4a5a78' }}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
      </span>
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="relative w-full rounded-xl pl-10 pr-9 py-2.5 text-sm outline-none transition-all backdrop-blur-sm font-medium"
        style={{ background: '#0c1220aa', border: '1px solid #ffffff14', color: '#f0f4ff' }}
        onFocus={e => {
          e.currentTarget.style.background = '#0c1220ee';
          e.currentTarget.style.boxShadow = '0 0 16px #00d4ff33, 0 0 24px #7c3aed22';
        }}
        onBlur={e => {
          e.currentTarget.style.background = '#0c1220aa';
          e.currentTarget.style.boxShadow = 'none';
        }}
      />
      {value && (
        <button
          onClick={() => onChange({ target: { value: '' } })}
          className="absolute right-3 top-1/2 -translate-y-1/2 leading-none transition-colors hover:text-cyan-400"
          style={{ color: '#4a5a78' }}
        >
          ×
        </button>
      )}
    </div>
  );
}

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
    return sportMap.size > 0 ? sportMap : null;
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
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  statusFilter === v || (v === '' && statusFilter === 'live')
                    ? 'text-black'
                    : 'text-text-2 hover:text-text-1 border border-white/10 hover:border-[#00d4ff44]'
                }`}
                style={statusFilter === v || (v === '' && statusFilter === 'live') ? {
                  background: 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)',
                  boxShadow: '0 0 16px #00d4ff55, 0 0 24px #7c3aed33',
                } : {}}>
                {l}
              </button>
            ))}
            <SearchInput
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Takım veya lig ara..."
            />
          </div>

          {isLoading ? (
            <div className="text-center text-text-3 py-16">Yükleniyor...</div>
          ) : (hierarchicalGroups !== null ? hierarchicalGroups.size === 0 : groupedEvents.size === 0) ? (
            <div className="text-center text-text-3 py-16">Etkinlik bulunamadı</div>
          ) : hierarchicalGroups !== null ? (
            <div>
              {[...hierarchicalGroups.entries()].map(([s, sportEvents]) => {
                const meta = SPORT_META[s] ?? { icon: '🏆', label: s };
                const totalCount = sportEvents.length;
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
                      <div className="flex flex-col gap-2 ml-2">
                        {sportEvents.map(ev => (
                          <MiniEventCard
                            key={ev._id}
                            event={ev}
                            live={ev.status === 'live'}
                            accent="#00d4ff"
                            bgColor="#111d30"
                            onExtraClick={() => handleToggleDrawer(ev._id)}
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
                  accent="#00d4ff"
                  bgColor="#111d30"
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