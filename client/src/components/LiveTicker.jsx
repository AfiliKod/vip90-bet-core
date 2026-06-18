import { useEffect, useState } from 'react';
import api from '../services/api';

export default function LiveTicker() {
  const [events, setEvents] = useState([]);
  useEffect(() => {
    api.get('/events?status=live').then(r => setEvents(r.data.events)).catch(() => {});
  }, []);
  if (!events.length) return null;
  const items = [...events, ...events];
  return (
    <div className="bg-danger/10 border-b border-danger/20 overflow-hidden h-8 flex items-center">
      <span className="shrink-0 bg-danger text-white text-xs font-bold px-3 py-1 h-full flex items-center">🔴 CANLI</span>
      <div className="overflow-hidden flex-1">
        <div className="flex gap-8 animate-marquee whitespace-nowrap px-4">
          {items.map((e, i) => (
            <span key={i} className="text-sm text-text-1">
              {e.homeTeam.name}
              <span className="text-danger font-bold mx-1">{e.liveScore.home}-{e.liveScore.away}</span>
              {e.awayTeam.name}
              <span className="text-text-3 ml-2">{e.liveScore.minute}'</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
