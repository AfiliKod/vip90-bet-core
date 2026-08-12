import { useState, useEffect } from 'react';
import { useEventsStore, leagueKey } from '../store/eventsStore';
import MiniEventCard from './MiniEventCard';

export default function LazyLeagueGroup({ sport, country, league, count, status = 'upcoming', defaultOpen = false, onExtraClick }) {
  const [open, setOpen] = useState(defaultOpen);
  const key = leagueKey(sport, country, league);
  const events = useEventsStore(s => s.leagueEvents.get(key));
  const loading = useEventsStore(s => s.loadingLeagues.has(key));
  const fetchLeague = useEventsStore(s => s.fetchLeague);

  // Açıkken ve maçlar henüz yokken çek (defaultOpen için de çalışır)
  useEffect(() => {
    if (open && !events && !loading) fetchLeague(sport, country, league, status);
  }, [open, events, loading, sport, country, league, status, fetchLeague]);

  const title = country ? `${country} > ${league}` : league;
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-card border border-white/10 text-sm font-medium text-text-1 hover:bg-bg-hover transition"
      >
        <span className="flex-1 text-left truncate">{title}</span>
        <span className="text-xs text-text-3 font-normal">{count} etkinlik</span>
        <span className="text-xs text-text-3">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 ml-2 mt-1">
          {loading && !events ? (
            <div className="text-xs text-text-3 py-2 px-2">Yükleniyor...</div>
          ) : events && events.length === 0 ? (
            <div className="text-xs text-text-3 py-2 px-2">Bu ligde açık bahis yok.</div>
          ) : (
            (events || []).map(ev => (
              <MiniEventCard
                key={ev._id}
                event={ev}
                live={false}
                accent="#00d4ff"
                bgColor="#111d30"
                onExtraClick={() => onExtraClick?.(ev._id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
