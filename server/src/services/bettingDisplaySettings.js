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
import mongoose from 'mongoose';
import Setting from '../models/Setting.js';

const SPORT_KEY = 'bet.prioritySport';
const COUNTRY_KEY = 'bet.priorityCountry';

export const DEFAULT_PRIORITY_SPORT = 'football';
export const DEFAULT_PRIORITY_COUNTRY = 'Turkey';

function dbReady() {
  return mongoose.connection.readyState === 1;
}

export async function getBettingDisplaySettings() {
  if (!dbReady()) {
    return { prioritySport: DEFAULT_PRIORITY_SPORT, priorityCountry: DEFAULT_PRIORITY_COUNTRY };
  }
  const rows = await Setting.find({ key: { $in: [SPORT_KEY, COUNTRY_KEY] } }).lean();
  const byKey = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    prioritySport: byKey[SPORT_KEY] || DEFAULT_PRIORITY_SPORT,
    priorityCountry: byKey[COUNTRY_KEY] || DEFAULT_PRIORITY_COUNTRY,
  };
}

export async function updateBettingDisplaySettings({ prioritySport, priorityCountry }, updatedBy) {
  const ops = [];
  if (prioritySport !== undefined) {
    ops.push(Setting.updateOne({ key: SPORT_KEY }, { $set: { value: prioritySport, updatedBy } }, { upsert: true }));
  }
  if (priorityCountry !== undefined) {
    ops.push(Setting.updateOne({ key: COUNTRY_KEY }, { $set: { value: priorityCountry, updatedBy } }, { upsert: true }));
  }
  await Promise.all(ops);
  return getBettingDisplaySettings();
}
