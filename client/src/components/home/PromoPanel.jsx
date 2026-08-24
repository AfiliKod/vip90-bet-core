import { Link } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import { getPromoSlides } from '../../pages/home/promoSlides.js';
import { HOME_CARD, HOME_BORDER, HOME_GREEN } from '../../pages/home/homeTheme';

const PROMO_ICONS = {
  'deneme-bonusu': 'redeem',
  'hosgeldin-bonusu': 'savings',
  'arkadasini-getir': 'diversity_3',
};

/**
 * Sağ ray — "Promosyonlar" paneli. `promoSlides.js`'teki AYNI kampanya
 * verisini (hero slider'da da kullanılan tek doğruluk kaynağı) kısa kart
 * formatında gösterir — betface.png referansındaki panel, uydurma kampanya
 * yerine gerçek A4 verisiyle. "Tümü" → /promotions (gerçek sayfa).
 */
export default function PromoPanel() {
  const { t } = useTranslation();
  const promos = getPromoSlides(t);

  return (
    <div className="rounded-xl p-4" style={{ background: HOME_CARD, border: `1px solid ${HOME_BORDER}` }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[15px] font-bold text-white font-ui">{t('home.rail.promotions')}</span>
        <Link to="/promotions" className="text-[11px] font-semibold font-ui hover:underline" style={{ color: HOME_GREEN }}>
          {t('home.rail.all')}
        </Link>
      </div>
      <div className="flex flex-col gap-3">
        {promos.map(p => (
          <Link key={p.id} to={p.path} className="flex items-start gap-3 group">
            <span
              className="inline-flex items-center justify-center w-10 h-10 rounded-lg shrink-0"
              style={{ background: `${p.accent}26` }}
            >
              <span className="material-symbols-outlined !text-[19px]" style={{ color: p.accent }}>
                {PROMO_ICONS[p.id] || 'redeem'}
              </span>
            </span>
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-white font-ui group-hover:underline">{p.title}</div>
              <div className="text-[11px] text-[#7d8a83] font-ui line-clamp-2">{typeof p.desc === 'function' ? p.desc() : p.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
