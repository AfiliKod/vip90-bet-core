import { create } from 'zustand';
import api from '../services/api';

// Favoriler / Son Oynananlar — yalnızca login kullanıcı için anlamlı.
// `ensureLoaded()` guard'lı: ilk çağrıda fetch eder, sonrakilerde no-op —
// birden fazla component (HomeSidebar linki, kart toggle'ları, Favorites/
// RecentlyPlayed sayfaları) aynı store'u bağımsız mount olsa da tek fetch.
export const useGameActivityStore = create((set, get) => ({
  favorites: [],
  recentlyPlayed: [],
  loaded: false,

  ensureLoaded: async () => {
    if (get().loaded) return;
    set({ loaded: true }); // race'i önlemek için hemen işaretle
    try {
      const [fav, recent] = await Promise.all([
        api.get('/users/me/favorites'),
        api.get('/users/me/recently-played'),
      ]);
      set({ favorites: fav.data?.favorites || [], recentlyPlayed: recent.data?.recentlyPlayed || [] });
    } catch {
      set({ loaded: false }); // başarısız oldu, bir dahaki denemede tekrar dene
    }
  },

  reset: () => set({ favorites: [], recentlyPlayed: [], loaded: false }),

  isFavorite: (gameId, kind) => get().favorites.some(f => f.gameId === gameId && f.kind === kind),

  toggleFavorite: async (gameId, kind) => {
    const before = get().favorites;
    const exists = before.some(f => f.gameId === gameId && f.kind === kind);
    // Optimistic update
    set({ favorites: exists ? before.filter(f => !(f.gameId === gameId && f.kind === kind)) : [...before, { gameId, kind }] });
    try {
      const { data } = await api.post('/users/me/favorites/toggle', { gameId, kind });
      set({ favorites: data.favorites });
    } catch {
      set({ favorites: before }); // rollback
    }
  },

  recordPlay: (gameId, kind) => {
    // Fire-and-forget — navigasyonu bloklamaz, hata sessizce yutulur.
    api.post('/users/me/recently-played', { gameId, kind }).catch(() => {});
  },
}));
