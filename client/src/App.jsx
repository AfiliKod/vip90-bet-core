import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useToastStore } from './store/toastStore';
import { useBetNotificationStore } from './store/betNotificationStore';
import { useModuleStore } from './store/moduleStore';
import ModuleGate from './components/ModuleGate';
import { formatMoney } from './utils/money.js';
import { socket } from './services/socket';
import ProtectedRoute from './components/ProtectedRoute';
import AdminLayout from './components/admin/AdminLayout.jsx';
import { useTranslation } from './i18n/I18nProvider.jsx';
import ThemeStyleInjector from './theme/ThemeStyleInjector.jsx';
import BrandingInjector from './branding/BrandingInjector.jsx';
import SeoManager from './seo/SeoManager.jsx';
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
const ResponsibleGamingLimits = lazy(() => import('./pages/ResponsibleGaming'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminEvents = lazy(() => import('./pages/admin/Events'));
const AdminUsers = lazy(() => import('./pages/admin/Users'));
const AdminAnalytics = lazy(() => import('./pages/admin/Analytics'));
const AdminIgames = lazy(() => import('./pages/admin/Igames'));
const AdminGameSettings = lazy(() => import('./pages/admin/GameSettings'));
const AdminRoles = lazy(() => import('./pages/admin/Roles'));
const AdminVip = lazy(() => import('./pages/admin/Vip'));
const AdminPromotions = lazy(() => import('./pages/admin/Promotions'));
const AdminBots = lazy(() => import('./pages/admin/Bots'));
const AdminTickets = lazy(() => import('./pages/admin/Tickets'));
const AdminSegments = lazy(() => import('./pages/admin/Segments'));
const AdminSmsTemplates = lazy(() => import('./pages/admin/SmsTemplates'));
const AdminAgents = lazy(() => import('./pages/admin/Agents'));
const AdminAuditTrail = lazy(() => import('./pages/admin/AuditTrail'));
const AdminHealth = lazy(() => import('./pages/admin/Health'));
const AdminChatModeration = lazy(() => import('./pages/admin/ChatModeration'));
const AdminCompliance = lazy(() => import('./pages/admin/Compliance'));
const AdminGameTasks = lazy(() => import('./pages/admin/GameTasks'));
const AdminWallet = lazy(() => import('./pages/admin/Wallet'));
const AdminDemoData = lazy(() => import('./pages/admin/DemoData.jsx'));
const AdminPlatform = lazy(() => import('./pages/admin/Platform'));
const AdminPersonalization = lazy(() => import('./pages/admin/Personalization'));
const IgamesGame = lazy(() => import('./pages/IgamesGame'));
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

// Admin rotalarında müşteri Navbar/BottomNav gizlenir: admin shell'in
// kendi üst barı var, mobilde çift üst bar + alt bar çakışması düzeltilir.
function SiteChrome() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/admin')) return null;
  return (
    <>
      <Navbar />
      <BottomNav />
    </>
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
      <SeoManager />
      <ToastSystem />
      <PWAUpdateBanner />
      <SiteChrome />
      <Routes>
        <Route path="/login" element={<GuestRoute><Suspense fallback={<PageLoader />}><Login /></Suspense></GuestRoute>} />
        <Route path="/auth/callback" element={<Suspense fallback={<PageLoader />}><AuthCallback /></Suspense>} />
        <Route path="/" element={<Layout><Suspense fallback={<PageLoader />}><HomePage /></Suspense></Layout>} />
        <Route path="/bahis" element={<Layout><ModuleGate module="betting"><Suspense fallback={<PageLoader />}><Bahis /></Suspense></ModuleGate></Layout>} />
        <Route path="/canli" element={<Layout><ModuleGate module="betting"><Suspense fallback={<PageLoader />}><Live /></Suspense></ModuleGate></Layout>} />
        <Route path="/events/:id" element={<Layout><ModuleGate module="betting"><Suspense fallback={<PageLoader />}><EventDetail /></Suspense></ModuleGate></Layout>} />
        <Route path="/casino" element={<Layout><ModuleGate module="casino-content"><Suspense fallback={<PageLoader />}><HomePage /></Suspense></ModuleGate></Layout>} />
        <Route path="/igames/:gameId" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><IgamesGame /></Suspense></ProtectedRoute>} />
        <Route path="/responsible-gaming" element={<ProtectedRoute><Layout><Suspense fallback={<PageLoader />}><ResponsibleGamingLimits /></Suspense></Layout></ProtectedRoute>} />
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
        <Route
          path="/admin"
          element={
            <ProtectedRoute adminOnly>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Suspense fallback={<PageLoader />}><AdminDashboard /></Suspense>} />
          <Route path="events" element={<Suspense fallback={<PageLoader />}><AdminEvents /></Suspense>} />
          <Route path="users" element={<Suspense fallback={<PageLoader />}><AdminUsers /></Suspense>} />
          <Route path="game-tasks" element={<Suspense fallback={<PageLoader />}><AdminGameTasks /></Suspense>} />
          <Route path="casino" element={<Navigate to="/admin/analytics" replace />} />
          <Route path="igames" element={<Suspense fallback={<PageLoader />}><AdminIgames /></Suspense>} />
          <Route path="wallet" element={<Suspense fallback={<PageLoader />}><AdminWallet /></Suspense>} />
          <Route path="bank" element={<Navigate to="/admin/wallet?tab=bank" replace />} />
          <Route path="analytics" element={<Suspense fallback={<PageLoader />}><AdminAnalytics /></Suspense>} />
          <Route path="settings" element={<Navigate to="/admin/platform?tab=settings" replace />} />
          <Route path="modules" element={<Navigate to="/admin/platform?tab=modules" replace />} />
          <Route path="platform" element={<Suspense fallback={<PageLoader />}><AdminPlatform /></Suspense>} />
          <Route path="personalization" element={<Suspense fallback={<PageLoader />}><AdminPersonalization /></Suspense>} />
          <Route path="theme" element={<Navigate to="/admin/personalization?tab=theme" replace />} />
          <Route path="branding" element={<Navigate to="/admin/personalization?tab=branding" replace />} />
          <Route path="pages" element={<Navigate to="/admin/personalization?tab=pages" replace />} />
          <Route path="static-pages" element={<Navigate to="/admin/personalization?tab=staticPages" replace />} />
          <Route path="games-showcase" element={<Navigate to="/admin/igames?tab=showcase" replace />} />
          <Route path="game-settings" element={<Suspense fallback={<PageLoader />}><AdminGameSettings /></Suspense>} />
          <Route path="module-settings" element={<Navigate to="/admin/platform?tab=modules" replace />} />
          <Route path="roles" element={<Suspense fallback={<PageLoader />}><AdminRoles /></Suspense>} />
          <Route path="vip" element={<Suspense fallback={<PageLoader />}><AdminVip /></Suspense>} />
          <Route path="promotions" element={<Suspense fallback={<PageLoader />}><AdminPromotions /></Suspense>} />
          <Route path="sms-templates" element={<Suspense fallback={<PageLoader />}><AdminSmsTemplates /></Suspense>} />
          <Route path="bots" element={<Suspense fallback={<PageLoader />}><AdminBots /></Suspense>} />
          <Route path="tickets" element={<Suspense fallback={<PageLoader />}><AdminTickets /></Suspense>} />
          <Route path="compliance" element={<Suspense fallback={<PageLoader />}><AdminCompliance /></Suspense>} />
          <Route path="kyc" element={<Navigate to="/admin/compliance?tab=kyc" replace />} />
          <Route path="kyc-settings" element={<Navigate to="/admin/compliance?tab=kyc" replace />} />
          <Route path="crypto" element={<Navigate to="/admin/wallet?tab=crypto" replace />} />
          <Route path="slikair" element={<Navigate to="/admin/wallet?tab=slikair" replace />} />
          <Route path="responsible-gaming" element={<Navigate to="/admin/compliance?tab=rg" replace />} />
          <Route path="segments" element={<Suspense fallback={<PageLoader />}><AdminSegments /></Suspense>} />
          <Route path="agents" element={<Suspense fallback={<PageLoader />}><AdminAgents /></Suspense>} />
          <Route path="reconciliation" element={<Navigate to="/admin/compliance?tab=reconciliation" replace />} />
          {/* 2026-10-02 IA: Currencies/Jurisdictions/Brands → Settings sekmeleri */}
          <Route path="currencies" element={<Navigate to="/admin/platform?tab=currencies" replace />} />
          <Route path="brands" element={<Navigate to="/admin/platform?tab=brands" replace />} />
          <Route path="jurisdictions" element={<Navigate to="/admin/platform?tab=jurisdictions" replace />} />
          <Route path="audit" element={<Suspense fallback={<PageLoader />}><AdminAuditTrail /></Suspense>} />
          <Route path="health" element={<Suspense fallback={<PageLoader />}><AdminHealth /></Suspense>} />
          <Route path="chat" element={<Suspense fallback={<PageLoader />}><AdminChatModeration /></Suspense>} />
          <Route path="risk" element={<Navigate to="/admin/compliance?tab=risk" replace />} />
          <Route path="demo-data" element={<Suspense fallback={<PageLoader />}><AdminDemoData /></Suspense>} />
        </Route>
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
