import { Fragment, useState, useEffect, useRef, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from '../i18n';
import api from '../services/api';
import BetSlip, { SlipContent } from '../components/BetSlip';
import { useBetSlipStore } from '../store/betSlipStore';
import RecentWinnersTicker from '../components/RecentWinnersTicker';
import HomeSidebar from '../components/home/HomeSidebar';
import WinnersPanel from '../components/home/WinnersPanel';
import PromoPanel from '../components/home/PromoPanel';
import { resolveSectionOrder, resolveBanners } from './home/pageContent';
import { getPromoSlides } from './home/promoSlides';
import { HOME_BG, HOME_CARD, HOME_BORDER } from './home/homeTheme';

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

// Palace agregatörden gerçek/lisanslı oyun kataloğu çekilecek sağlayıcılar
// (bkz. GET /api/palace/providers) — T3'te bağlanan gerçek kontrat. Belirli
// oyun görselleri/başlıkları burada kod içine GÖMÜLMEDİ (T5 varlık denetiminde
// lisanssız Pragmatic Play/BGaming verisi tam da bu yüzden silinmişti) —
// hepsi çalışma zamanında Palace'ın kendi CDN'inden canlı çekiliyor.
const PALACE_PROVIDER_IDS = [1, 15]; // Pragmatic Play, Spribe

function Icon({ name, className = '', style }) {
  return <span className={`material-symbols-outlined ${className}`} style={style} aria-hidden="true">{name}</span>;
}

function PalaceGameCard({ game }) {
  const symbol = game.game_code;
  const name = game.game_name;
  const image = game.game_image_narrow || game.game_image;
  return (
    <Link
      to={`/palace/${encodeURIComponent(symbol)}?name=${encodeURIComponent(name)}`}
      className="group relative rounded-xl overflow-hidden transition-all duration-200 text-center shrink-0 w-[140px] sm:w-[150px]"
      style={{ background: HOME_CARD, border: `1px solid ${HOME_BORDER}` }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary) 40%, transparent)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = HOME_BORDER; }}
    >
      <div className="aspect-[3/4] relative overflow-hidden">
        <img
          src={image}
          alt={name}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          onError={e => { e.currentTarget.closest('a').style.display = 'none'; }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-2">
          <span className="text-[11px] font-bold text-white block truncate font-ui">{name}</span>
        </div>
      </div>
    </Link>
  );
}

function GameRowSection({ id, icon, title, subtitle, viewAllTo, viewAllLabel, children }) {
  return (
    <section className="mt-8" id={id}>
      <div className="px-4">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="text-lg font-extrabold text-white flex items-center gap-2 font-ui">
              <Icon name={icon} className="!text-[19px]" style={{ color: 'var(--color-primary)' }} />
              {title}
            </h2>
            {subtitle && <p className="text-xs text-[#7d8a83] mt-0.5 font-ui">{subtitle}</p>}
          </div>
          {viewAllTo && (
            <Link to={viewAllTo} className="hidden sm:inline-flex items-center gap-1 text-xs font-bold font-ui text-[#c8ced2] hover:text-white">
              {viewAllLabel}
            </Link>
          )}
        </div>
        <div className="flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar pb-1">
          {children}
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const betSlipSelections = useBetSlipStore(s => s.selections);
  const [current, setCurrent] = useState(0);
  const timerRef = useRef(null);
  const [pageContent, setPageContent] = useState(null);
  const [palaceGames, setPalaceGames] = useState([]);

  useEffect(() => {
    api.get('/pages/home').then(({ data }) => setPageContent(data?.content || null)).catch(() => {});
  }, []);

  // Palace agregatörden gerçek katalog — hiçbir oyun adı/görseli kod içinde
  // sabit değil, hepsi burada canlı çekiliyor (bkz. yukarıdaki not).
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      PALACE_PROVIDER_IDS.map(provider_id =>
        api.post('/palace/games', { lang: 'tr', provider_id }).then(r => r.data?.data || []).catch(() => [])
      )
    ).then(lists => {
      if (cancelled) return;
      setPalaceGames(lists.flat().filter(g => g.launch_enable !== false));
    });
    return () => { cancelled = true; };
  }, []);

  const { popularGames, slotGames, newGames } = useMemo(() => {
    const slots = palaceGames.filter(g => g.category === 'Slots');
    const byDateDesc = [...palaceGames].sort((a, b) => new Date(b.reg_date) - new Date(a.reg_date));
    return {
      popularGames: palaceGames.slice(0, 10),
      slotGames: slots.slice(0, 10),
      newGames: byDateDesc.slice(0, 10),
    };
  }, [palaceGames]);

  const HERO_SLIDES = [
    { id: 'welcome', title: t('home.hero.welcome'), path: '/bahis', cta: t('home.hero.getStarted'), desc: t('home.hero.welcomeDesc'), image: '/images/welcome-banner.png' },
    { id: 'sports', title: t('home.hero.sports'), path: '/bahis', cta: t('home.hero.betNow'), desc: t('home.hero.sportsDesc'), image: '/images/hero-sports.png' },
    { id: 'live', title: t('home.hero.live'), path: '/canli', cta: t('home.hero.watchLive'), desc: t('home.hero.liveDesc'), image: '/images/hero-live.png' },
    { id: 'casino', title: t('home.hero.casino'), path: '/casino', cta: t('home.hero.exploreGames'), desc: t('home.hero.casinoDesc'), image: '/images/hero-casino.png' },
  ];

  const promoSlides = resolveBanners(getPromoSlides(t), pageContent?.banners);
  const sectionOrder = resolveSectionOrder(pageContent?.sectionOrder);
  const ALL_SLIDES = [...promoSlides, ...HERO_SLIDES];

  const INHOUSE_GAMES = [
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

  const slide = ALL_SLIDES[current];
  const slideIcon = SLIDE_ICONS[slide.id] || 'stars';

  // A4 sırası map ile uygulanıyor (flex `order` CSS'i DEĞİL — hero sağ-ray
  // grid'ine taşındığında o yaklaşım yanlış elemente uygulanmış kalıyordu ve
  // istatistik şeridi/BetSlip oyun kartlarından ÖNCE görünüyordu).
  const SECTIONS = {
    hero: sectionOrder.includes('hero') ? (
      <div className="lg:grid lg:grid-cols-[1fr_260px] lg:gap-4">
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
        <div className="hidden lg:flex lg:flex-col lg:gap-4">
          <WinnersPanel />
          <PromoPanel />
          {/* Bet slip yalnızca aktif bir seçim varsa (ör. başka sayfadan
              gelen bir bahis kuponu) sağ rayda gösterilir — anasayfada
              spor bahis içeriği yok, boş kupon burada anlamsız/kafa
              karıştırıcı olurdu. */}
          {betSlipSelections.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ background: HOME_CARD, border: `1px solid ${HOME_BORDER}` }}>
              <SlipContent />
            </div>
          )}
        </div>
      </div>
    ) : null,

    inhouseGames: sectionOrder.includes('inhouseGames') ? (
      <GameRowSection id="ozel-oyunlar" icon="diamond" title={t('home.games.exclusive')} subtitle={t('home.games.exclusiveDesc')}>
        {INHOUSE_GAMES.map(g => (
          <Link key={g.path} to={g.path} className="group relative rounded-xl overflow-hidden transition-all duration-200 text-center shrink-0 w-[140px] sm:w-[150px]"
            style={{ background: HOME_CARD, border: `1px solid ${HOME_BORDER}` }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = `${g.accent}66`; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = HOME_BORDER; }}
          >
            <div className="aspect-[3/4] relative overflow-hidden">
              <img src={g.image} alt={g.name} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" onError={e => { e.currentTarget.style.display = 'none'; }} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-black/10" />
              <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded font-ui"
                style={{ background: 'rgba(2,8,13,0.75)', color: 'var(--color-primary)', border: '1px solid color-mix(in srgb, var(--color-primary) 40%, transparent)' }}>
                <Icon name="diamond" className="!text-[10px]" />
                {t('home.games.originalBadge')}
              </span>
              <div className="absolute bottom-0 left-0 right-0 p-2.5">
                <span className="text-sm font-extrabold block font-ui" style={{ color: g.accent }}>{g.name}</span>
              </div>
            </div>
          </Link>
        ))}
      </GameRowSection>
    ) : null,

    popularGames: popularGames.length > 0 ? (
      <GameRowSection id="popular-oyunlar" icon="whatshot" title={t('home.sidebar.popularGames')} viewAllTo="/casino" viewAllLabel={t('home.games.viewAll')}>
        {popularGames.map(g => <PalaceGameCard key={g.game_code} game={g} />)}
      </GameRowSection>
    ) : null,

    slotGames: slotGames.length > 0 ? (
      <GameRowSection id="slot-oyunlari" icon="casino" title={t('home.sidebar.slotGames')} viewAllTo="/casino" viewAllLabel={t('home.games.viewAll')}>
        {slotGames.map(g => <PalaceGameCard key={g.game_code} game={g} />)}
      </GameRowSection>
    ) : null,

    newGames: newGames.length > 0 ? (
      <GameRowSection id="yeni-oyunlar" icon="fiber_new" title={t('home.sidebar.newGames')} viewAllTo="/casino" viewAllLabel={t('home.games.viewAll')}>
        {newGames.map(g => <PalaceGameCard key={g.game_code} game={g} />)}
      </GameRowSection>
    ) : null,
  };

  const SECTION_KEYS = ['hero', 'popularGames', 'inhouseGames', 'slotGames', 'newGames'];

  return (
    <div className="min-h-full lg:flex lg:gap-5 lg:px-5 lg:pt-5 lg:items-start">
      <HomeSidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <RecentWinnersTicker />

        {sectionOrder.includes('hero') && <Fragment key="hero">{SECTIONS.hero}</Fragment>}
        {SECTION_KEYS.filter(k => k !== 'hero').map(id => (SECTIONS[id] ? <Fragment key={id}>{SECTIONS[id]}</Fragment> : null))}

        {/* Tüm Oyunlar — çoğaltma yapmadan gerçek tam katalog sayfasına yönlendirir */}
        <section className="mt-8">
          <div className="px-4">
            <Link
              to="/casino"
              className="flex items-center justify-between rounded-xl p-5 transition-colors group"
              style={{ background: HOME_CARD, border: `1px solid ${HOME_BORDER}` }}
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center w-11 h-11 rounded-lg" style={{ background: 'color-mix(in srgb, var(--color-primary) 14%, transparent)' }}>
                  <Icon name="apps" className="!text-[22px]" style={{ color: 'var(--color-primary)' }} />
                </span>
                <div>
                  <div className="text-sm font-extrabold text-white font-ui">{t('home.sidebar.allGames')}</div>
                  <div className="text-xs text-[#7d8a83] font-ui">{t('home.games.allGamesDesc')}</div>
                </div>
              </div>
              <Icon name="arrow_forward" className="!text-[20px] text-[#7d8a83] group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </section>

        {/* desktopHidden: masaüstü kupon yerleşimini yukarıda (sağ ray) kendimiz
            yönetiyoruz — burası yalnızca mobil bar/sheet davranışı için kalıyor. */}
        <BetSlip desktopHidden />
      </div>
    </div>
  );
}
