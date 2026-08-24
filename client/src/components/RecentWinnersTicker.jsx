import { useEffect, useState } from 'react';
import { socket } from '../services/socket';
import api from '../services/api';
import { formatMoney } from '../utils/money.js';
import { useTranslation } from '../i18n';

/** 'inhouse-crash' -> '/images/games/crash.png' (GAMES görsellerinin tek kaynağı). */
function winnerImage(gameId) {
  const slug = (gameId || '').replace(/^inhouse-/, '');
  return slug ? `/images/games/${slug}.png` : null;
}

/** Gerçek casino/betting sitelerindeki "ID 17****96" maskeleme kalıbı — kazanan
 * kartlarında kullanıcı adı tam görünmesin diye, salt görüntü amaçlı. Backend
 * hâlâ gerçek username yayınlıyor (routes/inhouse.js), maskeleme yalnızca burada. */
function maskUsername(name) {
  if (!name) return '???';
  if (name.length <= 3) return name[0] + '***';
  return `${name.slice(0, 2)}${'*'.repeat(Math.min(4, name.length - 2))}${name.slice(-1)}`;
}

/**
 * P4 — Son kazananlar kartları.
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
 *
 * Yerleşim: yatay kaydırılan kart şeridi (oyun görseli + maskelenmiş kullanıcı
 * + tutar) — 1xbet/oddsSource/Exonbet gibi büyük sitelerde standart olan
 * "kazananlar" sosyal-kanıt kartı deseni, önceki ince metin şeridinin yerine.
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
    <div className="border-b border-white/[0.04] bg-bg-deep">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined !text-[16px] text-gold">emoji_events</span>
          <span className="text-xs font-bold text-text-2 uppercase tracking-wider font-ui">{t('home.recentWinners')}</span>
        </div>
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
          {winners.slice(0, 14).map((w, i) => {
            const img = winnerImage(w.gameId);
            return (
              <div
                key={`${w.userId}-${w.timestamp}-${i}`}
                className="flex items-center gap-2.5 shrink-0 rounded-xl pl-2 pr-4 py-2"
                style={{ background: '#0d1526', border: '1px solid #ffffff0e' }}
              >
                {img && (
                  <img src={img} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" onError={e => { e.currentTarget.style.display = 'none'; }} />
                )}
                <div className="min-w-0">
                  <div className="text-[11px] text-text-3 font-ui whitespace-nowrap">
                    {maskUsername(w.username)} · {w.gameTitle}
                  </div>
                  <div className="text-sm font-extrabold text-emerald-400 font-ui whitespace-nowrap">
                    +{formatMoney(w.amount)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
