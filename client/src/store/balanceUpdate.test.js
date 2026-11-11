import { test, describe } from 'node:test';
import assert from 'node:assert';
import { applyBalanceUpdate } from './balanceUpdate.js';

describe('applyBalanceUpdate (F3)', () => {
  test('a number balance replaces the platform balance and keeps the casino balance', () => {
    const out = applyBalanceUpdate({ balance: 5, activeIgamesBalance: 100 }, { balance: 7 });
    assert.deepStrictEqual(out, { balance: 7, activeIgamesBalance: 100 });
  });
  test('activeIgamesBalance number sets the casino balance', () => {
    assert.deepStrictEqual(applyBalanceUpdate({ balance: 0 }, { balance: 0, activeIgamesBalance: 120 }),
      { balance: 0, activeIgamesBalance: 120 });
  });
  test('activeIgamesBalance null clears it (close credited): the header total does not double', () => {
    const out = applyBalanceUpdate({ balance: 0, activeIgamesBalance: 130 }, { balance: 130, activeIgamesBalance: null });
    assert.deepStrictEqual(out, { balance: 130 });
    assert.strictEqual(out.activeIgamesBalance ?? null, null);
  });
  test('no user or an empty payload changes nothing', () => {
    assert.strictEqual(applyBalanceUpdate(null, { balance: 1 }), null);
    const u = { balance: 3 };
    assert.strictEqual(applyBalanceUpdate(u, {}), u);
    assert.strictEqual(applyBalanceUpdate(u, { balance: 'x' }), u);
  });
});
