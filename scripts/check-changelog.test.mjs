import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, requiresEntry, parseChangelog } from './check-changelog.mjs';

const LOG = (unreleased, versions = ['0.4.0']) =>
  `# Changelog\n\n## [Yayınlanmadı]\n\n${unreleased}\n\n${versions.map(v => `## [${v}] — 2026-10-08\n\n- x\n`).join('\n')}`;

describe('requiresEntry', () => {
  test('sunucu, istemci, Docker ve env örnekleri girdi ister', () => {
    for (const p of ['server/src/app.js', 'client/src/App.jsx', 'installer/page.js', 'Dockerfile',
      'docker-compose.yml', 'server/.env.example', 'package.json', 'server/package-lock.json',
      'server/src/premium/igames', 'scripts/backup-db.sh']) {
      assert.equal(requiresEntry(p), true, p);
    }
  });
  test('testler, belgeler ve bakım betikleri girdi istemez', () => {
    for (const p of ['server/test/x.test.js', 'client/src/utils/a.test.js', 'client/scripts/__tests__/b.test.mjs',
      'docs/RUNBOOK.md', 'AGENTS.md', 'README.md', 'client/README.md', 'scripts/sync-core.mjs',
      'scripts/release.mjs', 'scripts/check-changelog.mjs', '.github/workflows/deploy.yml']) {
      assert.equal(requiresEntry(p), false, p);
    }
  });
});

describe('evaluate', () => {
  test('operatörü etkileyen değişiklik yoksa geçer', () => {
    const r = evaluate({ changedFiles: ['docs/a.md', 'server/test/a.test.js'], baseChangelog: LOG(''), headChangelog: LOG('') });
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'no-operator-change');
  });
  test('kod değişip girdi yoksa düşer ve tetikleyen dosyaları listeler', () => {
    const r = evaluate({ changedFiles: ['server/src/app.js', 'docs/a.md'], baseChangelog: LOG(''), headChangelog: LOG('') });
    assert.equal(r.ok, false);
    assert.deepEqual(r.triggering, ['server/src/app.js']);
  });
  test('[Yayınlanmadı] altına girdi eklenince geçer', () => {
    const r = evaluate({ changedFiles: ['server/src/app.js', 'CHANGELOG.md'], baseChangelog: LOG(''), headChangelog: LOG('### Yeni şey\nAçıklama.') });
    assert.equal(r.reason, 'entry-added');
  });
  test('girdi başka bir sürüm bölümüne yazılmışsa geçmez', () => {
    const head = LOG('', ['0.4.0']).replace('- x', '- x\n- sonradan eklenen');
    const r = evaluate({ changedFiles: ['server/src/app.js', 'CHANGELOG.md'], baseChangelog: LOG(''), headChangelog: head });
    assert.equal(r.ok, false);
  });
  test('mevcut girdisi olan bölümde içerik değişince geçer', () => {
    const r = evaluate({ changedFiles: ['client/src/a.jsx', 'CHANGELOG.md'], baseChangelog: LOG('### A'), headChangelog: LOG('### B\n\n### A') });
    assert.equal(r.ok, true);
  });
  test('dalda yeni sürüm kesildiyse geçer', () => {
    const r = evaluate({ changedFiles: ['package.json', 'CHANGELOG.md'], baseChangelog: LOG('### A'), headChangelog: LOG('', ['0.5.0', '0.4.0']) });
    assert.equal(r.reason, 'release-cut');
  });
  test('"Changelog: none" satırı kontrolü atlatır', () => {
    const r = evaluate({ changedFiles: ['server/src/a.js'], baseChangelog: LOG(''), headChangelog: LOG(''),
      commitMessages: ['refactor: yorum düzeltmesi\n\nChangelog: none\n\nCo-Authored-By: X'] });
    assert.equal(r.reason, 'opt-out');
  });
  test('"Changelog: none" yalnız ayrı satırda geçerli', () => {
    const r = evaluate({ changedFiles: ['server/src/a.js'], baseChangelog: LOG(''), headChangelog: LOG(''),
      commitMessages: ['fix: Changelog: none gibi bir metin satır içinde'] });
    assert.equal(r.ok, false);
  });
});

describe('parseChangelog', () => {
  test('bölümü ve sürümleri çıkarır', () => {
    const p = parseChangelog(LOG('### X', ['0.4.0', '0.3.0']));
    assert.equal(p.unreleased, '### X');
    assert.deepEqual(p.versions, ['0.4.0', '0.3.0']);
  });
});

describe('komut satırı (geçici git deposu)', () => {
  const script = join(dirname(fileURLToPath(import.meta.url)), 'check-changelog.mjs');
  const run = (cwd, args = []) => {
    try { execFileSync('node', [script, ...args], { cwd, stdio: 'pipe' }); return 0; }
    catch (e) { return e.status; }
  };
  const git = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: 'pipe' });

  test('girdisiz kod değişikliğinde 1, girdi eklenince 0 döner', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cl-'));
    try {
      git(dir, 'init', '-q', '-b', 'main');
      git(dir, 'config', 'user.email', 't@example.com'); git(dir, 'config', 'user.name', 't');
      writeFileSync(join(dir, 'CHANGELOG.md'), LOG(''));
      mkdirSync(join(dir, 'server'));
      writeFileSync(join(dir, 'server', 'a.js'), '1');
      git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'ilk');
      git(dir, 'checkout', '-qb', 'is');
      writeFileSync(join(dir, 'server', 'a.js'), '2');
      git(dir, 'commit', '-qam', 'kod');
      assert.equal(run(dir, ['--base', 'main']), 1);
      writeFileSync(join(dir, 'CHANGELOG.md'), LOG('### Değişiklik'));
      git(dir, 'commit', '-qam', 'girdi');
      assert.equal(run(dir, ['--base', 'main']), 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
