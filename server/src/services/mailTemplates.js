/**
 * Sistem e-posta şablonları — katalog, varsayılan (demo) içerik, render ve CRUD.
 *
 * Üç katman var:
 *   1. MAIL_EVENTS  → hangi olayın hangi kategoride olduğu + kullanılabilir
 *                      `{{değişken}}` havuzu. Kod (ve panel) tek buraya bakar.
 *   2. DEFAULT_TEMPLATES → açılışta tohumlanan örnek/demo içerikler. Admin
 *                      sayfada bunları düzenleyerek başlar.
 *   3. render/CRUD  → şablonu çözüp HTML'e çevirme, listeleme, yazma.
 *
 * Gönderimin kendisi `services/systemMail.js`'tedir; burada depolama ve
 * render vardır.
 */
import escapeStringRegexp from 'escape-string-regexp';
import mongoose from 'mongoose';
import SystemMailTemplate from '../models/SystemMailTemplate.js';
import SystemMailLog from '../models/SystemMailLog.js';
import { layout, button, fallbackLink, SUPPORT_EMAIL } from './email.js';

export const CATEGORY_ACTION = 'action';
export const CATEGORY_SCHEDULED = 'scheduled';

/**
 * Olay kataloğu.
 *  - category: `action` sistem olayına bağlıdır ve panelden elle gönderilemez;
 *              `scheduled` zamana duyarlıdır ve panelden kitle seçilerek gönderilir.
 *  - variables: olayı tetikleyen kodun sağladığı yer tutucular (önizleme + panel
 *               "değişkenler" listesi için). Hepsi için ayrıca siteName,
 *               username, supportEmail, currentYear, siteUrl eklenir.
 */
export const MAIL_EVENTS = {
  'user.emailVerify': {
    category: CATEGORY_ACTION,
    variables: ['verifyUrl', 'expiresHours'],
  },
  'user.welcome': {
    category: CATEGORY_ACTION,
    variables: [],
  },
  'user.passwordReset': {
    category: CATEGORY_ACTION,
    variables: ['resetUrl', 'expiresMinutes'],
  },
  'user.passwordChanged': {
    category: CATEGORY_ACTION,
    variables: ['changedAt'],
  },
  'kyc.approved': {
    category: CATEGORY_ACTION,
    variables: ['note'],
  },
  'kyc.rejected': {
    category: CATEGORY_ACTION,
    variables: ['note'],
  },
  'bet.settled': {
    category: CATEGORY_ACTION,
    variables: ['betId', 'betStatus', 'isWon', 'isLost', 'isCancelled', 'stake', 'potentialWin',
      'totalOdds', 'payout', 'selectionCount', 'settledAt'],
  },
  'casino.sessionClosed': {
    category: CATEGORY_ACTION,
    variables: ['gameTitle', 'netResult', 'isProfit', 'isLoss', 'isEven', 'initialBalance',
      'finalBalance', 'durationMinutes', 'closedAt'],
  },
  'wallet.depositCompleted': {
    category: CATEGORY_ACTION,
    variables: ['amount', 'balance', 'method', 'reference', 'completedAt'],
  },
  'wallet.withdrawalCompleted': {
    category: CATEGORY_ACTION,
    variables: ['amount', 'balance', 'method', 'reference', 'completedAt'],
  },
  'campaign.broadcast': {
    category: CATEGORY_SCHEDULED,
    variables: [],
  },
  'campaign.inactiveUsers': {
    category: CATEGORY_SCHEDULED,
    variables: ['inactiveDays', 'lastLoginAt'],
  },
  'campaign.reactivation': {
    category: CATEGORY_SCHEDULED,
    variables: [],
  },
};

/** Her olay için hazır değişken havuzu (baştaki ortak değerlerle birlikte). */
// `currency` aktif para birimidir (services/systemMail.js commonVars).
export const COMMON_VARIABLES = ['siteName', 'username', 'currency', 'supportEmail', 'currentYear', 'siteUrl'];

export function eventCategory(event) {
  return MAIL_EVENTS[event]?.category || null;
}

export function eventVariables(event) {
  const entry = MAIL_EVENTS[event];
  if (!entry) return [];
  return [...entry.variables, ...COMMON_VARIABLES];
}

// ─── Render ────────────────────────────────────────────────────────────────

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

const VAR_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;
// İç içe destek için en-İÇTEKİ blok önce eşleşir: blok gövdesinde başka bir
// açılış etiketi bulunamaz (`(?!\{\{#)`). Boş döngüye karşı kararlılık için
// normalizeEden tarafı değişene kadar tekrarlar.
const BLOCK_RE = /\{\{#(if|unless)\s+([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}((?:(?!\{\{#).)*?)\{\{\/\1\}\}/gs;

function applyConditionals(input, vars) {
  let out = String(input ?? '');
  let prev = null;
  let guard = 0;
  while (out !== prev && guard++ < 25) {
    prev = out;
    out = out.replace(BLOCK_RE, (_m, kind, name, block) => {
      const truthy = Boolean(vars[name]);
      const keep = kind === 'if' ? truthy : !truthy;
      return keep ? block : '';
    });
  }
  return out;
}

function substitute(input, vars, escape) {
  return String(input ?? '').replace(VAR_RE, (_m, name) => {
    const value = vars[name];
    if (value === undefined || value === null) return '';
    return escape ? escapeHtml(value) : String(value);
  });
}

/**
 * Şablon metnini render eder.
 * - `escape: true`  → HTML gövde (varsayılan) — `{{x}}` kaçırılır.
 * - `escape: false` → başlık / href — düz metin.
 * Koşul blokları: `{{#if isWon}}…{{/if}}`, `{{#unless isLoss}}…{{/unless}}`.
 */
export function renderTemplate(input, vars = {}, { escape = true } = {}) {
  return substitute(applyConditionals(input, vars), vars, escape);
}

/** Şablon dokümanını (ya da ham alanlarını) tam bir HTML e-postaya çevirir. */
export function renderTemplateDocument({ subject, preheader = '', body, ctaLabel = '', ctaUrl = '' }, vars = {}, { siteName = '', lang = 'tr' } = {}) {
  const renderedCtaUrl = renderTemplate(ctaUrl, vars, { escape: false }).trim();
  let html = renderTemplate(body, vars);
  if (renderedCtaUrl) {
    const label = renderTemplate(ctaLabel, vars) || renderedCtaUrl;
    html += button(renderedCtaUrl, label);
    html += fallbackLink(renderedCtaUrl);
  }
  return {
    subject: renderTemplate(subject, vars, { escape: false }),
    html: layout({
      lang,
      siteName: siteName || 'VIP90.bet',
      preheader: renderTemplate(preheader, vars),
      body: html,
    }),
  };
}

/** Önizleme/örnek amaçlı gerçekçi değişken değerleri. */
export function buildSampleVars(event, overrides = {}) {
  const sample = {
    siteName: 'VIP90.bet',
    username: 'ayse_demo',
    supportEmail: SUPPORT_EMAIL,
    currentYear: String(new Date().getFullYear()),
    siteUrl: (process.env.CLIENT_URL || 'https://vip90.bet').split(',')[0].trim(),
    verifyUrl: `${(process.env.CLIENT_URL || 'https://vip90.bet').split(',')[0].trim()}/verify-email?token=demo-token`,
    expiresHours: 24,
    resetUrl: `${(process.env.CLIENT_URL || 'https://vip90.bet').split(',')[0].trim()}/reset-password?token=demo-token`,
    expiresMinutes: 60,
    changedAt: new Date().toISOString(),
    note: 'Belgeleriniz onaylandı.',
    betId: 'BET-10428',
    betStatus: 'won',
    isWon: true,
    isLost: false,
    isCancelled: false,
    stake: '250.00',
    potentialWin: '640.00',
    totalOdds: '2.56',
    payout: '640.00',
    selectionCount: 3,
    settledAt: new Date().toISOString(),
    gameTitle: 'Mines',
    netResult: '185.50',
    isProfit: true,
    isLoss: false,
    isEven: false,
    initialBalance: '1,200.00',
    finalBalance: '1,385.50',
    durationMinutes: 42,
    closedAt: new Date().toISOString(),
    amount: '500.00',
    balance: '1,700.00',
    method: 'USDT (TRC-20)',
    reference: 'TX-77a19c',
    completedAt: new Date().toISOString(),
    inactiveDays: 14,
    lastLoginAt: new Date(Date.now() - 14 * 864e5).toISOString(),
    currency: 'USD',
  };
  // Olaya özgü alanlar dışarıdan gelirse (ör. kayıp senaryosu önizlemesi) ezilir.
  return { ...sample, ...overrides, ...(event ? {} : {}) };
}

// ─── Varsayılan / demo içerikler ───────────────────────────────────────────

/**
 * Açılışta tohumlanan örnek şablonlar — kullanıcının istediği demo kapsamı:
 * aksiyona bağlı (doğrulama, bahis, casino oturumu, yatırım, çekim) ve zamana
 * duyarlı (hareketsiz kullanıcı, kampanya) kullanımların hepsi sayfada
 * düzenlenebilir halde hazır gelir.
 *
 * `isSystem: true` olanlar silinemez. Daha önce eklenmişse (admin düzenlemiş
 * olabilir) ÜZERİNE YAZILMAZ — yalnızca eksik olanlar eklenir.
 */
export const DEFAULT_TEMPLATES = [
  {
    event: 'user.emailVerify',
    category: CATEGORY_ACTION,
    isSystem: true,
    enabled: true,
    name: 'E-posta Doğrulama',
    subject: 'Email adresinizi doğrulayın',
    preheader: 'Hesabınızı aktifleştirmek için email adresinizi doğrulayın.',
    body: `<h1 class="m-h1">Hoş geldin, {{username}}! 🎉</h1>
<p class="m-p">{{siteName}}'e kaydın alındı. Hesabını aktifleştirmek ve giriş yapabilmek için email adresini doğrulaman yeterli.</p>
<p class="m-note">Bu bağlantı <strong>{{expiresHours}} saat</strong> geçerlidir.</p>`,
    ctaLabel: 'Emailimi Doğrula',
    ctaUrl: '{{verifyUrl}}',
  },
  {
    event: 'bet.settled',
    category: CATEGORY_ACTION,
    isSystem: true,
    enabled: true,
    name: 'Bahis Kazanma / Kaybetme Bildirimi',
    subject: '{{siteName}} — bahis sonucun',
    preheader: 'Bahisin sonuçlandı, detaylar e-postada.',
    body: `{{#if isWon}}<h1 class="m-h1">Tebrikler, kazandın! 🎉</h1>{{/if}}
{{#if isLost}}<h1 class="m-h1">Bahis bu kez tutmadı</h1>{{/if}}
{{#if isCancelled}}<h1 class="m-h1">Bahis iptal edildi</h1>{{/if}}
<p class="m-p">Merhaba {{username}}, {{selectionCount}} seçimli bahisin sonuçlandı. Özet:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 6px;">
  <tr><td class="m-note" style="padding:7px 0;">Bahis tutarı</td><td align="right" class="m-note" style="padding:7px 0;color:#c3cbdb;">{{stake}} {{currency}}</td></tr>
  <tr><td class="m-note" style="padding:7px 0;border-top:1px solid #1e2740;">Toplam oran</td><td align="right" class="m-note" style="padding:7px 0;border-top:1px solid #1e2740;color:#c3cbdb;">{{totalOdds}}</td></tr>
  <tr><td class="m-note" style="padding:7px 0;border-top:1px solid #1e2740;">Olası kazanç</td><td align="right" class="m-note" style="padding:7px 0;border-top:1px solid #1e2740;color:#c3cbdb;">{{potentialWin}} {{currency}}</td></tr>
  <tr><td class="m-note" style="padding:7px 0;border-top:1px solid #1e2740;">Hesabına işlenen</td><td align="right" class="m-note" style="padding:7px 0;border-top:1px solid #1e2740;color:#00d4ff;font-weight:bold;">{{payout}} {{currency}}</td></tr>
</table>
<p class="m-note">Bahis no: {{betId}}</p>`,
    ctaLabel: 'Bahislerimi Gör',
    ctaUrl: '{{siteUrl}}/profile?tab=bets',
  },
  {
    event: 'casino.sessionClosed',
    category: CATEGORY_ACTION,
    isSystem: true,
    enabled: true,
    name: 'Casino Oturum Kar / Zarar Bildirimi',
    subject: '{{siteName}} — {{gameTitle}} oturumun kapandı',
    preheader: 'Oturumunun kâr/zarar özeti.',
    body: `{{#if isProfit}}<h1 class="m-h1">Oturum kârda kapandı 🎉</h1>{{/if}}
{{#if isLoss}}<h1 class="m-h1">Oturum zararla kapandı</h1>{{/if}}
{{#if isEven}}<h1 class="m-h1">Oturum dengede kapandı</h1>{{/if}}
<p class="m-p">Merhaba {{username}}, {{gameTitle}} oturumun sona erdi. İşte oturum özeti:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 6px;">
  <tr><td class="m-note" style="padding:7px 0;">Başlangıç bakiyesi</td><td align="right" class="m-note" style="padding:7px 0;color:#c3cbdb;">{{initialBalance}} {{currency}}</td></tr>
  <tr><td class="m-note" style="padding:7px 0;border-top:1px solid #1e2740;">Kapanış bakiyesi</td><td align="right" class="m-note" style="padding:7px 0;border-top:1px solid #1e2740;color:#c3cbdb;">{{finalBalance}} {{currency}}</td></tr>
  <tr><td class="m-note" style="padding:7px 0;border-top:1px solid #1e2740;">Net sonuç</td><td align="right" class="m-note" style="padding:7px 0;border-top:1px solid #1e2740;color:#00d4ff;font-weight:bold;">{{netResult}} {{currency}}</td></tr>
  <tr><td class="m-note" style="padding:7px 0;border-top:1px solid #1e2740;">Süre</td><td align="right" class="m-note" style="padding:7px 0;border-top:1px solid #1e2740;color:#c3cbdb;">{{durationMinutes}} dk</td></tr>
</table>
<p class="m-note">Oturum kapanışı: {{closedAt}}</p>`,
    ctaLabel: 'Oyun Geçmişim',
    ctaUrl: '{{siteUrl}}/profile?tab=casino',
  },
  {
    event: 'wallet.depositCompleted',
    category: CATEGORY_ACTION,
    isSystem: true,
    enabled: true,
    name: 'Depozit (Yatırım) Bildirimi',
    subject: '{{siteName}} — yatırımın hesabına geçti',
    preheader: 'Yatırımın alındı ve bakiyene işlendi.',
    body: `<h1 class="m-h1">Yatırımın alındı ✅</h1>
<p class="m-p">Merhaba {{username}}, {{amount}} {{currency}} tutarındaki yatırımın hesabına işlendi. Artık oynamaya başlayabilirsin.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 6px;">
  <tr><td class="m-note" style="padding:7px 0;">Yöntem</td><td align="right" class="m-note" style="padding:7px 0;color:#c3cbdb;">{{method}}</td></tr>
  <tr><td class="m-note" style="padding:7px 0;border-top:1px solid #1e2740;">Tutar</td><td align="right" class="m-note" style="padding:7px 0;border-top:1px solid #1e2740;color:#c3cbdb;">{{amount}} {{currency}}</td></tr>
  <tr><td class="m-note" style="padding:7px 0;border-top:1px solid #1e2740;">Yeni bakiye</td><td align="right" class="m-note" style="padding:7px 0;border-top:1px solid #1e2740;color:#00d4ff;font-weight:bold;">{{balance}} {{currency}}</td></tr>
  <tr><td class="m-note" style="padding:7px 0;border-top:1px solid #1e2740;">İşlem no</td><td align="right" class="m-note" style="padding:7px 0;border-top:1px solid #1e2740;color:#c3cbdb;">{{reference}}</td></tr>
</table>
<p class="m-note">{{completedAt}}</p>`,
    ctaLabel: 'Bakiyemi Gör',
    ctaUrl: '{{siteUrl}}/profile?tab=wallet',
  },
  {
    event: 'wallet.withdrawalCompleted',
    category: CATEGORY_ACTION,
    isSystem: true,
    enabled: true,
    name: 'Para Çekme Bildirimi',
    subject: '{{siteName}} — çekimin tamamlandı',
    preheader: 'Çekim talebin tamamlandı.',
    body: `<h1 class="m-h1">Çekim tamamlandı</h1>
<p class="m-p">Merhaba {{username}}, {{amount}} {{currency}} tutarındaki çekimin gönderildi. Kalan bakiyen aşağıda.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 6px;">
  <tr><td class="m-note" style="padding:7px 0;">Yöntem</td><td align="right" class="m-note" style="padding:7px 0;color:#c3cbdb;">{{method}}</td></tr>
  <tr><td class="m-note" style="padding:7px 0;border-top:1px solid #1e2740;">Çekilen tutar</td><td align="right" class="m-note" style="padding:7px 0;border-top:1px solid #1e2740;color:#c3cbdb;">{{amount}} {{currency}}</td></tr>
  <tr><td class="m-note" style="padding:7px 0;border-top:1px solid #1e2740;">Kalan bakiye</td><td align="right" class="m-note" style="padding:7px 0;border-top:1px solid #1e2740;color:#00d4ff;font-weight:bold;">{{balance}} {{currency}}</td></tr>
  <tr><td class="m-note" style="padding:7px 0;border-top:1px solid #1e2740;">İşlem no</td><td align="right" class="m-note" style="padding:7px 0;border-top:1px solid #1e2740;color:#c3cbdb;">{{reference}}</td></tr>
</table>
<p class="m-note">{{completedAt}}</p>`,
    ctaLabel: 'İşlem Geçmişi',
    ctaUrl: '{{siteUrl}}/profile?tab=wallet',
  },
  {
    event: 'campaign.inactiveUsers',
    category: CATEGORY_SCHEDULED,
    isSystem: true,
    enabled: true,
    name: 'Hareketsiz Kullanıcı Hatırlatması',
    subject: '{{siteName}} — seni özledik, {{username}}',
    preheader: 'Hesabında seni bekleyen fırsatlar var.',
    audience: { type: 'inactive', inactiveDays: 14 },
    schedule: { enabled: false, intervalHours: 168 },
    body: `<h1 class="m-h1">Seni özledik, {{username}} 👋</h1>
<p class="m-p">{{siteName}} ailesi olarak {{inactiveDays}} gündür seni göremiyoruz. Hesabın hâlâ açık ve seni bekleyen fırsatlar var.</p>
<p class="m-note">Son girişin: {{lastLoginAt}}</p>`,
    ctaLabel: 'Hesabıma Git',
    ctaUrl: '{{siteUrl}}/',
  },
  {
    event: 'campaign.broadcast',
    category: CATEGORY_SCHEDULED,
    isSystem: true,
    enabled: true,
    name: 'Kampanya / Promosyon Tanıtımı',
    subject: '{{siteName}} — yeni kampanya',
    preheader: 'Yeni kampanyamızı kaçırmayın.',
    audience: { type: 'all' },
    body: `<h1 class="m-h1">Yeni kampanya başladı 🎁</h1>
<p class="m-p">Merhaba {{username}},</p>
<p class="m-p">{{siteName}}'de yeni bir kampanya başladı. Detaylar ve katılım koşulları için kampanya sayfamıza göz at.</p>
<p class="m-note">Bu e-postayı hesabındaki bildirim tercihlerinden değiştirebilirsin.</p>`,
    ctaLabel: 'Kampanyaları Gör',
    ctaUrl: '{{siteUrl}}/promotions',
  },
];

// ─── Cache ─────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30 * 1000;
const cache = new Map(); // event -> { doc, at }

export function invalidateMailTemplateCache(event = null) {
  if (event) cache.delete(event);
  else cache.clear();
}

/** `event` için şablonu çözer (30sn cache). Yoksa `null`. */
export async function getTemplateByEvent(event) {
  if (!event) return null;
  const now = Date.now();
  const hit = cache.get(event);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.doc;
  let doc = null;
  try {
    doc = await SystemMailTemplate.findOne({ event }).lean();
  } catch {
    return null;
  }
  cache.set(event, { doc, at: now });
  return doc;
}

// ─── Seed ──────────────────────────────────────────────────────────────────

/**
 * Eksik varsayılan şablonları ekler (var olanları asla ezmez).
 * Yeni bir olay kataloğa eklenirse diye her boot'ta çağrılır — maliyeti
 * yalnızca eksik kayıt sorgusudur.
 */
export async function ensureDefaultMailTemplates() {
  if (mongoose.connection?.readyState !== 1) return { inserted: 0 };
  const existing = await SystemMailTemplate.find({ event: { $in: DEFAULT_TEMPLATES.map(t => t.event) } })
    .select('event')
    .lean();
  const present = new Set(existing.map(t => t.event));
  const missing = DEFAULT_TEMPLATES.filter(t => !present.has(t.event));
  if (missing.length === 0) return { inserted: 0 };
  try {
    await SystemMailTemplate.insertMany(missing.map(t => ({ ...t, audience: t.audience, schedule: t.schedule })), { ordered: false });
  } catch (e) {
    if (e?.code !== 11000) throw e; // eşzamanlı boot — unique index yuttu, sorun değil
  }
  invalidateMailTemplateCache();
  return { inserted: missing.length };
}

// ─── CRUD ──────────────────────────────────────────────────────────────────

export async function listTemplates({ page = 1, limit = 20, search = '', category = '', enabled = null } = {}) {
  const skip = (Number(page) - 1) * Number(limit);
  const filter = {};
  if (category === CATEGORY_ACTION || category === CATEGORY_SCHEDULED) filter.category = category;
  if (enabled === true || enabled === false) filter.enabled = enabled;
  if (search && typeof search === 'string') {
    const trimmed = search.trim().slice(0, 100);
    if (trimmed) {
      const re = new RegExp(escapeStringRegexp(trimmed), 'i');
      filter.$or = [{ name: re }, { event: re }, { subject: re }];
    }
  }

  const [items, total, counts] = await Promise.all([
    SystemMailTemplate.find(filter).sort({ category: 1, createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    SystemMailTemplate.countDocuments(filter),
    SystemMailTemplate.aggregate([{ $group: { _id: { category: '$category', enabled: '$enabled' }, count: { $sum: 1 } } }]),
  ]);

  const stats = { total: 0, action: 0, scheduled: 0, enabled: 0, disabled: 0 };
  for (const g of counts) {
    stats.total += g.count;
    if (g._id.category === CATEGORY_ACTION) stats.action += g.count;
    else stats.scheduled += g.count;
    if (g._id.enabled) stats.enabled += g.count;
    else stats.disabled += g.count;
  }

  return {
    templates: items,
    total,
    page: Number(page),
    pages: Math.max(1, Math.ceil(Number(total) / Number(limit))),
    stats,
  };
}

export async function getTemplateById(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return SystemMailTemplate.findById(id).lean();
}

/**
 * Katalogdaki olayların listesi — panelde "yeni şablon" oluştururken seçim
 * sunar. `used` olanlar zaten atanmış (o olay için tek şablon hakkı vardır).
 */
export async function listEvents() {
  const rows = await SystemMailTemplate.find({ event: { $in: Object.keys(MAIL_EVENTS) } }).select('event name').lean();
  const used = new Map(rows.map(r => [r.event, r.name]));
  return Object.entries(MAIL_EVENTS).map(([event, meta]) => ({
    event,
    category: meta.category,
    variables: eventVariables(event),
    used: used.has(event) || null,
    usedBy: used.get(event) || null,
  }));
}

export async function createTemplate(data, adminId = null) {
  const category = eventCategory(data.event);
  if (!category) {
    const err = new Error('Bilinmeyen olay: ' + data.event);
    err.status = 400;
    err.code = 'MAIL_UNKNOWN_EVENT';
    throw err;
  }
  const exists = await SystemMailTemplate.findOne({ event: data.event }).select('_id').lean();
  if (exists) {
    const err = new Error('Bu olay için zaten bir şablon var');
    err.status = 409;
    err.code = 'MAIL_EVENT_TAKEN';
    throw err;
  }
  const [doc] = await SystemMailTemplate.create([{
    event: data.event,
    category,
    name: data.name,
    subject: data.subject,
    preheader: data.preheader || '',
    body: data.body,
    ctaLabel: data.ctaLabel || '',
    ctaUrl: data.ctaUrl || '',
    enabled: data.enabled !== false,
    isSystem: false,
    audience: data.audience,
    schedule: data.schedule,
    createdBy: adminId,
    updatedBy: adminId,
  }]);
  invalidateMailTemplateCache(doc.event);
  return doc.toObject();
}

export async function updateTemplate(id, data, adminId = null) {
  if (!mongoose.isValidObjectId(id)) return null;
  const doc = await SystemMailTemplate.findById(id);
  if (!doc) return null;

  const editable = ['name', 'subject', 'preheader', 'body', 'ctaLabel', 'ctaUrl', 'enabled', 'audience', 'schedule'];
  for (const field of editable) {
    if (data[field] !== undefined) doc[field] = data[field];
  }
  doc.updatedBy = adminId;
  await doc.save();
  invalidateMailTemplateCache(doc.event);
  return doc.toObject();
}

export async function deleteTemplate(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  const doc = await SystemMailTemplate.findById(id);
  if (!doc) return null;
  if (doc.isSystem) {
    const err = new Error('Sistem şablonu silinemez — yalnızca düzenlenebilir');
    err.status = 403;
    err.code = 'MAIL_SYSTEM_TEMPLATE';
    throw err;
  }
  await doc.deleteOne();
  invalidateMailTemplateCache(doc.event);
  return { id: doc._id, event: doc.event };
}

/** Şablon sayaçları (KPI şeridi). */
export async function getTemplateStats() {
  const [byCategory, logAgg] = await Promise.all([
    SystemMailTemplate.aggregate([{ $group: { _id: '$category', count: { $sum: 1 }, enabled: { $sum: { $cond: ['$enabled', 1, 0] } } } }]),
    SystemMailLog.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);
  const stats = { total: 0, action: 0, scheduled: 0, enabled: 0, sent: 0, failed: 0, logged: 0 };
  for (const g of byCategory) {
    stats.total += g.count;
    stats[g._id] = (stats[g._id] || 0) + g.count;
    stats.enabled += g.enabled;
  }
  for (const g of logAgg) {
    stats.logged += g.count;
    if (g._id === 'sent' || g._id === 'mock') stats.sent += g.count;
    if (g._id === 'failed') stats.failed += g.count;
  }
  return stats;
}

/** Gönderim geçmişi. */
export async function listLogs({ page = 1, limit = 20, templateId = null, status = '' } = {}) {
  const skip = (Number(page) - 1) * Number(limit);
  const filter = {};
  if (templateId && mongoose.isValidObjectId(templateId)) filter.templateId = templateId;
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    SystemMailLog.find(filter).sort({ sentAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    SystemMailLog.countDocuments(filter),
  ]);
  return {
    logs: items,
    total,
    page: Number(page),
    pages: Math.max(1, Math.ceil(Number(total) / Number(limit))),
  };
}
