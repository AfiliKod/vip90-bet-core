import { useState } from 'react';
import { useTranslation } from '../../i18n';

/**
 * Modüller + Modül Ayarları'nın birleşmesinden doğan ortak kart: üstte
 * her-zaman-görünür başlık/rozet/aç-kapa, altta accordion ile açılan detay
 * ayarlar.
 *
 * Sağ üst kontrol sırası: `headerSwitch` (çağıran tarafın kendi switch'i —
 * ör. Email Gateway kartının gateway anahtarı, Core rozetinin yerine) varsa
 * o; yoksa modül switch'i (`enabled`/`onToggle`). `alwaysOn` (örn. çekirdek
 * kart — hiçbir modül tarafından kapatılamaz) kartta modül switch'i
 * çizilmez ve gövdede "modül kapalı" uyarısı çıkmaz.
 *
 * "Yönet →" linki ve licence rozetleri 2026-10-06 IA kararıyla kartlardan
 * kaldırıldı (docs/admin-redesign/README.md §8).
 */
export function CardSwitch({ checked, busy = false, onToggle, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className={`relative w-12 h-6 rounded-full transition shrink-0 disabled:opacity-50 ${
        checked ? 'bg-green-500/80' : 'bg-white/10'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : ''
        }`}
      />
    </button>
  );
}

export default function ModuleCard({
  icon,
  title,
  description,
  badge,
  alwaysOn = false,
  enabled = false,
  onToggle,
  toggleBusy = false,
  headerSwitch,
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
          <span className="material-symbols-outlined !text-[24px] shrink-0" aria-hidden="true">{icon}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-text-1 truncate">{title}</h2>
              {badge}
            </div>
            {description && <p className="text-text-3 text-xs mt-0.5 line-clamp-1">{description}</p>}
          </div>
        </button>

        {headerSwitch ?? (!alwaysOn && (
          <CardSwitch
            checked={enabled}
            busy={toggleBusy}
            onToggle={onToggle}
            ariaLabel={enabled ? t('admin.moduleCards.toggleOff', { title }) : t('admin.moduleCards.toggleOn', { title })}
          />
        ))}

        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="text-text-3 hover:text-text-1 shrink-0 px-1 transition"
          aria-label={open ? t('admin.moduleCards.collapseSettings') : t('admin.moduleCards.expandSettings')}
        >
          <span className="material-symbols-outlined !text-[20px]" aria-hidden="true">{open ? 'expand_less' : 'expand_more'}</span>
        </button>
      </div>
      {open && (
        <div className="px-4 sm:px-5 pb-5 pt-1 border-t border-white/8">
          {/* Modül kapalıyken aşağıdaki ayarlar (ör. KYC Active gibi ayrı bir
              iş-kuralı switch'i) sunucu tarafında zaten etkisiz — moduleGate
              tüm rotayı bloklar. Bunu belirtmeden ayarların "açık" görünmesi
              üstteki kapalı switch'le çelişiyormuş gibi algılanabiliyor. */}
          {!alwaysOn && !enabled && (
            <p className="text-xs text-amber-300/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mt-3 mb-1">
              {t('admin.moduleCards.disabledNotice')}
            </p>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
