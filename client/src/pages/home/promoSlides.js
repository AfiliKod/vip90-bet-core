/**
 * Kampanya banner'ları (A4) — HomePage.jsx'in hero slider'ına eklenir.
 * id, image, gradient, accent, icon buradan gelir (görselin tek doğruluk
 * kaynağı); admin panelinden (pages/admin/Pages.jsx) yalnızca sıra, görünürlük
 * ve title/desc/cta metni değiştirilebilir — bkz. resolveBanners() (pageContent.js).
 *
 * id listesi server/src/pages/registry.js'teki HOME_BANNER_IDS ile senkron
 * tutulmalı.
 */
export const PROMO_SLIDES = [
  {
    id: 'deneme-bonusu', icon: '🎁', title: 'Deneme Bonusu', path: '/promotions', cta: 'Bonusu Al',
    desc: '500₺\'ye kadar deneme bonusuyla platformu risksiz keşfet, kazancını hemen değerlendir!',
    image: '/images/promo-deneme-bonusu.png',
    gradient: 'from-amber-900/80 to-yellow-900/60',
    accent: '#fbbf24',
  },
  {
    id: 'hosgeldin-bonusu', icon: '💰', title: 'Hoşgeldin Bonusu', path: '/promotions', cta: 'Hemen Yatır',
    desc: 'İlk para yatırmana %100 bonus, 1000₺\'ye kadar! Üyeliğini tamamla, bonusunu kap.',
    image: '/images/promo-hosgeldin-bonusu.png',
    gradient: 'from-emerald-900/80 to-green-900/60',
    accent: '#34d399',
  },
  {
    id: 'arkadasini-getir', icon: '🤝', title: 'Arkadaşını Getir', path: '/promotions', cta: 'Davet Et',
    desc: 'Arkadaşını getir, kazandığı her bahisten %10 kâr payı kazan. Ne kadar çok davet, o kadar çok kazanç!',
    image: '/images/promo-arkadasini-getir.png',
    gradient: 'from-pink-900/80 to-fuchsia-900/60',
    accent: '#f472b6',
  },
];
