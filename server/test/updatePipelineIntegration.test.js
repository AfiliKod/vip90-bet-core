import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { generateKeyPairSync } from 'crypto';
import { createApprovalGate } from '../src/agent/approvalGate.js';
import { signCommand, verifyCommand } from '../src/agent/signature.js';
import { createActionRegistry } from '../src/agent/registry.js';
import { createLocalAgent } from '../src/agent/localAgent.js';
import { registerUpdateHandler } from '../src/agent/updatePackage.js';

/**
 * D9 kabul kriteri, uçtan uca: "Güncelleme operatör onayıyla uygulanıyor,
 * paket imzası doğrulanıyor." Yeni bir mekanizma yok — APPLY_UPDATE,
 * D6/D7/D8'in aynı boru hattından geçen yıkıcı bir Action-ID.
 */
let keys;
before(() => { keys = generateKeyPairSync('ed25519'); });

function setupAgentWithUpdateHandler({ currentVersion, applyMigration }) {
  const registry = createActionRegistry();
  registerUpdateHandler(registry, { applyMigration, currentVersion: () => currentVersion });
  return registry;
}

describe('Uçtan uca: güncelleme paketi — onay + imza olmadan uygulanmaz', () => {
  test('onay atlanıp doğrudan imzalanan güncelleme UYGULANMAZ', async () => {
    const gate = createApprovalGate();
    const proposed = gate.propose({
      actionId: 'APPLY_UPDATE',
      params: { version: '1.1.0', manifest: [{ file: 'x.js', checksum: 'a' }] },
    });
    assert.strictEqual(proposed.status, 'pending-approval'); // yıkıcı → otomatik onaylanmaz

    // Onay adımını atlayıp doğrudan imzalamaya kalkışan çağıran senaryosu.
    const skippedApproval = signCommand({ actionId: proposed.actionId, params: proposed.params }, keys.privateKey);

    let applied = false;
    const registry = setupAgentWithUpdateHandler({ currentVersion: '1.0.0', applyMigration: async () => { applied = true; } });
    const agent = createLocalAgent({ registry, publicKey: keys.publicKey, pull: async () => skippedApproval, isEnabled: async () => true });
    const result = await agent.tick();

    assert.strictEqual(result.rejected, 'missing-approval');
    assert.strictEqual(applied, false);
  });

  test('operatör onaylayıp imzaladıktan sonra güncelleme UYGULANIR', async () => {
    const gate = createApprovalGate();
    const proposed = gate.propose({
      actionId: 'APPLY_UPDATE',
      params: { version: '1.1.0', manifest: [{ file: 'x.js', checksum: 'a' }] },
    });
    const approved = gate.approve(proposed.proposalId, 'operator-42');
    const command = signCommand(
      { actionId: approved.actionId, params: approved.params, approvedBy: approved.approvedBy },
      keys.privateKey,
    );
    assert.strictEqual(verifyCommand(command, keys.publicKey), true);

    let appliedPkg = null;
    const registry = setupAgentWithUpdateHandler({
      currentVersion: '1.0.0',
      applyMigration: async (pkg) => { appliedPkg = pkg; return { ok: true }; },
    });
    const agent = createLocalAgent({ registry, publicKey: keys.publicKey, pull: async () => command, isEnabled: async () => true });
    const result = await agent.tick();

    assert.strictEqual(result.executed, 'APPLY_UPDATE');
    assert.strictEqual(appliedPkg.version, '1.1.0');
  });

  test('operatör onaylasa bile eski sürüme "güncelleme" uygulanmaz (ek güvenlik katmanı)', async () => {
    const gate = createApprovalGate();
    const proposed = gate.propose({
      actionId: 'APPLY_UPDATE',
      params: { version: '0.9.0', manifest: [{ file: 'x.js', checksum: 'a' }] },
    });
    const approved = gate.approve(proposed.proposalId, 'operator-1');
    const command = signCommand(
      { actionId: approved.actionId, params: approved.params, approvedBy: approved.approvedBy },
      keys.privateKey,
    );

    let applied = false;
    const registry = setupAgentWithUpdateHandler({ currentVersion: '1.0.0', applyMigration: async () => { applied = true; } });
    const agent = createLocalAgent({ registry, publicKey: keys.publicKey, pull: async () => command, isEnabled: async () => true });
    const result = await agent.tick();

    // İmza ve onay geçerli olsa bile, iş mantığı (eski sürüm) reddeder —
    // registry.execute içindeki hata tick() tarafından yutulmaz, error alanında taşınır.
    assert.strictEqual(applied, false);
    assert.ok(result.error?.includes('yeni değil'));
  });
});
