// client/src/components/admin/AdminPageHeader.jsx
//
// Variant-C sayfa başlığı. Yükseklik içeriğe göre: eskiden lg:min-h-[132px]
// ile tabs'lı/tabs'ız sayfalar aynı hizaya zorlanıyordu, tabs'ız sayfalarda
// başlıkla içerik arasında boşluk bırakıyordu (kaldırıldı).
import { Link } from 'react-router-dom';
import { useTranslation } from '../../i18n';

export default function AdminPageHeader({ crumbs = [], title, sub, actions, backTo, embedded = false, children }) {
  const { t } = useTranslation();
  // embedded: sayfa başka bir sayfanın sekmesi olarak gömülüyor (ör. Settings);
  // breadcrumb ve <h1> üst sayfaya ait, burada yalnız alt metin + aksiyon + sekmeler.
  if (embedded) {
    return (
      <div className="mb-4 flex flex-col gap-3">
        {(sub || actions) && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {sub ? <p className="min-w-0 text-sm text-text-2">{sub}</p> : <span />}
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
          </div>
        )}
        {children}
      </div>
    );
  }
  return (
    <div className="mb-4 flex flex-col gap-4">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div className="min-w-0">
          {backTo && (
            <Link
              to={backTo}
              className="mb-1.5 inline-flex items-center gap-1 text-xs font-semibold text-text-3 transition hover:text-text-1"
            >
              <span className="material-symbols-outlined !text-[14px]" aria-hidden="true">arrow_back</span>
              {crumbs[0]?.label || title}
            </Link>
          )}
          {crumbs.length > 0 && !backTo && (
            <nav aria-label={t('common.breadcrumb')} className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-text-3">
              {crumbs.map((c, i) => (
                <span key={`${c.label}-${i}`} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <span className="material-symbols-outlined !text-[14px] opacity-55" aria-hidden="true">chevron_right</span>
                  )}
                  {c.to ? (
                    <Link to={c.to} className="transition hover:text-text-1">{c.label}</Link>
                  ) : (
                    <span>{c.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
          <h1 className="text-2xl font-extrabold tracking-tight text-text-1">{title}</h1>
          {sub && <p className="mt-1.5 max-w-2xl text-sm text-text-2">{sub}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

// Variant-C altı çizgili sekme şeridi (page-head slot'unun içine girer).
export function AdminTabs({ items, value, onChange, className = '' }) {
  return (
    <div className={`flex gap-1 overflow-x-auto border-b border-white/10 no-scrollbar ${className}`} role="tablist">
      {items.map(item => {
        const on = item.key === value;
        return (
          <button
            key={item.key}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(item.key)}
            className={`inline-flex h-[38px] shrink-0 items-center gap-2 border-b-2 px-3.5 text-[13.5px] font-bold transition -mb-px ${
              on
                ? 'border-primary text-text-1'
                : 'border-transparent text-text-3 hover:text-text-1'
            }`}
          >
            {item.label}
            {item.count != null && (
              <span className={`rounded-full px-1.5 py-px font-mono text-[10.5px] font-bold tabular-nums ${
                on ? 'bg-primary/15 text-primary' : 'bg-warning/15 text-warning'
              }`}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Ortak buton sınıfları (Variant-C).
export const ADMIN_BTN =
  'inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-white/10 bg-bg-card px-3 text-[13px] font-bold text-text-1 transition hover:bg-bg-hover';
export const ADMIN_BTN_PRIMARY =
  'inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-transparent bg-primary px-3 text-[13px] font-bold text-black transition hover:brightness-110';
export const ADMIN_BTN_GHOST =
  'inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-transparent bg-transparent px-3 text-[13px] font-bold text-text-2 transition hover:bg-bg-hover hover:text-text-1';
