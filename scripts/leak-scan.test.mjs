#!/usr/bin/env node
/**
 * scripts/leak-scan.mjs için testler (node:test).
 *
 * Fixture'lar çalışma anında birleştirilerek kurulur; bu dosyanın kendisi
 * kaynak kodda gizli değer içermez. Tarayıcı da kendi dosyalarını (bu test ve
 * scripts/leak-scan.mjs) tarama dışı bırakır.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanText, scanTree } from './leak-scan.mjs';

// Fixture parçaları — çalışma anında birleştirilir.
const PRIVATE_KEY = '-----BEGIN ' + 'RSA PRIVATE KEY-----';
const PROD_PATH = '/home/' + 'vip90/app';
const ALLOWED_EMAIL = 'admin@example.com';
const INVALID_IBAN = 'TR000000000000000000000000';

/**
 * Mod-97 kurallarına göre geçerli bir TR IBAN'ı üretir (kaynakta sabit değer yok).
 * TR biçimi: "TR" + 2 kontrol hanesi + 22 hanelik hesap numarası.
 */
function makeValidIban() {
  const country = 'TR';
  const bban = '1' + '0'.repeat(20) + '1'; // 22 hane
  const rearranged = bban + country + '00';
  let mod = 0;
  for (const c of rearranged) {
    const v = /\d/.test(c) ? c : String(c.charCodeAt(0) - 55);
    for (const d of v) mod = (mod * 10 + Number(d)) % 97;
  }
  const check = String(98 - mod).padStart(2, '0');
  return country + check + bban;
}

test('özel anahtar bulunur', () => {
  const hits = scanText('fixture.txt', PRIVATE_KEY);
  assert.ok(hits.length >= 1, 'özel anahtar için en az bir bulgu beklenir');
  assert.match(hits[0], /^fixture\.txt:1\s+özel anahtar$/);
});

test('prod sunucu yolu bulunur', () => {
  const hits = scanText('fixture.txt', PROD_PATH);
  assert.ok(hits.length >= 1, 'prod sunucu yolu için en az bir bulgu beklenir');
  assert.match(hits[0], /^fixture\.txt:1\s+prod sunucu yolu$/);
});

test('izinli e-posta bulgu üretmez', () => {
  const hits = scanText('fixture.txt', ALLOWED_EMAIL);
  assert.deepEqual(hits, []);
});

test('geçersiz IBAN bulgu üretmez', () => {
  const hits = scanText('fixture.txt', INVALID_IBAN);
  assert.deepEqual(hits, []);
});

test('geçerli IBAN bulunur', () => {
  const iban = makeValidIban();
  const hits = scanText('fixture.txt', iban);
  assert.equal(hits.length, 1);
  assert.match(hits[0], /^fixture\.txt:1\s+geçerli IBAN/);
});

test('bulgu satır numarasını taşır', () => {
  const hits = scanText('fixture.txt', `ilk satır\n${PRIVATE_KEY}\nson satır`);
  assert.ok(hits.some(h => h.startsWith('fixture.txt:2 ')), 'bulgu 2. satırda olmalı');
});

test('scanTree yalnızca kayıtlı dosyaları tarar ve kendi dosyalarını atlar', () => {
  const dir = mkdtempSync(join(tmpdir(), 'leak-scan-test-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });

    writeFileSync(join(dir, 'app.txt'), `${PROD_PATH}\n`);
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    writeFileSync(join(dir, 'scripts', 'leak-scan.mjs'), `${PRIVATE_KEY}\n`);
    writeFileSync(join(dir, 'scripts', 'leak-scan.test.mjs'), `${PRIVATE_KEY}\n`);
    writeFileSync(join(dir, 'image.bin'), Buffer.from([0x00, 0x01, 0x02, 0x00]));
    execFileSync('git', ['add', '--', '.'], { cwd: dir });

    const hits = scanTree(dir);
    assert.equal(hits.length, 1, `tek bulgu beklenir, alınan: ${JSON.stringify(hits)}`);
    assert.match(hits[0], /^app\.txt:1\s+prod sunucu yolu$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
