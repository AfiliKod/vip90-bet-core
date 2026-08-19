/**
 * www ↔ apex ikizi origin'i üretir. localhost, IP ve geçersiz girdilerde null döner
 * (bu hostlarda www varyantı anlamsız).
 */
function twinOrigin(origin) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  const host = url.hostname;
  if (!host.includes('.') || /^[\d.]+$/.test(host)) return null;
  url.hostname = host.startsWith('www.') ? host.slice(4) : `www.${host}`;
  return url.origin;
}

/**
 * CORS origin listesini www ↔ apex ikizleriyle genişletir. CLIENT_URL'de yalnızca
 * bir varyant tanımlıyken diğer hosttan gelen API/socket istekleri CORS'a takılmasın diye.
 */
export function expandOrigins(origins) {
  const out = [];
  for (const origin of origins) {
    if (!out.includes(origin)) out.push(origin);
    const twin = twinOrigin(origin);
    if (twin && !out.includes(twin)) out.push(twin);
  }
  return out;
}

/**
 * Kanonik host yönlendirmesi: www.* hostları apex'e indirger, gerekmiyorsa null.
 * Tek kanonik domain — çerez/oturum bölünmesini ve SEO içerik çiftlenmesini önler.
 */
export function canonicalHostRedirect(host) {
  if (!host || !host.startsWith('www.')) return null;
  return host.slice(4);
}
