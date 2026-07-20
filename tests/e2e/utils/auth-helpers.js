import { getDb, getUserByEmail } from './db-helpers.js';

export async function login(page, usernameOrEmail = 'testuser', password = 'password123') {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // Handle both string and object credentials
  const username = typeof usernameOrEmail === 'object' ? usernameOrEmail.username : usernameOrEmail;
  const pwd = typeof usernameOrEmail === 'object' ? usernameOrEmail.password : password;

  // Fill login form - use the placeholder selectors
  await page.fill('input[placeholder="Kullanıcı adı"]', username);
  await page.fill('input[placeholder="Şifre"]', pwd);

  // Submit
  await page.click('button[type="submit"]');

  // Wait for redirect (goes to "/" for regular users)
  await page.waitForURL('**/', { timeout: 30000 });
  await page.waitForLoadState('networkidle');

  // Verify logged in by checking balance in header (the avatar button shows balance)
  await expect(page.locator('button:has-text("₺")')).toBeVisible({ timeout: 10000 });
}

export async function register(page, userData = {}) {
  const defaults = {
    username: `testuser_${Date.now()}`,
    email: `test_${Date.now()}@betzone.test`,
    password: 'password123',
    acceptedTerms: true,
    acceptedKvkk: true,
    consentVersion: '1.0',
  };
  const data = { ...defaults, ...userData };

  await page.goto('/register');
  await page.waitForLoadState('networkidle');

  await page.fill('input[name="username"]', data.username);
  await page.fill('input[name="email"]', data.email);
  await page.fill('input[name="password"]', data.password);

  if (data.acceptedTerms) {
    await page.check('input[name="acceptedTerms"]');
  }
  if (data.acceptedKvkk) {
    await page.check('input[name="acceptedKvkk"]');
  }

  await page.click('button[type="submit"]');

  // Wait for redirect or verification page
  await page.waitForLoadState('networkidle');

  return data;
}

export async function logout(page) {
  // Click user menu and logout
  await page.click('[class*="user-menu"], [class*="avatar"], button:has-text("Çıkış")');
  await page.click('text=Çıkış, text=Logout');
  await page.waitForURL('**/login', { timeout: 10000 });
}

export async function getBalance(page) {
  // Try multiple selectors for balance display
  const balanceSelectors = [
    '[class*="balance"]',
    '[class*="Balance"]',
    'text=/₺\\s*[\\d,]+\\.\\d{2}/',
    'text=/[\\d,]+\\.\\d{2}\\s*₺/',
  ];

  for (const selector of balanceSelectors) {
    const element = page.locator(selector).first();
    if (await element.isVisible({ timeout: 1000 })) {
      const text = await element.textContent();
      const match = text.match(/([\\d,]+\\.\\d{2})/);
      if (match) {
        return parseFloat(match[1].replace(',', ''));
      }
    }
  }

  // Fallback: get from API
  const response = await page.request.get('/api/users/me');
  if (response.ok()) {
    const data = await response.json();
    return data.user?.balance || 0;
  }

  return 0;
}

export async function getAuthToken(page) {
  return page.evaluate(() => localStorage.getItem('accessToken'));
}

export async function setAuthToken(page, token) {
  await page.evaluate((t) => localStorage.setItem('accessToken', t), token);
}

export async function clearAuth(page) {
  await page.evaluate(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  });
}

export async function ensureLoggedIn(page, username = 'testuser', password = 'password123') {
  const token = await getAuthToken(page);
  if (!token) {
    await login(page, username, password);
    return;
  }

  // Verify token is still valid
  const response = await page.request.get('/api/auth/refresh', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok()) {
    await login(page, username, password);
  }
}

export async function createTestUser(db, userData = {}) {
  const defaults = {
    email: `test-${Date.now()}@betzone.test`,
    username: `testuser_${Date.now()}`,
    password: '$2a$10$testhash',
    balance: 10000,
    bonusBalance: 0,
    emailVerified: true,
    isActive: true,
  };
  return getDb().then(db => db.collection('users').insertOne({ ...defaults, ...userData }));
}

export function getTestUser() {
  return {
    username: 'testuser-fresh',
    email: 'test-fresh@betzone.test',
    password: 'password123',
  };
}