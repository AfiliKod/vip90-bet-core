import { chromium } from 'playwright';

const CLIENT_BASE = process.env.VERIFY_CLIENT_BASE || 'http://localhost:5173';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(`${CLIENT_BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', 'Admin1234!');
  await page.click('button[type="submit"]');
  await page.waitForSelector('input[name="username"]', { state: 'detached', timeout: 15000 });

  await page.goto(`${CLIENT_BASE}/bahis`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'server/scripts/verify-bahis-slider.png', fullPage: false });
  console.log('Bahis sayfası screenshot alındı: server/scripts/verify-bahis-slider.png');

  await page.goto(`${CLIENT_BASE}/canli`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'server/scripts/verify-canli-slider.png', fullPage: false });
  console.log('Canlı sayfası screenshot alındı: server/scripts/verify-canli-slider.png');

  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
