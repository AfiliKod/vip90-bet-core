import { useEffect, useState } from 'react';
import api from '../services/api';

// Eskiden global `OnlineStatusIndicator` bandında (üst yeşil bant, kaldırıldı)
// yaşayan polling mantığı — artık WinnersPanel.jsx'in sağ raydaki "Tümü"
// linkinin yerini alan çevrimiçi göstergesinde kullanılıyor. `onlineCount`
// backend'de gerçek socket bağlantı sayısı + aktif bot sayısı toplamı
// (bkz. server/src/app.js GET /health/status).
export function useOnlineCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const { data } = await api.get('/health/status');
        if (!cancelled && typeof data.onlineCount === 'number') setCount(data.onlineCount);
      } catch {
        // sunucu erişilemezse mevcut değeri koru
      }
    }
    poll();
    const interval = setInterval(poll, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return count;
}
