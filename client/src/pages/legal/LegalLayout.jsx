import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import { COMPANY, LEGAL_VERSION, getLegalName } from '../../data/legalContent';
import { SURFACE_CARD_BG, SURFACE_BORDER } from '../../styles/surface';
import { useBrandingStore } from '../../store/brandingStore';

const SECTIONS = [
  { to: '/legal/terms', label: 'legal.terms.title', key: 'terms' },
  { to: '/legal/user-agreement', label: 'legal.terms.subtitle', key: 'user-agreement' },
  { to: '/legal/privacy', label: 'legal.privacy.title', key: 'privacy' },
  { to: '/legal/kvkk', label: 'legal.kvkk.title', key: 'kvkk' },
  { to: '/legal/cookies', label: 'legal.cookies.title', key: 'cookies' },
  { to: '/legal/bonus-terms', label: 'legal.bonus.title', key: 'bonus' },
  { to: '/legal/responsible-gaming', label: 'legal.responsible.title', key: 'responsible' },
];

export default function LegalLayout({ title, intro, sections, children }) {
  const location = useLocation();
  const { t } = useTranslation();
  const updatedAt = new Date().toLocaleDateString('tr-TR');
  const siteName = useBrandingStore(s => s.siteName);
  const legalName = getLegalName(siteName);

  // Sayfa BAŞLIĞI (h1) dile göre değişsin — DB'deki `title` (StaticPage.title,
  // tek dilli, admin panelinden Türkçe girilir) yerine, SECTIONS'ın zaten
  // taşıdığı i18n anahtarını kullan. `intro`/`sections` (asıl hukuki metin)
  // BİLEREK DB'den (Türkçe) gelmeye devam ediyor — bu turun kapsamı sadece
  // sayfa isimleri, tam içerik çevirisi değil. Bilinen 7 sayfa dışında bir
  // route'a rastlarsa (SECTIONS'ta yoksa) DB title'ına düşer.
  const pageTitle = SECTIONS.find(s => s.to === location.pathname)?.label;
  const displayTitle = pageTitle ? t(pageTitle) : title;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link to="/" className="text-[10px] uppercase tracking-widest font-bold text-primary">
          ← {t('common.back')}
        </Link>
        <h1 className="text-2xl font-black mt-2 text-text-1">{displayTitle}</h1>
        <p className="text-sm mt-2 max-w-3xl text-text-3">{intro}</p>
        <div className="flex items-center gap-3 text-[10px] mt-3 text-text-3/70">
          <span>Versiyon: {LEGAL_VERSION}</span>
          <span>·</span>
          <span>Son güncelleme: {updatedAt}</span>
          <span>·</span>
          <span>{legalName}</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-[220px_1fr] gap-6">
        {/* Sidebar TOC */}
        <aside className="hidden lg:block">
          <div className="sticky top-4">
            <div className="text-[10px] uppercase tracking-widest font-bold mb-3 text-text-3">
              {t('nav.legal')}
            </div>
            <nav className="space-y-1">
              {SECTIONS.map(s => {
                const active = location.pathname === s.to;
                return (
                  <Link
                    key={s.to}
                    to={s.to}
                    className={`block px-3 py-2 rounded-lg text-xs transition-all border-l-2 ${
                      active ? 'text-primary bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] border-primary' : 'text-text-2 border-transparent'
                    }`}
                  >
                    {t(s.label)}
                  </Link>
                );
              })}
            </nav>

            {/* 18+ badge */}
            <div className="mt-6 p-3 rounded-lg bg-danger/[0.08] border border-danger/30">
              <div className="text-[10px] font-black uppercase tracking-wider text-danger">
                ⚠️ {t('common.ageRestriction')}
              </div>
              <p className="text-[10px] mt-1.5 text-text-3">
                {t('legal.responsible.warning')} {' '}
                <a href="https://www.gamblingtherapy.org" target="_blank" rel="noopener noreferrer" className="underline text-primary">
                  gamblingtherapy.org
                </a>
              </p>
            </div>
          </div>
        </aside>

        {/* Content */}
        <main>
          <div className="rounded-2xl p-6 sm:p-8" style={{ background: SURFACE_CARD_BG, border: `1px solid ${SURFACE_BORDER}` }}>
            {sections.map((section, idx) => (
              <section key={idx} id={idx + 1} className="mb-6 last:mb-0">
                <h2 className="text-base font-bold mb-3 text-text-1">
                  {section.title}
                </h2>
                <div className="space-y-2">
                  {section.content.map((p, i) => (
                    <p key={i} className="text-sm leading-relaxed text-text-2">
                      {typeof p === 'function' ? p() : p}
                    </p>
                  ))}
                </div>
              </section>
            ))}

            {children}

            {/* Footer info */}
            <div className="mt-8 pt-6 border-t border-white/[0.06] text-[11px] text-text-3">
              <p className="mb-1">
                <strong className="text-text-1">{legalName}</strong> · {COMPANY.address}
              </p>
              <p className="mb-1">📜 {COMPANY.license}</p>
              <p>
                📧 <a href={`mailto:${COMPANY.email}`} className="underline text-primary">{COMPANY.email}</a>
                {COMPANY.responsibleEmail && (
                  <>
                    {' · '}
                    <a href={`mailto:${COMPANY.responsibleEmail}`} className="underline text-primary">{COMPANY.responsibleEmail}</a>
                  </>
                )}
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}