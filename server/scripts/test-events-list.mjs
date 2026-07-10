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
  eventsCtrl._clearListCacheForTests();
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

await test('cache: aynı sport+status kombinasyonu 5sn içinde ikinci çağrıda DB\'ye gitmez', async () => {
  await Event.create(makeEvent({ startTime: new Date(Date.now() + 24 * 60 * 60 * 1000) }));

  const { req: req1, res: res1, next: next1, getResult: getResult1 } = fakeReqRes({});
  await eventsCtrl.list(req1, res1, next1);
  const first = getResult1();

  // Cache aktifken DB'ye ikinci bir event eklenir; cache çalışıyorsa ikinci
  // istek hâlâ İLK sonucu (yeni event'i İÇERMEYEN) döndürmeli.
  await Event.create(makeEvent({ startTime: new Date(Date.now() + 24 * 60 * 60 * 1000) }));

  const { req: req2, res: res2, next: next2, getResult: getResult2 } = fakeReqRes({});
  await eventsCtrl.list(req2, res2, next2);
  const second = getResult2();

  assert(second.events.length === first.events.length, `cache aktifken ikinci istek İLK sonucu (${first.events.length} event) döndürmeliydi, ${second.events.length} event bulundu`);
});

await resetDb();

await test('cache: farklı sport/status kombinasyonları ayrı cache girdileri kullanır', async () => {
  await Event.create(makeEvent({ sport: 'football', startTime: new Date(Date.now() + 24 * 60 * 60 * 1000) }));
  await Event.create(makeEvent({ sport: 'basketball', startTime: new Date(Date.now() + 24 * 60 * 60 * 1000) }));

  const { req: reqF, res: resF, next: nextF, getResult: getResultF } = fakeReqRes({ sport: 'football' });
  await eventsCtrl.list(reqF, resF, nextF);
  const football = getResultF();

  const { req: reqB, res: resB, next: nextB, getResult: getResultB } = fakeReqRes({ sport: 'basketball' });
  await eventsCtrl.list(reqB, resB, nextB);
  const basketball = getResultB();

  assert(football.events.every(e => e.sport === 'football'), 'football isteği sadece football event döndürmeliydi');
  assert(basketball.events.every(e => e.sport === 'basketball'), 'basketball isteği sadece basketball event döndürmeliydi');
});

await resetDb();

await test('cache: 5sn TTL sonrası yeniden DB\'ye gider', async () => {
  await Event.create(makeEvent({ startTime: new Date(Date.now() + 24 * 60 * 60 * 1000) }));

  const { req: req1, res: res1, next: next1, getResult: getResult1 } = fakeReqRes({});
  await eventsCtrl.list(req1, res1, next1);
  const first = getResult1();

  await Event.create(makeEvent({ startTime: new Date(Date.now() + 24 * 60 * 60 * 1000) }));

  await new Promise(r => setTimeout(r, 5200)); // TTL'nin (5sn) geçmesini bekle

  const { req: req2, res: res2, next: next2, getResult: getResult2 } = fakeReqRes({});
  await eventsCtrl.list(req2, res2, next2);
  const second = getResult2();

  assert(second.events.length === first.events.length + 1, `TTL sonrası yeni event görünür olmalıydı: ${first.events.length + 1} bekleniyordu, ${second.events.length} bulundu`);
});

await resetDb();
await mongoose.disconnect();

console.log(`\n${passed} geçti, ${failed} kaldı`);
if (failed > 0) process.exit(1);
