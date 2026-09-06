import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import { useBrandingStore } from '../../store/brandingStore';
import api from '../../services/api';
import { Icon } from './HomeUI';
import { resolveSectionOrder, resolveBanners } from '../../pages/home/pageContent';
import { getPromoSlides, getHeroNavSlides } from '../../pages/home/promoSlides';
import { HOME_BG } from '../../pages/home/homeTheme';

// Slide id -> Material Symbols glyph. Salt görsel eşleme; pageContent/A4
// override sözleşmesine dokunmaz (bkz. promoSlides.js, resolveBanners()).
const SLIDE_ICONS = {
  welcome: 'diamond',
  sports: 'sports_soccer',
  live: 'sensors',
  casino: 'casino',
  'deneme-bonusu': 'redeem',
  'hosgeldin-bonusu': 'savings',
  'arkadasini-getir': 'diversity_3',
};

/**
 * Anasayfanın promosyon/kampanya hero slider'ı — başlangıçta HomePage.jsx'e
 * gömülüydü, kullanıcı isteğiyle Spor Bahisleri/Canlı Bahis sayfalarında da
 * "olduğu gibi" (1:1) kullanılabilsin diye bağımsız bir component'e çıkarıldı.
 * Kendi `pageContent` (admin override'ları + sectionOrder) fetch'ini yapar —
 * hiçbir sayfaya özgü prop gerekmez. `sectionOrder`'da "hero" yoksa (admin
 * anasayfada gizlemişse) null döner — bu davranış tüm sayfalarda tutarlı.
 */
export default function PromoHeroSlider() {
  const { t } = useTranslation();
  const siteName = useBrandingStore(s => s.siteName) || 'VIP90.bet';
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const timerRef = useRef(null);
  const [pageContent, setPageContent] = useState(null);

  useEffect(() => {
    api.get('/pages/home').then(({ data }) => setPageContent(data?.content || null)).catch(() => {});
  }, []);

  // Gezinme slaytları (welcome/sports/live/casino) + kampanya banner'ları —
  // artık TEK bir override listesinden geçiyor (bkz. promoSlides.js,
  // resolveBanners()) ki admin panelinden ikisi de (görsel dahil) düzenlenebilsin.
  const ALL_SLIDES = resolveBanners([...getPromoSlides(t), ...getHeroNavSlides(t, siteName)], pageContent?.banners);
  const sectionOrder = resolveSectionOrder(pageContent?.sectionOrder);

  const TRUST_BADGES = [
    { icon: 'shield', label: t('home.trust.licensed') },
    { icon: 'verified', label: t('home.trust.provablyFair') },
    { icon: 'bolt', label: t('home.trust.instantPayout') },
    { icon: 'support_agent', label: t('home.trust.support') },
  ];

  const startTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setCurrent(c => (c + 1) % ALL_SLIDES.length), 5000);
  };
  useEffect(() => { startTimer(); return () => clearInterval(timerRef.current); }, [ALL_SLIDES.length]);

  function goTo(i) { setCurrent(i); startTimer(); }

  if (!sectionOrder.includes('hero')) return null;

  const slide = ALL_SLIDES[current];
  const slideIcon = SLIDE_ICONS[slide.id] || 'stars';

  return (
    <section className="relative w-full h-[420px] sm:h-[380px] overflow-hidden lg:rounded-xl" style={{ background: HOME_BG }}>
      {ALL_SLIDES.map((s, i) => (
        <img key={s.id} src={s.image} className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${i === current ? 'opacity-100' : 'opacity-0'}`} alt="" loading={i === 0 ? 'eager' : 'lazy'} />
      ))}
      <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${HOME_BG} 0%, ${HOME_BG} 40%, ${HOME_BG}cc 55%, transparent 80%)` }} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/10" />
      <div className="absolute -top-16 -left-16 w-[380px] h-[380px] rounded-full opacity-20 pointer-events-none" style={{ background: `radial-gradient(circle, var(--color-primary) 0%, transparent 70%)` }} />

      <div className="relative h-full px-4 flex flex-col justify-center">
        <div className="max-w-md">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider mb-3 px-2.5 py-1 rounded bg-white/[0.06] text-white/60 font-ui">
            <Icon name={slideIcon} className="!text-[13px]" />
            {slide.title}
          </span>
          <h1 className="text-3xl sm:text-[32px] font-extrabold uppercase leading-[1.08] text-white mb-3 font-ui tracking-tight">{slide.title}</h1>
          <p className="text-sm text-white/60 mb-5 max-w-sm font-ui">{typeof slide.desc === 'function' ? slide.desc() : slide.desc}</p>
          <button
            onClick={() => navigate(slide.path)}
            className="px-6 py-2.5 rounded-lg text-sm font-bold transition-all hover:brightness-110 active:scale-95 font-ui"
            style={{ background: 'var(--color-primary)', color: '#08110b' }}
          >
            {slide.cta}
          </button>
          <div className="hidden sm:flex items-center gap-4 mt-5 flex-wrap">
            {TRUST_BADGES.map(b => (
              <span key={b.label} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/45 font-ui">
                <Icon name={b.icon} className="!text-[14px]" style={{ color: 'var(--color-primary)' }} />
                {b.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
        {ALL_SLIDES.map((_, i) => (
          <button key={i} onClick={() => goTo(i)} aria-label={`slide-${i}`} className="h-[7px] rounded-full transition-all duration-300"
            style={{ width: i === current ? '20px' : '7px', background: i === current ? 'var(--color-primary)' : 'rgba(255,255,255,0.25)' }} />
        ))}
      </div>
    </section>
  );
}
