import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useTranslation } from '../../i18n';

export default function AdminDashboard() {
  const { t } = useTranslation();
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
      <h1 className="text-2xl font-bold text-text-1 mb-6">⚙️ {t('admin.dashboard.pageTitle')}</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link to="/admin/users" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">👥</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.users.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.users.desc')}</div>
        </Link>
        <Link to="/admin/casino" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">📊</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.casino.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.casino.desc')}</div>
        </Link>
        <Link to="/admin/bank" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-accent/30 transition text-center relative">
          {pendingBank > 0 && (
            <span className="absolute top-3 right-3 bg-accent text-white text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center">
              {pendingBank}
            </span>
          )}
          <div className="text-3xl mb-2">🏦</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.bank.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.bank.desc')}</div>
        </Link>
        <Link to="/admin/analytics" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-accent/30 transition text-center">
          <div className="text-3xl mb-2">📈</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.analytics.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.analytics.desc')}</div>
        </Link>
        <Link to="/admin/settings" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-accent/30 transition text-center">
          <div className="text-3xl mb-2">⚙️</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.settingsCard.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.settingsCard.desc')}</div>
        </Link>
        <Link to="/admin/modules" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">🧩</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.modules.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.modules.desc')}</div>
        </Link>
        <Link to="/admin/module-settings" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">🔌</div>
          <div className="font-semibold text-text-1">Modül Ayarları</div>
          <div className="text-text-3 text-sm mt-1">In-house oyunlar, bahis verisi, Palace API/dil ayarları</div>
        </Link>
        <Link to="/admin/theme" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-accent/30 transition text-center">
          <div className="text-3xl mb-2">🎨</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.theme.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.theme.desc')}</div>
        </Link>
        <Link to="/admin/branding" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-accent/30 transition text-center">
          <div className="text-3xl mb-2">🏷️</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.branding.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.branding.desc')}</div>
        </Link>
        <Link to="/admin/pages" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-accent/30 transition text-center">
          <div className="text-3xl mb-2">🧩</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.pages.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.pages.desc')}</div>
        </Link>
        <Link to="/admin/promotions" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">🎁</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.promotions.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.promotions.desc')}</div>
        </Link>
        <Link to="/admin/games-showcase" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-accent/30 transition text-center">
          <div className="text-3xl mb-2">⭐</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.gamesShowcase.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.gamesShowcase.desc')}</div>
        </Link>
        <Link to="/admin/game-settings" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">🎛️</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.gameSettings.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.gameSettings.desc')}</div>
        </Link>
        <Link to="/admin/roles" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">🔑</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.roles.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.roles.desc')}</div>
        </Link>
        <Link to="/admin/vip" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">💎</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.vip.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.vip.desc')}</div>
        </Link>
        <Link to="/admin/bots" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">🏆</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.bots.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.bots.desc')}</div>
        </Link>
        <Link to="/admin/static-pages" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">📄</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.staticPages.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.staticPages.desc')}</div>
        </Link>
        <Link to="/admin/tickets" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-accent/30 transition text-center relative">
          {openTickets > 0 && (
            <span className="absolute top-3 right-3 bg-accent text-white text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center">
              {openTickets}
            </span>
          )}
          <div className="text-3xl mb-2">🎫</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.tickets.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.tickets.desc')}</div>
        </Link>
      </div>
    </div>
  );
}
