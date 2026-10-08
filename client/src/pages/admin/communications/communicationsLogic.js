// client/src/pages/admin/communications/communicationsLogic.js
//
// İletişim sayfasının saf mantığı — DOM/React bağımsız, ayrı testte
// (`communicationsLogic.test.js`) doğrulanır (kpiTone.js / rowActionsLogic.js
// deseni).
//
// Sayfa iki URL parametresiyle yönetilir: `?channel=&sub=` (Platform.jsx'in
// `?tab=` deseninin aynısı). Geçersiz değerler sessizce varsayılana düşer —
// eski yer imi kırılmaz, hata durumu olmaz.
import { inferEmailProvider } from '../../../components/admin/emailProviderLogic.js';

/** Üst sekmeler (kanallar) — sıra menüdeki sırada. */
export const CHANNELS = ['email', 'sms', 'campaigns', 'automations', 'segments'];
export const DEFAULT_CHANNEL = 'email';

/** Kanal başına alt sekmeler — sıra üstteki sırada.
 *  Sağlayıcı ayarları 2026-10-06'da bu sayfadan Modules kartlarına taşındı
 *  (E-posta → "Email Gateway", SMS → "SMS Gateway"); sekmeler yalnız
 *  şablon/kimlik/günlük/test işlevlerini taşır. `sub=provider|sender` gibi
 *  eski yer imleri `normalizeSub` ile sessizce şablonlara düşer. */
export const SUB_TABS = {
  email: ['templates', 'identities', 'logs', 'test'],
  sms: ['templates', 'logs', 'test'],
  campaigns: [],
  automations: [],
  segments: [],
};

/** Kanal başına ilk açılacak alt sekme. */
export const DEFAULT_SUB = { email: 'templates', sms: 'templates' };

/**
 * E-posta gönderen kimliği satırları — `GET /admin/settings/email`
 * yanıtından salt-okunur tablo satırlarına (`SenderIdentitiesPanel`).
 * Sağlayıcı adı, kayıtlı alan yoksa host'tan çıkarılır (tek kaynak:
 * `emailProviderLogic.inferEmailProvider`).
 */
export function identityRows(settings, t) {
  const byKey = Object.fromEntries((settings || []).map(s => [s.key, s]));
  const host = byKey.host?.value;
  const resolved = inferEmailProvider(host, byKey.provider?.value);
  const secure = byKey.secure?.value === 'true';
  return [
    { key: 'provider', labelKey: 'admin.emailSettings.provider', value: t(`admin.emailSettings.provider.${resolved}`) },
    { key: 'fromName', labelKey: 'admin.emailSettings.fromName', value: byKey.fromName?.value || null },
    { key: 'from', labelKey: 'admin.emailSettings.from', value: byKey.from?.value || null },
    { key: 'user', labelKey: 'admin.emailSettings.user', value: byKey.user?.value || null },
    { key: 'host', labelKey: 'admin.emailSettings.host', value: host || null, mono: true },
    { key: 'port', labelKey: 'admin.emailSettings.port', value: byKey.port?.value || null, mono: true },
    { key: 'secure', labelKey: 'admin.emailSettings.secure', value: secure ? t('common.yes') : t('common.no') },
  ].map(row => ({ ...row, source: byKey[row.key]?.source ?? 'unset' }));
}

export function normalizeChannel(raw) {
  return CHANNELS.includes(raw) ? raw : DEFAULT_CHANNEL;
}

export function normalizeSub(channel, raw) {
  const allowed = SUB_TABS[channel] || [];
  if (allowed.includes(raw)) return raw;
  return DEFAULT_SUB[channel] ?? allowed[0] ?? '';
}

// ─── Gönderim günlüğü ───────────────────────────────────────────────────────

export const LOG_STATUSES = ['sent', 'mock', 'failed', 'skipped'];

/**
 * İki kanalın log satırı farklı alan adlarıyla gelir (SystemMailLog:
 * sentAt/to/subject · SmsLog: createdAt/phone/body) — tek tablo formatına
 * indirger.
 */
export function normalizeLogRow(channel, log = {}) {
  if (channel === 'email') {
    return {
      id: log._id,
      time: log.sentAt ?? null,
      recipient: log.to || '',
      content: log.subject || '',
      username: '',
      status: LOG_STATUSES.includes(log.status) ? log.status : 'failed',
      error: log.error || '',
      trigger: log.trigger || '',
      event: log.event || '',
    };
  }
  return {
    id: log._id,
    time: log.createdAt ?? null,
    recipient: log.phone || '',
    content: log.body || '',
    username: log.username || '',
    status: ['sent', 'failed', 'skipped'].includes(log.status) ? log.status : 'failed',
    error: log.error || '',
    trigger: log.audienceType || '',
    event: log.templateKey || '',
  };
}

// ─── Automations (olay kataloğu) ────────────────────────────────────────────

/**
 * Her iki kanalın olay kataloğunu tek satır listesine indirger.
 *
 * @param {object} o
 * @param {Array}  o.mailEvents  GET /admin/mail-templates/events → {event,category,variables,usedBy}
 * @param {Array}  o.smsEvents   GET /admin/sms/templates → events {action:[{key,variables}],scheduled:[…]}
 * @param {Array}  o.smsTemplates GET /admin/sms/templates → templates (eventKey ile bağlı şablon)
 */
export function normalizeAutomationRows({ mailEvents = [], smsEvents = {}, smsTemplates = [] } = {}) {
  const smsUsed = new Map(smsTemplates.filter(t => t.eventKey).map(t => [t.eventKey, t.title]));
  const smsRows = (kind) => (smsEvents[kind] || []).map(e => ({
    channel: 'sms',
    event: e.key,
    type: kind,
    variables: e.variables || [],
    usedBy: smsUsed.get(e.key) || null,
  }));
  const mailRows = mailEvents.map(e => ({
    channel: 'email',
    event: e.event,
    type: e.category,
    variables: e.variables || [],
    usedBy: e.usedBy || null,
  }));
  // Sıra: kanal → tür (aksiyon önce, sistem akışını temsil eder) → olay adı.
  return [...mailRows, ...smsRows('action'), ...smsRows('scheduled')]
    .sort((a, b) => a.channel.localeCompare(b.channel) || a.type.localeCompare(b.type) || a.event.localeCompare(b.event));
}

// ─── Campaigns (zamana duyarlı gönderimler) ─────────────────────────────────

/** Gönderim anahtarını okunur biçime çevirir (mail: all/segments/users/inactive). */
export function audienceLabelKey(channel, audience) {
  if (channel === 'email') {
    const type = typeof audience === 'string' ? audience : (audience?.type || 'all');
    return `admin.communications.audience.${['all', 'segments', 'users', 'inactive'].includes(type) ? type : 'all'}`;
  }
  const type = typeof audience === 'string' ? audience : (audience || 'all');
  return `admin.communications.audience.${['all', 'segment', 'users'].includes(type) ? type : 'all'}`;
}

/**
  * İki kanalın zamanlanmış şablonlarını tek tabloya indirger. Her iki kanalda
  * da `schedule` (enabled/intervalHours/nextSentAt) alanları aynı adlarla
  * tutulur; SMS'te 15 dakikalık job (`runDueScheduledSms`) bu vadeye bakar.
  * "Şimdi gönder" her iki kanalda manuel yoldur; `auto` yalnız
  * `schedule.enabled` satırlarını işaretler.
  */
export function normalizeCampaignRows({ mailTemplates = [], smsTemplates = [] } = {}) {
  const mail = mailTemplates
    .filter(t => t.category === 'scheduled')
    .map(t => ({
      channel: 'email',
      id: t._id,
      name: t.name,
      enabled: !!t.enabled,
      auto: !!t.schedule?.enabled,
      intervalHours: t.schedule?.intervalHours ?? null,
      nextSentAt: t.schedule?.nextSentAt ?? null,
      lastSentAt: t.schedule?.lastSentAt ?? t.stats?.lastSentAt ?? null,
      sentCount: t.stats?.sentCount ?? 0,
      audience: t.audience?.type ?? 'all',
    }));
  const sms = smsTemplates
    .filter(t => t.type === 'scheduled')
    .map(t => ({
      channel: 'sms',
      id: t._id,
      name: t.title,
      enabled: !!t.isActive,
      auto: !!t.schedule?.enabled,
      intervalHours: t.schedule?.intervalHours ?? null,
      nextSentAt: t.schedule?.nextSentAt ?? null,
      lastSentAt: t.schedule?.lastSentAt ?? t.lastSentAt ?? null,
      sentCount: t.sentCount ?? 0,
      audience: t.audience?.type ?? 'all',
    }));
  // Otomatik zamanlı olanlar en sırada (yaklaşan gönderim görsün),
  // ardından son gönderilene göre (en yeni önce).
  return [...mail, ...sms].sort((a, b) => Number(b.auto) - Number(a.auto)
    || (new Date(b.lastSentAt ?? 0) - new Date(a.lastSentAt ?? 0)));
}
