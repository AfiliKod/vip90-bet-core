import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useBetSlipStore } from '../store/betSlipStore';
import { formatOdd, pickMainLine } from '../utils/oddsUtils';
import { useFormatters } from '../i18n/useFormatters.jsx';
import { useSettingsStore } from '../store/settingsStore';
import { sportIcon } from '../utils/sportMeta';
import { translateTeam } from '../utils/i18n';
import { BRAND_GRADIENT, BRAND_GLOW } from '../styles/brand';

export const ROW_GRID        = '64px 1fr 60px 60px 60px 6px 60px 60px 60px 40px';
export const ROW_GRID_MOBILE = '48px 1fr 56px 56px 56px 36px';

export function useIsMobile() {
  const [m, setM] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const h = () => setM(window.innerWidth < 640);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return m;
}

function OddCell({ eventId, eventLabel, market, targetLabel, fallbackIndex, oddOverride, showLabel }) {
  const oddsFormat = useSettingsStore(s => s.preferences.oddsFormat);
  const { selections, addSelection } = useBetSlipStore();
  // oddOverride verilmişse (ör. çok-hatlı marketin ana hattı) onu kullan; yoksa
  // etiketle bul, o da yoksa fallback index'e düş.
  const odd = oddOverride
    ?? market?.odds?.find(o => o.label === targetLabel)
    ?? (fallbackIndex != null ? market?.odds?.[fallbackIndex] : undefined);
  if (!odd) return <div />;
  const selected = selections.some(
    s => s.eventId === eventId && s.marketType === market.type && s.oddId === odd.id
  );
  return (
    <button
      onClick={e => { e.stopPropagation(); addSelection({ eventId, eventLabel, marketType: market.type, oddId: odd.id, oddLabel: odd.label, oddValue: odd.value }); }}
      className={`relative w-full min-h-[44px] py-2 px-1 rounded-lg text-sm transition-all duration-200 overflow-hidden ${
        selected
          ? 'text-black scale-[1.03]'
          : 'bg-bg-base border border-white/10 text-cyan-400 hover:border-[#00d4ff66] hover:shadow-[0_0_12px_rgba(0,212,255,0.25)] hover:-translate-y-0.5'
      }`}
      style={selected ? {
        background: BRAND_GRADIENT,
        boxShadow: BRAND_GLOW,
        border: '1px solid #00d4ff66',
      } : {}}
    >
      {showLabel && (
        <span className={`block text-[10px] font-bold leading-none mb-1 truncate w-full text-center uppercase tracking-wide ${selected ? 'text-black/70' : 'text-text-3'}`}>{odd.label}</span>
      )}
      <span className="font-black block">{formatOdd(odd.value, oddsFormat)}</span>
    </button>
  );
}

export default function EventRow({ event, isDrawerOpen, onToggleDrawer }) {
  const isMobile = useIsMobile();
  const lang = useSettingsStore(s => s.preferences.language);
  const fmt = useFormatters();
  const homeName = translateTeam(event.homeTeam.name, lang);
  const awayName = translateTeam(event.awayTeam.name, lang);
  const label = `${homeName} vs ${awayName}`;
  const isLive = event.status === 'live';
  const mainMarket     = event.markets?.find(m => m.type === 'maç_sonucu') ?? event.markets?.[0];
  const ouMarket       = event.markets?.find(m => m.type === 'alt_üst');
  const handikapMarket = event.markets?.find(m => m.type === 'handikap');
  // Çok-hatlı marketlerde ilk hat değil, kaynağın öne çıkardığı DENGELİ ana hat gösterilir.
  const ouMain = pickMainLine(ouMarket);         // [Üst, Alt] ana hat
  const hMain  = pickMainLine(handikapMarket);   // [ev, deplasman] ana hat
  // Kaynağın gösterdiği tam market sayısı (benzersiz market_id) — grup değil.
  const extraCount = Math.max(0, (event.marketCount || event.marketsCount || event.markets?.length || 0) - 1);
  const dateStr = fmt.formatDate(event.startTime);
  const timeStr = fmt.formatTime(event.startTime);
  const grid = isMobile ? ROW_GRID_MOBILE : ROW_GRID;

  return (
    <div
      className={`grid items-center border-b border-white/5 transition-all hover:bg-white/[0.04] ${isDrawerOpen ? 'bg-white/[0.05]' : ''}`}
      style={{ gridTemplateColumns: grid, gap: '4px', padding: '10px 12px' }}
    >
      {/* Zaman */}
      <div className="text-center">
        {isLive ? (
          <span className="flex flex-col items-center gap-0.5">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
            {event.liveScore?.scope ? (
              <span className="text-[10px] font-black text-red-400 leading-tight break-all w-full text-center px-0.5">
                {event.liveScore.scope}
              </span>
            ) : (
              <span className="text-[11px] font-black text-red-400">
                {event.liveScore?.minute ?? 0}'
              </span>
            )}
          </span>
        ) : (
          <>
            <span className="block text-[10px] text-text-3 font-semibold">{dateStr}</span>
            <span className="block text-[12px] text-text-2 font-black">{timeStr}</span>
          </>
        )}
        <span className="block text-sm mt-1" title={event.sport}>{sportIcon(event.sport)}</span>
      </div>

      {/* Takımlar */}
      <Link to={`/events/${event._id}`} className="min-w-0" onClick={e => e.stopPropagation()}>
        <span className="block text-[13px] font-black text-text-1 truncate hover:text-cyan-400 transition">
          {homeName}
          {isLive && event.liveScore && <span className="ml-1.5 text-red-400 font-black">{event.liveScore.home}</span>}
        </span>
        <span className="block text-[13px] font-bold text-text-1 truncate hover:text-cyan-400 transition">
          {awayName}
          {isLive && event.liveScore && <span className="ml-1.5 text-red-400 font-black">{event.liveScore.away}</span>}
        </span>
      </Link>

      {/* 1 / X / 2 */}
      <OddCell eventId={event._id} eventLabel={label} market={mainMarket} targetLabel="1" fallbackIndex={0} />
      <OddCell eventId={event._id} eventLabel={label} market={mainMarket} targetLabel="X" fallbackIndex={1} />
      <OddCell eventId={event._id} eventLabel={label} market={mainMarket} targetLabel="2" fallbackIndex={2} />

      {/* Mobilde gizli: Ayraç + Alt/Üst + Handikap */}
      {!isMobile && <div className="h-10 w-px bg-white/10 mx-auto" />}
      {!isMobile && <OddCell eventId={event._id} eventLabel={label} market={ouMarket} oddOverride={ouMain?.[1]} showLabel />}
      {!isMobile && <OddCell eventId={event._id} eventLabel={label} market={ouMarket} oddOverride={ouMain?.[0]} showLabel />}
      {!isMobile && <OddCell eventId={event._id} eventLabel={label} market={handikapMarket} oddOverride={hMain?.[0]} showLabel />}

      {/* +N */}
      <button
        onClick={onToggleDrawer}
        className={`text-[12px] font-black text-center transition-all px-2 py-1.5 rounded-lg ${
          isDrawerOpen ? 'text-black' : 'text-purple-400 hover:text-cyan-400 hover:bg-[#00d4ff14]'
        }`}
        style={isDrawerOpen ? { background: BRAND_GRADIENT, boxShadow: BRAND_GLOW } : {}}
      >
        {isDrawerOpen ? '▲' : `+${extraCount}`}
      </button>
    </div>
  );
}