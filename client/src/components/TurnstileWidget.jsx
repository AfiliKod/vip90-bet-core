import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise = null;

function loadScript() {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT_SRC;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => { scriptPromise = null; reject(new Error('turnstile script')); };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

/**
 * Cloudflare Turnstile — yalnız sunucu etkinleştirdiyse (TURNSTILE_SECRET_KEY +
 * TURNSTILE_SITE_KEY) render edilir; site key GET /api/auth/turnstile-config'ten
 * gelir. Kapalıyken `enabled=false`, `token=null` ve hiçbir şey çizilmez.
 *
 * Kullanım: const ts = useTurnstile(); ... {ts.widget}
 *   gönderimde ts.token, hata/başarı sonrası ts.reset(). `ts.blocked` true iken
 *   (etkin ama token henüz yok) gönder düğmesi devre dışı bırakılabilir.
 */
export function useTurnstile() {
  const [cfg, setCfg] = useState({ enabled: false, siteKey: null });
  const [token, setToken] = useState(null);
  const widgetId = useRef(null);
  const [node, setNode] = useState(null); // callback ref: kapsayıcı yeniden bağlanırsa widget yeniden çizilir

  useEffect(() => {
    let cancelled = false;
    api.get('/auth/turnstile-config')
      .then(r => { if (!cancelled && r.data?.enabled && r.data.siteKey) setCfg(r.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!cfg.enabled || !node) return undefined;
    let cancelled = false;
    loadScript().then(() => {
      if (cancelled || widgetId.current !== null) return;
      widgetId.current = window.turnstile.render(node, {
        sitekey: cfg.siteKey,
        theme: 'dark',
        callback: setToken,
        'expired-callback': () => setToken(null),
        'error-callback': () => setToken(null),
      });
    }).catch(() => {});
    return () => {
      cancelled = true;
      if (widgetId.current !== null && window.turnstile) {
        try { window.turnstile.remove(widgetId.current); } catch { /* yok say */ }
      }
      widgetId.current = null;
    };
  }, [cfg, node]);

  const reset = useCallback(() => {
    setToken(null);
    if (widgetId.current !== null && window.turnstile) {
      try { window.turnstile.reset(widgetId.current); } catch { /* yok say */ }
    }
  }, []);

  const widget = cfg.enabled ? <div ref={setNode} className="flex justify-center" /> : null;
  return { enabled: cfg.enabled, token, reset, widget, blocked: cfg.enabled && !token };
}
