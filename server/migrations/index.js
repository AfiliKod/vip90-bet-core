/**
 * K4 — Migration keşfi + canlı bağlantı.
 *
 * discoverMigrations(): server/migrations/ altındaki migration modüllerini
 * okur, sözleşmeye uymayanları HATA olarak raporlar (sessizce atlamak,
 * "uygulandı sanılan ama koşmayan" migration demektir).
 *
 * createLiveApplyMigration(): D9'un registerUpdateHandler'ına enjekte
 * edilecek gerçek applyMigration — keşif + Migration modeli kaydı birleşimi.
 */
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApplyMigration } from './runner.js';

const DEFAULT_DIR = path.dirname(fileURLToPath(import.meta.url));

export async function discoverMigrations(dir = DEFAULT_DIR) {
  const entries = await readdir(dir);
  const files = entries.filter(f => f.endsWith('.js') && !f.startsWith('_') && f !== 'index.js' && f !== 'runner.js');
  files.sort(); // aynı sürümde birden çok migration varsa deterministik sıra

  const out = [];
  for (const file of files) {
    const mod = await import(path.join(dir, file));
    const def = mod.default;
    if (!def || typeof def.version !== 'string' || typeof def.up !== 'function') {
      throw new Error(`Geçersiz migration dosyası: ${file} — { version, up } sözleşmesine uymuyor`);
    }
    out.push({
      version: def.version,
      name: def.name || file.replace(/\.js$/, ''),
      description: def.description || '',
      up: def.up,
    });
  }
  return out;
}

/** Gerçek DB kaydıyla (Migration modeli) çalışan applyMigration üretir. */
export function createLiveApplyMigration() {
  return createApplyMigration({
    loadMigrations: () => discoverMigrations(),
    getApplied: async () => {
      const Migration = (await import('../src/models/Migration.js')).default;
      const rows = await Migration.find().select('name').lean();
      return rows.map(r => r.name);
    },
    markApplied: async ({ name, version }) => {
      const Migration = (await import('../src/models/Migration.js')).default;
      await Migration.updateOne({ name }, { $setOnInsert: { name, version } }, { upsert: true });
    },
  });
}
