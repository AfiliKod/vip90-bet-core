import { test, expect } from '@playwright/test';
import { login, logout, getBalance, getTestUser } from '../utils/auth-helpers.js';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
  });

  test('should login with valid credentials and show balance', async ({ page }) => {
    const user = getTestUser();
    await login(page, user);

    // Verify redirected to home/bahis
    await expect(page).toHaveURL(/\/bahis|\/canli|\//);

    // Verify balance displayed in navbar (format: ₺10000.00)
    const balance = await getBalance(page);
    expect(balance).toBeGreaterThanOrEqual(5000);
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.fill('input[placeholder="Kullanıcı adı"]', 'invalid_user');
    await page.fill('input[placeholder="Şifre"]', 'wrong_password');
    await page.click('button[type="submit"]');

    // Error toast with message "Kullanıcı adı veya şifre hatalı."
    await expect(page.locator('.toast').filter({ hasText: /Kullanıcı adı veya şifre hatalı/i })).toBeVisible({ timeout: 5000 });
  });

  test('should persist session on page reload', async ({ page }) => {
    const user = getTestUser();
    await login(page, user);

    const balanceBefore = await getBalance(page);

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should still be logged in
    const balanceAfter = await getBalance(page);
    expect(balanceAfter).toBe(balanceBefore);
  });

  test('should logout and clear session', async ({ page }) => {
    const user = getTestUser();
    await login(page, user);

    // Click user menu (avatar button with balance)
    await page.click('button:has-text("₺")');
    await page.waitForTimeout(300);

    // Click logout
    await page.click('text=Çıkış Yap');
    await page.waitForURL('**/login', { timeout: 10000 });

    // Should be on login page
    await expect(page).toHaveURL(/\/login/);

    // Try to access protected page
    await page.goto('/bahis');
    await expect(page).toHaveURL(/\/login/);
  });

  test('should redirect to login when accessing protected routes', async ({ page }) => {
    const protectedRoutes = ['/bahis', '/canli', '/casino', '/bahislerim', '/profil'];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/\/login/);
    }
  });
});