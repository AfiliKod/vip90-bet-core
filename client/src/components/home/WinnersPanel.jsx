import { useTranslation } from '../../i18n';
import { formatMoney } from '../../utils/money.js';
import { useRecentWinners, winnerImage, maskUsername } from '../../hooks/useRecentWinners';
import { HOME_CARD, HOME_BORDER, HOME_GREEN } from '../../pages/home/homeTheme';

/**
 * Sağ ray — "Kazananlar" paneli (yalnızca lg+; lg altında aynı veri
 * `RecentWinnersTicker.jsx`'in yatay kart şeridi olarak gösterilir).
 * betface.png referansındaki dikey liste deseni, gerçek veriyle — "Tümü"
 * linki bilinçli olarak yok, bizde ayrı bir "tüm kazananlar" sayfası yok.
 */
export default function WinnersPanel() {
  const { t } = useTranslation();
  const winners = useRecentWinners();

  if (winners.length === 0) return null;

  return (
    <div className="rounded-xl p-4" style={{ background: HOME_CARD, border: `1px solid ${HOME_BORDER}` }}>
      <div className="text-[15px] font-bold text-white font-ui mb-3">{t('home.rail.winners')}</div>
      <div className="flex flex-col gap-3.5">
        {winners.slice(0, 4).map((w, i) => {
          const img = winnerImage(w.gameId);
          return (
            <div key={`${w.userId}-${w.timestamp}-${i}`} className="flex items-center gap-3">
              {img && (
                <img src={img} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0" onError={e => { e.currentTarget.style.display = 'none'; }} />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-white truncate font-ui">{w.gameTitle}</div>
                <div className="text-[11px] text-[#7d8a83] font-ui truncate">{maskUsername(w.username)}</div>
              </div>
              <div className="text-[13px] font-bold font-ui shrink-0" style={{ color: HOME_GREEN }}>{formatMoney(w.amount)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
