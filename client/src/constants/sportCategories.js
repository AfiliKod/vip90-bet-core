// client/src/constants/sportCategories.js
//
// Spor kategorisi anahtarlarının tek kaynağı (Faz 8 DRY).
// Etiket/ikon için sportMeta.js'teki SPORT_META / sportLabel / sportIconMaterial
// kullanılmaya devam eder — burada yalnızca sabit anahtar listesi paylaşılır
// (Events admin filtresi, özet fallback vb.).
import { SPORT_META, sportLabel } from '../utils/sportMeta.js';

/** SPORT_META'daki tüm spor anahtarları (football, basketball, ...). */
export const SPORT_CATEGORIES = Object.keys(SPORT_META);

/**
 * <select> için {value, label} seçenekleri (all opsiyonel).
 * @param {string} locale 'tr'|'en' — sportLabel için
 * @param {string|undefined} allLabel "Tümü" metni verilirse first satır eklenir
 */
export function sportCategoryOptions(locale = 'tr', allLabel) {
  const options = SPORT_CATEGORIES.map(key => ({
    value: key,
    label: sportLabel(key, locale),
  }));
  if (allLabel) options.unshift({ value: 'all', label: allLabel });
  return options;
}
