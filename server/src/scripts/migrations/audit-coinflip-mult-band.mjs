/**
 * Coin Flip çarpan tavanı (2.0 → 1.96, Burak onayı 2026-10-22 madde 7) —
 * SADECE-OKUMA band denetimi. Bu script HİÇBİR şeyi değiştirmez.
 *
 * Neden gerekir: tavan hem şemada (models/GameSettings.js max) hem
 * validateOperatorUpdate'ta (multField 1.8–1.96) yazım tarafını kilitler,
 * ama DISKİ kontrol etmez. Mongoose validasyonu yalnız save()'de koşar;
 * 1.96 ÜSTÜNDE yazılmış mevcut bir doküman okumada olduğu gibi hydrate
 * olur ve `instantGameEngine.js` coinflip yolunda ÖDEME çarpanı olarak
 * kullanılmaya devam eder. Yani tavanı indirmek tek başına eski band-dışı
 * yazımları susturmaz — önce SAYILMALI.
 *
 * Beklenen taban çizgisi (GMD/RM ölçümü): bugün yalnız default 1.96 yazılı;
 * band-dışı kayıt SAYILMADI. ÇIKIŞ KODU:
 *   0 → bant temiz (deploy devam edebilir)
 *   1 → en az bir band-dışı kayıt VAR — deploy DURUR; onarım (clamp ya da
 *       operatör onayı) CM + Game Math kararıdır, bu script'in işi değil.
 *   2 → bağlanma/çalışma hatası.
 *
 * Kullanım: node src/scripts/migrations/audit-coinflip-mult-band.mjs
 * (server/ dizininden çalıştırılmalı — .env oradan okunur)
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../../db.js';
import GameSettings from '../../models/GameSettings.js';

const MULT_MIN = 1.8;
const MULT_MAX = 1.96; // tavan = default — Burak onayı 2026-10-22

async function main() {
  await connectDB();

  const outOfBand = await GameSettings.find({
    gameId: 'inhouse-coinflip',
    coinflipPayoutMult: { $exists: true, $not: { $gte: MULT_MIN, $lte: MULT_MAX } },
  }).select('operatorId gameId coinflipPayoutMult isActive').lean();

  const total = await GameSettings.countDocuments({ gameId: 'inhouse-coinflip' });

  if (outOfBand.length === 0) {
    console.log(`[audit] TEMİZ — ${total} coinflip GameSettings dokümanının hiçbiri ${MULT_MIN}–${MULT_MAX} bandı dışında değil; deploy devam edebilir.`);
    await mongoose.disconnect();
    process.exit(0);
  }

  console.error(`[audit] BAND-DIŞI KAYIT VAR — ${outOfBand.length}/${total} coinflip dokümanı ${MULT_MIN}–${MULT_MAX} bandı dışında. DEPLOY DURUR.`);
  for (const doc of outOfBand) {
    console.error(`[audit]   operatorId=${doc.operatorId ?? '(null — legacy tekil)'} mult=${doc.coinflipPayoutMult} isActive=${doc.isActive}`);
  }
  console.error('[audit] Onarım kararı CM + Game Math: clamp mı, operatör bildirimi mi — bu script yazmaz.');
  await mongoose.disconnect();
  process.exit(1);
}

main().catch((e) => {
  console.error('[audit] Hata:', e);
  process.exit(2);
});
