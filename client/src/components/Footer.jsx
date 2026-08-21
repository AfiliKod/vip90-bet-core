import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n';

function Footer({ onOpenHelp }) {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  const LINKS = [
    {
      heading: t('footer.brand'),
      items: [
        { label: t('footer.about'), href: '#' },
        { label: t('footer.career'), href: '#' },
        { label: t('footer.press'), href: '#' },
        { label: t('footer.contact'), href: '#' },
      ],
    },
    {
      heading: t('nav.sports'),
      items: [
        { label: t('nav.liveBetting'), to: '/bahis' },
        { label: t('nav.upcomingMatches'), to: '/bahis' },
        { label: t('nav.casino'), to: '/casino' },
        { label: t('nav.promotions'), to: '/promotions' },
      ],
    },
    {
      heading: t('footer.support'),
      items: [
        { label: t('footer.helpCenter'), to: '/status' },
        { label: t('footer.depositWithdraw'), to: '/profile' },
        { label: t('footer.liveHelp'), action: 'livehelp' },
        { label: t('footer.responsibleGaming'), to: '/legal/responsible-gaming' },
      ],
    },
    {
      heading: t('footer.legal'),
      items: [
        { label: t('footer.terms'), to: '/legal/terms' },
        { label: t('footer.privacy'), to: '/legal/privacy' },
        { label: t('footer.kvkk'), to: '/legal/kvkk' },
        { label: t('footer.cookies'), to: '/legal/cookies' },
        { label: t('footer.bonusTerms'), to: '/legal/bonus-terms' },
        { label: t('footer.status'), to: '/status' },
      ],
    },
  ];

  return (
    <footer className="border-t border-white/8 bg-bg-base mt-12">
      {/* Ana grid */}
      <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
        {LINKS.map(col => (
          <div key={col.heading}>
            <p className="text-[11px] font-bold uppercase tracking-widest text-text-3 mb-4">{col.heading}</p>
            <ul className="space-y-2.5">
              {col.items.map(item => (
                <li key={item.label}>
                  {item.to ? (
                    <Link to={item.to} className="text-sm text-text-3 hover:text-text-1 transition">
                      {item.label}
                    </Link>
                  ) : item.action === 'livehelp' ? (
                    <button
                      onClick={onOpenHelp}
                      className="text-sm text-primary hover:text-primary/80 transition"
                    >
                      {item.label} ↗
                    </button>
                  ) : (
                    <a href={item.href} className="text-sm text-text-3 hover:text-text-1 transition">
                      {item.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Alt çizgi */}
      <div className="border-t border-white/8">
        <div className="max-w-6xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Sol — marka + uyarı */}
          <div className="flex items-center gap-3">
            <span className="text-xl select-none">💎</span>
            <div>
              <p className="text-sm font-bold text-text-1">VIP90.bet</p>
              <p className="text-[11px] text-text-3">{t('footer.copyright', { year })}</p>
            </div>
          </div>

          {/* Orta — rozet */}
          <div className="flex items-center gap-2">
            <span className="border border-white/15 text-text-3 text-[11px] font-bold px-2 py-1 rounded-md">18+</span>
            <span className="border border-white/15 text-text-3 text-[11px] px-2 py-1 rounded-md">{t('footer.responsibleGaming')}</span>
            <span className="border border-white/15 text-text-3 text-[11px] px-2 py-1 rounded-md">🔒 SSL</span>
          </div>

          {/* Sağ — sosyal */}
          <div className="flex items-center gap-3 text-text-3 text-lg">
            {['𝕏', '📘', '📸', '📺'].map((icon, i) => (
              <a key={i} href="#" className="hover:text-text-1 transition select-none">{icon}</a>
            ))}
          </div>
        </div>

        {/* Yasal uyarı */}
        <div className="max-w-6xl mx-auto px-6 pb-6">
          <p className="text-[10px] text-text-3/60 leading-relaxed text-center">
            {t('footer.legalWarning')}
            {' '}<a href="https://www.gamblingtherapy.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-text-3">
              gamblingtherapy.org
            </a>{' '}
            {t('footer.legalWarningUrl')}
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
