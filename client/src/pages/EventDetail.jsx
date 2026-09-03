import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import BetSlip, { SlipContent } from '../components/BetSlip';
import MatchHero from '../components/MatchHero';
import HomeSidebar from '../components/home/HomeSidebar';
import WinnersPanel from '../components/home/WinnersPanel';
import PromoPanel from '../components/home/PromoPanel';
import { socket } from '../services/socket';
import { groupOddsIntoLines, getTableConfig, formatOdd } from '../utils/oddsUtils';
import { useBetSlipStore } from '../store/betSlipStore';
import { useSettingsStore } from '../store/settingsStore';
import { useOddFlash } from '../hooks/useOddFlash';
import { useEventsStore } from '../store/eventsStore';
import { SPORT_META, sportIconMaterial } from '../utils/sportMeta';
import { SURFACE_CARD_BG, SURFACE_BORDER } from '../styles/surface';
import { useTranslation } from '../i18n';

// Tıklanabilir oran hücresi — oran değişince kısa renk animasyonu
function OddCell({ eventId, eventLabel, marketType, odd }) {
  const oddsFormat = useSettingsStore(s => s.preferences.oddsFormat);
  const { selections, addSelection } = useBetSlipStore();
  const selected = selections.some(
    s => s.eventId === eventId && s.marketType === marketType && s.oddId === odd.id
  );
  const flash = useOddFlash(odd.value);

  return (
    <button
      onClick={() => addSelection({
        eventId, eventLabel, marketType,
        oddId: odd.id, oddLabel: odd.label, oddValue: odd.value,
      })}
      className={`w-full rounded-md py-1.5 text-xs font-bold transition-all duration-300 ${
        flash === 'up'   ? 'bg-green-400/10 text-green-400 ring-1 ring-green-400' :
        flash === 'down' ? 'bg-red-400/10 text-red-400 ring-1 ring-red-400' :
        selected         ? 'bg-primary/25 border border-primary text-primary' :
                           'bg-bg-card border border-white/10 text-cyan-400 hover:border-primary/50'
      }`}
    >
      {formatOdd(odd.value, oddsFormat)}
    </button>
  );
}

/**
 * Tüm market tipleri için tek tablo bileşeni. Üç durum:
 *
 * 1. Çok hatlı + tutarlı başlık (handikap, üstü/altı):
 *    - Başlık satırı: [boş] | Takım A | Takım B
 *    - Veri satırları: hat değeri | oran | oran
 *
 * 2. Tek hatlı (1X2, çifte şans, evet/hayır vb.):
 *    - Başlık satırı: etiket1 | etiket2 | ...
 *    - Tek veri satırı: oran butonları
 *
 * 3. Çok hatlı + tutarsız başlık (maç skoru, korner vb.):
 *    - Başlıksız grid; her hücrede etiket + oran butonu
 */
function MarketTable({ market, eventId, eventLabel }) {
  const lines = groupOddsIntoLines(market);
  if (!lines.length || !lines[0]?.length) return null;

  const tableConfig = lines.length > 1 ? getTableConfig(lines) : null;
  const MAX = 20;
  const visible = lines.slice(0, MAX);
  const ncols = lines[0].length;

  const thCls = 'text-[10px] font-medium text-text-3 text-center pb-1.5 px-1';
  const tdCls = 'py-1 px-0.5 align-middle';
  const rowCls = 'border-b border-white/[0.035] last:border-0';

  // ── Durum 1: çok hatlı + config ──────────────────────────────────────────
  if (tableConfig) {
    const { headers, rowValues } = tableConfig;
    const hasRowVals = rowValues.length > 0 && rowValues.some(v => v);
    return (
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-white/10">
              {hasRowVals && <th className="w-12 pb-1.5" />}
              {headers.map((h, i) => (
                <th key={i} className={thCls}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((line, i) => (
              <tr key={i} className={rowCls}>
                {hasRowVals && (
                  <td className="text-[10px] text-text-3 pr-2 py-1 text-right whitespace-nowrap align-middle w-12 font-mono">
                    {rowValues[i]}
                  </td>
                )}
                {line.map(odd => (
                  <td key={odd.id} className={tdCls}>
                    <OddCell eventId={eventId} eventLabel={eventLabel} marketType={market.type} odd={odd} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {lines.length > MAX && (
          <p className="text-[11px] text-text-3 text-center mt-2">+{lines.length - MAX} hat daha</p>
        )}
      </div>
    );
  }

  // ── Durum 2: tek hatlı — etiketler başlık, değerler tek satır ────────────
  if (lines.length === 1) {
    const line = lines[0];
    return (
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-white/10">
              {line.map(odd => (
                <th key={odd.id} className={thCls}>{odd.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {line.map(odd => (
                <td key={odd.id} className={tdCls}>
                  <OddCell eventId={eventId} eventLabel={eventLabel} marketType={market.type} odd={odd} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  // ── Durum 3: çok hatlı, tutarsız başlık — her hücrede etiket + oran ──────
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse">
        <tbody>
          {visible.map((line, i) => (
            <tr key={i} className={rowCls}>
              {line.map(odd => (
                <td key={odd.id} className={`${tdCls} min-w-[80px]`}>
                  <div className="text-[9px] text-text-3 text-center mb-0.5 truncate">{odd.label}</div>
                  <OddCell eventId={eventId} eventLabel={eventLabel} marketType={market.type} odd={odd} />
                </td>
              ))}
              {/* Eksik hücreler varsa doldur (son satır kısa olabilir) */}
              {Array.from({ length: ncols - line.length }).map((_, j) => (
                <td key={`empty-${j}`} className={tdCls} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {lines.length > MAX && (
        <p className="text-[11px] text-text-3 text-center mt-2">+{lines.length - MAX} hat daha</p>
      )}
    </div>
  );
}

function MarketAccordion({ market, eventId, eventLabel, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const lines = groupOddsIntoLines(market);
  const totalOdds = market.odds?.filter(o => o.isActive !== false).length ?? 0;

  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-bg-card hover:bg-white/[0.04] transition-colors text-left"
      >
        <span className="text-sm font-semibold text-text-1">{market.label}</span>
        <div className="flex items-center gap-2">
          {lines.length > 1 && (
            <span className="text-[10px] text-text-3">{lines.length} hat</span>
          )}
          <span className="text-[10px] text-text-3 opacity-50">{totalOdds} oran</span>
          <span className="text-text-3 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-4 py-3 bg-bg-base">
          <MarketTable
            market={market}
            eventId={eventId}
            eventLabel={eventLabel}
          />
        </div>
      )}
    </div>
  );
}

export default function EventDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);

  const {
    summary, fetchSummary,
    events: liveStoreEvents, fetchEvents, setLeagueFilter,
  } = useEventsStore();

  useEffect(() => {
    api.get(`/events/${id}`)
      .then(r => { setEvent(r.data.event); setLoading(false); })
      .catch(() => setLoading(false));
    socket.connect();
    socket.emit('subscribe:event', { eventId: id });
    socket.on('odds:update', ({ eventId, markets }) => {
      if (eventId === id) setEvent(e => e ? { ...e, markets } : e);
    });
    socket.on('score:update', ({ eventId, score }) => {
      if (eventId === id) setEvent(e => e ? { ...e, liveScore: score } : e);
    });
    return () => {
      socket.emit('unsubscribe:event', { eventId: id });
      socket.off('odds:update');
      socket.off('score:update');
    };
  }, [id]);

  // Sidebar içeriği ziyaret edilen etkinliğin durumuna göre değişir: canlıysa
  // Canlı Bahis'in, yaklaşansa Spor Bahisleri'nin kategori/lig verisi — bu
  // sayfa da 1:1 aynı HomeSidebar kabuğunu kullanıyor.
  const isLive = event?.status === 'live';

  useEffect(() => {
    if (!event) return;
    if (isLive) fetchEvents('all', 'live');
    else fetchSummary('upcoming');
  }, [event?._id, isLive]);

  const liveEvents = useMemo(() => liveStoreEvents.filter(e => e.status === 'live'), [liveStoreEvents]);

  const sportCategories = useMemo(() => {
    if (!event) return [];
    if (isLive) {
      const bySport = new Map();
      for (const ev of liveEvents) {
        if (!ev.sport) continue;
        if (!bySport.has(ev.sport)) bySport.set(ev.sport, 0);
        bySport.set(ev.sport, bySport.get(ev.sport) + 1);
      }
      return [
        { key: 'all', icon: 'apps', label: t('common.all'), badge: liveEvents.length, onClick: () => {}, active: true },
        ...[...bySport.entries()].map(([sport, count]) => ({
          key: sport,
          icon: sportIconMaterial(sport),
          label: (SPORT_META[sport] ?? { label: sport }).label,
          badge: count,
          onClick: () => {},
          active: sport === event.sport,
        })),
      ];
    }
    const totalCount = (summary?.sports || []).reduce((n, s) => n + s.count, 0);
    return [
      { key: 'all', icon: 'apps', label: t('common.all'), badge: totalCount, onClick: () => {}, active: true },
      ...(summary?.sports || []).map(s => ({
        key: s.sport,
        icon: sportIconMaterial(s.sport),
        label: (SPORT_META[s.sport] ?? { label: s.sport }).label,
        badge: s.count,
        onClick: () => {},
        active: s.sport === event.sport,
      })),
    ];
  }, [event, isLive, liveEvents, summary, t]);

  const featuredLeagues = useMemo(() => {
    if (!event) return [];
    if (isLive) {
      const map = new Map();
      for (const ev of liveEvents) {
        if (!ev.sport) continue;
        const key = ev.country ? `${ev.country} > ${ev.league}` : ev.league;
        if (!map.has(key)) map.set(key, { sport: ev.sport, key, count: 0 });
        map.get(key).count++;
      }
      return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 5).map(lg => ({
        key: lg.key,
        label: lg.key.includes(' > ') ? lg.key.split(' > ').at(-1) : lg.key,
        badge: lg.count,
        to: '/canli',
        onClick: () => setLeagueFilter(lg.sport, lg.key),
      }));
    }
    return (summary?.sports || [])
      .flatMap(s => (s.leagues || []).map(lg => ({
        sport: s.sport, country: lg.country, league: lg.league,
        key: lg.country ? `${lg.country} > ${lg.league}` : lg.league,
        count: lg.count,
      })))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(lg => ({
        key: `${lg.sport}:${lg.key}`,
        label: lg.key.includes(' > ') ? lg.key.split(' > ').at(-1) : lg.key,
        badge: lg.count,
        onClick: () => {},
      }));
  }, [event, isLive, liveEvents, summary, setLeagueFilter]);

  const topExtraLink = !isLive && event
    ? { to: '/bahis', icon: 'event', label: t('bahis.upcomingEvents') }
    : undefined;

  if (loading) return <div className="text-center text-text-3 py-16">Yükleniyor...</div>;
  if (!event) return <div className="text-center text-text-3 py-16">Etkinlik bulunamadı</div>;

  const label = `${event.homeTeam.name} vs ${event.awayTeam.name}`;

  return (
    <div className="min-h-full lg:flex lg:gap-5 lg:px-5 lg:pt-5 lg:items-stretch">
      <HomeSidebar categories={sportCategories} topExtraLink={topExtraLink} featuredLeagues={featuredLeagues} />
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="lg:grid lg:grid-cols-[1fr_260px] lg:gap-4 lg:items-start">
          <div className="min-w-0">
            <Link to={isLive ? '/canli' : '/bahis'} className="text-text-3 hover:text-text-1 text-sm mb-4 inline-flex items-center gap-1 transition">
              ← {t('common.back')}
            </Link>

            <MatchHero event={event} />

            {event.markets.length === 0 ? (
              <p className="text-center text-text-3 text-sm py-8">Bu etkinlik için şu an açık bahis bulunmuyor.</p>
            ) : (
              <div className="space-y-2 mt-4">
                {event.markets.map((market, i) => (
                  <MarketAccordion
                    key={market.type + i}
                    market={market}
                    eventId={event._id}
                    eventLabel={label}
                    defaultOpen={i === 0}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="hidden lg:flex lg:flex-col lg:gap-4">
            <WinnersPanel />
            <PromoPanel />
            <div className="rounded-xl overflow-hidden sticky top-20" style={{ background: SURFACE_CARD_BG, border: `1px solid ${SURFACE_BORDER}` }}>
              <SlipContent />
            </div>
          </div>
        </div>

        <BetSlip desktopHidden />
      </div>
    </div>
  );
}
