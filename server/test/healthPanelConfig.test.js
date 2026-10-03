import { describe, test } from 'node:test';
import assert from 'node:assert';
import { runHealthChecks } from '../src/health/checks.js';

// Denetim madde 3: panelden (DB) kaydedilen SMTP/Igames ayarları da "yapılandırılmış" sayılmalı.
const deps = (over = {}) => ({
  dbState: () => 1,
  env: {
    MONGODB_URI: 'mongodb://x/y', JWT_SECRET: 'x'.repeat(64), JWT_REFRESH_SECRET: 'y'.repeat(64), CLIENT_URL: 'https://a.com',
  },
  pendingMigrations: async () => [],
  settingModel: { findOne: async () => ({ value: 'S' }) },
  ...over,
});
const by = r => Object.fromEntries(r.checks.map(c => [c.name, c]));

describe('runHealthChecks panel ayarları', () => {
  test('env boş ama panelde kayıtlıysa smtp ve igames ok', async () => {
    const r = await runHealthChecks(deps({ resolvers: { 'service:smtp': async () => true, 'service:igames': async () => true } }));
    assert.equal(by(r)['service:smtp'].status, 'ok');
    assert.equal(by(r)['service:igames'].status, 'ok');
  });
  test('ne env ne panel varsa warn', async () => {
    const r = await runHealthChecks(deps({ resolvers: { 'service:smtp': async () => false, 'service:igames': async () => false } }));
    assert.equal(by(r)['service:smtp'].status, 'warn');
    assert.equal(by(r)['service:igames'].status, 'warn');
  });
  test('çözücü hata fırlatırsa env sonucuna düşer (warn), çökmez', async () => {
    const r = await runHealthChecks(deps({ resolvers: { 'service:smtp': async () => { throw new Error('x'); } } }));
    assert.equal(by(r)['service:smtp'].status, 'warn');
  });
  test('env tanımlıysa çözücüye bakmadan ok', async () => {
    let called = false;
    const r = await runHealthChecks(deps({
      env: { ...deps().env, SMTP_HOST: 'smtp.a.com' },
      resolvers: { 'service:smtp': async () => { called = true; return false; } },
    }));
    assert.equal(by(r)['service:smtp'].status, 'ok');
    assert.equal(called, false);
  });
  test('DB bağlı değilse çözücü çağrılmaz', async () => {
    let called = false;
    const r = await runHealthChecks(deps({ dbState: () => 0, resolvers: { 'service:smtp': async () => { called = true; return true; } } }));
    assert.equal(called, false);
    assert.equal(by(r)['service:smtp'].status, 'warn');
  });
});
