import { useEffect, useState, useMemo } from 'react';
import { useEventsStore, leagueKey } from '../store/eventsStore';
import { SPORT_META, sportIconMaterial } from '../utils/sportMeta';
import MiniEventCard from '../components/MiniEventCard';
import LazyLeagueGroup from '../components/LazyLeagueGroup';
import BetSlip, { SlipContent } from '../components/BetSlip';
import HeroSlider from '../components/HeroSlider';
import HomeSidebar from '../components/home/HomeSidebar';
import { BRAND_GRADIENT_H } from '../styles/brand';
import { SURFACE_CARD, SURFACE_CARD_BG, SURFACE_BORDER } from '../styles/surface';
import { useTranslation } from '../i18n';

function SearchInput({ value, onChange, placeholder }) {
  const { t } = useTranslation();
  return (
    <div className="relative group w-full sm:w-64">
      <div
        className="absolute inset-0 rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: BRAND_GRADIENT_H, padding: '1px', WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude' }}
      />
      <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-cyan-400" style={{ color: '#4a5a78' }}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
      </span>
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder ?? t('bahis.searchPlaceholder')}
        className="relative w-full rounded-xl pl-10 pr-9 py-2.5 text-sm outline-none transition-all backdrop-blur-sm font-medium"
        style={{ background: `${SURFACE_CARD}aa`, border: `1px solid ${SURFACE_BORDER}`, color: '#f0f4ff' }}
        onFocus={e => {
          e.currentTarget.style.background = '#0c1220ee';
          e.currentTarget.style.boxShadow = '0 0 16px #00d4ff33, 0 0 24px #7c3aed22';
        }}
        onBlur={e => {
          e.currentTarget.style.background = '#0c1220aa';
          e.currentTarget.style.boxShadow = 'none';
        }}
      />
      {value && (
        <button
          onClick={() => onChange({ target: { value: '' } })}
          className="absolute right-3 top-1/2 -translate-y-1/2 leading-none transition-colors hover:text-cyan-400"
          style={{ color: '#4a5a78' }}
        >
          ×
        </button>
      )}
    </div>
  );
}

export default function Bahis() {
  const { t } = useTranslation();
  const {
    initSocket, cleanup,
    summary, summaryLoading, summaryError, fetchSummary,
    searchResults, searchLoading, searchEvents, clearSearch,
    focusLeague, setFocusLeague,
  } = useEventsStore();
  const [search, setSearch] = useState('');
  const [collapsedSports, setCollapsedSports] = useState({});
  const [forceOpenKey, setForceOpenKey] = useState(null);
  const STATUS = 'upcoming';

  useEffect(() => { initSocket(); return cleanup; }, []);
  useEffect(() => { fetchSummary(STATUS); }, []);
  // Debounced backend arama
  useEffect(() => {
    const q = search.trim();
    const tm = setTimeout(() => { q.length >= 2 ? searchEvents(q, STATUS) : clearSearch(); }, 300);
    return () => clearTimeout(tm);
  }, [search]);

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
    setCollapsedSports(prev => ({ ...prev, [sport]: false }));
    setTimeout(() => document.getElementById(`sport-${sport}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  const sportCategories = useMemo(() => [
    { key: 'all', icon: 'apps', label: t('common.all'), onClick: () => setCollapsedSports({}) },
    ...(summary?.sports || []).map(s => ({
      key: s.sport,
      icon: sportIconMaterial(s.sport),
      label: (SPORT_META[s.sport] ?? { label: s.sport }).label,
      badge: s.count,
      onClick: () => goToSport(s.sport),
    })),
  ], [summary, t]);

  return (
    <div className="min-h-full lg:flex lg:gap-5 lg:px-5 lg:pt-5 lg:items-stretch">
      <HomeSidebar categories={sportCategories} />
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="lg:grid lg:grid-cols-[1fr_260px] lg:gap-4 lg:items-start">
        <div className="min-w-0">
          <HeroSlider />
          <div className="flex gap-2 my-4 items-center flex-wrap">
            <span className="px-4 py-2 rounded-lg text-sm font-bold text-black" style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)', boxShadow: '0 0 16px #00d4ff55, 0 0 24px #7c3aed33' }}>{t('bahis.upcomingEvents')}</span>
            <SearchInput
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Mobil spor kategorileri — Sidebar masaüstünde md breakpoint altında gizli olduğu için */}
          <div className="md:hidden -mx-1 mb-4 flex gap-2 overflow-x-auto no-scrollbar px-1 pb-1">
            <button
              onClick={() => setCollapsedSports({})}
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

          {search.trim().length >= 2 ? (
            searchLoading ? (
              <div className="text-center text-text-3 py-16">{t('bahis.searching')}</div>
            ) : !searchResults || searchResults.length === 0 ? (
              <div className="text-center text-text-3 py-16">{t('bahis.noResults')}</div>
            ) : (
              <div className="flex flex-col gap-2">
                {searchResults.map(ev => (
                  <MiniEventCard key={ev._id} event={ev} live={false} accent="#00d4ff" bgColor={SURFACE_CARD_BG} />
                ))}
              </div>
            )
          ) : summaryLoading && !summary ? (
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
