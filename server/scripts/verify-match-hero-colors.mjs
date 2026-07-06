import { chromium } from 'playwright';

const API_BASE = 'http://localhost:3001/api';
const CLIENT_BASE = 'http://localhost:5173';

async function main() {
  const res = await fetch(`${API_BASE}/events`);
  const data = await res.json();
  const events = data.events ?? [];
  if (!events.length) throw new Error('Hiç event bulunamadı — server ve oddsSource sync çalışıyor mu?');
  const event = events[0];
  console.log(`Test event: ${event.homeTeam.name} vs ${event.awayTeam.name} (${event._id})`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(`${CLIENT_BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', 'Admin1234!');
  await page.click('button[type="submit"]');
  await page.waitForSelector('input[name="username"]', { state: 'detached', timeout: 15000 });

  await page.goto(`${CLIENT_BASE}/events/${event._id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500); // TheSportsDB fetch'inin (logo+renk) tamamlanması için

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'server/scripts/match-hero-desktop.png' });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'server/scripts/match-hero-mobile.png' });

  console.log('Screenshot alındı: server/scripts/match-hero-desktop.png, server/scripts/match-hero-mobile.png');
  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
