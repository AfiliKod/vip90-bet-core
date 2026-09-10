import { test, describe } from 'node:test';
import assert from 'node:assert';

// Test'in kendi anahtarını kullanması için gerçek .env'e bağımlı olmasın.
process.env.OPERATOR_SECRET_ENCRYPTION_KEY = 'a'.repeat(64);

const { encryptSecret, decryptSecret, secretsMatch } = await import('../src/utils/secretCrypto.js');

describe('secretCrypto', () => {
  test('encrypt→decrypt round-trip aynı düz metni verir', () => {
    const plain = 'super-secret-value-1234567890';
    const encrypted = encryptSecret(plain);
    assert.strictEqual(decryptSecret(encrypted), plain);
  });

  test('her encryptSecret çağrısı farklı bir ciphertext üretir (rastgele IV)', () => {
    const plain = 'aynı-değer';
    const a = encryptSecret(plain);
    const b = encryptSecret(plain);
    assert.notStrictEqual(a, b);
    assert.strictEqual(decryptSecret(a), plain);
    assert.strictEqual(decryptSecret(b), plain);
  });

  test('secretsMatch doğru değerle true döner', () => {
    const plain = 'doğru-secret';
    const encrypted = encryptSecret(plain);
    assert.strictEqual(secretsMatch(plain, encrypted), true);
  });

  test('secretsMatch yanlış değerle false döner (throw etmez)', () => {
    const encrypted = encryptSecret('gerçek-secret');
    assert.strictEqual(secretsMatch('yanlış-secret', encrypted), false);
  });

  test('secretsMatch bozuk/geçersiz payload ile false döner (throw etmez)', () => {
    assert.strictEqual(secretsMatch('herhangi-bir-şey', 'bozuk-payload'), false);
    assert.strictEqual(secretsMatch('herhangi-bir-şey', ''), false);
  });

  test('decryptSecret yanlış anahtarla şifrelenmiş veriyi çözemez (authTag mismatch → throw)', () => {
    const encrypted = encryptSecret('bir-değer');
    const originalKey = process.env.OPERATOR_SECRET_ENCRYPTION_KEY;
    process.env.OPERATOR_SECRET_ENCRYPTION_KEY = 'b'.repeat(64);
    assert.throws(() => decryptSecret(encrypted));
    process.env.OPERATOR_SECRET_ENCRYPTION_KEY = originalKey;
  });
});
