import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createInstallHandlers } from '../src/routes/install.js';

function fakeSettingModel() {
  const store = new Map();
  return {
    store,
    async updateOne(filter, update) {
      store.set(filter.key, String(update.$set?.value ?? ''));
      return { acknowledged: true };
    },
    async findOne(filter) {
      const v = store.get(filter.key);
      return v === undefined ? null : { key: filter.key, value: v };
    },
  };
}

function fakeUserModel({ existing = [] } = {}) {
  const users = [...existing];
  return {
    users,
    async findOne(filter) {
      return users.find(u => u.role === filter.role) || null;
    },
    async create(doc) {
      const u = { _id: `u-${users.length + 1}`, role: 'user', ...doc };
      users.push(u);
      return u;
    },
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    send(html) { this.body = html; return this; },
    set() { return this; },
  };
  return res;
}

const deps = () => ({
  userModel: fakeUserModel(),
  settingModel: fakeSettingModel(),
  dbState: () => 1,
});

const validBody = {
  siteName: 'VIP90.bet',
  currency: 'TRY',
  adminUsername: 'kurucu',
  adminEmail: 'admin@example.com',
  adminPassword: 'GucluParola123',
};

describe('install route handlers', () => {
  test('status handler durum JSON döner', async () => {
    const { statusHandler } = createInstallHandlers(deps());
    const res = mockRes();
    await statusHandler({}, res);
    assert.strictEqual(res.body.dbConnected, true);
    assert.strictEqual(res.body.needsInstall, true);
  });

  test('run handler başarılı kurulumda envContent üretir', async () => {
    const { runHandler } = createInstallHandlers(deps());
    const res = mockRes();
    await runHandler({ body: validBody, protocol: 'https', get: () => 'ornek.com' }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.ok, true);
    assert.match(res.body.envContent, /^JWT_SECRET=.+/m);
    assert.match(res.body.envContent, /^JWT_REFRESH_SECRET=.+/m);
  });

  test('run handler doğrulama hatasında 400 + alan listesi döner', async () => {
    const { runHandler } = createInstallHandlers(deps());
    const res = mockRes();
    await runHandler({ body: { ...validBody, adminEmail: 'bozuk' } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.body.fields.includes('adminEmail'));
  });

  test('run handler kurulmuş sistemde 409 döner', async () => {
    const { runHandler } = createInstallHandlers({
      userModel: fakeUserModel({ existing: [{ username: 'x', role: 'admin' }] }),
      settingModel: fakeSettingModel(),
      dbState: () => 1,
    });
    const res = mockRes();
    await runHandler({ body: validBody }, res);
    assert.strictEqual(res.statusCode, 409);
  });

  test('run handler Docker dışı modda MONGODB_URI kullanıcı girdisinden gelir ve 409 yolu erişilebilir', async () => {
    const d = deps();
    const { runHandler } = createInstallHandlers(d);
    const res = mockRes();
    await runHandler({
      body: { ...validBody, deployMode: 'manual', mongoUri: 'mongodb://db.example:27017/x?replicaSet=rs0', clientUrl: 'https://ornek.com' },
      protocol: 'https', get: () => 'h',
    }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.match(res.body.envContent, /^MONGODB_URI=mongodb:\/\/db\.example:27017\/x\?replicaSet=rs0$/m);
    assert.match(res.body.envContent, /^CLIENT_URL=https:\/\/ornek\.com$/m);
    // ikinci deneme: admin artık var → handler 409 döner (router'da ayrı guard yok)
    const res2 = mockRes();
    await runHandler({ body: validBody, protocol: 'https', get: () => 'h' }, res2);
    assert.strictEqual(res2.statusCode, 409);
  });

  test('run handler varsayılan Docker modunda compose replica set URI\'sini yazar', async () => {
    const { runHandler } = createInstallHandlers(deps());
    const res = mockRes();
    await runHandler({ body: validBody, protocol: 'http', get: () => 'h' }, res);
    assert.match(res.body.envContent, /^MONGODB_URI=mongodb:\/\/mongo:27017\/betzone\?replicaSet=rs0$/m);
  });

  test('run handler seçilen modülleri açık yazar', async () => {
    const d = deps();
    const { runHandler } = createInstallHandlers(d);
    const res = mockRes();
    await runHandler({ body: { ...validBody, enableCrypto: 'on' }, protocol: 'http', get: () => 'h' }, res);
    assert.strictEqual(d.settingModel.store.get('module.crypto-payment.enabled'), 'true');
    assert.strictEqual(d.settingModel.store.has('module.kyc-verification.enabled'), false);
  });

  test('page handler kurulum formu HTML döner', async () => {
    const { pageHandler } = createInstallHandlers(deps());
    const res = mockRes();
    await pageHandler({}, res);
    const html = String(res.body);
    assert.match(html, /siteName/);
    assert.match(html, /adminPassword/);
    assert.match(html, /enableCrypto/);
    assert.match(html, /enableKyc/);
    assert.match(html, /deployMode/);
    assert.match(html, /\/install\/api\/run/);
  });
});
