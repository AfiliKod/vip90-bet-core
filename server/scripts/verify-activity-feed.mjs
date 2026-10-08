// Admin aktivite akışı planı (docs/superpowers/plans/2026-09-22-admin-activity-feed.md)
// Task 14 Step 4 senaryosunun tarayıcıyla yürütülmesi:
//   (a) bir yatırma onaylanınca akışta sayfa yenilenmeden ANINDA görünür,
//   (b) bir in-house oyun turu oturum satırını açar, sonraki tur aynı satırı günceller,
//   (c) satıra tıklayınca detay paneli açılır, "Kullanıcıyı Görüntüle" kullanıcı panelini açar.
//
// UYARI: (a) için bekleyen bir banka yatırma talebi açıp onaylar (gerçek kullanıcının
// bakiyesi artar); (b) için oyun turunu doğrudan CasinoRound olarak yazar. YALNIZCA
// yerel/test veritabanında çalıştırın — MONGODB_URI localhost değilse çalışmaz.
// Production'da aynı kontroller admin hesabıyla elle yapılmalıdır (bkz. plan notu).
//
// (b) neden doğrudan CasinoRound: gerçek in-house oyun motoru `server/src/premium/
// inhouse-provider` alt modülündedir; akışa giden yol motordan bağımsızdır —
// `CasinoRound` post-save hook'u (`provider: 'inhouse'`) → `upsertGameSession()`.
// Tur bu betiğin sürecinde kaydedildiği için hook'un soket yayını sunucuya ulaşmaz;
// (b) DB'deki oturum kaydını ve sayfa yenilemesiyle görünürlüğü doğrular, canlı
// soket yayını (a)'da doğrulanır.
//
// Kullanım (repo kökünden):
//   MONGODB_URI=mongodb://127.0.0.1:27017/<test-db>?replicaSet=rs0 \
//   ADMIN_USERNAME=... ADMIN_PASSWORD=... OUT=/tmp/shots \
//   node server/scripts/verify-activity-feed.mjs
// İsteğe bağlı: CLIENT_BASE, API_BASE, CHROMIUM_PATH.
import { chromium } from 'playwright';
import mongoose from 'mongoose';

const BASE = process.env.CLIENT_BASE || 'http://localhost:5173';
const API = process.env.API_BASE || 'http://localhost:3001/api';
const OUT = process.env.OUT || '.';
const DB = process.env.MONGODB_URI;
const { ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;
if (!DB || !/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(DB)) {
  console.error('MONGODB_URI yerel bir veritabanı olmalı — betik talep açıp onaylar.');
  process.exit(2);
}
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) { console.error('ADMIN_USERNAME ve ADMIN_PASSWORD gerekli.'); process.exit(2); }

const results = [];
const check = (name, ok, detail = '') => { results.push({ ok }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`); };

await mongoose.connect(DB);
const db = mongoose.connection.db;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
await page.goto(`${BASE}/login`);
await page.fill('input[placeholder]:not([type=password]) >> nth=0', ADMIN_USERNAME);
await page.fill('input[type=password]', ADMIN_PASSWORD);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
const authed = async (path, init = {}) => {
  const token = await page.evaluate(() => localStorage.getItem('accessToken'));
  return fetch(`${API}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
};

// Akışa düşecek "oyuncu" — yoksa admin API'siyle açılır.
const PLAYER = 'feed_player_audit';
let player = await db.collection('users').findOne({ username: PLAYER });
if (!player) {
  const r = await authed('/admin/users', { method: 'POST', body: JSON.stringify({ username: PLAYER, email: `${PLAYER}@local.test`, password: 'FeedPlayer123' }) });
  player = (await r.json()).user;
}
const playerId = new mongoose.Types.ObjectId(String(player._id));

await page.goto(`${BASE}/admin`);
await page.waitForLoadState('load');
const feed = page.locator('div:has(> div > h3:text-matches("Canlı Aktivite|Live Activity"))').last();
await feed.waitFor({ timeout: 15000 });
await page.waitForTimeout(1500);

// (a) Yatırma onayı → akışa sayfa yenilenmeden düşer.
const amount = 1234.56;
const { insertedId } = await db.collection('bankdepositrequests').insertOne({ userId: playerId, type: 'deposit', amount, status: 'pending', createdAt: new Date(), updatedAt: new Date() });
const t0 = Date.now();
const approve = await authed(`/bank/admin/pending/${insertedId}/approve`, { method: 'PATCH' });
check('Banka yatırma talebi onaylandı', approve.status === 200, `HTTP ${approve.status}`);
const depositRow = feed.locator('button', { hasText: PLAYER }).filter({ hasText: /Yatırma|Deposit/ }).first();
let liveOk = true;
try { await depositRow.waitFor({ timeout: 10000 }); } catch { liveOk = false; }
check('(a) Yatırma akışta ANINDA (yenilemeden, soketle) göründü', liveOk, liveOk ? `${Date.now() - t0} ms` : '10 sn içinde görünmedi');
await page.screenshot({ path: `${OUT}/a-deposit-live.png`, fullPage: false });

// (b) In-house tur → oturum satırı; ikinci tur aynı satırı günceller.
const round = (bet, net) => ({ userId: playerId, provider: 'inhouse', gameId: 'inhouse-mines', gameTitle: 'Mines', bet, payout: bet + net, net, balanceBefore: 1000, balanceAfter: 1000 + net });
const CasinoRound = (await import('../src/models/CasinoRound.js')).default;
// Betik 10 dk içinde tekrar çalıştırılırsa turlar mevcut aktif oturuma eklenir (doğru
// davranış) — bu yüzden mutlak sayı değil, tur sayısındaki artış ölçülür.
const activeSession = () => db.collection('activityevents').find({ userId: playerId, type: 'game_session', status: 'active' }).toArray();
const roundsBefore = (await activeSession())[0]?.data?.roundCount || 0;
await CasinoRound.create(round(10, -10));
await CasinoRound.create(round(20, 15));
const sessions = await activeSession();
check('(b) İki in-house tur tek aktif oturum satırında toplandı', sessions.length === 1 && sessions[0].data?.roundCount === roundsBefore + 2,
  `tur ${roundsBefore} → ${sessions[0]?.data?.roundCount}, aktif oturum ${sessions.length}`);
await page.reload();
await page.waitForLoadState('load');
const sessionRow = feed.locator('button', { hasText: PLAYER }).filter({ hasText: /Mines/ }).first();
let sessionVisible = true;
try { await sessionRow.waitFor({ timeout: 10000 }); } catch { sessionVisible = false; }
check('(b) Oturum satırı akışta görünüyor', sessionVisible);
await page.screenshot({ path: `${OUT}/b-game-session.png`, fullPage: false });

// (c) Satır detayı + "Kullanıcıyı Görüntüle".
const row = feed.locator('button', { hasText: PLAYER }).filter({ hasText: /Yatırma|Deposit/ }).first();
await row.click();
const viewUser = feed.locator('a', { hasText: PLAYER }).first();
let detailOk = true;
try { await viewUser.waitFor({ timeout: 5000 }); } catch { detailOk = false; }
const detailText = detailOk ? await viewUser.locator('xpath=..').innerText() : '';
check('(c) Satıra tıklayınca detay paneli açıldı (durum + tutar)', detailOk && /completed/.test(detailText) && detailText.includes('1234.56'), detailText.replace(/\s+/g, ' ').slice(0, 90));
await page.screenshot({ path: `${OUT}/c-detail.png`, fullPage: false });
await viewUser.click();
await page.waitForURL(u => u.pathname === '/admin/users', { timeout: 10000 });
const url = new URL(page.url());
check('(c) "Kullanıcıyı Görüntüle" /admin/users?openUser=… adresine gitti', url.searchParams.get('openUser') === PLAYER, page.url());
let slideOk = true;
// Slide-over'a özgü öğeler: oyuncunun e-postası (başlık altı) + "Casino ödülü ver" düğmesi.
try {
  await page.getByText(`${PLAYER}@local.test`, { exact: true }).first().waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /Casino ödülü ver|Give casino reward/ }).waitFor({ timeout: 5000 });
} catch { slideOk = false; }
check('(c) Kullanıcı paneli (slide-over) o oyuncuyla açıldı', slideOk);
await page.screenshot({ path: `${OUT}/c-user-slideover.png`, fullPage: false });
check('Tarayıcıda yakalanmamış JS hatası yok', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();
await mongoose.disconnect();
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} PASS`);
process.exit(failed ? 1 : 0);
