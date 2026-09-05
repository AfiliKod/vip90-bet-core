import { useState, useEffect, useMemo } from 'react';
import { useEventsStore, leagueKey } from '../store/eventsStore';
import MiniEventCard from './MiniEventCard';
import { SURFACE_CARD_BG, SURFACE_BORDER } from '../styles/surface';
import { hasDisplayableOdds } from '../utils/oddsUtils';
import { useTranslation } from '../i18n';

export default function LazyLeagueGroup({ sport, country, league, count, status = 'upcoming', defaultOpen = false, forceOpenSignal, onExtraClick }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const key = leagueKey(sport, country, league);

  // Dışarıdan (Sidebar lig tıklaması → Bahis focusLeague) gelen sinyalle aç.
  useEffect(() => { if (forceOpenSignal) setOpen(true); }, [forceOpenSignal]);
  const rawEvents = useEventsStore(s => s.leagueEvents.get(key));
  // `count` prop sunucudan (özet toplamı) geliyor, oranı olmayan etkinlikleri
  // de sayıyor — MiniEventCard onları hiç render etmiyor. Boş-durum mesajını
  // ham değil, FİLTRELENMİŞ listeye göre göster; aksi halde "N etkinlik"
  // yazıp altı sessizce boş kalan hayalet gruplar oluşuyor.
  const events = useMemo(() => rawEvents?.filter(hasDisplayableOdds), [rawEvents]);
  const loading = useEventsStore(s => s.loadingLeagues.has(key));
  const failed = useEventsStore(s => s.failedLeagues.has(key));
  const fetchLeague = useEventsStore(s => s.fetchLeague);
  const retryLeague = useEventsStore(s => s.retryLeague);

  // Açıkken ve maçlar henüz yokken çek (defaultOpen için de çalışır).
  // failed iken tetikleme — kalıcı hatada sonsuz refetch olmasın (kullanıcı "Tekrar dene" ile döner).
  useEffect(() => {
    if (open && !events && !loading && !failed) fetchLeague(sport, country, league, status);
  }, [open, events, loading, failed, sport, country, league, status, fetchLeague]);

  const title = country ? `${country} > ${league}` : league;
  return (
    <div id={`league-${key}`} className="mb-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-text-1 hover:bg-white/[0.04] transition"
        style={{ background: SURFACE_CARD_BG, border: `1px solid ${SURFACE_BORDER}` }}
      >
        <span className="flex-1 text-left truncate">{title}</span>
        <span className="text-xs text-text-3 font-normal">{t('bahis.eventCount', { count })}</span>
        <span className="text-xs text-text-3">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 ml-2 mt-1">
          {loading && !events ? (
            <div className="text-xs text-text-3 py-2 px-2">{t('common.loading')}</div>
          ) : failed && !events ? (
            <div className="text-xs text-text-3 py-2 px-2">
              {t('bahis.loadFailed')} <button className="underline hover:text-cyan-400" onClick={() => retryLeague(sport, country, league, status)}>{t('common.retry')}</button>
            </div>
          ) : events && events.length === 0 ? (
            <div className="text-xs text-text-3 py-2 px-2">{t('bahis.noOpenBetsInLeague')}</div>
          ) : (
            (events || []).map(ev => (
              <MiniEventCard
                key={ev._id}
                event={ev}
                live={false}
                accent="#00d4ff"
                bgColor={SURFACE_CARD_BG}
                onExtraClick={onExtraClick ? () => onExtraClick(ev._id) : undefined}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
