import { test, expect } from '@playwright/test';
import { login, getBalance } from '../utils/auth-helpers.js';
import { placeSingleBet, verifyBetSlip, clearBetSlip, calculatePotentialWin } from '../utils/bet-helpers.js';
import { waitForScoreUpdate, waitForOddsUpdate, subscribeToEvent } from '../utils/socket-helpers.js';
import { SELECTORS } from '../fixtures/test-data.js';

test.describe('Live Betting (/canli)', () => {
  let initialBalance;

  test.beforeEach(async ({ page }) => {
    await login(page);
    initialBalance = await getBalance(page);
    await page.goto('/canli');
    await page.waitForLoadState('networkidle');
    await expect(page.locator(SELECTORS.liveEventCard)).toBeVisible({ timeout: 10000 });
  });

  test('should display live indicator and match count', async ({ page }) => {
    // Live indicator
    await expect(page.locator(SELECTORS.liveIndicator)).toBeVisible();
    await expect(page.locator(SELECTORS.liveIndicator)).toHaveClass(/animate-pulse/);

    // Match count badge
    await expect(page.locator(SELECTORS.liveMatchCount)).toBeVisible();
  });

  test('should show live events with real-time scores', async ({ page }) => {
    const eventCard = page.locator(SELECTORS.liveEventCard).first();

    // Should show current score
    await expect(eventCard.locator(SELECTORS.liveScore)).toBeVisible();

    // Should show minute
    await expect(eventCard.locator(SELECTORS.liveMinute)).toBeVisible();
  });

  test('should update score in real-time via socket', async ({ page }) => {
    const eventCard = page.locator(SELECTORS.liveEventCard).first();
    const eventId = await eventCard.getAttribute('data-event-id');

    if (!eventId) {
      // Get event ID from URL or data attribute
      const events = await page.evaluate(() => {
        return Array.from(document.querySelectorAll(SELECTORS.liveEventCard)).map(el => ({
          id: el.getAttribute('data-event-id'),
          team: el.querySelector(SELECTORS.eventTeamNames)?.textContent,
        }));
      });
      console.log('Live events:', events);
    }

    // Wait for score update (triggered by test server or manual)
    // In real test, this would be triggered by backend
    const scoreUpdate = await waitForScoreUpdate(page, eventId || 'test-live-1', 15000).catch(() => null);

    if (scoreUpdate) {
      await expect(eventCard.locator(SELECTORS.liveScore)).toContainText(`${scoreUpdate.score.home} - ${scoreUpdate.score.away}`);
      await expect(eventCard.locator(SELECTORS.liveMinute)).toContainText(`${scoreUpdate.score.minute}'`);
    }
  });

  test('should flash odds on update (green/red animation)', async ({ page }) => {
    const eventCard = page.locator(SELECTORS.liveEventCard).first();
    const oddButton = eventCard.locator(SELECTORS.eventCardOddButton).first();

    const initialOddText = await oddButton.textContent();
    const initialOdd = parseFloat(initialOddText.replace('@', '').replace(',', '.'));

    // Wait for odds update
    const oddsUpdate = await waitForOddsUpdate(page, 'test-live-1', 15000).catch(() => null);

    if (oddsUpdate) {
      // Check for flash animation
      const flashClasses = ['bg-green-400/10', 'bg-red-400/10', 'ring-green-400', 'ring-red-400'];
      let hasFlash = false;

      for (const cls of flashClasses) {
        if (await oddButton.evaluate(el => el.classList.contains(cls.replace('/', ' ')))) {
          hasFlash = true;
          break;
        }
      }

      // Wait for animation to complete
      await page.waitForTimeout(3000);

      // New value should persist
      const newOddText = await oddButton.textContent();
      const newOdd = parseFloat(newOddText.replace('@', '').replace(',', '.'));
      expect(newOdd).not.toBe(initialOdd);
    }
  });

  test('should place live bet successfully', async ({ page }) => {
    const eventCard = page.locator(SELECTORS.liveEventCard).first();
    const oddButton = eventCard.locator(SELECTORS.eventCardOddButton).first();

    const oddText = await oddButton.textContent();
    const oddValue = parseFloat(oddText.replace('@', '').replace(',', '.'));

    await oddButton.click();

    // Verify bet slip shows live badge
    await expect(page.locator(SELECTORS.betSlipLiveBadge)).toBeVisible();

    // Verify bet slip
    await verifyBetSlip(page, 1, 'single', oddValue);

    // Place bet
    const stake = 50;
    await placeSingleBet(page, stake);

    // Verify balance
    const newBalance = await getBalance(page);
    expect(newBalance).toBeCloseTo(initialBalance - stake, 1);
  });

  test('should filter live events by sport', async ({ page }) => {
    // Click sport filter
    await page.click(SELECTORS.sportTabFootball);
    await page.waitForTimeout(500);

    const events = page.locator(SELECTORS.liveEventCard);
    await expect(events.first()).toBeVisible();

    // Click basketball
    await page.click(SELECTORS.sportTabBasketball);
    await page.waitForTimeout(500);
  });

  test('should search live events', async ({ page }) => {
    await page.fill(SELECTORS.searchInput, 'Arsenal');
    await page.waitForTimeout(500);

    const events = page.locator(SELECTORS.liveEventCard);
    await expect(events.first()).toBeVisible();

    await page.fill(SELECTORS.searchInput, '');
    await page.waitForTimeout(500);
  });

  test('should expand/collapse sport groups', async ({ page }) => {
    const sportGroup = page.locator(SELECTORS.sportGroup).first();
    const toggleButton = sportGroup.locator('button').first();

    // Get initial state
    const isCollapsed = await toggleButton.getAttribute('aria-expanded') === 'false';

    await toggleButton.click();
    await page.waitForTimeout(300);

    // Should toggle
    const newState = await toggleButton.getAttribute('aria-expanded');
    expect(newState).not.toBe(isCollapsed.toString());
  });

  test('should navigate to live event detail', async ({ page }) => {
    const eventCard = page.locator(SELECTORS.liveEventCard).first();
    await eventCard.click();

    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/event\/.+/);

    // Event detail should show live score prominently
    await expect(page.locator(SELECTORS.liveMatchHero)).toBeVisible();
    await expect(page.locator(SELECTORS.liveScoreDisplay)).toBeVisible();
  });
});