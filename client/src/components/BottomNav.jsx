import { NavLink, useLocation } from 'react-router-dom';
import { useBetNotificationStore } from '../store/betNotificationStore';

const TABS = [
  { to: '/',        icon: '⚽', label: 'Bahis',      end: true  },
  { to: '/canli',   icon: '🔴', label: 'Canlı',      end: false },
  { to: '/casino',  icon: '🎰', label: 'Casino',     end: false },
  { to: '/my-bets', icon: '📋', label: 'Bahislerim', end: false },
];

export default function BottomNav() {
  const { unread, reset } = useBetNotificationStore();
  const location = useLocation();
  if (location.pathname.startsWith('/games/') || /^\/casino\/[^/]+/.test(location.pathname)) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-bg-base border-t border-white/10 flex lg:hidden">
      {TABS.map(tab => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          onClick={tab.to === '/my-bets' ? reset : undefined}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] transition ${
              isActive ? 'text-primary' : 'text-text-3'
            }`
          }
        >
          <span className="relative text-xl leading-none">
            {tab.icon}
            {tab.to === '/my-bets' && unread > 0 && (
              <span className="absolute -top-1 -right-2 min-w-[14px] h-3.5 px-0.5 bg-danger text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
