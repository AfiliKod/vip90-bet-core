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

  return (
    <nav className="sticky top-0 z-40 bg-bg-base/80 backdrop-blur border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg text-text-1 shrink-0">
          <span className="text-2xl">💎</span> VIP90.bet
        </Link>
        <div className="hidden lg:flex items-center gap-1 flex-1 overflow-x-auto">
          <NavLink to="/" end className={({isActive}) => `px-3 py-1.5 rounded-lg text-sm hover:text-text-1 hover:bg-bg-hover transition whitespace-nowrap ${isActive ? 'text-text-1 bg-bg-hover' : 'text-text-2'}`}>⚽ Bahis</NavLink>
          <NavLink to="/canli" className={({isActive}) => `px-3 py-1.5 rounded-lg text-sm hover:text-text-1 hover:bg-bg-hover transition whitespace-nowrap ${isActive ? 'text-text-1 bg-bg-hover' : 'text-text-2'}`}>🔴 Canlı</NavLink>
          <NavLink to="/casino" className={({isActive}) => `px-3 py-1.5 rounded-lg text-sm hover:text-text-1 hover:bg-bg-hover transition whitespace-nowrap ${isActive ? 'text-text-1 bg-bg-hover' : 'text-text-2'}`}>🎰 Casino</NavLink>
          {user?.role === 'admin' && (
            <Link to="/admin" className="px-3 py-1.5 rounded-lg text-sm text-warning hover:bg-bg-hover transition whitespace-nowrap">⚙️ Admin</Link>
          )}
        </div>

        {/* User dropdown */}
        <div className="relative shrink-0" ref={ref}>
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-2 bg-bg-card border border-white/10 rounded-full px-3 py-1.5 hover:border-primary/30 transition"
          >
            <span className="text-sm text-text-2">👤 Profil</span>
            <span className="text-text-3 text-xs">{open ? '▲' : '▼'}</span>
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-bg-card border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
              {/* Bakiye & Hızlı İşlem */}
              <div className="px-4 pt-3 pb-2 border-b border-white/10">
                <p className="text-xs text-text-3">{user?.username}</p>
                <p className="text-lg font-bold text-primary">₺{user?.balance?.toFixed(2) || '0.00'}</p>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => nav('/profile?tab=bank_deposit')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-primary/20 text-primary text-sm font-semibold rounded-lg hover:bg-primary/30 transition"
                  >
                    🏦 Yatır
                  </button>
                  <button onClick={() => nav('/profile?tab=crypto_deposit')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-amber-500/20 text-amber-400 text-sm font-semibold rounded-lg hover:bg-amber-500/30 transition"
                  >
                    🪙 Kripto
                  </button>
                </div>
              </div>

              {/* Menü linkleri */}
              <div className="py-1">
                {[
                  { to: '/profile',    icon: '👤', label: 'Profil' },
                  { to: '/my-bets',    icon: '📋', label: 'Bahislerim' },
                  { to: '/promotions', icon: '🎁', label: 'Kampanyalar' },
                  { to: '/settings',   icon: '⚙️', label: 'Ayarlar' },
                ].map(item => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 text-sm text-text-2 hover:bg-bg-hover hover:text-text-1 transition"
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>

              {/* Çıkış */}
              <div className="border-t border-white/10 py-1">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 w-full px-4 py-2 text-sm text-danger hover:bg-danger/10 transition"
                >
                  <span>🚪</span>
                  <span>Çıkış Yap</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
