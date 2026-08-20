import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createAgentToggleStore } from '../src/services/support/agentToggle.js';

describe('createAgentToggleStore', () => {
  test('varsayılan olarak kapalıdır — operatör açıkça açmadan ajan devrede olmaz', async () => {
    const s = createAgentToggleStore({ load: async () => ({}), now: () => 1000 });
    assert.strictEqual(await s.isEnabled(), false);
  });

  test('panelden açılınca true döner', async () => {
    const s = createAgentToggleStore({ load: async () => ({ enabled: true }), now: () => 1000 });
    assert.strictEqual(await s.isEnabled(), true);
  });

  test('load patlarsa fail-closed: kapalı sayılır', async () => {
    const s = createAgentToggleStore({ load: async () => { throw new Error('db down'); }, now: () => 1000 });
    assert.strictEqual(await s.isEnabled(), false);
  });

  test('TTL süresince tekrar sorgulanmaz, invalidate ile temizlenir', async () => {
    let calls = 0;
    let t = 1000;
    const s = createAgentToggleStore({ load: async () => { calls++; return { enabled: true }; }, now: () => t, ttlMs: 5000 });
    await s.isEnabled();
    t += 1000;
    await s.isEnabled();
    assert.strictEqual(calls, 1);
    s.invalidate();
    await s.isEnabled();
    assert.strictEqual(calls, 2);
  });
});
