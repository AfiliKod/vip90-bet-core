import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { generateKeyPairSync } from 'crypto';
import { createApprovalGate } from '../src/agent/approvalGate.js';
import { signCommand, verifyCommand } from '../src/agent/signature.js';
import { createActionRegistry } from '../src/agent/registry.js';
import { createLocalAgent } from '../src/agent/localAgent.js';

/**
 * Uçtan uca kanıt (D7 kabul kriteri): "Salt-okunur eylemler otomatik;
 * yıkıcı eylemler temsilci imzası olmadan çalışmıyor." Merkez tarafı
 * (approvalGate + signCommand) ile lokal ajan tarafı (D6) birlikte.
 *
 * Güvence yalnızca sürece güvenmekle sınırlı değil: approvedBy imza
 * kapsamına dahil edildi (signature.js) ve localAgent yıkıcı eylemde
 * bunu YAPISAL OLARAK zorunlu kılıyor — biri onay adımını atlayıp
 * doğrudan imzalamaya kalksa bile lokal ajan çalıştırmayı reddeder.
 */
let keys;
before(() => { keys = generateKeyPairSync('ed25519'); });

function setupLocalAgent(command) {
  let executed = null;
  const registry = createActionRegistry();
  registry.register('REINDEX_DB', async (p) => { executed = p; return { ok: true }; });
  registry.register('RUN_MIGRATION', async (p) => { executed = p; return { ok: true }; });
  const agent = createLocalAgent({
    registry, publicKey: keys.publicKey,
    pull: async () => command,
    isEnabled: async () => true,
  });
  return { agent, wasExecuted: () => executed };
}

describe('Uçtan uca: propose → gate → sign → lokal ajan', () => {
  test('salt-okunur eylem: propose sonrası hemen imzalanıp ÇALIŞIR, onay beklemez', async () => {
    const gate = createApprovalGate();
    const proposed = gate.propose({ actionId: 'REINDEX_DB', params: { target: 'cache_table' } });
    assert.strictEqual(proposed.status, 'auto-approved');

    const command = signCommand({ actionId: proposed.actionId, params: proposed.params }, keys.privateKey);
    const { agent, wasExecuted } = setupLocalAgent(command);
    const result = await agent.tick();

    assert.strictEqual(result.executed, 'REINDEX_DB');
    assert.deepStrictEqual(wasExecuted(), { target: 'cache_table' });
  });

  test('yıkıcı eylem: onay adımı atlanıp doğrudan imzalansa BİLE lokal ajan ÇALIŞTIRMAZ', async () => {
    const gate = createApprovalGate();
    const proposed = gate.propose({ actionId: 'RUN_MIGRATION', params: { version: 'x' } });
    assert.strictEqual(proposed.status, 'pending-approval');

    // Onay adımını (approve()) atlayıp doğrudan imzalamaya kalkışan bir
    // çağıranı simüle ediyoruz — kodlama hatası ya da kötü niyet fark etmez.
    const skippedApproval = signCommand({ actionId: proposed.actionId, params: proposed.params }, keys.privateKey);
    const { agent, wasExecuted } = setupLocalAgent(skippedApproval);
    const result = await agent.tick();

    assert.strictEqual(result.rejected, 'missing-approval');
    assert.strictEqual(wasExecuted(), null); // çalıştırılmadı
  });

  test('doğru akış: temsilci approve() çağırınca üretilen komut ÇALIŞIR', async () => {
    const gate = createApprovalGate();
    const proposed = gate.propose({ actionId: 'RUN_MIGRATION', params: { version: 'x' } });
    const approved = gate.approve(proposed.proposalId, 'rep-1');
    assert.strictEqual(approved.approvedBy, 'rep-1');

    const command = signCommand({ actionId: approved.actionId, params: approved.params, approvedBy: approved.approvedBy }, keys.privateKey);
    assert.strictEqual(verifyCommand(command, keys.publicKey), true);

    const { agent, wasExecuted } = setupLocalAgent(command);
    const result = await agent.tick();
    assert.strictEqual(result.executed, 'RUN_MIGRATION');
    assert.deepStrictEqual(wasExecuted(), { version: 'x' });
  });

  test('onay sonrası approvedBy kurcalanırsa (başka temsilci adı yazılırsa) imza geçersiz olur', async () => {
    const gate = createApprovalGate();
    const proposed = gate.propose({ actionId: 'RUN_MIGRATION', params: {} });
    const approved = gate.approve(proposed.proposalId, 'rep-1');
    const command = signCommand({ actionId: approved.actionId, params: approved.params, approvedBy: approved.approvedBy }, keys.privateKey);

    const tampered = { ...command, approvedBy: 'rep-BASKASI' };
    const { agent, wasExecuted } = setupLocalAgent(tampered);
    const result = await agent.tick();
    assert.strictEqual(result.rejected, 'invalid-signature');
    assert.strictEqual(wasExecuted(), null);
  });
});
