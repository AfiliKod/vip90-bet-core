// server/src/services/demoData/sportsSeed.js
import Event from '../../models/Event.js';
import Bet from '../../models/Bet.js';
import { getSeedUserPool, load as loadUsers } from './userSeed.js';
import { randomFloat, pick, randomPastDate } from './randomUtils.js';

const DEMO_LEAGUE = 'SEEDLIG';
const TEAMS = ['Seed United', 'Seed City', 'Seed Athletic', 'Seed Rovers', 'Seed Wanderers', 'Seed Town'];

async function ensureDemoEvents() {
  const existing = await Event.find({ isSeed: true });
  if (existing.length >= 5) return existing;
  const toCreate = [];
  for (let i = existing.length; i < 5; i++) {
    const home = TEAMS[i % TEAMS.length];
    const away = TEAMS[(i + 1) % TEAMS.length];
    toCreate.push({
      externalId: `seed-event-${i + 1}`,
      // spor kodu gerçek veriyle aynı küçük harf — 'Football' kenar çubuğunda ikinci bir spor gibi görünüyordu
      sport: 'football', league: DEMO_LEAGUE, country: 'Seed',
      homeTeam: { name: home, country: 'Seed' },
      awayTeam: { name: away, country: 'Seed' },
      startTime: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000),
      status: 'upcoming', isSeed: true,
      markets: [{
        type: 'maç_sonucu', label: 'Maç Sonucu',
        odds: [
          { id: `seed_ms1_${i}`, label: '1', value: randomFloat(1.5, 3.5) },
          { id: `seed_msx_${i}`, label: 'X', value: randomFloat(2.8, 3.8) },
          { id: `seed_ms2_${i}`, label: '2', value: randomFloat(1.5, 3.5) },
        ],
      }],
    });
  }
  if (toCreate.length) await Event.insertMany(toCreate);
  return Event.find({ isSeed: true });
}

async function ensureUserPool() {
  let pool = await getSeedUserPool(500);
  if (!pool.length) {
    await loadUsers(20);
    pool = await getSeedUserPool(500);
  }
  return pool;
}

export async function status() {
  return { count: await Bet.countDocuments({ isSeed: true }) };
}

export async function load(count) {
  const events = await ensureDemoEvents();
  const pool = await ensureUserPool();

  const docs = [];
  for (let i = 0; i < count; i++) {
    const user = pick(pool);
    const event = pick(events);
    const market = event.markets[0];
    const odd = pick(market.odds);
    const stake = randomFloat(20, 500);
    // Sonuç seçilene bağlı: p(win) = (1/odd)·0.94 → ~%6 marj,
    // E[ggr] = stake·(1−0.94) = +0.06·stake (her odd için pozitif house edge).
    // Eski sabit %40 kazanma (E[odd]≈2.77) −%10.7 EV üretip GGR'yi negatife çeviriyordu.
    const winProb = (1 / odd.value) * 0.94;
    const outcome = Math.random() < winProb ? 'won' : 'lost';
    const createdAt = randomPastDate(90);
    docs.push({
      userId: user._id,
      selections: [{
        eventId: event._id, marketType: market.type, oddId: odd.id, oddLabel: odd.label,
        oddValue: odd.value, eventLabel: `${event.homeTeam.name} - ${event.awayTeam.name}`, outcome,
      }],
      type: 'single', stake, totalOdds: odd.value, potentialWin: parseFloat((stake * odd.value).toFixed(2)),
      status: outcome, settledAt: createdAt,
      isSeed: true, createdAt, updatedAt: createdAt,
    });
  }
  if (docs.length) await Bet.insertMany(docs);
  return { created: docs.length };
}

export async function clear() {
  const betResult = await Bet.deleteMany({ isSeed: true });
  const eventResult = await Event.deleteMany({ isSeed: true });
  return { deleted: betResult.deletedCount, eventsDeleted: eventResult.deletedCount };
}

export async function liveTick() {
  const pool = await getSeedUserPool(500);
  if (!pool.length) return null;
  const events = await Event.find({ isSeed: true });
  if (!events.length) return null;

  const user = pick(pool);
  const event = pick(events);
  const market = event.markets[0];
  const odd = pick(market.odds);
  const stake = randomFloat(20, 300);

  const bet = new Bet({
    userId: user._id,
    selections: [{
      eventId: event._id, marketType: market.type, oddId: odd.id, oddLabel: odd.label,
      oddValue: odd.value, eventLabel: `${event.homeTeam.name} - ${event.awayTeam.name}`, outcome: 'pending',
    }],
    type: 'single', stake, totalOdds: odd.value, potentialWin: parseFloat((stake * odd.value).toFixed(2)),
    status: 'pending', isSeed: true,
  });
  await bet.save();

  const winProb = (1 / odd.value) * 0.94;
  const outcome = Math.random() < winProb ? 'won' : 'lost';
  bet.status = outcome;
  bet.selections[0].outcome = outcome;
  bet.settledAt = new Date();
  await bet.save();

  return { betId: bet._id, outcome };
}
