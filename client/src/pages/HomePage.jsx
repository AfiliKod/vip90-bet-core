import { Fragment, useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import AllGamesSection from '../components/home/AllGamesSection';
import PromoHeroSlider from '../components/home/PromoHeroSlider';
import { shuffle } from '../utils/shuffle';
import { resolveSectionOrder } from './home/pageContent';
import { GameRowSection, IgamesGameCard, InhouseGameCard } from './home/homeRows';
import { getInhouseGames, useIgamesCatalog } from './home/homeCatalog';
import { HOME_CARD, HOME_BORDER } from './home/homeTheme';

export default function HomePage() {
  const { t } = useTranslation();
  const siteName = useBrandingStore(s => s.siteName) || '';
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const betSlipSelections = useBetSlipStore(s => s.selections);
  const currentUser = useAuthStore(s => s.user);
  const [pageContent, setPageContent] = useState(null);
  const { igamesGames, popularGames, slotGames, newGames } = useIgamesCatalog();
  // Sağlayıcı rayından bir sağlayıcı seçilince diğer oyun satırları
  // gizlenir, "Tüm Oyunlar" alanı yalnızca bu sağlayıcının oyunlarını
  // gösterir (bkz. AllGamesSection.jsx, ProviderRow.jsx).
  const [selectedProvider, setSelectedProvider] = useState(null); // {id, name} | null
  // Sağlayıcı rayı render oldu mu? Casino add-on'suz kurulumda ProviderRow
  // null döner ve mobil arama pill'i orada kayboluyordu — false'ta pill
  // "Tüm Oyunlar" başlığına taşınır (bkz. AllGamesSection `searchTrigger`).
  const [providerRail, setProviderRail] = useState(null); // null = henüz bilinmiyor
  const [providerGames, setProviderGames] = useState([]);
  const handleProvidersLoaded = useCallback((hasRail) => setProviderRail(hasRail), []);
  const [providerGamesLoading, setProviderGamesLoading] = useState(false);

  useEffect(() => {
    api.get('/pages/home').then(({ data }) => setPageContent(data?.content || null)).catch(() => {});
  }, []);

  useEffect(() => {
    if (currentUser) useGameActivityStore.getState().ensureLoaded();
  }, [currentUser]);

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
  const INHOUSE_GAMES = getInhouseGames(t);

  const SECTIONS = {
    inhouseGames: sectionOrder.includes('inhouseGames') ? (
      <GameRowSection id="ozel-oyunlar" icon="diamond" title={t('home.games.exclusive')} subtitle={t('home.games.exclusiveDesc', { siteName })}>
        {INHOUSE_GAMES.map(g => <InhouseGameCard key={g.path} game={g} />)}
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
            <ProviderRow selectedId={selectedProvider?.id} onSelect={setSelectedProvider} onLoaded={handleProvidersLoaded} />
            {/* Bir sağlayıcı seçiliyken diğer kürasyonlu satırlar (Popüler/
                Özel/Slot/Yeni) gizlenir — aşağıdaki "Tüm Oyunlar" alanı
                yalnızca seçilen sağlayıcının oyunlarını gösterir. */}
            {!selectedProvider && SECTION_KEYS.map(id => (SECTIONS[id] ? <Fragment key={id}>{SECTIONS[id]}</Fragment> : null))}

            <AllGamesSection
              games={selectedProvider ? providerGames : randomAllGames}
              loading={selectedProvider ? providerGamesLoading : false}
              providerFilter={selectedProvider}
              onClearFilter={() => setSelectedProvider(null)}
              searchTrigger={providerRail === false}
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
