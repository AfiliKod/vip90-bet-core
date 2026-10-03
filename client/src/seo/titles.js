// Rota → sayfa adı (i18n anahtarı) ve başlık şablonu. Saf modül (node --test).
//
// Sayfa adları yeni anahtar gerektirmez: nav.* / footer.* / legal.* anahtarları
// zaten 8 dilde var. Ana sayfa sayfa adı taşımaz → başlık yalnız site adıdır.

export const DEFAULT_TITLE_TEMPLATE = '{page} | {site}';
export const DEFAULT_SITE_TITLE = 'VIP90.bet';

const EXACT = {
  '/': null,
  '/bahis': 'nav.sports',
  '/canli': 'nav.live',
  '/casino': 'nav.casino',
  '/promotions': 'nav.promotions',
  '/my-bets': 'nav.myBets',
  '/profile': 'nav.profile',
  '/settings': 'nav.settings',
  '/help': 'nav.help',
  '/login': 'auth.login',
  '/kyc': 'kyc.title',
  '/about': 'footer.about',
  '/career': 'footer.career',
  '/press': 'footer.press',
  '/contact': 'footer.contact',
  '/legal/terms': 'legal.terms.title',
  '/legal/user-agreement': 'legal.terms.subtitle',
  '/legal/privacy': 'legal.privacy.title',
  '/legal/kvkk': 'legal.kvkk.title',
  '/legal/cookies': 'legal.cookies.title',
  '/legal/bonus-terms': 'legal.bonus.title',
  '/legal/responsible-gaming': 'legal.responsible.title',
  '/responsible-gaming': 'legal.responsible.title',
};

const PREFIX = [
  ['/admin', 'nav.admin'],
  ['/events/', 'nav.sports'],
  ['/games/', 'nav.casino'],
  ['/igames/', 'nav.casino'],
];

/** Yol için i18n anahtarı; sayfa adı yoksa (ana sayfa, bilinmeyen) null. */
export function pageTitleKey(pathname) {
  let p = String(pathname || '/').split(/[?#]/)[0];
  if (p.length > 1) p = p.replace(/\/+$/, '');
  if (Object.hasOwn(EXACT, p)) return EXACT[p];
  for (const [prefix, key] of PREFIX) {
    if (p === prefix.replace(/\/$/, '') || p.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`)) return key;
  }
  return null;
}

/**
 * Şablonu uygular. Sayfa adı yoksa yalnız site adı. Şablon `{site}` içermiyorsa
 * da çalışır (yer tutucular düz metin değiştirilir).
 */
export function formatTitle(template, page, site) {
  const s = site || DEFAULT_SITE_TITLE;
  if (!page) return s;
  const tpl = template && template.trim() ? template : DEFAULT_TITLE_TEMPLATE;
  return tpl.split('{page}').join(page).split('{site}').join(s);
}
