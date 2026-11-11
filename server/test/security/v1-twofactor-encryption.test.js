process.env.OPERATOR_SECRET_ENCRYPTION_KEY = 'a'.repeat(64);
import { it } from 'node:test';
import assert from 'node:assert/strict';
import speakeasy from 'speakeasy';
import { encryptSensitive, decryptSensitive } from '../../src/utils/secretCrypto.js';
import {
  writeBackupCodes, readBackupCodes, verifySecondFactor, encryptTwoFactorSecret,
} from '../../src/services/twoFactorAuth.js';

it('şifreli sır round-trip ve legacy okuma', () => {
  const enc = encryptSensitive('JBSWY3DPEHPK3PXP');
  assert.match(enc, /^enc:v1:/);
  assert.equal(decryptSensitive(enc), 'JBSWY3DPEHPK3PXP');
  assert.equal(decryptSensitive('legacy-plain'), 'legacy-plain');
});

it('yedek kodlar tek şifreli JSON olarak saklanır', () => {
  const stored = writeBackupCodes(['aaaa1111', 'bbbb2222']);
  assert.match(stored, /^enc:v1:/);
  assert.deepEqual(readBackupCodes({ twoFactorBackupCodes: stored }), ['aaaa1111', 'bbbb2222']);
  assert.deepEqual(readBackupCodes({ twoFactorBackupCodes: ['x1'] }), ['x1']); // legacy dizi
});

it('verifySecondFactor: şifreli sır TOTP kabul eder, yanlış kodu reddeder', async () => {
  const base32 = speakeasy.generateSecret({ length: 20 }).base32;
  const user = { twoFactorSecret: encryptTwoFactorSecret(base32), twoFactorBackupCodes: writeBackupCodes(['cafe0001']) };
  const good = speakeasy.totp({ secret: base32, encoding: 'base32' });
  assert.equal((await verifySecondFactor(user, good)).ok, true);
  assert.equal((await verifySecondFactor(user, '000000')).ok, false);
});

it('verifySecondFactor: yedek kod tüketilir ve kalanlar döner', async () => {
  const user = { twoFactorSecret: null, twoFactorBackupCodes: writeBackupCodes(['cafe0001', 'cafe0002']) };
  const r = await verifySecondFactor(user, 'cafe0001');
  assert.deepEqual(r, { ok: true, usedBackupCode: true, remainingBackupCodes: ['cafe0002'] });
});

it('verifySecondFactor: legacy düz sır doğrulanır ve yeniden şifrelenip kaydedilir', async () => {
  const base32 = speakeasy.generateSecret({ length: 20 }).base32;
  let saved = false;
  const user = { twoFactorSecret: base32, twoFactorBackupCodes: null, save: async () => { saved = true; } };
  const r = await verifySecondFactor(user, speakeasy.totp({ secret: base32, encoding: 'base32' }));
  assert.equal(r.ok, true);
  assert.equal(saved, true);
  assert.match(user.twoFactorSecret, /^enc:v1:/);
  assert.equal(decryptSensitive(user.twoFactorSecret), base32);
});

it('verifySecondFactor: anahtar yokken legacy sır yine doğrulanır, yeniden şifreleme atlanır; yazma fail-closed', async () => {
  const base32 = speakeasy.generateSecret({ length: 20 }).base32;
  const key = process.env.OPERATOR_SECRET_ENCRYPTION_KEY;
  delete process.env.OPERATOR_SECRET_ENCRYPTION_KEY;
  const origWarn = console.warn; console.warn = () => {};
  try {
    let saved = false;
    const user = { twoFactorSecret: base32, save: async () => { saved = true; } };
    const r = await verifySecondFactor(user, speakeasy.totp({ secret: base32, encoding: 'base32' }));
    assert.equal(r.ok, true);
    assert.equal(saved, false);
    assert.equal(user.twoFactorSecret, base32);
    assert.throws(() => encryptTwoFactorSecret(base32), /OPERATOR_SECRET_ENCRYPTION_KEY/);
    assert.throws(() => writeBackupCodes(['a']), /OPERATOR_SECRET_ENCRYPTION_KEY/);
  } finally {
    console.warn = origWarn;
    process.env.OPERATOR_SECRET_ENCRYPTION_KEY = key;
  }
});
