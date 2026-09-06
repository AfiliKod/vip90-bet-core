// Alert webhook — critical/error olaylarını dış webhook'a gönderir.
// (Slack, Discord, Microsoft Teams, generic webhook)
// Phase C3
//
// Konfigürasyon admin panelinden (DB) ya da .env'den gelir — bkz services/settings.js.
import { getSetting } from './settings.js';
import { getSiteName } from '../branding/index.js';

const THROTTLE = {
  CRITICAL: { windowMs: 60 * 1000, max: 100 },      // her dakika max 100
  ERROR:    { windowMs: 5 * 60 * 1000, max: 1 },     // her 5 dakika max 1
  WARN:     { windowMs: 60 * 60 * 1000, max: 1 },   // her saat max 1
};

const _lastSent = new Map();

function shouldSend(level, category) {
  const cfg = THROTTLE[level];
  if (!cfg) return true;
  const key = `${level}:${category}`;
  const last = _lastSent.get(key) || [];
  const now = Date.now();
  const recent = last.filter(t => now - t < cfg.windowMs);
  _lastSent.set(key, recent);
  if (recent.length >= cfg.max) return false;
  recent.push(now);
  return true;
}

export async function sendAlert(level, category, message, meta) {
  if (!shouldSend(level, category)) return;

  // Kanallar birbirinden bağımsız: biri konfigüre değilse ya da patlarsa
  // diğerleri yine de gitsin. Hiçbiri konfigüre değilse sessiz kalınır — ama
  // bunu bir kez uyar, yoksa boş bir env değeri (2026-08-14'te olduğu gibi)
  // alarm sisteminin tamamını fark edilmeden devre dışı bırakır.
  const channels = [
    sendWebhook(level, category, message, meta),
    sendTelegram(level, category, message, meta),
    sendEmailAlert(level, category, message, meta),
  ];
  const results = await Promise.allSettled(channels);
  if (results.every(r => r.status === 'fulfilled' && r.value === 'unconfigured')) {
    warnUnconfiguredOnce();
  }
}

let _warnedUnconfigured = false;
function warnUnconfiguredOnce() {
  if (_warnedUnconfigured) return;
  _warnedUnconfigured = true;
  console.warn(
    '[alert] No alert channel configured — critical events are not being ' +
    'reported anywhere. Set one up in Admin panel → Settings ' +
    '(or the ALERT_WEBHOOK_URL / TELEGRAM_BOT_TOKEN+TELEGRAM_CHAT_ID / ALERT_EMAIL_TO env).'
  );
}

async function sendWebhook(level, category, message, meta) {
  const webhookUrl = await getSetting('ALERT_WEBHOOK_URL');
  if (!webhookUrl) return 'unconfigured';

  try {
    if (webhookUrl.includes('slack.com') || webhookUrl.includes('discord.com')) {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formatPayload(level, category, message, meta, await getSiteName())),
      });
    } else {
      // Generic webhook — flat JSON
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, category, message, meta, timestamp: new Date().toISOString() }),
      });
    }
  } catch (e) {
    console.error('[alert] webhook failed:', e.message);
  }
  return 'sent';
}

async function sendTelegram(level, category, message, meta) {
  const token = await getSetting('TELEGRAM_BOT_TOKEN');
  const chatId = await getSetting('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return 'unconfigured';

  const emoji = level === 'CRITICAL' ? '🚨' : level === 'ERROR' ? '⚠️' : 'ℹ️';
  const lines = [`${emoji} ${level} — ${category}`, '', message];
  if (meta) {
    lines.push('');
    for (const [k, v] of Object.entries(meta).slice(0, 8)) {
      lines.push(`${k}: ${typeof v === 'string' ? v.slice(0, 200) : JSON.stringify(v)?.slice(0, 200)}`);
    }
  }

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: lines.join('\n'), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    console.error('[alert] telegram failed:', e.message);
  }
  return 'sent';
}

async function sendEmailAlert(level, category, message, meta) {
  const to = await getSetting('ALERT_EMAIL_TO');
  if (!to) return 'unconfigured';

  const metaRows = meta
    ? Object.entries(meta).slice(0, 8)
        .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#888">${k}</td><td style="padding:4px 0"><code>${
          typeof v === 'string' ? v.slice(0, 200) : JSON.stringify(v)?.slice(0, 200)
        }</code></td></tr>`)
        .join('')
    : '';

  try {
    // Dinamik import: alert.js'i hafif tutar ve email.js ileride errorLogger'a
    // bağlanırsa döngüsel import riski oluşmaz.
    const { sendEmail } = await import('./email.js');
    await sendEmail({
      to,
      subject: `[${level}] ${category} — ${await getSiteName()}`,
      html: `<h2 style="font-family:sans-serif">${level}: ${category}</h2>
<p style="font-family:sans-serif;font-size:15px">${message}</p>
${metaRows ? `<table style="font-family:monospace;font-size:13px">${metaRows}</table>` : ''}
<p style="color:#888;font-size:12px">${new Date().toISOString()}</p>`,
    });
  } catch (e) {
    console.error('[alert] email failed:', e.message);
  }
  return 'sent';
}

function formatPayload(level, category, message, meta, siteName = 'VIP90.bet') {
  const color = level === 'CRITICAL' ? '#ef4444' : level === 'ERROR' ? '#f59e0b' : '#3b82f6';
  const emoji = level === 'CRITICAL' ? '🚨' : level === 'ERROR' ? '⚠️' : 'ℹ️';

  // Slack/Discord uyumlu embed
  return {
    username: `${siteName} Alert`,
    embeds: [{
      title: `${emoji} ${level}: ${category}`,
      description: message,
      color: parseInt(color.replace('#', ''), 16),
      fields: meta ? Object.entries(meta).slice(0, 5).map(([k, v]) => ({
        name: k,
        value: typeof v === 'string' ? v.slice(0, 200) : JSON.stringify(v).slice(0, 200),
        inline: true,
      })) : [],
      timestamp: new Date().toISOString(),
    }],
  };
}