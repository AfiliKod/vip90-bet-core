import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import mongoose from 'mongoose';

const TEST_DB_URI = 'mongodb://localhost:27017/betzone_test_events_list';

console.log('🔥 Events Liste — Gelecek Penceresi + Cache Testleri\n');
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

await mongoose.connect(TEST_DB_URI);
const Event = (await import('../src/models/Event.js')).default;
const eventsCtrl = await import('../src/controllers/events.js');

function fakeReqRes(query) {
  const req = { query };
  let jsonResult = null;
  const res = { json: (obj) => { jsonResult = obj; } };
  const next = (err) => { if (err) throw err; };
  return { req, res, next, getResult: () => jsonResult };
}

async function resetDb() {
  await Event.deleteMany({ league: /^Test Lig/ });
}

function makeEvent(overrides = {}) {
  return {
    sport: 'football',
    country: 'Test',
    league: 'Test Lig',
    homeTeam: { name: 'Ev Sahibi', country: 'Test' },
    awayTeam: { name: 'Deplasman', country: 'Test' },
    status: 'upcoming',
    markets: [{ type: 'maç_sonucu', label: 'Maç Sonucu', odds: [] }],
    ...overrides,
  };
}

await resetDb();

await test('varsayılan istek: 14 günden uzak upcoming event listede DÖNMEZ', async () => {
  const near = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const far = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
  await Event.create(makeEvent({ startTime: near }));
  await Event.create(makeEvent({ startTime: far }));

  const { req, res, next, getResult } = fakeReqRes({});
  await eventsCtrl.list(req, res, next);
  const { events } = getResult();

  assert(events.some(e => new Date(e.startTime).getTime() === near.getTime()), '14 gün içindeki event dönmeliydi');
  assert(!events.some(e => new Date(e.startTime).getTime() === far.getTime()), '14 günden uzak event DÖNMEMELİYDİ');
});

await resetDb();

await test('status=upcoming açık istek: 14 günden uzak event DÖNMEZ (önceden hiç sınır yoktu)', async () => {
  const near = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const far = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
  await Event.create(makeEvent({ startTime: near }));
  await Event.create(makeEvent({ startTime: far }));

  const { req, res, next, getResult } = fakeReqRes({ status: 'upcoming' });
  await eventsCtrl.list(req, res, next);
  const { events } = getResult();

  assert(events.some(e => new Date(e.startTime).getTime() === near.getTime()), '14 gün içindeki event dönmeliydi');
  assert(!events.some(e => new Date(e.startTime).getTime() === far.getTime()), '14 günden uzak event DÖNMEMELİYDİ');
});

await resetDb();

await test('full=1 istekte gelecek penceresi sınırı uygulanmaz (admin muaf)', async () => {
  const far = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
  await Event.create(makeEvent({ startTime: far }));

  const { req, res, next, getResult } = fakeReqRes({ status: 'upcoming', full: '1' });
  await eventsCtrl.list(req, res, next);
  const { events } = getResult();

  assert(events.some(e => new Date(e.startTime).getTime() === far.getTime()), 'full=1 ile 14 günden uzak event de dönmeliydi');
});

await resetDb();

await test('canlı event gelecek penceresi sınırından etkilenmez', async () => {
  const live = await Event.create(makeEvent({ status: 'live', startTime: new Date(Date.now() - 60 * 60 * 1000) }));

  const { req, res, next, getResult } = fakeReqRes({});
  await eventsCtrl.list(req, res, next);
  const { events } = getResult();

  assert(events.some(e => String(e._id) === String(live._id)), 'canlı event her zaman dönmeliydi');
});

await resetDb();
await mongoose.disconnect();

console.log(`\n${passed} geçti, ${failed} kaldı`);
if (failed > 0) process.exit(1);
