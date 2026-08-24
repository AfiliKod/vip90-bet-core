import { Link } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import { COMPANY } from '../../data/legalContent';

/** LegalLayout'un sadeleştirilmiş hali — kurumsal sayfalar (Hakkımızda/Kariyer/Basın/İletişim) için, yasal sidebar/18+ rozeti yok. */
export default function CompanyPageLayout({ title, intro, sections }) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen" style={{ background: '#05080f' }}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link to="/" className="text-[10px] uppercase tracking-widest font-bold" style={{ color: '#00d4ff' }}>
            ← {t('common.back')}
          </Link>
          <h1 className="text-2xl font-black mt-2" style={{
            background: 'linear-gradient(90deg, #00d4ff, #7c3aed)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            {title}
          </h1>
          {intro && <p className="text-sm mt-2 max-w-2xl" style={{ color: '#8899bb' }}>{intro}</p>}
        </div>

        <div
          className="rounded-2xl p-6 sm:p-8"
          style={{ background: 'rgba(12, 18, 32, 0.6)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {sections.map((section, idx) => (
            <section key={idx} className="mb-6 last:mb-0">
              <h2 className="text-base font-bold mb-3" style={{ color: '#f0f4ff' }}>{section.title}</h2>
              <div className="space-y-2">
                {section.content.map((p, i) => (
                  <p key={i} className="text-sm leading-relaxed" style={{ color: '#c8d8f0' }}>{p}</p>
                ))}
              </div>
            </section>
          ))}

          <div className="mt-8 pt-6 border-t border-white/[0.06] text-[11px]" style={{ color: '#8899bb' }}>
            <p>
              📧 <a href={`mailto:${COMPANY.email}`} className="underline" style={{ color: '#00d4ff' }}>{COMPANY.email}</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
