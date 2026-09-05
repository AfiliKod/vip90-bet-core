import { useEffect, useState, useMemo } from 'react';
import { useEventsStore, leagueKey } from '../store/eventsStore';
import { SPORT_META, sportIconMaterial } from '../utils/sportMeta';
import LazyLeagueGroup from '../components/LazyLeagueGroup';
import BetSlip, { SlipContent } from '../components/BetSlip';
import PromoHeroSlider from '../components/home/PromoHeroSlider';
import HomeSidebar from '../components/home/HomeSidebar';
import WinnersPanel from '../components/home/WinnersPanel';
import PromoPanel from '../components/home/PromoPanel';
import { SURFACE_CARD_BG, SURFACE_BORDER } from '../styles/surface';
import { useTranslation } from '../i18n';

export default function Bahis() {
  const { t } = useTranslation();
  const {
    initSocket, cleanup,
    summary, summaryLoading, summaryError, fetchSummary,
    focusLeague, setFocusLeague,
  } = useEventsStore();
  const [collapsedSports, setCollapsedSports] = useState({});
  const [forceOpenKey, setForceOpenKey] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const STATUS = 'upcoming';

  useEffect(() => { initSocket(); return cleanup; }, []);
  useEffect(() => { fetchSummary(STATUS); }, []);

  // Sidebar'dan lig tıklanınca: sporu aç, ligi aç (forceOpen sinyali) ve scroll et.
  useEffect(() => {
    if (!focusLeague) return;
    const { sport, country, league } = focusLeague;
    const key = leagueKey(sport, country, league);
    setCollapsedSports(prev => ({ ...prev, [sport]: false }));
    setForceOpenKey(`${key}:${Date.now()}`);
    const tm = setTimeout(() => {
      document.getElementById(`league-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setForceOpenKey(null);   // remount auto-open'u önle (lig kendi open state'ini korur)
      setFocusLeague(null);    // scroll'dan SONRA temizle → timer erken iptal olmaz
    }, 300);
    return () => clearTimeout(tm);
  }, [focusLeague]);

  // Futbol → Türkiye ligleri açılışta otomatik açık.
  const autoOpenLeagues = useMemo(() => {
    const set = new Set();
    const fb = summary?.sports?.find(s => s.sport === 'football');
    for (const lg of (fb?.leagues || [])) {
      if (lg.country === 'Türkiye') set.add(`${lg.country}|${lg.league}`);
    }
    return set;
  }, [summary]);

  // Sol sidebar tıklaması: sporu aç + o bölüme kaydır (mobil spor çiplerinin
  // aynısı, bkz. aşağıdaki md:hidden blok — iki yerde de aynı davranış).
  function goToSport(sport) {
    setSelectedCategory(sport);
    setCollapsedSports(prev => ({ ...prev, [sport]: false }));
    setTimeout(() => document.getElementById(`sport-${sport}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  function showAll() {
    setSelectedCategory('all');
    setCollapsedSports({});
  }

  const totalCount = useMemo(() => (summary?.sports || []).reduce((n, s) => n + s.count, 0), [summary]);

  const sportCategories = useMemo(() => [
    { key: 'all', icon: 'apps', label: t('common.all'), badge: totalCount, onClick: showAll, active: selectedCategory === 'all' },
    ...(summary?.sports || []).map(s => ({
      key: s.sport,
      icon: sportIconMaterial(s.sport),
      label: (SPORT_META[s.sport] ?? { label: s.sport }).label,
      badge: s.count,
      onClick: () => goToSport(s.sport),
      active: selectedCategory === s.sport,
    })),
  ], [summary, t, selectedCategory, totalCount]);

  // Öne Çıkan Ligler — önceki Sidebar.jsx'teki "Popüler Ligler" (top 5,
  // etkinlik sayısına göre) ile aynı mantık, HomeSidebar'ın yeni
  // featuredLeagues bölümüne taşındı.
  const featuredLeagues = useMemo(() => {
    if (!summary?.sports) return [];
    return summary.sports
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
        onClick: () => setFocusLeague({ sport: lg.sport, country: lg.country, league: lg.league }),
      }));
  }, [summary, setFocusLeague]);

  return (
    <div className="min-h-full lg:flex lg:gap-5 lg:px-5 lg:pt-5 lg:items-stretch">
      <HomeSidebar categories={sportCategories} featuredLeagues={featuredLeagues} />
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="lg:grid lg:grid-cols-[1fr_260px] lg:gap-4 lg:items-start">
        <div className="min-w-0">
          <PromoHeroSlider />

          <h1 id="upcoming-events-heading" className="text-xl font-black text-text-1 my-4 scroll-mt-4">{t('home.sports.title')}</h1>

          {/* Mobil spor kategorileri — Sidebar masaüstünde md breakpoint altında gizli olduğu için */}
          <div className="md:hidden -mx-1 my-4 flex gap-2 overflow-x-auto no-scrollbar px-1 pb-1">
            <button
              onClick={showAll}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all text-text-2 bg-white/5 border border-white/10"
            >
              <span>🏆</span>
              <span>{t('common.all')}</span>
            </button>
            {(summary?.sports || []).map(s => {
              const meta = SPORT_META[s.sport] ?? { icon: '🏆', label: s.sport };
              return (
                <button
                  key={s.sport}
                  onClick={() => setCollapsedSports(prev => ({ ...prev, [s.sport]: false }))}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all text-text-2 bg-white/5 border border-white/10"
                >
                  <span>{meta.icon}</span>
                  <span>{meta.label}</span>
                  <span className="text-text-3">{s.count}</span>
                </button>
              );
            })}
          </div>

          {summaryLoading && !summary ? (
            <div className="text-center text-text-3 py-16">{t('common.loading')}</div>
          ) : summaryError ? (
            <div className="text-center text-text-3 py-16">
              {t('bahis.loadFailed')} <button className="underline" onClick={() => fetchSummary(STATUS)}>{t('common.retry')}</button>
            </div>
          ) : !summary || summary.sports.length === 0 ? (
            <div className="text-center text-text-3 py-16">{t('bahis.noEventsFound')}</div>
          ) : (
            <div>
              {summary.sports.map(s => {
                const meta = SPORT_META[s.sport] ?? { icon: '🏆', label: s.sport };
                const isCollapsed = s.sport === 'football' ? !!collapsedSports[s.sport] : (collapsedSports[s.sport] ?? true);
                return (
                  <div key={s.sport} id={`sport-${s.sport}`} className="mb-2 scroll-mt-4">
                    <button
                      onClick={() => setCollapsedSports(prev => ({ ...prev, [s.sport]: !(prev[s.sport] ?? (s.sport !== 'football')) }))}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-text-1 hover:bg-white/[0.04] transition mb-1"
                      style={{ background: SURFACE_CARD_BG, border: `1px solid ${SURFACE_BORDER}` }}
                    >
                      <span>{meta.icon}</span>
                      <span className="flex-1 text-left">{meta.label}</span>
                      <span className="text-xs text-text-3 font-normal">{t('bahis.eventCount', { count: s.count })}</span>
                      <span className="text-xs text-text-3">{isCollapsed ? '▸' : '▾'}</span>
                    </button>
                    {!isCollapsed && (
                      <div className="ml-2">
                        {s.leagues.map(lg => (
                          <LazyLeagueGroup
                            key={`${lg.country}|${lg.league}`}
                            sport={s.sport}
                            country={lg.country}
                            league={lg.league}
                            count={lg.count}
                            status={STATUS}
                            defaultOpen={s.sport === 'football' && autoOpenLeagues.has(`${lg.country}|${lg.league}`)}
                            forceOpenSignal={forceOpenKey && forceOpenKey.startsWith(leagueKey(s.sport, lg.country, lg.league) + ':') ? forceOpenKey : undefined}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
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
