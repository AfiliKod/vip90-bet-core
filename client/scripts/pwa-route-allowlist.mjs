/**
 * Service worker'ın SPA navigate fallback'i için **allowlist** üretir.
 *
 * Sorun: workbox `NavigationRoute` varsayılan olarak (`allowlist: [/./]`)
 * `mode: 'navigate'` olan HER isteği precache'lenmiş `index.html` ile
 * karşılar. Böylece sunucunun gerçek 404'ü (bkz. server/src/seo/http.js ve
 * `client/dist/routes.json`) SW kurulu tarayıcıda **200'e** dönüşüyor:
 * kullanıcı doğru 404 sayfasını görür ama HTTP durumu ve
 * `X-Robots-Tag: noindex` kaybolur (2026-10-08'de Playwright ile doğrulandı).
 *
 * Çözüm: allowlist'i `App.jsx`'ten türetiyoruz — SW yalnızca GERÇEK bir uygulama
 * rotasını servis eder, geri kalan her şey ağa gider ve sunucunun yanıtı
 * (200 / 404 / JSON) geçerli olur. Elle tutulan liste yoktur: rota tablosuyla
 * aynı parser kullanılır, bu yüzden yeni rota eklemek ek iş gerektirmez ve
 * parser bozulursa build fail eder (sessizce boş allowlist olmaz).
 *
 * Workbox eşleştirmeyi `url.pathname + url.search` üzerinde yapar; bu yüzden
 * desen sonuna `(?:\/)?(?:[?#]|$)` konur: `/admin/platform?tab=seo` ve
 * `/bahis/` eşleşmeli, `/events/1/2` ya da `/admin/yok-boyle` **eşleşmemeli**
 * (sunucu onlara 404 veriyor).
 */
import { readFileSync } from 'fs';
import { APP_JSX, parseRoutes } from './emit-route-manifest.mjs';

const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** '/events/:id' -> /^\/events\/[^/]+(?:\/)?(?:[?#]|$)/ */
export function routePatternToRegExp(pattern) {
  const segments = String(pattern).split('/').filter(s => s !== '');
  const source = segments.map(seg => (seg.startsWith(':') ? '[^/]+' : escapeRegExp(seg))).join('/');
  return new RegExp(`^/${source}(?:\\/)?(?:[?#]|$)`);
}

/** Rota listesinden tek bir allowlist regex'i üretir (alternation). */
export function buildNavigateAllowlist(patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    throw new Error('rota listesi boş — SW navigate allowlist üretilemiyor (App.jsx bozuldu mu?)');
  }
  const body = patterns.map(p => {
    const segments = String(p).split('/').filter(s => s !== '');
    return segments.map(seg => (seg.startsWith(':') ? '[^/]+' : escapeRegExp(seg))).join('/');
  }).join('|');
  return [new RegExp(`^/(?:${body})(?:\\/)?(?:[?#]|$)`)];
}

/** Gerçek `App.jsx` rota tablosundan allowlist (build sırasında çağrılır). */
export function appNavigateAllowlist(appPath = APP_JSX) {
  return buildNavigateAllowlist(parseRoutes(readFileSync(appPath, 'utf8')));
}