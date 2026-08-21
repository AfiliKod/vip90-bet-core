/**
 * Kampanya banner'ları (A4) — HomePage.jsx'in hero slider'ına eklenir.
 * id, image, gradient, accent, icon buradan gelir (görselin tek doğruluk
 * kaynağı); admin panelinden (pages/admin/Pages.jsx) yalnızca sıra, görünürlük
 * ve title/desc/cta metni değiştirilebilir — bkz. resolveBanners() (pageContent.js).
 *
 * id listesi server/src/pages/registry.js'teki HOME_BANNER_IDS ile senkron
 * tutulmalı. title/desc/cta i18n'e bağlı olduğundan (U2), sabit veri değil
 * `t` enjekte edilen bir fonksiyon — HomePage.jsx render sırasında çağırır.
 * Tutar geçen açıklamalar (U4) formatMoney() ile aktif para birimine göre
 * biçimlendirilir, sözlükte sabit sembol tutulmaz.
 */
import { formatMoney } from '../../utils/money.js';

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
