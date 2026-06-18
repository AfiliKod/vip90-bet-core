import { useEffect } from 'react';
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
import Login from './pages/Login';
import Bahis from './pages/Bahis';
import Live from './pages/Live';
import EventDetail from './pages/EventDetail';
import MyBets from './pages/MyBets';
import Profile from './pages/Profile';
import Promotions from './pages/Promotions';
import Settings from './pages/Settings';
import AdminDashboard from './pages/admin/Dashboard';
import AdminEvents from './pages/admin/Events';
import AdminUsers from './pages/admin/Users';
import AdminGameTasks from './pages/admin/GameTasks';
import AdminCasinoStats from './pages/admin/CasinoStats';
import Casino from './pages/Casino';
import CasinoGame from './pages/CasinoGame';

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
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Layout><Bahis /></Layout></ProtectedRoute>} />
        <Route path="/canli" element={<ProtectedRoute><Layout><Live /></Layout></ProtectedRoute>} />
        <Route path="/events/:id" element={<ProtectedRoute><Layout><EventDetail /></Layout></ProtectedRoute>} />
        <Route path="/casino" element={<ProtectedRoute><Layout><Casino /></Layout></ProtectedRoute>} />
        <Route path="/casino/:gameSymbol" element={<ProtectedRoute><CasinoGame /></ProtectedRoute>} />
        <Route path="/my-bets" element={<ProtectedRoute><Layout><MyBets /></Layout></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Layout><Profile /></Layout></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Layout><Settings /></Layout></ProtectedRoute>} />
        <Route path="/promotions" element={<ProtectedRoute><Layout><Promotions /></Layout></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/events" element={<ProtectedRoute adminOnly><AdminEvents /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute adminOnly><AdminUsers /></ProtectedRoute>} />
        <Route path="/admin/tasks" element={<ProtectedRoute adminOnly><AdminGameTasks /></ProtectedRoute>} />
        <Route path="/admin/casino" element={<ProtectedRoute adminOnly><AdminCasinoStats /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
