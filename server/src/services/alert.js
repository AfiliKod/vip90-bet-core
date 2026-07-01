// Alert webhook — critical/error olaylarını dış webhook'a gönderir.
// (Slack, Discord, Microsoft Teams, generic webhook)
// Phase C3

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

  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) return; // silent

  const payload = formatPayload(level, category, message, meta);

  try {
    if (webhookUrl.includes('slack.com') || webhookUrl.includes('discord.com')) {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
}

function formatPayload(level, category, message, meta) {
  const color = level === 'CRITICAL' ? '#ef4444' : level === 'ERROR' ? '#f59e0b' : '#3b82f6';
  const emoji = level === 'CRITICAL' ? '🚨' : level === 'ERROR' ? '⚠️' : 'ℹ️';

  // Slack/Discord uyumlu embed
  return {
    username: 'Bet Platform Alert',
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