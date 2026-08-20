import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { generateKeyPairSync } from 'crypto';
import { signCommand, verifyCommand } from '../src/agent/signature.js';

let keys;
before(() => {
  keys = generateKeyPairSync('ed25519');
});

const cmd = () => ({ actionId: 'REINDEX_DB', params: { target: 'cache_table' } });

describe('signCommand / verifyCommand', () => {
  test('doğru anahtarla imzalanan komut doğrulanır', () => {
    const signed = signCommand(cmd(), keys.privateKey);
    assert.strictEqual(verifyCommand(signed, keys.publicKey), true);
  });

  test('imza alanı taşır ama payload’ı bozmaz', () => {
    const signed = signCommand(cmd(), keys.privateKey);
    assert.strictEqual(signed.actionId, 'REINDEX_DB');
    assert.strictEqual(typeof signed.signature, 'string');
  });

  test('payload değiştirilirse (aynı imzayla) doğrulama başarısız olur', () => {
    const signed = signCommand(cmd(), keys.privateKey);
    const tampered = { ...signed, params: { target: 'users_table' } };
    assert.strictEqual(verifyCommand(tampered, keys.publicKey), false);
  });

  test('yanlış açık anahtarla doğrulama başarısız olur', () => {
    const otherKeys = generateKeyPairSync('ed25519');
    const signed = signCommand(cmd(), keys.privateKey);
    assert.strictEqual(verifyCommand(signed, otherKeys.publicKey), false);
  });

  test('imza alanı eksikse doğrulama başarısız olur, throw etmez', () => {
    assert.strictEqual(verifyCommand({ actionId: 'X', params: {} }, keys.publicKey), false);
  });

  test('bozuk/rastgele imza stringi throw etmez, false döner', () => {
    const signed = signCommand(cmd(), keys.privateKey);
    assert.strictEqual(verifyCommand({ ...signed, signature: 'çöp-veri' }, keys.publicKey), false);
  });

  test('actionId değiştirilirse (imzalanan alanın kendisi) doğrulama başarısız olur', () => {
    const signed = signCommand(cmd(), keys.privateKey);
    const tampered = { ...signed, actionId: 'DELETE_ALL' };
    assert.strictEqual(verifyCommand(tampered, keys.publicKey), false);
  });

  test('imzayla ilgisiz ek bir alan (envelope dışı meta) doğrulamayı bozmaz', () => {
    // Yalnızca actionId+params imzalanır; envelope dışı taşıyıcı alanlar
    // (ör. gönderim zamanı gibi imza kapsamına girmeyen meta) etkilemez.
    const signed = signCommand(cmd(), keys.privateKey);
    const withMeta = { ...signed, receivedAt: '2026-08-20T00:00:00Z' };
    assert.strictEqual(verifyCommand(withMeta, keys.publicKey), true);
  });
});


describe('signCommand — approvedBy imza kapsamında (D7 sertleştirmesi)', () => {
  test('approvedBy alanı taşındığında imza kapsamına girer', () => {
    const signed = signCommand({ actionId: 'RUN_MIGRATION', params: {}, approvedBy: 'rep-1' }, keys.privateKey);
    assert.strictEqual(signed.approvedBy, 'rep-1');
    assert.strictEqual(verifyCommand(signed, keys.publicKey), true);
  });

  test('approvedBy imzalandıktan sonra değiştirilirse doğrulama başarısız olur', () => {
    const signed = signCommand({ actionId: 'RUN_MIGRATION', params: {}, approvedBy: 'rep-1' }, keys.privateKey);
    const tampered = { ...signed, approvedBy: 'rep-EVIL' };
    assert.strictEqual(verifyCommand(tampered, keys.publicKey), false);
  });

  test('approvedBy hiç yoksa (salt-okunur eylem) imza yine geçerli — alan opsiyonel', () => {
    const signed = signCommand({ actionId: 'REINDEX_DB', params: {} }, keys.privateKey);
    assert.strictEqual(verifyCommand(signed, keys.publicKey), true);
  });
});
