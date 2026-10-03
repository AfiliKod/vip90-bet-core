// Cloudflare Turnstile bot koruması — env-based opt-in, VARSAYILAN KAPALI.
//
// Aktif olması için TURNSTILE_SECRET_KEY (eski ad: TURNSTILE_SECRET) VE
// TURNSTILE_SITE_KEY birlikte tanımlı olmalı. Biri eksikse ya da
// DISABLE_TURNSTILE=true ise doğrulama tamamen atlanır (bugünkü davranış).
// Bağlandığı uçlar: POST /api/auth/register, /login, /forgot-password.
// İstemci site key'i GET /api/auth/turnstile-config'ten alır.

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function getTurnstileConfig(env = process.env) {
  const secret = (env.TURNSTILE_SECRET_KEY || env.TURNSTILE_SECRET || '').trim();
  const siteKey = (env.TURNSTILE_SITE_KEY || '').trim();
  const disabled = String(env.DISABLE_TURNSTILE || '').toLowerCase() === 'true';
  return { secret, siteKey, enabled: !disabled && !!secret && !!siteKey };
}

/** Herkese açık yapılandırma: yalnız site key (secret asla). */
export function publicTurnstileConfig(env = process.env) {
  const { enabled, siteKey } = getTurnstileConfig(env);
  return enabled ? { enabled: true, siteKey } : { enabled: false, siteKey: null };
}

export function createTurnstileMiddleware({ env = process.env, fetchImpl = (...a) => fetch(...a) } = {}) {
  return async (req, res, next) => {
    const cfg = getTurnstileConfig(env);
    if (!cfg.enabled) return next();

    const token = req.body?.turnstileToken || req.body?.['cf-turnstile-response'];
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: { code: 'TURNSTILE_REQUIRED', message: 'Bot doğrulaması gerekli' } });
    }
    try {
      const verifyRes = await fetchImpl(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: cfg.secret, response: token, remoteip: req.ip || '' }),
      });
      const result = await verifyRes.json();
      if (!result.success) {
        return res.status(400).json({ error: { code: 'TURNSTILE_FAILED', message: 'Bot doğrulaması başarısız' } });
      }
      return next();
    } catch (e) {
      // Cloudflare erişilemiyor — fail-open (rate limit zaten var); aksi halde
      // CF kesintisi tüm girişleri kilitler.
      console.error('[turnstile] verify failed:', e.message);
      return next();
    }
  };
}

/** Geriye dönük: eski imza (required parametresi artık yok sayılır). */
export function turnstileMiddleware() {
  return createTurnstileMiddleware();
}
