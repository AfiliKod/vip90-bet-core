// Eski KYC yüklemelerini (uploads/kyc) KYC_UPLOAD_DIR'e taşır ve KycDocument.storageKey'i doldurur.
// Kullanım: node scripts/migrate-kyc-uploads.mjs [--commit] [--from <dir>]...   (varsayılan: dry-run)
// server/.env yüklenir (MONGODB_URI, KYC_UPLOAD_DIR); sunucuyla AYNI env ile ve servisin WorkingDirectory'sinden çalıştırın.
// İdempotent. Kaynak dosya, hedefteki kopya doğrulanmadan silinmez. Kaynaklar:
// <SERVER_ROOT>/uploads/kyc ve <cwd>/uploads/kyc (eski upload.js cwd-göreli yazıyordu).
import { copyFile, mkdir, readdir, readFile, realpath, stat, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { config as loadEnv } from 'dotenv';
import { SERVER_ROOT, kycUploadDir, legacyKycDirs } from '../src/config/paths.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function sameContent(a, b) {
  const [sa, sb] = await Promise.all([stat(a), stat(b)]);
  if (sa.size !== sb.size) return false;
  const [ba, bb] = await Promise.all([readFile(a), readFile(b)]);
  return ba.equals(bb);
}

export async function migrateKycUploads({
  dryRun = true,
  logger = console,
  sourceDirs = legacyKycDirs(),
  targetDir,
} = {}) {
  const target = resolve(targetDir || kycUploadDir());
  let moved = 0; let updated = 0; let skipped = 0;

  if (!dryRun) await mkdir(target, { recursive: true });

  // Sembolik bağ / farklı yol ile hedefe çözülen kaynak dizin atlanır (tek kopyayı silmemek için).
  const realTarget = await realpath(target).catch(() => target);
  const sources = [];
  const seen = new Set();
  for (const d of sourceDirs.map(x => resolve(x))) {
    const real = await realpath(d).catch(() => d);
    if (real === realTarget) { logger.warn?.(`[kyc-migrate] kaynak hedefin kendisi, atlandı: ${d}`); continue; }
    if (seen.has(real)) continue;
    seen.add(real);
    sources.push(d);
  }

  for (const dir of sources) {
    let names;
    try { names = await readdir(dir); } catch { continue; }
    for (const name of names) {
      if (name.startsWith('.')) continue;
      const src = join(dir, name);
      const dst = join(target, name);
      try {
        if (!(await stat(src)).isFile()) continue;
        let dstStat = null;
        try { dstStat = await stat(dst); } catch { /* yok */ }
        if (dstStat) {
          const srcStat = await stat(src);
          if (srcStat.dev === dstStat.dev && srcStat.ino === dstStat.ino) {
            // Aynı dosya (hard link / sembolik bağ): asla silinmez.
            logger.warn?.(`[kyc-migrate] kaynak hedefle aynı dosya, silinmedi: ${name} (${dir})`);
          } else if (await sameContent(src, dst)) {
            // Hedefte doğrulanmış kopya var; kaynak artığı temizlenir.
            if (!dryRun) await unlink(src);
          } else {
            logger.warn?.(`[kyc-migrate] çakışma, atlandı: ${name} (${dir})`);
          }
          skipped++;
          continue;
        }
        if (dryRun) { moved++; continue; }
        await copyFile(src, dst);
        if (!(await sameContent(src, dst))) throw new Error('kopya doğrulanamadı');
        await unlink(src);
        moved++;
      } catch (e) {
        logger.error?.(`[kyc-migrate] ${name}: ${e.message}`);
        skipped++;
      }
    }
  }

  const { default: KycDocument } = await import('../src/models/KycDocument.js');
  const docs = await KycDocument.find({
    $or: [{ storageKey: null }, { storageKey: { $exists: false } }],
    fileUrl: /^\/uploads\/kyc\//,
  }).select('fileUrl').lean();
  for (const d of docs) {
    const storageKey = basename(d.fileUrl);
    if (!storageKey) continue;
    if (!dryRun) await KycDocument.updateOne({ _id: d._id, storageKey: null }, { $set: { storageKey } });
    updated++;
  }

  logger.log?.(`[kyc-migrate] ${dryRun ? 'dry-run' : 'commit'}: moved=${moved} updated=${updated} skipped=${skipped}`);
  return { moved, updated, skipped };
}

export function parseArgs(argv) {
  const from = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new Error('--from bir dizin gerektirir');
      from.push(resolve(v));
    }
  }
  return { dryRun: !argv.includes('--commit'), from };
}

export async function main({ argv = process.argv.slice(2), envPath = join(__dirname, '..', '.env') } = {}) {
  const { dryRun, from } = parseArgs(argv);
  loadEnv({ path: envPath });
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI tanımlı değil (server/.env ya da ortam); varsayılan veritabanına bağlanılmaz');
  await mongoose.connect(uri);
  try { await migrateKycUploads({ dryRun, sourceDirs: [...legacyKycDirs(), ...from] }); } finally { await mongoose.disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message || e); process.exit(1); });
}
