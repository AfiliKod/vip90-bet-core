import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const run = async (mw, userId = 'u1') => {
  let nextArg; let called = false;
  await mw({ user: { id: userId } }, {}, a => { called = true; nextArg = a; });
  return { called, err: nextArg };
};

describe('requireKycForWithdrawal — operatör politikası', () => {
  let requireKycForWithdrawal;
  before(async () => { ({ requireKycForWithdrawal } = await import('../src/middleware/kycGate.js')); });

  const approved = async () => ({ kycStatus: 'approved', kycVerified: true });
  const pending = async () => ({ kycStatus: 'pending', kycVerified: false });
  const config = (over = {}) => async key => ({ KYC_ENABLED: 'true', KYC_FAILURE_POLICY: 'block', ...over })[key];
  const gate = (usability, { cfg = config(), findUser = pending, logs = [] } = {}) => requireKycForWithdrawal({
    getUsability: typeof usability === 'function' ? usability : async () => usability,
    getConfig: cfg, findUser, log: m => logs.push(m),
  });

  it('modül kapalı (operatör seçimi): geçirir, kullanıcıya bakmaz', async () => {
    const r = await run(gate('disabled', { findUser: async () => { throw new Error('çağrılmamalı'); } }));
    assert.equal(r.err, undefined);
  });

  it('modül açık + KYC yok: 403 KYC_REQUIRED', async () => {
    const { err } = await run(gate('usable'));
    assert.equal(err.status, 403);
    assert.equal(err.code, 'KYC_REQUIRED');
    assert.equal(err.details.kycStatus, 'pending');
  });

  it('modül açık + süresi dolmuş KYC: engellenir', async () => {
    assert.equal((await run(gate('usable', { findUser: async () => ({ kycStatus: 'expired', kycVerified: false }) }))).err.code, 'KYC_REQUIRED');
  });

  it('modül açık + onaylı KYC: geçer', async () => {
    assert.equal((await run(gate('usable', { findUser: approved }))).err, undefined);
  });

  it('modül açık ama "KYC aktif" kapalı: oyuncu başvuramayacağı için kapı uygulanmaz', async () => {
    assert.equal((await run(gate('usable', { cfg: config({ KYC_ENABLED: 'false' }) }))).err, undefined);
  });

  for (const reason of ['unknown', 'unlicensed']) {
    it(`durum ${reason} + politika block (varsayılan): 503 KYC_CHECK_UNAVAILABLE`, async () => {
      const { err } = await run(gate(reason, { findUser: approved }));
      assert.equal(err.status, 503);
      assert.equal(err.code, 'KYC_CHECK_UNAVAILABLE');
      assert.equal(err.details.reason, reason);
    });

    it(`durum ${reason} + politika allow: geçer ve uyarı log'lanır`, async () => {
      const logs = [];
      const r = await run(gate(reason, { cfg: config({ KYC_FAILURE_POLICY: 'allow' }), logs }));
      assert.equal(r.err, undefined);
      assert.match(logs[0], /KYC_FAILURE_POLICY=allow/);
    });
  }

  it('kullanılabilirlik sorgusu hata atarsa "unknown" sayılır → block', async () => {
    const { err } = await run(gate(async () => { throw new Error('x'); }));
    assert.equal(err.code, 'KYC_CHECK_UNAVAILABLE');
  });

  it('politika okunamazsa varsayılan block', async () => {
    const { err } = await run(gate('unknown', { cfg: async () => { throw new Error('db'); } }));
    assert.equal(err.code, 'KYC_CHECK_UNAVAILABLE');
  });

  it('politika tanımsızsa (eski kurulum) varsayılan block', async () => {
    const { err } = await run(gate('unknown', { cfg: async () => null }));
    assert.equal(err.code, 'KYC_CHECK_UNAVAILABLE');
  });
});

describe('modül durumu: kapalı ile okunamadı ayrımı', () => {
  it('enabledState: okuma başarısızsa null, kayıt yoksa false, açıksa true', async () => {
    const { createModuleStore } = await import('../src/modules/registry.js');
    let fail = false;
    const store = createModuleStore({ load: async () => { if (fail) throw new Error('db'); return { 'kyc-verification': true }; }, ttlMs: 0 });
    assert.equal(await store.enabledState('kyc-verification'), true);
    assert.equal(await store.enabledState('sms-gateway'), false);
    fail = true;
    assert.equal(await store.enabledState('kyc-verification'), null);
    assert.equal(await store.isEnabled('kyc-verification'), false, 'isEnabled fail-closed kalır');
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
