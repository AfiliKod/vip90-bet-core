#!/usr/bin/env node
/**
 * Sürüm hazırlığı: node scripts/release.mjs <X.Y.Z> [--date YYYY-MM-DD] [--dry-run]
 *
 * 1. CHANGELOG.md'deki `## [Yayınlanmadı]` başlığını `## [X.Y.Z] — tarih`
 *    yapar ve üstüne yeni, boş bir `## [Yayınlanmadı]` açar. Bölüm boşsa durur.
 * 2. Kök, server ve client `package.json` + lock dosyalarındaki sürümü X.Y.Z
 *    yapar (üçü aynı numarayı taşır).
 * 3. README.md / README.tr.md sürüm rozetini günceller.
 *
 * Etiketi ATMAZ: değişiklik PR ile main'e girdikten sonra merge commit'ine
 * `vX.Y.Z` etiketi ve GitHub Release oluşturulur (bkz. docs/CHANGELOG_GUIDE.md). Sürüm numarası SemVer'e göre seçilir.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const version = args.find(a => /^\d+\.\d+\.\d+$/.test(a));
const dry = args.includes('--dry-run');
const dateArg = args[args.indexOf('--date') + 1];
const date = args.includes('--date') ? dateArg : new Date().toISOString().slice(0, 10);

function fail(msg) { console.error(`✖ ${msg}`); process.exit(1); }
if (!version) fail('Kullanım: node scripts/release.mjs <X.Y.Z> [--date YYYY-MM-DD] [--dry-run]');
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(`Geçersiz tarih: ${date}`);

const cmp = (a, b) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

const read = p => readFileSync(join(root, p), 'utf8');
const writes = [];
const write = (p, s) => writes.push([p, s]);

// 1. CHANGELOG
const UNRELEASED = '## [Yayınlanmadı]';
let log = read('CHANGELOG.md');
const start = log.indexOf(UNRELEASED);
if (start === -1) fail(`CHANGELOG.md'de "${UNRELEASED}" yok`);
const next = log.indexOf('\n## [', start + UNRELEASED.length);
const body = log.slice(start + UNRELEASED.length, next === -1 ? undefined : next).trim();
if (!body) fail('[Yayınlanmadı] bölümü boş — yayınlanacak değişiklik yok');
const last = (log.slice(next).match(/^## \[(\d+\.\d+\.\d+)\]/m) || [])[1];
if (last && cmp(version, last) <= 0) fail(`${version}, son sürüm ${last}'dan büyük olmalı`);
if (log.includes(`## [${version}]`)) fail(`${version} CHANGELOG'da zaten var`);
log = log.slice(0, start) + `${UNRELEASED}\n\n## [${version}] — ${date}` + log.slice(start + UNRELEASED.length);
write('CHANGELOG.md', log);

// 2. package.json + lock
for (const dir of ['.', 'server', 'client']) {
  const pj = join(dir, 'package.json');
  const pkg = JSON.parse(read(pj));
  pkg.version = version;
  write(pj, JSON.stringify(pkg, null, 2) + '\n');
  const lockPath = join(dir, 'package-lock.json');
  if (existsSync(join(root, lockPath))) {
    const lock = JSON.parse(read(lockPath));
    lock.version = version;
    if (lock.packages?.['']) lock.packages[''].version = version;
    write(lockPath, JSON.stringify(lock, null, 2) + '\n');
  }
}

// 3. README rozetleri
for (const p of ['README.md', 'README.tr.md']) {
  if (!existsSync(join(root, p))) continue;
  const s = read(p);
  const updated = s.replace(/badge\/version-\d+\.\d+\.\d+-/g, `badge/version-${version}-`);
  if (updated !== s) write(p, updated);
}

for (const [p, s] of writes) {
  if (!dry) writeFileSync(join(root, p), s);
  console.log(`${dry ? '·' : '✓'} ${p}`);
}
console.log(`\n${dry ? 'Kuru çalıştırma — hiçbir dosya yazılmadı.' : `Sürüm ${version} hazırlandı.`}`);
console.log(`Sonraki adımlar: PR → main'e merge → merge commit'ine "v${version}" etiketi ve GitHub Release (CHANGELOG'daki ${version} bölümü).`);
