import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const run = async (mw, userId = 'u1') => {
  let nextArg; let called = false;
  await mw({ user: { id: userId } }, {}, a => { called = true; nextArg = a; });
  return { called, err: nextArg };
};

describe('requireKycForWithdrawal', () => {
  let requireKycForWithdrawal;
  before(async () => { ({ requireKycForWithdrawal } = await import('../src/middleware/kycGate.js')); });

  it('modül kapalıyken geçirir (kullanıcıya bakmaz)', async () => {
    const mw = requireKycForWithdrawal({ isUsable: async () => false, findUser: async () => { throw new Error('çağrılmamalı'); } });
    const r = await run(mw);
    assert.equal(r.err, undefined);
  });

  it('modül durumu ölçülemezse geçirir (davranış değişmez)', async () => {
    const mw = requireKycForWithdrawal({ isUsable: async () => { throw new Error('x'); }, findUser: async () => ({}) });
    assert.equal((await run(mw)).err, undefined);
  });

  it('modül açık + KYC yok: 403 KYC_REQUIRED', async () => {
    const mw = requireKycForWithdrawal({ isUsable: async (id) => id === 'kyc-verification', findUser: async () => ({ kycStatus: 'pending', kycVerified: false }) });
    const { err } = await run(mw);
    assert.equal(err.status, 403);
    assert.equal(err.code, 'KYC_REQUIRED');
    assert.equal(err.details.kycStatus, 'pending');
  });

  it('modül açık + süresi dolmuş KYC: engellenir', async () => {
    const mw = requireKycForWithdrawal({ isUsable: async () => true, findUser: async () => ({ kycStatus: 'expired', kycVerified: false }) });
    assert.equal((await run(mw)).err.code, 'KYC_REQUIRED');
  });

  it('modül açık + onaylı KYC: geçer', async () => {
    const mw = requireKycForWithdrawal({ isUsable: async () => true, findUser: async () => ({ kycStatus: 'approved', kycVerified: true }) });
    assert.equal((await run(mw)).err, undefined);
  });
});

describe('çekim uçlarına bağlı + expireOldKyc', () => {
  it('bank/transactions/crypto çekim route\'larında kapı var, yatırmada yok', async () => {
    const find = (router, path, method = 'post') => router.stack.find(l => l.route?.path === path && l.route.methods[method]).route.stack.map(s => s.name);
    const bank = (await import('../src/routes/bank.js')).default;
    const tx = (await import('../src/routes/transactions.js')).default;
    const crypto = (await import('../src/routes/crypto.js')).default;
    assert.ok(find(bank, '/withdraw').includes('kycGate'));
    assert.ok(find(tx, '/withdraw').includes('kycGate'));
    assert.ok(find(crypto, '/withdraw-request').includes('kycGate'));
    assert.ok(!find(bank, '/deposit').includes('kycGate'));
    assert.ok(!find(tx, '/deposit').includes('kycGate'));
  });

  describe('expireOldKyc', () => {
    let User;
    before(async () => {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_kycgate');
      User = (await import('../src/models/User.js')).default;
      await User.deleteMany({}); await User.init();
    });
    after(async () => { await User.deleteMany({}); await mongoose.disconnect(); });

    it('1 yılı geçen onayı expired yapar, yenisine dokunmaz', async () => {
      const { expireOldKyc } = await import('../src/services/kyc.js');
      const old = await User.create({ username: 'kold', email: 'kold@t.local', password: 'Password1', kycStatus: 'approved', kycVerified: true, kycApprovedAt: new Date(Date.now() - 400 * 864e5) });
      const fresh = await User.create({ username: 'kfresh', email: 'kfresh@t.local', password: 'Password1', kycStatus: 'approved', kycVerified: true, kycApprovedAt: new Date() });
      assert.equal(await expireOldKyc(), 1);
      assert.equal((await User.findById(old._id)).kycStatus, 'expired');
      assert.equal((await User.findById(fresh._id)).kycStatus, 'approved');
    });

    it('startKycExpiryJob server.js\'te bağlı', async () => {
      const fs = await import('node:fs');
      const src = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
      assert.match(src, /startKycExpiryJob\(\)/);
    });
  });
});
