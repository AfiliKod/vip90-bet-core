// client/src/components/admin/AdminTopbar.jsx
//
// Variant-C üst bar: global arama (/ kısayolu), demo pill, bildirim,
// dil ve kullanıcı menüsü (my-bets / promosyonlar / ayarlar / çıkış —
// eski Navbar kullanıcı menüsü içeriğini korur).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import { useAuthStore } from '../../store/authStore';
import { formatMoney } from '../../utils/money.js';
import LanguageSwitcher from '../../i18n/LanguageSwitcher.jsx';
import { ADMIN_NAV_GROUPS } from './adminNav.config.js';
import { useAdminCount } from '../../hooks/useAdminCounts.js';

export default function AdminTopbar({ onMenuOpen }) {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [q, setQ] = useState('');
  const [searchFocus, setSearchFocus] = useState(false);
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const inputRef = useRef(null);

  const username = user?.username || '—';
  const initial = username.charAt(0).toUpperCase();

  // Global sayfa araması: admin nav linkleri üzerinde filtre.
  const matches = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr');
    if (!needle) return [];
    const rows = [];
    ADMIN_NAV_GROUPS.forEach(g => {
      g.items.forEach(item => {
        const label = t(item.labelKey);
        if (
          label.toLocaleLowerCase('tr').includes(needle)
          || item.to.toLocaleLowerCase('tr').includes(needle)
        ) {
          rows.push({ id: item.id, label, to: item.to, group: t(g.labelKey) });
        }
      });
    });
    return rows.slice(0, 8);
  }, [q, t]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const el = document.activeElement;
        const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
        if (!typing) {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }
    }
    function onClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchFocus(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, []);

  const go = (to) => {
    setQ('');
    setSearchFocus(false);
    setMenuOpen(false);
    navigate(to);
  };

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login');
  };

  // Zil /admin/tickets'e gittiği için sayı da açık ticket sayısıdır.
  const notifCount = useAdminCount('tickets');

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-white/10 bg-bg-card px-3 sm:gap-3 sm:px-5">
      {/* Mobil: menü */}
      <button
        type="button"
        onClick={onMenuOpen}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-text-2 hover:bg-bg-hover hover:text-text-1 lg:hidden"
        aria-label={t('admin.shell.menuOpen')}
      >
        <span className="material-symbols-outlined !text-[22px]" aria-hidden="true">menu</span>
      </button>

      {/* Arama */}
      <div ref={searchRef} className="relative min-w-0 flex-1 sm:max-w-xs md:max-w-sm">
        <label className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-bg-deep px-2.5 text-text-3">
          <span className="material-symbols-outlined !text-[16px] opacity-70" aria-hidden="true">search</span>
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={e => { setQ(e.target.value); setSearchFocus(true); }}
            onFocus={() => setSearchFocus(true)}
            placeholder={t('admin.shell.searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-text-1 outline-none placeholder:text-text-3"
          />
          <kbd className="hidden rounded-md border border-white/10 bg-bg-hover px-1.5 py-0.5 font-mono text-[11px] font-bold text-text-3 sm:block">/</kbd>
        </label>
        {searchFocus && q.trim() && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-white/10 bg-bg-card shadow-2xl">
            {matches.length === 0 ? (
              <div className="px-3 py-2.5 text-[13px] text-text-3">{t('admin.shell.noResults')}</div>
            ) : matches.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => go(m.to)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-[13px] text-text-2 transition hover:bg-bg-hover hover:text-text-1"
              >
                <span className="font-semibold">{m.label}</span>
                <span className="truncate text-[11px] text-text-3">{m.group}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1" />

      <span className="hidden rounded-full border border-warning/35 bg-warning/15 px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wider text-warning sm:inline-flex">
        {t('admin.shell.demoPill')}
      </span>

      <Link
        to="/admin/tickets"
        className="relative grid h-9 w-9 place-items-center rounded-lg text-text-2 transition hover:bg-bg-hover hover:text-text-1"
        aria-label={t('admin.shell.notifications')}
      >
        <span className="material-symbols-outlined !text-[19px]" aria-hidden="true">notifications</span>
        {notifCount > 0 && (
          <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full border-2 border-bg-card bg-info px-0.5 text-[9px] font-extrabold leading-none text-white">
            {notifCount}
          </span>
        )}
      </Link>

      <div className="hidden sm:flex"><LanguageSwitcher /></div>

      {/* Kullanıcı menüsü */}
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen(o => !o)}
          className="flex h-9 items-center gap-2 rounded-lg border border-transparent px-1.5 transition hover:border-white/10 hover:bg-bg-hover"
          aria-label={t('admin.shell.userMenu')}
          aria-expanded={menuOpen}
        >
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-[11px] font-extrabold text-black">
            {initial}
          </span>
          <span className="hidden text-left leading-tight md:block">
            <strong className="block max-w-[120px] truncate text-[12.5px] font-bold text-text-1">{username}</strong>
            <span className="block text-[10.5px] font-semibold text-text-3">{t('admin.shell.roleAdmin')}</span>
          </span>
          <span className="material-symbols-outlined !text-[16px] text-text-3" aria-hidden="true">expand_more</span>
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-white/10 bg-bg-card shadow-2xl">
            <div className="border-b border-white/5 px-4 pt-4 pb-3">
              <div className="text-sm font-bold text-text-1">{username}</div>
              <div className="truncate text-[11px] text-text-3">{user?.email || '—'}</div>
              {user?.balance != null && (
                <div className="mt-2 rounded-lg border border-white/10 bg-bg-deep px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-text-3">{t('balance.total')}</div>
                  <div className="mt-0.5 font-mono text-lg font-extrabold tabular-nums text-primary">
                    {formatMoney(user.balance)}
                  </div>
                </div>
              )}
            </div>
            <div className="py-1">
              {[
                { to: '/', label: t('admin.shell.backToSite'), icon: 'language' },
                { to: '/my-bets', label: t('nav.myBets'), icon: 'receipt_long' },
                { to: '/promotions', label: t('nav.promotions'), icon: 'redeem' },
                { to: '/settings', label: t('nav.settings'), icon: 'settings' },
              ].map(item => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-2 transition hover:bg-bg-hover hover:text-text-1"
                >
                  <span className="material-symbols-outlined !text-[17px] text-text-3" aria-hidden="true">{item.icon}</span>
                  <span className="font-medium">{item.label}</span>
                </Link>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-white/5 px-4 py-2 sm:hidden">
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-3">{t('common.languageSwitcher.label')}</span>
              <LanguageSwitcher />
            </div>
            <div className="border-t border-white/5 py-1">
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-danger transition hover:bg-danger/10"
              >
                <span className="material-symbols-outlined !text-[17px]" aria-hidden="true">logout</span>
                <span className="font-medium">{t('auth.logout')}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
