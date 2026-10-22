import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../services/api';
import { getInhouseGames } from '../../data/inhouseGames';
import { readCache, writeCache } from '../../utils/apiCache';
import { useEventsStore } from '../../store/eventsStore';
import { useTranslation } from '../../i18n';

// Aynı allowlist HomePage.jsx'te de var: yalnızca lisanslı/gerçek katalogla
// bağlı sağlayıcıların oyunları (bkz. HomePage.jsx IGAMES_PROVIDER_IDS notu).
const IGAMES_PROVIDER_IDS = [1, 15];

// Modül düzeyinde: panel açılıp kapandıkça kataloğu tekrar çekmeyelim.
const gamesCacheStore = { data: null, expiresAt: 0 };
const providersCacheStore = { data: null, expiresAt: 0 };

/**
 * Site içi aramanın tek kaynağı — masaüstü dropdown'ı (SearchOverlay) ve mobil
 * tam ekran panel (MobileSearchPanel) aynı veriyi/sıralamayı kullanır.
 * Oyun/sağlayıcı araması client-side kataloktan, etkinlik araması backend'e
 * debounce'lu gider (status VERMEDEN: canlı + yaklaşan birlikte döner).
 */
export function useSiteSearch() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [games, setGames] = useState(() => readCache(gamesCacheStore) || []);
  const [providers, setProviders] = useState(() => readCache(providersCacheStore) || []);
  const [loading, setLoading] = useState(!readCache(gamesCacheStore));
  const inputRef = useRef(null);
  const inhouseGames = useMemo(() => getInhouseGames(t), [t]);

  const searchEvents = useEventsStore(s => s.searchEvents);
  const clearEventSearch = useEventsStore(s => s.clearSearch);
  const eventResults = useEventsStore(s => s.searchResults);
  const eventsLoading = useEventsStore(s => s.searchLoading);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (readCache(gamesCacheStore) && readCache(providersCacheStore)) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      Promise.all(
        IGAMES_PROVIDER_IDS.map(provider_id =>
          api.post('/igames/games', { lang: 'tr', provider_id }).then(r => r.data?.data || []).catch(() => [])
        )
      ).then(lists => lists.flat()),
      api.post('/igames/providers', { lang: 'tr' }).then(r => r.data?.data || []).catch(() => []),
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

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { clearEventSearch(); return; }
    const tm = setTimeout(() => searchEvents(q), 300);
    return () => clearTimeout(tm);
  }, [query, searchEvents, clearEventSearch]);

  const q = query.trim().toLowerCase();

  const matchedGames = useMemo(() => {
    if (!q) return [];
    const inhouse = inhouseGames
      .filter(g => g.name.toLowerCase().includes(q))
      .map(g => ({ kind: 'inhouse', id: g.id, name: g.name, image: g.image, to: g.path }));
    const igames = games
      .filter(g => (g.game_name || '').toLowerCase().includes(q))
      .slice(0, 8)
      .map(g => ({
        kind: 'igames',
        id: g.game_code,
        name: g.game_name,
        image: g.game_image_narrow || g.game_image,
        to: `/igames/${encodeURIComponent(g.game_code)}?name=${encodeURIComponent(g.game_name)}`,
      }));
    return [...inhouse, ...igames].slice(0, 10);
  }, [q, games, inhouseGames]);

  const matchedProviders = useMemo(() => {
    if (!q) return [];
    return providers.filter(p => (p.provider_name || p.name || '').toLowerCase().includes(q)).slice(0, 6);
  }, [q, providers]);

  const matchedEvents = eventResults?.slice(0, 8) ?? [];

  return {
    t, q, query, setQuery, inputRef,
    loading, eventsLoading,
    matchedGames, matchedProviders, matchedEvents,
    hasResults: matchedGames.length > 0 || matchedProviders.length > 0 || matchedEvents.length > 0,
  };
}
