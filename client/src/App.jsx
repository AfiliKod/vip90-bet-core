import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useToastStore } from './store/toastStore';
import { useBetNotificationStore } from './store/betNotificationStore';
import { useModuleStore } from './store/moduleStore';
import ModuleGate from './components/ModuleGate';
import { formatMoney } from './utils/money.js';
import { socket } from './services/socket';
import ProtectedRoute from './components/ProtectedRoute';
import { useTranslation } from './i18n/I18nProvider.jsx';
import ThemeStyleInjector from './theme/ThemeStyleInjector.jsx';
import BrandingInjector from './branding/BrandingInjector.jsx';
import CurrencyLoader from './utils/CurrencyLoader.jsx';
import GuestRoute from './components/GuestRoute';
import ToastSystem from './components/ToastSystem';
import Navbar from './components/Navbar';
import BottomNav from './components/BottomNav';
import Layout from './components/Layout';
import { PWAUpdateBanner } from './components/PWAComponents.jsx';

// Phase E3: Code splitting — initial bundle'dan büyük sayfalar lazy
const Login = lazy(() => import('./pages/Login'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const Bahis = lazy(() => import('./pages/Bahis'));
const Live = lazy(() => import('./pages/Live'));
const EventDetail = lazy(() => import('./pages/EventDetail'));
const MyBets = lazy(() => import('./pages/MyBets'));
const Profile = lazy(() => import('./pages/Profile'));
const Kyc = lazy(() => import('./pages/Kyc'));
const Promotions = lazy(() => import('./pages/Promotions'));
const Settings = lazy(() => import('./pages/Settings'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminEvents = lazy(() => import('./pages/admin/Events'));
const AdminUsers = lazy(() => import('./pages/admin/Users'));
const AdminGameTasks = lazy(() => import('./pages/admin/GameTasks'));
const AdminCasinoStats = lazy(() => import('./pages/admin/CasinoStats'));
const AdminBankRequests = lazy(() => import('./pages/admin/BankRequests'));
const AdminAnalytics = lazy(() => import('./pages/admin/Analytics'));
const AdminPalace = lazy(() => import('./pages/admin/Palace'));
const AdminModules = lazy(() => import('./pages/admin/Modules'));
const AdminSettings = lazy(() => import('./pages/admin/Settings'));
const AdminTheme = lazy(() => import('./pages/admin/Theme'));
const AdminBranding = lazy(() => import('./pages/admin/Branding'));
const AdminPages = lazy(() => import('./pages/admin/Pages'));
const AdminGamesShowcase = lazy(() => import('./pages/admin/GamesShowcase'));
const AdminGameSettings = lazy(() => import('./pages/admin/GameSettings'));
const AdminRoles = lazy(() => import('./pages/admin/Roles'));
const AdminVip = lazy(() => import('./pages/admin/Vip'));
const AdminPromotions = lazy(() => import('./pages/admin/Promotions'));
const AdminBots = lazy(() => import('./pages/admin/Bots'));
const AdminStaticPages = lazy(() => import('./pages/admin/StaticPages'));
const AdminTickets = lazy(() => import('./pages/admin/Tickets'));
const AdminKycReview = lazy(() => import('./pages/admin/KycReview'));
const AdminCrypto = lazy(() => import('./pages/admin/Crypto'));
const PalaceGame = lazy(() => import('./pages/PalaceGame'));
const InhouseGameLauncher = lazy(() => import('./pages/games/InhouseGameLauncher'));
const HomePage = lazy(() => import('./pages/HomePage'));
const Favorites = lazy(() => import('./pages/Favorites'));
const RecentlyPlayed = lazy(() => import('./pages/RecentlyPlayed'));
const Terms = lazy(() => import('./pages/legal/Terms'));
const Privacy = lazy(() => import('./pages/legal/Privacy'));
const Kvkk = lazy(() => import('./pages/legal/Kvkk'));
const Cookies = lazy(() => import('./pages/legal/Cookies'));
const BonusTerms = lazy(() => import('./pages/legal/BonusTerms'));
const ResponsibleGaming = lazy(() => import('./pages/legal/ResponsibleGaming'));
const UserAgreement = lazy(() => import('./pages/legal/UserAgreement'));
const Tickets = lazy(() => import('./pages/Tickets'));
const About = lazy(() => import('./pages/company/About'));
const Career = lazy(() => import('./pages/company/Career'));
const Press = lazy(() => import('./pages/company/Press'));
const Contact = lazy(() => import('./pages/company/Contact'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#05080f' }}>
      <div className="text-center">
        <div className="inline-block w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs mt-3" style={{ color: '#8899bb' }}>Yükleniyor...</p>
      </div>
    </div>
  );
}

export default function App() {
  const { t } = useTranslation();
  const { init } = useAuthStore();
  const addToast = useToastStore(s => s.add);
  const incrementUnread = useBetNotificationStore(s => s.increment);
  const fetchModules = useModuleStore(s => s.fetch);

  useEffect(() => { init(); }, []);
  useEffect(() => { fetchModules(); }, [fetchModules]);

  useEffect(() => {
    function onBalanceUpdate({ balance }) {
      if (typeof balance === 'number') useAuthStore.getState().updateBalance(balance);
    }
    socket.on('balance:update', onBalanceUpdate);

    function onBetSettled({ eventTitle, result, payout, amount }) {
      incrementUnread();
      if (result === 'win') {
        addToast(`${t('toast.wonPrefix')} ${eventTitle} — +${formatMoney(payout)}`, 'success');
      } else if (result === 'refund') {
        addToast(`${t('toast.refundedPrefix')} ${eventTitle} — ${formatMoney(amount)}`, 'info');
      } else {
        addToast(`${t('toast.lostPrefix')} ${eventTitle} — -${formatMoney(amount)}`, 'error');
      }
    }
    socket.on('bet:settled', onBetSettled);

    function onTicketReply() {
      addToast(t('ticket.newReply'), 'info');
    }
    socket.on('ticket:reply', onTicketReply);

    return () => {
      socket.off('balance:update', onBalanceUpdate);
      socket.off('bet:settled', onBetSettled);
      socket.off('ticket:reply', onTicketReply);
    };
  }, []);

  return (
    <>
    <ThemeStyleInjector />
    <BrandingInjector />
    <CurrencyLoader />
    <BrowserRouter>
      <ToastSystem />
      <PWAUpdateBanner />
      <Navbar />
      <BottomNav />
      <Routes>
        <Route path="/login" element={<GuestRoute><Suspense fallback={<PageLoader />}><Login /></Suspense></GuestRoute>} />
        <Route path="/auth/callback" element={<Suspense fallback={<PageLoader />}><AuthCallback /></Suspense>} />
        <Route path="/" element={<Layout><Suspense fallback={<PageLoader />}><HomePage /></Suspense></Layout>} />
        <Route path="/bahis" element={<Layout><ModuleGate module="betting"><Suspense fallback={<PageLoader />}><Bahis /></Suspense></ModuleGate></Layout>} />
        <Route path="/canli" element={<Layout><ModuleGate module="betting"><Suspense fallback={<PageLoader />}><Live /></Suspense></ModuleGate></Layout>} />
        <Route path="/events/:id" element={<Layout><ModuleGate module="betting"><Suspense fallback={<PageLoader />}><EventDetail /></Suspense></ModuleGate></Layout>} />
        <Route path="/casino" element={<Layout><ModuleGate module="casino-content"><Suspense fallback={<PageLoader />}><HomePage /></Suspense></ModuleGate></Layout>} />
        <Route path="/palace/:gameId" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><PalaceGame /></Suspense></ProtectedRoute>} />
        <Route path="/games/crash" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><InhouseGameLauncher gameId="crash" /></Suspense></ProtectedRoute>} />
        <Route path="/games/mines" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><InhouseGameLauncher gameId="mines" /></Suspense></ProtectedRoute>} />
        <Route path="/games/plinko" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><InhouseGameLauncher gameId="plinko" /></Suspense></ProtectedRoute>} />
        <Route path="/games/dice" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><InhouseGameLauncher gameId="dice" /></Suspense></ProtectedRoute>} />
        <Route path="/games/limbo" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><InhouseGameLauncher gameId="limbo" /></Suspense></ProtectedRoute>} />
        <Route path="/games/wheel" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><InhouseGameLauncher gameId="wheel" /></Suspense></ProtectedRoute>} />
        <Route path="/games/hilo" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><InhouseGameLauncher gameId="hilo" /></Suspense></ProtectedRoute>} />
        <Route path="/games/keno" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><InhouseGameLauncher gameId="keno" /></Suspense></ProtectedRoute>} />
        <Route path="/games/blackjack" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><InhouseGameLauncher gameId="blackjack" /></Suspense></ProtectedRoute>} />
        <Route path="/games/roulette" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><InhouseGameLauncher gameId="roulette" /></Suspense></ProtectedRoute>} />
        <Route path="/games/baccarat" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><InhouseGameLauncher gameId="baccarat" /></Suspense></ProtectedRoute>} />
        <Route path="/games/videopoker" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><InhouseGameLauncher gameId="videopoker" /></Suspense></ProtectedRoute>} />
        <Route path="/games/dragontiger" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><InhouseGameLauncher gameId="dragontiger" /></Suspense></ProtectedRoute>} />
        <Route path="/my-bets" element={<ProtectedRoute><Layout><Suspense fallback={<PageLoader />}><MyBets /></Suspense></Layout></ProtectedRoute>} />
        <Route path="/favorites" element={<ProtectedRoute><Layout><Suspense fallback={<PageLoader />}><Favorites /></Suspense></Layout></ProtectedRoute>} />
        <Route path="/recently-played" element={<ProtectedRoute><Layout><Suspense fallback={<PageLoader />}><RecentlyPlayed /></Suspense></Layout></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Layout><Suspense fallback={<PageLoader />}><Profile /></Suspense></Layout></ProtectedRoute>} />
        <Route path="/kyc" element={<ProtectedRoute><Layout><Suspense fallback={<PageLoader />}><Kyc /></Suspense></Layout></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Layout><Suspense fallback={<PageLoader />}><Settings /></Suspense></Layout></ProtectedRoute>} />
        <Route path="/promotions" element={<ProtectedRoute><Layout><Suspense fallback={<PageLoader />}><Promotions /></Suspense></Layout></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute adminOnly><Suspense fallback={<PageLoader />}><AdminDashboard /></Suspense></ProtectedRoute>} />
        <Route path="/admin/events" element={<ProtectedRoute adminOnly><Suspense fallback={<PageLoader />}><AdminEvents /></Suspense></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute adminOnly><Suspense fallback={<PageLoader />}><AdminUsers /></Suspense></ProtectedRoute>} />
        <Route path="/admin/tasks" element={<ProtectedRoute adminOnly><Suspense fallback={<PageLoader />}><AdminGameTasks /></Suspense></ProtectedRoute>} />
        <Route path="/admin/casino" element={<ProtectedRoute adminOnly><Suspense fallback={<PageLoader />}><AdminCasinoStats /></Suspense></ProtectedRoute>} />
        <Route path="/admin/palace" element={<ProtectedRoute adminOnly><Suspense fallback={<PageLoader />}><AdminPalace /></Suspense></ProtectedRoute>} />
        <Route path="/admin/bank" element={<ProtectedRoute adminOnly><Suspense fallback={<PageLoader />}><AdminBankRequests /></Suspense></ProtectedRoute>} />
        <Route path="/admin/analytics" element={<ProtectedRoute adminOnly><Suspense fallback={<PageLoader />}><AdminAnalytics /></Suspense></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute adminOnly><Suspense fallback={<PageLoader />}><AdminSettings /></Suspense></ProtectedRoute>} />
        <Route path="/admin/modules" element={<ProtectedRoute adminOnly><Suspense fallback={<PageLoader />}><AdminModules /></Suspense></ProtectedRoute>} />
        <Route path="/admin/theme" element={<ProtectedRoute adminOnly><Suspense fallback={<PageLoader />}><AdminTheme /></Suspense></ProtectedRoute>} />
        <Route path="/admin/branding" element={<ProtectedRoute adminOnly><Suspense fallback={<PageLoader />}><AdminBranding /></Suspense></ProtectedRoute>} />
        <Route path="/admin/pages" element={<ProtectedRoute adminOnly><Suspense fallback={<PageLoader />}><AdminPages /></Suspense></ProtectedRoute>} />
        <Route path="/admin/games-showcase" element={<ProtectedRoute adminOnly><Suspense fallback={<PageLoader />}><AdminGamesShowcase /></Suspense></ProtectedRoute>} />
        <Route path="/admin/game-settings" element={<ProtectedRoute adminOnly><Suspense fallback={<PageLoader />}><AdminGameSettings /></Suspense></ProtectedRoute>} />
        <Route path="/admin/module-settings" element={<Navigate to="/admin/modules" replace />} />
        <Route path="/admin/roles" element={<ProtectedRoute adminOnly><Suspense fallback={<PageLoader />}><AdminRoles /></Suspense></ProtectedRoute>} />
        <Route path="/admin/vip" element={<ProtectedRoute adminOnly><Suspense fallback={<PageLoader />}><AdminVip /></Suspense></ProtectedRoute>} />
        <Route path="/admin/promotions" element={<ProtectedRoute adminOnly><Suspense fallback={<PageLoader />}><AdminPromotions /></Suspense></ProtectedRoute>} />
        <Route path="/admin/bots" element={<ProtectedRoute adminOnly><Suspense fallback={<PageLoader />}><AdminBots /></Suspense></ProtectedRoute>} />
        <Route path="/admin/static-pages" element={<ProtectedRoute adminOnly><Suspense fallback={<PageLoader />}><AdminStaticPages /></Suspense></ProtectedRoute>} />
        <Route path="/admin/tickets" element={<ProtectedRoute adminOnly><Suspense fallback={<PageLoader />}><AdminTickets /></Suspense></ProtectedRoute>} />
        <Route path="/admin/kyc" element={<ProtectedRoute adminOnly><Suspense fallback={<PageLoader />}><AdminKycReview /></Suspense></ProtectedRoute>} />
        <Route path="/admin/crypto" element={<ProtectedRoute adminOnly><Suspense fallback={<PageLoader />}><AdminCrypto /></Suspense></ProtectedRoute>} />
        {/* Legal pages (public) — kendi TOC sidebar'ını (LegalLayout) korur, Layout'un
            HomeSidebar'ı ile çakışmasın diye Layout.jsx bu rotaları hariç tutar. */}
        <Route path="/legal/terms" element={<Layout><Suspense fallback={<PageLoader />}><Terms /></Suspense></Layout>} />
        <Route path="/legal/privacy" element={<Layout><Suspense fallback={<PageLoader />}><Privacy /></Suspense></Layout>} />
        <Route path="/legal/kvkk" element={<Layout><Suspense fallback={<PageLoader />}><Kvkk /></Suspense></Layout>} />
        <Route path="/legal/cookies" element={<Layout><Suspense fallback={<PageLoader />}><Cookies /></Suspense></Layout>} />
        <Route path="/legal/bonus-terms" element={<Layout><Suspense fallback={<PageLoader />}><BonusTerms /></Suspense></Layout>} />
        <Route path="/legal/responsible-gaming" element={<Layout><Suspense fallback={<PageLoader />}><ResponsibleGaming /></Suspense></Layout>} />
        <Route path="/legal/user-agreement" element={<Layout><Suspense fallback={<PageLoader />}><UserAgreement /></Suspense></Layout>} />
        {/* Company pages (public, statik sayfa yönetimi) */}
        <Route path="/about" element={<Layout><Suspense fallback={<PageLoader />}><About /></Suspense></Layout>} />
        <Route path="/career" element={<Layout><Suspense fallback={<PageLoader />}><Career /></Suspense></Layout>} />
        <Route path="/press" element={<Layout><Suspense fallback={<PageLoader />}><Press /></Suspense></Layout>} />
        <Route path="/contact" element={<Layout><Suspense fallback={<PageLoader />}><Contact /></Suspense></Layout>} />
        <Route path="/help" element={<ProtectedRoute><Layout><Suspense fallback={<PageLoader />}><Tickets /></Suspense></Layout></ProtectedRoute>} />
        <Route path="/forgot-password" element={<GuestRoute><Suspense fallback={<PageLoader />}><ForgotPassword /></Suspense></GuestRoute>} />
        <Route path="/reset-password" element={<GuestRoute endSession><Suspense fallback={<PageLoader />}><ResetPassword /></Suspense></GuestRoute>} />
        <Route path="/verify-email" element={<GuestRoute endSession><Suspense fallback={<PageLoader />}><VerifyEmail /></Suspense></GuestRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </>
  );
}
