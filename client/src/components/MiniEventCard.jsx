import { useNavigate } from 'react-router-dom';
import { useBetSlipStore } from '../store/betSlipStore';
import { useSettingsStore } from '../store/settingsStore';
import { sportIcon } from '../utils/sportMeta';
import { formatOdd, pickMainLine } from '../utils/oddsUtils';
import { BRAND_GRADIENT, BRAND_GLOW } from '../styles/brand';
import { useOddFlash } from '../hooks/useOddFlash';

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function MiniOddButton({ eventId, eventLabel, odd, label, smallLabel, marketType, accent }) {
  // Hook çağrıları erken return'den ÖNCE — odd bazı event'lerde tanımsız olabilir
  // (örn. handikapOdd), bu yüzden erken return hook çağrılarından sonra olursa
  // React "Rendered fewer hooks than expected" hatası verir (Rules of Hooks).
  const oddsFormat = useSettingsStore(s => s.preferences.oddsFormat);
  const { selections, addSelection } = useBetSlipStore();
  const flash = useOddFlash(odd?.value);
  if (!odd) return <div className="flex-1" />;
  const selected = selections.some(s => s.eventId === eventId && s.marketType === marketType && s.oddId === odd.id);
  return (
    <button
      onClick={e => { e.stopPropagation(); addSelection({ eventId, eventLabel, marketType, oddId: odd.id, oddLabel: odd.label, oddValue: odd.value }); }}
      className={`flex-1 py-2 rounded-lg text-center transition-all hover:scale-105 active:scale-95 ${
        selected ? 'text-black scale-[1.03]' : ''
      } ${
        flash === 'up' ? 'ring-1 ring-green-400' : flash === 'down' ? 'ring-1 ring-red-400' : ''
      }`}
      style={selected ? {
        background: BRAND_GRADIENT,
        boxShadow: BRAND_GLOW,
        border: '1px solid #00d4ff66',
      } : {
        background: flash === 'up' ? 'rgba(74,222,128,0.12)' : flash === 'down' ? 'rgba(248,113,113,0.12)' : hexToRgba(accent, 0.08),
        border: `1px solid ${flash === 'up' ? 'rgba(74,222,128,0.3)' : flash === 'down' ? 'rgba(248,113,113,0.3)' : hexToRgba(accent, 0.15)}`,
      }}
    >
      <span className={`block text-[9px] font-bold uppercase tracking-wide ${selected ? 'text-black/70' : 'text-text-3'}`}>{smallLabel || label}</span>
      <span className={`block text-xs font-black ${
        selected ? 'text-black' : flash === 'up' ? 'text-green-400' : flash === 'down' ? 'text-red-400' : ''
      }`} style={selected || flash ? {} : { color: accent }}>{formatOdd(odd.value, oddsFormat)}</span>
    </button>
  );
}

export default function MiniEventCard({ event, live, onExtraClick, accent: accentProp, bgColor }) {
  const navigate = useNavigate();
  const lang = useSettingsStore(s => s.preferences.language);
  const locale = lang === 'en' ? 'en-GB' : 'tr-TR';

  const mainMarket = event.markets?.find(m => m.type === 'maç_sonucu') ?? event.markets?.[0];
  const ouMarket = event.markets?.find(m => m.type === 'alt_üst');
  const handikapMarket = event.markets?.find(m => m.type === 'handikap');

  const odd1 = mainMarket?.odds?.find(o => o.label === '1') || mainMarket?.odds?.[0];
  const oddX = mainMarket?.odds?.find(o => o.label === 'X') || mainMarket?.odds?.[1];
  const odd2 = mainMarket?.odds?.find(o => o.label === '2') || mainMarket?.odds?.[2];
  // Çok-hatlı marketlerde ilk hat değil, kaynağın öne çıkardığı DENGELİ ana hat.
  const ouMain = pickMainLine(ouMarket);       // [Üst, Alt]
  const ouOver = ouMain?.[0];
  const ouUnder = ouMain?.[1];
  const handikapOdd = pickMainLine(handikapMarket)?.[0];

  const hasValidOdds = (odd1?.value ?? 0) > 0 || (oddX?.value ?? 0) > 0 || (odd2?.value ?? 0) > 0;
  if (!hasValidOdds) return null;

  const extraCount = Math.max(0, (event.marketsCount ?? event.markets?.length ?? 0) - 1);
  const accent = accentProp || (live ? '#ef4444' : '#00d4ff');
  const eventLabel = `${event.homeTeam?.name} vs ${event.awayTeam?.name}`;

  const date = new Date(event.startTime);
  const dateStr = date.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
  const timeStr = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-200 active:scale-[0.98]"
      style={{
        background: bgColor || `linear-gradient(135deg, ${hexToRgba(accent, 0.06)} 0%, ${hexToRgba(accent, 0.02)} 100%)`,
        border: `1px solid ${hexToRgba(accent, 0.12)}`,
      }}
    >
      <div className="p-3">
        <div className="flex items-center gap-1.5 mb-2">
          {live ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.6)]" />
              <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">
                Canlı {event.liveScore?.minute || ''}'
              </span>
            </>
          ) : (
            <span className="text-[10px] font-bold text-text-2">
              {dateStr} {timeStr}
            </span>
          )}
          <span className="text-[10px] text-text-3 ml-auto">{sportIcon(event.sport)} {event.league}</span>
        </div>

        <button onClick={() => navigate(`/events/${event._id}`)} className="w-full mb-2.5">
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-bold text-text-1 truncate flex-1 text-left">{event.homeTeam?.name}</span>
            {live && event.liveScore ? (
              <span className="text-[13px] font-black text-red-400 shrink-0">{event.liveScore.home}-{event.liveScore.away}</span>
            ) : (
              <span className="text-[11px] font-bold text-text-4 shrink-0">vs</span>
            )}
            <span className="text-[13px] font-bold text-text-2 truncate flex-1 text-right">{event.awayTeam?.name}</span>
          </div>
        </button>

        <div className="flex items-center gap-1.5">
          {[
            { odd: odd1, label: '1' },
            { odd: oddX, label: 'X' },
            { odd: odd2, label: '2' },
          ].map((item, i) => (
            <MiniOddButton key={i} eventId={event._id} eventLabel={eventLabel} odd={item.odd} label={item.label} marketType={mainMarket?.type} accent={accent} />
          ))}

          <div className="w-px h-8 bg-white/10 mx-1 shrink-0" />

          {ouUnder || handikapOdd || ouOver ? (
            <>
              <MiniOddButton eventId={event._id} eventLabel={eventLabel} odd={ouUnder} label="Alt" smallLabel="Alt" marketType={ouMarket?.type} accent={accent} />
              <MiniOddButton eventId={event._id} eventLabel={eventLabel} odd={handikapOdd} label="Toplam" smallLabel="Toplam" marketType={handikapMarket?.type} accent={accent} />
              <MiniOddButton eventId={event._id} eventLabel={eventLabel} odd={ouOver} label="Üst" smallLabel="Üst" marketType={ouMarket?.type} accent={accent} />
            </>
          ) : (
            <div className="flex-1" />
          )}

          <button
            onClick={e => { e.stopPropagation(); onExtraClick ? onExtraClick() : navigate(`/events/${event._id}`); }}
            className="shrink-0 w-9 h-9 rounded-lg text-center transition-all hover:scale-105 active:scale-95 flex items-center justify-center"
            style={{
              background: hexToRgba(accent, 0.08),
              border: `1px solid ${hexToRgba(accent, 0.15)}`,
            }}
          >
            <span className="text-[10px] font-black" style={{ color: accent }}>+{extraCount}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
