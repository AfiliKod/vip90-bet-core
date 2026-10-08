#!/usr/bin/env node
/**
 * Ledger çift yazım kopyalarını raporlar / temizler.
 *
 * Yalnız ELLE çalıştırılır; hiçbir deploy/açılış adımı bunu çağırmaz. Varsayılan
 * kuru çalıştırmadır (veri yazmaz), --commit verilmeden hiçbir şey silinmez.
 * Yalnız GEÇMİŞ ham kopyaları hedefler (idempotencyKey'siz satır + aynı alanlı
 * anahtarlı eşi); tekil anahtarlı kayıtlara dokunmaz. Ayrıntı:
 * src/services/ledgerDedupe.js.
 *
 *   node scripts/ledger-dedupe.mjs            → yalnızca rapor (varsayılan)
 *   node scripts/ledger-dedupe.mjs --commit   → arşivleyip kaldırır
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import { dedupeDoubleWrites, ARCHIVE_COLLECTION } from '../src/services/ledgerDedupe.js';

const commit = process.argv.includes('--commit');
try {
  await connectDB();
  const r = await dedupeDoubleWrites({ dryRun: !commit, log: (m) => console.log(m) });
  for (const p of r.pairs) {
    console.log(`${p.type.padEnd(20)} ${String(p.amount).padStart(10)}  kaldırılacak=${p.removeId} (${p.removeStatus})  korunacak=${p.keepId} (${p.keepStatus})  ${p.reason}`);
  }
  console.log(`\n${r.found} kopya bulundu${commit ? `, ${r.removed} kaldırıldı (yedek: ${ARCHIVE_COLLECTION})` : ' — değişiklik yapılmadı, uygulamak için --commit'}`, r.byType);
  await mongoose.disconnect();
  process.exit(0);
} catch (e) {
  console.error('✗', e.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
}
