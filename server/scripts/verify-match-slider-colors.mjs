import { chromium } from 'playwright';

const API_BASE = process.env.VERIFY_API_BASE || 'http://localhost:3001/api';
const CLIENT_BASE = process.env.VERIFY_CLIENT_BASE || 'http://localhost:5173';

async function checkSlider(page, path, label, screenshotPath) {
  await page.goto(`${CLIENT_BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500); // TheSportsDB fetch'lerinin tamamlanması için

  const result = await page.evaluate(() => {
    const oldPhoto = document.querySelector('img[src*="/images/sports/"]');
    const sliderRoot = document.querySelector('.rounded-2xl.overflow-hidden.select-none.shadow-xl');
    if (!sliderRoot) return { noSlider: true };
    const bgDiv = [...sliderRoot.querySelectorAll('div')].find(
      d => d.style.background && d.style.background.includes('gradient') && !d.style.background.includes('rgba')
    );
    return {
      hasOldPhoto: !!oldPhoto,
      hasGradientDiv: !!bgDiv,
      gradient: bgDiv?.style.background ?? null,
    };
  });

  if (result.noSlider) {
    console.log(`  ⚠ ${label}: slider render edilmedi (görünen etkinlik yok) — atlanıyor`);
    return null;
  }
  if (result.hasOldPhoto) throw new Error(`${label}: hâlâ eski /images/sports/ fotoğrafı render ediliyor`);
  if (!result.hasGradientDiv) throw new Error(`${label}: gradient background'lı div bulunamadı`);

  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`  ✓ ${label}: takım-renkli gradient render ediliyor (${result.gradient}), screenshot: ${screenshotPath}`);
  return result.gradient;
}

async function main() {
  const res = await fetch(`${API_BASE}/events`);
  const data = await res.json();
  const events = data.events ?? [];
  if (!events.length) throw new Error('Hiç event bulunamadı — server ve oddsSource sync çalışıyor mu?');
  console.log(`API'den ${events.length} event bulundu.`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(`${CLIENT_BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', 'Admin1234!');
  await page.click('button[type="submit"]');
  await page.waitForSelector('input[name="username"]', { state: 'detached', timeout: 15000 });

  console.log('🔥 Slider Takım-Renkli Görsel Doğrulaması\n');
  await checkSlider(page, '/bahis', 'Bahis sayfası (HeroSlider)', 'server/scripts/verify-bahis-slider-colors.png');
  await checkSlider(page, '/canli', 'Canlı sayfası (LiveHeroSlider)', 'server/scripts/verify-canli-slider-colors.png');

  await browser.close();
  console.log('\nDoğrulama tamamlandı.');
}

main().catch(err => { console.error('HATA:', err.message); process.exit(1); });
