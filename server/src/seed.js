import 'dotenv/config';
import mongoose from 'mongoose';
import User from './models/User.js';
import GameTask from './models/GameTask.js';
import Event from './models/Event.js';
import Bet from './models/Bet.js';
import CasinoRound from './models/CasinoRound.js';
import { createDemoSeeder } from './demo/seedCore.js';

await mongoose.connect(process.env.MONGODB_URI);

// Kullanıcılar
await User.deleteMany({});
await User.create({
  username: 'admin',
  email: 'admin@vip90.bet',
  password: 'Admin1234!',
  role: 'admin',
  balance: 0,
});
console.log('✅ Admin kullanıcısı oluşturuldu (admin / Admin1234!)');

// Lokalde tespit edilmiş sorunlu BGaming oyunları
const BROKEN_GAMES = [
  { gameId: 'bgaming_bonanza-billion-xmas',           gameTitle: 'Bonanza Billion X-mas' },
  { gameId: 'bgaming_royal-easter',                   gameTitle: 'Royal Easter' },
  { gameId: 'bgaming_royal-beellion-hold-win',        gameTitle: 'Royal Beellion Hold & Win' },
  { gameId: 'bgaming_sweet-samurai',                  gameTitle: 'Sweet Samurai' },
  { gameId: 'bgaming_dusty-duel',                     gameTitle: 'Dusty Duel' },
  { gameId: 'bgaming_ultras',                         gameTitle: 'Ultras' },
  { gameId: 'bgaming_chicken-shot',                   gameTitle: 'Chicken Shot' },
  { gameId: 'bgaming_magic-mummy-megaways',           gameTitle: 'Magic Mummy MEGAWAYS™' },
  { gameId: 'bgaming_golden-avalon-hold-and-win',     gameTitle: 'Golden Avalon Hold and Win' },
  { gameId: 'bgaming_wild-cash-x9990',                gameTitle: 'Wild Cash x9990' },
  { gameId: 'bgaming_rocket-eruption-triple-blast',   gameTitle: 'Rocket Eruption: Triple Blast' },
  { gameId: 'bgaming_clash-of-gods-anubis-vs-hades',  gameTitle: 'Clash of Gods: Anubis vs Hades' },
  { gameId: 'bgaming_penalty-duel-with-julio-cesar',  gameTitle: 'Penalty Duel with Júlio César' },
  { gameId: 'bgaming_penalty-duel-with-julio-cesar-2',gameTitle: 'Penalty Duel with Júlio César 2' },
  { gameId: 'bgaming_money-maker-2',                  gameTitle: 'Money Maker 2' },
  { gameId: 'bgaming_hot-rocket-5x-3x-2x',            gameTitle: 'HOT ROCKET 5x 3x 2x' },
  { gameId: 'bgaming_money-maker-3',                  gameTitle: 'Money Maker 3' },
  { gameId: 'bgaming_kicker-mania',                   gameTitle: 'Kicker Mania' },
];

await GameTask.deleteMany({ type: 'broken_game' });
await GameTask.insertMany(
  BROKEN_GAMES.map(g => ({ ...g, provider: 'BGaming', status: 'pending' }))
);
console.log(`✅ ${BROKEN_GAMES.length} sorunlu BGaming oyunu GameTask'a eklendi`);

// ─── V1 — Demo ortamı verisi (idempotent) ─────────────────────────
// Sınırlı yetkili demo yöneticisi, örnek oyuncular, bahis ve casino
// round geçmişleri. Tümü açıkça sahte: demo_ öneki, @demo.local, DEMOLIG.
const demo = await createDemoSeeder({
  userModel: User,
  eventModel: Event,
  betModel: Bet,
  casinoRoundModel: CasinoRound,
}).seed();
for (const c of demo.created) console.log(`✅ demo oluşturuldu: ${c}`);
for (const s of demo.skipped) console.log(`• demo zaten mevcut: ${s}`);

await mongoose.disconnect();
