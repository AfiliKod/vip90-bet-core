/**
 * `client/dist/routes.json` üretir: App.jsx'teki <Routes> bloğu TARANIR,
 * rota desenleri çıkarılır. Sunucu bu tabloyu okuyup geçerli olmayan yollara
 * gerçek HTTP 404 verir (bkz. server/src/seo/http.js, shared/route-matcher.js).
 *
 * Neden otomatik: rota tablosu TEK doğruluk kaynağı olarak `App.jsx`'te kalır.
 * Elle tutulan ikinci bir liste + "senkron mu" CI gate'i, her yeni rotada
 * CI kırardı. Doğruluk parser'ın birim testleriyle (scripts/__tests__) garanti
 * edilir; parser hiç rota bulamazsa build FAİL EDER (sessizce bozuk tablo yok).
 *
 * Kurallar:
 *   - `<Route path="/x">`            → /x
 *   - `<Route path="x">` (parent /admin) → /admin/x
 *   - `<Route index />`              → eklemez (parent zaten listede)
 *   - `<Route path="*" />`           → EKLENMEZ (404'e düşmeli)
 *   - `<Navigate to="..."/>` içeren rotalar TUTULUR (çalışan URL'ler; /admin/*).
 *
 * Kullanım: `node scripts/emit-route-manifest.mjs` (npm run build zincirinde).
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const APP_JSX = join(HERE, '../src/App.jsx');
export const MANIFEST = join(HERE, '../dist/routes.json');

/* ── JSX etiket tarayıcı ────────────────────────────────────────────────
 * `<`, `>` ve `{}` içeren öznitelik değerleri (element={<>...</>}, ok
 * fonksiyonları) var; yüzeysel bir `>` araması yanlış etiket sonu bulur.
 * Bu yüzden tırnak ve süslü parantez derinliği sayılarak tarama yapılır. */

const isNameChar = c => c != null && /[A-Za-z0-9_.:-]/.test(c);
const isSpace = c => c === ' ' || c === '\n' || c === '\t' || c === '\r' || c === '\f' || c === '\v';

/**
 * `src[lt]` konumundaki açılış/kapama etiketini ayrıştırır.
 * @returns {{closing:boolean,name:string,attrs:Record<string,string>,selfClosing:boolean,end:number}|null}
 */
export function parseTag(src, lt) {
  let j = lt + 1;
  const closing = src[j] === '/';
  if (closing) j++;
  const nameStart = j;
  while (isNameChar(src[j])) j++;
  const name = src.slice(nameStart, j);
  if (!name || !/^[A-Za-z]/.test(name)) return null;

  if (closing) {
    const gt = src.indexOf('>', j);
    return gt < 0 ? null : { closing: true, name, attrs: {}, selfClosing: false, end: gt + 1 };
  }

  const attrs = {};
  let quote = null;
  let brace = 0;
  while (j < src.length) {
    const c = src[j];
    if (quote) { if (c === quote) quote = null; j++; continue; }
    if (c === '"' || c === "'") { quote = c; j++; continue; }
    if (c === '{') { brace++; j++; continue; }
    if (c === '}') { brace--; j++; continue; }
    if (brace > 0) { j++; continue; }
    if (c === '>') {
      const selfClosing = src[j - 1] === '/';
      return { closing: false, name, attrs, selfClosing, end: j + 1 };
    }
    if (isSpace(c) || c === '/') { j++; continue; }

    const attrStart = j;
    while (isNameChar(src[j])) j++;
    const attr = src.slice(attrStart, j);
    if (!attr) { j++; continue; }

    let k = j;
    while (isSpace(src[k])) k++;
    if (src[k] !== '=') continue; // değersiz (boolean) öznitelik
    k++;
    while (isSpace(src[k])) k++;
    const q = src[k];
    if (q === '"' || q === "'") {
      const end = src.indexOf(q, k + 1);
      if (end < 0) return null;
      attrs[attr] = src.slice(k + 1, end);
      j = end + 1; // kapanış tırnağı da tüketilir
    } else if (q === '{') {
      let depth = 0;
      let m = k;
      for (; m < src.length; m++) {
        if (src[m] === '{') depth++;
        else if (src[m] === '}' && --depth === 0) break;
      }
      const expr = src.slice(k + 1, m);
      attrs[attr] = /^\s*(['"`])([\s\S]*)\1\s*$/.exec(expr)?.[2] ?? expr.trim();
      j = m + 1; // kapanış süslü parantezi de tüketilir
    } else {
      continue; // değersiz/bozuk — sonraki karaktere geç
    }
  }
  return null;
}

/** JSX/JS yorumlarını (`{/* ... *\/}`) atla; içindeki `<Route` sayılmasın. */
function skipComment(src, i) {
  if (src[i] !== '{' || src.slice(i, i + 3) !== '{/*') return -1;
  const end = src.indexOf('*/}', i);
  return end < 0 ? src.length : end + 3;
}

/** Verilen bölgedeki tüm JSX etiketlerini sırayla döndürür. */
export function scanTags(src, from = 0, to = src.length) {
  const tokens = [];
  let i = from;
  while (i < to) {
    const c = src[i];
    if (c === '{') {
      const after = skipComment(src, i);
      if (after > 0) { i = after; continue; }
      i++;
      continue;
    }
    if (c !== '<') { i++; continue; }
    const tag = parseTag(src, i);
    if (!tag) { i++; continue; }
    tokens.push(tag);
    i = tag.end;
  }
  return tokens;
}

/** '/admin' + 'users' -> '/admin/users'; '' + 'login' -> '/login'. */
function joinPath(prefix, segment) {
  const seg = String(segment).replace(/^\/+|\/+$/g, '');
  const base = String(prefix).replace(/\/+$/, '');
  if (!seg) return base || '/';
  return `${base}/${seg}` || '/';
}

/**
 * App.jsx kaynak kodundan rota desenlerini (kaynak sırasıyla, tekrarsız) çıkarır.
 * @param {string} source App.jsx içeriği
 * @returns {string[]}
 */
export function parseRoutes(source) {
  const open = /<Routes[\s>]/.exec(source);
  if (!open) throw new Error('App.jsx içinde <Routes> bulunamadı');
  const closeIdx = source.indexOf('</Routes>', open.index);
  if (closeIdx < 0) throw new Error('App.jsx içinde </Routes> bulunamadı');

  const tokens = scanTags(source, open.index + '<Routes'.length, closeIdx);
  const patterns = [];
  const seen = new Set();
  const stack = [];
  const add = pattern => {
    if (!pattern.startsWith('/') || seen.has(pattern)) return;
    seen.add(pattern);
    patterns.push(pattern);
  };

  for (const tag of tokens) {
    if (tag.name !== 'Route') continue;
    if (tag.closing) { stack.pop(); continue; }
    const path = tag.attrs.path;
    const full = path ? joinPath(stack[stack.length - 1] ?? '', path) : (stack[stack.length - 1] ?? '');
    // `*` joker 404'e düşmeli; `index` rotası parent'ı tekrar etmez.
    if (path && path !== '*' && !path.includes('*')) add(full);
    if (!tag.selfClosing) stack.push(full);
  }

  if (patterns.length === 0) throw new Error('App.jsx içinden hiç rota çıkarılamadı (parser bozuldu mu?)');
  return patterns;
}

/** routes.json gövdesi. */
export function buildManifest(patterns, generatedAt = new Date().toISOString()) {
  return `${JSON.stringify({ generatedAt, count: patterns.length, patterns }, null, 2)}\n`;
}

/** Parser'ı çalıştırıp manifesti diske yazar; çıktı yolunu döner. */
export function writeManifest({ appPath = APP_JSX, outPath = MANIFEST } = {}) {
  if (!existsSync(appPath)) throw new Error(`App.jsx bulunamadı: ${appPath}`);
  const patterns = parseRoutes(readFileSync(appPath, 'utf8'));
  writeFileSync(outPath, buildManifest(patterns));
  return { outPath, patterns };
}

function main() {
  if (!existsSync(dirname(MANIFEST))) {
    console.error(`[route-manifest] ${dirname(MANIFEST)} yok — önce \`vite build\` çalıştır.`);
    process.exit(1);
  }
  try {
    const { patterns } = writeManifest();
    console.log(`[route-manifest] ${patterns.length} rota → ${MANIFEST}`);
  } catch (e) {
    console.error(`[route-manifest] ÜRETİLEMEDİ: ${e.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
