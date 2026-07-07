// server/scripts/add-deneme-bonusu-promotion.mjs
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import mongoose from 'mongoose';
import Promotion from '../src/models/Promotion.js';

export async function addDenemeBonusuPromotion() {
  const existing = await Promotion.findOne({ title: 'Deneme Bonusu' });
  if (existing) {
    console.log('Deneme Bonusu zaten mevcut, atlanıyor:', existing._id.toString());
    return existing;
  }
  const promo = await Promotion.create({
    type: 'trial',
    title: 'Deneme Bonusu',
    description: 'Deneme bonusu ile bahis yapmayı hemen dene!',
    amount: 100,
    minOdds: 1.8,
    wagering: 3,
    wageringMultiplier: 35,
    deadlineDays: 30,
    isActive: true,
  });
  console.log('Deneme Bonusu oluşturuldu:', promo._id.toString());
  return promo;
}

// Doğrudan `node add-deneme-bonusu-promotion.mjs` ile çalıştırılırsa bağlan ve çalıştır.
// import edildiğinde (test script'i tarafından) bu blok ÇALIŞMAZ.
if (import.meta.url === `file://${process.argv[1]}`) {
  await mongoose.connect(process.env.MONGODB_URI);
  await addDenemeBonusuPromotion();
  await mongoose.disconnect();
}
