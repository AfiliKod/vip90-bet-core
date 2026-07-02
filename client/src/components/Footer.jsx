import { Link } from 'react-router-dom';

const LINKS = [
  {
    heading: 'VIP90.bet',
    items: [
      { label: 'Hakkımızda', href: '#' },
      { label: 'Kariyer', href: '#' },
      { label: 'Basın', href: '#' },
      { label: 'İletişim', href: '#' },
    ],
  },
  {
    heading: 'Bahis',
    items: [
      { label: 'Canlı Bahis', to: '/bahis' },
      { label: 'Yaklaşan Maçlar', to: '/bahis' },
      { label: 'Casino', to: '/casino' },
      { label: 'Kampanyalar', to: '/promotions' },
    ],
  },
  {
    heading: 'Destek',
    items: [
      { label: 'Yardım Merkezi', to: '/status' },
      { label: 'Para Yatır / Çek', to: '/profile' },
      { label: 'Canlı Yardım', action: 'livehelp' },
      { label: 'Sorumlu Oyun', to: '/legal/responsible-gaming' },
    ],
  },
  {
    heading: 'Yasal',
    items: [
      { label: 'Kullanım Koşulları', to: '/legal/terms' },
      { label: 'Gizlilik Politikası', to: '/legal/privacy' },
      { label: 'KVKK Aydınlatma', to: '/legal/kvkk' },
      { label: 'Çerez Politikası', to: '/legal/cookies' },
      { label: 'Bonus Koşulları', to: '/legal/bonus-terms' },
      { label: 'Sistem Durumu', to: '/status' },
    ],
  },
];

export default function Footer({ onOpenHelp }) {
  const year = new Date().getFullYear();

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
              <p className="text-[11px] text-text-3">© {year} VIP90.bet. Tüm hakları saklıdır.</p>
            </div>
          </div>

          {/* Orta — rozet */}
          <div className="flex items-center gap-2">
            <span className="border border-white/15 text-text-3 text-[11px] font-bold px-2 py-1 rounded-md">18+</span>
            <span className="border border-white/15 text-text-3 text-[11px] px-2 py-1 rounded-md">Sorumlu Oyun</span>
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
            VIP90.bet lisanslı ve denetlenen bir bahis platformudur. 18 yaş altındaki kişilerin siteye erişimi yasaktır.
            Kumar bağımlılığı ciddi finansal ve psikolojik sorunlara yol açabilir. Yardım için{' '}
            <a href="https://www.gamblingtherapy.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-text-3">
              gamblingtherapy.org
            </a>{' '}
            adresini ziyaret edebilirsiniz.
          </p>
        </div>
      </div>
    </footer>
  );
}
