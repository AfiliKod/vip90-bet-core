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
import { PWAUpdateBanner, OnlineStatusIndicator } from './components/PWAComponents.jsx';

// Phase E3: Code splitting — initial bundle'dan büyük sayfalar lazy
const Login = lazy(() => import('./pages/Login'));
const Bahis = lazy(() => import('./pages/Bahis'));
const Live = lazy(() => import('./pages/Live'));
const EventDetail = lazy(() => import('./pages/EventDetail'));
const MyBets = lazy(() => import('./pages/MyBets'));
const Profile = lazy(() => import('./pages/Profile'));
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
const CasinoRedesign = lazy(() => import('./pages/CasinoRedesign'));
const PalaceGame = lazy(() => import('./pages/PalaceGame'));
const Crash = lazy(() => import('./pages/games/Crash'));
const Mines = lazy(() => import('./pages/games/Mines'));
const Plinko = lazy(() => import('./pages/games/Plinko'));
const Dice = lazy(() => import('./pages/games/Dice'));
const Limbo = lazy(() => import('./pages/games/Limbo'));
const Wheel = lazy(() => import('./pages/games/Wheel'));
const Hilo = lazy(() => import('./pages/games/Hilo'));
const Keno = lazy(() => import('./pages/games/Keno'));
const Blackjack = lazy(() => import('./pages/games/Blackjack'));
const Roulette = lazy(() => import('./pages/games/Roulette'));
const Baccarat = lazy(() => import('./pages/games/Baccarat'));
const VideoPoker = lazy(() => import('./pages/games/VideoPoker'));
const DragonTiger = lazy(() => import('./pages/games/DragonTiger'));
const HomePage = lazy(() => import('./pages/HomePage'));
const Terms = lazy(() => import('./pages/legal/Terms'));
const Privacy = lazy(() => import('./pages/legal/Privacy'));
const Kvkk = lazy(() => import('./pages/legal/Kvkk'));
const Cookies = lazy(() => import('./pages/legal/Cookies'));
const BonusTerms = lazy(() => import('./pages/legal/BonusTerms'));
const ResponsibleGaming = lazy(() => import('./pages/legal/ResponsibleGaming'));
const UserAgreement = lazy(() => import('./pages/legal/UserAgreement'));
const Status = lazy(() => import('./pages/Status'));
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
    return () => {
      socket.off('balance:update', onBalanceUpdate);
      socket.off('bet:settled', onBetSettled);
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
      <OnlineStatusIndicator />
      <Navbar />
      <BottomNav />
      <Routes>
        <Route path="/login" element={<GuestRoute><Suspense fallback={<PageLoader />}><Login /></Suspense></GuestRoute>} />
        <Route path="/" element={<Layout><Suspense fallback={<PageLoader />}><HomePage /></Suspense></Layout>} />
        <Route path="/bahis" element={<Layout><ModuleGate module="betting"><Suspense fallback={<PageLoader />}><Bahis /></Suspense></ModuleGate></Layout>} />
        <Route path="/canli" element={<Layout><ModuleGate module="betting"><Suspense fallback={<PageLoader />}><Live /></Suspense></ModuleGate></Layout>} />
        <Route path="/events/:id" element={<Layout><ModuleGate module="betting"><Suspense fallback={<PageLoader />}><EventDetail /></Suspense></ModuleGate></Layout>} />
        <Route path="/casino" element={<Layout><ModuleGate module="casino-content"><Suspense fallback={<PageLoader />}><CasinoRedesign /></Suspense></ModuleGate></Layout>} />
        <Route path="/palace/:gameId" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><PalaceGame /></Suspense></ProtectedRoute>} />
        <Route path="/games/crash" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><Crash /></Suspense></ProtectedRoute>} />
        <Route path="/games/mines" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><Mines /></Suspense></ProtectedRoute>} />
        <Route path="/games/plinko" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><Plinko /></Suspense></ProtectedRoute>} />
        <Route path="/games/dice" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><Dice /></Suspense></ProtectedRoute>} />
        <Route path="/games/limbo" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><Limbo /></Suspense></ProtectedRoute>} />
        <Route path="/games/wheel" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><Wheel /></Suspense></ProtectedRoute>} />
        <Route path="/games/hilo" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><Hilo /></Suspense></ProtectedRoute>} />
        <Route path="/games/keno" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><Keno /></Suspense></ProtectedRoute>} />
        <Route path="/games/blackjack" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><Blackjack /></Suspense></ProtectedRoute>} />
        <Route path="/games/roulette" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><Roulette /></Suspense></ProtectedRoute>} />
        <Route path="/games/baccarat" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><Baccarat /></Suspense></ProtectedRoute>} />
        <Route path="/games/videopoker" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><VideoPoker /></Suspense></ProtectedRoute>} />
        <Route path="/games/dragontiger" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><DragonTiger /></Suspense></ProtectedRoute>} />
        <Route path="/my-bets" element={<ProtectedRoute><Layout><Suspense fallback={<PageLoader />}><MyBets /></Suspense></Layout></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Layout><Suspense fallback={<PageLoader />}><Profile /></Suspense></Layout></ProtectedRoute>} />
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
        <Route path="/admin/roles" element={<ProtectedRoute adminOnly><Suspense fallback={<PageLoader />}><AdminRoles /></Suspense></ProtectedRoute>} />
        <Route path="/admin/vip" element={<ProtectedRoute adminOnly><Suspense fallback={<PageLoader />}><AdminVip /></Suspense></ProtectedRoute>} />
        {/* Legal pages (public) */}
        <Route path="/legal/terms" element={<Suspense fallback={<PageLoader />}><Terms /></Suspense>} />
        <Route path="/legal/privacy" element={<Suspense fallback={<PageLoader />}><Privacy /></Suspense>} />
        <Route path="/legal/kvkk" element={<Suspense fallback={<PageLoader />}><Kvkk /></Suspense>} />
        <Route path="/legal/cookies" element={<Suspense fallback={<PageLoader />}><Cookies /></Suspense>} />
        <Route path="/legal/bonus-terms" element={<Suspense fallback={<PageLoader />}><BonusTerms /></Suspense>} />
        <Route path="/legal/responsible-gaming" element={<Suspense fallback={<PageLoader />}><ResponsibleGaming /></Suspense>} />
        <Route path="/legal/user-agreement" element={<Suspense fallback={<PageLoader />}><UserAgreement /></Suspense>} />
        <Route path="/status" element={<Suspense fallback={<PageLoader />}><Status /></Suspense>} />
        <Route path="/forgot-password" element={<GuestRoute><Suspense fallback={<PageLoader />}><ForgotPassword /></Suspense></GuestRoute>} />
        <Route path="/reset-password" element={<GuestRoute endSession><Suspense fallback={<PageLoader />}><ResetPassword /></Suspense></GuestRoute>} />
        <Route path="/verify-email" element={<GuestRoute endSession><Suspense fallback={<PageLoader />}><VerifyEmail /></Suspense></GuestRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </>
  );
}
