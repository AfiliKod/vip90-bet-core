import { chromium } from 'playwright';

const CLIENT_BASE = process.env.VERIFY_CLIENT_BASE || 'http://localhost:5173';

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}`); }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 1) Login sayfası: footer metni + kullanıcı sözleşmesi linki
  // NOT: Login.jsx React.lazy + Suspense ile yükleniyor; 'domcontentloaded' React render'ından
  // önce tetiklenebiliyor (Suspense fallback anında body neredeyse boş). Bu yüzden asıl içerik
  // görünene kadar bekliyoruz (agreementLink kontrolü zaten Playwright'ın örtük bekleme/retry
  // davranışı sayesinde geçiyordu, ama footerText anlık okuma olduğu için raw domcontentloaded'da
  // yarış durumuna düşüyordu).
  await page.goto(`${CLIENT_BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('a[href="/legal/user-agreement"]').waitFor({ state: 'attached' });
  const footerText = await page.textContent('body');
  check('Footer "kullanıcı sözleşmemizi" metnini içeriyor', footerText.includes('kullanıcı sözleşmemizi'));
  const agreementLink = await page.getAttribute('a[href="/legal/user-agreement"]', 'href').catch(() => null);
  check('Footer /legal/user-agreement linkine sahip', agreementLink === '/legal/user-agreement');

  // 2) Şifre göz ikonu: toggle davranışı
  const passwordInput = page.locator('input[name="password"]');
  const initialType = await passwordInput.getAttribute('type');
  check('Şifre input başlangıçta type=password', initialType === 'password');
  await page.locator('input[name="password"]').locator('xpath=following-sibling::button[1]').click();
  const toggledType = await passwordInput.getAttribute('type');
  check('Göz ikonuna tıklayınca type=text olur', toggledType === 'text');

  // 3) Arkaplan görseli: sayfa yükleniyor ve screenshot alınabiliyor
  await page.screenshot({ path: 'server/scripts/verify-login-bg.png', fullPage: false });
  console.log('  ℹ Screenshot alındı: server/scripts/verify-login-bg.png (görsel manuel kontrol edilmeli)');

  // 4) /verify-email sayfası: geçersiz token ile hata durumu
  await page.goto(`${CLIENT_BASE}/verify-email?token=invalid-token-12345`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const verifyPageText = await page.textContent('body');
  check('/verify-email geçersiz token için hata mesajı gösteriyor', verifyPageText.includes('geçersiz') || verifyPageText.includes('süresi dolmuş'));

  // 5) /verify-email token yoksa da hata durumu (404 değil)
  await page.goto(`${CLIENT_BASE}/verify-email`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const noTokenText = await page.textContent('body');
  check('/verify-email token olmadan 404 vermiyor (SPA route çalışıyor)', !noTokenText.toLowerCase().includes('cannot get'));

  // 6) Kullanıcı sözleşmesi sayfası render oluyor
  await page.goto(`${CLIENT_BASE}/legal/user-agreement`, { waitUntil: 'networkidle' });
  const agreementPageText = await page.textContent('body');
  check('/legal/user-agreement sayfası "Kullanıcı Sözleşmesi" başlığını gösteriyor', agreementPageText.includes('Kullanıcı Sözleşmesi'));

  // 7) Register akışı: doğrulanmadan oturum açılmıyor, aynı "email'ini doğrula" kartı gösteriliyor
  await page.goto(`${CLIENT_BASE}/login?tab=register`, { waitUntil: 'domcontentloaded' });
  const uniqueSuffix = Date.now();
  await page.fill('input[name="username"]', `verify_test_${uniqueSuffix}`);
  await page.fill('input[name="email"]', `verify_test_${uniqueSuffix}@test.com`);
  await page.fill('input[name="password"]', 'Password123');
  const checkboxes = page.locator('input[type="checkbox"]');
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);
  const afterRegisterUrl = page.url();
  const afterRegisterText = await page.textContent('body');
  check('Register sonrası ana sayfaya YÖNLENDİRİLMİYOR (hâlâ /login\'de)', afterRegisterUrl.includes('/login'));
  check('Register sonrası "doğrulamadınız" kartı gösteriliyor', afterRegisterText.includes('doğrulamadınız'));

  await browser.close();

  console.log(`\n${passed} geçti, ${failed} başarısız`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
