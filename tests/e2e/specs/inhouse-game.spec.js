import { test, expect } from '@playwright/test';

/**
 * In-house oyun açılış akışı (2026-10-08).
 *
 * Bu spec'in amacı uçtan uca bir bahis oynamak DEĞİL (para hareketi gerektirir,
 * test veritabanında bilinçli olarak yapılmaz); kapatılan risklerden biri
 * "in-house oyunların hiç e2e kapsamı yok"tı. Buradaki kapı, sunucu tarafında
 * eklenen 18+ kapısının istemciye doğru taşınması:
 *
 *   1. launch 403 AGE_CONFIRMATION_REQUIRED → 18+ onay ekranı
 *   2. onay POST /auth/age-confirm → launch tekrar denenir
 *   3. yetersiz bakiye → InsufficientBalanceScreen (mevcut davranış korunur)
 *   4. oyun URL'si gelirse iframe src'e yazılır
 *
 * provider/launch yanıtı route ile taklit edilir; gerçek HMAC/para yolu
 * çalıştırılmaz.
 */

const GAME = 'dice';

test.describe('In-house oyun açılışı', () => {
  test.beforeEach(async ({ page }) => {
    // Test kullanıcısıyla oturum aç (yardımcılar: tests/e2e/utils/auth-helpers.js)
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
  });

  test('18+ onayı yoksa onay ekranını gösterir ve onaydan sonra oyunu açar', async ({ page }) => {
    let confirmCalls = 0;
    let launchCalls = 0;

    await page.route('**/api/inhouse-provider/launch', async (route) => {
      launchCalls += 1;
      if (confirmCalls === 0) {
        // Sunucudaki kapının birebir karşılığı
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'AGE_CONFIRMATION_REQUIRED', error: 'Casino oyunlarına erişmek için 18 yaşından büyük olduğunu onaylamalısın' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: '/games-host-placeholder/index.html?token=stub' }),
      });
    });

    await page.route('**/api/auth/age-confirm', async (route) => {
      confirmCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'ok', ageConfirmedAt: new Date().toISOString(), verified: false, ageConsent: true }),
      });
    });

    await page.goto(`/games/${GAME}`);
    await page.waitForLoadState('networkidle');

    // 1) 18+ onay ekranı
    await expect(page.getByRole('button', { name: /18 yaşından büyük olduğumu onaylıyorum/i })).toBeVisible();
    expect(launchCalls).toBeGreaterThanOrEqual(1);

    // 2) onay → launch yeniden denenir ve iframe yazılır
    await page.getByRole('button', { name: /18 yaşından büyük olduğumu onaylıyorum/i }).click();
    await expect(page.locator('iframe')).toHaveAttribute('src', /games-host-placeholder/, { timeout: 15_000 });
    expect(confirmCalls).toBe(1);
    expect(launchCalls).toBe(2);
  });

  test('yetersiz bakiye ekranı gösterilir (mevcut davranış bozulmadı)', async ({ page }) => {
    await page.route('**/api/inhouse-provider/launch', (route) => route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'INSUFFICIENT_BALANCE', error: 'Yetersiz bakiye' }),
    }));

    await page.goto(`/games/${GAME}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/yetersiz bakiye/i).first()).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
  });

  test('bilinmeyen oyun kimliği 404 sayfasına düşer (gerçek 404 altyapısı)', async ({ page }) => {
    const res = await page.goto('/games/boyle-bir-oyun-yok');
    expect(res?.status()).toBe(404);
    await expect(page.locator('body')).toContainText(/404|bulunamadı|not found/i);
  });
});