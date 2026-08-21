import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import MiniEventCard from '../components/MiniEventCard';
import BetSlip from '../components/BetSlip';
import { BRAND_GRADIENT, BRAND_GRADIENT_H, BRAND_GLOW } from '../styles/brand';


const HERO_SLIDES = [
  {
    id: 'welcome', icon: '💎', title: 'VIP90.bet\'e Hoşgeldin', path: '/bahis', cta: 'Hemen Başla',
    desc: 'En iyi spor bahisleri, canlı aksiyon ve casino deneyimi için hazır mısın?',
    image: '/images/welcome-banner.png',
    gradient: 'from-cyan-900/80 to-purple-900/60',
    accent: '#00d4ff',
  },
  {
    id: 'sports', icon: '⚽', title: 'Spor Bahisleri', path: '/bahis', cta: 'Bahis Yap',
    desc: 'Yüzlerce maç, en iyi oranlar. Futboldan basketbola, tenisten voleybola tüm spor dallarında bahis keyfi.',
    image: '/images/hero-sports.png',
    gradient: 'from-blue-900/80 to-cyan-900/60',
    accent: '#00d4ff',
  },
  {
    id: 'live', icon: '🔴', title: 'Canlı Bahis', path: '/canli', cta: 'Canlı İzle',
    desc: 'Maç anında bahis, anlık oran güncellemeleri. Kaçırmadan, anında karar ver ve kazan.',
    image: '/images/hero-live.png',
    gradient: 'from-rose-900/80 to-red-900/60',
    accent: '#ef4444',
  },
  {
    id: 'casino', icon: '🎰', title: 'Casino', path: '/casino', cta: 'Oyunları Keşfet',
    desc: 'Yüzlerce slot, masa oyunu ve canlı krupiye. In-house oyunlarımızla benzersiz casino deneyimi.',
    image: '/images/hero-casino.png',
    gradient: 'from-purple-900/80 to-violet-900/60',
    accent: '#a78bfa',
  },
];

// Kampanya banner'ları — sadece üstteki döner slider'a eklenir, Quick Nav Cards
// grid'ine (HERO_SLIDES.slice(1)) karışmaz.
const PROMO_SLIDES = [
  {
    id: 'deneme-bonusu', icon: '🎁', title: 'Deneme Bonusu', path: '/promotions', cta: 'Bonusu Al',
    desc: '500₺\'ye kadar deneme bonusuyla platformu risksiz keşfet, kazancını hemen değerlendir!',
    image: '/images/promo-deneme-bonusu.png',
    gradient: 'from-amber-900/80 to-yellow-900/60',
    accent: '#fbbf24',
  },
  {
    id: 'hosgeldin-bonusu', icon: '💰', title: 'Hoşgeldin Bonusu', path: '/promotions', cta: 'Hemen Yatır',
    desc: 'İlk para yatırmana %100 bonus, 1000₺\'ye kadar! Üyeliğini tamamla, bonusunu kap.',
    image: '/images/promo-hosgeldin-bonusu.png',
    gradient: 'from-emerald-900/80 to-green-900/60',
    accent: '#34d399',
  },
  {
    id: 'arkadasini-getir', icon: '🤝', title: 'Arkadaşını Getir', path: '/promotions', cta: 'Davet Et',
    desc: 'Arkadaşını getir, kazandığı her bahisten %10 kâr payı kazan. Ne kadar çok davet, o kadar çok kazanç!',
    image: '/images/promo-arkadasini-getir.png',
    gradient: 'from-pink-900/80 to-fuchsia-900/60',
    accent: '#f472b6',
  },
];

const ALL_SLIDES = [...PROMO_SLIDES, ...HERO_SLIDES];

const GAMES = [
  { name: 'Noel Baba', path: '/games/crash', accent: '#f97316', icon: '🎅', image: '/images/games/crash.png' },
  { name: 'Mines',     path: '/games/mines', accent: '#34d399', icon: '💎', image: '/images/games/mines.png' },
  { name: 'Plinko',    path: '/games/plinko', accent: '#a78bfa', icon: '🔵', image: '/images/games/plinko.png' },
  { name: 'Dice',      path: '/games/dice', accent: '#22d3ee', icon: '🎲', image: '/images/games/dice.png' },
  { name: 'Limbo',     path: '/games/limbo', accent: '#f472b6', icon: '📈', image: '/images/games/limbo.png' },
  { name: 'Wheel',     path: '/games/wheel', accent: '#fbbf24', icon: '🎡', image: '/images/games/wheel.png' },
  { name: 'Rulet',     path: '/games/roulette', accent: '#f87171', icon: '🎯', image: '/images/games/roulette.png' },
  { name: 'Blackjack', path: '/games/blackjack', accent: '#4ade80', icon: '🃏', image: '/images/games/blackjack.png' },
  { name: 'Bakara',    path: '/games/baccarat', accent: '#eab308', icon: '🏛️', image: '/images/games/baccarat.png' },
  { name: 'Keno',      path: '/games/keno', accent: '#2dd4bf', icon: '🎱', image: '/images/games/keno.png' },
  { name: 'Hi-Lo',     path: '/games/hilo', accent: '#818cf8', icon: '📊', image: '/images/games/hilo.png' },
  { name: 'Dragon Tiger', path: '/games/dragontiger', accent: '#fb923c', icon: '🐉', image: '/images/games/dragontiger.png' },
];

const FEATURES = [
  { icon: '⚡', title: 'Hızlı Ödemeler', desc: 'Kazancınızı anında çekin, bekleme yapmayın.' },
  { icon: '🛡️', title: 'Güvenilir', desc: 'Lisanslı ve denetlenmiş platform, verileriniz güvende.' },
  { icon: '🎁', title: 'Bonuslar', desc: 'Hoşgeldin bonusu, kayıp bonusu ve daha fazlası.' },
  { icon: '💬', title: '7/24 Destek', desc: 'Canlı yardım ile her an yanınızdayız.' },
];



export default function HomePage() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const timerRef = useRef(null);
  const [liveEvents, setLiveEvents] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  const startTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrent(c => (c + 1) % ALL_SLIDES.length);
    }, 5000);
  };

  useEffect(() => {
    startTimer();
    return () => clearInterval(timerRef.current);
  }, []);

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

  return (
    <div className="min-h-full">
      {/* ── Hero Slider ──────────────────────────────────────── */}
      <section className="relative w-full h-[360px] sm:h-[480px] overflow-hidden">
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

        <div className={`absolute inset-0 bg-gradient-to-r ${slide.gradient} transition-all duration-700`} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#060d1a] via-transparent to-black/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#060d1a] via-transparent to-[#060d1a]/60" />

        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.12] pointer-events-none"
          style={{ background: `radial-gradient(circle, ${slide.accent} 0%, transparent 70%)` }}
        />

        <div className="relative h-full max-w-6xl mx-auto px-4 flex items-center">
          <div className="max-w-xl">
            <span
              className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] mb-3 px-3 py-1 rounded-full border"
              style={{
                color: slide.accent,
                borderColor: `${slide.accent}44`,
                background: `${slide.accent}11`,
              }}
            >
              <span className="text-base">{slide.icon}</span>
              {slide.title}
            </span>
            <h1
              className="text-3xl sm:text-5xl lg:text-6xl font-black text-white mb-3 drop-shadow-2xl"
              style={{ textShadow: '0 2px 20px rgba(0,0,0,0.5)' }}
            >
              {slide.title}
            </h1>
            <p className="text-sm sm:text-lg text-white/70 mb-6 max-w-lg drop-shadow-lg font-medium">
              {slide.desc}
            </p>
            <button
              onClick={() => navigate(slide.path)}
              className="px-6 py-3 rounded-xl text-sm font-bold transition-all hover:scale-105 active:scale-95 shadow-lg inline-flex items-center gap-2"
              style={{ background: slide.accent, color: slide.accent === '#ef4444' ? 'white' : 'black' }}
            >
              {slide.cta} <span className="text-lg">→</span>
            </button>
          </div>
        </div>

        <div className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
          {ALL_SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
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
          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 hover:opacity-100 transition hover:bg-black/60 text-xl backdrop-blur-sm"
          style={{ border: '1px solid rgba(255,255,255,0.1)' }}
        >
          ‹
        </button>
        <button
          onClick={() => goTo((current + 1) % ALL_SLIDES.length)}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 hover:opacity-100 transition hover:bg-black/60 text-xl backdrop-blur-sm"
          style={{ border: '1px solid rgba(255,255,255,0.1)' }}
        >
          ›
        </button>
      </section>

      {/* ── Quick Nav Cards ──────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 mt-6 sm:mt-8 pb-16">
        <div className="grid md:grid-cols-3 gap-4 sm:gap-6">
          {HERO_SLIDES.slice(1).map(s => (
            <Link
              key={s.path}
              to={s.path}
              className="group relative block rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.02] min-h-[200px]"
              style={{
                background: `linear-gradient(135deg, ${s.accent}20 0%, ${s.accent}08 100%)`,
                border: '1px solid #ffffff0f',
                boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
              }}
            >
              <div
                className="absolute inset-0 opacity-[0.06] group-hover:opacity-[0.12] transition-opacity duration-500"
                style={{
                  backgroundImage: `url(${s.image})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
              <div className={`absolute inset-0 bg-gradient-to-br ${s.gradient} opacity-0 group-hover:opacity-60 transition-opacity duration-300`} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="relative p-6 sm:p-8 h-full flex flex-col justify-end">
                <span className="text-3xl mb-2 block">{s.icon}</span>
                <h3 className="text-lg font-bold text-text-1 mb-1">{s.title}</h3>
                <p className="text-xs text-text-2/80 mb-4 line-clamp-2">{s.desc}</p>
                <span
                  className="inline-flex items-center gap-1 text-xs font-bold transition-all group-hover:gap-2"
                  style={{ color: s.accent }}
                >
                  {s.cta} →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Özel Oyunlar ─────────────────────────────────────── */}
      <section className="border-t border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-black text-text-1 mb-2">Özel Oyunlar</h2>
            <p className="text-sm text-text-2">VIP90.bet'e özel in-house oyunlarla farklı bir deneyim</p>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
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
                  e.currentTarget.style.borderColor = `${g.accent}44`;
                  e.currentTarget.style.boxShadow = `0 0 16px ${g.accent}22`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#ffffff0a';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div className="aspect-[4/3] relative overflow-hidden">
                  <img
                    src={g.image}
                    alt={g.name}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-2">
                    <span className="text-xs font-bold block" style={{ color: g.accent }}>{g.name}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── ⚽ Spor Bahisleri — Öne Çıkan Maçlar ────────────── */}
      <section className="border-t border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-text-1 flex items-center gap-2">
                ⚽ Spor Bahisleri
              </h2>
              <p className="text-sm text-text-2 mt-1">15+ spor dalı, yüzlerce lig ve binlerce maç</p>
            </div>
            <Link
              to="/bahis"
              className="hidden sm:inline-flex items-center gap-1 text-xs font-bold px-4 py-2 rounded-lg transition-all hover:gap-2"
              style={{ background: '#00d4ff', color: '#000' }}
            >
              Tüm Sporlar →
            </Link>
          </div>

          {!eventsLoading && upcomingEvents.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">⚡ Yaklaşan Maçlar</span>
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
            className="sm:hidden mt-4 flex items-center justify-center gap-1 text-xs font-bold px-4 py-2.5 rounded-xl transition-all"
            style={{ background: '#00d4ff', color: '#000' }}
          >
            Tüm Sporları Keşfet →
          </Link>
        </div>
      </section>

      {/* ── 🔴 Canlı Bahis — Öne Çıkan Maçlar ────────────────── */}
      <section className="border-t border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-text-1 flex items-center gap-2">
                🔴 Canlı Bahis
              </h2>
              <p className="text-sm text-text-2 mt-1">Anlık maçlar, gerçek zamanlı oranlar</p>
            </div>
            <Link
              to="/canli"
              className="hidden sm:inline-flex items-center gap-1 text-xs font-bold px-4 py-2 rounded-lg transition-all hover:gap-2"
              style={{ background: '#ef4444', color: '#fff' }}
            >
              Tüm Canlı Maçlar →
            </Link>
          </div>

          {!eventsLoading && liveEvents.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Şu Anda Canlı</span>
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
            className="sm:hidden mt-4 flex items-center justify-center gap-1 text-xs font-bold px-4 py-2.5 rounded-xl transition-all"
            style={{ background: '#ef4444', color: '#fff' }}
          >
            Canlı Bahislere Katıl →
          </Link>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────── */}
      <section className="border-t border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-black text-text-1 mb-2">Neden VIP90.bet?</h2>
            <p className="text-sm text-text-2">En iyi deneyim için ihtiyacın olan her şey</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map(f => (
              <div
                key={f.title}
                className="rounded-2xl p-6 text-center transition-all duration-200 hover:scale-[1.02]"
                style={{
                  background: 'linear-gradient(135deg, rgba(17,29,48,0.8) 0%, rgba(13,21,38,0.8) 100%)',
                  border: '1px solid #ffffff0a',
                }}
              >
                <span className="text-3xl block mb-3">{f.icon}</span>
                <h4 className="text-sm font-bold text-text-1 mb-1">{f.title}</h4>
                <p className="text-xs text-text-3">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ──────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 pb-20">
        <div
          className="relative rounded-2xl overflow-hidden p-8 sm:p-12 text-center"
          style={{
            border: '1px solid #ffffff14',
            boxShadow: BRAND_GLOW,
          }}
        >
          <img
            src="/images/cta-bg.png"
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#060d1a]/90 via-[#060d1a]/60 to-[#060d1a]/90" />
          <div className="relative">
            <span className="text-4xl block mb-4">💎</span>
            <h2 className="text-2xl sm:text-3xl font-black text-text-1 mb-6">VIP90.bet ile Kazanmaya Başla</h2>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={() => navigate('/bahis')}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-black transition-all hover:scale-105 active:scale-95 shadow-lg"
                style={{ background: BRAND_GRADIENT_H }}
              >
                ⚽ Bahis Yap
              </button>
              <button
                onClick={() => navigate('/casino')}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-black transition-all hover:scale-105 active:scale-95 shadow-lg"
                style={{ background: BRAND_GRADIENT_H }}
              >
                🎰 Casinoyu Keşfet
              </button>
            </div>
          </div>
        </div>
      </section>

      <BetSlip />
    </div>
  );
}
