import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Setting from '../../src/models/Setting.js';
import { CRYPTO_SETTINGS, cryptoEnvDefaults } from '../../src/config/crypto.js';
import { updateCryptoSettingsSchema } from '../../src/validators/admin.js';
import { hydrateCryptoSettings, updateCryptoSettings } from '../../src/services/cryptoSettings.js';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/v17_crypto_settings_test';
const quiet = { log() {}, warn() {}, error() {} };

describe('V17 crypto settings schema', () => {
  it('accepts the shape the admin panel sends', () => {
    const r = updateCryptoSettingsSchema.safeParse({
      deposit: { autoCreditLimit: 50, requireApprovalAbove: 50 },
      withdraw: { autoProcessLimit: 10, requireApprovalAbove: 10 },
      usdtTryRate: 34.5,
      network: 'nile',
    });
    assert.equal(r.success, true);
    assert.equal(updateCryptoSettingsSchema.safeParse({ network: 'mainnet' }).success, true);
  });

  it('rejects booleans, unknown keys, unknown networks and unbounded numbers', () => {
    for (const bad of [
      { deposit: true },
      { withdraw: false },
      { deposit: { autoCreditLimit: -1 } },
      { deposit: { autoCreditLimit: 5, extra: 1 } },
      { withdraw: { autoProcessLimit: Infinity } },
      { deposit: { autoCreditLimit: 1e12 } },
      { usdtTryRate: 0 },
      { network: 'devnet' },
      { minWithdraw: 0 },
      { supportedCurrencies: ['BTC'] },
    ]) {
      assert.equal(updateCryptoSettingsSchema.safeParse(bad).success, false, JSON.stringify(bad));
    }
  });
});

describe('V17 crypto settings persistence', async () => {
  let connected = false;
  try { await mongoose.connect(URI, { serverSelectionTimeoutMS: 2000 }); connected = true; } catch { /* skip */ }
  const opts = { skip: !connected && 'MongoDB not available' };
  const snapshot = structuredClone(CRYPTO_SETTINGS);
  const restore = () => {
    CRYPTO_SETTINGS.deposit = { ...snapshot.deposit };
    CRYPTO_SETTINGS.withdraw = { ...snapshot.withdraw };
    CRYPTO_SETTINGS.usdtTryRate = snapshot.usdtTryRate;
    CRYPTO_SETTINGS.network = snapshot.network;
  };

  after(async () => {
    restore();
    if (connected) { await Setting.deleteMany({ key: 'crypto.settings' }); await mongoose.disconnect(); }
  });

  it('persists an admin update and hydrates it back after a restart', opts, async () => {
    await Setting.deleteMany({ key: 'crypto.settings' });
    const adminId = new mongoose.Types.ObjectId();
    const out = await updateCryptoSettings({ deposit: { autoCreditLimit: 50 }, usdtTryRate: 33, network: 'nile' }, adminId);
    assert.equal(out.deposit.autoCreditLimit, 50);
    assert.equal(CRYPTO_SETTINGS.deposit.autoCreditLimit, 50);
    assert.equal(CRYPTO_SETTINGS.deposit.requireApprovalAbove, snapshot.deposit.requireApprovalAbove);

    const row = await Setting.findOne({ key: 'crypto.settings' }).lean();
    const stored = JSON.parse(row.value);
    assert.equal(stored.deposit.autoCreditLimit, 50);
    assert.equal(stored.usdtTryRate, 33);
    assert.equal(stored.network, 'nile');
    assert.equal(String(row.updatedBy), String(adminId));
    // Only the keys the admin patched are stored.
    assert.deepEqual(Object.keys(stored).sort(), ['deposit', 'network', 'usdtTryRate']);
    assert.deepEqual(stored.deposit, { autoCreditLimit: 50 });

    // Simulate a fresh process: in-memory values back to defaults.
    restore();
    assert.equal(CRYPTO_SETTINGS.deposit.autoCreditLimit, snapshot.deposit.autoCreditLimit);
    await hydrateCryptoSettings({ force: true, logger: quiet });
    assert.equal(CRYPTO_SETTINGS.deposit.autoCreditLimit, 50);
    assert.equal(CRYPTO_SETTINGS.usdtTryRate, 33);
    assert.equal(CRYPTO_SETTINGS.network, 'nile');
    assert.deepEqual(CRYPTO_SETTINGS.supportedCurrencies, snapshot.supportedCurrencies);
  });

  it('a later update merges with the persisted values', opts, async () => {
    await updateCryptoSettings({ withdraw: { autoProcessLimit: 7 } }, new mongoose.Types.ObjectId());
    const stored = JSON.parse((await Setting.findOne({ key: 'crypto.settings' }).lean()).value);
    assert.equal(stored.deposit.autoCreditLimit, 50);
    assert.deepEqual(stored.withdraw, { autoProcessLimit: 7 });
  });

  it('keys the admin never saved keep following the environment after a restart', opts, async () => {
    await Setting.deleteMany({ key: 'crypto.settings' });
    const shasta = cryptoEnvDefaults({ TRON_NETWORK: 'shasta', USDT_TRY_RATE: '30' }, quiet);
    restore();
    await hydrateCryptoSettings({ force: true, logger: quiet, defaults: shasta });
    await updateCryptoSettings({ deposit: { autoCreditLimit: 42 } }, new mongoose.Types.ObjectId(), { logger: quiet, defaults: shasta });
    const stored = JSON.parse((await Setting.findOne({ key: 'crypto.settings' }).lean()).value);
    assert.deepEqual(stored, { deposit: { autoCreditLimit: 42 } });

    // Restart with a different env: network/rate follow env, the saved limit persists.
    restore();
    const mainnet = cryptoEnvDefaults({ TRON_NETWORK: 'mainnet', USDT_TRY_RATE: '35' }, quiet);
    await hydrateCryptoSettings({ force: true, logger: quiet, defaults: mainnet });
    assert.equal(CRYPTO_SETTINGS.network, 'mainnet');
    assert.equal(CRYPTO_SETTINGS.usdtTryRate, 35);
    assert.equal(CRYPTO_SETTINGS.deposit.autoCreditLimit, 42);
    assert.equal(CRYPTO_SETTINGS.deposit.requireApprovalAbove, 100);
  });

  it('an invalid USDT_TRY_RATE env falls back to 1, is logged and never reaches the stored row', opts, async () => {
    const logged = [];
    const bad = cryptoEnvDefaults({ USDT_TRY_RATE: 'abc' }, { error: (m) => logged.push(m) });
    assert.equal(bad.usdtTryRate, 1);
    assert.equal(logged.length, 1);
    assert.equal(cryptoEnvDefaults({ USDT_TRY_RATE: '-3' }, quiet).usdtTryRate, 1);
    await Setting.deleteMany({ key: 'crypto.settings' });
    await updateCryptoSettings({ network: 'nile' }, new mongoose.Types.ObjectId(), { logger: quiet, defaults: bad });
    const stored = JSON.parse((await Setting.findOne({ key: 'crypto.settings' }).lean()).value);
    assert.deepEqual(stored, { network: 'nile' });
    assert.equal(CRYPTO_SETTINGS.usdtTryRate, 1);
  });

  it('a corrupt or invalid stored value is logged and defaults are kept', opts, async () => {
    restore();
    const logged = [];
    const logger = { ...quiet, error: (...a) => logged.push(a.join(' ')) };
    await Setting.updateOne({ key: 'crypto.settings' }, { value: '{not json' }, { upsert: true });
    await hydrateCryptoSettings({ force: true, logger });
    assert.equal(CRYPTO_SETTINGS.deposit.autoCreditLimit, snapshot.deposit.autoCreditLimit);
    assert.equal(logged.length, 1);

    await Setting.updateOne({ key: 'crypto.settings' }, { value: JSON.stringify({ deposit: { autoCreditLimit: -5 }, network: 'x' }) });
    await hydrateCryptoSettings({ force: true, logger });
    assert.equal(CRYPTO_SETTINGS.deposit.autoCreditLimit, snapshot.deposit.autoCreditLimit);
    assert.equal(CRYPTO_SETTINGS.network, snapshot.network);
    assert.equal(logged.length, 2);
  });

  it('non-forced hydrate within the TTL does not hit the DB again', opts, async () => {
    restore();
    await Setting.updateOne({ key: 'crypto.settings' }, { value: JSON.stringify({ deposit: { autoCreditLimit: 11, requireApprovalAbove: 11 } }) });
    await hydrateCryptoSettings({ force: true, logger: quiet });
    assert.equal(CRYPTO_SETTINGS.deposit.autoCreditLimit, 11);
    await Setting.updateOne({ key: 'crypto.settings' }, { value: JSON.stringify({ deposit: { autoCreditLimit: 12, requireApprovalAbove: 12 } }) });
    await hydrateCryptoSettings({ logger: quiet });
    assert.equal(CRYPTO_SETTINGS.deposit.autoCreditLimit, 11);
  });
});
