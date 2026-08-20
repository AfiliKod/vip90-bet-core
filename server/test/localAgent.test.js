import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { generateKeyPairSync } from 'crypto';
import { createLocalAgent } from '../src/agent/localAgent.js';
import { createActionRegistry } from '../src/agent/registry.js';
import { signCommand } from '../src/agent/signature.js';

let keys, otherKeys;
before(() => {
  keys = generateKeyPairSync('ed25519');
  otherKeys = generateKeyPairSync('ed25519');
});

function setup({ command, enabled = true } = {}) {
  let executed = null;
  const registry = createActionRegistry();
  registry.register('REINDEX_DB', async (params) => { executed = params; return { ok: true }; });
  const agent = createLocalAgent({
    registry,
    publicKey: keys.publicKey,
    pull: async () => command ?? null,
    isEnabled: async () => enabled,
  });
  return { agent, wasExecuted: () => executed };
}

describe('createLocalAgent.tick', () => {
  test('devre dışıysa pull hiç çağrılmaz, hiçbir şey çalışmaz', async () => {
    let pullCalled = false;
    const registry = createActionRegistry();
    const agent = createLocalAgent({
      registry, publicKey: keys.publicKey,
      pull: async () => { pullCalled = true; return null; },
      isEnabled: async () => false,
    });
    const result = await agent.tick();
    assert.strictEqual(pullCalled, false);
    assert.strictEqual(result.skipped, 'disabled');
  });

  test('bekleyen komut yoksa sessizce geçer', async () => {
    const { agent } = setup({ command: null });
    const result = await agent.tick();
    assert.strictEqual(result.skipped, 'no-command');
  });

  test('geçerli imzalı ve kayıtlı eylem çalıştırılır', async () => {
    const command = signCommand({ actionId: 'REINDEX_DB', params: { target: 'cache_table' } }, keys.privateKey);
    const { agent, wasExecuted } = setup({ command });
    const result = await agent.tick();
    assert.strictEqual(result.executed, 'REINDEX_DB');
    assert.deepStrictEqual(wasExecuted(), { target: 'cache_table' });
  });

  test('yanlış anahtarla imzalanmış komut ÇALIŞTIRILMAZ', async () => {
    const command = signCommand({ actionId: 'REINDEX_DB', params: { target: 'x' } }, otherKeys.privateKey);
    const { agent, wasExecuted } = setup({ command });
    const result = await agent.tick();
    assert.strictEqual(result.rejected, 'invalid-signature');
    assert.strictEqual(wasExecuted(), null);
  });

  test('imza geçerli ama eylem kayıtlı değilse ÇALIŞTIRILMAZ', async () => {
    const command = signCommand({ actionId: 'DELETE_EVERYTHING', params: {} }, keys.privateKey);
    const { agent, wasExecuted } = setup({ command });
    const result = await agent.tick();
    assert.strictEqual(result.rejected, 'unknown-action');
    assert.strictEqual(wasExecuted(), null);
  });

  test('imzalandıktan sonra params değiştirilmiş komut ÇALIŞTIRILMAZ', async () => {
    const command = signCommand({ actionId: 'REINDEX_DB', params: { target: 'cache_table' } }, keys.privateKey);
    const tampered = { ...command, params: { target: 'users_table' } };
    const { agent, wasExecuted } = setup({ command: tampered });
    const result = await agent.tick();
    assert.strictEqual(result.rejected, 'invalid-signature');
    assert.strictEqual(wasExecuted(), null);
  });

  test('registry.execute patlarsa tick throw etmez, sonuçta hata bilgisi taşınır', async () => {
    const registry = createActionRegistry();
    registry.register('REINDEX_DB', async () => { throw new Error('disk dolu'); });
    const command = signCommand({ actionId: 'REINDEX_DB', params: {} }, keys.privateKey);
    const agent = createLocalAgent({ registry, publicKey: keys.publicKey, pull: async () => command, isEnabled: async () => true });
    const result = await agent.tick();
    assert.strictEqual(result.error, 'disk dolu');
  });

  test('lokal registry’de kayıtlı ama merkezi katalogda tanımsız eylem fail-closed reddedilir', async () => {
    const registry = createActionRegistry();
    let executed = false;
    registry.register('LOCAL_ONLY_ACTION', async () => { executed = true; });
    const command = signCommand({ actionId: 'LOCAL_ONLY_ACTION', params: {} }, keys.privateKey);
    const agent = createLocalAgent({ registry, publicKey: keys.publicKey, pull: async () => command, isEnabled: async () => true });
    const result = await agent.tick();
    assert.strictEqual(result.rejected, 'unclassified-risk');
    assert.strictEqual(executed, false);
  });
});


describe('createLocalAgent.tick — yıkıcı eylemde temsilci onayı zorunlu (D7)', () => {
  test('yıkıcı eylem approvedBy TAŞIMIYORSA imza geçerli olsa bile ÇALIŞTIRILMAZ', async () => {
    const registry = createActionRegistry();
    let executed = false;
    registry.register('RUN_MIGRATION', async () => { executed = true; return { ok: true }; });
    // approvedBy yok — approvalGate'in onay adımından geçmemiş demek.
    const command = signCommand({ actionId: 'RUN_MIGRATION', params: {} }, keys.privateKey);
    const agent = createLocalAgent({ registry, publicKey: keys.publicKey, pull: async () => command, isEnabled: async () => true });
    const result = await agent.tick();
    assert.strictEqual(result.rejected, 'missing-approval');
    assert.strictEqual(executed, false);
  });

  test('yıkıcı eylem approvedBy TAŞIYORSA (imza kapsamında) çalıştırılır', async () => {
    const registry = createActionRegistry();
    let executed = false;
    registry.register('RUN_MIGRATION', async () => { executed = true; return { ok: true }; });
    const command = signCommand({ actionId: 'RUN_MIGRATION', params: {}, approvedBy: 'rep-1' }, keys.privateKey);
    const agent = createLocalAgent({ registry, publicKey: keys.publicKey, pull: async () => command, isEnabled: async () => true });
    const result = await agent.tick();
    assert.strictEqual(result.executed, 'RUN_MIGRATION');
    assert.strictEqual(executed, true);
  });

  test('salt-okunur eylem approvedBy TAŞIMASA da çalıştırılır — kapı yalnızca yıkıcı eylemde devrede', async () => {
    const registry = createActionRegistry();
    registry.register('REINDEX_DB', async () => ({ ok: true }));
    const command = signCommand({ actionId: 'REINDEX_DB', params: {} }, keys.privateKey);
    const agent = createLocalAgent({ registry, publicKey: keys.publicKey, pull: async () => command, isEnabled: async () => true });
    const result = await agent.tick();
    assert.strictEqual(result.executed, 'REINDEX_DB');
  });

  test('approvedBy alanı kurcalanmışsa (imzadan sonra değiştirilmiş) imza doğrulaması zaten reddeder', async () => {
    const registry = createActionRegistry();
    let executed = false;
    registry.register('RUN_MIGRATION', async () => { executed = true; });
    const command = signCommand({ actionId: 'RUN_MIGRATION', params: {}, approvedBy: 'rep-1' }, keys.privateKey);
    const tampered = { ...command, approvedBy: 'rep-SAHTE' };
    const agent = createLocalAgent({ registry, publicKey: keys.publicKey, pull: async () => tampered, isEnabled: async () => true });
    const result = await agent.tick();
    assert.strictEqual(result.rejected, 'invalid-signature');
    assert.strictEqual(executed, false);
  });
});
