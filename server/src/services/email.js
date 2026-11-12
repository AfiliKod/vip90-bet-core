// Transactional email service — iki gönderme mekanizması: Mailtrap Email API
// (token) ve genel SMTP (nodemailer). Hangisi olduğunu emailConfig.resolveEmailMode
// seçer. Production'da sağlayıcı env'lerinden en az biri tanımlı olmalı.

import nodemailer from 'nodemailer';
import { MailtrapClient } from 'mailtrap';
import mongoose from 'mongoose';
import { getSiteName } from '../branding/index.js';
import { emailConfig, emailEnvView, resolveEmailMode } from '../config/emailConfig.js';
import { isSuppressedRecipient } from '../config/mailSuppression.js';
import { getTenantBaseUrl } from '../tenancy/tenantBaseUrl.js';
import { getCurrentTenantId } from '../tenancy/context.js';
import { getTenancyMode } from '../config/tenancy.js';

const DEFAULT_FROM = 'noreply@vip90.bet';

// Transporter & Mailtrap client pools keyed by tenantId (spec §4.5, İP-4 Task 7).
// Changing a tenant's settings invalidates that tenant's pool entry without
// affecting other tenants' active connections.
const transporterPool = new Map();
const mailtrapPool = new Map();

let _createTransport = (opts) => nodemailer.createTransport(opts);
let _createMailtrapClient = (opts) => new MailtrapClient(opts);

/** Testler için: gerçek SMTP yerine sahte transport. */
export function _setCreateTransport(fn) {
  _createTransport = fn || ((opts) => nodemailer.createTransport(opts));
  transporterPool.clear();
}

/** Testler için: gerçek Mailtrap API'si yerine sahte client. */
export function _setCreateMailtrapClient(fn) {
  _createMailtrapClient = fn || ((opts) => new MailtrapClient(opts));
  mailtrapPool.clear();
}

/** Testler için: tüm transporter havuzunu ve sahte istemcileri sıfırlar. */
export function _resetEmailTransportersForTests() {
  transporterPool.clear();
  mailtrapPool.clear();
  _createTransport = (opts) => nodemailer.createTransport(opts);
  _createMailtrapClient = (opts) => new MailtrapClient(opts);
}

function getPoolKey(tenantId) {
  if (tenantId) return String(tenantId);
  return 'default';
}

function getSmtpTransporter(tenantKey, gatewayOn, c) {
  const signature = JSON.stringify([gatewayOn, c.host, c.port, c.secure, c.user, c.pass]);
  const existing = transporterPool.get(tenantKey);
  if (!existing || existing.signature !== signature) {
    const transporter = _createTransport({
      host: c.host,
      port: parseInt(c.port || '587', 10),
      secure: c.secure === 'true',
      auth: c.user ? { user: c.user, pass: c.pass } : undefined,
    });
    transporterPool.set(tenantKey, { transporter, signature });
    return transporter;
  }
  return existing.transporter;
}

function getMailtrapClient(tenantKey, gatewayOn, c) {
  const sandbox = c.useSandbox === 'true';
  const testInboxId = parseInt(c.sandboxInboxId || '', 10) || 0;
  if (sandbox && !testInboxId) {
    const err = new Error('Mailtrap Sandbox açık ama Sandbox inbox ID tanımlı değil (MAILTRAP_INBOX_ID)');
    err.code = 'MAILTRAP_SANDBOX_INBOX_MISSING';
    throw err;
  }
  // Sandbox↔canlı anahtarı imzada: taban URL değişir
  // (sandbox.api.mailtrap.io / send.api.mailtrap.io), örneği yeniden kurmak şart.
  const signature = JSON.stringify([gatewayOn, sandbox, testInboxId, c.token]);
  const existing = mailtrapPool.get(tenantKey);
  if (!existing || existing.signature !== signature) {
    if (sandbox) {
      // Sessiz tuzak: Sandbox açıksayken hiçbir gerçek alıcıya mail çıkmaz.
      console.warn(`📧 [Mailtrap] SANDBOX modu açık (inbox ${testInboxId}) — mailler yalnız Sandbox'a gidiyor, gerçek kullanıcılara ulaşmıyor.`);
    }
    const client = _createMailtrapClient(
      sandbox
        ? { token: c.token, sandbox: true, testInboxId }
        : { token: c.token },
    );
    mailtrapPool.set(tenantKey, { client, signature });
    return client;
  }
  return existing.client;
}

/**
 * Etkin gönderici. `mode` değerleri: 'mailtrap' (API), 'smtp' (nodemailer),
 * 'none' (ikisi de tanımsız → çağıran mock'a düşer). Email Gateway anahtarı
 * imzanın parçasıdır: anahtar değişince kaynak (DB/env) değişir, aynı
 * değerlerle bile gönderici yeniden kurulur.
 *
 * Çok kiracılı modda (TENANCY_MODE=multi): DB'de ayar yoksa 'none' döner,
 * asla sunucu ortam değişkenlerine (.env) düşmez.
 * Tek modda: DB yoksa eskisi gibi .env'e düşer.
 */
export async function getSender(opts = {}) {
  const options = typeof opts === 'object' && opts !== null && !(opts instanceof mongoose.Types.ObjectId) && !opts._bsontype
    ? opts
    : { tenantId: opts };
  const effectiveTenantId = options.tenantId !== undefined ? options.tenantId : getCurrentTenantId();
  const tenantKey = getPoolKey(effectiveTenantId);

  const all = await emailConfig.getAll({ tenantId: effectiveTenantId });
  const isMulti = getTenancyMode() === 'multi';
  const gatewayOn = all.gatewayEnabled !== 'false';
  const c = (!isMulti && !gatewayOn) ? emailEnvView() : (gatewayOn ? all : {});
  const mode = resolveEmailMode(c);
  const base = { mode, from: c.from, fromName: c.fromName, useSandbox: c.useSandbox };
  if (mode === 'none') return { ...base, sender: null };
  if (mode === 'mailtrap') return { ...base, sender: getMailtrapClient(tenantKey, gatewayOn, c) };
  return { ...base, sender: getSmtpTransporter(tenantKey, gatewayOn, c) };
}

/**
 * From görünümü: `{ name, email }`. `fromName` panelde tanımlıysa site adını
 * ezer (operatörün sender identity tercihi), tanımlı değilse davranış
 * eskisiyle aynı kalır.
 */
export function fromParts(fromName, siteName, from) {
  const name = (fromName || siteName || '').replace(/["\\]/g, '');
  return { name, email: from || DEFAULT_FROM };
}

/**
 * From başlığı: `"Görünen Ad" <adres>` (SMTP düz string biçimi).
 */
export function formatFrom(fromName, siteName, from) {
  const { name, email } = fromParts(fromName, siteName, from);
  return name ? `"${name}" <${email}>` : `<${email}>`;
}

/** Mekanizmaya göre mesaj gövdesi: Mailtrap API nesne ister, SMTP düz string. */
function buildMail({ mode, fromName, siteName, from, to, subject, html }) {
  if (mode === 'mailtrap') {
    const { name, email } = fromParts(fromName, siteName, from);
    return {
      from: name ? { email, name } : { email },
      to: [{ email: to }],
      subject,
      html,
    };
  }
  return { from: formatFrom(fromName, siteName, from), to, subject, html };
}

// ─── Ortak mail görünümü (mail-güvenli: tablo tabanlı, inline CSS) ──────────
export const FONT = 'Arial,Helvetica,sans-serif';
// E-posta domaini gerçek, teslim edilebilir bir adres olmalı — kozmetik marka
// adından (siteName) BİLEREK bağımsız tutulur, SMTP_FROM ile aynı desende
// env'den okunur (aşağıdaki 'noreply@vip90.bet' fallback'iyle tutarlı).
export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'destek@vip90.bet';

// Bulletproof CTA butonu — bgcolor fallback'li, Outlook dahil çalışır.
export function button(url, label, bg = '#00d4ff', fg = '#04121a') {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px auto;">
      <tr>
        <td align="center" bgcolor="${bg}" style="border-radius:10px;">
          <a href="${url}" target="_blank" style="display:inline-block;padding:14px 34px;font-family:${FONT};font-size:16px;font-weight:bold;line-height:1;color:${fg};text-decoration:none;border-radius:10px;">${label}</a>
        </td>
      </tr>
    </table>`;
}

// Buton açılmazsa diye düz-metin yedek link (kesilmeden).
export function fallbackLink(url) {
  return `<p style="margin:22px 0 0;font-family:${FONT};font-size:12px;line-height:1.7;color:#8b97ad;">Buton çalışmıyorsa bu bağlantıyı tarayıcınıza kopyalayın:<br><span style="color:#00d4ff;word-break:break-all;">${url}</span></p>`;
}

// Tüm mailleri saran çerçeve: neon şerit + marka wordmark'ı (admin panelinden
// ayarlanan siteName) + kart + footer.
export function layout({ preheader = '', body, siteName = 'VIP90.bet', lang = 'tr' }) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<style>
.m-h1{margin:18px 0 10px;font-family:${FONT};font-size:22px;font-weight:700;color:#ffffff;}
.m-p{margin:0 0 6px;font-family:${FONT};font-size:15px;line-height:1.7;color:#c3cbdb;}
.m-note{margin:0;font-family:${FONT};font-size:13px;color:#8b97ad;}
</style>
</head>
<body style="margin:0;padding:0;background:#0a0d16;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;color:#0a0d16;">${preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0d16;">
    <tr><td align="center" style="padding:32px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">
        <tr><td style="height:4px;background:#00d4ff;background:linear-gradient(90deg,#00d4ff,#7c3aed);border-radius:12px 12px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td align="center" style="background:#12182a;padding:30px 24px 6px;">
          <div style="font-family:${FONT};font-size:26px;font-weight:800;color:#ffffff;letter-spacing:.5px;">
            <span style="font-size:28px;">💎</span> ${siteName}
          </div>
        </td></tr>
        <tr><td style="background:#12182a;padding:6px 32px 34px;font-family:${FONT};color:#e8edf7;">
          ${body}
        </td></tr>
        <tr><td align="center" style="background:#0d1220;padding:20px 24px;border-radius:0 0 12px 12px;">
          <p style="margin:0 0 6px;font-family:${FONT};font-size:12px;color:#6b7488;">Bu otomatik bir e-postadır, lütfen yanıtlamayın.</p>
          <p style="margin:0;font-family:${FONT};font-size:12px;color:#6b7488;">© ${year} ${siteName}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export const H1 = `margin:18px 0 10px;font-family:${FONT};font-size:22px;font-weight:700;color:#ffffff;`;
export const P  = `margin:0 0 6px;font-family:${FONT};font-size:15px;line-height:1.7;color:#c3cbdb;`;
export const NOTE = `margin:0;font-family:${FONT};font-size:13px;color:#8b97ad;`;

const TEMPLATES = {
  'verify-email': (data) => ({
    subject: 'Email adresinizi doğrulayın',
    html: layout({
      siteName: data.siteName,
      preheader: 'Hesabını aktifleştirmek için email adresini doğrula.',
      body: `
        <h1 style="${H1}">Hoş geldin, ${data.username}! 🎉</h1>
        <p style="${P}">${data.siteName}'e kaydın alındı. Hesabını aktifleştirmek ve giriş yapabilmek için email adresini doğrulaman yeterli.</p>
        ${button(data.verifyUrl, 'Emailimi Doğrula')}
        <p style="${NOTE}">Bu bağlantı <strong style="color:#c3cbdb;">24 saat</strong> geçerlidir.</p>
        ${fallbackLink(data.verifyUrl)}
      `,
    }),
  }),
  'password-reset': (data) => ({
    subject: 'Şifre sıfırlama',
    html: layout({
      siteName: data.siteName,
      preheader: 'Şifreni sıfırlamak için bağlantı.',
      body: `
        <h1 style="${H1}">Şifre sıfırlama talebi</h1>
        <p style="${P}">Merhaba ${data.username}, hesabının şifresini sıfırlamak için aşağıdaki butona tıkla.</p>
        ${button(data.resetUrl, 'Şifremi Sıfırla')}
        <p style="${NOTE}">Bu bağlantı <strong style="color:#c3cbdb;">1 saat</strong> geçerlidir.</p>
        <p style="${NOTE}margin-top:8px;">Bu talebi sen yapmadıysan bu e-postayı yok sayabilirsin; şifren değişmeden kalır.</p>
        ${fallbackLink(data.resetUrl)}
      `,
    }),
  }),
  'password-changed': (data) => ({
    subject: 'Şifreniz değiştirildi',
    html: layout({
      siteName: data.siteName,
      preheader: 'Hesap şifren başarıyla değiştirildi.',
      body: `
        <h1 style="${H1}">Şifren değiştirildi</h1>
        <p style="${P}">Merhaba ${data.username}, hesabının şifresi başarıyla güncellendi.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0;">
          <tr><td style="background:#2a1420;border-left:3px solid #ff5a7a;border-radius:6px;padding:14px 16px;font-family:${FONT};font-size:13px;line-height:1.7;color:#f2c9d3;">
            Bu değişikliği <strong>siz yapmadıysanız</strong>, hesabınız risk altında olabilir. Hemen <a href="mailto:${SUPPORT_EMAIL}" style="color:#00d4ff;text-decoration:none;">${SUPPORT_EMAIL}</a> ile iletişime geçin.
          </td></tr>
        </table>
      `,
    }),
  }),
  'welcome': (data) => ({
    subject: 'Hoş geldiniz!',
    html: layout({
      siteName: data.siteName,
      preheader: 'İlk depozito bonusun seni bekliyor.',
      body: `
        <h1 style="${H1}">Hoş geldin, ${data.username}! 🎉</h1>
        <p style="${P}">Hesabın başarıyla oluşturuldu. İlk depozito bonusunu almak için hazırsan başlayalım.</p>
        ${button(data.depositUrl, 'İlk Bonusunu Al', '#7c3aed', '#ffffff')}
        <p style="${NOTE}">Bol şans! 🍀</p>
      `,
    }),
  }),
};

/**
 * Gömülü (kodda tanımlı) şablonu HTML'e çevirir — `sendEmail` göndermeden önce
 * içerik üretmek isteyen çağıranlar (ör. systemMail'in yolu) için.
 * Şablon yoksa `null` döner.
 */
export async function renderBuiltinTemplate(template, data = {}, opts = {}) {
  if (!TEMPLATES[template]) return null;
  const options = typeof opts === 'object' && opts !== null && !(opts instanceof mongoose.Types.ObjectId) && !opts._bsontype
    ? opts
    : { tenantId: opts };
  const effectiveTenantId = options.tenantId !== undefined ? options.tenantId : getCurrentTenantId();
  const siteName = await getSiteName();
  let siteUrl = '';
  try {
    siteUrl = await getTenantBaseUrl(effectiveTenantId);
  } catch {
    siteUrl = '';
  }
  const depositUrl = data?.depositUrl || (siteUrl ? `${siteUrl}/deposit` : '/deposit');
  return TEMPLATES[template]({ siteUrl, depositUrl, ...(data || {}), siteName });
}

export async function sendEmail({ to, subject, template, data, html, tenantId } = {}) {
  const effectiveTenantId = tenantId !== undefined ? tenantId : getCurrentTenantId();
  // Demo/seed ve ayrik TLDli adreslere hicbir sey gonderilmez — saglayiciya
  // emisyon bile gitmez (Delivery Logs'ta 'enqueued' satiri uretmez).
  // `mock: true` korunur: dev'de dogrulama/sifirlama linki yine doner.
  if (isSuppressedRecipient(to)) {
    console.log(`📧 [EMAIL SUPPRESSED] → ${to} | ${subject || template || '(şablon)'}`);
    return { mock: true, suppressed: true };
  }
  const { mode, sender, from, fromName } = await getSender({ tenantId: effectiveTenantId });
  const siteName = await getSiteName();
  let siteUrl = '';
  try {
    siteUrl = await getTenantBaseUrl(effectiveTenantId);
  } catch {
    siteUrl = '';
  }
  let body = { subject, html };
  if (template && TEMPLATES[template]) {
    const depositUrl = data?.depositUrl || (siteUrl ? `${siteUrl}/deposit` : '/deposit');
    body = TEMPLATES[template]({ siteUrl, depositUrl, ...(data || {}), siteName });
  }
  if (!sender) {
    // Sağlayıcı yok — development mode'da console.log + linki bas
    console.log(`📧 [EMAIL MOCK] → ${to} | ${body.subject}`);
    const link = data?.verifyUrl
      || data?.resetUrl
      || (typeof body.html === 'string' ? (body.html.match(/https?:\/\/[^\s"'<>]+/) || [])[0] : null);
    if (link) console.log(`   🔗 ${link}`);
    return { mock: true, verifyUrl: data?.verifyUrl, resetUrl: data?.resetUrl };
  }
  const mail = buildMail({ mode, fromName, siteName, from, to, subject: body.subject, html: body.html });
  return mode === 'mailtrap' ? sender.send(mail) : sender.sendMail(mail);
}

/**
 * Panelden "test e-postası": hiçbir sağlayıcı tanımlı DEĞİLSE mock'a düşmez,
 * hata fırlatır (aksi halde admin yanlış bir "gönderildi" izlenimi alırdı).
 */
export async function sendTestEmail(to, opts = {}) {
  const options = typeof opts === 'object' && opts !== null && !(opts instanceof mongoose.Types.ObjectId) && !opts._bsontype
    ? opts
    : { tenantId: opts };
  const tenantId = options.tenantId;

  if (isSuppressedRecipient(to)) {
    // Panelden test: 'gönderildi' izlenimi verme — bu adrese gönderilmez.
    const err = new Error(`Bu adrese mail gönderilmiyor (baskılanmış domain): ${to}`);
    err.code = 'MAIL_RECIPIENT_SUPPRESSED';
    throw err;
  }
  const { mode, sender, from, fromName } = await getSender({ tenantId });
  if (!sender) {
    const err = new Error('E-posta sağlayıcısı tanımlı değil (Mailtrap token veya SMTP host)');
    err.code = 'MAIL_PROVIDER_NOT_CONFIGURED';
    throw err;
  }
  const siteName = await getSiteName();
  const mail = buildMail({
    mode,
    fromName,
    siteName,
    from,
    to,
    subject: `${siteName} - ${mode === 'mailtrap' ? 'Mailtrap' : 'SMTP'} test`,
    html: layout({
      siteName,
      preheader: 'Sağlayıcı testi',
      body: `<p style="font-family:${FONT};font-size:15px;color:#e6ebf5;">E-posta sağlayıcısı (${mode === 'mailtrap' ? 'Mailtrap Email API' : 'SMTP'}) çalışıyor.</p>`,
    }),
  });
  return mode === 'mailtrap' ? sender.send(mail) : sender.sendMail(mail);
}
