import { useState, useEffect } from 'react';
import api from '../services/api';
import { readCache, writeCache } from '../utils/apiCache';

// Aynı allowlist HomePage.jsx/SearchOverlay.jsx'te de var — yalnızca
// lisanslı/gerçek katalogla bağlı sağlayıcıların oyunları.
const IGAMES_PROVIDER_IDS = [1, 15];
const cacheStore = { data: null, expiresAt: 0 };

export function useLicensedIgamesGames() {
  const [games, setGames] = useState(() => readCache(cacheStore) || []);
  const [loading, setLoading] = useState(!readCache(cacheStore));

  useEffect(() => {
    if (readCache(cacheStore)) return;
    let cancelled = false;
    Promise.all(
      IGAMES_PROVIDER_IDS.map(provider_id =>
        api.post('/igames/games', { lang: 'tr', provider_id }).then(r => r.data?.data || []).catch(() => [])
      )
    ).then(lists => {
      if (cancelled) return;
      const flat = lists.flat();
      writeCache(cacheStore, flat);
      setGames(flat);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return { games, loading };
}
