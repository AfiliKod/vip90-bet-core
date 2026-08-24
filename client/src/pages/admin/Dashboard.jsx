import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';

export default function AdminDashboard() {
  const [pendingBank, setPendingBank] = useState(0);
  const [openTickets, setOpenTickets] = useState(0);
  useEffect(() => {
    Promise.all([
      api.get('/bank/admin/pending?type=deposit'),
      api.get('/bank/admin/pending?type=withdraw'),
    ]).then(([d, w]) => setPendingBank(d.data.requests.length + w.data.requests.length)).catch(() => {});
    api.get('/tickets', { params: { status: 'open' } }).then(({ data }) => setOpenTickets(data.length)).catch(() => {});
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-text-1 mb-6">⚙️ Admin Paneli</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link to="/admin/users" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">👥</div>
          <div className="font-semibold text-text-1">Kullanıcı Yönetimi</div>
          <div className="text-text-3 text-sm mt-1">Bakiye düzenle, hesap askıya al</div>
        </Link>
        <Link to="/admin/casino" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">📊</div>
          <div className="font-semibold text-text-1">Casino İstatistikleri</div>
          <div className="text-text-3 text-sm mt-1">GGR, oyuncu ve oyun analizi</div>
        </Link>
        <Link to="/admin/bank" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-accent/30 transition text-center relative">
          {pendingBank > 0 && (
            <span className="absolute top-3 right-3 bg-accent text-white text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center">
              {pendingBank}
            </span>
          )}
          <div className="text-3xl mb-2">🏦</div>
          <div className="font-semibold text-text-1">Banka Talepleri</div>
          <div className="text-text-3 text-sm mt-1">Yatırma/Çekme onayla</div>
        </Link>
        <Link to="/admin/analytics" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-accent/30 transition text-center">
          <div className="text-3xl mb-2">📈</div>
          <div className="font-semibold text-text-1">Analitik</div>
          <div className="text-text-3 text-sm mt-1">Detaylı istatistik ve grafikler</div>
        </Link>
        <Link to="/admin/settings" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-accent/30 transition text-center">
          <div className="text-3xl mb-2">⚙️</div>
          <div className="font-semibold text-text-1">Sistem Ayarları</div>
          <div className="text-text-3 text-sm mt-1">Para birimi, saat dilimi, alarm kanalları</div>
        </Link>
        <Link to="/admin/modules" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">🧩</div>
          <div className="font-semibold text-text-1">Modüller</div>
          <div className="text-text-3 text-sm mt-1">Bahis, casino modüllerini aç/kapat</div>
        </Link>
        <Link to="/admin/theme" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-accent/30 transition text-center">
          <div className="text-3xl mb-2">🎨</div>
          <div className="font-semibold text-text-1">Tema Editörü</div>
          <div className="text-text-3 text-sm mt-1">Renk, yazı tipi, köşe — canlı önizleme</div>
        </Link>
        <Link to="/admin/branding" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-accent/30 transition text-center">
          <div className="text-3xl mb-2">🏷️</div>
          <div className="font-semibold text-text-1">Marka Kimliği</div>
          <div className="text-text-3 text-sm mt-1">Logo, favicon, site adı, font</div>
        </Link>
        <Link to="/admin/pages" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-accent/30 transition text-center">
          <div className="text-3xl mb-2">🧩</div>
          <div className="font-semibold text-text-1">Sayfa Düzenleyici</div>
          <div className="text-text-3 text-sm mt-1">Bölüm sırası, kampanya banner'ları</div>
        </Link>
        <Link to="/admin/games-showcase" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-accent/30 transition text-center">
          <div className="text-3xl mb-2">⭐</div>
          <div className="font-semibold text-text-1">Oyun Vitrini</div>
          <div className="text-text-3 text-sm mt-1">Öne çıkan oyunlar, sıralama</div>
        </Link>
        <Link to="/admin/game-settings" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">🎛️</div>
          <div className="font-semibold text-text-1">Oyun Ayarları</div>
          <div className="text-text-3 text-sm mt-1">RTP, house edge, bahis limitleri</div>
        </Link>
        <Link to="/admin/roles" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">🔑</div>
          <div className="font-semibold text-text-1">Roller ve Yetkiler</div>
          <div className="text-text-3 text-sm mt-1">Kademeli yönetici izinleri</div>
        </Link>
        <Link to="/admin/vip" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">💎</div>
          <div className="font-semibold text-text-1">VIP Seviyeleri</div>
          <div className="text-text-3 text-sm mt-1">XP eşikleri, ödüller, cashback</div>
        </Link>
        <Link to="/admin/bots" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">🤖</div>
          <div className="font-semibold text-text-1">Bot Oyuncular</div>
          <div className="text-text-3 text-sm mt-1">Otomatik oyuncu botları</div>
        </Link>
        <Link to="/admin/static-pages" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">📄</div>
          <div className="font-semibold text-text-1">Statik Sayfalar</div>
          <div className="text-text-3 text-sm mt-1">Footer, Hakkımızda, Yasal metinler</div>
        </Link>
        <Link to="/admin/tickets" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-accent/30 transition text-center relative">
          {openTickets > 0 && (
            <span className="absolute top-3 right-3 bg-accent text-white text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center">
              {openTickets}
            </span>
          )}
          <div className="text-3xl mb-2">🎫</div>
          <div className="font-semibold text-text-1">Destek Talepleri</div>
          <div className="text-text-3 text-sm mt-1">Yardım Merkezi ticket'ları</div>
        </Link>
      </div>
    </div>
  );
}
