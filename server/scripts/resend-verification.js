#!/usr/bin/env node
/**
 * Aksaklık telafisi: doğrulama maili gitmemiş kullanıcılara doğrulama linkini
 * yeniden gönder.
 *
 * 2026-10-20 → 2026-10-30 arası production e-postası Mailgun SMTP'sinde
 * `535 Authentication failed` ile tamamen durmuştu (PR #212 Mailtrap Email
 * API'ye geçirdi). O pencerede kaydolup doğrulama maili almayan oyuncular
 * giriş yapamıyor (login kapısı `EMAIL_NOT_VERIFIED`, controllers/auth.js).
 *
 * Kullanım:
 *   node scripts/resend-verification.js --dry-run
 *       → yalnız sayı + domain/ay kovaları basar, HİÇ mail göndermez, HİÇ
 *         token üretmez (kullanıcı kayıtlarına dokunmaz).
 *   node scripts/resend-verification.js --yes
 *       → gerçek gönderim. NODE_ENV=production'da --yes zorunludur.
 *   Seçenekler:
 *     --since <tarih>   varsayılan 2026-10-20 (aksaklığın başladığı gün)
 *     --until <tarih>   varsayılan bugün
 *     --limit <N>       bu koşuda en fazla N kullanıcı (varsayılan:
 *                       MAIL_SEND_BATCH_LIMIT tavanı, bkz. systemMail.getBatchLimit)
 *     --parallel <N>    eşzamanlı gönderim, varsayılan 4
 *     --exclude-domain a.com,b.com   dry-run'de görülen istenmeyen domainleri çıkar
                       (uygulamanın baskılama listesi her koşulda ayrıca geçerli)
 *
 * Gönderim kaydı: `sendActionMail('user.emailVerify')` her maili
 * `SystemMailLog`a yazar (sent/mock/failed) → panelde Communications →
 * gönderim günlüğü ve Mailtrap Email Logs'tan izlenir.
 */
import crypto from 'node:crypto';
import { hashToken } from '../src/utils/tokenHash.js';
import { pathToFileURL } from 'node:url';
import { SERVER_ENV_FILE } from './lib/env.mjs'; // import, sunucu env'ini yukler

/**
 * Uygulamanın kendisiyle AYNI env dosyası: `server/.env` (app.js:9).
 * `import 'dotenv/config'` cwd'ye bakardı — deploy kökünden
 * (`node server/scripts/...`, belgelenen çağrı) koşulursa bayat
 * `public_html/.env` yüklenir ve içindeki ölü SMTP credentials kullanılırdı.
 */
export function resolveEnvFile() {
  return SERVER_ENV_FILE;
}

import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import User from '../src/models/User.js';
import { sendActionMail, getBatchLimit } from '../src/services/systemMail.js';
import { renderBuiltinTemplate } from '../src/services/email.js';
import { emailConfig, resolveEmailMode } from '../src/config/emailConfig.js';
import { isSuppressedRecipient, suppressedEmailDomains } from '../src/config/mailSuppression.js';

// controllers/auth.js'deki `EMAIL_VERIFY_TTL_HOURS` ile aynı olmalı — link
// süresi kayıtla aynı varsayılır; test bu eşitliği kilitler (drift yasak).
const EMAIL_VERIFY_TTL_HOURS = 24;
// Aksaklığın başladığı gün (journal: ilk 535 2026-10-20 05:21 CET).
const DEFAULT_SINCE = '2026-10-20';
/** Kayıt origin'ini linkte kullan: CLIENT_URL virgülle ayrılmış çoklu origin, ilk adres canonical. */
export function buildVerifyOrigin(env = process.env) {
  return String(env.CLIENT_URL || '').split(',')[0].trim().replace(/\/+$/, '');
}

/**
 * Uygulamanın baskılama kuralı (`config/mailSuppression`) + koşuya özel
 * `--exclude-domain` listesi. Adresi bozuk kayıtlar da burada elenir.
 */
export function isInternalDomain(email, extraDomains = []) {
  const value = String(email || '').trim().toLowerCase();
  if (!value.includes('@')) return true; // adresi bozuk kayda mail gönderilmez
  return isSuppressedRecipient(value, [...suppressedEmailDomains(), ...extraDomains]);
}

/** dry-run ve gönderimin paylaştığı tek seçim filtresi. */
export function selectionFilter({ since, until, extraDomains = [] } = {}) {
  return {
    emailVerified: { $ne: true },
    deletedAt: null,
    isBot: { $ne: true },
    email: { $exists: true, $ne: '' },
    createdAt: { $gte: new Date(since), $lt: new Date(until) },
  };
}

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : fallback;
}

const buckets = async (rows) => {
  const byDomain = new Map();
  const byMonth = new Map();
  let total = 0;
  for (const u of rows) {
    total += 1;
    const domain = String(u.email).toLowerCase().split('@')[1] || '?';
    byDomain.set(domain, (byDomain.get(domain) || 0) + 1);
    const month = new Date(u.createdAt).toISOString().slice(0, 7);
    byMonth.set(month, (byMonth.get(month) || 0) + 1);
  }
  return { total, byDomain, byMonth };
};

const mapLimit = async (items, limit, worker) => {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const confirmed = process.argv.includes('--yes');
  const since = arg('since', DEFAULT_SINCE);
  const until = arg('until', new Date().toISOString());
  const extraDomains = String(arg('exclude-domain', '')).split(',').map(s => s.trim()).filter(Boolean);

  // Onay kapisi DB baglanmadan once: yanlislikla calistirilan bir kosu
  // production'a hicbir sey yazmasin, hatta baglanti açmasin.
  if (!dryRun && !confirmed) {
    console.error('\nRET: gerçek gönderim için --yes gerekli (geri alınamaz). Ölçmek için önce --dry-run.');
    return 1;
  }

  const filter = selectionFilter({ since, until });
  await connectDB();

  const all = await User.find(filter).select('email username createdAt').lean();
  const targets = all.filter(u => !isInternalDomain(u.email, extraDomains));
  const skippedInternal = all.length - targets.length;

  const cap = Number(arg('limit', getBatchLimit()));
  const selected = Number.isFinite(cap) && cap > 0 ? targets.slice(0, cap) : targets;

  console.log(`Aralık      : ${since} → ${until}`);
  console.log(`Seçim       : emailVerified != true, silinmemiş, bot değil, baskılanmış domainler hariç (${skippedInternal} kayıt iç/demo domain → atlandı)`);
  if (extraDomains.length) console.log(`Ek hariç    : ${extraDomains.join(', ')}`);
  console.log(`Hedef       : ${targets.length} kullanıcı, bu koşuda en fazla ${selected.length} tanesi (limit ${cap})`);

  const { byDomain, byMonth } = await buckets(selected.map(u => ({ email: u.email, createdAt: u.createdAt })));
  console.log('--- domain kovaları ---');
  for (const [d, n] of [...byDomain.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${d.padEnd(30)} ${n}`);
  console.log('--- ay kovaları ---');
  for (const [m, n] of [...byMonth.entries()].sort()) console.log(`  ${m}  ${n}`);

  if (dryRun) {
    console.log('\nDRY-RUN — hiç token üretilmedi, hiç mail gönderilmedi. Göndermek için: --yes');
    return 0;
  }

  // Sessiz tuzak: sağlayıcı çözülmezse (token/SMTP yok) sendEmail mock'a düşer
  // ve yüzlerce "başarılı" log üretirdi. Gönderime başlamadan önce düş.
  const mode = resolveEmailMode(await emailConfig.getAll());
  if (mode === 'none') {
    console.error('\nRET: e-posta sağlayıcısı çözümlenemedi (MAILTRAP_TOKEN/SMTP_PROVIDER yok) — gönderim mock\'a düşerdi.');
    return 1;
  }

  const origin = buildVerifyOrigin();
  if (!/^https?:\/\//i.test(origin)) {
    console.error(`\nRET: CLIENT_URL kanonik origin çözümlenemedi ("${origin}") — linkte yanlış host riski.`);
    return 1;
  }
  console.log(`\nGönderim   : mod ${mode}, link origin ${origin}, TTL ${EMAIL_VERIFY_TTL_HOURS}s`);

  let sent = 0, failed = 0, mocked = 0;
  const startedAt = Date.now();
  const out = await mapLimit(selected, Number(arg('parallel', 4)) || 1, async (u) => {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + EMAIL_VERIFY_TTL_HOURS * 3600 * 1000);
    await User.updateOne(
      { _id: u._id },
      { $set: { emailVerificationToken: hashToken(token), emailVerificationExpires: expires } },
    );
    const verifyUrl = `${origin}/verify-email?token=${token}`;
    const res = await sendActionMail('user.emailVerify', {
      user: u,
      to: u.email,
      vars: { verifyUrl, expiresHours: EMAIL_VERIFY_TTL_HOURS },
      fallback: () => renderBuiltinTemplate('verify-email', { username: u.username, verifyUrl }),
    });
    return res?.status;
  });
  for (const status of out) {
    if (status === 'sent') sent += 1;
    else if (status === 'mock') mocked += 1;
    else failed += 1;
  }
  console.log(`\nBitti      : sent ${sent}, mock ${mocked}, failed/skipped ${failed}, süre ${Math.round((Date.now() - startedAt) / 1000)}sn`);
  console.log('Denetim    : SystemMailLog kayıtları (panel → Communications → gönderim günlüğü) + Mailtrap Email Logs.');
  return mocked > 0 ? 1 : 0;
}

// Yalnız CLI olarak koştuğunda gönder — test import'ları yan etki yapmasın.
const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  try {
    const code = await main();
    await mongoose.disconnect();
    process.exitCode = code;
  } catch (e) {
    console.error('resend-verification hatası:', e.message);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  }
}
