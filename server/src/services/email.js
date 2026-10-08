// Transactional email service — SMTP tabanlı.
// Production'da gerçek SMTP env'leri tanımlı olmalı.

import nodemailer from 'nodemailer';
import { getSiteName } from '../branding/index.js';
import { emailConfig, emailEnvView } from '../config/emailConfig.js';

// Transport, ayarlar (host/port/secure/user/pass) değişince yeniden kurulur:
// imza değişmediği sürece aynı örnek yeniden kullanılır. Ayar kaynağı:
// Email Gateway AÇIK → DB > env, KAPALI → yalnız sunucu .env (emailEnvView).
let _transporter = null;
let _signature = null;
let _createTransport = (opts) => nodemailer.createTransport(opts);

/** Testler için: gerçek SMTP yerine sahte transport. */
export function _setCreateTransport(fn) {
  _createTransport = fn || ((opts) => nodemailer.createTransport(opts));
  _transporter = null;
  _signature = null;
}

async function getTransporter() {
  const all = await emailConfig.getAll();
  // Modules → Email Gateway kartındaki anahtar: kapalıysa paneldeki DB
  // değerleri girmez, transport yalnızca sunucu .env SMTP'sine kurulur.
  const gatewayOn = all.gatewayEnabled !== 'false';
  const c = gatewayOn ? all : emailEnvView();
  if (!c.host) {
    _transporter = null;
    _signature = null;
    return { transporter: null, from: c.from, fromName: c.fromName };
  }
  // Mod da imzanın parçası: anahtar değişince DB/env kaynağı değişir,
  // aynı host değeriyle bile olsa transport yeniden kurulur.
  const signature = JSON.stringify([gatewayOn, c.host, c.port, c.secure, c.user, c.pass]);
  if (!_transporter || signature !== _signature) {
    _transporter = _createTransport({
      host: c.host,
      port: parseInt(c.port || '587', 10),
      secure: c.secure === 'true',
      auth: c.user ? { user: c.user, pass: c.pass } : undefined,
    });
    _signature = signature;
  }
  return { transporter: _transporter, from: c.from, fromName: c.fromName };
}

/**
 * From başlığı: `"Görünen Ad" <adres>`. `fromName` panelde tanımlıysa site
 * adını ezer (operatörün sender identity tercihi), tanımlı değilse davranış
 * eskisiyle aynı kalır.
 */
export function formatFrom(fromName, siteName, from) {
  const name = (fromName || siteName || '').replace(/["\\]/g, '');
  const addr = from || 'noreply@vip90.bet';
  return name ? `"${name}" <${addr}>` : `<${addr}>`;
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
export async function renderBuiltinTemplate(template, data = {}) {
  if (!TEMPLATES[template]) return null;
  const siteName = await getSiteName();
  return TEMPLATES[template]({ ...(data || {}), siteName });
}

export async function sendEmail({ to, subject, template, data, html }) {
  const { transporter, from, fromName } = await getTransporter();
  const siteName = await getSiteName();
  let body = { subject, html };
  if (template && TEMPLATES[template]) {
    body = TEMPLATES[template]({ ...(data || {}), siteName });
  }
  if (!transporter) {
    // SMTP yok — development mode'da console.log + linki bas
    console.log(`📧 [EMAIL MOCK] → ${to} | ${body.subject}`);
    const link = data?.verifyUrl
      || data?.resetUrl
      || (typeof body.html === 'string' ? (body.html.match(/https?:\/\/[^\s"'<>]+/) || [])[0] : null);
    if (link) console.log(`   🔗 ${link}`);
    return { mock: true, verifyUrl: data?.verifyUrl, resetUrl: data?.resetUrl };
  }
  return transporter.sendMail({
    from: formatFrom(fromName, siteName, from),
    to,
    subject: body.subject,
    html: body.html,
  });
}

/**
 * Panelden "test e-postası": SMTP tanımlı DEĞİLSE mock'a düşmez, hata fırlatır
 * (aksi halde admin yanlış bir "gönderildi" izlenimi alırdı).
 */
export async function sendTestEmail(to) {
  const { transporter, from, fromName } = await getTransporter();
  if (!transporter) {
    const err = new Error('SMTP sunucusu tanımlı değil');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }
  const siteName = await getSiteName();
  return transporter.sendMail({
    from: formatFrom(fromName, siteName, from),
    to,
    subject: `${siteName} - SMTP test`,
    html: layout({ siteName, preheader: 'SMTP test', body: `<p style="font-family:${FONT};font-size:15px;color:#e6ebf5;">SMTP ayarları çalışıyor.</p>` }),
  });
}
