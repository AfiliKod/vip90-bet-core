import { useState, useEffect, useRef, useCallback } from 'react';
import { useEventsStore } from '../store/eventsStore';
import { useBetSlipStore } from '../store/betSlipStore';
import { groupOddsIntoLines } from '../utils/oddsUtils';

const SPORT_IMAGES = {
  football:   ['photo-1508098682722-e99c43a406b2', 'photo-1574629810360-7efbbe195018', 'photo-1522778119026-d647f0596c20', 'photo-1553778263-73a83bab9b0c'],
  basketball: ['photo-1546519638-68e109498ffc', 'photo-1504450758481-7338eba7524a'],
  tennis:     ['photo-1554068865-24cecd4e34b8', 'photo-1599474924187-334a4ae5bd3c'],
  volleyball: ['photo-1612872087720-bb876e2e67d1'],
  icehockey:  ['photo-1580748141549-71748dbe0bdc'],
  golf:       ['photo-1535131749006-b7f58c99034b'],
  handball:   ['photo-1612872087720-bb876e2e67d1'],
  boxing:     ['photo-1552674605-db6ffd4facb5'],
};

function getImageUrl(sport, seed = 0) {
  const arr = SPORT_IMAGES[sport] ?? SPORT_IMAGES.football;
  const id  = arr[seed % arr.length];
  return `https://images.unsplash.com/${id}?w=1200&h=400&fit=crop&q=80`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const today    = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1);
  const day = new Date(dateStr); day.setHours(0,0,0,0);
  const label = day.getTime() === today.getTime() ? 'Bugün' :
                day.getTime() === tomorrow.getTime() ? 'Yarın' :
                d.toLocaleDateString('tr-TR', { day:'numeric', month:'short' });
  return `${label}, ${d.toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' })}`;
}

export default function HeroSlider() {
  const { events } = useEventsStore();
  const { selections, addSelection } = useBetSlipStore();
  const [active, setActive] = useState(0);
  const intervalRef = useRef(null);

  const slides = [
    ...events.filter(e => e.status === 'live'),
    ...events.filter(e => e.status === 'upcoming' && e.markets?.some(m => m.type === 'maç_sonucu')),
  ].slice(0, 6);

  const startTimer = useCallback(() => {
    clearInterval(intervalRef.current);
    if (slides.length < 2) return;
    intervalRef.current = setInterval(() => setActive(i => (i+1) % slides.length), 5000);
  }, [slides.length]);

  useEffect(() => { setActive(0); startTimer(); return () => clearInterval(intervalRef.current); }, [slides.length]);

  const goTo = i => { setActive(i); startTimer(); };

  if (!slides.length) return null;

  const event   = slides[active] ?? slides[0];
  const market  = event?.markets?.find(m => m.type === 'maç_sonucu') ?? event?.markets?.[0];
  const isLive  = event?.status === 'live';
  const imgUrl  = getImageUrl(event?.sport, active);

  // maç_sonucu için dedup'lanmış 1/X/2 oranları
  const odds = market ? (groupOddsIntoLines(market)[0] ?? []) : [];

  return (
    <div className="mx-4 mt-4 rounded-2xl overflow-hidden select-none shadow-xl">
      {/* Fotoğraf + overlay katmanı */}
      <div className="relative h-52">
        {/* Arka plan fotoğrafı */}
        <img
          src={imgUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-all duration-700"
          style={{ filter: 'brightness(0.85) saturate(1.15)' }}
        />

        {/* Gradient: sol/alt karartma, sağ taraf açık */}
        <div
          className="absolute inset-0"
          style={{
            background: [
              'linear-gradient(to right, rgba(4,8,20,0.92) 0%, rgba(4,8,20,0.6) 40%, rgba(4,8,20,0.15) 70%, transparent 100%)',
              'linear-gradient(to top, rgba(4,8,20,0.85) 0%, transparent 50%)',
            ].join(', '),
          }}
        />

        {/* Üst solda: CANLI badge */}
        {isLive && (
          <div className="absolute top-4 left-5 z-10">
            <span className="flex items-center gap-1.5 bg-red-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              CANLI {event.liveScore ? `${event.liveScore.home}–${event.liveScore.away}` : ''}
            </span>
          </div>
        )}

        {/* Sol alt: tarih + maç bilgisi */}
        <div className="absolute bottom-5 left-5 z-10 max-w-[55%]">
          {!isLive && (
            <p className="text-[10px] text-white/60 font-medium mb-1 uppercase tracking-widest">
              {formatDate(event.startTime)}
            </p>
          )}
          <h2 className="text-xl font-extrabold text-white leading-tight mb-1 drop-shadow">
            {event.homeTeam?.name} × {event.awayTeam?.name}
          </h2>
          <p className="text-[11px] text-white/55 font-medium truncate">
            {event.leagueFlag} {event.league}
          </p>
        </div>

        {/* Ok tuşları */}
        {slides.length > 1 && (
          <>
            <button onClick={() => goTo((active - 1 + slides.length) % slides.length)}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-black/30 backdrop-blur-sm border border-white/20 text-white hover:bg-black/50 transition text-lg">
              ‹
            </button>
            <button onClick={() => goTo((active + 1) % slides.length)}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-black/30 backdrop-blur-sm border border-white/20 text-white hover:bg-black/50 transition text-lg">
              ›
            </button>
          </>
        )}
      </div>

      {/* Alt şerit: oran butonları */}
      {odds.length > 0 && (
        <div className="bg-bg-card border-t border-white/5 grid divide-x divide-white/5"
          style={{ gridTemplateColumns: `repeat(${odds.length}, 1fr)` }}>
          {odds.map(odd => {
            const selected = selections.some(
              s => s.eventId === event._id && s.marketType === market.type && s.oddId === odd.id
            );
            return (
              <button
                key={odd.id}
                onClick={() => addSelection({
                  eventId: event._id,
                  eventLabel: `${event.homeTeam?.name} × ${event.awayTeam?.name}`,
                  marketType: market.type,
                  oddId: odd.id,
                  oddLabel: odd.label,
                  oddValue: odd.value,
                })}
                className={`flex flex-col items-center py-3 gap-0.5 transition-colors ${
                  selected ? 'bg-primary/20 text-primary' : 'hover:bg-white/[0.04] text-text-1'
                }`}
              >
                <span className="text-[10px] text-text-3 font-medium">{odd.label}</span>
                <span className={`text-base font-bold ${selected ? 'text-primary' : ''}`}>
                  {odd.value.toFixed(2)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Dots */}
      {slides.length > 1 && (
        <div className="flex justify-center gap-1.5 py-2 bg-bg-card border-t border-white/5">
          {slides.map((_, i) => (
            <button key={i} onClick={() => goTo(i)}
              className={`h-[3px] rounded-full transition-all ${i === active ? 'w-6 bg-accent' : 'w-2 bg-bg-hover'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
