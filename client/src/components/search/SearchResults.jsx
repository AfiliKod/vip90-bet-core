import { sportIconMaterial } from '../../utils/sportMeta';

/**
 * Arama sonuç grupları (oyunlar / sağlayıcılar / etkinlikler). Sunucu tarafı
 * markup'ı iki kabuk arasında paylaşıyor: masaüstü dropdown (SearchOverlay)
 * ve mobil tam ekran panel (MobileSearchPanel). `dense` yalnız satır
 * yüksekliğini etkiler — mobilde parmakla seçime daha uygun boşluk verir.
 */
export default function SearchResults({ state, onPick, dense = false }) {
  const { t, q, loading, eventsLoading, matchedGames, matchedProviders, matchedEvents, hasResults } = state;

  if (!q) return <p className="text-xs text-text-3 mt-3 px-1">{t('nav.searchHint')}</p>;
  if (loading || (eventsLoading && matchedEvents.length === 0)) {
    return <p className="text-xs text-text-3 mt-3 px-1">{t('nav.searchLoading')}</p>;
  }
  if (!hasResults) return <p className="text-xs text-text-3 mt-3 px-1">{t('nav.searchEmpty')}</p>;

  const rowCls = `w-full flex items-center gap-2.5 px-2 rounded-lg hover:bg-white/5 active:bg-white/10 text-left transition-colors ${dense ? 'py-2.5' : 'py-1.5'}`;
  const groupCls = 'text-[10px] font-bold uppercase tracking-wide text-text-3 px-1 mb-1';

  return (
    <div className="mt-2 space-y-3">
      {matchedGames.length > 0 && (
        <div>
          <div className={groupCls}>{t('nav.searchGames')}</div>
          {matchedGames.map(g => (
            <button key={`${g.kind}-${g.id}`} onClick={() => onPick(g.to)} className={rowCls}>
              {g.image && (
                <img src={g.image} alt="" className="w-8 h-8 rounded-md object-cover shrink-0" onError={e => { e.currentTarget.style.display = 'none'; }} />
              )}
              <span className="text-sm text-text-1 truncate">{g.name}</span>
            </button>
          ))}
        </div>
      )}
      {matchedProviders.length > 0 && (
        <div>
          <div className={groupCls}>{t('nav.searchProviders')}</div>
          {matchedProviders.map(p => (
            <button key={p.provider_id} onClick={() => onPick(`/casino?provider=${p.provider_id}`)} className={rowCls}>
              {p.provider_logo ? (
                <img src={p.provider_logo} alt="" className="h-5 w-auto max-w-[70px] object-contain shrink-0" />
              ) : null}
              <span className="text-sm text-text-1 truncate">{p.provider_name || p.name}</span>
            </button>
          ))}
        </div>
      )}
      {matchedEvents.length > 0 && (
        <div>
          <div className={groupCls}>{t('nav.searchEvents')}</div>
          {matchedEvents.map(ev => (
            <button key={ev._id} onClick={() => onPick(`/events/${ev._id}`)} className={rowCls}>
              <span className="w-8 h-8 rounded-md shrink-0 flex items-center justify-center bg-white/5">
                <span className="material-symbols-outlined !text-[17px] text-text-3">{sportIconMaterial(ev.sport)}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  {ev.status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />}
                  <span className="text-sm text-text-1 truncate">{ev.homeTeam?.name} - {ev.awayTeam?.name}</span>
                </span>
                <span className="block text-[11px] text-text-3 truncate">{ev.league}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
