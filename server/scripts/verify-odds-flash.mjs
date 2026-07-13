import { chromium } from 'playwright';

const API_BASE = process.env.VERIFY_API_BASE || 'http://localhost:3001/api';
const CLIENT_BASE = process.env.VERIFY_CLIENT_BASE || 'http://localhost:5173';

async function findTargetOdd() {
  const res = await fetch(`${API_BASE}/events`);
  const data = await res.json();
  const events = data.events ?? [];
  for (const event of events) {
    // /bahis sayfası canlı (status==='live') event'leri listeden hariç tutuyor
    // (bkz. client/src/pages/Bahis.jsx:63 — baseEvents = events.filter(e => e.status !== 'live')),
    // bu yüzden hedef event'in gerçekten sayfada render edileceğinden emin olmak için
    // canlı olmayan (yaklaşan) bir event seçiyoruz.
    if (event.status === 'live') continue;
    const mainMarket = event.markets?.find(m => m.type === 'maç_sonucu') ?? event.markets?.[0];
    const odd = mainMarket?.odds?.find(o => (o.value ?? 0) > 1);
    if (odd && mainMarket) {
      return {
        eventId: event._id,
        homeTeam: event.homeTeam?.name,
        awayTeam: event.awayTeam?.name,
        marketType: mainMarket.type,
        markets: event.markets,
        oddId: odd.id,
        oddValue: odd.value,
      };
    }
  }
  throw new Error('Uygun oran bulunamadı — hiçbir event maç_sonucu marketinde >1.00 değerli oran içermiyor. Server ve oddsSource sync çalışıyor mu?');
}

async function patchOddValue({ token, eventId, markets, marketType, oddId, newValue }) {
  const patchedMarkets = markets.map(m => m.type !== marketType ? m : {
    ...m,
    odds: m.odds.map(o => o.id !== oddId ? o : { ...o, value: newValue }),
  });
  const res = await fetch(`${API_BASE}/admin/events/${eventId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ markets: patchedMarkets }),
  });
  if (!res.ok) throw new Error(`Admin PATCH başarısız: ${res.status} ${await res.text()}`);
}

// Not: metin eşleşmesi ".font-black" class'lı TÜM span'lar üzerinden yapılıyor —
// aynı formatlanmış değere sahip başka bir oran varsa (örn. "1.85" iki farklı
// maçta) yanlış elementi eşleştirebilir. Bu, tek-seferlik manuel doğrulama
// script'i için kabul edilebilir bir basitleştirme (bkz. spec Test Planı).
async function checkFlashClass(page, oldText, expectedRingClass) {
  const result = await page.evaluate(({ oldText }) => {
    const spans = [...document.querySelectorAll('span.font-black')];
    const target = spans.find(s => s.textContent.trim() === oldText);
    if (!target) return { found: false };
    const button = target.closest('button');
    return { found: true, className: button?.className ?? '' };
  }, { oldText });
  if (!result.found) return null;
  return result.className.includes(expectedRingClass);
}

async function main() {
  const target = await findTargetOdd();
  console.log(`Hedef oran: ${target.homeTeam} vs ${target.awayTeam}, market=${target.marketType}, oddId=${target.oddId}, mevcut değer=${target.oddValue}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(`${CLIENT_BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', 'Admin1234!');
  await page.click('button[type="submit"]');
  await page.waitForSelector('input[name="username"]', { state: 'detached', timeout: 15000 });

  const token = await page.evaluate(() => localStorage.getItem('accessToken'));
  if (!token) throw new Error("accessToken localStorage'da bulunamadı — admin girişi başarısız oldu mu?");

  await page.goto(`${CLIENT_BASE}/bahis`, { waitUntil: 'networkidle' });

  console.log('🔥 Oran Değişim Renklendirmesi Doğrulaması\n');

  const oldText = target.oddValue.toFixed(2);
  const upValue = target.oddValue + 0.5;
  const upText = upValue.toFixed(2);
  const downValue = upValue - 0.3;
  const downText = downValue.toFixed(2);

  try {
    await patchOddValue({ token, eventId: target.eventId, markets: target.markets, marketType: target.marketType, oddId: target.oddId, newValue: upValue });
    await page.waitForTimeout(800); // socket.io odds:update + React render için

    const upFlashed = await checkFlashClass(page, upText, 'ring-green-400');
    if (upFlashed === null) throw new Error(`Yükseltilmiş oran (${upText}) sayfada bulunamadı — MiniEventCard render edilmemiş olabilir (event /bahis listesinde görünmüyor mu?)`);
    if (!upFlashed) throw new Error('Oran yükselince ring-green-400 class\'ı uygulanmadı');
    console.log(`  ✓ Oran yükselince (${oldText} → ${upText}) yeşil flash (ring-green-400) uygulandı`);

    await page.waitForTimeout(1300); // flash'ın otomatik temizlenmesini bekle (1200ms + pay)

    await patchOddValue({ token, eventId: target.eventId, markets: target.markets, marketType: target.marketType, oddId: target.oddId, newValue: downValue });
    await page.waitForTimeout(800);

    const downFlashed = await checkFlashClass(page, downText, 'ring-red-400');
    if (downFlashed === null) throw new Error(`Düşürülmüş oran (${downText}) sayfada bulunamadı`);
    if (!downFlashed) throw new Error('Oran düşünce ring-red-400 class\'ı uygulanmadı');
    console.log(`  ✓ Oran düşünce (${upText} → ${downText}) kırmızı flash (ring-red-400) uygulandı`);

    await page.screenshot({ path: 'server/scripts/verify-odds-flash.png', fullPage: false });
    console.log('  ✓ Screenshot: server/scripts/verify-odds-flash.png');
  } finally {
    // Test verisini bozmadan orijinal değere geri al
    await patchOddValue({ token, eventId: target.eventId, markets: target.markets, marketType: target.marketType, oddId: target.oddId, newValue: target.oddValue });
    await browser.close();
  }

  console.log('\nDoğrulama tamamlandı.');
}

main().catch(err => { console.error('HATA:', err.message); process.exit(1); });
