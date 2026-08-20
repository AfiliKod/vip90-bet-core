import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { generateKeyPairSync } from 'crypto';
import { createInMemorySigningProvider } from '../src/agent/signingProvider.js';
import { signCommandWithProvider, verifyCommand, signCommand } from '../src/agent/signature.js';

let keys;
before(() => { keys = generateKeyPairSync('ed25519'); });

describe('createInMemorySigningProvider + signCommandWithProvider', () => {
  test('sağlayıcı ile üretilen imza verifyCommand ile doğrulanır', async () => {
    const provider = createInMemorySigningProvider(keys.privateKey);
    const signed = await signCommandWithProvider({ actionId: 'REINDEX_DB', params: { target: 'x' } }, provider);
    assert.strictEqual(verifyCommand(signed, keys.publicKey), true);
  });

  test('sağlayıcı arayüzü yalnızca sign(buffer)->Promise<Buffer> bilir — çağıran kod anahtarı hiç görmez', async () => {
    const provider = createInMemorySigningProvider(keys.privateKey);
    assert.strictEqual(typeof provider.sign, 'function');
    // signCommandWithProvider'a asla ham privateKey geçirilmiyor, yalnızca provider.
    const signed = await signCommandWithProvider({ actionId: 'CLEAR_CACHE', params: {} }, provider);
    assert.strictEqual(typeof signed.signature, 'string');
  });

  test('bellek-içi sağlayıcı ile signCommand (D6, ham anahtar) aynı doğrulanabilir sonucu üretir — arayüz değişse de kontrat aynı', async () => {
    const direct = signCommand({ actionId: 'REINDEX_DB', params: { a: 1 } }, keys.privateKey);
    const provider = createInMemorySigningProvider(keys.privateKey);
    const viaProvider = await signCommandWithProvider({ actionId: 'REINDEX_DB', params: { a: 1 } }, provider);
    assert.strictEqual(verifyCommand(direct, keys.publicKey), true);
    assert.strictEqual(verifyCommand(viaProvider, keys.publicKey), true);
  });

  test('payload değiştirilirse sağlayıcı tabanlı imza da geçersiz olur', async () => {
    const provider = createInMemorySigningProvider(keys.privateKey);
    const signed = await signCommandWithProvider({ actionId: 'REINDEX_DB', params: { target: 'cache' } }, provider);
    const tampered = { ...signed, params: { target: 'users' } };
    assert.strictEqual(verifyCommand(tampered, keys.publicKey), false);
  });

  test('sağlayıcının sign() metodu patlarsa signCommandWithProvider hatayı iletir, yutmaz', async () => {
    const brokenProvider = { sign: async () => { throw new Error('HSM erişilemiyor'); } };
    await assert.rejects(() => signCommandWithProvider({ actionId: 'X', params: {} }, brokenProvider), /HSM erişilemiyor/);
  });
});
