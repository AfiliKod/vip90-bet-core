#!/usr/bin/env node
// Kullanım: node scripts/optional-run.mjs <klasör> <komut> [argümanlar...]
// <klasör>/package.json yoksa (eklenti kurulu değil: game-host, odds-provider
// birer alt modül symlink'idir) uyarı basıp 0 ile çıkar; varsa komutu çalıştırır.
// Eklentisiz bir alıcı kurulumunda `npm run install:all` / `npm run dev`
// ENOENT ile düşmesin diye kullanılır.
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const [dir, cmd, ...args] = process.argv.slice(2);
if (!dir || !cmd) {
  console.error('Kullanım: optional-run.mjs <klasör> <komut> [argümanlar...]');
  process.exit(2);
}
if (!existsSync(join(dir, 'package.json'))) {
  console.warn(`[uyarı] ${dir}/ bulunamadı (eklenti kurulu değil) — "${cmd} ${args.join(' ')}" atlandı.`);
  process.exit(0);
}
const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
child.on('error', (e) => { console.error(e.message); process.exit(1); });
