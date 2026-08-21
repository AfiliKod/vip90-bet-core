import { test, describe } from 'node:test';
import assert from 'node:assert';
import { discoverMigrations } from '../migrations/index.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const sampleDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'migrations-sample');
const badDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'migrations-bad');

describe('discoverMigrations', () => {
  test('geçerli migration modüllerini okur, .txt ve _taslakları yok sayar', async () => {
    const found = await discoverMigrations(sampleDir);
    assert.deepStrictEqual(found.map(m => m.name), ['0001_first', '0002_second']);
    for (const m of found) {
      assert.strictEqual(typeof m.up, 'function');
      assert.strictEqual(m.version, '0.2.0');
    }
  });

  test('sözleşmeye uymayan dosya varsa hata verir (sessizce atlamaz)', async () => {
    await assert.rejects(() => discoverMigrations(badDir), /uymuyor/);
  });

  test('gerçek migrations dizininde baseline bulunur ve sözleşme geçerli', async () => {
    const found = await discoverMigrations();
    assert.ok(found.some(m => m.name === '0001_baseline'), 'baseline migration kayıp');
    assert.ok(found.every(m => typeof m.up === 'function' && typeof m.version === 'string'));
  });
});
