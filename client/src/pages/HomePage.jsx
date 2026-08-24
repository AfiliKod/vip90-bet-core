import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from '../i18n';
import api from '../services/api';
import MiniEventCard from '../components/MiniEventCard';
import BetSlip from '../components/BetSlip';
import RecentWinnersTicker from '../components/RecentWinnersTicker';
import { BRAND_GRADIENT_H, BRAND_GLOW } from '../styles/brand';
import { resolveSectionOrder, resolveBanners } from './home/pageContent';
import { getPromoSlides } from './home/promoSlides';

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

function Icon({ name, className = '', style }) {
  return <span className={`material-symbols-outlined ${className}`} style={style} aria-hidden="true">{name}</span>;
}

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const timerRef = useRef(null);
  const [liveEvents, setLiveEvents] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  // A4 — admin panelinden yönetilen bölüm sırası + kampanya banner metinleri.
  // Fetch tamamlanana kadar (ve başarısız olursa) resolve*() varsayılanlara
  // düşer, sayfa hep tam ve doğru sırayla görünür.
  const [pageContent, setPageContent] = useState(null);

  useEffect(() => {
    api.get('/pages/home').then(({ data }) => setPageContent(data?.content || null)).catch(() => {});
  }, []);

  const HERO_SLIDES = [
    {
      id: 'welcome', title: t('home.hero.welcome'), path: '/bahis', cta: t('home.hero.getStarted'),
      desc: t('home.hero.welcomeDesc'),
      image: '/images/welcome-banner.png',
      accent: '#f0b429',
    },
    {
      id: 'sports', title: t('home.hero.sports'), path: '/bahis', cta: t('home.hero.betNow'),
      desc: t('home.hero.sportsDesc'),
      image: '/images/hero-sports.png',
      accent: '#00d4ff',
    },
    {
      id: 'live', title: t('home.hero.live'), path: '/canli', cta: t('home.hero.watchLive'),
      desc: t('home.hero.liveDesc'),
      image: '/images/hero-live.png',
      accent: '#ef4444',
    },
    {
      id: 'casino', title: t('home.hero.casino'), path: '/casino', cta: t('home.hero.exploreGames'),
      desc: t('home.hero.casinoDesc'),
      image: '/images/hero-casino.png',
      accent: '#a78bfa',
    },
  ];

  // Kampanya banner'ları — sadece üstteki döner slider'a eklenir, Quick Nav Cards
  // grid'ine (HERO_SLIDES.slice(1)) karışmaz. A4: admin panelinden sıra/metin
  // override edilebilir (resolveBanners), override yoksa çevrilmiş varsayılana düşer.
  const promoSlides = resolveBanners(getPromoSlides(t), pageContent?.banners);
  const sectionOrder = resolveSectionOrder(pageContent?.sectionOrder);
  const ALL_SLIDES = [...promoSlides, ...HERO_SLIDES];

  const GAMES = [
    { name: t('games.crash.title'), path: '/games/crash', accent: '#f97316', image: '/images/games/crash.png' },
    { name: t('games.mines.title'),     path: '/games/mines', accent: '#34d399', image: '/images/games/mines.png' },
    { name: t('games.plinko.title'),    path: '/games/plinko', accent: '#a78bfa', image: '/images/games/plinko.png' },
    { name: t('games.dice.title'),      path: '/games/dice', accent: '#22d3ee', image: '/images/games/dice.png' },
    { name: t('games.limbo.title'),     path: '/games/limbo', accent: '#f472b6', image: '/images/games/limbo.png' },
    { name: t('games.wheel.title'),     path: '/games/wheel', accent: '#fbbf24', image: '/images/games/wheel.png' },
    { name: t('games.roulette.title'),  path: '/games/roulette', accent: '#f87171', image: '/images/games/roulette.png' },
    { name: t('games.blackjack.title'), path: '/games/blackjack', accent: '#4ade80', image: '/images/games/blackjack.png' },
    { name: t('games.baccarat.title'),  path: '/games/baccarat', accent: '#eab308', image: '/images/games/baccarat.png' },
    { name: t('games.keno.title'),      path: '/games/keno', accent: '#2dd4bf', image: '/images/games/keno.png' },
    { name: t('games.hilo.title'),      path: '/games/hilo', accent: '#818cf8', image: '/images/games/hilo.png' },
    { name: t('games.dragontiger.title'), path: '/games/dragontiger', accent: '#fb923c', image: '/images/games/dragontiger.png' },
  ];

  const FEATURES = [
    { icon: 'bolt', title: t('home.features.fastPayouts'), desc: t('home.features.fastPayoutsDesc') },
    { icon: 'shield', title: t('home.features.trustworthy'), desc: t('home.features.trustworthyDesc') },
    { icon: 'redeem', title: t('home.features.bonuses'), desc: t('home.features.bonusesDesc') },
    { icon: 'support_agent', title: t('home.features.support'), desc: t('home.features.supportDesc') },
  ];

  const QUICK_CATEGORIES = [
    { label: t('nav.sports'), path: '/bahis', icon: 'sports_soccer', accent: '#00d4ff' },
    { label: t('nav.live'), path: '/canli', icon: 'sensors', accent: '#ef4444' },
    { label: t('nav.casino'), path: '/casino', icon: 'casino', accent: '#a78bfa' },
    { label: t('nav.promotions'), path: '/promotions', icon: 'redeem', accent: '#f0b429' },
    { label: t('nav.helpCenter'), path: '/help', icon: 'support_agent', accent: '#34d399' },
  ];

  const TRUST_BADGES = [
    { icon: 'shield', label: t('home.trust.licensed') },
    { icon: 'verified', label: t('home.trust.provablyFair') },
    { icon: 'bolt', label: t('home.trust.instantPayout') },
    { icon: 'support_agent', label: t('home.trust.support') },
  ];

  const startTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrent(c => (c + 1) % ALL_SLIDES.length);
    }, 5000);
  };

  useEffect(() => {
    startTimer();
    return () => clearInterval(timerRef.current);
  }, [ALL_SLIDES.length]);

  useEffect(() => {
    Promise.all([
      api.get('/events?status=live&limit=6'),
      api.get('/events?status=upcoming&limit=6'),
    ])
      .then(([liveRes, upRes]) => {
        if (liveRes.data.events?.length) setLiveEvents(liveRes.data.events);
        if (upRes.data.events?.length) setUpcomingEvents(upRes.data.events);
      })
      .catch(() => {})
      .finally(() => setEventsLoading(false));
  }, []);

  function goTo(i) {
    setCurrent(i);
    startTimer();
  }

  const slide = ALL_SLIDES[current];
  const slideIcon = SLIDE_ICONS[slide.id] || 'stars';

  return (
    <div className="min-h-full flex flex-col">
      <RecentWinnersTicker />
      {/* ── Hero Slider ──────────────────────────────────────── */}
      {sectionOrder.includes('hero') && (
      <section className="relative w-full h-[440px] sm:h-[560px] overflow-hidden" style={{ order: sectionOrder.indexOf('hero') }}>
        {ALL_SLIDES.map((s, i) => (
          <img
            key={s.id}
            src={s.image}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${
              i === current ? 'opacity-100' : 'opacity-0'
            }`}
            alt=""
            loading={i === 0 ? 'eager' : 'lazy'}
          />
        ))}

        {/* Tek yönlü karartma — fotoğraf sağda net kalır, metin solda okunur */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#060d1a] via-[#060d1a]/75 to-[#060d1a]/10 sm:to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#060d1a] via-transparent to-transparent" />

        <div
          className="absolute top-1/2 left-[15%] -translate-y-1/2 w-[520px] h-[520px] rounded-full opacity-[0.16] pointer-events-none transition-all duration-700"
          style={{ background: `radial-gradient(circle, ${slide.accent} 0%, transparent 70%)` }}
        />

        <div className="relative h-full max-w-6xl mx-auto px-4 flex flex-col justify-center">
          <div className="max-w-xl">
            <span
              className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] mb-4 px-3 py-1.5 rounded-full border font-ui"
              style={{
                color: slide.accent,
                borderColor: `${slide.accent}44`,
                background: `${slide.accent}14`,
              }}
            >
              <Icon name={slideIcon} className="!text-[15px]" />
              {slide.title}
            </span>
            <h1
              className="font-display text-4xl sm:text-6xl lg:text-7xl uppercase tracking-tight text-white mb-3 leading-[0.95]"
              style={{ textShadow: '0 4px 32px rgba(0,0,0,0.6)' }}
            >
              {slide.title}
            </h1>
            <p className="text-sm sm:text-lg text-white/75 mb-7 max-w-lg font-medium">
              {typeof slide.desc === 'function' ? slide.desc() : slide.desc}
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={() => navigate(slide.path)}
                className="px-7 py-3 rounded-lg text-sm font-extrabold uppercase tracking-wide transition-all hover:scale-105 active:scale-95 shadow-lg inline-flex items-center gap-2 font-ui"
                style={{ background: slide.accent, color: slide.accent === '#ef4444' ? 'white' : '#0a0f1a' }}
              >
                {slide.cta} <Icon name="arrow_forward" className="!text-[18px]" />
              </button>
            </div>

            {/* Güven rozetleri — endüstri standardı: lisans/fairness/ödeme/destek */}
            <div className="hidden sm:flex items-center gap-5 mt-8 flex-wrap">
              {TRUST_BADGES.map(b => (
                <span key={b.label} className="inline-flex items-center gap-1.5 text-xs font-bold text-white/60 font-ui">
                  <Icon name={b.icon} className="!text-[16px] text-gold" />
                  {b.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
          {ALL_SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`slide-${i}`}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: i === current ? '28px' : '8px',
                background: i === current ? slide.accent : 'rgba(255,255,255,0.25)',
                boxShadow: i === current ? `0 0 8px ${slide.accent}` : 'none',
              }}
            />
          ))}
        </div>

        <button
          onClick={() => goTo((current - 1 + ALL_SLIDES.length) % ALL_SLIDES.length)}
          aria-label="prev"
          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 hover:opacity-100 transition hover:bg-black/60 backdrop-blur-sm"
          style={{ border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <Icon name="chevron_left" />
        </button>
        <button
          onClick={() => goTo((current + 1) % ALL_SLIDES.length)}
          aria-label="next"
          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 hover:opacity-100 transition hover:bg-black/60 backdrop-blur-sm"
          style={{ border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <Icon name="chevron_right" />
        </button>
      </section>
      )}

      {/* ── Hızlı Kategori Şeridi ────────────────────────────── */}
      {/* İkon + döşeme deseni — oddsSource/Exonbet gibi büyük sitelerde hero'nun
          hemen altında standart olan, taranabilir kategori girişi. Önceki
          sürüm burada 3 büyük fotoğraflı kart kullanıyordu; fotoğraflar zaten
          hero'da gösterildiği için tekrar oluyordu, bu daha yoğun/tanıdık
          şerit onun yerini alıyor. */}
      {sectionOrder.includes('quickNav') && (
      <section className="max-w-6xl mx-auto px-4 mt-6 sm:mt-8 pb-14" style={{ order: sectionOrder.indexOf('quickNav') }}>
        <div className="flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar sm:grid sm:grid-cols-5">
          {QUICK_CATEGORIES.map(c => (
            <Link
              key={c.path}
              to={c.path}
              className="group flex flex-col items-center gap-2.5 rounded-2xl px-4 py-5 shrink-0 w-[104px] sm:w-auto transition-all duration-200 hover:-translate-y-0.5"
              style={{ background: '#0d1526', border: '1px solid #ffffff0f' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = `${c.accent}55`; e.currentTarget.style.boxShadow = `0 0 20px ${c.accent}22`; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#ffffff0f'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <span
                className="inline-flex items-center justify-center w-12 h-12 rounded-full transition-transform duration-200 group-hover:scale-110"
                style={{ background: `${c.accent}1c`, border: `1px solid ${c.accent}44` }}
              >
                <Icon name={c.icon} className="!text-[22px]" style={{ color: c.accent }} />
              </span>
              <span className="text-xs font-bold text-text-1 text-center font-ui">{c.label}</span>
            </Link>
          ))}
        </div>
      </section>
      )}

      {/* ── Özel Oyunlar ─────────────────────────────────────── */}
      {sectionOrder.includes('inhouseGames') && (
      <section className="border-t border-white/[0.04]" style={{ order: sectionOrder.indexOf('inhouseGames') }}>
        <div className="max-w-6xl mx-auto px-4 py-16">
          <div className="flex items-end justify-between mb-8 flex-wrap gap-3">
            <div>
              <h2 className="font-display text-3xl sm:text-4xl uppercase tracking-wide text-text-1 mb-1">{t('home.games.exclusive')}</h2>
              <p className="text-sm text-text-2 font-ui">{t('home.games.exclusiveDesc')}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gold border border-gold/30 bg-gold-soft rounded-full px-3 py-1.5 font-ui">
              <Icon name="verified" className="!text-[14px]" />
              {t('home.games.provablyFairBadge')}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 sm:gap-4">
            {GAMES.map(g => (
              <Link
                key={g.path}
                to={g.path}
                className="group relative rounded-xl overflow-hidden transition-all duration-200 text-center"
                style={{
                  background: '#0d1526',
                  border: '1px solid #ffffff0a',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = `${g.accent}55`;
                  e.currentTarget.style.boxShadow = `0 0 20px ${g.accent}2a`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#ffffff0a';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div className="aspect-[3/4] relative overflow-hidden">
                  <img
                    src={g.image}
                    alt={g.name}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-black/10" />
                  <span
                    className="absolute top-2 left-2 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded font-ui"
                    style={{ background: 'rgba(6,13,26,0.75)', color: '#f0b429', border: '1px solid rgba(240,180,41,0.35)' }}
                  >
                    <Icon name="diamond" className="!text-[10px]" />
                    {t('home.games.originalBadge')}
                  </span>
                  <div className="absolute bottom-0 left-0 right-0 p-2.5">
                    <span className="text-sm font-extrabold block font-ui" style={{ color: g.accent }}>{g.name}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* ── ⚽ Spor Bahisleri — Öne Çıkan Maçlar ────────────── */}
      {sectionOrder.includes('sportsBets') && (
      <section className="border-t border-white/[0.04]" style={{ order: sectionOrder.indexOf('sportsBets') }}>
        <div className="max-w-6xl mx-auto px-4 py-10">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="font-display text-3xl sm:text-4xl uppercase tracking-wide text-text-1 flex items-center gap-2.5">
                <Icon name="sports_soccer" className="!text-[26px] text-cyan-400" />
                {t('home.sports.title')}
              </h2>
              <p className="text-sm text-text-2 mt-1 font-ui">{t('home.sports.subtitle')}</p>
            </div>
            <Link
              to="/bahis"
              className="hidden sm:inline-flex items-center gap-1 text-xs font-extrabold uppercase tracking-wide px-4 py-2 rounded-lg transition-all hover:gap-2 font-ui"
              style={{ background: '#00d4ff', color: '#000' }}
            >
              {t('home.sports.allSports')}
            </Link>
          </div>

          {!eventsLoading && upcomingEvents.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider font-ui">{t('home.sports.upcoming')}</span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {upcomingEvents.slice(0, 6).map(ev => (
                  <MiniEventCard key={ev._id} event={ev} live={false} />
                ))}
              </div>
            </div>
          )}

          <Link
            to="/bahis"
            className="sm:hidden mt-4 flex items-center justify-center gap-1 text-xs font-extrabold uppercase px-4 py-2.5 rounded-xl transition-all font-ui"
            style={{ background: '#00d4ff', color: '#000' }}
          >
            {t('home.sports.exploreAll')}
          </Link>
        </div>
      </section>
      )}

      {/* ── 🔴 Canlı Bahis — Öne Çıkan Maçlar ────────────────── */}
      {sectionOrder.includes('liveBets') && (
      <section className="border-t border-white/[0.04]" style={{ order: sectionOrder.indexOf('liveBets') }}>
        <div className="max-w-6xl mx-auto px-4 py-10">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="font-display text-3xl sm:text-4xl uppercase tracking-wide text-text-1 flex items-center gap-2.5">
                <Icon name="sensors" className="!text-[26px] text-red-400" />
                {t('home.live.title')}
              </h2>
              <p className="text-sm text-text-2 mt-1 font-ui">{t('home.live.subtitle')}</p>
            </div>
            <Link
              to="/canli"
              className="hidden sm:inline-flex items-center gap-1 text-xs font-extrabold uppercase tracking-wide px-4 py-2 rounded-lg transition-all hover:gap-2 font-ui"
              style={{ background: '#ef4444', color: '#fff' }}
            >
              {t('home.live.allLive')}
            </Link>
          </div>

          {!eventsLoading && liveEvents.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                <span className="text-xs font-bold text-red-400 uppercase tracking-wider font-ui">{t('home.live.liveNow')}</span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {liveEvents.slice(0, 6).map(ev => (
                  <MiniEventCard key={ev._id} event={ev} live />
                ))}
              </div>
            </div>
          )}

          <Link
            to="/canli"
            className="sm:hidden mt-4 flex items-center justify-center gap-1 text-xs font-extrabold uppercase px-4 py-2.5 rounded-xl transition-all font-ui"
            style={{ background: '#ef4444', color: '#fff' }}
          >
            {t('home.live.joinLive')}
          </Link>
        </div>
      </section>
      )}

      {/* ── Features ────────────────────────────────────────── */}
      {sectionOrder.includes('features') && (
      <section className="relative border-t border-white/[0.04] overflow-hidden" style={{ order: sectionOrder.indexOf('features') }}>
        <div
          className="absolute inset-0 opacity-40"
          style={{ backgroundImage: "url(/images/features-texture.png)", backgroundSize: 'cover', backgroundPosition: 'center' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#060d1a] via-[#060d1a]/85 to-[#060d1a]" />
        <div className="relative max-w-6xl mx-auto px-4 py-16">
          <div className="text-center mb-10">
            <h2 className="font-display text-3xl sm:text-4xl uppercase tracking-wide text-text-1 mb-2">{t('home.features.title')}</h2>
            <p className="text-sm text-text-2 font-ui">{t('home.features.subtitle')}</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map(f => (
              <div
                key={f.title}
                className="rounded-2xl p-6 text-center transition-all duration-200 hover:-translate-y-1"
                style={{
                  background: 'linear-gradient(135deg, rgba(17,29,48,0.85) 0%, rgba(13,21,38,0.85) 100%)',
                  border: '1px solid #ffffff0f',
                }}
              >
                <span
                  className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-3"
                  style={{ background: 'rgba(240,180,41,0.12)', border: '1px solid rgba(240,180,41,0.3)' }}
                >
                  <Icon name={f.icon} className="!text-[22px] text-gold" />
                </span>
                <h4 className="text-sm font-bold text-text-1 mb-1 font-ui">{f.title}</h4>
                <p className="text-xs text-text-3 font-ui">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* ── Bottom CTA ──────────────────────────────────────── */}
      {sectionOrder.includes('bottomCta') && (
      <section className="max-w-6xl mx-auto px-4 pb-20" style={{ order: sectionOrder.indexOf('bottomCta') }}>
        <div
          className="relative rounded-2xl overflow-hidden p-8 sm:p-14 text-center"
          style={{
            border: '1px solid #ffffff14',
            boxShadow: BRAND_GLOW,
          }}
        >
          <img
            src="/images/cta-bg-v2.png"
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#060d1a]/95 via-[#060d1a]/55 to-[#060d1a]/70" />
          <div className="relative">
            <span
              className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-5"
              style={{ background: 'rgba(240,180,41,0.15)', border: '1px solid rgba(240,180,41,0.4)' }}
            >
              <Icon name="workspace_premium" className="!text-[28px] text-gold" />
            </span>
            <h2 className="font-display text-3xl sm:text-5xl uppercase tracking-wide text-text-1 mb-7">{t('home.cta.title')}</h2>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={() => navigate('/bahis')}
                className="px-7 py-3 rounded-lg text-sm font-extrabold uppercase tracking-wide text-black transition-all hover:scale-105 active:scale-95 shadow-lg font-ui"
                style={{ background: BRAND_GRADIENT_H }}
              >
                {t('home.cta.getStarted')}
              </button>
              <button
                onClick={() => navigate('/casino')}
                className="px-7 py-3 rounded-lg text-sm font-extrabold uppercase tracking-wide text-black transition-all hover:scale-105 active:scale-95 shadow-lg font-ui"
                style={{ background: 'linear-gradient(90deg, #f0b429 0%, #ffd66b 100%)' }}
              >
                {t('home.cta.register')}
              </button>
            </div>
          </div>
        </div>
      </section>
      )}

      <BetSlip />
    </div>
  );
}
