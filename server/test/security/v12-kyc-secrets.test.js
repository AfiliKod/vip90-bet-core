process.env.OPERATOR_SECRET_ENCRYPTION_KEY = 'd'.repeat(64);
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { createKycConfigStore } from '../../src/config/kyc.js';
import Setting from '../../src/models/Setting.js';
import { migrateEncryptSecrets } from '../../scripts/migrate-encrypt-secrets.mjs';

function memStore(initial = {}) {
  const store = { ...initial };
  const kyc = createKycConfigStore({
    load: async () => ({ ...store }),
    write: async (key, stored) => { if (stored) store[key] = stored; else delete store[key]; },
    env: {},
    ttlMs: 0,
  });
  return { store, kyc };
}

describe('V12 KYC secrets encryption', () => {
  it('set encrypts secret keys at rest and get decrypts', async () => {
    const { store, kyc } = memStore();
    await kyc.set('SUMSUB_SECRET_KEY', 'abc', null);
    assert.match(store.SUMSUB_SECRET_KEY, /^enc:v1:/);
    assert.ok(!store.SUMSUB_SECRET_KEY.includes('abc'));
    assert.equal(await kyc.get('SUMSUB_SECRET_KEY'), 'abc');
  });

  it('non-secret keys stay plaintext', async () => {
    const { store, kyc } = memStore();
    await kyc.set('KYC_PROVIDER', 'sumsub', null);
    assert.equal(store.KYC_PROVIDER, 'sumsub');
  });

  it('getAll never exposes secrets, only masks', async () => {
    const { kyc } = memStore();
    await kyc.set('SUMSUB_APP_TOKEN', 'app_t_1234567890abcdef', null);
    await kyc.set('KYC_PROVIDER', 'sumsub', null);
    const all = await kyc.getAll();
    const tok = all.find(s => s.key === 'SUMSUB_APP_TOKEN');
    assert.equal(tok.rawValue, null);
    assert.equal(tok.secret, true);
    assert.equal(tok.value, 'app_…cdef');
    assert.ok(!JSON.stringify(all).includes('app_t_1234567890abcdef'));
    assert.equal(all.find(s => s.key === 'KYC_PROVIDER').rawValue, 'sumsub');
  });

  it('legacy plaintext is still readable', async () => {
    const { kyc } = memStore({ SUMSUB_WEBHOOK_SECRET: 'legacy' });
    assert.equal(await kyc.get('SUMSUB_WEBHOOK_SECRET'), 'legacy');
    const row = (await kyc.getAll()).find(s => s.key === 'SUMSUB_WEBHOOK_SECRET');
    assert.equal(row.rawValue, null);
  });

  it('set fails closed without the key', async () => {
    const { store, kyc } = memStore();
    const saved = process.env.OPERATOR_SECRET_ENCRYPTION_KEY;
    delete process.env.OPERATOR_SECRET_ENCRYPTION_KEY;
    try {
      await assert.rejects(kyc.set('SUMSUB_SECRET_KEY', 'abc', null), /OPERATOR_SECRET_ENCRYPTION_KEY/);
      assert.equal(store.SUMSUB_SECRET_KEY, undefined);
    } finally {
      process.env.OPERATOR_SECRET_ENCRYPTION_KEY = saved;
    }
  });

  it('saving the mask back does not overwrite the stored secret', async () => {
    const { kyc } = memStore();
    await kyc.set('SUMSUB_SECRET_KEY', 'sec_abcdefghijklmnop', null);
    const masked = (await kyc.getAll()).find(s => s.key === 'SUMSUB_SECRET_KEY').value;
    await kyc.set('SUMSUB_SECRET_KEY', masked, null);
    assert.equal(await kyc.get('SUMSUB_SECRET_KEY'), 'sec_abcdefghijklmnop');
  });
});

describe('V12 migration of KYC settings', async () => {
  // Always a dedicated DB: the test deletes Setting rows, never touch MONGODB_URI's database.
  const URI = `mongodb://localhost:27017/v12_kyc_migrate_test_${process.pid}`;
  let connected = false;
  try {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 2000 });
    connected = true;
  } catch { /* no DB */ }
  after(async () => {
    if (connected) {
      await Setting.deleteMany({ key: 'SUMSUB_SECRET_KEY' });
      await mongoose.disconnect();
    }
  });

  it('dry-run keeps plaintext, commit encrypts, second run settings: 0', { skip: !connected && 'MongoDB yok' }, async () => {
    const quiet = { log() {} };
    await Setting.deleteMany({ key: 'SUMSUB_SECRET_KEY' });
    await Setting.collection.insertOne({ key: 'SUMSUB_SECRET_KEY', value: 'plain-secret' });
    const dry = await migrateEncryptSecrets({ dryRun: true, logger: quiet });
    assert.ok(dry.settings >= 1);
    assert.equal((await Setting.collection.findOne({ key: 'SUMSUB_SECRET_KEY' })).value, 'plain-secret');
    await migrateEncryptSecrets({ dryRun: false, logger: quiet });
    assert.match((await Setting.collection.findOne({ key: 'SUMSUB_SECRET_KEY' })).value, /^enc:v1:/);
    const again = await migrateEncryptSecrets({ dryRun: false, logger: quiet });
    assert.equal(again.settings, 0);
  });
});
