/**
 * Script env yükleme düzeni (`server/scripts/*`) — node:test.
 *
 * Neden bu denetim: belgelenen çağrı biçimi kökten çalıştırma
 * (`node server/scripts/migrate.js`, `node server/scripts/healthcheck.js` —
 * docs/RUNBOOK.md, docs/product/01-kurulum.md). `import 'dotenv/config'` ve
 * `resolve('../.env')` cwd'ye baktığı için o çağrı production'da
 * `public_html/.env`, dev'de kök `.env` okuyordu; `'../../.env'` yazımı da
 * cwd'den bağımsız ama yine repo/decode köküne düşüyordu. Uygulamanın kendi
 * dosyası `server/.env`dir (app.js), scriptler de onu okumalı.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPTS_DIR = fileURLToPath(new URL('../scripts', import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..', '..');

const scriptFiles = () => readdirSync(SCRIPTS_DIR)
  .filter(f => /\.(js|mjs)$/.test(f) && f !== 'igamesProxy.worker.js')
  .map(f => path.join(SCRIPTS_DIR, f));

// Kabul edilen tek hedef: server/.env (lib üzerinden ya da __dirname ile).
const OK_LOADS = [
  /'\.\/lib\/env\.mjs'/,
  /resolve\(__dirname,\s*'\.\.\/\.env'\)/,
  /join\(__dirname,\s*'\.\.',\s*'\.env'\)/,
  /path\.join\(__dirname,\s*'\.\.',\s*'\.env'\)/,
];
const BAD_LOADS = [
  [/import 'dotenv\/config';?/, 'cwd-bazlı `import \'dotenv/config\'`'],
  [/config\(\{\s*path:\s*resolve\('\.\.\/\.env'\)\s*\}\)/, "cwd-bazlı `resolve('../.env')`"],
  /'\.\.\/\.\.\/\.env'/,
];

describe('server/scripts env yükleme düzeni', () => {
  const files = scriptFiles();

  test('script listesi boş değil (denetim kör kalmasın)', () => {
    assert.ok(files.length > 20, `beklenenden az script: ${files.length}`);
  });

  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    // Yalniz env YUKLEYEN dosyalari olc: process.env okuyup hicbir env dosyasi
    // yuklemeyen scriptler bu denetimin kapsami disinda (ayri bir konu).
    const loadsEnv = /from 'dotenv'/.test(src) || /\/\.\/lib\/env\.mjs/.test(src) || /config\(/.test(src);
    if (!loadsEnv) continue;
    const name = path.basename(file);

    test(`${name}: env yüklemesi cwd'den ve yanlış dosyadan bağımsız`, () => {
      for (const bad of BAD_LOADS) {
        const [re, label] = Array.isArray(bad) ? [bad[0], bad[1]] : [bad, 'repo/decode kökü `.env`'];
        if (re.test(src)) assert.fail(`${name}: ${label} kullanıyor — server/.env yerine başka dosya okunur`);
      }
      assert.ok(OK_LOADS.some(re => re.test(src)), `${name}: env yüklemesi kabul edilen kalıplardan hiçbirine uymuyor`);
    });
  }

  test('lib/env.mjs → server/.env, tıpkı app.js gibi', () => {
    const lib = readFileSync(path.join(SCRIPTS_DIR, 'lib', 'env.mjs'), 'utf8');
    assert.match(lib, /SERVER_ENV_FILE/);
    assert.match(lib, /loadServerEnv\(\);/);
    const app = readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    assert.match(app, /config\(\{ path: path\.join\(__dirname, 'server', '\.env'\)/);
  });

  test('SERVER_ENV_FILE cwd değişse de aynı yolu verir', () => {
    const libUrl = pathToFileURL(path.join(SCRIPTS_DIR, 'lib', 'env.mjs')).href;
    const probe = `import(${JSON.stringify(libUrl)}).then((m) => console.log(m.SERVER_ENV_FILE))`;
    const outs = [ROOT, path.join(ROOT, 'server', 'scripts')].map(cwd => {
      const r = spawnSync(process.execPath, ['-e', probe], { cwd, encoding: 'utf8', timeout: 20000 });
      assert.equal(r.status, 0, `spawn başarısız (cwd=${cwd}): ${r.stderr}`);
      return r.stdout.trim();
    });
    assert.equal(outs[0], outs[1], 'aynı cwd-bağımsız yol beklenir');
    assert.ok(outs[0].endsWith(`${path.sep}server${path.sep}.env`), `beklenen .../server/.env, gelen: ${outs[0]}`);
  });
});
