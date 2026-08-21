import { create } from 'zustand';
import api from '../services/api';

/**
 * M4 — Modül kullanılabilirlik durumu (istemci tarafı).
 *
 * GET /api/modules herkese açık uçtan bir kez çekilir. Bilinmeyen modül
 * (null/undefined) "açık" sayılır: sunum katmanı fail-open'dır, asıl zorlama
 * sunucu gate'lerinin 503'ündedir. Böylece geçici bir ağ hatası menüyü
 * yanlışlıkla gizlemez.
 */
export const useModuleStore = create((set) => ({
  available: {},   // id -> boolean | undefined (undefined = bilinmiyor)
  loaded: false,
  fetch: async () => {
    try {
      const r = await api.get('/modules');
      const map = {};
      for (const m of r.data.modules ?? []) map[m.id] = m.available === true;
      set({ available: map, loaded: true });
    } catch {
      set({ loaded: true }); // sessizce varsayılana dön
    }
  },
}));

export function isModuleAvailable(id) {
  return useModuleStore.getState().available[id] !== false;
}
