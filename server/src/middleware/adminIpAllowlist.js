// /api/admin/* için opsiyonel IP kısıtı — ADMIN_ALLOWED_IPS (virgüllü IP/CIDR).
// Tanımsız/boş ise kapalı (bugünkü davranış). Tanımlıysa listede olmayan
// istemci 403 ADMIN_IP_NOT_ALLOWED alır.
//
// İstemci IP'si: varsayılan `req.ip` (app `trust proxy 1`). Cloudflare arkasında
// ve proxy zincirinde gerçek IP `req.ip`'e yansımıyorsa, ADMIN_IP_TRUST_CF_HEADER=true
// ile `CF-Connecting-IP` kullanılabilir. Bu başlık yalnız istek gerçekten
// Cloudflare üzerinden geliyorsa güvenlidir (origininiz doğrudan erişime
// kapalıysa); uygulama katmanında Cloudflare'den geldiği doğrulanamaz, bu
// yüzden VARSAYILAN KAPALIDIR.
import net from 'node:net';

export function parseAllowList(raw) {
  const list = new net.BlockList();
  const invalid = [];
  let count = 0;
  for (const part of String(raw || '').split(',').map(s => s.trim()).filter(Boolean)) {
    try {
      const [addr, prefix] = part.split('/');
      const type = net.isIPv4(addr) ? 'ipv4' : net.isIPv6(addr) ? 'ipv6' : null;
      if (!type) throw new Error('bad ip');
      if (prefix === undefined) list.addAddress(addr, type);
      else {
        const p = Number(prefix);
        if (!Number.isInteger(p) || p < 0 || p > (type === 'ipv4' ? 32 : 128)) throw new Error('bad prefix');
        list.addSubnet(addr, p, type);
      }
      count++;
    } catch { invalid.push(part); }
  }
  return { list, invalid, count };
}

function normalizeIp(ip) {
  const s = String(ip || '').trim();
  const m = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  return m ? m[1] : s;
}

export function isIpAllowed(ip, parsed) {
  const addr = normalizeIp(ip);
  const type = net.isIPv4(addr) ? 'ipv4' : net.isIPv6(addr) ? 'ipv6' : null;
  if (!type) return false;
  return parsed.list.check(addr, type);
}

export function clientIp(req, env = process.env) {
  if (String(env.ADMIN_IP_TRUST_CF_HEADER || '').toLowerCase() === 'true') {
    const cf = req.headers?.['cf-connecting-ip'];
    if (typeof cf === 'string' && cf.trim()) return cf.trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
}

export function createAdminIpAllowlist({ env = process.env } = {}) {
  let cachedRaw; let cachedParsed;
  return (req, res, next) => {
    const raw = (env.ADMIN_ALLOWED_IPS || '').trim();
    if (!raw) return next();
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedParsed = parseAllowList(raw);
      if (cachedParsed.invalid.length) {
        console.error(`[admin-ip] ADMIN_ALLOWED_IPS geçersiz girdiler yok sayıldı: ${cachedParsed.invalid.join(', ')}`);
      }
    }
    // Hiç geçerli girdi yoksa fail-closed: yazım hatası sessizce herkese açmasın.
    if (cachedParsed.count > 0 && isIpAllowed(clientIp(req, env), cachedParsed)) return next();
    return res.status(403).json({ error: { code: 'ADMIN_IP_NOT_ALLOWED', message: 'Bu IP adresinden yönetim paneline erişilemez' } });
  };
}
