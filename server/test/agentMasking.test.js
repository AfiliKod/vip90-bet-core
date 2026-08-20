import { test, describe } from 'node:test';
import assert from 'node:assert';
import { maskDiagnostics } from '../src/agent/masking.js';

describe('maskDiagnostics — allowlist, fail-closed', () => {
  test('yalnızca allowlist’teki alanları geçirir', () => {
    const raw = { errorCode: 'DB_TIMEOUT', table: 'cache_table', password: 'secret123' };
    const out = maskDiagnostics(raw, ['errorCode', 'table']);
    assert.deepStrictEqual(out, { errorCode: 'DB_TIMEOUT', table: 'cache_table' });
  });

  test('allowlist’te olmayan bilinmeyen alan sessizce düşer (fail-closed)', () => {
    const raw = { errorCode: 'X', apiKey: 'sk-live-...', userEmail: 'x@y.com' };
    const out = maskDiagnostics(raw, ['errorCode']);
    assert.deepStrictEqual(out, { errorCode: 'X' });
    assert.ok(!('apiKey' in out));
    assert.ok(!('userEmail' in out));
  });

  test('allowlist’teki alan raw’da yoksa çıktıya da girmez', () => {
    const out = maskDiagnostics({ errorCode: 'X' }, ['errorCode', 'table']);
    assert.deepStrictEqual(out, { errorCode: 'X' });
  });

  test('allowlist’teki alanın değeri primitive değilse (obje/dizi) hiç geçirilmez — beklenmeyen şekli serileştirmek sızıntıdır', () => {
    const raw = { errorCode: { nested: 'leak', toString: () => 'DB_TIMEOUT' } };
    const out = maskDiagnostics(raw, ['errorCode']);
    assert.ok(!('errorCode' in out));
  });

  test('dizi değeri de aynı sebeple düşer', () => {
    const out = maskDiagnostics({ errorCode: ['a', 'b'] }, ['errorCode']);
    assert.ok(!('errorCode' in out));
  });

  test('primitive değerler (string/number/boolean) normal şekilde geçer', () => {
    const out = maskDiagnostics({ code: 404, ok: false, msg: 'timeout' }, ['code', 'ok', 'msg']);
    assert.deepStrictEqual(out, { code: '404', ok: 'false', msg: 'timeout' });
  });

  test('boş allowlist her şeyi eler', () => {
    assert.deepStrictEqual(maskDiagnostics({ a: 1, b: 2 }, []), {});
  });

  test('raw null/undefined ise boş obje döner, throw etmez', () => {
    assert.deepStrictEqual(maskDiagnostics(null, ['a']), {});
    assert.deepStrictEqual(maskDiagnostics(undefined, ['a']), {});
  });

  test('değer 500 karakterden uzunsa kırpılır — büyük veri sızıntısına karşı', () => {
    const long = 'x'.repeat(1000);
    const out = maskDiagnostics({ errorCode: long }, ['errorCode']);
    assert.strictEqual(out.errorCode.length, 500);
  });
});
