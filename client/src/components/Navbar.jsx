import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
export default function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const handleLogout = async () => { setOpen(false); await logout(); navigate('/login'); };
  const nav = (to) => { setOpen(false); navigate(to); };

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const username = user?.username || 'Profil';
  const initial = username.charAt(0).toUpperCase();
  const balance = user?.balance?.toFixed(2) ?? '0.00';
  const palaceBalance = user?.activePalaceBalance;
  const totalBalance = palaceBalance != null ? (user.balance + palaceBalance).toFixed(2) : balance;

  return (
    <nav className="sticky top-0 z-40 bg-bg-base/80 backdrop-blur border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg text-text-1 shrink-0">
          <span className="text-2xl">💎</span> VIP90.bet
        </Link>
        <div className="hidden lg:flex items-center gap-1 flex-1 overflow-x-auto">
          <NavLink to="/bahis" end className={({isActive}) => `px-3 py-1.5 rounded-lg text-sm hover:text-text-1 hover:bg-bg-hover transition whitespace-nowrap ${isActive ? 'text-text-1 bg-bg-hover' : 'text-text-2'}`}>⚽ Bahis</NavLink>
          <NavLink to="/canli" className={({isActive}) => `px-3 py-1.5 rounded-lg text-sm hover:text-text-1 hover:bg-bg-hover transition whitespace-nowrap ${isActive ? 'text-text-1 bg-bg-hover' : 'text-text-2'}`}>🔴 Canlı</NavLink>
          <NavLink to="/casino-v2" className={({isActive}) => `px-3 py-1.5 rounded-lg text-sm hover:text-text-1 hover:bg-bg-hover transition whitespace-nowrap ${isActive ? 'text-text-1 bg-bg-hover' : 'text-text-2'}`}>🎰 Casino</NavLink>
          {user?.role === 'admin' && (
            <Link to="/admin" className="px-3 py-1.5 rounded-lg text-sm text-warning hover:bg-bg-hover transition whitespace-nowrap">⚙️ Admin</Link>
          )}
        </div>

        {/* User dropdown */}
        <div className="relative shrink-0" ref={ref}>
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-2 bg-bg-card border border-white/10 rounded-full pl-1 pr-3 py-1 hover:border-primary/40 transition"
          >
            <span
              className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-black text-white shadow-md"
              style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)' }}
            >
              {initial}
            </span>
            <span className="text-sm font-semibold text-text-1 hidden sm:inline">₺{totalBalance}</span>
            <span className="text-text-3 text-xs">{open ? '▲' : '▼'}</span>
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-bg-card border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden animate-fade-in">
              {/* Header: avatar + username + email */}
              <div className="relative px-4 pt-4 pb-3">
                <div
                  className="absolute inset-x-0 top-0 h-20 opacity-30 pointer-events-none"
                  style={{ background: 'linear-gradient(180deg, #00d4ff33 0%, transparent 100%)' }}
                />
                <div className="relative flex items-center gap-3">
                  <span
                    className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-black text-white shadow-lg ring-2 ring-white/10"
                    style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)' }}
                  >
                    {initial}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-text-1 truncate">{username}</div>
                    <div className="text-[11px] text-text-3 truncate">{user?.email || '—'}</div>
                  </div>
                </div>
              </div>

              {/* Balance card */}
              <div className="px-4 pb-3">
                <div
                  className="rounded-xl px-4 py-3"
                  style={{ background: 'linear-gradient(135deg, #060d1a 0%, #111d30 100%)', border: '1px solid #ffffff14' }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: '#4a5a78' }}>
                        Toplam Bakiye
                      </div>
                      <div className="text-2xl font-black mt-0.5" style={{ color: '#00d4ff' }}>₺{totalBalance}</div>
                      {user?.locked > 0 && (
                        <div className="text-[11px] font-bold mt-0.5" style={{ color: '#fbbf24' }}>
                          🔒 ₺{user.locked.toFixed(2)} kilitli
                        </div>
                      )}
                    </div>
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                      style={{ background: '#00d4ff22', border: '1px solid #00d4ff44' }}
                    >
                      💰
                    </div>
                  </div>
                  {palaceBalance != null && (
                    <div className="mt-2 pt-2 border-t border-white/[0.06] flex justify-between text-xs" style={{ color: '#7c8aae' }}>
                      <span>🏰 Casino'da</span>
                      <span className="font-semibold" style={{ color: '#c8d8f0' }}>₺{palaceBalance.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Primary action: Yatır - Çek */}
              <div className="px-4 pb-3">
                <button
                  onClick={() => nav('/profile?mode=deposit&method=bank')}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-black transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg"
                  style={{ background: 'linear-gradient(90deg, #00d4ff 0%, #7c3aed 100%)' }}
                >
                  <span className="text-base">💸</span>
                  <span>Yatır · Çek</span>
                  <span className="text-base">→</span>
                </button>
                <div className="flex justify-center gap-3 mt-2 text-[10px]" style={{ color: '#4a5a78' }}>
                  <span>🏦 Havale / EFT</span>
                  <span>·</span>
                  <span>🪙 Kripto (USDT)</span>
                </div>
              </div>

              {/* Menü linkleri */}
              <div className="py-1 border-t border-white/5">
                {[
                  { to: '/my-bets',    icon: '📋', label: 'Bahislerim' },
                  { to: '/promotions', icon: '🎁', label: 'Kampanyalar' },
                  { to: '/settings',   icon: '⚙️', label: 'Ayarlar' },
                ].map(item => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-2 hover:bg-bg-hover hover:text-text-1 transition"
                  >
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm bg-white/[0.04] border border-white/[0.06]">
                      {item.icon}
                    </span>
                    <span className="font-medium">{item.label}</span>
                  </Link>
                ))}
              </div>

              {/* Çıkış */}
              <div className="border-t border-white/5 py-1">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition"
                >
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm bg-danger/10 border border-danger/20">
                    🚪
                  </span>
                  <span className="font-medium">Çıkış Yap</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}