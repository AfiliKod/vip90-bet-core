// client/src/components/admin/AdminSidebar.jsx
import { NavLink } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import { ADMIN_NAV_GROUPS } from './adminNav.config.js';
import { useAdminCounts } from '../../hooks/useAdminCounts.js';

export default function AdminSidebar({ onClose }) {
  const { t } = useTranslation();
  // Rozetler canlı sayılardan gelir (sidebar rozeti + dashboard kuyruk kartı
  // aynı store'u okur). Sunucu bir kayıt işlediğinde `admin:counts` yayınlar.
  const counts = useAdminCounts();

  return (
    <nav className="flex h-full min-h-0 flex-col">
      {/* Marka */}
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-white/10 px-4">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-primary to-[#2f8f14] text-black">
          <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">casino</span>
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <strong className="truncate text-[13.5px] font-extrabold tracking-tight text-text-1">{t('admin.shell.brand')}</strong>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-3">{t('admin.shell.brandSub')}</span>
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-text-3 hover:bg-bg-hover hover:text-text-1 lg:hidden"
            aria-label={t('admin.shell.menuClose')}
          >
            <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">close</span>
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
        {ADMIN_NAV_GROUPS.map(group => (
          <div key={group.id} className="mb-3.5">
            {!group.topLevel && (
              <div className="px-2.5 pt-1.5 pb-1.5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-text-3/70">
                {t(group.labelKey)}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map(item => {
                const badge = counts[item.badge];
                return (
                  <NavLink
                    key={item.id}
                    to={item.to}
                    end={item.to === '/admin'}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-semibold transition ${
                        isActive
                          ? 'bg-primary/10 text-text-1 shadow-[inset_0_0_0_1px_rgba(99,214,41,0.22)]'
                          : 'text-text-2 hover:bg-bg-hover hover:text-text-1'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className={`material-symbols-outlined !text-[17px] leading-none ${isActive ? 'text-primary' : 'text-text-3'}`} aria-hidden="true">
                          {item.icon}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
                        {badge != null && badge > 0 && (
                          <span className="rounded-full bg-warning/15 px-1.5 py-px font-mono text-[10.5px] font-bold text-warning">
                            {badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
