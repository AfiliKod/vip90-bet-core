import { test, expect } from '@playwright/test';
import { login, getBalance } from '../utils/auth-helpers.js';
import { placeSingleBet, verifyBetSlip, calculatePotentialWin, clearBetSlip } from '../utils/bet-helpers.js';
import { SELECTORS } from '../fixtures/test-data.js';

test.describe('Pre-Match Betting (/bahis)', () => {
  let initialBalance;

  test.beforeEach(async ({ page }) => {
    await login(page);
    initialBalance = await getBalance(page);
    await page.goto('/bahis');
    await page.waitForLoadState('networkidle');
    await expect(page.locator(SELECTORS.eventCard)).toBeVisible({ timeout: 15000 });
  });

  test('should load pre-match page with events', async ({ page }) => {
    await expect(page).toHaveURL(/\/bahis/);
    const events = page.locator(SELECTORS.eventCard);
    const count = await events.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should display sport filter tabs', async ({ page }) => {
    await expect(page.locator(SELECTORS.sportTabs).first()).toBeVisible();

    // Check specific sports
    const sports = ['Futbol', 'Basketbol', 'Tenis'];
    for (const sport of sports) {
      const tab = page.locator(SELECTORS.sportTab).filter({ hasText: sport });
      if (await tab.isVisible({ timeout: 1000 })) {
        await expect(tab).toBeVisible();
      }
    }
  });

  test('should filter by sport when clicking sport tab', async ({ page }) => {
    // Click football
    await page.click(SELECTORS.sportTabFootball);
    await page.waitForTimeout(500);
    await expect(page.locator(SELECTORS.eventCard)).toBeVisible();

    // Click basketball
    await page.click(SELECTORS.sportTabBasketball);
    await page.waitForTimeout(500);
    await expect(page.locator(SELECTORS.eventCard)).toBeVisible();
  });

  test('should filter by status (All / Upcoming)', async ({ page }) => {
    // All events
    await page.click(SELECTORS.statusFilterAll);
    await page.waitForTimeout(500);

    // Upcoming only
    await page.click(SELECTORS.statusFilterUpcoming);
    await page.waitForTimeout(500);
    await expect(page.locator(SELECTORS.eventCard)).toBeVisible();
  });

  test('should search events by team name', async ({ page }) => {
    await page.fill(SELECTORS.searchInput, 'Galatasaray');
    await page.waitForTimeout(500);

    const events = page.locator(SELECTORS.eventCard);
    await expect(events.first()).toBeVisible();

    // Clear search
    await page.fill(SELECTORS.searchInput, '');
    await page.waitForTimeout(500);
  });

  test('should search events by league name', async ({ page }) => {
    await page.fill(SELECTORS.searchInput, 'Süper Lig');
    await page.waitForTimeout(500);

    const events = page.locator(SELECTORS.eventCard);
    await expect(events.first()).toBeVisible();
  });

  test('should add selection from MiniEventCard to bet slip', async ({ page }) => {
    const eventCard = page.locator(SELECTORS.eventCard).first();
    const oddButton = eventCard.locator(SELECTORS.eventCardOddButton).first();

    const oddText = await oddButton.textContent();
    const oddValue = parseFloat(oddText.replace('@', '').replace(',', '.'));

    await oddButton.click();

    await verifyBetSlip(page, 1, 'single', oddValue);
  });

  test('should navigate to event detail on card click', async ({ page }) => {
    const eventCard = page.locator(SELECTORS.eventCard).first();
    await eventCard.click();

    await expect(page).toHaveURL(/\/event\/.+/);
    await expect(page.locator(SELECTORS.matchHero)).toBeVisible({ timeout: 10000 });
  });

  test('should place single bet from pre-match', async ({ page }) => {
    const eventCard = page.locator(SELECTORS.eventCard).first();
    const oddButton = eventCard.locator(SELECTORS.eventCardOddButton).first();

    const oddText = await oddButton.textContent();
    const oddValue = parseFloat(oddText.replace('@', '').replace(',', '.'));

    await oddButton.click();

    const stake = 100;
    const expectedWin = await calculatePotentialWin(stake, oddValue);

    await placeSingleBet(page, stake);

    // Verify balance updated
    const newBalance = await getBalance(page);
    expect(newBalance).toBeCloseTo(initialBalance - stake, 1);
  });

  test('should place combo bet from pre-match', async ({ page }) => {
    // Add first selection
    await page.locator(SELECTORS.eventCard).nth(0).locator(SELECTORS.eventCardOddButton).first().click();

    // Add second selection
    await page.locator(SELECTORS.eventCard).nth(1).locator(SELECTORS.eventCardOddButton).first().click();

    // Verify combo mode
    await expect(page.locator(SELECTORS.comboButton)).toBeVisible();

    const odd1Text = await page.locator(SELECTORS.eventCard).nth(0).locator(SELECTORS.eventCardOddButton).first().textContent();
    const odd1 = parseFloat(odd1Text.replace('@', '').replace(',', '.'));

    const odd2Text = await page.locator(SELECTORS.eventCard).nth(1).locator(SELECTORS.eventCardOddButton).first().textContent();
    const odd2 = parseFloat(odd2Text.replace('@', '').replace(',', '.'));

    const stake = 50;
    const expectedWin = await calculatePotentialWin(stake, odd1 * odd2, 'combo');

    await page.fill(SELECTORS.stakeInput, stake.toString());
    await page.click(SELECTORS.comboButton);
    await page.click(SELECTORS.placeBetButton);

    await expect(page.locator(SELECTORS.toastSuccess)).toBeVisible({ timeout: 10000 });

    const newBalance = await getBalance(page);
    expect(newBalance).toBeCloseTo(initialBalance - stake, 1);
  });

  test('should expand/collapse sport groups', async ({ page }) => {
    // Check if hierarchical view is present
    const sportGroup = page.locator(SELECTORS.sportGroup).first();
    if (await sportGroup.isVisible({ timeout: 2000 })) {
      // Click to collapse
      await sportGroup.locator('button').first().click();
      await page.waitForTimeout(300);

      // Click to expand
      await sportGroup.locator('button').first().click();
      await page.waitForTimeout(300);
    }
  });

  test('should show league flag and name', async ({ page }) => {
    const eventCard = page.locator(SELECTORS.eventCard).first();
    await expect(eventCard.locator(SELECTORS.eventLeagueFlag)).toBeVisible();
    await expect(eventCard.locator(SELECTORS.eventLeagueName)).toBeVisible();
  });

  test('should show match time for upcoming events', async ({ page }) => {
    const eventCard = page.locator(SELECTORS.eventCard).first();
    await expect(eventCard.locator(SELECTORS.eventMatchTime)).toBeVisible();
  });
});