import Domain from '../models/Domain.js';
import { getTenancyMode } from '../config/tenancy.js';
import { expandOrigins } from '../utils/origins.js';

const CACHE_TTL_MS = 30_000;

let cache = null;

/**
 * Drop the in-process Domain origin cache.
 */
export function invalidateDomainOrigins() {
  cache = null;
}

function splitList(value) {
  return String(value || '').split(',').map(s => s.trim()).filter(Boolean);
}

function isLocalHost(host) {
  const hostname = host.split(':')[0];
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function originsForHost(host) {
  if (isLocalHost(host)) return [`http://${host}`, `https://${host}`];
  return [`https://${host}`];
}

async function loadDomainOrigins() {
  const domains = await Domain.find({}).select('host').lean();
  const origins = [];
  for (const domain of domains) {
    if (domain?.host) origins.push(...originsForHost(domain.host));
  }
  return expandOrigins(origins);
}

function envOrigins(env, mode) {
  const origins = [];
  if (mode === 'single') {
    const clientUrl = env.CLIENT_URL || 'http://localhost:5173';
    origins.push(...expandOrigins(splitList(clientUrl)));
  }
  origins.push(...splitList(env.GAME_HOST_URL));
  if (env.RAILWAY_PUBLIC_DOMAIN) {
    origins.push(`https://${env.RAILWAY_PUBLIC_DOMAIN}`);
  }
  return origins;
}

/**
 * Resolve the platform CORS allowlist.
 * Multi mode derives origins from every registered Domain (www/apex expanded);
 * single mode keeps the historical CLIENT_URL/GAME_HOST_URL/Railway allowlist
 * and never reads the Domain collection.
 *
 * @param {{ env?: object, now?: number, ttlMs?: number }} [options]
 * @returns {Promise<Set<string>>}
 */
export async function getDomainOrigins({ env = process.env, now = Date.now(), ttlMs = CACHE_TTL_MS } = {}) {
  const mode = getTenancyMode(env);
  const origins = new Set();

  if (mode === 'multi') {
    const expired = !cache || cache.mode !== mode || now - cache.loadedAt >= ttlMs;
    if (expired) {
      cache = { mode, origins: await loadDomainOrigins(), loadedAt: now };
    }
    for (const origin of cache.origins) origins.add(origin);
  }

  for (const origin of envOrigins(env, mode)) origins.add(origin);
  return origins;
}
