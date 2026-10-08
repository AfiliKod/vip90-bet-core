/**
 * Sistem e-postası gönderim motoru.
 *
 * İki yol var ve ikisi de aynı şablon/ render altyapısını kullanır:
 *
 *  1. `sendActionMail(event, …)` — sistemdeki bir olaya (kayıt, bahis
 *     sonuçlanması, oturum kapanışı, yatırım/çekim, KYC) bağlı gönderim.
 *     Şablon panelden DÜZENLENİR; elle gönderilemez. Şablon yok/pasifse
 *     çağıran kodun `fallback`'i devreye girer (eski davranış korunur).
 *
 *  2. `sendBulk(…)` — zamana duyarlı şablonların (kampanya, promosyon,
 *     hareketsiz-kullanıcı) panelden kitle seçilerek gönderimi.
 *     Kitle: tüm kullanıcılar / belirli segmentler / belirli kullanıcılar /
 *     belirli süredir online olmayanlar.
 *
 * Hiçbir yol çağıranı düşürmez: hatalar yakalanır ve `SystemMailLog`'a
 * yazılır. `MAIL_SYSTEM_DISABLED=true` tüm gönderimi kapatır (test/ bakım).
 */
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import SystemMailTemplate from '../models/SystemMailTemplate.js';
import SystemMailLog from '../models/SystemMailLog.js';
import User from '../models/User.js';
import PlayerSegment from '../models/PlayerSegment.js';
import { sendEmail, SUPPORT_EMAIL } from './email.js';
import { getSiteName } from '../branding/index.js';
import { localeStore } from './localeLive.js';
import { buildQueryFromCriteria } from './playerSegment.js';
import {
  getTemplateByEvent,
  renderTemplateDocument,
  eventCategory,
  CATEGORY_ACTION,
} from './mailTemplates.js';

export const AUDIENCE_TYPES = ['all', 'segments', 'users', 'inactive'];

const DEFAULT_BATCH_LIMIT = 500;
const SEND_CONCURRENCY = 5;

/** Tek seferde gönderilebilecek maksimum alıcı (toplu gönderim güvenlik sınırı). */
export function getBatchLimit() {
  const raw = Number(process.env.MAIL_SEND_BATCH_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 5000) : DEFAULT_BATCH_LIMIT;
}

function isDisabled() {
  return process.env.MAIL_SYSTEM_DISABLED === 'true';
}

// User.deletedAt default: null — alanı TÜM dokümanlarda var ($exists: false
// hiçbirini eşleştirmez). `deletedAt: null` hem silinmemiş hem de alanı olmayan
// kayıtları yakalar.
const BASE_USER_FILTER = {
  email: { $exists: true, $ne: '' },
  deletedAt: null,
  isBot: { $ne: true },
};

async function commonVars(user) {
  let siteName = 'VIP90.bet';
  let lang = 'tr';
  try {
    siteName = await getSiteName();
  } catch { /* marka okunamadıysa varsayılanla devam */ }
  try {
    lang = await localeStore.get();
  } catch { /* dil okunamadıysa varsayılanla devam */ }
  let currency = '';
  try {
    const { getActiveCurrency } = await import('../currency/index.js');
    currency = (await getActiveCurrency())?.code || '';
  } catch { /* para birimi okunamadıysa boş kalır */ }
  return {
    siteName,
    lang,
    currency,
    username: user?.username || '',
    supportEmail: SUPPORT_EMAIL,
    currentYear: String(new Date().getFullYear()),
    siteUrl: (process.env.CLIENT_URL || '').split(',')[0].trim(),
  };
}

async function writeLog(entry) {
  try {
    if (mongoose.connection?.readyState !== 1) return;
    await SystemMailLog.create([{ ...entry, sentAt: new Date() }]);
  } catch (e) {
    console.error('[systemMail] log yazılamadı:', e.message);
  }
}

async function bumpStats(templateId, ok) {
  try {
    if (mongoose.connection?.readyState !== 1 || !templateId) return;
    await SystemMailTemplate.updateOne(
      { _id: templateId },
      {
        $inc: { 'stats.sentCount': ok ? 1 : 0, 'stats.failedCount': ok ? 0 : 1 },
        $set: { 'stats.lastSentAt': new Date() },
      },
    );
  } catch { /* sayaç zorunlu değil */ }
}

// ─── 1. Aksiyona bağlı gönderim ────────────────────────────────────────────

/**
 * Alıcıyı çözümler. Şablon hiç yoksa kullanıcı sorgusu ATMAZ — yüksek
 * hacimli olaylarda (toplu bahis sonuçlandırma) gereksiz sorgu kalmasın.
 */
async function resolveRecipient({ user = null, to = null, userId = null }) {
  if (to) return { user, email: to };
  if (user) return { user, email: user.email || null };
  if (userId) {
    const row = await User.findById(userId).select('email username isBot').lean();
    if (!row) return { user: null, email: null };
    return { user: row, email: row.email || null };
  }
  return { user: null, email: null };
}

/**
 * @param {string} event   MAIL_EVENTS anahtarı
 * @param {object} opts
 * @param {object} [opts.user]     alıcı kullanıcı dokümanı (email/username için)
 * @param {string} [opts.userId]   `user` yoksa kimlikten yüklenir
 * @param {string} [opts.to]       doğrudan adres (öncelikli)
 * @param {object} [opts.vars]     olaya özgü yer tutucular
 * @param {Function} [opts.fallback] şablon yok/pasifken çağrılır ve
 *        `{ subject, html }` döndürmelidir (eski davranışın korunması).
 * @returns {Promise<object>} asla throw atmaz
 */
export async function sendActionMail(event, { user = null, userId = null, to = null, vars = {}, fallback = null } = {}) {
  try {
    if (isDisabled()) return { status: 'skipped', reason: 'system_disabled' };
    if (mongoose.connection?.readyState !== 1) return { status: 'skipped', reason: 'no_db' };
    const category = eventCategory(event);
    if (category !== CATEGORY_ACTION) {
      return { status: 'skipped', reason: 'not_action_event' };
    }

    const tpl = await getTemplateByEvent(event);
    const hasTemplate = !!(tpl && tpl.enabled);
    if (!hasTemplate && typeof fallback !== 'function') {
      return { status: 'skipped', reason: tpl ? 'disabled' : 'no_template' };
    }

    const recipient = await resolveRecipient({ user, to, userId });
    if (!recipient.email) return { status: 'skipped', reason: 'no_recipient' };
    if (recipient.user?.isBot) return { status: 'skipped', reason: 'bot_user' };

    const common = await commonVars(recipient.user);
    const merged = { ...common, ...vars };

    let payload;
    let templateId = null;
    if (hasTemplate) {
      payload = renderTemplateDocument(tpl, merged, { siteName: common.siteName, lang: common.lang });
      templateId = tpl._id;
    } else {
      payload = await fallback();
      if (!payload?.subject || !payload?.html) return { status: 'skipped', reason: 'no_fallback' };
    }

    const res = await sendEmail({ to: recipient.email, subject: payload.subject, html: payload.html });
    const status = res?.mock ? 'mock' : 'sent';
    await writeLog({
      templateId,
      event,
      category: CATEGORY_ACTION,
      trigger: 'action',
      triggeredBy: null,
      audienceType: 'direct',
      to: recipient.email,
      userId: recipient.user?._id || userId || null,
      subject: payload.subject,
      status,
    });
    if (templateId) await bumpStats(templateId, true);
    return { status, mock: !!res?.mock };
  } catch (e) {
    console.error(`[systemMail] ${event} gönderilemedi:`, e.message);
    return { status: 'failed', error: e.message };
  }
}

// ─── 2. Kitle çözümü (zamana duyarlı gönderim) ─────────────────────────────

/**
 * Audience tanımını alıcı listesine çevirir.
 * @returns {Promise<{users: Array, matched: number}>}
 */
export async function resolveAudience(audience = {}, { limit = getBatchLimit() } = {}) {
  const type = audience?.type || 'all';
  const filter = { ...BASE_USER_FILTER };

  if (type === 'users') {
    const ids = (audience.userIds || []).filter((id) => mongoose.isValidObjectId(id));
    if (ids.length === 0) return { users: [], matched: 0 };
    filter._id = { $in: ids };
  } else if (type === 'segments') {
    const ids = (audience.segmentIds || []).filter((id) => mongoose.isValidObjectId(id));
    if (ids.length === 0) return { users: [], matched: 0 };
    const segments = await PlayerSegment.find({ _id: { $in: ids } }).lean();
    const ors = await Promise.all(segments.map((s) => buildQueryFromCriteria(s.criteria || {})));
    if (ors.length === 0) return { users: [], matched: 0 };
    filter.$or = ors;
  } else if (type === 'inactive') {
    const days = Math.max(1, Number(audience.inactiveDays) || 14);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    filter.$or = [
      { lastLoginAt: { $lt: cutoff } },
      { lastLoginAt: null, createdAt: { $lt: cutoff } },
    ];
  }

  const [users, matched] = await Promise.all([
    User.find(filter)
      .select('email username isBot')
      .sort({ lastLoginAt: 1, createdAt: 1 })
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);
  return { users, matched };
}

/** Basit eşzamanlılık havuzu — SMTP gönderimi sırayla çok yavaş kalıyor. */
async function runPool(items, worker, concurrency = SEND_CONCURRENCY) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Zamana duyarlı bir şablonu kitleye gönderir.
 * Aksiyon kategorisindeki şablonlar elle gönderilemez (400).
 */
export async function sendBulk(templateOrId, { audience = null, triggeredBy = null, trigger = 'manual' } = {}) {
  // ObjectId de `typeof === 'object'` — id ile doküman ayrımı `_id` ile değil
  // tipte yapılmalı, yoksa ObjectId "şablon" sanılır ve enabled/category undefined kalır.
  const isDoc = typeof templateOrId === 'object'
    && templateOrId !== null
    && ('event' in templateOrId || 'category' in templateOrId);
  const tpl = isDoc ? templateOrId : await SystemMailTemplate.findById(templateOrId);

  if (!tpl) {
    const err = new Error('Şablon bulunamadı');
    err.status = 404;
    err.code = 'MAIL_NOT_FOUND';
    throw err;
  }
  if (tpl.category === CATEGORY_ACTION) {
    const err = new Error('Aksiyona bağlı mailler panelden gönderilemez — yalnızca düzenlenebilir');
    err.status = 400;
    err.code = 'MAIL_ACTION_TRIGGER_ONLY';
    throw err;
  }
  if (!tpl.enabled) {
    const err = new Error('Şablon pasif — göndermeden önce etkinleştirin');
    err.status = 400;
    err.code = 'MAIL_TEMPLATE_DISABLED';
    throw err;
  }
  if (isDisabled()) {
    const err = new Error('Sistem e-postaları geçici olarak kapalı');
    err.status = 503;
    err.code = 'MAIL_SYSTEM_DISABLED';
    throw err;
  }

  const effectiveAudience = audience || tpl.audience || { type: 'all' };
  const limit = getBatchLimit();
  const { users, matched } = await resolveAudience(effectiveAudience, { limit });
  const common = await commonVars(null);
  const batchId = randomUUID();

  const results = await runPool(users, async (u) => {
    try {
      const merged = { ...common, username: u.username || '' };
      const { subject, html } = renderTemplateDocument(tpl, merged, { siteName: common.siteName, lang: common.lang });
      const res = await sendEmail({ to: u.email, subject, html });
      const status = res?.mock ? 'mock' : 'sent';
      await writeLog({
        templateId: tpl._id,
        event: tpl.event,
        category: tpl.category,
        trigger,
        triggeredBy,
        batchId,
        audienceType: effectiveAudience.type || 'all',
        to: u.email,
        userId: u._id,
        subject,
        status,
      });
      return status === 'failed' ? 'failed' : 'sent';
    } catch (e) {
      await writeLog({
        templateId: tpl._id,
        event: tpl.event,
        category: tpl.category,
        trigger,
        triggeredBy,
        batchId,
        audienceType: effectiveAudience.type || 'all',
        to: u.email,
        userId: u._id,
        subject: tpl.subject,
        status: 'failed',
        error: e.message,
      });
      return 'failed';
    }
  });

  const failed = results.filter((r) => r === 'failed').length;
  const sent = results.length - failed;

  await SystemMailTemplate.updateOne(
    { _id: tpl._id },
    {
      $inc: { 'stats.sentCount': sent, 'stats.failedCount': failed },
      $set: { 'stats.lastSentAt': new Date() },
    },
  );

  return {
    templateId: tpl._id,
    event: tpl.event,
    batchId,
    audienceType: effectiveAudience.type || 'all',
    matched,
    processed: results.length,
    sent,
    failed,
    truncated: matched > users.length,
    limit,
  };
}

// ─── 3. Zamanlanmış gönderim işi ───────────────────────────────────────────

/**
 * Vadesi gelen zamanlanmış şablonları gönderir.
 * `schedule.nextSentAt` hiç hesaplanmamışsa HEMEN göndermez, yalnızca vadeyi
 * kurar — sunucu açılışında toplu e-posta patlamasını önler. İlk gönderim
 * paneldeki "Şimdi gönder" ile yapılır.
 *
 * @returns {Promise<number>} gönderilen şablon sayısı
 */
export async function runDueScheduledMails(now = new Date()) {
  if (isDisabled()) return 0;
  if (mongoose.connection?.readyState !== 1) return 0;

  const due = await SystemMailTemplate.find({
    category: 'scheduled',
    enabled: true,
    'schedule.enabled': true,
    $or: [
      { 'schedule.nextSentAt': null },
      { 'schedule.nextSentAt': { $lte: now } },
    ],
  });

  let sent = 0;
  for (const tpl of due) {
    const intervalHours = Math.max(1, Number(tpl.schedule?.intervalHours) || 168);
    const alreadyDue = tpl.schedule?.nextSentAt instanceof Date && tpl.schedule.nextSentAt <= now;
    try {
      if (alreadyDue) {
        await sendBulk(tpl, { trigger: 'schedule' });
        sent += 1;
      }
      tpl.schedule.lastSentAt = alreadyDue ? now : tpl.schedule.lastSentAt;
      tpl.schedule.nextSentAt = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);
      await tpl.save();
    } catch (e) {
      console.error(`[systemMail] zamanlanmış gönderim hatası (${tpl.event}):`, e.message);
    }
  }
  return sent;
}

const _timers = new Set();

/** 15 dakikada bir vadesi gelen zamanlanmış şablonları gönderir. */
export function startScheduledMailJob(intervalMs = 15 * 60 * 1000) {
  if (_timers.size > 0) return;
  const run = () => {
    runDueScheduledMails().catch((e) => console.error('[systemMail] job hatası:', e.message));
  };
  // İlk çalıştırmayı boot'tan sonraya bırak — DB bağlanmadan sorgu atmasın.
  const bootDelay = setTimeout(run, 30 * 1000);
  const interval = setInterval(run, intervalMs);
  for (const timer of [bootDelay, interval]) {
    if (typeof timer.unref === 'function') timer.unref();
    _timers.add(timer);
  }
}

export function stopScheduledMailJob() {
  for (const timer of _timers) {
    clearTimeout(timer);
    clearInterval(timer);
  }
  _timers.clear();
}
