import { Link } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import { formatMoney } from '../../utils/money.js';
import { useRecentWinners, winnerImage, maskUsername } from '../../hooks/useRecentWinners';
import { HOME_CARD, HOME_BORDER } from '../../pages/home/homeTheme';

/**
 * Sağ ray — "Kazananlar" paneli (yalnızca lg+; lg altında aynı veri
 * `RecentWinnersTicker.jsx`'in yatay kart şeridi olarak gösterilir).
 * "Tümü" → /casino (bizde ayrı bir "tüm kazananlar" sayfası yok, en yakın
 * gerçek hedef budur).
 */
export default function WinnersPanel() {
  const { t } = useTranslation();
  const winners = useRecentWinners();

  if (winners.length === 0) return null;

  return (
    <div className="rounded-xl p-3.5" style={{ background: `linear-gradient(180deg, ${HOME_CARD} 0%, #071016 100%)`, border: `1px solid ${HOME_BORDER}` }}>
      <div className="flex items-center justify-between pb-3 mb-1 border-b" style={{ borderColor: HOME_BORDER }}>
        <span className="text-[15px] font-bold text-white font-ui">{t('home.rail.winners')}</span>
        <Link to="/casino" className="text-[11px] font-semibold font-ui text-[#c8ced2] hover:text-white">{t('home.rail.all')} ›</Link>
      </div>
      <div className="flex flex-col">
        {winners.slice(0, 4).map((w, i) => {
          const img = winnerImage(w.gameId);
          return (
            <div
              key={`${w.userId}-${w.timestamp}-${i}`}
              className="flex items-center gap-2.5 py-2.5"
              style={{ borderBottom: i < 3 ? `1px solid ${HOME_BORDER}` : 'none' }}
            >
              {img && (
                <img src={img} alt="" className="w-[46px] h-[46px] rounded-lg object-cover shrink-0" onError={e => { e.currentTarget.style.display = 'none'; }} />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-white truncate font-ui">{w.gameTitle}</div>
                <div className="text-[11px] text-[#aab2b7] mt-0.5 font-ui truncate">{maskUsername(w.username)}</div>
              </div>
              <div className="text-[11px] font-bold font-ui shrink-0" style={{ color: 'var(--color-primary)' }}>{formatMoney(w.amount)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
