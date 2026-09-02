// Sentry integration — optional, SENTRY_DSN varsa aktifleşir.
// Phase C2: errorLogger.critical() → Sentry.captureException() paralel gönderim.

let _sentry = null;

export async function initSentry(app) {
  if (!process.env.SENTRY_DSN) {
    console.log('[sentry] SENTRY_DSN not set — Sentry disabled');
    return;
  }
  try {
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.npm_package_version || 'unknown',
      tracesSampleRate: 0.1,
      profilesSampleRate: 0.1,
      beforeSend(event) {
        // PII'yi filtrele
        if (event.user) delete event.user.ip_address;
        if (event.extra?.password) delete event.extra.password;
        return event;
      },
    });
    _sentry = Sentry;
    console.log('[sentry] initialized');
  } catch (e) {
    console.error('[sentry] init failed:', e.message);
  }
}

export function captureException(error, context = {}) {
  if (!_sentry) return;
  try {
    _sentry.captureException(error, { extra: context });
  } catch (e) {
    // silent — Sentry failure should not break app
  }
}

export function captureMessage(message, level = 'info', context = {}) {
  if (!_sentry) return;
  try {
    _sentry.captureMessage(message, { level, extra: context });
  } catch {}
}