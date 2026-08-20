import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createCommandQueue } from '../src/services/support/index.js';

describe('createCommandQueue', () => {
  test('enqueue edilen komut dequeue ile alınır', async () => {
    const q = createCommandQueue();
    q.enqueue('cust1', { actionId: 'X' });
    assert.deepStrictEqual(await q.dequeue('cust1'), { actionId: 'X' });
  });

  test('dequeue komutu kuyruktan düşürür — iki kez teslim edilmez', async () => {
    const q = createCommandQueue();
    q.enqueue('cust1', { actionId: 'X' });
    await q.dequeue('cust1');
    assert.strictEqual(await q.dequeue('cust1'), null);
  });

  test('başka müşterinin komutu karışmaz', async () => {
    const q = createCommandQueue();
    q.enqueue('cust1', { actionId: 'A' });
    q.enqueue('cust2', { actionId: 'B' });
    assert.deepStrictEqual(await q.dequeue('cust2'), { actionId: 'B' });
    assert.deepStrictEqual(await q.dequeue('cust1'), { actionId: 'A' });
  });

  test('bekleyen komut yoksa null döner', async () => {
    const q = createCommandQueue();
    assert.strictEqual(await q.dequeue('yok'), null);
  });
});
