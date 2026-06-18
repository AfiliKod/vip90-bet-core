import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';


export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [pendingTasks, setPendingTasks] = useState(0);
  useEffect(() => {
    api.get('/admin/stats').then(r => setStats(r.data)).catch(() => {});
    api.get('/admin/tasks?status=pending').then(r => setPendingTasks(r.data.tasks?.length ?? 0)).catch(() => {});
  }, []);

  const cards = stats ? [
    { label: 'Toplam Kullanıcı', value: stats.userCount, icon: '👥' },
    { label: 'Toplam Bahis', value: stats.totalBets, icon: '🎯' },
    { label: 'Bekleyen Bahis', value: stats.pendingBets, icon: '⏳' },
    { label: 'Toplam Yatırım', value: `₺${(stats.totalDeposit || 0).toFixed(0)}`, icon: '💰' },
  ] : [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-text-1 mb-6">⚙️ Admin Paneli</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {stats ? cards.map(c => (
          <div key={c.label} className="bg-bg-card border border-white/10 rounded-xl p-4">
            <div className="text-2xl mb-2">{c.icon}</div>
            <div className="text-2xl font-black text-text-1">{c.value}</div>
            <div className="text-text-3 text-xs mt-1">{c.label}</div>
          </div>
        )) : [1,2,3,4].map(i => <div key={i} className="bg-bg-card border border-white/10 rounded-xl p-4 h-24 animate-pulse" />)}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link to="/admin/events" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">⚽</div>
          <div className="font-semibold text-text-1">Etkinlik Yönetimi</div>
          <div className="text-text-3 text-sm mt-1">Etkinlik oluştur, sonuçlandır</div>
        </Link>
        <Link to="/admin/users" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">👥</div>
          <div className="font-semibold text-text-1">Kullanıcı Yönetimi</div>
          <div className="text-text-3 text-sm mt-1">Bakiye düzenle, hesap askıya al</div>
        </Link>
        <Link to="/admin/tasks" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-yellow-500/20 transition text-center relative">
          {pendingTasks > 0 && (
            <span className="absolute top-3 right-3 bg-yellow-500 text-black text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center">
              {pendingTasks}
            </span>
          )}
          <div className="text-3xl mb-2">🎰</div>
          <div className="font-semibold text-text-1">Oyun Görevleri</div>
          <div className="text-text-3 text-sm mt-1">Hatalı oyun incele, düzelt</div>
        </Link>
        <Link to="/admin/casino" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">📊</div>
          <div className="font-semibold text-text-1">Casino İstatistikleri</div>
          <div className="text-text-3 text-sm mt-1">GGR, oyuncu ve oyun analizi</div>
        </Link>
      </div>
    </div>
  );
}
