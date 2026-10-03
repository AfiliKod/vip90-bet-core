/**
 * SMS olay kayıt defteri — şablonların bağlanabileceği tetikleyiciler.
 *
 * Neden ayrı dosya: `variables` listesi hem sunucuda (doğrulama, gönderim
 * sırasında eksik değişken tespiti) hem istemcide (düzenleme formunda
 * "şablon bu olayda şu değişkenleri kullanır" ipucu) lazım. Tek kaynak burası.
 *
 * `key` alanları camelCase: bir tanesi doğrudan i18n anahtarı olarak da
 * kullanılır (`admin.smsTemplates.event.<key>`) ve `i18n/core.js` anahtar
 * kuralı (tire/alt çizgi yasak) gereği alt çizgi içermemelidir.
 *
 * Yeni bir olay eklemek = buraya bir satır + 8 sözlüğe `event.<key>` girdisi.
 * Domain akışı tetiklemek için: `services/smsDispatch.js` → `dispatchSmsEvent`.
 */

/** type='action' — sistem mesajları, domain kodu tetikler, panelden gönderilemez. */
export const SMS_ACTION_EVENTS = [
  { key: 'userRegistered',        variables: ['username', 'currency', 'balance'] },
  { key: 'emailVerified',         variables: ['username'] },
  { key: 'phoneVerified',         variables: ['username'] },
  { key: 'depositCompleted',      variables: ['amount', 'currency', 'balance', 'method'] },
  { key: 'withdrawalRequested',   variables: ['amount', 'currency'] },
  { key: 'withdrawalCompleted',   variables: ['amount', 'currency', 'method'] },
  { key: 'betWon',                variables: ['betId', 'amount', 'currency', 'market', 'odds'] },
  { key: 'betLost',               variables: ['betId', 'stake', 'currency', 'market'] },
  { key: 'casinoSessionProfit',   variables: ['netProfit', 'currency', 'duration', 'games'] },
  { key: 'casinoSessionLoss',     variables: ['netLoss', 'currency', 'duration', 'games'] },
  { key: 'inactiveReminder',      variables: ['days', 'username'] },
];

/** type='scheduled' — zamana duyarlı mesajlar; panelden "şimdi gönder"ilir. */
export const SMS_SCHEDULED_EVENTS = [
  { key: 'bonusStarting',         variables: ['amount', 'currency', 'expiresIn'] },
  { key: 'bonusExpiring',         variables: ['amount', 'currency', 'hoursLeft'] },
  { key: 'weeklyBonus',           variables: ['amount', 'currency'] },
  { key: 'birthdayBonus',         variables: ['amount', 'currency'] },
  { key: 'tournamentReminder',    variables: ['tournament', 'startsIn', 'prize'] },
  { key: 'campaignAnnouncement',  variables: [] },
];

const ALL_EVENTS = new Map(
  [...SMS_ACTION_EVENTS, ...SMS_SCHEDULED_EVENTS].map(e => [e.key, e]),
);

export function listEventsForType(type) {
  return type === 'action' ? SMS_ACTION_EVENTS : SMS_SCHEDULED_EVENTS;
}

/** Bir olay anahtarı verilen tipte tanımlı mı? (bilinmeyen anahtar reddedilir) */
export function isValidEvent(type, key) {
  if (!key) return false;
  const scope = type === 'action' ? SMS_ACTION_EVENTS : SMS_SCHEDULED_EVENTS;
  return scope.some(e => e.key === key);
}

/** Olayın desteklediği değişkenler — tanımsız anahtar için boş dizi. */
export function variablesForEvent(type, key) {
  if (!isValidEvent(type, key)) return [];
  const ev = ALL_EVENTS.get(key);
  return ev ? [...ev.variables] : [];
}