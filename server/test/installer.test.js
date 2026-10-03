import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createInstaller, DEFAULT_CURRENCY_CODES, OPTIONAL_MODULES, DOCKER_MONGODB_URI } from '../../installer/core.js';
import { CURRENCY_DEFINITIONS } from '../src/currency/registry.js';
import { MODULE_DEFINITIONS } from '../src/modules/registry.js';
import { createBrandingStore } from '../src/branding/registry.js';
import { createCurrencyStore } from '../src/currency/registry.js';
import { createModuleStore } from '../src/modules/registry.js';

// ─── Sahte modeller (MongoDB'siz — izolasyon hatasına takılmadan saf mantık) ───

function fakeSettingModel() {
  const store = new Map();
  return {
    store,
    async updateOne(filter, update) {
      const key = filter.key;
      const value = update.$set?.value ?? update.value ?? '';
      store.set(key, String(value));
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
      return users.find(u =>
        (filter.username && u.username === filter.username) ||
        (filter.email && u.email === filter.email) ||
        (filter.role && u.role === filter.role)
      ) || null;
    },
    async create(doc) {
      const u = { _id: `u-${users.length + 1}`, role: 'user', isActive: true, ...doc };
      users.push(u);
      return u;
    },
    async countDocuments() { return users.length; },
  };
}

const validInput = {
  siteName: 'VIP90.bet',
  currency: 'TRY',
  adminUsername: 'kurucu',
  adminEmail: 'admin@example.com',
  adminPassword: 'GucluParola123',
};

describe('createInstaller — status()', () => {
  test('DB bağlı değilse dbConnected false, kurulum gerekli der', async () => {
    const inst = createInstaller({
      userModel: fakeUserModel(),
      settingModel: fakeSettingModel(),
      dbState: () => 0,
    });
    const s = await inst.status();
    assert.strictEqual(s.dbConnected, false);
    assert.strictEqual(s.needsInstall, true);
  });

  test('admin yoksa kurulum gerekli der', async () => {
    const inst = createInstaller({
      userModel: fakeUserModel(),
      settingModel: fakeSettingModel(),
      dbState: () => 1,
    });
    const s = await inst.status();
    assert.strictEqual(s.dbConnected, true);
    assert.strictEqual(s.adminExists, false);
    assert.strictEqual(s.needsInstall, true);
  });

  test('admin varsa kurulum gerekli DERMEZ — mevcut sistem korunur', async () => {
    const inst = createInstaller({
      userModel: fakeUserModel({ existing: [{ username: 'x', role: 'admin' }] }),
      settingModel: fakeSettingModel(),
      dbState: () => 1,
    });
    const s = await inst.status();
    assert.strictEqual(s.adminExists, true);
    assert.strictEqual(s.needsInstall, false);
  });
});

describe('createInstaller — run() doğrulama', () => {
  const make = () => createInstaller({
    userModel: fakeUserModel(),
    settingModel: fakeSettingModel(),
    dbState: () => 1,
  });

  const cases = [
    ['site adı boş', { ...validInput, siteName: '' }],
    ['site adı çok uzun', { ...validInput, siteName: 'x'.repeat(61) }],
    ['para birimi geçersiz', { ...validInput, currency: 'türk lirası!' }],
    ['kullanıcı adı kısa', { ...validInput, adminUsername: 'ab' }],
    ['email geçersiz', { ...validInput, adminEmail: 'kirli-input' }],
    ['parola kısa', { ...validInput, adminPassword: 'kisa' }],
  ];

  for (const [label, input] of cases) {
    test(`geçersiz girdiyi reddeder: ${label}`, async () => {
      await assert.rejects(() => make().run(input), /VALIDATION/);
    });
  }
});

describe('createInstaller — run() kurulum', () => {
  test('admin kullanıcısını role=admin ile oluşturur', async () => {
    const users = fakeUserModel();
    const inst = createInstaller({ userModel: users, settingModel: fakeSettingModel(), dbState: () => 1 });
    await inst.run(validInput);
    assert.strictEqual(users.users.length, 1);
    const admin = users.users[0];
    assert.strictEqual(admin.role, 'admin');
    assert.strictEqual(admin.username, 'kurucu');
    assert.strictEqual(admin.email, 'admin@example.com');
    assert.strictEqual(admin.password, 'GucluParola123'); // hash pre-save hook'ta (gerçek modelde)
  });

  test('site ayarlarını Setting koleksiyonuna yazar', async () => {
    const settings = fakeSettingModel();
    const inst = createInstaller({ userModel: fakeUserModel(), settingModel: settings, dbState: () => 1 });
    await inst.run(validInput);
    assert.strictEqual(settings.store.get('site.name'), 'VIP90.bet');
    assert.strictEqual(settings.store.get('site.currency'), 'TRY');
    assert.strictEqual(settings.store.get('setup.completed'), 'true');
  });

  test('zaten kurulmuşsa ALREADY_INSTALLED ile reddeder, hiçbir şey yazmaz', async () => {
    const users = fakeUserModel({ existing: [{ username: 'onceki', role: 'admin' }] });
    const settings = fakeSettingModel();
    const inst = createInstaller({ userModel: users, settingModel: settings, dbState: () => 1 });
    await assert.rejects(() => inst.run(validInput), /ALREADY_INSTALLED/);
    assert.strictEqual(users.users.length, 1); // yenisi eklenmedi
    assert.strictEqual(settings.store.size, 0); // ayar yazılmadı
  });
});

describe('createInstaller — secrets ve .env üretimi', () => {
  test('generateSecrets iki farklı, uzun rastgele değer üretir', () => {
    const inst = createInstaller({ userModel: fakeUserModel(), settingModel: fakeSettingModel(), dbState: () => 1 });
    const a = inst.generateSecrets();
    const b = inst.generateSecrets();
    assert.notStrictEqual(a.jwtSecret, b.jwtSecret);
    assert.notStrictEqual(a.jwtRefreshSecret, b.jwtRefreshSecret);
    assert.ok(a.jwtSecret.length >= 43, 'jwt secret en az 256-bit entropy olmalı (base64 ≥43 karakter)');
    assert.ok(a.jwtRefreshSecret.length >= 43);
  });

  test('buildEnvContent JWT anahtarlarını ve kullanım notunu içerir', () => {
    const inst = createInstaller({ userModel: fakeUserModel(), settingModel: fakeSettingModel(), dbState: () => 1 });
    const env = inst.buildEnvContent({ jwtSecret: 'AAA', jwtRefreshSecret: 'BBB', clientUrl: 'https://ornek.com' });
    assert.match(env, /^JWT_SECRET=AAA$/m);
    assert.match(env, /^JWT_REFRESH_SECRET=BBB$/m);
    assert.match(env, /^CLIENT_URL=https:\/\/ornek\.com$/m);
    assert.match(env, /MONGODB_URI/, 'compose senaryosu için yönlendirme notu kalmalı');
  });
});

describe('installer — uygulamanın gerçekten okuduğu ayarlara bağlanma', () => {
  const make = (settings = fakeSettingModel(), extra = {}) =>
    createInstaller({ userModel: fakeUserModel(), settingModel: settings, dbState: () => 1, ...extra });

  test('desteklenen para birimleri currency registry ile aynı', () => {
    assert.deepStrictEqual(DEFAULT_CURRENCY_CODES, CURRENCY_DEFINITIONS.map(c => c.code));
  });

  test('isteğe bağlı modül kimlikleri modül registry\'sinde var', () => {
    for (const m of OPTIONAL_MODULES) {
      assert.ok(MODULE_DEFINITIONS.some(d => d.id === m.moduleId), m.moduleId);
    }
  });

  test('branding.siteName ve currency.code yazılır; branding/currency store bunları okur', async () => {
    const settings = fakeSettingModel();
    await make(settings).run({ ...validInput, siteName: 'Benim Sitem', currency: 'eur' });
    assert.strictEqual(settings.store.get('branding.siteName'), 'Benim Sitem');
    assert.strictEqual(settings.store.get('currency.code'), 'EUR');
    // Üretimdeki store'ların DI load'una aynı verilerle bağlayıp gerçekten okuduklarını doğrula
    const branding = createBrandingStore({ load: async () => ({ siteName: settings.store.get('branding.siteName') }) });
    assert.strictEqual((await branding.getValues()).siteName, 'Benim Sitem');
    const currency = createCurrencyStore({ load: async () => ({ code: settings.store.get('currency.code') }) });
    assert.strictEqual((await currency.getActive()).code, 'EUR');
  });

  test('desteklenmeyen para birimi (registry dışı) reddedilir', async () => {
    await assert.rejects(() => make().run({ ...validInput, currency: 'GBP' }), /VALIDATION/);
  });

  test('modül seçilmediyse modül kaydı YAZILMAZ (kayıt yok = kapalı)', async () => {
    const settings = fakeSettingModel();
    const r = await make(settings).run(validInput);
    assert.deepStrictEqual(r.enabledModules, []);
    assert.ok(![...settings.store.keys()].some(k => k.startsWith('module.')));
  });

  test('crypto ve KYC seçilirse modül kaydı açık yazılır ve moduleStore açık okur', async () => {
    const settings = fakeSettingModel();
    const r = await make(settings).run({ ...validInput, enableCrypto: 'on', enableKyc: true });
    assert.deepStrictEqual(r.enabledModules.sort(), ['crypto-payment', 'kyc-verification']);
    assert.strictEqual(settings.store.get('module.crypto-payment.enabled'), 'true');
    assert.strictEqual(settings.store.get('module.kyc-verification.enabled'), 'true');
    const store = createModuleStore({ load: async () => ({
      'crypto-payment': settings.store.get('module.crypto-payment.enabled') === 'true',
      'kyc-verification': settings.store.get('module.kyc-verification.enabled') === 'true',
    }) });
    assert.strictEqual(await store.isEnabled('crypto-payment'), true);
    assert.strictEqual(await store.isEnabled('kyc-verification'), true);
  });

  test('yalnız biri seçilirse diğeri yazılmaz', async () => {
    const settings = fakeSettingModel();
    await make(settings).run({ ...validInput, enableKyc: 'on' });
    assert.strictEqual(settings.store.has('module.crypto-payment.enabled'), false);
    assert.strictEqual(settings.store.get('module.kyc-verification.enabled'), 'true');
  });

  test('afterSettingsWritten ayarlar yazıldıktan sonra çağrılır', async () => {
    let called = 0;
    await make(fakeSettingModel(), { afterSettingsWritten: () => { called++; } }).run(validInput);
    assert.strictEqual(called, 1);
  });

  test('Docker modunda .env replicaSet=rs0 içeren compose URI\'sini yazar', () => {
    const env = make().buildEnvContent({ jwtSecret: 'A', jwtRefreshSecret: 'B', clientUrl: 'https://x.com' });
    assert.match(env, new RegExp(`^MONGODB_URI=${DOCKER_MONGODB_URI.replace(/[?.]/g, '\\$&')}$`, 'm'));
    assert.match(env, /replicaSet=rs0/);
  });

  test('Docker dışı modda kullanıcının MongoDB adresi yazılır', () => {
    const inst = make();
    const { mongoUri } = inst.resolveMongoUri({ deployMode: 'manual', mongoUri: ' mongodb+srv://user:secret@example.net/db ' });
    const env = inst.buildEnvContent({ jwtSecret: 'A', jwtRefreshSecret: 'B', clientUrl: 'https://x.com', mongoUri });
    assert.match(env, /^MONGODB_URI=mongodb\+srv:\/\/user:secret@example\.net\/db$/m);
    assert.ok(!/mongo:27017/.test(env));
  });

  test('manuel modda geçersiz/eksik MongoDB adresi VALIDATION ile reddedilir, admin oluşmaz', async () => {
    const users = fakeUserModel();
    const inst = createInstaller({ userModel: users, settingModel: fakeSettingModel(), dbState: () => 1 });
    await assert.rejects(() => inst.run({ ...validInput, deployMode: 'manual', mongoUri: '' }), /VALIDATION/);
    await assert.rejects(() => inst.run({ ...validInput, deployMode: 'manual', mongoUri: 'mongodb://h/db\nJWT_SECRET=x' }), /VALIDATION/);
    assert.strictEqual(users.users.length, 0);
  });

  test('safeClientUrl satır enjeksiyonunu ve geçersiz değeri yedeğe düşürür', () => {
    const inst = make();
    assert.strictEqual(inst.safeClientUrl('https://a.com', 'F'), 'https://a.com');
    assert.strictEqual(inst.safeClientUrl('https://a.com\nX=1', 'F'), 'F');
    assert.strictEqual(inst.safeClientUrl('', 'F'), 'F');
  });
});
