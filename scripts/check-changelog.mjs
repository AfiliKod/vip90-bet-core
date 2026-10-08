#!/usr/bin/env node
/**
 * Her PR'ın CHANGELOG girdisini eklediğini denetler.
 *
 *   node scripts/check-changelog.mjs [--base origin/main] [--head HEAD]
 *
 * Dalın tabana göre değiştirdiği dosyalar arasında kurulumu işleten operatörü
 * etkileyen bir yol varsa (sunucu, istemci, kurulum, Docker/env dosyaları,
 * bağımlılıklar, eklenti işaretçileri), CHANGELOG.md'nin `[Yayınlanmadı]`
 * bölümü de değişmiş olmalı — ya da dalda yeni bir sürüm kesilmiş olmalı
 * (scripts/release.mjs). Yalnız belge, test, ajan talimatı ya da bakım
 * betiği değiştiyse girdi gerekmez.
 *
 * Bilinçli istisna: daldaki bir commit mesajına `Changelog: none` satırı.
 *
 * Çıkış: 0 geçti, 1 girdi eksik, 2 kullanım/git hatası.
 * pre-push hook'u bu betiği çalıştırır (scripts/install-hooks.sh).
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const UNRELEASED = '## [Yayınlanmadı]';

// Operatörü etkileyen yollar…
const OPERATOR_PATHS = [
  /^server\//, /^client\//, /^installer\//, /^shared\//, /^deploy\//,
  /^app\.js$/, /^package(-lock)?\.json$/, /^Dockerfile$/, /^\.dockerignore$/,
  /^docker-compose[^/]*\.ya?ml$/, /^render\.yaml$/, /(^|\/)\.env[^/]*\.example$/,
  /^scripts\/(backup-db|restore-db)\.sh$/, /^scripts\/optional-run\.mjs$/,
];
// …içlerinde bile girdi gerektirmeyenler (testler, belgeler).
const EXEMPT_PATHS = [
  /^server\/test\//, /\.test\.(m?js|jsx)$/, /\/__tests__\//, /^client\/README\.md$/,
  /\.md$/,
];

export function requiresEntry(path) {
  return OPERATOR_PATHS.some(re => re.test(path)) && !EXEMPT_PATHS.some(re => re.test(path));
}

/** CHANGELOG metninden `[Yayınlanmadı]` bölümünün gövdesini ve sürüm başlıklarını çıkarır. */
export function parseChangelog(text) {
  if (text == null) return { unreleased: null, versions: [] };
  const start = text.indexOf(UNRELEASED);
  let unreleased = null;
  if (start !== -1) {
    const next = text.indexOf('\n## [', start + UNRELEASED.length);
    unreleased = text.slice(start + UNRELEASED.length, next === -1 ? undefined : next).trim();
  }
  const versions = [...text.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map(m => m[1]);
  return { unreleased, versions };
}

/**
 * Saf karar fonksiyonu.
 * @param {object} o
 * @param {string[]} o.changedFiles   tabana göre değişen yollar
 * @param {string|null} o.baseChangelog  CHANGELOG.md tabandaki hali
 * @param {string|null} o.headChangelog  CHANGELOG.md daldaki hali
 * @param {string[]} o.commitMessages daldaki commit mesajları
 */
export function evaluate({ changedFiles, baseChangelog, headChangelog, commitMessages = [] }) {
  const triggering = changedFiles.filter(requiresEntry);
  if (!triggering.length) return { ok: true, reason: 'no-operator-change', triggering };

  if (commitMessages.some(m => /^Changelog:\s*none\s*$/mi.test(m))) {
    return { ok: true, reason: 'opt-out', triggering };
  }

  const base = parseChangelog(baseChangelog);
  const head = parseChangelog(headChangelog);
  if (head.versions.some(v => !base.versions.includes(v))) {
    return { ok: true, reason: 'release-cut', triggering };
  }
  if (head.unreleased !== null && head.unreleased !== base.unreleased && head.unreleased.length > 0) {
    return { ok: true, reason: 'entry-added', triggering };
  }
  return { ok: false, reason: 'missing-entry', triggering };
}

// ─── Komut satırı ────────────────────────────────────────────────────────────

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function showOrNull(ref, path) {
  try { return git(['show', `${ref}:${path}`]); } catch { return null; }
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (name, def) => { const i = argv.indexOf(name); return i === -1 ? def : argv[i + 1]; };
  const baseRef = opt('--base', 'origin/main');
  const headRef = opt('--head', 'HEAD');

  let mergeBase, changedFiles, commitMessages;
  try {
    mergeBase = git(['merge-base', baseRef, headRef]);
    changedFiles = git(['diff', '--name-only', mergeBase, headRef]).split('\n').filter(Boolean);
    commitMessages = git(['log', '--format=%B%x00', `${mergeBase}..${headRef}`]).split('\0').map(s => s.trim()).filter(Boolean);
  } catch (e) {
    console.error(`✖ git hatası (${baseRef}..${headRef}): ${e.stderr?.toString().trim() || e.message}`);
    process.exit(2);
  }

  const result = evaluate({
    changedFiles,
    baseChangelog: showOrNull(mergeBase, 'CHANGELOG.md'),
    headChangelog: showOrNull(headRef, 'CHANGELOG.md'),
    commitMessages,
  });

  const messages = {
    'no-operator-change': '✓ CHANGELOG kontrolü: operatörü etkileyen değişiklik yok, girdi gerekmiyor.',
    'opt-out': '✓ CHANGELOG kontrolü: commit mesajında "Changelog: none" — atlandı.',
    'release-cut': '✓ CHANGELOG kontrolü: dalda yeni bir sürüm kesilmiş.',
    'entry-added': '✓ CHANGELOG kontrolü: [Yayınlanmadı] bölümüne girdi eklenmiş.',
  };
  if (result.ok) {
    console.log(messages[result.reason]);
    process.exit(0);
  }
  console.error('✖ CHANGELOG girdisi eksik. Operatörü etkileyen değişiklikler:');
  for (const f of result.triggering.slice(0, 20)) console.error(`   ${f}`);
  if (result.triggering.length > 20) console.error(`   … ve ${result.triggering.length - 20} dosya daha`);
  console.error(`\nCHANGELOG.md'de "${UNRELEASED}" altına girdinizi ekleyin (docs/CHANGELOG_GUIDE.md).`);
  console.error('Değişiklik gerçekten operatörü etkilemiyorsa commit mesajına "Changelog: none" satırı ekleyin.');
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
