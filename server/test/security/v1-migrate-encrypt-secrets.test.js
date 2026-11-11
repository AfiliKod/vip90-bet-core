process.env.OPERATOR_SECRET_ENCRYPTION_KEY = 'b'.repeat(64);
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import { migrateEncryptSecrets } from '../../scripts/migrate-encrypt-secrets.mjs';
import { decryptSensitive } from '../../src/utils/secretCrypto.js';
import { readBackupCodes } from '../../src/services/twoFactorAuth.js';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/v1_migrate_encrypt_secrets_test';
const quiet = { log() {} };

describe('migrateEncryptSecrets', async () => {
  let connected = false;
  try {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 2000 });
    connected = true;
  } catch { /* DB yok → skip */ }

  const opts = { skip: !connected && 'MongoDB yok' };
  after(async () => {
    if (connected) { await User.deleteMany({ username: 'v1mig' }); await mongoose.disconnect(); }
  });

  it('dry-run değiştirmez, commit şifreler, ikinci çalışma no-op', opts, async () => {
    await User.deleteMany({ username: 'v1mig' });
    const { _id } = await User.create({ username: 'v1mig', email: 'v1mig@example.com', password: 'x'.repeat(10) });
    // Legacy düz biçimi doğrudan yaz (model Mixed, ham koleksiyon ile).
    await User.collection.updateOne({ _id }, { $set: { twoFactorSecret: 'JBSWY3DPEHPK3PXP', twoFactorBackupCodes: ['c1', 'c2'] } });
    const raw = () => User.collection.findOne({ _id });

    const before = await raw();
    const dry = await migrateEncryptSecrets({ dryRun: true, logger: quiet });
    assert.equal(dry.users >= 1, true);
    assert.deepEqual(await raw(), before);

    await migrateEncryptSecrets({ dryRun: false, logger: quiet });
    const after1 = await raw();
    assert.match(after1.twoFactorSecret, /^enc:v1:/);
    assert.match(after1.twoFactorBackupCodes, /^enc:v1:/);
    assert.equal(decryptSensitive(after1.twoFactorSecret), 'JBSWY3DPEHPK3PXP');
    assert.deepEqual(readBackupCodes(after1), ['c1', 'c2']);

    const again = await migrateEncryptSecrets({ dryRun: false, logger: quiet });
    assert.equal(again.users, 0);
    assert.deepEqual(await raw(), after1);
  });
});
