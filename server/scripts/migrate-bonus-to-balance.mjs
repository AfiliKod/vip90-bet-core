// Mevcut bonusBalance > 0 kullanıcılarını Model B'ye (Kilitli Bakiye) taşır.
// Eski modelde bonus miktarı yalnızca user.bonusBalance'a eklenmişti,
// user.balance'a hiç eklenmemişti. Bu script farkı balance'a ekler.
//
// GÜVENLİK: varsayılan --dry-run. Gerçek yazım için --commit gerekir.
// Bu script TEK SEFERLİK, deploy hemen sonrası (Task 2/3'teki claim/admin
// bonus akışları Model B'ye geçtikten hemen sonra, herhangi bir yeni bonus
// verilmeden önce) çalıştırılmalıdır. _processedUserIds Set'i yalnızca AYNI
// process çalıştırması içinde çift-işlemeyi engeller (test idempotency'si
// için); process yeniden başlatılırsa script tekrar TÜM adayları bulur —
// bu yüzden operasyonel olarak yalnızca BİR KEZ, --commit ile çalıştırılmalıdır.
//
// Çalıştır:
//   node migrate-bonus-to-balance.mjs --dry-run   (varsayılan, sadece raporlar)
//   node migrate-bonus-to-balance.mjs --commit     (gerçekten yazar, TEK SEFER)

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import mongoose from 'mongoose';
import User from '../src/models/User.js';
import { getLockedAmount } from '../src/services/wagering.js';

const _processedUserIds = new Set();

export async function migrateBonusToBalance({ dryRun = true } = {}) {
  const candidates = await User.find({ bonusBalance: { $gt: 0 } });

  let migratedCount = 0;
  let totalMoved = 0;
  const skipped = [];

  for (const user of candidates) {
    const locked = await getLockedAmount(user._id);

    if (locked <= 0) {
      skipped.push({ userId: user._id.toString(), reason: 'no_active_wagering' });
      continue;
    }

    if (dryRun) {
      migratedCount++;
      totalMoved += user.bonusBalance;
      continue;
    }

    if (_processedUserIds.has(user._id.toString())) {
      skipped.push({ userId: user._id.toString(), reason: 'already_processed_this_run' });
      continue;
    }

    const amountToMove = user.bonusBalance;
    user.balance = parseFloat((user.balance + amountToMove).toFixed(2));
    user.bonusBalance = locked;
    await user.save();
    _processedUserIds.add(user._id.toString());

    migratedCount++;
    totalMoved += amountToMove;
  }

  return { migratedCount, totalMoved: parseFloat(totalMoved.toFixed(2)), skipped };
}

// Doğrudan çalıştırılırsa bağlan ve çalıştır; import edildiğinde (test) ÇALIŞMAZ.
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--commit');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(dryRun ? '🔍 DRY-RUN modu (hiçbir şey yazılmayacak)' : '✍️  COMMIT modu (production\'a yazılacak)');
  const result = await migrateBonusToBalance({ dryRun });
  console.log(`\nEtkilenen kullanıcı: ${result.migratedCount}`);
  console.log(`Toplam taşınan tutar: ₺${result.totalMoved}`);
  console.log(`Atlanan: ${result.skipped.length}`);
  if (dryRun) {
    console.log('\n--commit flag\'i ile gerçekten çalıştırın: node migrate-bonus-to-balance.mjs --commit');
  }
  await mongoose.disconnect();
}
