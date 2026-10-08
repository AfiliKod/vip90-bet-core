/**
 * SPA rota eşleştirici — `client/dist/routes.json` (build'de App.jsx'ten
 * türetilen rota tablosu) ile sunucudaki gerçek HTTP 404 arasındaki köprü.
 *
 * Saf fonksiyonlar; hem server (seo/http.js) hem testler aynı dosyayı kullanır.
 * React Router'ın desen sözdizimi (`:param`, isteğe bağlı son `/`) yeterlidir;
 * `*` joker bu tabloda YOKTUR (o joker 404'e düşmelidir).
 */

const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** '/events/:id' -> /^\/events\/[^/]+\/?$/ · '/' -> /^\/\/?$/ */
export function compilePattern(pattern) {
  const segments = String(pattern).split('/').filter(s => s !== '');
  const source = segments
    .map(seg => (seg.startsWith(':') ? '[^/]+' : escapeRegExp(seg)))
    .join('/');
  return new RegExp(`^/${source}/?$`);
}

/** Manifest'teki desen listesini derlenmiş hâle getirir; bozuk girdiler atlanır. */
export function compileRoutes(patterns) {
  if (!Array.isArray(patterns)) return [];
  return patterns
    .filter(p => typeof p === 'string' && p.startsWith('/'))
    .map(pattern => ({ pattern, re: compilePattern(pattern) }));
}

/** Son slash normalize edilir; listede eşleşen desen varsa true. */
export function matchRoute(compiled, pathname) {
  if (!compiled || compiled.length === 0) return false;
  const clean = String(pathname || '/').replace(/\/+$/, '') || '/';
  return compiled.some(({ re }) => re.test(clean));
}
