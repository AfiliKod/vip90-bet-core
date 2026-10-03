import { useEffect, useState } from 'react';
import { socket } from '../services/socket';
import api from '../services/api';

/**
 * P4 — son kazananlar verisi (tek doğruluk kaynağı).
 *
 * İlk liste `GET /inhouse/recent-winners`'dan (services/liveGameStream.js —
 * bellek-içi, en fazla 50 kayıt) çekilir; canlı güncellemeler kök socket
 * namespace'inde yayınlanan 'winners:new' event'iyle gelir (addRecentWinner,
 * routes/inhouse.js'teki 13 oyun kazanç noktasından tetiklenir).
 *
 * `RecentWinnersTicker` (mobil/tablet — yatay kart şeridi) ve `WinnersPanel`
 * (lg+ — sağ rayda dikey liste) aynı veriyi burada paylaşır, iki ayrı socket
 * aboneliği açmaz.
 */
export function useRecentWinners() {
  const [winners, setWinners] = useState([]);

  useEffect(() => {
    let cancelled = false;
    api.get('/inhouse/recent-winners')
      .then(r => { if (!cancelled) setWinners(r.data.winners ?? []); })
      .catch(() => {});

    const onNew = (entry) => setWinners(w => [entry, ...w].slice(0, 20));
    socket.on('winners:new', onNew);
    return () => { cancelled = true; socket.off('winners:new', onNew); };
  }, []);

  return winners;
}

/**
 * 'inhouse-crash' -> '/images/games/crash.png'. `igames-...` (casino) zaten
 * backend'den gerçek `image` alanıyla geliyor, bu fonksiyona hiç düşmüyor.
 * `bet-...` (canlı bahis kazananı) için kapak görseli YOK — null döner,
 * WinnersPanel/RecentWinnersTicker bunu jenerik bir ikonla gösterir.
 */
export function winnerImage(gameId) {
  if (!gameId?.startsWith('inhouse-')) return null;
  const slug = gameId.replace(/^inhouse-/, '');
  return slug ? `/images/games/${slug}.png` : null;
}

/** "ID 17****96" tarzı maskeleme — yalnızca görüntü amaçlı, backend hâlâ
 * gerçek username yayınlıyor (routes/inhouse.js). */
export function maskUsername(name) {
  if (!name) return '???';
  if (name.length <= 3) return name[0] + '***';
  return `${name.slice(0, 2)}${'*'.repeat(Math.min(4, name.length - 2))}${name.slice(-1)}`;
}
