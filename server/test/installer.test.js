import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createInstaller } from '../../installer/core.js';

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
