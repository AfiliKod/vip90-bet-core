import { test, describe } from 'node:test';
import assert from 'node:assert';
import { resolveOperatorOneConfig } from '../src/scripts/migrations/operatorOneConfig.mjs';

describe('create-operator-one yapılandırması', () => {
  test('varsayılanlar eskisiyle aynı', () => {
    const c = resolveOperatorOneConfig({ argv: [], env: {} });
    assert.strictEqual(c.walletCallbackUrl, 'http://localhost:3001/api/inhouse-provider/callback');
    assert.deepStrictEqual(c.allowedIPs, ['127.0.0.1', '::1']);
    assert.strictEqual(c.apiBase, 'http://localhost:3001');
    assert.deepStrictEqual(c.allowedOrigins, ['http://localhost:5174']);
  });

  test('PORT varsayılan URL\'lere yansır', () => {
    const c = resolveOperatorOneConfig({ argv: [], env: { PORT: '4000' } });
    assert.strictEqual(c.walletCallbackUrl, 'http://localhost:4000/api/inhouse-provider/callback');
    assert.strictEqual(c.apiBase, 'http://localhost:4000');
  });

  test('env ile ezilir', () => {
    const c = resolveOperatorOneConfig({ argv: [], env: {
      OPERATOR_ONE_WALLET_CALLBACK_URL: 'http://app:3001/cb',
      OPERATOR_ONE_ALLOWED_IPS: '172.18.0.0, 10.0.0.5',
      OPERATOR_ONE_API_BASE: 'http://app:3001',
    } });
    assert.strictEqual(c.walletCallbackUrl, 'http://app:3001/cb');
    assert.deepStrictEqual(c.allowedIPs, ['172.18.0.0', '10.0.0.5']);
    assert.strictEqual(c.apiBase, 'http://app:3001');
  });

  test('CLI argümanı env\'den önceliklidir', () => {
    const c = resolveOperatorOneConfig({
      argv: ['--callback-url=https://x.com/cb', '--allowed-ips=203.0.113.4'],
      env: { OPERATOR_ONE_WALLET_CALLBACK_URL: 'http://env/cb', OPERATOR_ONE_ALLOWED_IPS: '198.51.100.9' },
    });
    assert.strictEqual(c.walletCallbackUrl, 'https://x.com/cb');
    assert.deepStrictEqual(c.allowedIPs, ['203.0.113.4']);
  });

  test('boş IP listesi varsayılana düşer', () => {
    const c = resolveOperatorOneConfig({ argv: ['--allowed-ips= , '], env: {} });
    assert.deepStrictEqual(c.allowedIPs, ['127.0.0.1', '::1']);
  });
});
