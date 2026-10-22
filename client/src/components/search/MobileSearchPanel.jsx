import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import { useSiteSearch } from './useSiteSearch';
import SearchResults from './SearchResults';

/**
 * Mobil arama paneli — üstten inen, megamenu benzeri tam genişlikte katman.
 * Navbar'daki (lg+) arama ikonunun mobil karşılığı: parmakla kullanıma uygun
 * büyük input, hızlı geçiş kısayolları ve gruplanmış canlı sonuçlar.
 * Masaüstü dropdown ile aynı aramayı paylaşır (useSiteSearch).
 */
export default function MobileSearchPanel({ onClose }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const state = useSiteSearch();
  const { query, setQuery, inputRef } = state;

  const QUICK = [
    { to: '/', icon: '🎰', label: t('nav.casino') },
    { to: '/bahis', icon: '⚽', label: t('home.sports.title') },
    { to: '/canli', icon: '🔴', label: t('nav.liveBetting') },
    { to: '/promotions', icon: '🎁', label: t('nav.promotions') },
  ];

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    // Panel açıkken arka plan kaymasın (iOS Safari'de body kilidi şart).
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  function pick(to) {
    onClose();
    navigate(to);
  }

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={t('nav.search')}>
      <button
        type="button"
        aria-label={t('common.cancel')}
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
      />

      <div
        className="absolute inset-x-0 top-0 flex flex-col max-h-[88dvh] rounded-b-2xl bg-bg-card border-b border-white/10 shadow-2xl shadow-black/60 animate-slide-down"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="px-4 pt-3 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 !text-[20px] text-text-3 pointer-events-none" aria-hidden="true">search</span>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                placeholder={t('nav.searchPlaceholder')}
                className="w-full rounded-xl bg-white/[0.06] border border-white/10 pl-10 pr-9 py-3 text-[15px] text-text-1 placeholder:text-text-3 focus:outline-none focus:border-primary/50 focus:bg-white/[0.09] transition"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={t('common.cancel')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center text-text-3 hover:text-text-1 hover:bg-white/5 transition"
                >
                  <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">close</span>
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.cancel')}
              className="shrink-0 h-11 px-3 rounded-xl bg-white/[0.06] border border-white/10 text-sm font-bold text-text-2 hover:text-text-1 transition"
            >
              {t('common.cancel')}
            </button>
          </div>

          {!query && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {QUICK.map(item => (
                <button
                  key={item.to}
                  type="button"
                  onClick={() => pick(item.to)}
                  className="flex flex-col items-center gap-1 rounded-xl bg-white/[0.04] border border-white/[0.06] px-1 py-2.5 text-[11px] font-semibold text-text-2 active:scale-95 transition"
                >
                  <span className="text-base leading-none" aria-hidden="true">{item.icon}</span>
                  <span className="truncate max-w-full">{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-5" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}>
          <SearchResults state={state} onPick={pick} dense />
        </div>
      </div>
    </div>
  );
}
