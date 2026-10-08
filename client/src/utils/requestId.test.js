import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRequestId } from './requestId.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('UUID v4 üretir ve her çağrıda farklıdır', () => {
  const a = newRequestId();
  assert.match(a, UUID_V4);
  assert.notEqual(a, newRequestId());
});

test('randomUUID yokken (güvenli olmayan bağlam) de geçerli UUID v4 üretir', () => {
  const original = crypto.randomUUID;
  Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
  try {
    for (let i = 0; i < 50; i++) assert.match(newRequestId(), UUID_V4);
  } finally {
    Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
  }
});
