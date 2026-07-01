import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useToastStore } from './store/toastStore';
import { useBetNotificationStore } from './store/betNotificationStore';
import { socket } from './services/socket';
import ProtectedRoute from './components/ProtectedRoute';
import ToastSystem from './components/ToastSystem';
import Navbar from './components/Navbar';
import BottomNav from './components/BottomNav';
import Layout from './components/Layout';

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
const Casino = lazy(() => import('./pages/Casino'));
const CasinoV2 = lazy(() => import('./pages/CasinoV2'));
const CasinoGame = lazy(() => import('./pages/CasinoGame'));
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
const Terms = lazy(() => import('./pages/legal/Terms'));
const Privacy = lazy(() => import('./pages/legal/Privacy'));
const Kvkk = lazy(() => import('./pages/legal/Kvkk'));
const Cookies = lazy(() => import('./pages/legal/Cookies'));
const BonusTerms = lazy(() => import('./pages/legal/BonusTerms'));
const ResponsibleGaming = lazy(() => import('./pages/legal/ResponsibleGaming'));
const Status = lazy(() => import('./pages/Status'));
const Welcome = lazy(() => import('./pages/Welcome'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));

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
  const { init, user } = useAuthStore();
  const addToast = useToastStore(s => s.add);
  const incrementUnread = useBetNotificationStore(s => s.increment);

  useEffect(() => { init(); }, []);

  useEffect(() => {
    function onBetSettled({ eventTitle, result, payout, amount }) {
      incrementUnread();
      if (result === 'win') {
        addToast(`Kazandınız! ${eventTitle} — +₺${payout.toFixed(2)}`, 'success');
      } else if (result === 'refund') {
        addToast(`İade edildi! ${eventTitle} — ₺${amount.toFixed(2)}`, 'info');
      } else {
        addToast(`Kaybedildi: ${eventTitle} — -₺${amount.toFixed(2)}`, 'error');
      }
    }
    socket.on('bet:settled', onBetSettled);
    return () => socket.off('bet:settled', onBetSettled);
  }, []);

  return (
    <BrowserRouter>
      <ToastSystem />
      {user && <Navbar />}
      {user && <BottomNav />}
      <Routes>
        <Route path="/login" element={<Suspense fallback={<PageLoader />}><Login /></Suspense>} />
        <Route path="/" element={<ProtectedRoute><Layout><Suspense fallback={<PageLoader />}><Bahis /></Suspense></Layout></ProtectedRoute>} />
        <Route path="/canli" element={<ProtectedRoute><Layout><Suspense fallback={<PageLoader />}><Live /></Suspense></Layout></ProtectedRoute>} />
        <Route path="/events/:id" element={<ProtectedRoute><Layout><Suspense fallback={<PageLoader />}><EventDetail /></Suspense></Layout></ProtectedRoute>} />
        <Route path="/casino" element={<ProtectedRoute><Layout><Suspense fallback={<PageLoader />}><CasinoV2 /></Suspense></Layout></ProtectedRoute>} />
        <Route path="/casino-v2" element={<ProtectedRoute><Layout><Suspense fallback={<PageLoader />}><CasinoV2 /></Suspense></Layout></ProtectedRoute>} />
        <Route path="/casino/:gameSymbol" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><CasinoGame /></Suspense></ProtectedRoute>} />
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
        {/* Legal pages (public) */}
        <Route path="/legal/terms" element={<Suspense fallback={<PageLoader />}><Terms /></Suspense>} />
        <Route path="/legal/privacy" element={<Suspense fallback={<PageLoader />}><Privacy /></Suspense>} />
        <Route path="/legal/kvkk" element={<Suspense fallback={<PageLoader />}><Kvkk /></Suspense>} />
        <Route path="/legal/cookies" element={<Suspense fallback={<PageLoader />}><Cookies /></Suspense>} />
        <Route path="/legal/bonus-terms" element={<Suspense fallback={<PageLoader />}><BonusTerms /></Suspense>} />
        <Route path="/legal/responsible-gaming" element={<Suspense fallback={<PageLoader />}><ResponsibleGaming /></Suspense>} />
        <Route path="/status" element={<Suspense fallback={<PageLoader />}><Status /></Suspense>} />
        <Route path="/forgot-password" element={<Suspense fallback={<PageLoader />}><ForgotPassword /></Suspense>} />
        <Route path="/reset-password" element={<Suspense fallback={<PageLoader />}><ResetPassword /></Suspense>} />
        {/* Phase D3 — 18+ yaş gate (auth required, no age check yet) */}
        <Route path="/welcome" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><Welcome /></Suspense></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
