import { chromium } from 'playwright';

const sessions = new Map();

// ── fillText/strokeText override init script ──────────────────────────────────
// page.addInitScript ile oyunun JS'inden ÖNCE inject edilir.
// Canvas 2D API'sini monkey-patch ederek balance görünen tüm numeric text'leri
// window.__bz_balance ile değiştirir.
const BALANCE_INIT_SCRIPT = `
(function() {
  window.__bz_balance = null;

  var origFill   = CanvasRenderingContext2D.prototype.fillText;
  var origStroke = CanvasRenderingContext2D.prototype.strokeText;

  function maybeBalance(text) {
    if (window.__bz_balance === null) return text;
    // Sayısal ve ondalıklı mı? Örn: "998.50", "1,000.00", "1000"
    var s = String(text).trim().replace(/,/g, '');
    if (!/^\\d+(\\.\\d{1,2})?$/.test(s)) return text;
    var n = parseFloat(s);
    // Demo bakiyeleri genellikle 1–100000 aralığında
    if (n < 1 || n > 100000) return text;
    return window.__bz_balance.toFixed(2);
  }

  CanvasRenderingContext2D.prototype.fillText = function(text, x, y) {
    return origFill.apply(this, [maybeBalance(text), x, y].concat(Array.prototype.slice.call(arguments, 3)));
  };

  CanvasRenderingContext2D.prototype.strokeText = function(text, x, y) {
    return origStroke.apply(this, [maybeBalance(text), x, y].concat(Array.prototype.slice.call(arguments, 3)));
  };
})();
`;

// ── Spin result heuristic parser ──────────────────────────────────────────────
function extractSpinResult(obj, depth = 0) {
  if (depth > 6 || !obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const r = extractSpinResult(item, depth + 1);
      if (r) return r;
    }
    return null;
  }
  const bet = obj.bet ?? obj.betAmount ?? obj.stake ?? obj.wager ?? obj.betValue ?? obj.totalBet;
  const win = obj.win ?? obj.winAmount ?? obj.payout ?? obj.prize ?? obj.totalWin ?? obj.winValue;
  if (typeof bet === 'number' && typeof win === 'number' && bet > 0) return { bet, win };
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object') {
      const r = extractSpinResult(val, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

// ── Session yönetimi ─────────────────────────────────────────────────────────
export async function createSession(sessionId, demoUrl, { onSpinResult, initialBalance } = {}) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
    ],
  });

  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  });

  // Anti-detection
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = { runtime: {} };
  });

  // fillText/strokeText override — oyun JS'inden ÖNCE çalışmalı
  await ctx.addInitScript(BALANCE_INIT_SCRIPT);

  const page = await ctx.newPage();

  // Network interception
  let spinDebounce = null;
  await page.route('**/*', async (route) => {
    let response;
    try { response = await route.fetch({ timeout: 15000 }); }
    catch { return route.abort().catch(() => {}); }

    const ct = response.headers()['content-type'] || '';
    if (ct.includes('json')) {
      try {
        const body = await response.text();
        const data = JSON.parse(body);
        const spin = extractSpinResult(data);
        if (spin && onSpinResult) {
          clearTimeout(spinDebounce);
          spinDebounce = setTimeout(() => { onSpinResult(spin); spinDebounce = null; }, 200);
        }
        await route.fulfill({ response, body });
        return;
      } catch { /* devam */ }
    }
    await route.fulfill({ response }).catch(() => {});
  });

  // Oyunu yükle
  try {
    await page.goto(demoUrl, { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    // Navigate SONRA balance'ı set et
    if (initialBalance != null) {
      await page.evaluate((bal) => { window.__bz_balance = bal; }, initialBalance);
    }
  } catch (e) {
    console.warn(`[casinoProxy] Yükleme hatası (${sessionId}):`, e.message);
  }

  sessions.set(sessionId, { browser, page });
  console.log(`[casinoProxy] Session: ${sessionId}`);
  return page;
}

export async function getScreenshot(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return null;
  return s.page.screenshot({ type: 'jpeg', quality: 70 }).catch(() => null);
}

export async function sendInput(sessionId, type, data) {
  const s = sessions.get(sessionId);
  if (!s) return;
  const { page } = s;
  try {
    if (type === 'click')       await page.mouse.click(data.x, data.y);
    else if (type === 'move')   await page.mouse.move(data.x, data.y);
    else if (type === 'keydown') await page.keyboard.press(data.key);
    else if (type === 'scroll') await page.mouse.wheel(0, data.deltaY);
  } catch { /* ignore */ }
}

export async function updateSessionBalance(sessionId, newBalance) {
  const s = sessions.get(sessionId);
  if (!s) return;
  await s.page.evaluate((bal) => { window.__bz_balance = bal; }, newBalance).catch(() => {});
}

export async function closeSession(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return;
  await s.browser.close().catch(() => {});
  sessions.delete(sessionId);
  console.log(`[casinoProxy] Kapatıldı: ${sessionId}`);
}

export function getSessionCount() { return sessions.size; }
