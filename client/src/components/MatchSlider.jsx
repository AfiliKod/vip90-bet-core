import { useState, useEffect, useRef, useCallback } from 'react';
import { useEventsStore } from '../store/eventsStore';
import { useBetSlipStore } from '../store/betSlipStore';
import { groupOddsIntoLines } from '../utils/oddsUtils';
import { fetchTeamInfo, resolveTeamColor, buildTeamGradient } from '../utils/matchHeroColors';
import { useTranslation } from '../i18n';

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const today    = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1);
  const day = new Date(dateStr); day.setHours(0,0,0,0);
  const { t } = useTranslation();
  const label = day.getTime() === today.getTime() ? t('sports.today') :
                day.getTime() === tomorrow.getTime() ? t('sports.tomorrow') :
                d.toLocaleDateString('tr-TR', { day:'numeric', month:'short' });
  return `${label}, ${d.toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' })}`;
}

export default function MatchSlider({ statusFilter }) {
  const { events } = useEventsStore();
  const { selections, addSelection } = useBetSlipStore();
  const [active, setActive] = useState(0);
  const [teamColors, setTeamColors] = useState(new Map());
  const intervalRef = useRef(null);
  const { t } = useTranslation();

  const slides = events
    .filter(e => e.status === statusFilter && (statusFilter !== 'upcoming' || e.markets?.some(m => m.type === 'maç_sonucu')))
    .slice(0, 6);

  const slideIds = slides.map(e => e._id).join(',');

  const startTimer = useCallback(() => {
    clearInterval(intervalRef.current);
    if (slides.length < 2) return;
    intervalRef.current = setInterval(() => setActive(i => (i+1) % slides.length), 5000);
  }, [slides.length]);

  useEffect(() => { setActive(0); startTimer(); return () => clearInterval(intervalRef.current); }, [slides.length]);

  // Görünen tüm slaytların takım renklerini önceden çeker (aktif slayt
  // beklenmeden) — otomatik geçişte "önce fallback rengi, sonra gerçek renk"
  // flash'ını önlemek için. fetchTeamInfo kendi hatalarını yutuyor, bu yüzden
  // try/catch gerekmiyor.
  useEffect(() => {
    let cancelled = false;
    const teamNames = new Set();
    for (const e of slides) {
      if (e.homeTeam?.name) teamNames.add(e.homeTeam.name);
      if (e.awayTeam?.name) teamNames.add(e.awayTeam.name);
    }
    Promise.all(
      [...teamNames].map(name => fetchTeamInfo(name).then(info => [name, info.color]))
    ).then(entries => {
      if (!cancelled) setTeamColors(new Map(entries));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideIds]);

  const goTo = i => { setActive(i); startTimer(); };

  if (!slides.length) return null;

  const event   = slides[active] ?? slides[0];
  const market  = event?.markets?.find(m => m.type === 'maç_sonucu') ?? event?.markets?.[0];
  const isLive  = event?.status === 'live';
  const homeColor = resolveTeamColor(event.homeTeam?.name, teamColors.get(event.homeTeam?.name));
  const awayColor = resolveTeamColor(event.awayTeam?.name, teamColors.get(event.awayTeam?.name));
  const gradient   = buildTeamGradient(homeColor, awayColor);

  // maç_sonucu için dedup'lanmış 1/X/2 oranları
  const odds = market ? (groupOddsIntoLines(market)[0] ?? []) : [];

  return (
    <div className="mx-4 mt-4 rounded-2xl overflow-hidden select-none shadow-xl">
      {/* Takım renkleri + overlay katmanı */}
      <div className="relative h-64">
        {/* Arka plan: takımların renklerinden üretilen gradient */}
        <div
          className="absolute inset-0 w-full h-full transition-all duration-700"
          style={{ background: gradient }}
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
              {t('sports.live')} {event.liveScore ? `${event.liveScore.home}–${event.liveScore.away}` : ''}
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
