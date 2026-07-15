import { test, expect } from '@playwright/test';
import { login, logout, getBalance, register, getTestUser } from '../utils/auth-helpers.js';
import { SELECTORS } from '../fixtures/test-data.js';

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

    // Verify balance displayed
    const balance = await getBalance(page);
    expect(balance).toBeGreaterThanOrEqual(5000);
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.fill(SELECTORS.usernameInput, 'invalid_user');
    await page.fill(SELECTORS.passwordInput, 'wrong_password');
    await page.click(SELECTORS.submitButton);

    await expect(page.locator(SELECTORS.toastError)).toBeVisible({ timeout: 5000 });
    await expect(page.locator(SELECTORS.toastError).filter({ hasText: /hatalı|invalid|yanlış/i })).toBeVisible();
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

    // Logout
    await logout(page);

    // Should be on login page
    await expect(page).toHaveURL(/\/login/);

    // Try to access protected page
    await page.goto('/bahis');
    await expect(page).toHaveURL(/\/login/);
  });

  test('should register new user', async ({ page }) => {
    const timestamp = Date.now();
    const newUser = {
      username: `newuser_${timestamp}`,
      email: `newuser_${timestamp}@test.com`,
      password: 'password123',
    };

    await page.goto('/register');
    await page.waitForLoadState('networkidle');

    await page.fill('input[name="username"]', newUser.username);
    await page.fill('input[name="email"]', newUser.email);
    await page.fill('input[name="password"]', newUser.password);
    await page.fill('input[name="confirmPassword"], input[name="passwordConfirm"]', newUser.password);

    // Accept terms
    const termsCheckbox = page.locator('input[name="acceptedTerms"], input[name="terms"]');
    if (await termsCheckbox.isVisible({ timeout: 1000 })) {
      await termsCheckbox.check();
    }

    const kvkkCheckbox = page.locator('input[name="acceptedKvkk"], input[name="kvkk"]');
    if (await kvkkCheckbox.isVisible({ timeout: 1000 })) {
      await kvkkCheckbox.check();
    }

    await page.click(SELECTORS.submitButton);
    await page.waitForLoadState('networkidle');

    // Should redirect away from register
    await expect(page).not.toHaveURL(/\/register/);
  });

  test('should redirect to login when accessing protected routes', async ({ page }) => {
    const protectedRoutes = ['/bahis', '/canli', '/casino', '/bahislerim', '/profil'];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test('should remember me with valid token', async ({ page }) => {
    const user = getTestUser();
    await login(page, user);

    // Close and reopen browser context (simulated by reload)
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should still be logged in
    const balance = await getBalance(page);
    expect(balance).toBeGreaterThan(0);
  });
});