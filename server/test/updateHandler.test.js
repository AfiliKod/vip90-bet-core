import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createActionRegistry } from '../src/agent/registry.js';
import { registerUpdateHandler } from '../src/agent/updatePackage.js';

describe('registerUpdateHandler', () => {
  test('geçerli manifest ve daha yeni sürümde applyMigration çağrılır', async () => {
    let calledWith = null;
    const registry = createActionRegistry();
    registerUpdateHandler(registry, {
      applyMigration: async (pkg) => { calledWith = pkg; return { applied: true }; },
      currentVersion: () => '1.0.0',
    });
    const result = await registry.execute('APPLY_UPDATE', {
      version: '1.1.0',
      manifest: [{ file: 'server/src/x.js', checksum: 'abc' }],
    });
    assert.deepStrictEqual(result, { applied: true });
    assert.strictEqual(calledWith.version, '1.1.0');
  });

  test('eski veya eşit sürüm reddedilir, applyMigration HİÇ ÇAĞRILMAZ', async () => {
    let called = false;
    const registry = createActionRegistry();
    registerUpdateHandler(registry, {
      applyMigration: async () => { called = true; },
      currentVersion: () => '2.0.0',
    });
    await assert.rejects(
      () => registry.execute('APPLY_UPDATE', { version: '1.9.0', manifest: [{ file: 'x', checksum: 'y' }] }),
      /yeni değil/,
    );
    assert.strictEqual(called, false);
  });

  test('bozuk manifest reddedilir, applyMigration ÇAĞRILMAZ', async () => {
    let called = false;
    const registry = createActionRegistry();
    registerUpdateHandler(registry, {
      applyMigration: async () => { called = true; },
      currentVersion: () => '1.0.0',
    });
    await assert.rejects(
      () => registry.execute('APPLY_UPDATE', { version: '2.0.0', manifest: [] }),
      /boş olamaz/,
    );
    assert.strictEqual(called, false);
  });
});
