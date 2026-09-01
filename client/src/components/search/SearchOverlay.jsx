import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import api from '../../services/api';
import { getInhouseGames } from '../../data/inhouseGames';
import { readCache, writeCache } from '../../utils/apiCache';

// Aynı allowlist HomePage.jsx'te de var: yalnızca lisanslı/gerçek katalogla
// bağlı sağlayıcıların oyunları (bkz. HomePage.jsx PALACE_PROVIDER_IDS notu).
const PALACE_PROVIDER_IDS = [1, 15];

const gamesCacheStore = { data: null, expiresAt: 0 };
const providersCacheStore = { data: null, expiresAt: 0 };

/**
 * Navbar'daki arama ikonuna bağlı dropdown panel. Bu turda yalnızca
 * `casino` modu (oyun + provider arama) implement edildi. Spor Bahisleri/
 * Canlı Bahis sayfaları gerçek veriyle aktif olduğunda, `useLocation()`
 * ile route'a göre bir `sports` modu (takım/maç/lig arama) buraya
 * eklenecek — o güne kadar sahte/iskelet bir spor arama UI'ı YOK.
 */
export default function SearchOverlay({ onClose }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  useLocation(); // route-aware genişletme noktası (bkz. yukarıdaki not)
  const [query, setQuery] = useState('');
  const [games, setGames] = useState(() => readCache(gamesCacheStore) || []);
  const [providers, setProviders] = useState(() => readCache(providersCacheStore) || []);
  const [loading, setLoading] = useState(!readCache(gamesCacheStore));
  const inputRef = useRef(null);
  const inhouseGames = useMemo(() => getInhouseGames(t), [t]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (readCache(gamesCacheStore) && readCache(providersCacheStore)) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      Promise.all(
        PALACE_PROVIDER_IDS.map(provider_id =>
          api.post('/palace/games', { lang: 'tr', provider_id }).then(r => r.data?.data || []).catch(() => [])
        )
      ).then(lists => lists.flat()),
      api.post('/palace/providers', { lang: 'tr' }).then(r => r.data?.data || []).catch(() => []),
    ]).then(([gameList, providerList]) => {
      if (cancelled) return;
      writeCache(gamesCacheStore, gameList);
      writeCache(providersCacheStore, providerList);
      setGames(gameList);
      setProviders(providerList);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const q = query.trim().toLowerCase();

  const matchedGames = useMemo(() => {
    if (!q) return [];
    const inhouse = inhouseGames
      .filter(g => g.name.toLowerCase().includes(q))
      .map(g => ({ kind: 'inhouse', id: g.id, name: g.name, image: g.image, to: g.path }));
    const palace = games
      .filter(g => (g.game_name || '').toLowerCase().includes(q))
      .slice(0, 8)
      .map(g => ({
        kind: 'palace',
        id: g.game_code,
        name: g.game_name,
        image: g.game_image_narrow || g.game_image,
        to: `/palace/${encodeURIComponent(g.game_code)}?name=${encodeURIComponent(g.game_name)}`,
      }));
    return [...inhouse, ...palace].slice(0, 10);
  }, [q, games, inhouseGames]);

  const matchedProviders = useMemo(() => {
    if (!q) return [];
    return providers.filter(p => (p.provider_name || p.name || '').toLowerCase().includes(q)).slice(0, 6);
  }, [q, providers]);

  function go(to) {
    onClose();
    navigate(to);
  }

  const hasResults = matchedGames.length > 0 || matchedProviders.length > 0;

  return (
    <div className="absolute right-0 top-full mt-2 w-[min(380px,90vw)] max-h-[70vh] overflow-y-auto no-scrollbar rounded-2xl shadow-2xl z-50 bg-bg-card border border-white/10 p-3 animate-fade-in">
      <input
        ref={inputRef}
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={t('nav.searchPlaceholder')}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3 focus:outline-none focus:border-primary/40"
      />

      {!q ? (
        <p className="text-xs text-text-3 mt-3 px-1">{t('nav.searchHint')}</p>
      ) : loading ? (
        <p className="text-xs text-text-3 mt-3 px-1">{t('nav.searchLoading')}</p>
      ) : !hasResults ? (
        <p className="text-xs text-text-3 mt-3 px-1">{t('nav.searchEmpty')}</p>
      ) : (
        <div className="mt-2 space-y-3">
          {matchedGames.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-text-3 px-1 mb-1">{t('nav.searchGames')}</div>
              {matchedGames.map(g => (
                <button
                  key={`${g.kind}-${g.id}`}
                  onClick={() => go(g.to)}
                  className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 text-left transition-colors"
                >
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
              <div className="text-[10px] font-bold uppercase tracking-wide text-text-3 px-1 mb-1">{t('nav.searchProviders')}</div>
              {matchedProviders.map(p => (
                <button
                  key={p.provider_id}
                  onClick={() => go(`/casino?provider=${p.provider_id}`)}
                  className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 text-left transition-colors"
                >
                  {p.provider_logo ? (
                    <img src={p.provider_logo} alt="" className="h-5 w-auto max-w-[70px] object-contain shrink-0" />
                  ) : null}
                  <span className="text-sm text-text-1 truncate">{p.provider_name || p.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
