import { test, describe } from 'node:test';
import assert from 'node:assert';
import { compareVersions, createMigrationRunner } from '../migrations/runner.js';

const mig = (version, name, up = async () => {}) => ({ version, name, up });

describe('compareVersions', () => {
  test('sayısal karşılaştırma yapar (sözcük sırası değil)', () => {
    assert.strictEqual(compareVersions('0.10.0', '0.9.0'), 1);
    assert.strictEqual(compareVersions('0.9.0', '0.10.0'), -1);
    assert.strictEqual(compareVersions('1.0.0', '1.0.0'), 0);
    assert.strictEqual(compareVersions('2.0.0', '1.9.9'), 1);
  });
});

describe('createMigrationRunner', () => {
  const setup = ({ applied = [], migrations } = {}) => {
    const marked = [];
    const runner = createMigrationRunner({
      migrations: migrations ?? [
        mig('0.1.0', '0001_baseline'),
        mig('0.2.0', '0002_add_index'),
        mig('0.10.0', '0003_big_change'),
      ],
      getApplied: async () => [...applied],
      markApplied: async (m) => marked.push(m),
    });
    return { runner, marked };
  };

  test('pending(): uygulanmamışları sürüm sırasına göre döner', async () => {
    const { runner } = setup({ applied: ['0001_baseline'] });
    const p = await runner.pending();
    assert.deepStrictEqual(p.map(m => m.name), ['0002_add_index', '0003_big_change']);
  });

  test('applyAll(): sırayla uygular ve her birini işaretler', async () => {
    const { runner, marked } = setup();
    const order = [];
    const r = await runner.applyAll({
      onApply: (m) => order.push(m.name),
    });
    assert.deepStrictEqual(order, ['0001_baseline', '0002_add_index', '0003_big_change']);
    assert.strictEqual(r.applied.length, 3);
    assert.strictEqual(r.skipped, 0);
    assert.strictEqual(marked.length, 3);
  });

  test('idempotent: ikinci çalıştırma hiçbir şey uygulamaz', async () => {
    let appliedList = [];
    const marked = [];
    const makeRunner = () => createMigrationRunner({
      migrations: [mig('0.1.0', 'm1'), mig('0.2.0', 'm2')],
      getApplied: async () => [...appliedList],
      markApplied: async (m) => { marked.push(m); appliedList.push(m.name); },
    });
    await makeRunner().applyAll();
    const second = await makeRunner().applyAll();
    assert.strictEqual(second.applied.length, 0);
    assert.strictEqual(second.skipped, 2);
    assert.strictEqual(marked.length, 2); // toplamda sadece ilk koşuda işaretlendi
  });

  test('targetVersion: hedefin üzerindeki sürümler uygulanmaz', async () => {
    const { runner } = setup();
    const r = await runner.applyAll({ targetVersion: '0.2.0' });
    assert.deepStrictEqual(r.applied.map(m => m.name), ['0001_baseline', '0002_add_index']);
  });

  test('hata durumunda: öncekiler işaretli kalır, hataya denk gelen işaretlenmez, hata yükselir', async () => {
    const marked = [];
    let appliedList = [];
    const runner = createMigrationRunner({
      migrations: [
        mig('0.1.0', 'm1'),
        mig('0.2.0', 'm2_patlar', async () => { throw new Error('db kilitli'); }),
        mig('0.3.0', 'm3'),
      ],
      getApplied: async () => [...appliedList],
      markApplied: async (m) => { marked.push(m); appliedList.push(m.name); },
    });
    await assert.rejects(() => runner.applyAll(), /db kilitli/);
    assert.deepStrictEqual(marked.map(m => m.name), ['m1']);
    // Düzeltildikten sonra yeniden koşu kaldığı yerden devam eder (m1 atlanır)
    appliedList = [...marked.map(m => m.name)];
    const fixedRunner = createMigrationRunner({
      migrations: [
        mig('0.1.0', 'm1'),
        mig('0.2.0', 'm2_patlar'),
        mig('0.3.0', 'm3'),
      ],
      getApplied: async () => [...appliedList],
      markApplied: async (m) => { marked.push(m); appliedList.push(m.name); },
    });
    const r = await fixedRunner.applyAll();
    assert.deepStrictEqual(r.applied.map(m => m.name), ['m2_patlar', 'm3']);
  });
});

describe('createApplyMigration — registerUpdateHandler bağlantısı', () => {
  test('{version} hedefiyle applyAll çağırır ve özet döner', async () => {
    let appliedList = [];
    const applyMigration = createApplyMigrationForTest({
      loadMigrations: async () => [mig('0.1.0', 'm1'), mig('0.2.0', 'm2')],
      getApplied: async () => [...appliedList],
      markApplied: async (m) => { appliedList.push(m.name); },
    });
    const summary = await applyMigration({
      version: '0.2.0',
      manifest: [{ file: 'server/src/x.js', checksum: 'abc' }],
    });
    assert.deepStrictEqual(summary.applied.map(m => m.name), ['m1', 'm2']);
    // Aynı sürüm tekrar gelirse no-op (idempotent)
    const again = await applyMigration({ version: '0.2.0', manifest: [{ file: 'x', checksum: 'y' }] });
    assert.strictEqual(again.applied.length, 0);
  });

  test('gerçek registerUpdateHandler ile uçtan uca çalışır', async () => {
    const { createActionRegistry } = await import('../src/agent/registry.js');
    const { registerUpdateHandler } = await import('../src/agent/updatePackage.js');
    let appliedList = [];
    const applyMigration = createApplyMigrationForTest({
      loadMigrations: async () => [mig('0.1.0', 'm1'), mig('0.5.0', 'm5')],
      getApplied: async () => [...appliedList],
      markApplied: async (m) => { appliedList.push(m.name); },
    });
    const registry = createActionRegistry();
    registerUpdateHandler(registry, { applyMigration, currentVersion: () => '0.4.0' });
    const result = await registry.execute('APPLY_UPDATE', {
      version: '0.5.0',
      manifest: [{ file: 'a.js', checksum: 'x' }, { file: 'b.js', checksum: 'y' }],
    });
    assert.deepStrictEqual(result.applied.map(m => m.name), ['m1', 'm5']);
  });
});

// Gerçek modül henüz yokken bile testi çalıştırabilmek için köprü:
// implementasyon geldiğinde bu yardımcı gerçek createApplyMigration'a
// devretmelidir. Şimdilik yoksa test doğru sebepten kırmızıdır.
import { createApplyMigration as realCreateApplyMigration } from '../migrations/runner.js';
function createApplyMigrationForTest(deps) {
  return realCreateApplyMigration(deps);
}
