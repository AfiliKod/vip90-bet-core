import { Link, useLocation } from 'react-router-dom';
import { COMPANY, LEGAL_VERSION } from '../../data/legalContent';

const SECTIONS = [
  { to: '/legal/terms', label: 'Kullanım Koşulları', key: 'terms' },
  { to: '/legal/privacy', label: 'Gizlilik Politikası', key: 'privacy' },
  { to: '/legal/kvkk', label: 'KVKK Aydınlatma Metni', key: 'kvkk' },
  { to: '/legal/cookies', label: 'Çerez Politikası', key: 'cookies' },
  { to: '/legal/bonus-terms', label: 'Bonus Kullanım Koşulları', key: 'bonus' },
  { to: '/legal/responsible-gaming', label: 'Sorumlu Oyun', key: 'responsible' },
];

export default function LegalLayout({ title, intro, sections, children }) {
  const location = useLocation();
  const updatedAt = new Date().toLocaleDateString('tr-TR');

  return (
    <div className="min-h-screen" style={{ background: '#05080f' }}>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link to="/" className="text-[10px] uppercase tracking-widest font-bold" style={{ color: '#00d4ff' }}>
            ← Ana sayfa
          </Link>
          <h1 className="text-2xl font-black mt-2" style={{
            background: 'linear-gradient(90deg, #00d4ff, #7c3aed)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            {title}
          </h1>
          <p className="text-sm mt-2 max-w-3xl" style={{ color: '#8899bb' }}>{intro}</p>
          <div className="flex items-center gap-3 text-[10px] mt-3" style={{ color: '#4a5a78' }}>
            <span>Versiyon: {LEGAL_VERSION}</span>
            <span>·</span>
            <span>Son güncelleme: {updatedAt}</span>
            <span>·</span>
            <span>{COMPANY.legalName}</span>
          </div>
        </div>

        <div className="grid lg:grid-cols-[220px_1fr] gap-6">
          {/* Sidebar TOC */}
          <aside className="hidden lg:block">
            <div className="sticky top-4">
              <div className="text-[10px] uppercase tracking-widest font-bold mb-3" style={{ color: '#8899bb' }}>
                Yasal Belgeler
              </div>
              <nav className="space-y-1">
                {SECTIONS.map(s => {
                  const active = location.pathname === s.to;
                  return (
                    <Link
                      key={s.to}
                      to={s.to}
                      className="block px-3 py-2 rounded-lg text-xs transition-all"
                      style={{
                        background: active ? 'rgba(0,212,255,0.12)' : 'transparent',
                        color: active ? '#00d4ff' : '#c8d8f0',
                        borderLeft: active ? '2px solid #00d4ff' : '2px solid transparent',
                      }}
                    >
                      {s.label}
                    </Link>
                  );
                })}
              </nav>

              {/* 18+ badge */}
              <div className="mt-6 p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}>
                <div className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#ef4444' }}>
                  ⚠️ 18+ Yaş Sınırı
                </div>
                <p className="text-[10px] mt-1.5" style={{ color: '#8899bb' }}>
                  Kumar bağımlılığı ciddi bir sağlık sorunudur. Yardım için:{' '}
                  <a href="https://www.gamblingtherapy.org" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: '#00d4ff' }}>
                    gamblingtherapy.org
                  </a>
                </p>
              </div>
            </div>
          </aside>

          {/* Content */}
          <main>
            <div
              className="rounded-2xl p-6 sm:p-8"
              style={{
                background: 'rgba(12, 18, 32, 0.6)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {sections.map((section, idx) => (
                <section key={idx} id={idx + 1} className="mb-6 last:mb-0">
                  <h2 className="text-base font-bold mb-3" style={{ color: '#f0f4ff' }}>
                    {section.title}
                  </h2>
                  <div className="space-y-2">
                    {section.content.map((p, i) => (
                      <p key={i} className="text-sm leading-relaxed" style={{ color: '#c8d8f0' }}>
                        {p}
                      </p>
                    ))}
                  </div>
                </section>
              ))}

              {children}

              {/* Footer info */}
              <div className="mt-8 pt-6 border-t border-white/[0.06] text-[11px]" style={{ color: '#8899bb' }}>
                <p className="mb-1">
                  <strong style={{ color: '#f0f4ff' }}>{COMPANY.legalName}</strong> · {COMPANY.address}
                </p>
                <p className="mb-1">📜 {COMPANY.license}</p>
                <p>
                  📧 <a href={`mailto:${COMPANY.email}`} className="underline" style={{ color: '#00d4ff' }}>{COMPANY.email}</a>
                  {COMPANY.responsibleEmail && (
                    <>
                      {' · '}
                      <a href={`mailto:${COMPANY.responsibleEmail}`} className="underline" style={{ color: '#00d4ff' }}>{COMPANY.responsibleEmail}</a>
                    </>
                  )}
                </p>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}