#!/usr/bin/env node
/**
 * K4 — Migration CLI: bekleyen migration'ları sırayla, idempotent uygular.
 *
 * Kullanım:
 *   node scripts/migrate.js                 → tüm bekleyenler
 *   node scripts/migrate.js --to 0.3.0      → hedef sürüme kadar
 *
 * Kurulum sonrası ilk koşu K2 sihirbazı tarafından tetiklenebilir ya da
 * operatör bir kez çalıştırır; tekrar çalıştırmak güvenlidir (idempotent).
 */
import 'dotenv/config';
import { connectDB } from '../src/db.js';
import mongoose from 'mongoose';
import { discoverMigrations } from '../migrations/index.js';
import { createMigrationRunner } from '../migrations/runner.js';

const toIndex = process.argv.indexOf('--to');
const targetVersion = toIndex !== -1 ? process.argv[toIndex + 1] : undefined;

try {
  await connectDB();
  const migrations = await discoverMigrations();
  const Migration = (await import('../src/models/Migration.js')).default;

  const runner = createMigrationRunner({
    migrations,
    getApplied: async () => (await Migration.find().select('name').lean()).map(r => r.name),
    markApplied: async ({ name, version }) => {
      await Migration.updateOne({ name }, { $setOnInsert: { name, version } }, { upsert: true });
    },
  });

  const result = await runner.applyAll({ targetVersion });
  for (const m of result.applied) console.log(`✔ ${m.name} (${m.version}) uygulandı`);
  console.log(`Özet: ${result.applied.length} uygulandı, ${result.skipped} zaten uygundu`);
  await mongoose.disconnect();
  process.exit(0);
} catch (e) {
  console.error('✗ Migration hatası:', e.message);
  // Bağlantıyı kapatmadan çıkmak askıda kalan işlemleri bırakır — temiz çık.
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
}
