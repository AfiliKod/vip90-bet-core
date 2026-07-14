import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useBetSlipStore } from '../store/betSlipStore';
import { groupOddsIntoLines } from '../utils/oddsUtils';
import { useOddFlash } from '../hooks/useOddFlash';

// Liste isteği (GET /events) sadece 3 market gönderiyor (bkz. server/src/controllers/events.js) —
// drawer açıldığında tüm marketleri görmek için event detayı ayrıca çekilip kısa süre cache'leniyor.
const FULL_EVENT_CACHE_TTL_MS = 5 * 60 * 1000;
const fullEventCache = new Map();

function DrawerOdd({ eventId, eventLabel, market, odd }) {
  const { selections, addSelection } = useBetSlipStore();
  const selected = selections.some(
    s => s.eventId === eventId && s.marketType === market.type && s.oddId === odd.id
  );
  const flash = useOddFlash(odd.value);

  return (
    <button
      onClick={() => addSelection({ eventId, eventLabel, marketType: market.type, oddId: odd.id, oddLabel: odd.label, oddValue: odd.value })}
      className={`flex-1 min-w-[44px] rounded py-1.5 px-1 text-center transition-all duration-300 ${
        flash === 'up' ? 'ring-1 ring-green-400 bg-green-400/10' :
        flash === 'down' ? 'ring-1 ring-red-400 bg-red-400/10' : ''
      } ${
        selected
          ? 'bg-primary/30 border border-primary'
          : 'bg-bg-base border border-white/10 hover:border-primary/40'
      }`}
    >
      <div className="text-[10px] text-text-2 truncate leading-tight font-medium">{odd.label}</div>
      <div className={`text-[12px] font-bold ${
        flash === 'up' ? 'text-green-400' : flash === 'down' ? 'text-red-400' : 'text-cyan-400'
      }`}>
        {odd.value.toFixed(2)}
      </div>
    </button>
  );
}

export default function MarketDrawer({ event }) {
  const label = `${event.homeTeam.name} vs ${event.awayTeam.name}`;
  const isTrimmed = (event.marketsCount ?? event.markets?.length ?? 0) > (event.markets?.length ?? 0);
  const cached = fullEventCache.get(event._id);
  const cachedFresh = cached && cached.expiresAt > Date.now() ? cached.markets : null;
  const [fullMarkets, setFullMarkets] = useState(isTrimmed ? cachedFresh : null);
  const [loading, setLoading] = useState(isTrimmed && !cachedFresh);

  useEffect(() => {
    if (!isTrimmed || cachedFresh) return;
    let cancelled = false;
    setLoading(true);
    api.get(`/events/${event._id}`)
      .then(({ data }) => {
        if (cancelled) return;
        const markets = data.event?.markets ?? [];
        fullEventCache.set(event._id, { markets, expiresAt: Date.now() + FULL_EVENT_CACHE_TTL_MS });
        setFullMarkets(markets);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [event._id, isTrimmed]);

  const markets = fullMarkets ?? event.markets ?? [];
  // maç_sonucu hariç, ilk 6 market
  const shown = markets.filter(m => m.type !== 'maç_sonucu').slice(0, 6);
  const remaining = Math.max(0, markets.length - shown.length - 1);

  if (loading) {
    return (
      <div className="bg-bg-base border-b border-white/5 px-3 py-3 text-center text-[11px] text-text-3">
        Marketler yükleniyor...
      </div>
    );
  }

  return (
    <div className="bg-bg-base border-b border-white/5 px-3 py-3">
      <div className="grid grid-cols-3 gap-2 mb-2">
        {shown.map(market => {
          const lines = groupOddsIntoLines(market);
          // Drawer'da sadece ilk hattı göster (en popüler hat)
          const firstLine = lines[0] ?? [];
          const lineCount = lines.length;
          return (
            <div key={market.type} className="bg-bg-card rounded-lg p-2">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[9px] text-text-3 uppercase tracking-wide truncate flex-1">{market.label}</div>
                {lineCount > 1 && (
                  <div className="text-[8px] text-text-3 ml-1 shrink-0">+{lineCount - 1}</div>
                )}
              </div>
              <div className="flex gap-1">
                {firstLine.map(odd => (
                  <DrawerOdd key={odd.id} eventId={event._id} eventLabel={label} market={market} odd={odd} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {remaining > 0 && (
        <div className="text-center text-[10px] text-text-3">
          +{remaining} market daha —{' '}
          <Link to={`/events/${event._id}`} className="text-primary hover:underline">
            Tümünü gör →
          </Link>
        </div>
      )}
    </div>
  );
}
