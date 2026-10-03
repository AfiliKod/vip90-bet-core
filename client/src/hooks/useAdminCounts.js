// client/src/hooks/useAdminCounts.js
//
// Sidebar rozetleri ve Dashboard kuyruk kartları için canlı sayaç okuyucu.
// Gerçek mantık store'da (store/adminCountsStore.js); bu hook yalnızca
// aboneliği başlatır ve değerleri döndürür.
//
// Kullanım:
//   const counts = useAdminCounts();            // { bank, crypto, tickets, ... , ready }
//   useAdminCount('tickets');                    // tek sayı

import { useEffect } from 'react';
import { connectAdminCounts, useAdminCountsStore } from '../store/adminCountsStore.js';

/** Tüm sayaçları döndürür. `ready` ilk REST yanıtından sonra true olur. */
export function useAdminCounts() {
  useEffect(() => { connectAdminCounts(); }, []);
  return useAdminCountsStore();
}

/** Tek bir sayıyı döndürür (ölçülen bileşen alt kümeyi re-render etsin). */
export function useAdminCount(key) {
  useEffect(() => { connectAdminCounts(); }, []);
  return useAdminCountsStore((s) => s[key]);
}
