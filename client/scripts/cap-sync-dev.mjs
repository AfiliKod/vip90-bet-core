#!/usr/bin/env node
// Geliştirme için Capacitor sync: CAP_SERVER_URL'deki dev sunucusunu (Vite)
// native uygulamaya canlı yenileme hedefi olarak yazar.
//
//   CAP_SERVER_URL=http://<makine-LAN-IP>:5173 npm run cap:sync:dev -- ios
//
// Depodaki capacitor.config.json ÜRETİM yapılandırmasıdır (server.url yok,
// paketlenmiş dist/ kullanılır). Capacitor JSON yapılandırmasında env
// desteklemediği için bu betik dosyayı geçici olarak dev URL'siyle yazar,
// `cap sync`'i çalıştırır ve dosyayı HER DURUMDA özgün haline döndürür.
// localhost cihazdan/simülatörden bu makineyi göstermez; LAN IP kullanın.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfgPath = join(root, 'capacitor.config.json');
const url = process.env.CAP_SERVER_URL;
if (!url || !/^https?:\/\/\S+$/.test(url)) {
  console.error('CAP_SERVER_URL tanımlı olmalı (ör. http://192.168.1.5:5173)');
  process.exit(2);
}

const original = readFileSync(cfgPath, 'utf8');
const dev = { ...JSON.parse(original), server: { url, cleartext: url.startsWith('http://') } };
let code = 1;
try {
  writeFileSync(cfgPath, JSON.stringify(dev, null, 2) + '\n');
  const args = process.argv.slice(2);
  const r = spawnSync('npx', ['cap', 'sync', ...(args.length ? args : [])], { cwd: root, stdio: 'inherit' });
  code = r.status ?? 1;
} finally {
  writeFileSync(cfgPath, original);
}
process.exit(code);
