import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Lisans sunucusu tanımlı ve slikair-payment'i listelemiyor senaryosu:
// muaf modül yine lisanslı sayılmalı, diğerleri sunucunun dediğine uymalı.
describe('licenseExempt modüller', () => {
  const origFetch = global.fetch;
  const origEnv = { url: process.env.LICENSE_SERVER_URL, key: process.env.LICENSE_KEY };
  let licensing;

  before(async () => {
    process.env.LICENSE_SERVER_URL = 'https://license.example.test';
    process.env.LICENSE_KEY = 'k';
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ modules: { betting: { valid: false, expiresAt: null } } }),
    });
    licensing = await import('../src/services/licensing/index.js');
    licensing.invalidateLicenses();
  });

  after(() => {
    global.fetch = origFetch;
    if (origEnv.url === undefined) delete process.env.LICENSE_SERVER_URL; else process.env.LICENSE_SERVER_URL = origEnv.url;
    if (origEnv.key === undefined) delete process.env.LICENSE_KEY; else process.env.LICENSE_KEY = origEnv.key;
  });

  it('slikair-payment lisans sunucusunda yokken de lisanslı', async () => {
    assert.equal(await licensing.licenseStore.isLicensed('slikair-payment'), true);
  });

  it('muaf olmayan modül sunucunun kararına uyar', async () => {
    assert.equal(await licensing.licenseStore.isLicensed('betting'), false);
  });

  it('list() muaf modülü lisanslı gösterir', async () => {
    const rows = await licensing.licenseStore.list();
    const s = rows.find(r => r.id === 'slikair-payment');
    assert.equal(s.licensed, true);
    assert.equal(rows.find(r => r.id === 'betting').licensed, false);
  });
});
