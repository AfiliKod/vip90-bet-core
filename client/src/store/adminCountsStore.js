// client/src/store/adminCountsStore.js
//
// Sidebar rozetleri + Dashboard kuyruk kartları için TEK canlı sayaç kaynağı.
//
// Neden store: rozetleri gösteren birden fazla bileşen var (sidebar, dashboard
// kuyruk kartları, topbar). Her biri kendi fetch'ini yapsaydı aynı sayı N kez
// çekilir ve N kez güncellenirdi. Store tek indirme + tek abonelik yapar.
//
// Güncelleme yolu iki katmanlı — iki katmanın da amacı "anında" hissettirmek:
//  1) `applyOptimistic`: kendi işlemini yapan bileşen, HTTP yanıtını
//     beklemeden sayıyı değiştirir (anlık geri bildirim).
//  2) `admin:counts` socket yayını: sunucu gerçeği yollar. Kendi işlemimiz
//     dahil TÜM yöneticiler için son doğruluk bu yayındır; optimistic adım
//     yalnızca bekleme süresini (tipik <200ms) görünmez kılar.
// Polling yok — sunucu her işlemde yayınlar (services/adminCounts.js).

import { create } from 'zustand';
import api from '../services/api';
import { socket } from '../services/socket';

export const ADMIN_COUNT_KEYS = ['bank', 'crypto', 'tickets', 'kyc', 'riskFlags'];

const ZERO = Object.freeze(
  ADMIN_COUNT_KEYS.reduce((acc, k) => ({ ...acc, [k]: 0 }), {}),
);

function sanitize(raw) {
  const next = { ...ZERO };
  if (!raw || typeof raw !== 'object') return next;
  for (const k of ADMIN_COUNT_KEYS) {
    const n = Number(raw[k]);
    next[k] = Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
  }
  return next;
}

export const useAdminCountsStore = create((set, get) => ({
  ...ZERO,
  ready: false,

  ensureLoaded: async () => {
    if (get().ready) return;
    set({ ready: true }); // race'i önle: fetch'ten önce işaretle
    try {
      const { data } = await api.get('/admin/queues/counts');
      set({ ...sanitize(data), ready: true });
    } catch {
      set({ ready: false }); // başarısız — bir sonraki çağrıda tekrar dene
    }
  },

  /** Gerçek değerler geldi (REST veya socket). */
  applyServerCounts: (raw) => set({ ...sanitize(raw), ready: true }),

  /**
   * Kendi işleminin etkisini beklemeden uygula. `delta` negatifse sayaç
   * düşer (ör. ticket kapandı), pozitifse yükselir. Alt sınır 0'dır — sayaç
   * eksiye düşmez. Yayın gelince sunucunun gerçeği üstüne yazar.
   */
  applyOptimistic: (key, delta) => {
    if (!ADMIN_COUNT_KEYS.includes(key)) return;
    set((s) => {
      const n = Number(delta) || 0;
      return { [key]: Math.max(0, s[key] + n) };
    });
  },

  reset: () => set({ ...ZERO, ready: false }),
}));

let subscribed = false;

/**
 * Store'u socket'e bağlar ve gerekirse ilk veriyi çeker. Birden çok
 * bileşen çağırabilir — abonelik ve fetch tekrarlanmaz.
 */
export function connectAdminCounts() {
  if (subscribed) return;
  subscribed = true;
  socket.on('admin:counts', (payload) => useAdminCountsStore.getState().applyServerCounts(payload));
  useAdminCountsStore.getState().ensureLoaded();
}
