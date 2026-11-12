#!/usr/bin/env node
/**
 * Core ağacındaki sızıntı taraması.
 *
 * bet → core senkronundan (bet deposundaki scripts/sync-core.mjs) port edildi:
 * kalıplar, izin listeleri ve karar mantığı birebir aynıdır. Senkron betiği
 * core'da bulunmadığı için tarama public repo'da ayrı bir komut olarak çalışır.
 *
 * Kullanım:
 *   node scripts/leak-scan.mjs [dizin]      # dizin varsayılan: repo kökü
 *
 * Çıkış kodları: 0 temiz · 1 kullanım/git hatası · 3 sızıntı bulundu
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

// ─── Sızıntı taraması ────────────────────────────────────────────────────────

const LEAK_PATTERNS = [
  { name: 'özel anahtar', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'GitHub token', re: /\b(ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/ },
  { name: 'AWS anahtarı', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Slack token', re: /\bxox[bpas]-[A-Za-z0-9-]{10,}/ },
  { name: 'canlı Stripe anahtarı', re: /\bsk_live_[A-Za-z0-9]{10,}/ },
  { name: 'kimlik bilgili Mongo URI', re: /mongodb(\+srv)?:\/\/(?!(KULLANICI|user|USER|username|<)[^:]*:)[^\s:'"@/]+:[^\s'"@/]+@/ },
  { name: 'prod sunucu yolu', re: /\/home\/vip90\b/ },
  { name: 'prod runner adı', re: /vip90-prod(-runner)?\b/ },
  { name: 'sunucu host adı', re: /contaboserver|vmi\d{6,}/ },
  { name: 'SSH parolası', re: /\bSSHPASS\b|sshpass\s+-/ },
  { name: 'oyun sağlayıcısı API host', re: /goldslotpala[cs]e|aesgamingasia/i },
  { name: 'oyun sağlayıcısı ticari adı', re: /gold\s*slot\s*pala(c|s)e/i },
  { name: 'yerel makine yolu', re: /\/Users\/[^/\s'"`]+\/|C:\\Users\\[^\\\s]+\\/ },
];

// Geçerli (mod-97) ama bilinen test/örnek IBAN'ları.
const IBAN_ALLOW = new Set(['TR330006100519786457841326']);
// Bilinen operatör cüzdanı — testlerde bile bulunmamalı.
const TRON_DENY = new Set(['TXmoqxkZKqF3TKzVEXHh7MEqQL1AzsAvBc']);
// Test/örnek adresleri, yer tutucu Mongo URI parçaları (user:PASS@cluster…)
// ve @2x.png gibi dosya adları e-posta sayılmaz. example.com alt alan adları ve
// `.example`/`.local` (RFC 2606/6762, çok etiketli dahil) ayrılmış adlardır.
const EMAIL_ALLOW = /@(([a-z0-9-]+\.)*example(\.(com|org|net))?|beispiel\.com|ejemplo\.com|exemplo\.com|ornek\.com|test\.com|[a-z0-9-]+\.test|([a-z0-9-]+\.)*[a-z0-9-]+\.local|localhost|users\.noreply\.github\.com|vip90\.bet|([a-z]+\.)?domain\.com|evil\.co|sentry\.io|cluster\.mongodb\.net|[a-z]\.[a-z]{2,3})$|\.(png|jpe?g|svg|webp|gif)$|^(noreply|no-reply|support|admin|info|test|user|demo)@/i;
const IP_ALLOW = new Set(['127.0.0.1', '0.0.0.0', '1.1.1.1', '8.8.8.8', '8.8.4.4', '255.255.255.255']);

function ibanValid(raw) {
  const s = raw.replace(/\s+/g, '');
  if (!/^TR\d{24}$/.test(s)) return false;
  const r = s.slice(4) + s.slice(0, 4);
  let mod = 0;
  for (const c of r) {
    const v = /\d/.test(c) ? c : String(c.charCodeAt(0) - 55);
    for (const d of v) mod = (mod * 10 + Number(d)) % 97;
  }
  return mod === 1;
}

function isPublicIp(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n > 255)) return false;
  if (IP_ALLOW.has(ip)) return false;
  const [a, b] = p;
  if (a === 10 || a === 127 || a === 0 || a >= 224) return false;
  if (a === 192 && b === 168) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 169 && b === 254) return false;
  // RFC 5737 belgeleme aralıkları (örnek/yer tutucu adresler)
  if ((a === 192 && b === 0 && p[2] === 2) || (a === 198 && b === 51 && p[2] === 100) || (a === 203 && b === 0 && p[2] === 113)) return false;
  return true;
}

/**
 * Bir metni satır satır tarar.
 * @param {string} path  bulgu yazılırken kullanılacak dosya yolu
 * @param {string} text  taranacak metin
 * @returns {string[]} `path:satır  bulgu adı` biçiminde bulgular
 */
export function scanText(path, text) {
  const hits = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const at = `${path}:${i + 1}`;
    for (const { name, re } of LEAK_PATTERNS) if (re.test(line)) hits.push(`${at}  ${name}`);
    for (const m of line.matchAll(/TR\d{2}(?: ?\d{4}){5} ?\d{2}/g)) {
      const iban = m[0].replace(/\s+/g, '');
      if (ibanValid(iban) && !IBAN_ALLOW.has(iban)) hits.push(`${at}  geçerli IBAN (${iban})`);
    }
    for (const m of line.matchAll(/\bT[1-9A-HJ-NP-Za-km-z]{33}\b/g)) {
      if (TRON_DENY.has(m[0])) hits.push(`${at}  operatör TRON cüzdanı`);
    }
    for (const m of line.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g)) {
      if (!EMAIL_ALLOW.test(m[0])) hits.push(`${at}  e-posta (${m[0]})`);
    }
    // Sürüm numaralarına (1.2.3.4) takılmamak için yalnızca bağlamı adres
    // olan IPv4'ler: önünde/arkasında harf-rakam-nokta olmayanlar.
    for (const m of line.matchAll(/(?<![\w.])(\d{1,3}(?:\.\d{1,3}){3})(?![\w.])/g)) {
      if (isPublicIp(m[1]) && /(ip|host|server|sunucu|ssh|@|:\/\/|addr)/i.test(line)) hits.push(`${at}  public IP (${m[1]})`);
    }
  });
  return hits;
}

// ─── Ağaç taraması ───────────────────────────────────────────────────────────

// Tarayıcının kendi dosyaları kalıpları fixture olarak içerir — taranmaz.
// (kök repo yolu ya da alt dizindeki bir kopyası)
const SELF_ALLOW = [
  /(^|\/)scripts\/leak-scan\.mjs$/,
  /(^|\/)scripts\/leak-scan\.test\.mjs$/,
];

const isBinary = buf => buf.includes(0);

function git(cwd, gitArgs, { buffer = false } = {}) {
  const out = execFileSync('git', gitArgs, { cwd, maxBuffer: 512 * 1024 * 1024 });
  return buffer ? out : out.toString().trim();
}

/** Verilen dizinin ait olduğu repo kökü. */
export function repoRoot(dir) {
  try {
    return git(dir, ['rev-parse', '--show-toplevel']);
  } catch {
    return resolve(dir);
  }
}

/**
 * Git'e kayıtlı (tracked) her dosyayı tarar.
 * `git -C dir ls-files` kullanılır; bulgular repo köküne göre yol gösterir.
 * @param {string} dir repo kökü ya da onun altındaki bir dizin
 * @returns {string[]} bulgular
 */
export function scanTree(dir) {
  const hits = [];
  const files = git(dir, ['ls-files', '-z'], { buffer: true }).toString().split('\0').filter(Boolean);
  // `git -C dir ls-files` yolları dir'a göre döner; rapor repo köküne göre olsun.
  let prefix = '';
  try {
    prefix = git(dir, ['rev-parse', '--show-prefix']);
  } catch {
    prefix = '';
  }
  for (const p of files) {
    const rel = prefix ? prefix + p : p;
    if (SELF_ALLOW.some(re => re.test(rel))) continue;
    if (/(^|\/)package-lock\.json$/.test(rel)) continue;
    const abs = join(dir, p);
    if (!existsSync(abs)) continue;
    let buf;
    try {
      if (!statSync(abs).isFile()) continue; // submodule/dizin girdileri
      buf = readFileSync(abs);
    } catch {
      continue;
    }
    if (isBinary(buf) || buf.length > 5 * 1024 * 1024) continue;
    hits.push(...scanText(rel, buf.toString()));
  }
  return hits;
}

// ─── Komut satırı ────────────────────────────────────────────────────────────

function main() {
  const argv = process.argv.slice(2);
  const dir = argv[0] ? resolve(argv[0]) : repoRoot(process.cwd());

  let leaks;
  try {
    leaks = scanTree(dir);
  } catch (e) {
    console.error(`✖ Tarama hatası (${dir}): ${e.stderr?.toString().trim() || e.message}`);
    process.exit(1);
  }

  if (leaks.length) {
    console.error(`✖ Sızıntı taraması ${leaks.length} bulgu üretti:`);
    leaks.forEach(l => console.error(`   ${l}`));
    process.exit(3);
  }
  console.log('✓ Sızıntı taraması temiz.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
