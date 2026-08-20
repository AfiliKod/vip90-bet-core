import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getActionRisk, isDestructive, RISK_LEVELS, ACTION_CATALOG } from '../src/agent/actionCatalog.js';

describe('ACTION_CATALOG', () => {
  test('her girdi id + risk + description taşır', () => {
    for (const a of ACTION_CATALOG) {
      assert.strictEqual(typeof a.id, 'string');
      assert.ok([RISK_LEVELS.SAFE, RISK_LEVELS.DESTRUCTIVE].includes(a.risk));
      assert.strictEqual(typeof a.description, 'string');
    }
  });

  test('en az bir salt-okunur ve bir yıkıcı örnek tanımlı', () => {
    assert.ok(ACTION_CATALOG.some(a => a.risk === RISK_LEVELS.SAFE));
    assert.ok(ACTION_CATALOG.some(a => a.risk === RISK_LEVELS.DESTRUCTIVE));
  });
});

describe('getActionRisk / isDestructive', () => {
  test('bilinen bir salt-okunur eylemin riskini döner', () => {
    assert.strictEqual(getActionRisk('REINDEX_DB'), RISK_LEVELS.SAFE);
    assert.strictEqual(isDestructive('REINDEX_DB'), false);
  });

  test('bilinen bir yıkıcı eylemin riskini döner', () => {
    assert.strictEqual(getActionRisk('RUN_MIGRATION'), RISK_LEVELS.DESTRUCTIVE);
    assert.strictEqual(isDestructive('RUN_MIGRATION'), true);
  });

  test('kayıtsız eylem için hata fırlatır — sessizce "safe" varsaymaz', () => {
    assert.throws(() => getActionRisk('DELETE_EVERYTHING'), /kayıtlı değil|Bilinmeyen/);
  });
});
