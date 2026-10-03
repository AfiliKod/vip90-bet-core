import { Fragment, useState, useEffect, useRef, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from '../i18n';
import api from '../services/api';
import BetSlip, { SlipContent } from '../components/BetSlip';
import { useBetSlipStore } from '../store/betSlipStore';
import { useGameActivityStore } from '../store/gameActivityStore';
import { useAuthStore } from '../store/authStore';
import { useBrandingStore } from '../store/brandingStore';
import RecentWinnersTicker from '../components/RecentWinnersTicker';
import HomeSidebar from '../components/home/HomeSidebar';
import WinnersPanel from '../components/home/WinnersPanel';
import PromoPanel from '../components/home/PromoPanel';
import ProviderRow from '../components/home/ProviderRow';
import ScrollHintArrow from '../components/home/ScrollHintArrow';
import AllGamesSection from '../components/home/AllGamesSection';
import { Icon, FavoriteButton } from '../components/home/HomeUI';
import PromoHeroSlider from '../components/home/PromoHeroSlider';
import { shuffle } from '../utils/shuffle';
import { resolveSectionOrder } from './home/pageContent';
import { HOME_CARD, HOME_BORDER } from './home/homeTheme';

// Igames agregatörden gerçek/lisanslı oyun kataloğu çekilecek sağlayıcılar
// (bkz. GET /api/igames/providers) — T3'te bağlanan gerçek kontrat. Belirli
// oyun görselleri/başlıkları burada kod içine GÖMÜLMEDİ (T5 varlık denetiminde
// lisanssız Pragmatic Play/BGaming verisi tam da bu yüzden silinmişti) —
// hepsi çalışma zamanında Igames'ın kendi CDN'inden canlı çekiliyor.
const IGAMES_PROVIDER_IDS = [1, 15]; // Pragmatic Play, Spribe

function IgamesGameCard({ game }) {
  const symbol = game.game_code;
  const name = game.game_name;
  const image = game.game_image_narrow || game.game_image;
  const recordPlay = useGameActivityStore(s => s.recordPlay);
  const user = useAuthStore(s => s.user);
  return (
    <Link
      to={`/igames/${encodeURIComponent(symbol)}?name=${encodeURIComponent(name)}`}
      onClick={() => { if (user) recordPlay(symbol, 'igames'); }}
      className="group relative rounded-xl overflow-hidden transition-all duration-200 text-center shrink-0 w-[140px] sm:w-[150px]"
      style={{ background: HOME_CARD, border: `1px solid ${HOME_BORDER}` }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary) 40%, transparent)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = HOME_BORDER; }}
    >
      <FavoriteButton gameId={symbol} kind="igames" />
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
  const scrollRef = useRef(null);
  return (
    <section className="mt-[19px]" id={id}>
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
        <div className="relative">
          <div ref={scrollRef} className="flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar pb-1">
            {children}
          </div>
          <ScrollHintArrow containerRef={scrollRef} />
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const { t } = useTranslation();
  const siteName = useBrandingStore(s => s.siteName) || 'VIP90.bet';
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const betSlipSelections = useBetSlipStore(s => s.selections);
  const recordPlay = useGameActivityStore(s => s.recordPlay);
  const currentUser = useAuthStore(s => s.user);
  const [pageContent, setPageContent] = useState(null);
  const [igamesGames, setIgamesGames] = useState([]);
  // Admin'in Modül Ayarları'ndan seçtiği "Popüler Oyunlar" listesi (game_code
  // dizisi) — boşsa aşağıda eski davranışa (ilk 10 oyun) düşülür.
  const [popularGameCodes, setPopularGameCodes] = useState([]);
  // Sağlayıcı rayından bir sağlayıcı seçilince diğer oyun satırları
  // gizlenir, "Tüm Oyunlar" alanı yalnızca bu sağlayıcının oyunlarını
  // gösterir (bkz. AllGamesSection.jsx, ProviderRow.jsx).
  const [selectedProvider, setSelectedProvider] = useState(null); // {id, name} | null
  const [providerGames, setProviderGames] = useState([]);
  const [providerGamesLoading, setProviderGamesLoading] = useState(false);

  useEffect(() => {
    api.get('/pages/home').then(({ data }) => setPageContent(data?.content || null)).catch(() => {});
  }, []);

  useEffect(() => {
    if (currentUser) useGameActivityStore.getState().ensureLoaded();
  }, [currentUser]);

  // Igames agregatörden gerçek katalog — hiçbir oyun adı/görseli kod içinde
  // sabit değil, hepsi burada canlı çekiliyor (bkz. yukarıdaki not).
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      IGAMES_PROVIDER_IDS.map(provider_id =>
        api.post('/igames/games', { lang: 'tr', provider_id }).then(r => r.data?.data || []).catch(() => [])
      )
    ).then(lists => {
      if (cancelled) return;
      setIgamesGames(lists.flat().filter(g => g.launch_enable !== false));
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    api.get('/igames/popular-games').then(({ data }) => setPopularGameCodes(data?.gameCodes || [])).catch(() => {});
  }, []);

  const { popularGames, slotGames, newGames } = useMemo(() => {
    const slots = igamesGames.filter(g => g.category === 'Slots');
    const byDateDesc = [...igamesGames].sort((a, b) => new Date(b.reg_date) - new Date(a.reg_date));

    // Admin curated bir liste seçtiyse (Modül Ayarları → Igames) o sırayla
    // göster; hiç seçim yapılmamışsa eski davranışa (ilk 10 oyun) düş.
    let curatedPopular = null;
    if (popularGameCodes.length) {
      const byCode = new Map(igamesGames.map(g => [g.game_code, g]));
      curatedPopular = popularGameCodes.map(code => byCode.get(code)).filter(Boolean);
    }

    return {
      popularGames: curatedPopular?.length ? curatedPopular : igamesGames.slice(0, 10),
      slotGames: slots.slice(0, 10),
      newGames: byDateDesc.slice(0, 10),
    };
  }, [igamesGames, popularGameCodes]);

  // "Tüm Oyunlar" alanının varsayılan (sağlayıcı filtresi yokken) içeriği —
  // diğer satırlar gibi kürasyonlu değil, gerçekten rastgele bir örneklem.
  const randomAllGames = useMemo(() => shuffle(igamesGames), [igamesGames]);

  // /casino?provider=X deep-link'i (SearchOverlay'den, arama sonucundaki bir
  // sağlayıcıya tıklayınca) — CasinoRedesign.jsx bunu useSearchParams ile
  // okuyordu, /casino artık bu bileşeni (HomePage) render ettiği için aynı
  // davranış burada korunuyor. Gerçek görünen adı almak için /igames/providers
  // sorgulanıyor; bulunamazsa ham id gösterilir.
  useEffect(() => {
    const providerId = searchParams.get('provider');
    if (!providerId) return;
    let cancelled = false;
    api.post('/igames/providers', { lang: 'tr' }).then(({ data }) => {
      if (cancelled) return;
      const match = (data?.data || []).find(p => p.provider_id === providerId);
      setSelectedProvider({ id: providerId, name: match?.name || providerId });
    }).catch(() => {
      if (!cancelled) setSelectedProvider({ id: providerId, name: providerId });
    });
    setSearchParams(prev => { prev.delete('provider'); return prev; }, { replace: true });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedProvider) { setProviderGames([]); return; }
    let cancelled = false;
    setProviderGamesLoading(true);
    api.post('/igames/games', { lang: 'tr', provider_id: selectedProvider.id }).then(({ data }) => {
      if (!cancelled) setProviderGames((data?.data || []).filter(g => g.launch_enable !== false));
    }).catch(() => { if (!cancelled) setProviderGames([]); })
      .finally(() => { if (!cancelled) setProviderGamesLoading(false); });
    return () => { cancelled = true; };
  }, [selectedProvider]);

  const sectionOrder = resolveSectionOrder(pageContent?.sectionOrder);

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

  const SECTIONS = {
    inhouseGames: sectionOrder.includes('inhouseGames') ? (
      <GameRowSection id="ozel-oyunlar" icon="diamond" title={t('home.games.exclusive')} subtitle={t('home.games.exclusiveDesc', { siteName })}>
        {INHOUSE_GAMES.map(g => (
          <Link key={g.path} to={g.path} onClick={() => { if (currentUser) recordPlay(g.path, 'inhouse'); }}
            className="group relative rounded-xl overflow-hidden transition-all duration-200 text-center shrink-0 w-[140px] sm:w-[150px]"
            style={{ background: HOME_CARD, border: `1px solid ${HOME_BORDER}` }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = `${g.accent}66`; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = HOME_BORDER; }}
          >
            <FavoriteButton gameId={g.path} kind="inhouse" />
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
        {popularGames.map(g => <IgamesGameCard key={g.game_code} game={g} />)}
      </GameRowSection>
    ) : null,

    slotGames: slotGames.length > 0 ? (
      <GameRowSection id="slot-oyunlari" icon="casino" title={t('home.sidebar.slotGames')} viewAllTo="/casino" viewAllLabel={t('home.games.viewAll')}>
        {slotGames.map(g => <IgamesGameCard key={g.game_code} game={g} />)}
      </GameRowSection>
    ) : null,

    newGames: newGames.length > 0 ? (
      <GameRowSection id="yeni-oyunlar" icon="fiber_new" title={t('home.sidebar.newGames')} viewAllTo="/casino" viewAllLabel={t('home.games.viewAll')}>
        {newGames.map(g => <IgamesGameCard key={g.game_code} game={g} />)}
      </GameRowSection>
    ) : null,
  };

  const SECTION_KEYS = ['popularGames', 'inhouseGames', 'slotGames', 'newGames'];

  return (
    <div className="min-h-full lg:flex lg:gap-5 lg:px-5 lg:pt-5 lg:items-stretch">
      <HomeSidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <RecentWinnersTicker />

        {/* Main + sağ ray TEK grid'de kardeş: oyun satırları böylece hep
            main sütununun (1fr) genişliğinde kalır, sağ raya (260px)
            taşmaz — hero eskiden kendi iç grid'ini kuruyordu, altındaki
            GameRowSection'lar ise o grid'in dışında tam genişlik kardeş
            bloklar olarak akıp sağ rayın da altına yayılıyordu.
            260px: referans (VIP90-BET-pixel-perfect-homepage/styles.css
            .layout) sol sidebar ile eşit 220px öneriyor, ama gerçek
            içerikle (ör. "Recent Winners" + çevrimiçi rozeti tek satırda,
            farklı dillerde daha da uzayabilir) 220px'te kırılıyordu —
            bilinçli olarak sağa genişletildi, sol sidebar 220px'te kaldı. */}
        <div className="lg:grid lg:grid-cols-[1fr_260px] lg:gap-4 lg:items-start">
          <div className="min-w-0">
            <PromoHeroSlider />
            <ProviderRow selectedId={selectedProvider?.id} onSelect={setSelectedProvider} />
            {/* Bir sağlayıcı seçiliyken diğer kürasyonlu satırlar (Popüler/
                Özel/Slot/Yeni) gizlenir — aşağıdaki "Tüm Oyunlar" alanı
                yalnızca seçilen sağlayıcının oyunlarını gösterir. */}
            {!selectedProvider && SECTION_KEYS.map(id => (SECTIONS[id] ? <Fragment key={id}>{SECTIONS[id]}</Fragment> : null))}

            <AllGamesSection
              games={selectedProvider ? providerGames : randomAllGames}
              loading={selectedProvider ? providerGamesLoading : false}
              providerFilter={selectedProvider}
              onClearFilter={() => setSelectedProvider(null)}
            />
          </div>

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

        {/* desktopHidden: masaüstü kupon yerleşimini yukarıda (sağ ray) kendimiz
            yönetiyoruz — burası yalnızca mobil bar/sheet davranışı için kalıyor. */}
        <BetSlip desktopHidden />
      </div>
    </div>
  );
}
