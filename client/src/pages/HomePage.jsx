import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from '../i18n';
import api from '../services/api';
import MiniEventCard from '../components/MiniEventCard';
import BetSlip from '../components/BetSlip';
import RecentWinnersTicker from '../components/RecentWinnersTicker';
import HomeSidebar from '../components/home/HomeSidebar';
import WinnersPanel from '../components/home/WinnersPanel';
import PromoPanel from '../components/home/PromoPanel';
import { resolveSectionOrder, resolveBanners } from './home/pageContent';
import { getPromoSlides } from './home/promoSlides';
import { HOME_GREEN, HOME_BG, HOME_CARD, HOME_BORDER } from './home/homeTheme';

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
    },
    {
      id: 'sports', title: t('home.hero.sports'), path: '/bahis', cta: t('home.hero.betNow'),
      desc: t('home.hero.sportsDesc'),
      image: '/images/hero-sports.png',
    },
    {
      id: 'live', title: t('home.hero.live'), path: '/canli', cta: t('home.hero.watchLive'),
      desc: t('home.hero.liveDesc'),
      image: '/images/hero-live.png',
    },
    {
      id: 'casino', title: t('home.hero.casino'), path: '/casino', cta: t('home.hero.exploreGames'),
      desc: t('home.hero.casinoDesc'),
      image: '/images/hero-casino.png',
    },
  ];

  // Kampanya banner'ları — sadece üstteki döner slider'a eklenir. A4: admin
  // panelinden sıra/metin override edilebilir (resolveBanners), override
  // yoksa çevrilmiş varsayılana düşer.
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

  const TRUST_BADGES = [
    { icon: 'shield', label: t('home.trust.licensed') },
    { icon: 'verified', label: t('home.trust.provablyFair') },
    { icon: 'bolt', label: t('home.trust.instantPayout') },
    { icon: 'support_agent', label: t('home.trust.support') },
  ];

  // Alt güven/istatistik şeridi — betface.png referansındaki "10.000+ Oyun /
  // 50.000+ Kullanıcı / %98 Memnuniyet" gibi doğrulanamayan pazarlama
  // rakamları BİLEREK kopyalanmadı; yalnızca kod tabanında gerçekten
  // doğrulanabilen sayılar kullanıldı (13 in-house oyun, 15+ spor dalı gibi).
  const STATS = [
    { icon: 'diamond', value: String(GAMES.length), label: t('home.stats.games') },
    { icon: 'sports_soccer', value: '15+', label: t('home.stats.sports') },
    { icon: 'support_agent', value: '7/24', label: t('home.stats.support') },
    { icon: 'verified', value: '100%', label: t('home.stats.provablyFair') },
  ];

  // Gerçekten desteklenen ödeme yöntemleri (bkz. nav.bankTransfer/nav.crypto) —
  // referans görseldeki Visa/Mastercard/PayFix/Bitcoin/Tether logoları bizde
  // karşılığı olmadığı için kopyalanmadı.
  const PAYMENT_METHODS = [
    { icon: 'account_balance', label: t('nav.bankTransfer') },
    { icon: 'currency_bitcoin', label: t('nav.crypto') },
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
    <div className="min-h-full lg:flex lg:gap-6 lg:max-w-[1400px] lg:mx-auto lg:px-6 lg:pt-6 lg:items-start">
      <HomeSidebar />
      <div className="flex-1 min-w-0 flex flex-col">
      <RecentWinnersTicker />

      {/* ── Hero + Sağ Ray (Kazananlar/Promosyonlar, lg+) ─────── */}
      <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-5">
      {sectionOrder.includes('hero') && (
      <section
        className="relative w-full h-[460px] sm:h-[420px] overflow-hidden lg:rounded-2xl"
        style={{ order: sectionOrder.indexOf('hero'), background: HOME_BG }}
      >
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

        {/* Sol taraf koyu/opak (metin), sağ tarafta fotoğraf görünür — referanstaki gibi */}
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(90deg, ${HOME_BG} 0%, ${HOME_BG} 38%, ${HOME_BG}cc 52%, transparent 78%)` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />
        <div
          className="absolute -top-20 -left-20 w-[420px] h-[420px] rounded-full opacity-20 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${HOME_GREEN} 0%, transparent 70%)` }}
        />

        <div className="relative h-full max-w-6xl mx-auto px-5 sm:px-8 flex flex-col justify-center">
          <div className="max-w-md">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider mb-4 px-2.5 py-1 rounded bg-white/[0.06] text-white/60 font-ui">
              <Icon name={slideIcon} className="!text-[13px]" />
              {slide.title}
            </span>
            <h1 className="text-3xl sm:text-[34px] font-extrabold uppercase leading-[1.08] text-white mb-3 font-ui tracking-tight">
              {slide.title}
            </h1>
            <p className="text-sm text-white/60 mb-6 max-w-sm font-ui">
              {typeof slide.desc === 'function' ? slide.desc() : slide.desc}
            </p>
            <button
              onClick={() => navigate(slide.path)}
              className="px-6 py-2.5 rounded-lg text-sm font-bold transition-all hover:brightness-110 active:scale-95 inline-flex items-center gap-2 font-ui"
              style={{ background: HOME_GREEN, color: '#08110b' }}
            >
              {slide.cta}
            </button>

            {/* Güven rozetleri — endüstri standardı: lisans/fairness/ödeme/destek */}
            <div className="hidden sm:flex items-center gap-4 mt-6 flex-wrap">
              {TRUST_BADGES.map(b => (
                <span key={b.label} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/45 font-ui">
                  <Icon name={b.icon} className="!text-[14px]" style={{ color: HOME_GREEN }} />
                  {b.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="absolute bottom-4 sm:bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5">
          {ALL_SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`slide-${i}`}
              className="h-[7px] rounded-full transition-all duration-300"
              style={{
                width: i === current ? '22px' : '7px',
                background: i === current ? HOME_GREEN : 'rgba(255,255,255,0.25)',
              }}
            />
          ))}
        </div>

        <button
          onClick={() => goTo((current - 1 + ALL_SLIDES.length) % ALL_SLIDES.length)}
          aria-label="prev"
          className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white items-center justify-center opacity-0 hover:opacity-100 transition hover:bg-black/60 backdrop-blur-sm"
        >
          <Icon name="chevron_left" className="!text-[20px]" />
        </button>
        <button
          onClick={() => goTo((current + 1) % ALL_SLIDES.length)}
          aria-label="next"
          className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white items-center justify-center opacity-0 hover:opacity-100 transition hover:bg-black/60 backdrop-blur-sm"
        >
          <Icon name="chevron_right" className="!text-[20px]" />
        </button>
      </section>
      )}
      <div className="hidden lg:flex lg:flex-col lg:gap-4">
        <WinnersPanel />
        <PromoPanel />
      </div>
      </div>

      {/* ── Özel Oyunlar ─────────────────────────────────────── */}
      {sectionOrder.includes('inhouseGames') && (
      <section className="mt-8" style={{ order: sectionOrder.indexOf('inhouseGames') }} id="ozel-oyunlar">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-end justify-between mb-4 flex-wrap gap-3">
            <h2 className="text-xl font-extrabold text-white font-ui">{t('home.games.exclusive')}</h2>
            <span
              className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide rounded-full px-3 py-1 font-ui"
              style={{ color: HOME_GREEN, border: `1px solid ${HOME_GREEN}44`, background: `${HOME_GREEN}14` }}
            >
              <Icon name="verified" className="!text-[13px]" />
              {t('home.games.provablyFairBadge')}
            </span>
          </div>
          <div className="flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar pb-1">
            {GAMES.map(g => (
              <Link
                key={g.path}
                to={g.path}
                className="group relative rounded-xl overflow-hidden transition-all duration-200 text-center shrink-0 w-[140px] sm:w-[160px]"
                style={{ background: HOME_CARD, border: `1px solid ${HOME_BORDER}` }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = `${HOME_GREEN}66`; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = HOME_BORDER; }}
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
                    style={{ background: 'rgba(10,15,13,0.75)', color: HOME_GREEN, border: `1px solid ${HOME_GREEN}55` }}
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
      <section className="mt-10" style={{ order: sectionOrder.indexOf('sportsBets') }}>
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-xl font-extrabold text-white flex items-center gap-2 font-ui">
                <Icon name="sports_soccer" className="!text-[20px] text-cyan-400" />
                {t('home.sports.title')}
              </h2>
              <p className="text-xs text-[#7d8a83] mt-1 font-ui">{t('home.sports.subtitle')}</p>
            </div>
            <Link
              to="/bahis"
              className="hidden sm:inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg transition-all hover:gap-2 font-ui"
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
      <section className="mt-10" style={{ order: sectionOrder.indexOf('liveBets') }}>
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-xl font-extrabold text-white flex items-center gap-2 font-ui">
                <Icon name="sensors" className="!text-[20px] text-red-400" />
                {t('home.live.title')}
              </h2>
              <p className="text-xs text-[#7d8a83] mt-1 font-ui">{t('home.live.subtitle')}</p>
            </div>
            <Link
              to="/canli"
              className="hidden sm:inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg transition-all hover:gap-2 font-ui"
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
      <section className="mt-10" style={{ order: sectionOrder.indexOf('features') }}>
        <div className="max-w-6xl mx-auto px-4">
          <div className="mb-5">
            <h2 className="text-xl font-extrabold text-white font-ui">{t('home.features.title')}</h2>
            <p className="text-xs text-[#7d8a83] mt-1 font-ui">{t('home.features.subtitle')}</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {FEATURES.map(f => (
              <div
                key={f.title}
                className="rounded-xl p-5 transition-all duration-200 hover:-translate-y-0.5"
                style={{ background: HOME_CARD, border: `1px solid ${HOME_BORDER}` }}
              >
                <span
                  className="inline-flex items-center justify-center w-10 h-10 rounded-lg mb-3"
                  style={{ background: `${HOME_GREEN}1c` }}
                >
                  <Icon name={f.icon} className="!text-[19px]" style={{ color: HOME_GREEN }} />
                </span>
                <h4 className="text-sm font-bold text-white mb-1 font-ui">{f.title}</h4>
                <p className="text-xs text-[#7d8a83] font-ui">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* ── Bottom CTA ──────────────────────────────────────── */}
      {sectionOrder.includes('bottomCta') && (
      <section className="max-w-6xl mx-auto px-4 mt-10 mb-14" style={{ order: sectionOrder.indexOf('bottomCta') }}>
        <div
          className="relative rounded-2xl overflow-hidden p-8 sm:p-12 text-center"
          style={{ border: `1px solid ${HOME_BORDER}` }}
        >
          <img src="/images/cta-bg-v2.png" alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: `linear-gradient(0deg, ${HOME_BG}f2 0%, ${HOME_BG}b0 55%, ${HOME_BG}b0 100%)` }} />
          <div className="relative">
            <span
              className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-4"
              style={{ background: `${HOME_GREEN}22`, border: `1px solid ${HOME_GREEN}55` }}
            >
              <Icon name="workspace_premium" className="!text-[24px]" style={{ color: HOME_GREEN }} />
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold uppercase text-white mb-6 font-ui">{t('home.cta.title')}</h2>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={() => navigate('/bahis')}
                className="px-6 py-2.5 rounded-lg text-sm font-bold transition-all hover:brightness-110 active:scale-95 font-ui"
                style={{ background: HOME_GREEN, color: '#08110b' }}
              >
                {t('home.cta.getStarted')}
              </button>
              <button
                onClick={() => navigate('/casino')}
                className="px-6 py-2.5 rounded-lg text-sm font-bold transition-all hover:bg-white/10 font-ui"
                style={{ border: `1px solid ${HOME_GREEN}66`, color: HOME_GREEN }}
              >
                {t('home.cta.register')}
              </button>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* ── Güven/istatistik + ödeme şeridi ───────────────────── */}
      <section className="border-t" style={{ borderColor: HOME_BORDER }}>
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            {STATS.map(s => (
              <div key={s.label} className="flex items-center gap-2.5">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0" style={{ background: HOME_CARD, border: `1px solid ${HOME_BORDER}` }}>
                  <Icon name={s.icon} className="!text-[17px]" style={{ color: HOME_GREEN }} />
                </span>
                <div className="leading-tight text-left">
                  <div className="text-sm font-extrabold text-white font-ui">{s.value}</div>
                  <div className="text-[10px] text-[#7d8a83] uppercase tracking-wide font-ui">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4">
            {PAYMENT_METHODS.map(p => (
              <span key={p.label} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#7d8a83] font-ui">
                <Icon name={p.icon} className="!text-[17px]" />
                {p.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <BetSlip />
      </div>
    </div>
  );
}
