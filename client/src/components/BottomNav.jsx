import { NavLink, useLocation } from 'react-router-dom';

const TABS = [
  { to: '/',       icon: '⚽', label: 'Bahis',  end: true  },
  { to: '/canli',  icon: '🔴', label: 'Canlı',  end: false },
  { to: '/casino', icon: '🎰', label: 'Casino', end: false },
];

export default function BottomNav() {
  const location = useLocation();
  if (location.pathname.startsWith('/games/') || /^\/casino\/[^/]+/.test(location.pathname)) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-bg-base border-t border-white/10 flex lg:hidden">
      {TABS.map(tab => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] transition ${
              isActive ? 'text-primary' : 'text-text-3'
            }`
          }
        >
          <span className="text-xl leading-none">{tab.icon}</span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
