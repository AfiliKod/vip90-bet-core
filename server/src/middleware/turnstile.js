// Turnstile bot koruması (Phase B8) — env-based opt-in.
// TURNSTILE_SECRET tanımlıysa aktif, yoksa silent skip.

export function turnstileMiddleware(required = false) {
  return async (req, res, next) => {
    const secret = process.env.TURNSTILE_SECRET;
    if (!secret) {
      // Opt-out — dev mode'da sessizce geç
      return next();
    }
    const token = req.body?.turnstileToken || req.body?.['cf-turnstile-response'];
    if (!token) {
      if (required) return res.status(400).json({ error: { code: 'TURNSTILE_REQUIRED', message: 'Bot doğrulaması gerekli' } });
      return next();
    }
    try {
      const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token, remoteip: req.ip || '' }),
      });
      const result = await verifyRes.json();
      if (!result.success) {
        return res.status(400).json({ error: { code: 'TURNSTILE_FAILED', message: 'Bot doğrulaması başarısız' } });
      }
      next();
    } catch (e) {
      // Cloudflare unreachable — fail-open (rate limit zaten var)
      console.error('[turnstile] verify failed:', e.message);
      next();
    }
  };
}