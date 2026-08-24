import { useEffect, useState } from 'react';
import { socket } from '../services/socket';
import api from '../services/api';
import { formatMoney } from '../utils/money.js';
import { useTranslation } from '../i18n';

/**
 * P4 — Son kazananlar şeridi.
 *
 * İlk liste `GET /inhouse/recent-winners`'dan (services/liveGameStream.js —
 * bellek-içi, en fazla 50 kayıt) çekilir; canlı güncellemeler kök socket
 * namespace'inde yayınlanan 'winners:new' event'iyle gelir (addRecentWinner,
 * routes/inhouse.js'teki 13 oyun kazanç noktasından tetiklenir).
 *
 * Not: socket bağlantısı yalnızca giriş yapmış kullanıcılar için kuruluyor
 * (authStore.js) — ziyaretçi ilk listeyi görür ama canlı akış yalnızca
 * giriş yapınca başlar. Bu, mevcut socket mimarisiyle tutarlı bir kapsam
 * sınırı, bu bileşene özgü bir eksiklik değil.
 */
export default function RecentWinnersTicker() {
  const { t } = useTranslation();
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

  if (winners.length === 0) return null;

  return (
    <div className="border-b border-white/[0.04] bg-bg-card/40 overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-3">
        <span className="text-xs font-bold text-text-3 uppercase tracking-wide shrink-0">
          🏆 {t('home.recentWinners')}
        </span>
        <div className="flex gap-4 overflow-x-auto scrollbar-none">
          {winners.map((w, i) => (
            <div
              key={`${w.userId}-${w.timestamp}-${i}`}
              className="flex items-center gap-1.5 text-xs whitespace-nowrap shrink-0"
            >
              <span className="text-text-2 font-medium">{w.username}</span>
              <span className="text-text-3">· {w.gameTitle}</span>
              <span className="text-green-400 font-bold">+{formatMoney(w.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
