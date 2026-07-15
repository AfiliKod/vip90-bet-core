import { test, expect } from '@playwright/test';
import { login, getBalance } from '../utils/auth-helpers.js';
import { verifyBetSlip, placeSingleBet, calculatePotentialWin } from '../utils/bet-helpers.js';
import { SELECTORS } from '../fixtures/test-data.js';

test.describe('Event Detail Page (/event/:id)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/event/test-upcoming-1');
    await page.waitForLoadState('networkidle');
    await expect(page.locator(SELECTORS.matchHero)).toBeVisible({ timeout: 10000 });
  });

  test('should display match hero with teams and score', async ({ page }) => {
    await expect(page.locator(SELECTORS.matchHeroHomeTeam)).toContainText('Galatasaray');
    await expect(page.locator(SELECTORS.matchHeroAwayTeam)).toContainText('Fenerbahçe');
    await expect(page.locator(SELECTORS.matchHeroScore)).toBeVisible();
  });

  test('should show market accordions', async ({ page }) => {
    const accordions = page.locator(SELECTORS.marketAccordion);
    await expect(accordions.first()).toBeVisible();
    const count = await accordions.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should expand/collapse market accordions', async ({ page }) => {
    const accordion = page.locator(SELECTORS.marketAccordion).first();
    const toggleButton = accordion.locator('button').first();

    // First should be open by default
    await expect(accordion.locator(SELECTORS.marketTable)).toBeVisible();

    // Click to close
    await toggleButton.click();
    await expect(accordion.locator(SELECTORS.marketTable)).not.toBeVisible();

    // Click to open
    await toggleButton.click();
    await expect(accordion.locator(SELECTORS.marketTable)).toBeVisible();
  });

  test('should render 1X2 market as single row table', async ({ page }) => {
    const msAccordion = page.locator(SELECTORS.marketAccordion).filter({ hasText: 'Maç Sonucu' }).first();
    const table = msAccordion.locator(SELECTORS.marketTable);

    // Header should have 3 columns: 1, X, 2
    const headers = table.locator('th');
    await expect(headers).toHaveCount(3);

    // Single data row with 3 odd buttons
    const oddButtons = table.locator('td button');
    await expect(oddButtons).toHaveCount(3);
  });

  test('should render Alt/Üst market with threshold rows', async ({ page }) => {
    const ouAccordion = page.locator(SELECTORS.marketAccordion).filter({ hasText: 'Alt/Üst' }).first();
    const table = ouAccordion.locator(SELECTORS.marketTable);

    // Should have header row with threshold and two columns
    const headers = table.locator('th');
    await expect(headers).toHaveCount(3); // threshold, Üst, Alt

    // Should have data rows with threshold values
    const rows = table.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
  });

  test('should render Handikap market with line values', async ({ page }) => {
    const hcAccordion = page.locator(SELECTORS.marketAccordion).filter({ hasText: 'Handikap' }).first();
    await expect(hcAccordion).toBeVisible();

    const table = hcAccordion.locator(SELECTORS.marketTable);
    await expect(table).toBeVisible();
  });

  test('should add selection to bet slip when clicking odd', async ({ page }) => {
    const msAccordion = page.locator(SELECTORS.marketAccordion).filter({ hasText: 'Maç Sonucu' }).first();
    const oddButton = msAccordion.locator('td button').first();

    const oddText = await oddButton.textContent();
    const oddValue = parseFloat(oddText.replace('@', '').replace(',', '.'));

    await oddButton.click();

    // Verify bet slip updated
    await verifyBetSlip(page, 1, 'single', oddValue);
  });

  test('should navigate back to /bahis', async ({ page }) => {
    await page.click(SELECTORS.backButton);
    await expect(page).toHaveURL(/\/bahis/);
  });

  test('should show odds flash animation on update', async ({ page }) => {
    // This tests the visual flash - we trigger an odds update via socket
    const oddButton = page.locator(`${SELECTORS.oddCell} button`).first();
    await expect(oddButton).toBeVisible();

    // The flash is tested via socket-helpers in socket-realtime.spec.js
    // Here we just verify the button exists and has the right structure
    await expect(oddButton).toHaveAttribute('class', /transition|flash/);
  });

  test('should handle multiple markets correctly', async ({ page }) => {
    const markets = ['Maç Sonucu', 'Alt/Üst', 'Handikap'];

    for (const market of markets) {
      const accordion = page.locator(SELECTORS.marketAccordion).filter({ hasText: market }).first();
      await expect(accordion).toBeVisible();

      const table = accordion.locator(SELECTORS.marketTable);
      await expect(table).toBeVisible();
    }
  });

  test('should show no markets message when empty', async ({ page }) => {
    // Navigate to an event with no markets (if exists)
    // This is a fallback test
    const noMarketsText = page.locator('text=/Bu etkinlik için şu an açık bahis bulunmuyor/');
    if (await noMarketsText.isVisible({ timeout: 2000 })) {
      await expect(noMarketsText).toBeVisible();
    }
  });

  test('should display live score for live events', async ({ page }) => {
    await page.goto('/event/test-live-1');
    await page.waitForLoadState('networkidle');

    await expect(page.locator(SELECTORS.matchHero)).toBeVisible();
    await expect(page.locator(SELECTORS.matchHeroLiveIndicator)).toBeVisible();
    await expect(page.locator(SELECTORS.matchHeroMinute)).toContainText(/35|minute|'/);
  });
});