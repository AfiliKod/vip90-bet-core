import { useTranslation } from '../i18n';
import { formatMoney } from '../utils/money.js';
import { useRecentWinners, winnerImage, maskUsername } from '../hooks/useRecentWinners';

/**
 * P4 — Son kazananlar, yatay kart şeridi.
 *
 * Veri `useRecentWinners()`'dan gelir (bkz. o dosyadaki not — ilk liste API,
 * canlı güncelleme socket). Bu bileşen yalnızca **lg altı** (mobil/tablet)
 * görünür — lg ve üzerinde aynı veri `home/WinnersPanel.jsx` tarafından sağ
 * rayda dikey liste olarak gösteriliyor (bkz. HomePage.jsx), iki kez
 * göstermemek için.
 */
export default function RecentWinnersTicker() {
  const { t } = useTranslation();
  const winners = useRecentWinners();

  if (winners.length === 0) return null;

  return (
    <div className="lg:hidden border-b border-white/[0.04] bg-bg-deep">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined !text-[16px] text-gold">emoji_events</span>
          <span className="text-xs font-bold text-text-2 uppercase tracking-wider font-ui">{t('home.recentWinners')}</span>
        </div>
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
          {winners.slice(0, 14).map((w, i) => {
            const img = w.image || winnerImage(w.gameId);
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
