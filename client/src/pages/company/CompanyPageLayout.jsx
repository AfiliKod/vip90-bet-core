import { Link } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import { COMPANY } from '../../data/legalContent';
import { SURFACE_CARD_BG, SURFACE_BORDER } from '../../styles/surface';

/** LegalLayout'un sadeleştirilmiş hali — kurumsal sayfalar (Hakkımızda/Kariyer/Basın/İletişim) için, yasal sidebar/18+ rozeti yok. */
export default function CompanyPageLayout({ title, intro, sections }) {
  const { t } = useTranslation();

  return (
    <div className="px-4 py-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link to="/" className="text-[10px] uppercase tracking-widest font-bold text-primary">
          ← {t('common.back')}
        </Link>
        <h1 className="text-2xl font-black mt-2 text-text-1">{title}</h1>
        {intro && <p className="text-sm mt-2 max-w-2xl text-text-3">{intro}</p>}
      </div>

      <div className="rounded-2xl p-6 sm:p-8" style={{ background: SURFACE_CARD_BG, border: `1px solid ${SURFACE_BORDER}` }}>
        {sections.map((section, idx) => (
          <section key={idx} className="mb-6 last:mb-0">
            <h2 className="text-base font-bold mb-3 text-text-1">{section.title}</h2>
            <div className="space-y-2">
              {section.content.map((p, i) => (
                <p key={i} className="text-sm leading-relaxed text-text-2">{p}</p>
              ))}
            </div>
          </section>
        ))}

        <div className="mt-8 pt-6 border-t border-white/[0.06] text-[11px] text-text-3">
          <p>
            📧 <a href={`mailto:${COMPANY.email}`} className="underline text-primary">{COMPANY.email}</a>
          </p>
        </div>
      </div>
    </div>
  );
}
