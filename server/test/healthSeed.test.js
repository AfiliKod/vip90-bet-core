import { test, describe } from 'node:test';
import assert from 'node:assert';
import { runHealthChecks } from '../src/health/checks.js';
import { seedFirstRun } from '../src/health/seed.js';

// ─── Sahte bağımlılıklar (MongoDB'siz saf mantık testi) ─────────────

function fakeSettingModel({ existing = {} } = {}) {
  const store = new Map(Object.entries(existing));
  return {
    store,
    async findOne(filter) {
      const v = store.get(filter.key);
      return v === undefined ? null : { key: filter.key, value: v };
    },
    async updateOne(filter, update) {
      store.set(filter.key, String(update.$set?.value ?? ''));
      return { acknowledged: true };
    },
  };
}

const healthyDeps = (over = {}) => ({
  dbState: () => 1,
  env: {
    MONGODB_URI: 'mongodb://mongo:27017/betzone',
    JWT_SECRET: 'x'.repeat(64),
    JWT_REFRESH_SECRET: 'y'.repeat(64),
    CLIENT_URL: 'https://ornek.com',
    PALACE_API_TOKEN: 'tok',
    SMTP_HOST: 'smtp.ornek.com',
  },
  pendingMigrations: async () => [],
  settingModel: fakeSettingModel(),
  ...over,
});

describe('runHealthChecks', () => {
  test('her şey yolundaysa ok:true ve tüm kontroller ok/warn', async () => {
    const r = await runHealthChecks(healthyDeps());
    assert.strictEqual(r.ok, true);
    for (const c of r.checks) {
      assert.ok(['ok', 'warn'].includes(c.status), `${c.name}: ${c.status}`);
    }
  });

  test('DB bağlı değilse fail kaydı + ok:false', async () => {
    const r = await runHealthChecks(healthyDeps({ dbState: () => 0 }));
    const db = r.checks.find(c => c.name === 'database');
    assert.strictEqual(db.status, 'fail');
    assert.strictEqual(r.ok, false);
  });

  test('zorunlu env eksikse fail, opsiyonel eksikse warn', async () => {
    const r = await runHealthChecks(healthyDeps({
      env: { MONGODB_URI: 'mongodb://localhost/x', JWT_SECRET: 'kisa' },
      // JWT_REFRESH_SECRET ve CLIENT_URL eksik; opsiyoneller de yok
    }));
    const byName = Object.fromEntries(r.checks.map(c => [c.name, c]));
    assert.strictEqual(byName['env:JWT_SECRET'].status, 'fail'); // var ama kısa
    assert.strictEqual(byName['env:JWT_REFRESH_SECRET'].status, 'fail');
    assert.strictEqual(byName['env:CLIENT_URL'].status, 'fail');
    assert.strictEqual(byName['service:igames'].status, 'warn');
    assert.strictEqual(byName['service:smtp'].status, 'warn');
    assert.strictEqual(r.ok, false);
  });

  test('bekleyen migration varsa uyarıdır, hata değil', async () => {
    const r = await runHealthChecks(healthyDeps({ pendingMigrations: async () => ['0002_x'] }));
    const m = r.checks.find(c => c.name === 'migrations');
    assert.strictEqual(m.status, 'warn');
    assert.strictEqual(r.ok, true); // yalnızca fail'ler ok'u düşürür
  });

  test('site ayarları tohumlanmamışsa bilgi notu düşer (warn)', async () => {
    const r = await runHealthChecks(healthyDeps()); // boş Setting store
    const s = r.checks.find(c => c.name === 'seed');
    assert.strictEqual(s.status, 'warn');
  });
});

describe('seedFirstRun', () => {
  const base = (over = {}) => ({
    settingModel: fakeSettingModel(),
    userModel: { users: [], async findOne(f) { return this.users.find(u => u.role === f.role) || null; }, async create(d) { const u = { _id: `u${this.users.length + 1}`, role: 'user', ...d }; this.users.push(u); return u; } },
    ...over,
  });

  test('varsayılan site ayarlarını yazar', async () => {
    const deps = base();
    const r = await seedFirstRun(deps);
    assert.strictEqual(deps.settingModel.store.get('site.name'), 'VIP90.bet');
    assert.strictEqual(deps.settingModel.store.get('site.currency'), 'TRY');
    assert.ok(r.seeded.includes('site.name'));
  });

  test('idempotent: mevcut ayarın üzerine YAZMAZ', async () => {
    const deps = base({ settingModel: fakeSettingModel({ existing: { 'site.name': 'Özel Site' } }) });
    await seedFirstRun(deps);
    assert.strictEqual(deps.settingModel.store.get('site.name'), 'Özel Site');
  });

  test('admin yalnızca açıkça istenirse oluşturulur', async () => {
    const deps = base();
    await seedFirstRun(deps); // admin bilgisi verilmedi
    assert.strictEqual(deps.userModel.users.length, 0);

    await seedFirstRun({
      ...deps,
      admin: { username: 'kurucu', email: 'a@b.com', password: 'GucluParola123' },
    });
    assert.strictEqual(deps.userModel.users.length, 1);
    assert.strictEqual(deps.userModel.users[0].role, 'admin');
  });

  test('admin zaten varsa oluşturmaz ve raporlar', async () => {
    const deps = base();
    deps.userModel.users.push({ username: 'onceki', role: 'admin' });
    const r = await seedFirstRun({
      ...deps,
      admin: { username: 'ikinci', email: 'c@d.com', password: 'GucluParola123' },
    });
    assert.strictEqual(deps.userModel.users.length, 1);
    assert.ok(r.skipped.some(s => s === 'admin'));
  });

  test('zayıf parola ile admin oluşturma reddedilir', async () => {
    const deps = base();
    await assert.rejects(
      () => seedFirstRun({ ...deps, admin: { username: 'k', email: 'a@b.com', password: 'kisa' } }),
      /VALIDATION/,
    );
    assert.strictEqual(deps.userModel.users.length, 0);
  });
});
