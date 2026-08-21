#!/usr/bin/env node
/**
 * K3 — İlk çalıştırma tohumlaması CLI.
 *
 * Kullanım:
 *   node scripts/seed.js                          → varsayılan site ayarları
 *   node scripts/seed.js --admin                  → admin bilgileri env'den
 *       (ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD)
 *
 * Idempotent — tekrar çalıştırmak güvenlidir. Varsayılan parolayla kullanıcı
 * AÇILMAZ; --admin verilmemişse yalnızca site ayarları tohumlanır.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { seedFirstRun } from '../src/health/seed.js';
import User from '../src/models/User.js';
import Setting from '../src/models/Setting.js';

const wantsAdmin = process.argv.includes('--admin');

try {
  await connectAndSeed();
  await mongoose.disconnect();
  process.exit(0);
} catch (e) {
  console.error('✗ Tohumlama hatası:', e.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
}

async function connectAndSeed() {
  await mongoose.connect(process.env.MONGODB_URI);

  const admin = wantsAdmin
    ? {
        username: process.env.ADMIN_USERNAME,
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
      }
    : undefined;

  const r = await seedFirstRun({ settingModel: Setting, userModel: User, admin });
  for (const k of r.seeded) console.log(`✔ tohumlandı: ${k}`);
  for (const k of r.skipped) console.log(`• atlandı (zaten mevcut): ${k}`);
}
