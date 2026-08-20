import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import YAML from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const composePath = path.join(ROOT, 'docker-compose.yml');
const caddyfilePath = path.join(ROOT, 'deploy', 'Caddyfile');

let compose;
try {
  compose = YAML.parse(readFileSync(composePath, 'utf8'));
} catch (e) {
  compose = null;
  describe('docker-compose.yml', () => {
    test('dosya mevcut ve geçerli YAML', () => {
      assert.fail(`docker-compose.yml okunamadı/parse edilemedi: ${e.message}`);
    });
  });
}

describe('K1 — docker-compose.yml yapısı', () => {
  test.skip(!compose, 'compose dosyası yok — sonraki testler atlanır');

  test('app, mongo ve ters vekil (caddy) servisleri tanımlı', () => {
    const services = Object.keys(compose.services || {});
    for (const s of ['app', 'mongo', 'caddy']) {
      assert.ok(services.includes(s), `servis eksik: ${s}`);
    }
  });

  test('app servisi depodaki Dockerfile\'dan build ediliyor', () => {
    const app = compose.services.app;
    assert.ok(app.build, 'app.build yok');
    assert.strictEqual(app.build.context ?? app.build, '.');
    assert.ok(!app.image, 'app yayınlanmış image değil, yerel build olmalı');
  });

  test('app, mongo hazır olunca başlıyor (healthcheck gate)', () => {
    const dep = compose.services.app.depends_on?.mongo;
    assert.ok(dep, 'app -> mongo depends_on yok');
    assert.strictEqual(dep.condition, 'service_healthy');
  });

  test('MONGODB_URI compose içinde mongo servisine işaret ediyor (env_file override)', () => {
    const env = compose.services.app.environment;
    const flat = Array.isArray(env) ? env : Object.entries(env ?? {}).map(([k, v]) => `${k}=${v}`);
    const uri = flat.find(v => String(v).startsWith('MONGODB_URI='));
    assert.ok(uri, 'MONGODB_URI environment olarak set edilmemiş');
    assert.match(uri, /mongodb:\/\/mongo:27017\//);
  });

  test('mongo verisi kalıcı volume\'de', () => {
    const mongo = compose.services.mongo;
    const volumes = mongo.volumes ?? [];
    assert.ok(
      volumes.some(v => String(v).includes('/data/db')),
      'mongo /data/db volume bağlantısı yok',
    );
    assert.ok((compose.volumes && Object.keys(compose.volumes).length > 0), 'top-level volumes bölümü boş');
  });

  test('mongo dış dünyaya port açmıyor (güvenlik)', () => {
    const mongo = compose.services.mongo;
    assert.ok(!mongo.ports || mongo.ports.length === 0, 'mongo ports ile yayınlanıyor — olmamalı');
  });

  test('ters vekil 80/443 yayınlar, app portu dışa açık değil', () => {
    const caddyPorts = (compose.services.caddy.ports ?? []).map(p => String(p).split(':')[0]);
    assert.ok(caddyPorts.includes('80'), 'caddy 80 yayınlamıyor');
    assert.ok(caddyPorts.includes('443'), 'caddy 443 yayınlamıyor');
    const appPorts = compose.services.app.ports ?? [];
    assert.strictEqual(appPorts.length, 0, 'app doğrudan host portuna bağlı — trafik caddy üzerinden gitmeli');
  });

  test('gizli değerler .env dosyasından geliyor (env_file)', () => {
    const envFile = compose.services.app.env_file;
    assert.ok(envFile, 'app.env_file yok');
    const list = Array.isArray(envFile) ? envFile : [envFile];
    assert.ok(list.some(f => String(f).includes('.env')), '.env referansı yok');
  });
});

describe('K1 — deploy/Caddyfile', () => {
  let caddy = '';
  try {
    caddy = readFileSync(caddyfilePath, 'utf8');
  } catch {
    /* aşağıdaki test yakalar */
  }

  test('Caddyfile mevcut', () => {
    assert.ok(caddy.length > 0, `deploy/Caddyfile okunamadı: ${caddyfilePath}`);
  });

  test("app:3001'e ters vekil yapıyor", () => {
    assert.match(caddy, /reverse_proxy\s+\S*app:3001/);
  });

  test("sertifika: gerçek domainde otomatik Let's Encrypt, localhost'ta self-signed", () => {
    // Site adresi env'den gelmeli. Caddy varsayılanı: gerçek domain → ACME
    // (Let's Encrypt), localhost → internal CA (self-signed). 'tls internal'
    // zorunlu satır olarak yazılırsa gerçek domainde LE kırılır — olmamalı.
    assert.match(caddy, /\{\$DOMAIN\}/, 'site adresi {$DOMAIN} değişkeni kullanmalı');
    assert.doesNotMatch(caddy, /^\s*tls\s+internal\s*$/m, "'tls internal' sabit satır Let's Encrypt'i bozar");
  });
});

describe('K1 — Dockerfile sağlık kontrolü uyumu', () => {
  test("Dockerfile HEALTHCHECK /api/health'i yokluyor (sunucuda rota mevcut)", () => {
    const df = readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
    assert.match(df, /HEALTHCHECK/);
    assert.match(df, /api\/health/);
  });
});
