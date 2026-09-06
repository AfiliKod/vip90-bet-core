import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { useBrandingStore } from '../store/brandingStore';
import api from '../services/api';

// API'ye ulaşılamazsa (network hatası) footer'ın tamamen boş kalmaması için
// sabit bir yedek — yalnızca hep var olan sayfaları içerir, marka sütunu boş kalır.
// Etiketler i18n anahtarı olarak tutulur (render sırasında t() ile çözülür),
// aşağıdaki LEGAL_PAGE_TITLE_KEYS ile AYNI kaynak — böylece API çökse de
// dil değişince Türkçe'de takılı kalmaz.
const FALLBACK_LEGAL_ITEMS = [
  { labelKey: 'legal.terms.title', to: '/legal/terms' },
  { labelKey: 'legal.terms.subtitle', to: '/legal/user-agreement' },
  { labelKey: 'legal.privacy.title', to: '/legal/privacy' },
  { labelKey: 'legal.kvkk.title', to: '/legal/kvkk' },
  { labelKey: 'legal.cookies.title', to: '/legal/cookies' },
  { labelKey: 'legal.bonus.title', to: '/legal/bonus-terms' },
];

// Bu 7 sabit yasal sayfanın BAŞLIĞI StaticPage.title'dan (DB, tek dilli,
// admin panelinden Türkçe girilir) DEĞİL, LegalLayout.jsx'in zaten kullandığı
// i18n anahtarlarından gelsin — aksi halde dil değiştirilince footer'daki
// isim Türkçe'de kalır (asıl sayfa içeriği/intro'su hâlâ DB'den Türkçe gelir,
// bu turun kapsamı yalnızca sayfa İSİMLERİ). `route`'a göre eşlenir çünkü
// responsible-gaming footerColumn:'support' altında görünüyor, 'legal' değil.
const LEGAL_PAGE_TITLE_KEYS = {
  '/legal/terms': 'legal.terms.title',
  '/legal/user-agreement': 'legal.terms.subtitle',
  '/legal/privacy': 'legal.privacy.title',
  '/legal/kvkk': 'legal.kvkk.title',
  '/legal/cookies': 'legal.cookies.title',
  '/legal/bonus-terms': 'legal.bonus.title',
  '/legal/responsible-gaming': 'legal.responsible.title',
};

function Footer({ onOpenHelp }) {
  const { t } = useTranslation();
  const year = new Date().getFullYear();
  const siteName = useBrandingStore(s => s.siteName) || 'VIP90.bet';

  const [staticPages, setStaticPages] = useState(null); // null = henüz yüklenmedi
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get('/static-pages')
      .then(({ data }) => { if (!cancelled) setStaticPages(data.pages || []); })
      .catch(() => { if (!cancelled) setLoadFailed(true); });
    return () => { cancelled = true; };
  }, []);

  // Bilinen 7 sabit yasal sayfa için i18n başlığını kullan, diğer (admin'in
  // kendi oluşturduğu serbest) statik sayfalar için DB'deki title'a düş.
  const pageLabel = (p) => {
    const key = LEGAL_PAGE_TITLE_KEYS[p.route];
    return key ? t(key) : p.title;
  };

  const brandPages = (staticPages || []).filter(p => p.footerColumn === 'brand');
  const supportPages = (staticPages || []).filter(p => p.footerColumn === 'support');
  const legalPages = (staticPages || []).filter(p => p.footerColumn === 'legal');

  const LINKS = [
    {
      heading: t('footer.brand'),
      items: brandPages.map(p => ({ label: pageLabel(p), to: p.route })),
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
        { label: t('footer.helpCenter'), to: '/help' },
        { label: t('footer.depositWithdraw'), to: '/profile' },
        { label: t('footer.liveHelp'), action: 'livehelp' },
        ...supportPages.map(p => ({ label: pageLabel(p), to: p.route })),
      ],
    },
    {
      heading: t('footer.legal'),
      items: loadFailed
        ? FALLBACK_LEGAL_ITEMS.map(item => ({ label: t(item.labelKey), to: item.to }))
        : legalPages.map(p => ({ label: pageLabel(p), to: p.route })),
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
              <p className="text-sm font-bold text-text-1">{siteName}</p>
              <p className="text-[11px] text-text-3">{t('footer.copyright', { year, siteName })}</p>
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
