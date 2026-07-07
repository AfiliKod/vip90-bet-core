import { chromium } from 'playwright';

const CLIENT_BASE = process.env.VERIFY_CLIENT_BASE || 'http://localhost:5173';

async function checkPage(page, path, label) {
  await page.goto(`${CLIENT_BASE}${path}`, { waitUntil: 'networkidle' });

  const scrollContainer = await page.evaluate(() => {
    const el = document.querySelector('[data-scroll-container]');
    if (!el) return null;
    el.scrollTop = 500;
    return true;
  });
  if (!scrollContainer) throw new Error(`${label}: data-scroll-container bulunamadı`);

  await page.waitForTimeout(300);
  const button = page.getByLabel('Yukarı çık');
  const isVisible = await button.isVisible();
  if (!isVisible) throw new Error(`${label}: buton 500px scroll sonrası görünür olmalıydı`);

  await button.click();
  await page.waitForTimeout(500);
  const scrollTopAfter = await page.evaluate(() => document.querySelector('[data-scroll-container]').scrollTop);
  if (scrollTopAfter > 10) throw new Error(`${label}: tıklama sonrası scrollTop ${scrollTopAfter}, 0'a yakın olmalıydı`);

  console.log(`  ✓ ${label}: buton görünür + tıklanınca gerçekten yukarı kaydırdı`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Çerez onay banner'ı (CookieConsent) sayfanın altında sabit durur ve
  // ScrollToTop butonuyla aynı bölgeyi kapladığı için tıklamaları engelleyebilir.
  // Bu, doğrulanan fix ile ilgisiz bir UI elemanı olduğundan, testin kararlı
  // çalışması için onayı önceden verilmiş kabul ediyoruz.
  await page.addInitScript(() => {
    localStorage.setItem('cookie-consent:v1', JSON.stringify({
      version: '1.0',
      timestamp: new Date().toISOString(),
      prefs: { necessary: true, analytics: false, marketing: false },
    }));
  });

  await page.goto(`${CLIENT_BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', 'Admin1234!');
  await page.click('button[type="submit"]');
  await page.waitForSelector('input[name="username"]', { state: 'detached', timeout: 15000 });

  console.log('🔥 ScrollToTop Doğrulaması\n');
  await checkPage(page, '/bahis', 'Bahis sayfası');
  await checkPage(page, '/canli', 'Canlı sayfası');
  await checkPage(page, '/', 'Ana sayfa (regresyon)');
  await checkPage(page, '/casino', 'Casino (regresyon)');

  await browser.close();
  console.log('\nTüm sayfalarda ScrollToTop doğru çalışıyor.');
}

main().catch(err => { console.error('HATA:', err.message); process.exit(1); });
