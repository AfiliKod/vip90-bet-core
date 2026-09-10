import { useState } from 'react';
import { useTranslation } from '../../i18n';

/**
 * Modüller + Modül Ayarları'nın birleşmesinden doğan ortak kart: üstte
 * her-zaman-görünür başlık/rozet/aç-kapa, altta accordion ile açılan detay
 * ayarlar. `alwaysOn` (örn. In-house Provider — M1 çekirdek, hiçbir modül
 * tarafından kapatılamaz) durumunda toggle yerine sabit bir "Çekirdek" rozeti
 * gösterilir (metni `coreLabel` prop'uyla verilir — çağıran taraf zaten
 * `useTranslation()` çağırdığından burada tekrar `t()` çağırmaya gerek yok).
 */
export default function ModuleCard({
  icon,
  title,
  description,
  badge,
  alwaysOn = false,
  coreLabel,
  enabled = false,
  onToggle,
  toggleBusy = false,
  defaultOpen = false,
  children,
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-bg-card border border-white/10 rounded-xl mb-4 overflow-hidden">
      <div className="flex items-center gap-3 p-4 sm:p-5">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex-1 flex items-center gap-3 text-left min-w-0"
        >
          <span className="text-2xl shrink-0">{icon}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-text-1 truncate">{title}</h2>
              {badge}
            </div>
            {description && <p className="text-text-3 text-xs mt-0.5 line-clamp-1">{description}</p>}
          </div>
        </button>

        {alwaysOn ? (
          <span className="text-xs px-2 py-0.5 rounded-full border bg-primary/15 border-primary/30 text-primary shrink-0">
            {coreLabel ?? t('admin.moduleCards.coreBadge')}
          </span>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            disabled={toggleBusy}
            role="switch"
            aria-checked={enabled}
            aria-label={enabled ? t('admin.moduleCards.toggleOff', { title }) : t('admin.moduleCards.toggleOn', { title })}
            className={`relative w-12 h-6 rounded-full transition shrink-0 disabled:opacity-50 ${
              enabled ? 'bg-green-500/80' : 'bg-white/10'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                enabled ? 'translate-x-6' : ''
              }`}
            />
          </button>
        )}

        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="text-text-3 hover:text-text-1 shrink-0 px-1 transition"
          aria-label={open ? t('admin.moduleCards.collapseSettings') : t('admin.moduleCards.expandSettings')}
        >
          {open ? '▲' : '▼'}
        </button>
      </div>
      {open && (
        <div className="px-4 sm:px-5 pb-5 pt-1 border-t border-white/8">
          {children}
        </div>
      )}
    </div>
  );
}
