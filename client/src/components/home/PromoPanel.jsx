import { Link } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import { getPromoSlides } from '../../pages/home/promoSlides.js';
import { HOME_CARD, HOME_BORDER } from '../../pages/home/homeTheme';

/**
 * Sağ ray — "Promosyonlar" paneli. `promoSlides.js`'teki AYNI kampanya
 * verisini (hero slider'da da kullanılan tek doğruluk kaynağı) kısa kart
 * formatında gösterir. "Tümü" → /promotions (gerçek sayfa).
 */
export default function PromoPanel() {
  const { t } = useTranslation();
  const promos = getPromoSlides(t);

  return (
    <div className="rounded-xl p-3.5" style={{ background: `linear-gradient(180deg, ${HOME_CARD} 0%, #071016 100%)`, border: `1px solid ${HOME_BORDER}` }}>
      <div className="flex items-center justify-between pb-3 mb-1 border-b" style={{ borderColor: HOME_BORDER }}>
        <span className="text-[15px] font-bold text-white font-ui">{t('home.rail.promotions')}</span>
        <Link to="/promotions" className="text-[11px] font-semibold font-ui text-[#c8ced2] hover:text-white">{t('home.rail.all')} ›</Link>
      </div>
      <div className="flex flex-col">
        {promos.map((p, i) => (
          <Link
            key={p.id}
            to={p.path}
            className="flex items-center gap-3 py-3 group"
            style={{ borderBottom: i < promos.length - 1 ? `1px solid ${HOME_BORDER}` : 'none' }}
          >
            <img src={p.image} alt="" className="w-[72px] h-[60px] rounded-lg object-cover shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-white font-ui group-hover:underline">{p.title}</div>
              <div className="text-[11px] text-[#a8b0b5] mt-1 font-ui line-clamp-2">{typeof p.desc === 'function' ? p.desc() : p.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
