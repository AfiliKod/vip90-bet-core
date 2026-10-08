/**
 * `npm run routes:check` — UYARI DÜZEYİNDE senkron denetimi.
 *
 * Manifest build sırasında otomatik üretilir; elle tutulan dosya yoktur. Bu
 * betik yalnızca "App.jsx değişmiş ama `npm run build` çalıştırılmamış" durumunu
 * görünür kılar ve ASLA kırmaz (çıkış kodu daima 0) — CI gate'i değildir.
 */
import { existsSync, readFileSync } from 'fs';
import { dirname } from 'path';
import { parseRoutes, APP_JSX, MANIFEST } from './emit-route-manifest.mjs';

export function checkManifest({ appPath = APP_JSX, manifestPath = MANIFEST } = {}) {
  if (!existsSync(manifestPath)) {
    return { ok: false, reason: 'missing', added: [], removed: [] };
  }
  let written;
  try {
    written = JSON.parse(readFileSync(manifestPath, 'utf8')).patterns;
  } catch (e) {
    return { ok: false, reason: `unreadable: ${e.message}`, added: [], removed: [] };
  }
  if (!Array.isArray(written)) {
    return { ok: false, reason: 'no-patterns', added: [], removed: [] };
  }
  const current = parseRoutes(readFileSync(appPath, 'utf8'));
  const writtenSet = new Set(written);
  const currentSet = new Set(current);
  return {
    ok: current.length === written.length && current.every(p => writtenSet.has(p)),
    reason: 'stale',
    added: current.filter(p => !writtenSet.has(p)),
    removed: written.filter(p => !currentSet.has(p)),
  };
}

function main() {
  const r = checkManifest();
  if (r.ok) {
    console.log(`[routes:check] manifest güncel (${readFileSync(MANIFEST, 'utf8').match(/"count":\s*(\d+)/)?.[1] ?? '?'} rota)`);
    return;
  }
  if (r.reason === 'missing') {
    console.warn(`[routes:check] UYARI: ${MANIFEST} yok (${dirname(MANIFEST)}). \`npm run build\` çalıştır.`);
    return;
  }
  console.warn(`[routes:check] UYARI: manifest okunamadı (${r.reason}) — \`npm run build\` çalıştır.`);
  if (r.added.length) console.warn(`[routes:check]   + eksik: ${r.added.join(', ')}`);
  if (r.removed.length) console.warn(`[routes:check]   - fazlalık: ${r.removed.join(', ')}`);
  console.warn('[routes:check] Bu bir CI hatası DEĞİLDİR; sonraki build manifesti yeniden üretir.');
}

main();
