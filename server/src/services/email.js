// Transactional email service — SMTP tabanlı.
// Production'da gerçek SMTP env'leri tanımlı olmalı.

import nodemailer from 'nodemailer';

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  if (!process.env.SMTP_HOST) return null;
  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    } : undefined,
  });
  return _transporter;
}

const TEMPLATES = {
  'verify-email': (data) => ({
    subject: 'Email adresinizi doğrulayın',
    html: `
      <h2>Hoş geldiniz, ${data.username}!</h2>
      <p>Hesabınızı aktifleştirmek için aşağıdaki bağlantıya tıklayın:</p>
      <p><a href="${data.verifyUrl}" style="background:#00d4ff;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Emailimi Doğrula</a></p>
      <p style="color:#888;font-size:12px;">Bu link 24 saat geçerlidir.</p>
    `,
  }),
  'password-reset': (data) => ({
    subject: 'Şifre sıfırlama',
    html: `
      <h2>Şifre sıfırlama talebi</h2>
      <p>Merhaba ${data.username}, şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın:</p>
      <p><a href="${data.resetUrl}" style="background:#00d4ff;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Şifremi Sıfırla</a></p>
      <p style="color:#888;font-size:12px;">Bu link 1 saat geçerlidir. Eğer bu talebi siz yapmadıysanız, bu emaili görmezden gelin.</p>
    `,
  }),
  'password-changed': (data) => ({
    subject: 'Şifreniz değiştirildi',
    html: `
      <h2>Şifre değişikliği bildirimi</h2>
      <p>Merhaba ${data.username}, hesabınızın şifresi başarıyla değiştirildi.</p>
      <p style="color:#888;font-size:12px;">Bu değişikliği siz yapmadıysanız hemen destek@vip90.bet adresinden bizimle iletişime geçin.</p>
    `,
  }),
  'welcome': (data) => ({
    subject: 'Hoş geldiniz!',
    html: `
      <h2>Hoş geldiniz, ${data.username}!</h2>
      <p>Hesabınız başarıyla oluşturuldu. İlk depozito bonusu için:</p>
      <p><a href="${data.depositUrl}" style="background:linear-gradient(90deg,#00d4ff,#7c3aed);color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">İlk Bonusunuzu Alın</a></p>
    `,
  }),
};

export async function sendEmail({ to, subject, template, data, html }) {
  const transporter = getTransporter();
  if (!transporter) {
    // SMTP yok — development mode'da console.log
    console.log(`📧 [EMAIL MOCK] → ${to} | ${subject}`);
    return { mock: true };
  }
  let body = { subject, html };
  if (template && TEMPLATES[template]) {
    body = TEMPLATES[template](data || {});
  }
  return transporter.sendMail({
    from: `"Bet Platform" <${process.env.SMTP_FROM || 'noreply@vip90.bet'}>`,
    to,
    subject: body.subject,
    html: body.html,
  });
}