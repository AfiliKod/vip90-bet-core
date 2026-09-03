import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from '../i18n';
import { useEventsStore, groupByLeague } from '../store/eventsStore';
import { SPORT_META, sportIconMaterial } from '../utils/sportMeta';
import { useSportChips } from '../hooks/useSportChips';
import MiniEventCard from '../components/MiniEventCard';
import LeagueGroup from '../components/LeagueGroup';
import BetSlip, { SlipContent } from '../components/BetSlip';
import PromoHeroSlider from '../components/home/PromoHeroSlider';
import HomeSidebar from '../components/home/HomeSidebar';
import WinnersPanel from '../components/home/WinnersPanel';
import PromoPanel from '../components/home/PromoPanel';
import { SURFACE_CARD_BG, SURFACE_BORDER } from '../styles/surface';

export default function Live() {
  const { t } = useTranslation();
  const {
    events, isLoading, fetchEvents, initSocket, cleanup,
    selectedSport, selectedLeague, setSportFilter, setLeagueFilter,
  } = useEventsStore();
  const [openDrawerId, setOpenDrawerId] = useState(null);
  const [collapsedSports, setCollapsedSports] = useState({});

  useEffect(() => {
    initSocket();
    fetchEvents('all', 'live');
    return cleanup;
  }, []);

  const liveEvents = useMemo(() => events.filter(e => e.status === 'live'), [events]);
  const sportChips = useSportChips(liveEvents);

  const groupedEvents = useMemo(() => {
    let evs = liveEvents;
    if (selectedSport !== 'all') evs = evs.filter(e => e.sport === selectedSport);
    if (selectedLeague) evs = evs.filter(e => {
      const key = e.country ? `${e.country} > ${e.league}` : e.league;
      return key === selectedLeague;
    });
    return groupByLeague(evs);
  }, [liveEvents, selectedSport, selectedLeague]);

  const hierarchicalGroups = useMemo(() => {
    if (selectedSport !== 'all' || selectedLeague) return null;
    const sportMap = new Map();
    for (const ev of liveEvents) {
      if (!ev.sport) continue;
      if (!sportMap.has(ev.sport)) sportMap.set(ev.sport, []);
      sportMap.get(ev.sport).push(ev);
    }
    return sportMap.size > 0 ? sportMap : null;
  }, [liveEvents, selectedSport, selectedLeague]);

  function handleToggleDrawer(eventId) {
    setOpenDrawerId(prev => prev === eventId ? null : eventId);
  }

  // Not: Bahis.jsx'in "aç+kaydır" davranışının aksine, Live'da bir spor
  // seçmek zaten mevcut `setSportFilter` filtre mekanizmasını (selectedSport)
  // tetikliyor — hiyerarşik görünüm (tüm sporlar bir arada) o an kaybolup
  // yalnızca seçilen sporun lig listesi kalıyor, kaydırmaya gerek yok.
  const sportCategories = useMemo(() => [
    { key: 'all', icon: 'apps', label: t('common.all'), badge: liveEvents.length, onClick: () => setSportFilter('all'), active: selectedSport === 'all' },
    ...sportChips.map(({ id, label, count }) => ({
      key: id,
      icon: sportIconMaterial(id),
      label,
      badge: count,
      onClick: () => setSportFilter(id),
      active: selectedSport === id,
    })),
  ], [sportChips, t, setSportFilter, selectedSport, liveEvents.length]);

  // Öne Çıkan Ligler — canlı maçlardan lig başına maç sayısına göre top 5.
  const featuredLeagues = useMemo(() => {
    const map = new Map();
    for (const ev of liveEvents) {
      if (!ev.sport) continue;
      const key = ev.country ? `${ev.country} > ${ev.league}` : ev.league;
      if (!map.has(key)) map.set(key, { sport: ev.sport, key, count: 0 });
      map.get(key).count++;
    }
    return [...map.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(lg => ({
        key: lg.key,
        label: lg.key.includes(' > ') ? lg.key.split(' > ').at(-1) : lg.key,
        badge: lg.count,
        onClick: () => setLeagueFilter(lg.sport, lg.key),
      }));
  }, [liveEvents, setLeagueFilter]);

  return (
    <div className="min-h-full lg:flex lg:gap-5 lg:px-5 lg:pt-5 lg:items-stretch">
      <HomeSidebar categories={sportCategories} featuredLeagues={featuredLeagues} />
      <div className="flex-1 min-w-0 flex flex-col">
      <div className="lg:grid lg:grid-cols-[1fr_260px] lg:gap-4 lg:items-start">
      <div className="min-w-0">
      <PromoHeroSlider />

      <div className="flex items-center gap-2 my-4">
        <span className="w-2.5 h-2.5 rounded-full bg-live animate-pulse shrink-0 shadow-[0_0_10px_rgba(239,68,68,0.7)]" />
        <h1 className="text-xl font-black text-text-1">{t('nav.liveBetting')}</h1>
      </div>

      {/* Mobil spor kategorileri — Sidebar masaüstünde md breakpoint altında gizli olduğu için */}
      <div className="md:hidden -mx-1 mb-4 flex gap-2 overflow-x-auto no-scrollbar px-1 pb-1">
        <button
          onClick={() => setSportFilter('all')}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
            selectedSport === 'all' ? 'text-black' : 'text-text-2 bg-white/5 border border-white/10'
          }`}
          style={selectedSport === 'all' ? { background: 'var(--color-primary)' } : {}}
        >
          <span>🏆</span>
          <span>{t('common.all')}</span>
        </button>
        {sportChips.map(({ id, label, icon, count }) => {
          const isActive = selectedSport === id;
          return (
            <button
              key={id}
              onClick={() => setSportFilter(id)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                isActive ? 'text-black' : 'text-text-2 bg-white/5 border border-white/10'
              }`}
              style={isActive ? { background: 'var(--color-primary)' } : {}}
            >
              <span>{icon}</span>
              <span>{label}</span>
              <span className={isActive ? 'text-black/60' : 'text-text-3'}>{count}</span>
            </button>
          );
        })}
      </div>

          {isLoading ? (
            <div className="text-center text-text-3 py-16">Yükleniyor...</div>
          ) : (hierarchicalGroups !== null ? hierarchicalGroups.size === 0 : groupedEvents.size === 0) ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-text-3">
              <span className="text-5xl opacity-40">🔴</span>
              <p className="text-sm font-medium">Şu an canlı maç bulunmuyor</p>
              <p className="text-xs opacity-60">Maçlar başladığında burada görünecek</p>
            </div>
          ) : hierarchicalGroups !== null ? (
            <div>
              {[...hierarchicalGroups.entries()].map(([s, sportEvents]) => {
                const meta = SPORT_META[s] ?? { icon: '🏆', label: s };
                const totalCount = sportEvents.length;
                const isCollapsed = !!collapsedSports[s];
                return (
                  <div key={s} id={`sport-${s}`} className="mb-2 scroll-mt-4">
                    <button
                      onClick={() => setCollapsedSports(prev => ({ ...prev, [s]: !prev[s] }))}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-text-1 hover:bg-white/[0.04] transition mb-1"
                      style={{ background: SURFACE_CARD_BG, border: `1px solid ${SURFACE_BORDER}` }}
                    >
                      <span>{meta.icon}</span>
                      <span className="flex-1 text-left">{meta.label}</span>
                      <span className="text-xs text-text-3 font-normal">{totalCount} maç</span>
                      <span className="text-xs text-text-3">{isCollapsed ? '▸' : '▾'}</span>
                    </button>
                    {!isCollapsed && (
                      <div className="flex flex-col gap-2 ml-2">
                        {sportEvents.map(ev => (
                          <MiniEventCard
                            key={ev._id}
                            event={ev}
                            live
                            accent="#ef4444"
                            bgColor={SURFACE_CARD_BG}
                            onExtraClick={() => handleToggleDrawer(ev._id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              {[...groupedEvents.entries()].map(([league, evs]) => (
                <LeagueGroup
                  key={league}
                  league={league}
                  leagueFlag={evs[0]?.leagueFlag ?? '🏆'}
                  events={evs}
                  openDrawerId={openDrawerId}
                  onToggleDrawer={handleToggleDrawer}
                  accent="#ef4444"
                  bgColor={SURFACE_CARD_BG}
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

      {/* desktopHidden: masaüstü kupon yerleşimini yukarıda (sağ ray) kendimiz
          yönetiyoruz — burası yalnızca mobil bar/sheet davranışı için kalıyor. */}
      <BetSlip desktopHidden />
      </div>
    </div>
  );
}
