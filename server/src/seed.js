import 'dotenv/config';
import mongoose from 'mongoose';
import User from './models/User.js';
import Event from './models/Event.js';
import Promotion from './models/Promotion.js';
import { scrapedEvents } from './data/oddsSource-events.js';

await mongoose.connect(process.env.MONGODB_URI);
await Promise.all([User.deleteMany({}), Event.deleteMany({}), Promotion.deleteMany({})]);

await User.create([
  { username: 'admin', email: 'admin@betzone.com', password: 'Admin1234!', role: 'admin', balance: 0 },
  { username: 'ahmet', email: 'ahmet@test.com', password: 'Ahmet1234!', balance: 2500 },
  { username: 'fatma', email: 'fatma@test.com', password: 'Fatma1234!', balance: 1200 },
]);


await Promotion.create([
  {
    type: 'welcome',
    title: 'Hoş Geldin Bonusu',
    description: 'İlk para yatırmanıza %100 bonus, 500₺ ye kadar!',
    amount: 500,
    minOdds: 1.5,
    wagering: 5,
    isActive: true
  },
  {
    type: 'freeBet',
    title: 'Bedava Bahis',
    description: 'Bu hafta 100₺ bedava bahis hakkı kazanın!',
    amount: 100,
    minOdds: 1.8,
    wagering: 3,
    isActive: true
  }
]);

// oddsSource önce dene, yoksa rakipsite
let events = scrapedEvents?.length ? scrapedEvents : [];
let src = 'oddsSource';

if (!events.length) {
  try {
    const { rakipsiteEvents } = await import('./data/rakipsite-events.js');
    if (rakipsiteEvents?.length) {
      events = rakipsiteEvents;
      src = 'rakipsite';
      console.log(`⚡ oddsSource boş — ${events.length} rakipsite etkinliği kullanılıyor`);
    }
  } catch {
    // rakipsite-events.js henüz oluşturulmamış
  }
}

if (events.length) {
  await Event.insertMany(events);
  console.log(`✅ ${events.length} gerçek maç eklendi (${src})`);
} else {
  console.warn('⚠️  Veri yok — önce çalıştır: node server/scripts/scrape-oddsSource.mjs veya node server/scripts/scrape-rakipsite.mjs');
}

console.log('Seed tamamlandı');
await mongoose.disconnect();
