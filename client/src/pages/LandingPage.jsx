/**
 * Landing page (`/`): sports and casino in one feed.
 *
 * The casino page moved to `/casino` only (HomePage.jsx). Here the rows
 * alternate between the two: live matches, popular casino games, upcoming
 * matches, our own games, new games. Section order and visibility come from
 * the admin "Pages" setting (see home/landingSections.js); rows whose module
 * is off, or that have nothing to show, are not rendered.
 */
import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../i18n';
import api from '../services/api';
import BetSlip, { SlipContent } from '../components/BetSlip';
import MiniEventCard from '../components/MiniEventCard';
import RecentWinnersTicker from '../components/RecentWinnersTicker';
import HomeSidebar from '../components/home/HomeSidebar';
import WinnersPanel from '../components/home/WinnersPanel';
import PromoPanel from '../components/home/PromoPanel';
import PromoHeroSlider from '../components/home/PromoHeroSlider';
import { useAuthStore } from '../store/authStore';
import { useBrandingStore } from '../store/brandingStore';
import { useEventsStore } from '../store/eventsStore';
import { useGameActivityStore } from '../store/gameActivityStore';
import { useModuleStore } from '../store/moduleStore';
import { hasDisplayableOdds } from '../utils/oddsUtils';
import { GameRowSection, IgamesGameCard, InhouseGameCard } from './home/homeRows';
import { getInhouseGames, useIgamesCatalog } from './home/homeCatalog';
import { resolveLandingSections, pickEventsWithOdds } from './home/landingSections';
import { HOME_CARD, HOME_BORDER } from './home/homeTheme';

const MATCHES_PER_ROW = 8;
// Upcoming events come sorted by start time; many have no odds yet, so ask
// for more than one row needs and keep the first ones with odds.
const UPCOMING_FETCH_LIMIT = 60;

function MatchCard({ event, live }) {
  return (
    <div className="shrink-0 w-[260px] sm:w-[280px]">
      <MiniEventCard event={event} live={live} />
    </div>
  );
}

export default function LandingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const siteName = useBrandingStore(s => s.siteName) || '';
  const currentUser = useAuthStore(s => s.user);
  const bettingOn = useModuleStore(s => s.available.betting !== false);
  const casinoOn = useModuleStore(s => s.available['casino-content'] !== false);

  const [pageContent, setPageContent] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const { events, fetchEvents, initSocket, cleanup } = useEventsStore();
  const { popularGames, newGames } = useIgamesCatalog({ enabled: casinoOn });

  useEffect(() => {
    api.get('/pages/home').then(({ data }) => setPageContent(data?.content || null)).catch(() => {});
  }, []);

  useEffect(() => {
    if (currentUser) useGameActivityStore.getState().ensureLoaded();
  }, [currentUser]);

  // Live rows use the shared events store so the socket keeps their odds fresh.
  useEffect(() => {
    if (!bettingOn) return undefined;
    initSocket();
    fetchEvents('all', 'live');
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bettingOn]);

  useEffect(() => {
    if (!bettingOn) return undefined;
    let cancelled = false;
    api.get(`/events?status=upcoming&limit=${UPCOMING_FETCH_LIMIT}`)
      .then(({ data }) => { if (!cancelled) setUpcoming(data?.events || []); })
      .catch(() => { if (!cancelled) setUpcoming([]); });
    return () => { cancelled = true; };
  }, [bettingOn]);

  const order = resolveLandingSections(pageContent?.sectionOrder, { betting: bettingOn, casino: casinoOn });
  const liveEvents = pickEventsWithOdds(events.filter(e => e.status === 'live'), hasDisplayableOdds, MATCHES_PER_ROW);
  const upcomingEvents = pickEventsWithOdds(upcoming, hasDisplayableOdds, MATCHES_PER_ROW);
  const inhouseGames = getInhouseGames(t);

  const SECTIONS = {
    hero: <PromoHeroSlider />,

    liveBets: liveEvents.length > 0 ? (
      <GameRowSection id="canli-maclar" icon="sensors" title={t('home.landing.liveNow')} subtitle={t('home.landing.liveNowDesc')} viewAllTo="/canli" viewAllLabel={t('home.landing.goLive')}>
        {liveEvents.map(ev => <MatchCard key={ev._id} event={ev} live />)}
      </GameRowSection>
    ) : null,

    casinoGames: popularGames.length > 0 ? (
      <GameRowSection id="populer-casino" icon="whatshot" title={t('home.landing.popularCasino')} viewAllTo="/casino" viewAllLabel={t('home.landing.toCasino')}>
        {popularGames.map(g => <IgamesGameCard key={g.game_code} game={g} />)}
      </GameRowSection>
    ) : null,

    sportsBets: upcomingEvents.length > 0 ? (
      <GameRowSection id="one-cikan-maclar" icon="sports_soccer" title={t('home.landing.featuredMatches')} subtitle={t('home.landing.featuredMatchesDesc')} viewAllTo="/bahis" viewAllLabel={t('home.landing.allMatches')}>
        {upcomingEvents.map(ev => <MatchCard key={ev._id} event={ev} />)}
      </GameRowSection>
    ) : null,

    inhouseGames: (
      <GameRowSection id="ozel-oyunlar" icon="diamond" title={t('home.games.exclusive')} subtitle={t('home.games.exclusiveDesc', { siteName })}>
        {inhouseGames.map(g => <InhouseGameCard key={g.path} game={g} />)}
      </GameRowSection>
    ),
  };

  // New provider games close the feed; they follow the casinoGames switch.
  const showNewGames = order.includes('casinoGames') && newGames.length > 0;

  // Left menu: jump to the rows this page actually shows (the casino page's
  // default categories point at rows that only exist on /casino), then the
  // two full pages.
  const ROW_LINKS = {
    liveBets: { icon: 'sensors', label: t('home.landing.liveNow'), target: 'canli-maclar' },
    casinoGames: { icon: 'whatshot', label: t('home.landing.popularCasino'), target: 'populer-casino' },
    sportsBets: { icon: 'sports_soccer', label: t('home.landing.featuredMatches'), target: 'one-cikan-maclar' },
    inhouseGames: { icon: 'diamond', label: t('home.games.exclusive'), target: 'ozel-oyunlar' },
  };
  const scrollTo = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const categories = [
    ...order.filter(id => ROW_LINKS[id] && SECTIONS[id]).map(id => ({ key: id, icon: ROW_LINKS[id].icon, label: ROW_LINKS[id].label, onClick: () => scrollTo(ROW_LINKS[id].target) })),
    ...(showNewGames ? [{ key: 'newGames', icon: 'fiber_new', label: t('home.sidebar.newGames'), onClick: () => scrollTo('yeni-oyunlar') }] : []),
    ...(bettingOn ? [{ key: 'sports', icon: 'sports', label: t('nav.sports'), onClick: () => navigate('/bahis') }] : []),
    ...(casinoOn ? [{ key: 'casino', icon: 'casino', label: t('nav.casino'), onClick: () => navigate('/casino') }] : []),
  ];

  return (
    <div className="min-h-full lg:flex lg:gap-5 lg:px-5 lg:pt-5 lg:items-stretch">
      <HomeSidebar categories={categories} />
      <div className="flex-1 min-w-0 flex flex-col">
        <RecentWinnersTicker />
        <div className="lg:grid lg:grid-cols-[1fr_260px] lg:gap-4 lg:items-start">
          <div className="min-w-0 pb-6">
            {order.map(id => (SECTIONS[id] ? <Fragment key={id}>{SECTIONS[id]}</Fragment> : null))}
            {showNewGames && (
              <GameRowSection id="yeni-oyunlar" icon="fiber_new" title={t('home.sidebar.newGames')} viewAllTo="/casino" viewAllLabel={t('home.games.viewAll')}>
                {newGames.map(g => <IgamesGameCard key={g.game_code} game={g} />)}
              </GameRowSection>
            )}
          </div>

          <div className="hidden lg:flex lg:flex-col lg:gap-4">
            {/* The landing page has odds on it, so the slip always has a place in the right rail. */}
            {bettingOn && (
              <div className="rounded-xl overflow-hidden" style={{ background: HOME_CARD, border: `1px solid ${HOME_BORDER}` }}>
                <SlipContent />
              </div>
            )}
            <WinnersPanel />
            <PromoPanel />
          </div>
        </div>
        {bettingOn && <BetSlip desktopHidden />}
      </div>
    </div>
  );
}
