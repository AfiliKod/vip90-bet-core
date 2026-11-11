process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.CLIENT_URL = 'https://app.example';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const { createApp, setOperatorOriginsSource } = await import('../../src/app.js');

const OP = 'https://operator.example';
const PLATFORM = 'https://app.example';

describe('V15 CORS scope of operator origins', () => {
  let server; let port;
  before(async () => {
    setOperatorOriginsSource(async () => new Set([OP]));
    server = http.createServer(createApp());
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
  });
  after(() => { setOperatorOriginsSource(null); server.close(); });

  const preflight = (path, origin) => new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port, path, method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
    }, res => { res.resume(); res.on('end', () => resolve(res)); });
    req.on('error', reject); req.end();
  });

  it('operator origin is accepted on /api/provider/v1 with credentials', async () => {
    const res = await preflight('/api/provider/v1/launch', OP);
    assert.equal(res.headers['access-control-allow-origin'], OP);
    assert.equal(res.headers['access-control-allow-credentials'], 'true');
  });
  it('operator origin is rejected on other /api routes', async () => {
    for (const p of ['/api/auth/login', '/api/admin/users', '/api/providerx/v1']) {
      const res = await preflight(p, OP);
      assert.equal(res.headers['access-control-allow-origin'], undefined, p);
      assert.equal(res.headers['access-control-allow-credentials'], undefined, p);
    }
  });
  it('CLIENT_URL origin keeps full access on both', async () => {
    for (const p of ['/api/auth/login', '/api/provider/v1/launch']) {
      const res = await preflight(p, PLATFORM);
      assert.equal(res.headers['access-control-allow-origin'], PLATFORM, p);
      assert.equal(res.headers['access-control-allow-credentials'], 'true', p);
    }
  });
  it('unknown origin is rejected everywhere', async () => {
    for (const p of ['/api/auth/login', '/api/provider/v1/launch']) {
      const res = await preflight(p, 'https://evil.example');
      assert.equal(res.headers['access-control-allow-origin'], undefined, p);
    }
  });
});
