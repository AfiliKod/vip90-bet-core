/**
 * Kampanya banner'ları (A4) — HomePage.jsx'in hero slider'ına eklenir.
 * id, gradient, accent, icon buradan gelir; image + title/desc/cta ise
 * BURADAKİ değerler yalnızca VARSAYILAN — admin panelinden (pages/admin/
 * Pages.jsx, "Slider Düzenleme Aracı") görsel dahil hepsi override
 * edilebilir — bkz. resolveBanners() (pageContent.js).
 *
 * id listesi server/src/pages/registry.js'teki HOME_BANNER_IDS ile senkron
 * tutulmalı. title/desc/cta i18n'e bağlı olduğundan (U2), sabit veri değil
 * `t` enjekte edilen bir fonksiyon — HomePage.jsx render sırasında çağırır.
 * Tutar geçen açıklamalar (U4) formatMoney() ile aktif para birimine göre
 * biçimlendirilir, sözlükte sabit sembol tutulmaz.
 */
import { formatMoney } from '../../utils/money.js';

/**
 * Hero slider'ın gezinme slaytları (welcome/sports/live/casino) — önceden
 * PromoHeroSlider.jsx içinde ayrı, admin panelinden hiç düzenlenemeyen sabit
 * bir dizi (HERO_SLIDES) olarak yaşıyordu. Artık getPromoSlides() ile AYNI
 * şekle sahipler (id/title/desc/cta/path/image) ve aynı resolveBanners()
 * override mekanizmasından geçiyorlar — Slider Düzenleme Aracı (admin/
 * Pages.jsx) her ikisini de tek listede gösterip görsel dahil düzenleyebilir.
 */
export function getHeroNavSlides(t) {
  return [
    { id: 'welcome', title: t('home.hero.welcome'), path: '/bahis', cta: t('home.hero.getStarted'), desc: t('home.hero.welcomeDesc'), image: '/images/welcome-banner.png' },
    { id: 'sports', title: t('home.hero.sports'), path: '/bahis', cta: t('home.hero.betNow'), desc: t('home.hero.sportsDesc'), image: '/images/hero-sports.png' },
    { id: 'live', title: t('home.hero.live'), path: '/canli', cta: t('home.hero.watchLive'), desc: t('home.hero.liveDesc'), image: '/images/hero-live.png' },
    { id: 'casino', title: t('home.hero.casino'), path: '/casino', cta: t('home.hero.exploreGames'), desc: t('home.hero.casinoDesc'), image: '/images/hero-casino.png' },
  ];
}

export function getPromoSlides(t) {
  return [
    {
      id: 'deneme-bonusu', icon: '🎁', title: t('home.promo.trialBonus'), path: '/promotions', cta: t('home.promo.trialBonusCta'),
      desc: t('home.promo.trialBonusDesc', { amount: formatMoney(500) }),
      image: '/images/promo-deneme-bonusu.png',
      gradient: 'from-amber-900/80 to-yellow-900/60',
      accent: '#fbbf24',
    },
    {
      id: 'hosgeldin-bonusu', icon: '💰', title: t('home.promo.welcomeBonus'), path: '/promotions', cta: t('home.promo.welcomeBonusCta'),
      desc: t('home.promo.welcomeBonusDesc', { amount: formatMoney(1000) }),
      image: '/images/promo-hosgeldin-bonusu.png',
      gradient: 'from-emerald-900/80 to-green-900/60',
      accent: '#34d399',
    },
    {
      id: 'arkadasini-getir', icon: '🤝', title: t('home.promo.referFriend'), path: '/promotions', cta: t('home.promo.referFriendCta'),
      desc: t('home.promo.referFriendDesc'),
      image: '/images/promo-arkadasini-getir.png',
      gradient: 'from-pink-900/80 to-fuchsia-900/60',
      accent: '#f472b6',
    },
  ];
}
