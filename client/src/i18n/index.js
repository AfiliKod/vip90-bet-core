/**
 * i18n sözlük kayıt noktası (U1).
 *
 * Yeni bir dil eklemek: dictionaries/ altına dosya + burada import/kayıt.
 * DEFAULT_LOCALE aynı zamanda fallbackLocale'dir — tr'de olmayan bir
 * anahtar hiçbir dilde bulunamaz demektir, çünkü tr eksiksiz tutulur.
 */
import tr from './dictionaries/tr.js';
import en from './dictionaries/en.js';

export const dictionaries = { tr, en };
export const DEFAULT_LOCALE = 'tr';
export { createI18nCore, assertValidKey } from './core.js';
