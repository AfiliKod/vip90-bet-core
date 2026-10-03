/**
 * SMS şablon servisi — CRUD, demo seed, alıcı çözümleme ve gönderim.
 *
 * Gönderim senkron çalışır (operatör "Gönder" dediğinde istek tamamlanana dek
 * sürer): SMS metni birkaç saniyede gittiği için asenkron kuyruk bu ölçekte
 * gereksiz karmaşıklık olurdu. Tek operatör, makul alıcı sayısı (bkz.
 * MAX_RECIPIENTS) için kasıtlı bir sadelik tercihi. Her mesaj SmsLog'a yazılır,
 * yani "kim ne aldı" sorusu gönderimden sonra da cevaplanabilir.
 */
import escapeStringRegexp from 'escape-string-regexp';
import SmsTemplate, { SMS_TEMPLATE_TYPES, SMS_TEMPLATE_CATEGORIES } from '../models/SmsTemplate.js';
import SmsLog from '../models/SmsLog.js';
import PlayerSegment from '../models/PlayerSegment.js';
import Setting from '../models/Setting.js';
import User from '../models/User.js';
import { buildSegmentQuery } from './playerSegment.js';
import { isValidEvent, variablesForEvent } from './smsEvents.js';
import { getSmsConfig } from './smsSettings.js';
import { createSender, normalizePhone } from './smsGateway.js';
import { resolveSenderGate } from './smsSender.js';
import { moduleStore } from '../modules/index.js';

/** Tek istekteki üst alıcı sınırı — operatörün yanlışlıkla tüm tabloyu
 *  tek seferde patlatmasını engeller (SMS maliyeti geri alınamaz). */
export const MAX_RECIPIENTS = 2000;

const CONCURRENCY = 5;

export class SmsError extends Error {
  constructor(message, code = 'SMS_ERROR', status = 400) {
    super(message);
    this.name = 'SmsError';
    this.code = code;
    this.status = status;
  }
}

// ─── Placeholder yardımcıları ──────────────────────────────────────────────

/** `{{degisken}}` kalıbı — çift süslü parantez (tek `{}` i18n ile çakışır). */
export const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g;

/** Gövdedeki değişkenleri sıra koruyarak, tekrarsız listeler. */
export function extractPlaceholders(content) {
  if (!content) return [];
  const out = [];
  for (const m of String(content).matchAll(PLACEHOLDER_RE)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/**
 * Gövdeyi değişkenlerle doldurur. Bulunmayan değişkenler `''` olur ve
 * `missing` listesine girer — sahte bir "undefined" metni göndermektense
 * boş bırakıp hatayı yüzeye taşımak.
 */
export function renderTemplate(content, vars = {}) {
  const missing = [];
  const text = String(content ?? '').replace(PLACEHOLDER_RE, (_, name) => {
    const v = vars?.[name];
    if (v === undefined || v === null || v === '') {
      if (!missing.includes(name)) missing.push(name);
      return '';
    }
    return String(v);
  });
  return { text, missing };
}

/**
 * Başlıktan sabit `key` üretir (i18n anahtar kuralı: camelCase, alt çizgi yok).
 * Çakışmada sonuna sayı eklenir.
 */
export function templateKeyFromTitle(title, existingKeys = []) {
  const base = String(title || '')
    .replace(/[ğüşıöç]/gi, ch => ({ ğ: 'g', ü: 'u', ş: 's', ı: 'i', ö: 'o', ç: 'c' }[ch.toLowerCase()] ?? ch))
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i === 0 ? w[0].toLowerCase() + w.slice(1) : w[0].toUpperCase() + w.slice(1)))
    .join('');
  const safeBase = !base ? 'sablon' : (/^[a-z]/.test(base) ? base : `t${base}`);
  let key = safeBase;
  let i = 2;
  while (existingKeys.includes(key)) key = `${safeBase}${i++}`;
  return key;
}

function assertTypeAndEvent(type, eventKey) {
  if (!SMS_TEMPLATE_TYPES.includes(type)) {
    throw new SmsError(`Geçersiz şablon tipi: ${type}`, 'SMS_TEMPLATE_TYPE_INVALID');
  }
  if (type === 'action' && !eventKey) {
    throw new SmsError('Sistem (aksiyon) mesajları için olay seçilmesi zorunludur.', 'SMS_EVENT_REQUIRED');
  }
  if (eventKey && !isValidEvent(type, eventKey)) {
    throw new SmsError(`Geçersiz olay: ${eventKey}`, 'SMS_EVENT_INVALID');
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────

export async function listTemplates({ type = null, isActive = null, search = '' } = {}) {
  const filter = {};
  if (type) filter.type = type;
  if (isActive !== null) filter.isActive = isActive;
  if (search && typeof search === 'string') {
    const trimmed = search.trim().slice(0, 100);
    if (trimmed) {
      const re = new RegExp(escapeStringRegexp(trimmed), 'i');
      filter.$or = [{ title: re }, { key: re }, { content: re }];
    }
  }

  const [templates, counts] = await Promise.all([
    SmsTemplate.find(filter).sort({ type: 1, title: 1 }).lean(),
    SmsTemplate.aggregate([
      { $group: { _id: { type: '$type', isActive: '$isActive' }, count: { $sum: 1 } } },
    ]),
  ]);

  const summary = { all: 0, active: 0, action: 0, scheduled: 0 };
  for (const g of counts) {
    summary.all += g.count;
    if (g._id.isActive !== false) summary.active += g.count;
    if (g._id.type === 'action') summary.action += g.count;
    if (g._id.type === 'scheduled') summary.scheduled += g.count;
  }

  return { templates, summary };
}

export async function createTemplate(data, adminId = null) {
  assertTypeAndEvent(data.type, data.eventKey);
  const existing = await SmsTemplate.find({}).select('key').lean();
  const key = data.key || templateKeyFromTitle(data.title, existing.map(e => e.key));

  const doc = await SmsTemplate.create({
    key,
    title: data.title,
    type: data.type,
    eventKey: data.eventKey || null,
    category: data.category,
    content: data.content,
    isActive: data.isActive,
    variables: extractPlaceholders(data.content),
    createdBy: adminId,
    updatedBy: adminId,
  });
  return doc.toObject();
}

export async function updateTemplate(id, data, adminId = null) {
  const current = await SmsTemplate.findById(id);
  if (!current) throw new SmsError('Şablon bulunamadı', 'NOT_FOUND', 404);

  // Tip değişiyorsa olay geçerliliği YENİDEN denetlenir; aksi hâlde geçersiz
  // bir action/scheduled eşleşmesi yazılabilirdi.
  const nextType = data.type ?? current.type;
  assertTypeAndEvent(nextType, data.eventKey !== undefined ? data.eventKey : current.eventKey);

  const patch = { updatedBy: adminId };
  if (data.title !== undefined) patch.title = data.title;
  if (data.type !== undefined) patch.type = data.type;
  if (data.eventKey !== undefined) patch.eventKey = data.eventKey || null;
  if (data.category !== undefined) {
    if (!SMS_TEMPLATE_CATEGORIES.includes(data.category)) {
      throw new SmsError(`Geçersiz kategori: ${data.category}`, 'SMS_CATEGORY_INVALID');
    }
    patch.category = data.category;
  }
  if (data.isActive !== undefined) patch.isActive = data.isActive;
  if (data.content !== undefined) {
    patch.content = data.content;
    patch.variables = extractPlaceholders(data.content);
  }

  return SmsTemplate.findByIdAndUpdate(id, patch, { new: true, runValidators: true }).lean();
}

export async function deleteTemplate(id) {
  const removed = await SmsTemplate.findByIdAndDelete(id);
  if (!removed) throw new SmsError('Şablon bulunamadı', 'NOT_FOUND', 404);
  // Demo şablonu kalıcı olarak silindiyse seed'in onu yeniden yaratmasın:
  // `$setOnInsert` upsert'i YALNIZCA belge yokken çalışır, yani silinen bir
  // demo anahtarı bir sonraki restart'ta geri gelirdi. Operatörün kararı
  // kaydedilir (Setting: sms.templates.demoState).
  if (DEMO_SMS_TEMPLATES.some(d => d.key === removed.key)) {
    const state = await readDemoState();
    if (!state.removed.includes(removed.key)) {
      await writeDemoState({ ...state, removed: [...state.removed, removed.key] });
    }
  }
  return true;
}

// ─── Alıcı çözümleme ──────────────────────────────────────────────────────

/**
 * Hedef kitleyi SMS gönderebilecek kullanıcılı çözümler.
 * Telefonu olmayanlar BURADA elenir (log'da `skipped` yazılmaz — hiç denenmemek
 * daha dürüst; sayısal özet `withoutPhone` ile raporlanır).
 */
export async function resolveRecipients({ audienceType, segmentId, userIds }) {
  const base = { isActive: true, phone: { $nin: [null, ''] } };
  let query = null;
  let usedSegmentId = null;

  if (audienceType === 'all') {
    query = base;
  } else if (audienceType === 'segment') {
    if (!segmentId) throw new SmsError('Segment seçilmedi', 'SMS_SEGMENT_REQUIRED');
    const segment = await PlayerSegment.findById(segmentId).lean();
    if (!segment) throw new SmsError('Segment bulunamadı', 'NOT_FOUND', 404);
    const segmentQuery = buildSegmentQuery(segment.criteria || {});
    // Kriteri OLMAYAN (veya tamamı null olan) bir segment boş sorguya çevrilir
    // ve "herkes" anlamına gelir. Toplu SMS'te bu kaza sonucu tüm oyuncuya
    // mesaj göndermek olurdu — bu yüzden bilinçli olarak reddedilir: operatör
    // ya gerçek kriter tanımlar ya da bilinçli olarak "tüm kullanıcılar" seçer.
    if (Object.keys(segmentQuery).length === 0) {
      throw new SmsError(
        'Bu segmentin seçici kriteri yok; belirsiz bir kitleye SMS gönderilmez. Segmenti düzenleyin veya "tüm kullanıcılar" seçeneğini kullanın.',
        'SMS_SEGMENT_TOO_BROAD',
      );
    }
    query = { ...segmentQuery, ...base };
    usedSegmentId = segmentId;
  } else if (audienceType === 'users') {
    const ids = Array.isArray(userIds) ? userIds.filter(Boolean) : [];
    if (!ids.length) throw new SmsError('En az bir kullanıcı seçilmeli', 'SMS_USERS_REQUIRED');
    query = { _id: { $in: ids }, ...base };
  } else {
    throw new SmsError(`Geçersiz hedef kitle: ${audienceType}`, 'SMS_AUDIENCE_INVALID');
  }

  const recipients = await User.find(query)
    .select('username phone balance vipXp')
    .limit(MAX_RECIPIENTS + 1)
    .lean();

  const capped = recipients.length > MAX_RECIPIENTS;
  return { recipients: recipients.slice(0, MAX_RECIPIENTS), capped, segmentId: usedSegmentId };
}

// ─── Gönderim ─────────────────────────────────────────────────────────────

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Zaman ağırlıklı şablonu hedef kitleye gönderir.
 *
 * @param opts.sendImpl  test için enjekte edilebilir gönderim (üretimde
 *                       sağlayıcı adaptöründen gelir)
 * @returns { sent, failed, skipped, total, capped, missing }
 */
export async function sendTemplate({
  templateId,
  audienceType,
  segmentId = null,
  userIds = [],
  variables = {},
  adminId = null,
  config = null,
  sendImpl = null,
}) {
  const template = await SmsTemplate.findById(templateId).lean();
  if (!template) throw new SmsError('Şablon bulunamadı', 'NOT_FOUND', 404);

  // Aksiyona bağlı sistem mesajları operatör tarafından elle gönderilemez:
  // tetikleyen domain kodudur, panel yanlış zamanda/yanlış kitleye mesaj
  // yazmasına izin vermez.
  if (template.type === 'action') {
    throw new SmsError(
      'Sistem (aksiyon) mesajları panelden gönderilemez; yalnızca zamana duyarlı mesajlar gönderilebilir.',
      'SMS_ACTION_NOT_SENDABLE',
    );
  }
  if (!template.isActive) {
    throw new SmsError('Şablon pasif durumda', 'SMS_TEMPLATE_INACTIVE');
  }

  const cfg = config || await getSmsConfig();
  if (!cfg.configured) {
    throw new SmsError('SMS Gateway kimlik bilgileri eksik. Modüller → SMS Gateway ayarını tamamlayın.', 'SMS_NOT_CONFIGURED');
  }

  const enabled = await moduleStore.isEnabled('sms-gateway');
  if (!enabled) {
    throw new SmsError('SMS Gateway modülü kapalı. Modüller sayfasından açın.', 'SMS_MODULE_DISABLED');
  }

  const { recipients, capped, segmentId: usedSegmentId } = await resolveRecipients({ audienceType, segmentId, userIds });

  // Gönderici kaydı/ülke onayı kapısı. Kayıt- ve hesap seviyesindeki
  // engeller TÜM gönderimi durdurur (operatör bilerek gönderiyorsa
  // kaydı düzeltmeli); alıcıya özgü engeller (ülke onayı, trial numarası)
  // yalnız o alıcıyı atlar.
  const gate = await resolveSenderGate(cfg);
  if (gate.blocked) {
    throw new SmsError(
      'Gönderici kaydı uygun değil; Göndericiler sekmesinden onay durumunu düzeltin.',
      gate.blocked,
    );
  }
  const checkRecipient = gate.checkRecipient ?? (() => ({ blocked: null, reasons: [] }));

  const sender = sendImpl || createSender(cfg.provider);
  const senderOpts = {
    accountSid: cfg.accountSid,
    authToken: cfg.authToken,
    from: cfg.fromNumber,
    messagingServiceSid: cfg.messagingServiceSid,
    defaultCountryCode: cfg.defaultCountryCode,
  };

  const missing = new Set();
  const logs = [];

  const outcomes = await mapWithConcurrency(recipients, CONCURRENCY, async user => {
    const phone = normalizePhone(user.phone, cfg.defaultCountryCode);
    if (!phone) return { status: 'skipped', skipReason: 'SMS_INVALID_PHONE', error: 'Geçersiz telefon numarası' };

    // Onay kapısı: numara kayıtlı değilse AĞA HİÇ GİTMEZ.
    const verdict = checkRecipient(phone);
    if (verdict.blocked) {
      return { status: 'skipped', skipReason: verdict.blocked, error: null };
    }

    const perUser = {
      username: user.username,
      balance: user.balance ?? '',
      ...variables,
    };
    const { text, missing: miss } = renderTemplate(template.content, perUser);
    miss.forEach(m => missing.add(m));

    const res = await sender({ to: phone, body: text, ...senderOpts });
    return res?.ok
      ? { status: 'sent', text, sid: res.sid ?? null, error: null }
      : {
          status: 'failed',
          text,
          sid: res?.sid ?? null,
          error: res?.error || res?.code || 'Bilinmeyen hata',
          twilioCode: res?.twilioCode ?? null,
          meaning: res?.meaning ?? null,
        };
  });

  outcomes.forEach((o, i) => {
    const user = recipients[i];
    logs.push({
      templateId: template._id,
      templateKey: template.key,
      userId: user._id,
      username: user.username,
      phone: user.phone,
      body: o.text ?? '',
      status: o.status,
      skipReason: o.skipReason ?? null,
      twilioCode: o.twilioCode ?? null,
      errorMeaning: o.meaning ?? null,
      provider: cfg.provider,
      providerSid: o.sid ?? null,
      error: o.error ?? '',
      audienceType,
      segmentId: usedSegmentId,
      triggeredBy: adminId,
    });
  });

  if (logs.length) await SmsLog.insertMany(logs);

  const sent = logs.filter(l => l.status === 'sent').length;
  await SmsTemplate.findByIdAndUpdate(templateId, {
    $inc: { sentCount: sent },
    ...(sent > 0 ? { $set: { lastSentAt: new Date() } } : {}),
  });

  // Atlananların neden kırılımı — operatör "neden gitmedi?" sorusunu
  // gönderim anında görebilmeli.
  const skipReasons = {};
  for (const l of logs) if (l.status === 'skipped') skipReasons[l.skipReason ?? 'SMS_SKIPPED'] = (skipReasons[l.skipReason ?? 'SMS_SKIPPED'] ?? 0) + 1;

  return {
    total: logs.length,
    sent,
    failed: logs.filter(l => l.status === 'failed').length,
    skipped: logs.filter(l => l.status === 'skipped').length,
    capped,
    missing: [...missing],
    skipReasons,
    accountType: gate.accountType ?? 'paid',
    senderId: gate.sender?._id ?? null,
  };
}

/**
 * Domain kodunun çağırdığı giriş noktası: `dispatchSmsEvent('betWon', user, {...})`.
 * Bulunan aktif aksiyon şablonlarını render edip gönderir. HİÇBİR ZAMAN throw
 * etmez — SMS hatası domain akışını (bahis sonucu, çekim onayı) bozmamalı.
 */
export async function dispatchSmsEvent(eventKey, user, variables = {}, deps = {}) {
  try {
    const template = await SmsTemplate.findOne({ type: 'action', eventKey, isActive: true }).lean();
    if (!template) return { sent: 0, skipped: 'NO_TEMPLATE' };

    const cfg = deps.config || await getSmsConfig();
    if (!cfg.configured) return { sent: 0, skipped: 'NOT_CONFIGURED' };
    if (!(await moduleStore.isEnabled('sms-gateway'))) return { sent: 0, skipped: 'MODULE_DISABLED' };

    const phone = normalizePhone(user?.phone, cfg.defaultCountryCode);
    if (!phone) return { sent: 0, skipped: 'NO_PHONE' };

    const { text } = renderTemplate(template.content, { username: user?.username, ...variables });
    const sender = deps.sendImpl || createSender(cfg.provider);
    const res = await sender({
      to: phone,
      body: text,
      accountSid: cfg.accountSid,
      authToken: cfg.authToken,
      from: cfg.fromNumber,
      messagingServiceSid: cfg.messagingServiceSid,
      defaultCountryCode: cfg.defaultCountryCode,
    });

    await SmsLog.create({
      templateId: template._id,
      templateKey: template.key,
      userId: user?._id ?? null,
      username: user?.username ?? null,
      phone,
      body: text,
      status: res?.ok ? 'sent' : 'failed',
      provider: cfg.provider,
      providerSid: res?.sid ?? null,
      error: res?.ok ? '' : (res?.error || res?.code || 'Bilinmeyen hata'),
      audienceType: null,
    });

    return { sent: res?.ok ? 1 : 0, error: res?.ok ? null : (res?.error || null) };
  } catch (err) {
    // Konteyner loglar; çağıran yine de devam eder.
    console.error('[sms] dispatchSmsEvent hatası:', err.message);
    return { sent: 0, error: err.message };
  }
}

export async function listLogs({ status = null, limit = 50 } = {}) {
  const filter = {};
  if (status) filter.status = status;
  const [logs, counts] = await Promise.all([
    SmsLog.find(filter).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 50, 200)).lean(),
    SmsLog.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  const summary = { sent: 0, failed: 0, skipped: 0 };
  for (const g of counts) if (g._id in summary) summary[g._id] = g.count;
  return { logs, summary };
}

// ─── Demo seed ────────────────────────────────────────────────────────────

/**
 * Demo şablonlar. Kullanıcının örnek verdiği kullanım senaryolarının tamamı:
 * kayıt, bahis kazan/kaybet, casino oturum kar/zarar, yatırım, çekim,
 * "we miss you" (uzun süredir giriş yapmayan) ve zamana duyarlı bonus/turuva
 * duyuruları.
 *
 * `$setOnInsert` kullanılır: seed HER BOOT'ta çalışır ama operatörün
 * düzenlemesini ASLA ezmez (yalnızca eksik anahtarlar eklenir).
 * Operatörün SİLDİĞİ demo anahtarları `Setting` üzerinde tombstone olarak
 * tutulur — yoksa upsert onları bir sonraki restart'ta geri getirirdi.
 */
export const DEMO_STATE_SETTING_KEY = 'sms.templates.demoState';

async function readDemoState() {
  try {
    const row = await Setting.findOne({ key: DEMO_STATE_SETTING_KEY }).lean();
    const parsed = row?.value ? JSON.parse(row.value) : null;
    return { removed: Array.isArray(parsed?.removed) ? parsed.removed : [] };
  } catch {
    // DB okunamıyorsa seed zaten çalışmayacak; sessiz geç, sunucu açılsın.
    return { removed: [] };
  }
}

async function writeDemoState(state) {
  await Setting.updateOne(
    { key: DEMO_STATE_SETTING_KEY },
    { $set: { key: DEMO_STATE_SETTING_KEY, value: JSON.stringify(state) } },
    { upsert: true },
  );
}

export const DEMO_SMS_TEMPLATES = [
  // ── Sistem (aksiyon) mesajları ──
  {
    key: 'welcomeRegistered', title: 'Kayıt hoş geldin mesajı', type: 'action', eventKey: 'userRegistered',
    category: 'system', content: '{{username}} hoş geldin! Hesabın hazır, iyi şanslar!',
  },
  {
    key: 'emailVerifiedNotice', title: 'E-posta doğrulama', type: 'action', eventKey: 'emailVerified',
    category: 'system', content: '{{username}}, e-posta doğrulaman tamamlandı. Tüm işlemlerine erişebilirsin.',
  },
  {
    key: 'depositCompletedNotice', title: 'Yatırım onayı', type: 'action', eventKey: 'depositCompleted',
    category: 'wallet', content: 'Yatırımın onaylandı: {{amount}} {{currency}}. Bakiyen: {{balance}} {{currency}}.',
  },
  {
    key: 'withdrawalCompletedNotice', title: 'Çekim gönderildi', type: 'action', eventKey: 'withdrawalCompleted',
    category: 'wallet', content: 'Çekimin gönderildi: {{amount}} {{currency}}. Bizi tercih ettiğin için teşekkürler.',
  },
  {
    key: 'betWinNotice', title: 'Bahis kazandı', type: 'action', eventKey: 'betWon',
    category: 'betting', content: 'Kazandın {{amount}} {{currency}}! Kupon #{{betId}}, piyasa: {{market}}.',
  },
  {
    key: 'betLossNotice', title: 'Bahis kaybedildi', type: 'action', eventKey: 'betLost',
    category: 'betting', content: 'Kupon #{{betId}} kaybedildi ({{stake}} {{currency}}). Bir sonraki oyunda şansın yanında!',
  },
  {
    key: 'casinoSessionProfitNotice', title: 'Casino oturumu kâr', type: 'action', eventKey: 'casinoSessionProfit',
    category: 'casino', content: 'Oturum kârın: {{netProfit}} {{currency}}! Harika oynuyorsun.',
  },
  {
    key: 'casinoSessionLossNotice', title: 'Casino oturumu zarar', type: 'action', eventKey: 'casinoSessionLoss',
    category: 'casino', content: 'Oturum zararın: {{netLoss}} {{currency}}. Bol şanslar!',
  },
  {
    key: 'weMissYou', title: 'We miss you (uzun süredir giriş yok)', type: 'action', eventKey: 'inactiveReminder',
    category: 'system', content: '{{days}} gündür girmiyorsun {{username}}. Sana özel bonus var, hemen bak!',
  },

  // ── Zamana duyarlı / kampanya mesajları (panelden gönderilebilir) ──
  {
    key: 'bonusStartingNotice', title: 'Bonus başlangıcı', type: 'scheduled', eventKey: 'bonusStarting',
    category: 'promotion', content: 'Yeni bonusun başlıyor: {{amount}} {{currency}}. Süresi {{expiresIn}}.',
  },
  {
    key: 'bonusExpiringNotice', title: 'Bonus bitiş uyarısı', type: 'scheduled', eventKey: 'bonusExpiring',
    category: 'promotion', content: 'Bonusun {{hoursLeft}} saat sonra bitiyor: {{amount}} {{currency}}. Hemen kullan!',
  },
  {
    key: 'weeklyBonusNotice', title: 'Haftalık bonus', type: 'scheduled', eventKey: 'weeklyBonus',
    category: 'promotion', content: 'Haftalık bonusun seni bekliyor: {{amount}} {{currency}}.',
  },
  {
    key: 'birthdayBonusNotice', title: 'Doğum günü bonusu', type: 'scheduled', eventKey: 'birthdayBonus',
    category: 'promotion', content: 'İyi ki doğdun! Doğum günü bonusun hazır: {{amount}} {{currency}}.',
  },
  {
    key: 'tournamentReminder', title: 'Turnuva hatırlatması', type: 'scheduled', eventKey: 'tournamentReminder',
    category: 'promotion', content: '{{tournament}} turnuvası {{startsIn}} başlıyor! Ödül: {{prize}}.',
  },
  {
    key: 'campaignAnnouncement', title: 'Kampanya duyurusu', type: 'scheduled', eventKey: 'campaignAnnouncement',
    category: 'promotion', content: 'Sana özel yeni bir kampanya başladı. Hemen kontrol et!',
  },
];

export async function initDefaultSmsTemplates() {
  const { removed } = await readDemoState();
  const pending = DEMO_SMS_TEMPLATES.filter(d => !removed.includes(d.key));
  if (!pending.length) return { inserted: 0, total: DEMO_SMS_TEMPLATES.length };

  const ops = pending.map(doc => ({
    updateOne: {
      filter: { key: doc.key },
      update: { $setOnInsert: { ...doc, variables: extractPlaceholders(doc.content), isActive: true } },
      upsert: true,
    },
  }));
  const res = await SmsTemplate.bulkWrite(ops, { ordered: false });
  return { inserted: res.upsertedCount ?? 0, total: pending.length };
}