import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useBetSlipStore } from '../store/betSlipStore';
import { formatOdd } from '../utils/oddsUtils';
import { useSettingsStore } from '../store/settingsStore';
import { sportIcon } from '../utils/sportMeta';
import { translateTeam } from '../utils/i18n';

// Desktop: time teams 1 X 2 | Alt Üst Top +N
export const ROW_GRID        = '52px 1fr 56px 56px 56px 4px 56px 56px 56px 36px';
// Mobile:  time teams 1 X 2 +N  (Alt/Üst/Handikap gizli)
export const ROW_GRID_MOBILE = '40px 1fr 48px 48px 48px 28px';

export function useIsMobile() {
  const [m, setM] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const h = () => setM(window.innerWidth < 640);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return m;
}

function OddCell({ eventId, eventLabel, market, targetLabel, fallbackIndex, showLabel }) {
  const oddsFormat = useSettingsStore(s => s.preferences.oddsFormat);
  const { selections, addSelection } = useBetSlipStore();
  const odd = market?.odds?.find(o => o.label === targetLabel)
    ?? (fallbackIndex != null ? market?.odds?.[fallbackIndex] : undefined);
  if (!odd) return <div />;
  const selected = selections.some(
    s => s.eventId === eventId && s.marketType === market.type && s.oddId === odd.id
  );
  return (
    <button
      onClick={e => { e.stopPropagation(); addSelection({ eventId, eventLabel, marketType: market.type, oddId: odd.id, oddLabel: odd.label, oddValue: odd.value }); }}
      className={`w-full py-1.5 rounded text-xs font-bold transition-all ${
        selected
          ? 'bg-primary/30 border border-primary text-primary'
          : 'bg-bg-base border border-white/10 text-cyan-400 hover:border-primary/50'
      }`}
    >
      {showLabel && (
        <span className="block text-[9px] text-text-3 font-normal leading-none mb-0.5 truncate w-full text-center">{odd.label}</span>
      )}
      {formatOdd(odd.value, oddsFormat)}
    </button>
  );
}

export default function EventRow({ event, isDrawerOpen, onToggleDrawer }) {
  const isMobile = useIsMobile();
  const lang = useSettingsStore(s => s.preferences.language);
  const locale = lang === 'en' ? 'en-GB' : 'tr-TR';
  const homeName = translateTeam(event.homeTeam.name, lang);
  const awayName = translateTeam(event.awayTeam.name, lang);
  const label = `${homeName} vs ${awayName}`;
  const isLive = event.status === 'live';
  const mainMarket     = event.markets?.find(m => m.type === 'maç_sonucu') ?? event.markets?.[0];
  const ouMarket       = event.markets?.find(m => m.type === 'alt_üst');
  const handikapMarket = event.markets?.find(m => m.type === 'handikap');
  const extraCount = Math.max(0, (event.markets?.length ?? 0) - 1);
  const date = new Date(event.startTime);
  const dateStr = date.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
  const timeStr = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const grid = isMobile ? ROW_GRID_MOBILE : ROW_GRID;

  return (
    <div
      className={`grid items-center border-b border-white/5 transition-colors hover:bg-white/[0.02] ${isDrawerOpen ? 'bg-white/[0.03]' : ''}`}
      style={{ gridTemplateColumns: grid, gap: '3px', padding: '6px 10px' }}
    >
      {/* Zaman */}
      <div className="text-center">
        {isLive ? (
          <span className="flex flex-col items-center gap-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            {event.liveScore?.scope ? (
              <span className="text-[9px] font-bold text-red-400 leading-tight break-all w-full text-center px-0.5">
                {event.liveScore.scope}
              </span>
            ) : (
              <span className="text-[10px] font-bold text-red-400">
                {event.liveScore?.minute ?? 0}'
              </span>
            )}
          </span>
        ) : (
          <>
            <span className="block text-[9px] text-text-3">{dateStr}</span>
            <span className="block text-[10px] text-text-2 font-semibold">{timeStr}</span>
          </>
        )}
        <span className="block text-[10px] mt-0.5" title={event.sport}>{sportIcon(event.sport)}</span>
      </div>

      {/* Takımlar */}
      <Link to={`/events/${event._id}`} className="min-w-0" onClick={e => e.stopPropagation()}>
        <span className="block text-[11px] font-medium text-text-1 truncate hover:text-primary transition">
          {homeName}
          {isLive && event.liveScore && <span className="ml-1 text-red-400 font-bold">{event.liveScore.home}</span>}
        </span>
        <span className="block text-[11px] text-text-3 truncate hover:text-primary transition">
          {awayName}
          {isLive && event.liveScore && <span className="ml-1 text-red-400 font-bold">{event.liveScore.away}</span>}
        </span>
      </Link>

      {/* 1 / X / 2 */}
      <OddCell eventId={event._id} eventLabel={label} market={mainMarket} targetLabel="1" fallbackIndex={0} />
      <OddCell eventId={event._id} eventLabel={label} market={mainMarket} targetLabel="X" fallbackIndex={1} />
      <OddCell eventId={event._id} eventLabel={label} market={mainMarket} targetLabel="2" fallbackIndex={2} />

      {/* Mobilde gizli: Ayraç + Alt/Üst + Handikap */}
      {!isMobile && <div className="h-8 w-px bg-white/10 mx-auto" />}
      {!isMobile && <OddCell eventId={event._id} eventLabel={label} market={ouMarket} targetLabel="Under" fallbackIndex={1} showLabel />}
      {!isMobile && <OddCell eventId={event._id} eventLabel={label} market={ouMarket} targetLabel="Over"  fallbackIndex={0} showLabel />}
      {!isMobile && <OddCell eventId={event._id} eventLabel={label} market={handikapMarket} fallbackIndex={0} showLabel />}

      {/* +N */}
      <button
        onClick={onToggleDrawer}
        className={`text-[10px] font-semibold text-center transition-colors ${isDrawerOpen ? 'text-primary' : 'text-purple-400 hover:text-primary'}`}
      >
        {isDrawerOpen ? '▲' : `+${extraCount}`}
      </button>
    </div>
  );
}
