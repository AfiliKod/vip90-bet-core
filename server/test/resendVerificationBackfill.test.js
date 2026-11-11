/**
 * Doğrulama maili telafi scripti (`scripts/resend-verification.js`) — saf
 * yardımcılar + onay kapısı denetimi. Gönderimin kendisi DB + Mailtrap
 * gerektirdiği için burada ölçülmez (dry-run üretimi operatör koşar).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  buildVerifyOrigin,
  isInternalDomain,
  selectionFilter,
  resolveEnvFile,
} from '../scripts/resend-verification.js';

const SCRIPT = fileURLToPath(new URL('../scripts/resend-verification.js', import.meta.url));

describe('selectionFilter — hedef kütle', () => {
  test('doğrulanmamış, silinmemiş, bot olmayan, pencere içi', () => {
    const f = selectionFilter({ since: '2026-10-20', until: '2026-10-31' });
    assert.deepStrictEqual(f.emailVerified, { $ne: true });
    assert.equal(f.deletedAt, null);
    assert.deepStrictEqual(f.isBot, { $ne: true });
    assert.ok(f.email.$exists && f.email.$ne === '');
    assert.ok(f.createdAt.$gte instanceof Date && !Number.isNaN(f.createdAt.$gte.getTime()));
    assert.ok(f.createdAt.$lt instanceof Date);
  });

  test('pencere [since, until) — alt sınır dahil, üst sınır hariç', () => {
    const f = selectionFilter({ since: '2026-10-20T00:00:00Z', until: '2026-10-20T00:00:00Z' });
    assert.equal(f.createdAt.$gte.getTime(), f.createdAt.$lt.getTime());
  });
});

describe('isInternalDomain — iç/demo ve bozuk adresler dışarıda', () => {
  test('.local TLDli demo mailler hariç (seed.local, test.local)', () => {
    assert.equal(isInternalDomain('x@seed.local'), true);
    assert.equal(isInternalDomain('x@X.SEED.LOCAL'), true);
    assert.equal(isInternalDomain('x@test.local'), true);
  });

  test('gerçek domainler dahil', () => {
    assert.equal(isInternalDomain('user@example.com'), false);
    assert.equal(isInternalDomain('user@vip90.bet'), false);
  });

  test('bozuk/adresi olmayan kayıt reddedilir (mail gönderilmez)', () => {
    assert.equal(isInternalDomain('no-at-sign'), true);
    assert.equal(isInternalDomain(''), true);
    assert.equal(isInternalDomain(undefined), true);
  });

  test('--exclude-domain listesi büyük/küçük harf gözetmeksizin çalışır', () => {
    assert.equal(isInternalDomain('a@MAIltrap.example', ['mailtrap.example']), true);
    assert.equal(isInternalDomain('a@other.example.com', ['mailtrap.example']), false);
  });
});

describe('buildVerifyOrigin — linkte kanonik app origin', () => {
  test('CLIENT_URL çoklu origin ise İLK origin kullanılır (AGENTS.md kuralı)', () => {
    assert.equal(
      buildVerifyOrigin({ CLIENT_URL: 'https://app.vip90.bet,https://vip90.bet' }),
      'https://app.vip90.bet',
    );
  });

  test('sondaki slash temizlenir, boş env boş döner', () => {
    assert.equal(buildVerifyOrigin({ CLIENT_URL: 'https://app.vip90.bet/' }), 'https://app.vip90.bet');
    assert.equal(buildVerifyOrigin({}), '');
  });
});

describe('resolveEnvFile — uygulamanın kendi env dosyası', () => {
  test('script server/.envi yükler (cwd bayat public_html/.env bile olsa)', () => {
    const resolved = resolveEnvFile();
    assert.ok(resolved.endsWith('/server/.env'), `beklenen .../server/.env, gelen: ${resolved}`);
    assert.ok(!resolved.includes('/public_html/'), 'deploy kökündeki bayat .env kullanılmamalı');
    // app.js ile aynı dosya: app.js `path.join(__dirname,'server','.env') kullanır.
    const app = readFileSync(fileURLToPath(new URL('../../app.js', import.meta.url)), 'utf8');
    assert.match(app, /config\(\{ path: path\.join\(__dirname, 'server', '\.env'\)/);
  });
});

describe('script sabitleri ve onay kapısı', () => {
  test('TTL, controllers/auth.js ile aynı (link süresi kayıtlarla aynı varsayılır)', () => {
    const grab = (path) => readFileSync(path, 'utf8').match(/EMAIL_VERIFY_TTL_HOURS = (\d+)/)?.[1];
    const scriptTtl = grab(SCRIPT);
    const authTtl = grab(fileURLToPath(new URL('../src/controllers/auth.js', import.meta.url)));
    assert.ok(scriptTtl && authTtl, 'iki dosyada da EMAIL_VERIFY_TTL_HOURS bulunmalı');
    assert.equal(scriptTtl, authTtl);
  });

  test('--yes yoksa DB bağlanmadan çıkar (yalnız dry-run sayar)', () => {
    const r = spawnSync(process.execPath, [SCRIPT], {
      encoding: 'utf8',
      timeout: 20000,
      env: { ...process.env, NODE_ENV: 'production' },
    });
    assert.equal(r.status, 1, `beklenen çıkış 1, gerçek: ${r.status} / ${r.stderr}`);
    assert.match(r.stderr, /--yes/);
    assert.ok(!/Hedef\s*:/.test(r.stdout), 'onaysız koşu sayım yapmamalı (DB sorgulanmamalı)');
  });

});
