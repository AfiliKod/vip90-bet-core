/**
 * i18n sözlük kayıt noktası (U1).
 *
 * Yeni bir dil eklemek: dictionaries/ altına dosya + burada import/kayıt.
 * DEFAULT_LOCALE aynı zamanda fallbackLocale'dir — tr'de olmayan bir
 * anahtar hiçbir dilde bulunamaz demektir, çünkü tr eksiksiz tutulur.
 */
import tr from './dictionaries/tr.js';
import en from './dictionaries/en.js';
import ko from './dictionaries/ko.js';
import th from './dictionaries/th.js';
import es from './dictionaries/es.js';
import ja from './dictionaries/ja.js';
import pt from './dictionaries/pt.js';
import de from './dictionaries/de.js';

export const dictionaries = { tr, en, ko, th, es, ja, pt, de };
export const DEFAULT_LOCALE = 'tr';
export { createI18nCore, assertValidKey } from './core.js';
export { I18nProvider, useTranslation } from './I18nProvider.jsx';
