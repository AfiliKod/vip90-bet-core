/**
 * Referans komisyonu ayarları — `Setting` koleksiyonunda kalıcılık.
 *
 * Çalıştırmak için: node --test test/referralSettings.test.js
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Setting from '../src/models/Setting.js';
import User from '../src/models/User.js';
import Transaction from '../src/models/Transaction.js';
import { createReferralSettingsStore, referralSettings, REFERRAL_KEYS } from '../src/services/referralSettings.js';
import { REFERRAL_SETTINGS as DEFAULTS } from '../src/config/referral.js';
import { payReferralCommission } from '../src/services/referralCommission.js';

describe('referralSettings', () => {
  before(async () => {
    await mongoose.connect('mongodb://localhost:27017/betzone_test_referral_settings');
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Setting.deleteMany({});
    await User.deleteMany({});
    await Transaction.deleteMany({});
    referralSettings.invalidate();
  });

  it('kayıt yokken config varsayılanlarını döner', async () => {
    const s = await createReferralSettingsStore().get();
    assert.equal(s.enabled, DEFAULTS.enabled);
    assert.equal(s.commissionRate, DEFAULTS.commissionRate);
  });

  it('güncelleme DB\'ye yazılır; yeni bir depo (restart) aynı değeri okur', async () => {
    await createReferralSettingsStore().update({ enabled: false, commissionRate: 7.5 });

    const afterRestart = await createReferralSettingsStore().get();
    assert.equal(afterRestart.enabled, false);
    assert.equal(afterRestart.commissionRate, 7.5);
    assert.equal((await Setting.findOne({ key: REFERRAL_KEYS.commissionRate })).value, '7.5');
    // Varsayılan nesne çalışma anında değişmez.
    assert.equal(DEFAULTS.commissionRate, 10);
  });

  it('yalnız gönderilen alan güncellenir', async () => {
    const store = createReferralSettingsStore();
    await store.update({ commissionRate: 3 });
    await store.update({ enabled: false });
    const s = await createReferralSettingsStore().get();
    assert.equal(s.commissionRate, 3);
    assert.equal(s.enabled, false);
  });

  it('DB\'deki geçersiz değer varsayılana düşer', async () => {
    await Setting.create({ key: REFERRAL_KEYS.commissionRate, value: 'abc' });
    await Setting.create({ key: REFERRAL_KEYS.enabled, value: 'maybe' });
    const s = await createReferralSettingsStore().get();
    assert.equal(s.commissionRate, DEFAULTS.commissionRate);
    assert.equal(s.enabled, DEFAULTS.enabled);
  });

  it('DB okunamazsa varsayılanlarla devam eder', async () => {
    const s = await createReferralSettingsStore({ load: async () => { throw new Error('db down'); } }).get();
    assert.equal(s.commissionRate, DEFAULTS.commissionRate);
  });

  it('komisyon kaydedilen oranla hesaplanır, kapalıyken ödenmez', async () => {
    const referrer = await User.create({ username: 'referrer1', email: 'r1@test.com', password: 'x', balance: 0 });
    const player = await User.create({ username: 'player1', email: 'p1@test.com', password: 'x', referredBy: referrer._id });

    await referralSettings.update({ enabled: true, commissionRate: 20 });
    await payReferralCommission(player._id, 100, { sourceId: 'round-1' });
    assert.equal((await User.findById(referrer._id)).balance, 20);

    await referralSettings.update({ enabled: false });
    const r = await payReferralCommission(player._id, 100, { sourceId: 'round-2' });
    assert.equal(r, null);
    assert.equal((await User.findById(referrer._id)).balance, 20);
  });
});
