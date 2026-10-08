// Demo-data planı (docs/superpowers/plans/2026-09-23-admin-demo-data-seed.md)
// Task 14 Step 3 — manuel tarayıcı kontrol listesinin Playwright ile yürütülmesi.
//
// UYARI: Bu betik demo verisini YÜKLER ve "Tümünü Temizle" ile SİLER, ayrıca
// izolasyon kontrolü için `real_player_audit` adlı bir kullanıcı açar. YALNIZCA
// yerel/test veritabanında çalıştırın — MONGODB_URI localhost değilse çalışmaz.
//
// Önkoşul: server (:3001) ve client dev server (:5173) çalışıyor, e-postası
// doğrulanmış bir admin var. Kullanım (repo kökünden):
//   MONGODB_URI=mongodb://127.0.0.1:27017/<test-db>?replicaSet=rs0 \
//   ADMIN_USERNAME=... ADMIN_PASSWORD=... OUT=/tmp/shots \
//   node server/scripts/verify-demo-data-checklist.mjs
// İsteğe bağlı: CLIENT_BASE, API_BASE, CHROMIUM_PATH (yoksa Playwright'ın kendi tarayıcısı).
import { chromium } from 'playwright';
import mongoose from 'mongoose';

const BASE = process.env.CLIENT_BASE || 'http://localhost:5173';
const API = process.env.API_BASE || 'http://localhost:3001/api';
const OUT = process.env.OUT || '.';
const DB = process.env.MONGODB_URI;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!DB || !/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(DB)) {
  console.error('MONGODB_URI yerel bir veritabanı olmalı (mongodb://127.0.0.1 veya localhost) — betik veri yükleyip siler.');
  process.exit(2);
}
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.error('ADMIN_USERNAME ve ADMIN_PASSWORD gerekli.');
  process.exit(2);
}
const SEED_COLLECTIONS = ['users', 'transactions', 'bets', 'events', 'casinorounds', 'kycdocuments', 'riskevaluations',
  'riskfindings', 'tickets', 'agents', 'referralcommissions', 'bankdepositrequests', 'cryptodeposits', 'slikairpayments'];
const CATS = ['users', 'sports', 'casino', 'kyc', 'risk', 'tickets', 'agents', 'payments'];
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`); };

await mongoose.connect(DB);
const db = mongoose.connection.db;
async function snapshot(filter = {}) {
  const out = {};
  for (const c of SEED_COLLECTIONS) out[c] = await db.collection(c).countDocuments(filter);
  return out;
}

// "Gerçek" (seed olmayan) bir kullanıcı + işlem: izolasyon kontrolü için.
const login = async (username, password) => (await (await fetch(`${API}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
})).json()).accessToken;
let adminToken = await login(ADMIN_USERNAME, ADMIN_PASSWORD);
let pageRef = null; // UI girişinden sonra token'ı her çağrıda tarayıcıdan oku (istemci refresh ile yeniler)
const authed = async (path, init = {}) => {
  if (pageRef) adminToken = await pageRef.evaluate(() => localStorage.getItem('accessToken'));
  return fetch(`${API}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, ...(init.headers || {}) } });
};
let real = await db.collection('users').findOne({ username: 'real_player_audit' });
if (!real) {
  const r = await authed('/admin/users', { method: 'POST', body: JSON.stringify({ username: 'real_player_audit', email: 'real_player_audit@local.test', password: 'RealPlayer123' }) });
  real = (await r.json()).user;
  await authed(`/admin/users/${real._id}/balance`, { method: 'PATCH', body: JSON.stringify({ amount: 250, type: 'credit', note: 'gerçek kullanıcı — izolasyon kontrolü' }) });
}
const realId = new mongoose.Types.ObjectId(String(real._id));
const realBefore = {
  user: await db.collection('users').findOne({ _id: realId }, { projection: { balance: 1, username: 1 } }),
  tx: await db.collection('transactions').countDocuments({ userId: realId }),
};
const before = await snapshot();
const beforeSeed = await snapshot({ isSeed: true });
check('Başlangıçta seed verisi yok', Object.values(beforeSeed).every(v => v === 0), JSON.stringify(beforeSeed));

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('dialog', d => d.accept());
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));

await page.goto(`${BASE}/login`);
await page.fill('input[placeholder]:not([type=password]) >> nth=0', ADMIN_USERNAME);
await page.fill('input[type=password]', ADMIN_PASSWORD);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
// UI girişi tokenVersion'ı artırır — API çağrıları için tarayıcının token'ını kullan.
pageRef = page;

// 1) /admin/demo-data açılıyor, 8 kategori görünüyor.
await page.goto(`${BASE}/admin/demo-data`);
await page.waitForLoadState('load');
const rowInputs = page.locator('table tbody tr input[type=number]');
await rowInputs.first().waitFor({ timeout: 15000 });
check('/admin/demo-data açılıyor, 8 kategori satırı', (await rowInputs.count()) === 8, `${await rowInputs.count()} satır`);
await page.screenshot({ path: `${OUT}/01-demo-data-empty.png`, fullPage: true });

// 2) Her kategoriye 50 → "Tümünü üret".
for (let i = 0; i < 8; i++) await rowInputs.nth(i).fill('50');
await page.getByRole('button', { name: /Tümünü Oluştur|Generate All/ }).click();
await page.waitForResponse(r => r.url().includes('/demo-data/payments/load'), { timeout: 180000 });
await page.waitForTimeout(1500);
const statusAfterLoad = await (await authed('/admin/demo-data/status')).json();
if (!statusAfterLoad.categories) console.log('DEBUG status', JSON.stringify(statusAfterLoad), 'token?', !!adminToken, await page.evaluate(() => Object.keys(localStorage)));
const loadedCounts = Object.fromEntries(CATS.map(c => [c, statusAfterLoad.categories[c]?.count ?? 0]));
check('8 kategori yüklendi (her biri > 0)', CATS.every(c => loadedCounts[c] > 0), JSON.stringify(loadedCounts));
await page.screenshot({ path: `${OUT}/02-demo-data-loaded.png`, fullPage: true });

// 3) İlgili admin sayfaları dolu.
async function pageHasRows(path, shot) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('load');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${shot}.png`, fullPage: true });
  return page.locator('table tbody tr').count();
}
for (const [path, shot] of [['/admin/users', '03-users'], ['/admin/wallet', '04-wallet'], ['/admin/compliance', '05-compliance'], ['/admin/tickets', '06-tickets'], ['/admin/agents', '07-agents']]) {
  const n = await pageHasRows(path, shot);
  check(`${path} seed sonrası dolu`, n > 0, `${n} tablo satırı`);
}

// 4) Dashboard/Analytics 90 günlük veriyle hareketli.
await page.goto(`${BASE}/admin`);
await page.waitForLoadState('load');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/08-dashboard.png`, fullPage: true });
const overview = await (await authed('/admin/analytics/overview?days=90')).json();
check('Analytics overview seed sonrası sıfır değil', (overview?.users?.total ?? 0) > 1, JSON.stringify(overview).slice(0, 160));
await page.goto(`${BASE}/admin`);
await page.waitForLoadState('load');
await page.getByRole('button', { name: /^90/ }).first().click();
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/09-dashboard-90d.png`, fullPage: true });
const chartPaths = await page.locator('.recharts-area-curve, .recharts-line-curve, .recharts-bar-rectangle').count();
check('Dashboard 90G gelir grafiği seed verisiyle çiziliyor', chartPaths > 0, `${chartPaths} grafik öğesi`);
await page.goto(`${BASE}/admin/analytics`);
await page.waitForLoadState('load');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/09b-analytics.png`, fullPage: true });
const kpiText = await page.locator('main').innerText();
check('Analytics KPI kartları seed sayılarını gösteriyor', kpiText.includes(String(overview.users.total)), `toplam kullanıcı ${overview.users.total}`);

// 5) Canlı simülasyon → ActivityFeed'e yeni kayıt düşüyor (1 dk tick), gerçek kullanıcı etkilenmiyor.
const evBefore = await db.collection('activityevents').countDocuments();
await page.goto(`${BASE}/admin/demo-data`);
await page.waitForLoadState('load');
await authed('/admin/demo-data/live/start', { method: 'POST', body: JSON.stringify({ tickIntervalMinutes: 1 }) });
await page.goto(`${BASE}/admin`);
await page.waitForLoadState('load');
let evAfter = evBefore;
for (let i = 0; i < 6 && evAfter <= evBefore; i++) { await page.waitForTimeout(30000); evAfter = await db.collection('activityevents').countDocuments(); }
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/10-dashboard-live.png`, fullPage: true });
check('Canlı simülasyon ActivityEvent üretiyor', evAfter > evBefore, `${evBefore} → ${evAfter}`);
const liveEvents = await db.collection('activityevents').find().sort({ createdAt: -1 }).limit(3).toArray();
const liveUsers = await db.collection('users').find({ _id: { $in: liveEvents.map(e => e.userId) } }, { projection: { isSeed: 1 } }).toArray();
check('Canlı olaylar yalnızca seed kullanıcılara ait', liveUsers.length > 0 && liveUsers.every(u => u.isSeed === true), liveEvents.map(e => e.type).join(','));
await authed('/admin/demo-data/live/stop', { method: 'POST' });

// 6) "Tümünü Temizle" → seed öncesi duruma dönüş, gerçek veri aynı.
await page.goto(`${BASE}/admin/demo-data`);
await page.waitForLoadState('load');
await page.getByRole('button', { name: /Tümünü Temizle|Clear All/ }).first().click();
await page.waitForResponse(r => r.url().includes('/demo-data/users/clear'), { timeout: 120000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/11-demo-data-cleared.png`, fullPage: true });
const afterSeed = await snapshot({ isSeed: true });
check('Tümünü Temizle sonrası isSeed kaydı kalmadı', Object.values(afterSeed).every(v => v === 0), JSON.stringify(afterSeed));
const allEvents = await db.collection('activityevents').find({}, { projection: { userId: 1 } }).toArray();
const orphanEvents = (await Promise.all(allEvents.map(async e => !(await db.collection('users').findOne({ _id: e.userId }))))).filter(Boolean).length;
check('Tümünü Temizle sonrası aktivite akışında sahipsiz (seed) kayıt kalmadı', orphanEvents === 0, `${allEvents.length} olay, ${orphanEvents} sahipsiz`);
await page.goto(`${BASE}/admin`);
await page.waitForLoadState('load');
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/12-dashboard-after-clear.png`, fullPage: true });
const after = await snapshot();
const diff = Object.fromEntries(SEED_COLLECTIONS.map(c => [c, after[c] - before[c]]).filter(([, d]) => d !== 0));
check('Koleksiyon sayıları seed öncesine döndü', Object.keys(diff).length === 0, JSON.stringify(diff));
const realAfter = {
  user: await db.collection('users').findOne({ _id: realId }, { projection: { balance: 1, username: 1 } }),
  tx: await db.collection('transactions').countDocuments({ userId: realId }),
};
check('Gerçek kullanıcı ve işlemleri değişmedi', realAfter.user?.balance === realBefore.user?.balance && realAfter.tx === realBefore.tx,
  `bakiye ${realBefore.user?.balance}→${realAfter.user?.balance}, işlem ${realBefore.tx}→${realAfter.tx}`);
check('Tarayıcıda yakalanmamış JS hatası yok', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();
await mongoose.disconnect();
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} PASS`);
process.exit(failed ? 1 : 0);
