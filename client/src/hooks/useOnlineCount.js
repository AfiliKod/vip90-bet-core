import { useEffect, useState } from 'react';
import api from '../services/api';
import { socket } from '../services/socket';

/**
 * "Çevrimiçi kullanıcı" sayısı — WinnersPanel.jsx'in sağ raydaki "Tümü"
 * linkinin yerini alan gösterge (bkz. server/src/services/onlineCount.js).
 *
 * ESKİDEN: 10sn'de bir GET /api/health/status'a polling yapıyordu — sitede
 * zaten açık bir socket bağlantısı varken (winners:new, canlı oranlar vb.
 * için) gereksiz tekrarlı HTTP trafiğiydi. ARTIK: tek seferlik bir başlangıç
 * değeri REST'ten çekilir (socket henüz bağlı değilken/guest kullanıcıda
 * "0 çevrimiçi" flaş'ını önlemek için), canlı güncellemeler socket'in
 * 'online:count' event'inden gelir — hiç polling yok.
 *
 * Not: root socket yalnızca login olunca (authStore.js) ya da spor bahis
 * sayfalarında (eventsStore.js) bağlanıyor — yalnızca anasayfada gezinen
 * bir MİSAFİR için socket hiç bağlanmamış olabilir; bu durumda kullanıcı
 * ilk REST değerini görür, canlı güncelleme almaz (kabul edilebilir
 * bozulma — önceki davranışta da guest için socket bağlı değildi).
 */
export function useOnlineCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.get('/health/status')
      .then(({ data }) => { if (!cancelled && typeof data.onlineCount === 'number') setCount(data.onlineCount); })
      .catch(() => {});

    const onCount = ({ count: c }) => { if (typeof c === 'number') setCount(c); };
    socket.on('online:count', onCount);
    return () => { cancelled = true; socket.off('online:count', onCount); };
  }, []);

  return count;
}
