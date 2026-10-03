import { useState } from 'react';
import { useTranslation } from '../../i18n';

/**
 * Admin kayıt-listeleri için ortak sunum katmanı.
 * Users.jsx tablosu referans alınır (min-w + 13px + bg-black/20 thead);
 * iş mantığı/veri çekme sayfada kalır, burada yalnızca markup paylaşılır.
 */
/**
 * columns: [{ key, label, align?: 'right', className? }]
 *   key === 'actions' sütunu otomatik dar (w-px) ve sağa hizalı olur.
 * loading / empty / emptyLabel verilirse yükleniyor ve boş durum ortak satırla çizilir;
 * verilmezse çağıran sayfa children içinde kendi durumunu verir (eski API).
 */
export function AdminTable({ columns, children, loading, empty, emptyLabel, minWidth = 720 }) {
  const { t } = useTranslation();
  const state = loading
    ? <AdminTableEmpty colSpan={columns.length}>{t('common.loading')}</AdminTableEmpty>
    : empty
      ? <AdminTableEmpty colSpan={columns.length}>{emptyLabel}</AdminTableEmpty>
      : null;
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-bg-card">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]" style={{ minWidth }}>
          <thead>
            <tr className="text-left text-xs font-bold text-text-3">
              {columns.map((col, i) => (
                <th
                  key={col.key ?? i}
                  className={`border-b border-white/10 bg-black/20 px-4 py-3 whitespace-nowrap ${
                    col.align === 'right' || col.key === 'actions' ? 'text-right' : ''
                  } ${col.key === 'actions' ? 'sticky right-0 z-[1] w-px bg-bg-card shadow-[inset_0_0_0_999px_rgba(0,0,0,0.2)]' : ''} ${col.className || ''}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{state ?? children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminTableRow({ children, className = '', dimmed = false, ...rest }) {
  return (
    <tr className={`group border-b border-white/5 transition last:border-0 ${dimmed ? 'opacity-50' : 'hover:bg-bg-hover'} ${className}`} {...rest}>
      {children}
    </tr>
  );
}

export function AdminTableCell({ children, align, className = '', colSpan, ...rest }) {
  return (
    <td
      colSpan={colSpan}
      {...rest}
      className={`px-4 py-3 ${align === 'right' ? 'text-right' : ''} ${className}`}
    >
      {children}
    </td>
  );
}

/** Aksiyon sütunu hücresi: dar, sağa yapışık (sticky; yatay kaydırmada hep görünür), sağa hizalı, satır tıklamasını tetiklemez. */
export function AdminTableActionsCell({ children, className = '' }) {
  return (
    <td className={`sticky right-0 z-[1] w-px whitespace-nowrap bg-bg-card px-4 py-3 text-right group-hover:bg-bg-hover ${className}`} onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-end gap-1.5">{children}</div>
    </td>
  );
}

export function AdminTableEmpty({ colSpan, children }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-text-3">
        {children}
      </td>
    </tr>
  );
}

/** Açılır detay satırı (GameSettings accordion deseni). */
export function AdminExpandRow({ colSpan, open, children }) {
  if (!open) return null;
  return (
    <tr className="border-b border-white/10 bg-bg-base/40">
      <td colSpan={colSpan} className="px-4 py-4">
        {children}
      </td>
    </tr>
  );
}

/** Tekil satır içi aç-kapa butonu (expand_less/expand_more). */
export function ExpandToggle({ open, onToggle, label, className = '' }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={label}
      className={`text-text-3 hover:text-text-1 px-1 transition shrink-0 ${className}`}
    >
      <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">{open ? 'expand_less' : 'expand_more'}</span>
    </button>
  );
}

/** Rol switch'i (aktif/pasif) — satır hücresinde kullanılır. */
export function ActiveSwitch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`relative w-12 h-6 rounded-full transition shrink-0 ${checked ? 'bg-green-500/80' : 'bg-white/10'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : ''}`} />
    </button>
  );
}

/** Users deseni sayfalayıcı: `‹ page / pages ›` + solda toplam metni.
 *  Tek sayfalı listelerde hiç render edilmez (pages > 1 guard).
 *  totalLabel: çağıran sayfa hazırlar (kendi countLine/pagerTotal metni için).
 */
export function AdminPager({ page, pages, onPage, totalLabel }) {
  if (!(pages > 1)) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-bg-card px-4 py-3 text-[13px] text-text-3">
      {totalLabel != null && <span>{totalLabel}</span>}
      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page === 1}
          className="grid h-8 min-w-8 place-items-center rounded-md border border-white/10 px-2 font-mono text-xs font-bold text-text-2 transition hover:bg-bg-hover disabled:opacity-30"
        >
          ‹
        </button>
        <span className="px-1 font-mono text-xs text-text-1">{page} / {pages}</span>
        <button
          type="button"
          onClick={() => onPage(Math.min(pages, page + 1))}
          disabled={page === pages}
          className="grid h-8 min-w-8 place-items-center rounded-md border border-white/10 px-2 font-mono text-xs font-bold text-text-2 transition hover:bg-bg-hover disabled:opacity-30"
        >
          ›
        </button>
      </div>
    </div>
  );
}

/** Users deseni Mini KPI kartı (statistik şeridi). */
export function AdminKpiCard({ label, value, sub, tone = 'text-text-1' }) {
  return (
    <article className="min-w-0 rounded-xl border border-white/10 bg-bg-card p-3.5">
      <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-3">{label}</div>
      <div className={`mt-2 font-mono text-[22px] font-bold tabular-nums tracking-tight ${tone}`}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-xs font-semibold text-text-3">{sub}</div>}
    </article>
  );
}

/** Sayfalı liste iskeleti: state'i tek yerde tutar (Events, vb.). */
export function useExpandOnce() {
  const [openId, setOpenId] = useState(null);
  const toggle = (id) => setOpenId(prev => (prev === id ? null : id));
  return { openId, toggle, isOpen: (id) => openId === id };
}
