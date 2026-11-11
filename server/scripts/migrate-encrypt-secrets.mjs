#!/usr/bin/env node
/**
 * Düz metin saklanan sırları `enc:v1:` AES-256-GCM biçimine taşır (V1).
 *
 *   node server/scripts/migrate-encrypt-secrets.mjs            # dry-run (varsayılan)
 *   node server/scripts/migrate-encrypt-secrets.mjs --commit   # yazar
 *
 * Kapsam: User.twoFactorSecret, User.twoFactorBackupCodes (legacy düz dizi →
 * tek şifreli JSON string). Zaten `enc:v1:` olanlara dokunulmaz, yani script
 * tekrar çalıştırılabilir. OPERATOR_SECRET_ENCRYPTION_KEY gerekir; yoksa
 * dönüştürülecek kayıt varken throw eder (fail-closed). Ayrıca KYC `Setting`
 * sırları (SUMSUB_APP_TOKEN/SECRET_KEY/WEBHOOK_SECRET; V12), `settings` sayısı döner.
 */
import './lib/env.mjs';
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import User from '../src/models/User.js';
import Setting from '../src/models/Setting.js';
import { KYC_SECRET_SETTING_KEYS } from '../src/config/kyc.js';
import { encryptSensitive, isEncryptedSecret } from '../src/utils/secretCrypto.js';
import { writeBackupCodes } from '../src/services/twoFactorAuth.js';

export async function migrateEncryptSecrets({ dryRun = true, logger = console } = {}) {
  const users = await User.find({
    $or: [{ twoFactorSecret: { $nin: [null, ''] } }, { twoFactorBackupCodes: { $nin: [null, ''] } }],
  }).select('+twoFactorSecret +twoFactorBackupCodes').lean();

  let changed = 0;
  for (const u of users) {
    const $set = {};
    if (u.twoFactorSecret && !isEncryptedSecret(u.twoFactorSecret)) {
      $set.twoFactorSecret = dryRun ? null : encryptSensitive(u.twoFactorSecret);
    }
    const codes = u.twoFactorBackupCodes;
    if (Array.isArray(codes) && codes.length > 0) {
      $set.twoFactorBackupCodes = dryRun ? null : writeBackupCodes(codes);
    } else if (typeof codes === 'string' && codes && !isEncryptedSecret(codes)) {
      let arr = null;
      try { arr = JSON.parse(codes); } catch { /* bozuk değer: dokunma */ }
      if (Array.isArray(arr)) $set.twoFactorBackupCodes = dryRun ? null : writeBackupCodes(arr);
    }
    if (!Object.keys($set).length) continue;
    changed += 1;
    logger.log(`[migrate-encrypt-secrets] ${dryRun ? 'dry-run' : 'commit'} user=${u._id} alanlar=${Object.keys($set).join(',')}`);
    if (!dryRun) await User.collection.updateOne({ _id: u._id }, { $set });
  }
  // KYC sağlayıcı sırları (Setting): düz metin → enc:v1:
  const rows = await Setting.find({ key: { $in: KYC_SECRET_SETTING_KEYS } }).lean();
  let settingsChanged = 0;
  for (const row of rows) {
    if (!row.value || isEncryptedSecret(row.value)) continue;
    settingsChanged += 1;
    logger.log(`[migrate-encrypt-secrets] ${dryRun ? 'dry-run' : 'commit'} setting=${row.key}`);
    if (!dryRun) await Setting.collection.updateOne({ _id: row._id }, { $set: { value: encryptSensitive(String(row.value)) } });
  }
  logger.log(`[migrate-encrypt-secrets] ${dryRun ? 'dry-run: yazılmadı' : 'yazıldı'}: users=${changed} settings=${settingsChanged}`);
  return { users: changed, settings: settingsChanged };
}

async function main() {
  const commit = process.argv.includes('--commit');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    await migrateEncryptSecrets({ dryRun: !commit });
  } finally {
    await mongoose.disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
