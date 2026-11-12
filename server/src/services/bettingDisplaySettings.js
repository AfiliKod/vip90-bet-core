/**
 * Bahis sayfasının "öncelikli spor / öncelikli ülke" ayarı — hangi sporun ve
 * hangi ülkenin liglerinin ilk gösterileceğini admin panelden yapılandırır
 * (bkz. utils/summaryTree.js). `Setting` koleksiyonu deseni, oddsProviderSettings.js
 * ile AYNI (key/value, kısa TTL cache).
 *
 * priorityCountry serbest metin — Event.country ISO kodu değil, kaynağın
 * döndürdüğü ham metin (İNGİLİZCE olmalı, örn. 'Turkey', 'Iceland' — bkz.
 * odds-provider/src/domain.js getPlayerUrl). Admin panelde bunu yazım
 * hatasına açık bir text input yerine `/events/countries?sport=`'dan
 * dinamik doldurulan bir dropdown olarak sun (bkz. routes/events.js).
 */
import { mongoLoad } from '../config/secretSettingsStore.js';
import { saveScopedSetting } from './settings.js';

const SPORT_KEY = 'bet.prioritySport';
const COUNTRY_KEY = 'bet.priorityCountry';

export const DEFAULT_PRIORITY_SPORT = 'football';
export const DEFAULT_PRIORITY_COUNTRY = 'Turkey';

export async function getBettingDisplaySettings() {
  const byKey = await mongoLoad([SPORT_KEY, COUNTRY_KEY]);
  return {
    prioritySport: byKey[SPORT_KEY] || DEFAULT_PRIORITY_SPORT,
    priorityCountry: byKey[COUNTRY_KEY] || DEFAULT_PRIORITY_COUNTRY,
  };
}

export async function updateBettingDisplaySettings({ prioritySport, priorityCountry }, updatedBy) {
  if (prioritySport !== undefined) await saveScopedSetting(SPORT_KEY, prioritySport, updatedBy);
  if (priorityCountry !== undefined) await saveScopedSetting(COUNTRY_KEY, priorityCountry, updatedBy);
  return getBettingDisplaySettings();
}
