import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createActionRegistry } from '../src/agent/registry.js';

describe('createActionRegistry', () => {
  test('kayıtlı eylemi çalıştırır, sonucu döner', async () => {
    const reg = createActionRegistry();
    reg.register('REINDEX_DB', async ({ target }) => ({ reindexed: target }));
    const result = await reg.execute('REINDEX_DB', { target: 'cache_table' });
    assert.deepStrictEqual(result, { reindexed: 'cache_table' });
  });

  test('kayıtsız eylem id’si reddedilir, handler’a hiç gidilmez', async () => {
    const reg = createActionRegistry();
    await assert.rejects(() => reg.execute('DELETE_EVERYTHING', {}), /kayıtlı değil/);
  });

  test('has() kayıtlı/kayıtsız ayrımını doğru yapar', () => {
    const reg = createActionRegistry();
    reg.register('X', async () => {});
    assert.strictEqual(reg.has('X'), true);
    assert.strictEqual(reg.has('Y'), false);
  });

  test('aynı id iki kez kaydedilemez (yanlışlıkla üzerine yazmayı önler)', () => {
    const reg = createActionRegistry();
    reg.register('X', async () => {});
    assert.throws(() => reg.register('X', async () => {}), /zaten/i);
  });

  test('fonksiyon olmayan handler reddedilir', () => {
    const reg = createActionRegistry();
    assert.throws(() => reg.register('X', 'not-a-function'), /fonksiyon/);
  });

  test('handler’ın fırlattığı hata çağırana iletilir, yutulmaz', async () => {
    const reg = createActionRegistry();
    reg.register('X', async () => { throw new Error('disk dolu'); });
    await assert.rejects(() => reg.execute('X', {}), /disk dolu/);
  });
});
