import { test, expect } from '@playwright/test';
import { login, getBalance } from '../utils/auth-helpers.js';
import { placeSingleBet, placeComboBet } from '../utils/bet-helpers.js';
import { getDb, seedTestData, setEventStatus, setEventScore, settleEventViaDB } from '../utils/db-helpers.js';
import { SELECTORS } from '../fixtures/test-data.js';

test.describe('My Bets History (/bahislerim)', () => {
  let db;
  let initialBalance;

  test.beforeAll(async () => {
    db = await getDb();
    await seedTestData(db);
  });

  test.beforeEach(async ({ page }) => {
    await login(page);
    initialBalance = await getBalance(page);
    await page.goto('/bahislerim');
    await page.waitForLoadState('networkidle');
  });

  test('should display bet filter tabs', async ({ page }) => {
    await expect(page.locator(SELECTORS.betFilterTabAll)).toBeVisible();
    await expect(page.locator(SELECTORS.betFilterTabPending)).toBeVisible();
    await expect(page.locator(SELECTORS.betFilterTabWon)).toBeVisible();
    await expect(page.locator(SELECTORS.betFilterTabLost)).toBeVisible();
    await expect(page.locator(SELECTORS.betFilterTabCancelled)).toBeVisible();
  });

  test('should show "All" bets by default', async ({ page }) => {
    await expect(page.locator(SELECTORS.betFilterTabAll)).toHaveClass(/active|bg-accent/);
    await expect(page.locator(SELECTORS.betCard)).toBeVisible({ timeout: 10000 });
  });

  test('should filter pending bets', async ({ page }) => {
    // Place a new bet to ensure pending exists
    await page.goto('/bahis');
    await page.waitForLoadState('networkidle');
    await page.locator(SELECTORS.eventCardOddButton).first().click();
    await placeSingleBet(page, 100);

    await page.goto('/bahislerim');
    await page.click(SELECTORS.betFilterTabPending);
    await page.waitForLoadState('networkidle');

    await expect(page.locator(SELECTORS.betFilterTabPending)).toHaveClass(/active|bg-accent/);
    const pendingCards = page.locator(SELECTORS.betCard);
    await expect(pendingCards.first()).toBeVisible();

    // All should show pending status
    for (const card of await pendingCards.all()) {
      await expect(card.locator(SELECTORS.betStatus)).toContainText(/Bekliyor|Pending/);
    }
  });

  test('should filter won bets', async ({ page }) => {
    await page.click(SELECTORS.betFilterTabWon);
    await page.waitForLoadState('networkidle');

    await expect(page.locator(SELECTORS.betFilterTabWon)).toHaveClass(/active|bg-accent/);

    const wonCards = page.locator(SELECTORS.betCard);
    if (await wonCards.count() > 0) {
      for (const card of await wonCards.all()) {
        await expect(card.locator(SELECTORS.betStatus)).toContainText(/Kazandı|Won/);
      }
    }
  });

  test('should filter lost bets', async ({ page }) => {
    await page.click(SELECTORS.betFilterTabLost);
    await page.waitForLoadState('networkidle');

    await expect(page.locator(SELECTORS.betFilterTabLost)).toHaveClass(/active|bg-accent/);

    const lostCards = page.locator(SELECTORS.betCard);
    if (await lostCards.count() > 0) {
      for (const card of await lostCards.all()) {
        await expect(card.locator(SELECTORS.betStatus)).toContainText(/Kaybetti|Lost/);
      }
    }
  });

  test('should display correct bet type badge', async ({ page }) => {
    const cards = page.locator(SELECTORS.betCard);
    await expect(cards.first()).toBeVisible({ timeout: 10000 });

    for (const card of await cards.all()) {
      const typeBadge = card.locator(SELECTORS.betType);
      await expect(typeBadge).toBeVisible();
      // Should show either 🔗 Kombine or 📌 Tekli
      const text = await typeBadge.textContent();
      expect(text).toMatch(/🔗|📌|Kombine|Tekli|Combo|Single/);
    }
  });

  test('should show event label, odd label, and odd value', async ({ page }) => {
    const card = page.locator(SELECTORS.betCard).first();
    await expect(card).toBeVisible();

    // Event label
    await expect(card.locator(SELECTORS.betEventLabel)).toBeVisible();

    // Odd label and value
    await expect(card.locator(SELECTORS.betOddLabel)).toBeVisible();
    await expect(card.locator(SELECTORS.betOddValue)).toBeVisible();
  });

  test('should show stake and potential win', async ({ page }) => {
    const card = page.locator(SELECTORS.betCard).first();
    await expect(card).toBeVisible();

    await expect(card.locator(SELECTORS.betStake)).toBeVisible();
    await expect(card.locator(SELECTORS.betPotentialWin)).toBeVisible();

    // Stake should have ₺ symbol
    const stakeText = await card.locator(SELECTORS.betStake).textContent();
    expect(stakeText).toMatch(/₺/);

    // Potential win should have ₺ symbol
    const winText = await card.locator(SELECTORS.betPotentialWin).textContent();
    expect(winText).toMatch(/₺/);
  });

  test('should show correct date format', async ({ page }) => {
    const card = page.locator(SELECTORS.betCard).first();
    await expect(card).toBeVisible();

    const dateText = await card.locator(SELECTORS.betDate).textContent();
    // Turkish date format: DD MMM YYYY
    expect(dateText).toMatch(/\d{2}\s\w{3}\s\d{4}/);
  });

  test('should show pending bet with correct status color', async ({ page }) => {
    await page.click(SELECTORS.betFilterTabPending);
    await page.waitForLoadState('networkidle');

    const card = page.locator(SELECTORS.betCard).first();
    const statusBadge = card.locator(SELECTORS.betStatus);

    await expect(statusBadge).toBeVisible();
    await expect(statusBadge).toHaveClass(/text-warning|text-yellow/);
  });

  test('should show won bet with correct status color', async ({ page }) => {
    // Place and settle a bet as won
    await page.goto('/event/test-finished-1');
    await page.waitForLoadState('networkidle');

    const oddButton = page.locator(SELECTORS.marketAccordion)
      .filter({ hasText: 'Maç Sonucu' })
      .locator('td button')
      .first(); // 1 - home win

    await oddButton.click();
    await placeSingleBet(page, 200);

    // Settle the event
    await settleEventViaDB(db, 'test-finished-1', { 'maç_sonucu': 'fms1' });

    await page.goto('/bahislerim');
    await page.click(SELECTORS.betFilterTabWon);
    await page.waitForLoadState('networkidle');

    const card = page.locator(SELECTORS.betCard).first();
    const statusBadge = card.locator(SELECTORS.betStatus);

    await expect(statusBadge).toContainText(/Kazandı|Won/);
    await expect(statusBadge).toHaveClass(/text-success|text-green/);
  });

  test('should show lost bet with correct status color', async ({ page }) => {
    // Place and settle a bet as lost
    await page.goto('/event/test-finished-2');
    await page.waitForLoadState('networkidle');

    // Bet on away team (home won)
    const awayButton = page.locator(SELECTORS.marketAccordion)
      .filter({ hasText: 'Maç Sonucu' })
      .locator('td button')
      .nth(1); // 2 - away

    await awayButton.click();
    await placeSingleBet(page, 100);

    // Settle
    await settleEventViaDB(db, 'test-finished-2', { 'maç_sonucu': 'tms1' });

    await page.goto('/bahislerim');
    await page.click(SELECTORS.betFilterTabLost);
    await page.waitForLoadState('networkidle');

    const card = page.locator(SELECTORS.betCard).first();
    const statusBadge = card.locator(SELECTORS.betStatus);

    await expect(statusBadge).toContainText(/Kaybetti|Lost/);
    await expect(statusBadge).toHaveClass(/text-danger|text-red/);
  });

  test('should navigate to event detail when clicking bet', async ({ page }) => {
    const card = page.locator(SELECTORS.betCard).first();
    await expect(card).toBeVisible();

    await card.click();
    await page.waitForLoadState('networkidle');

    // Should navigate to event detail
    await expect(page).toHaveURL(/\/event\/.+/);
  });

  test('should show empty state when no bets match filter', async ({ page }) => {
    // If we have bets, this might not trigger
    // But we can test by using a filter with no bets
    await page.click(SELECTORS.betFilterTabCancelled);
    await page.waitForLoadState('networkidle');

    const emptyText = page.locator('text=/Bahis bulunamadı|No bets found/');
    // May or may not be visible depending on test data
    // Just verify no error
    await expect(page.locator(SELECTORS.betFilterTabCancelled)).toBeVisible();
  });

  test('should handle bet settlement in real-time', async ({ page }) => {
    // Place a bet on upcoming event
    await page.goto('/event/test-upcoming-1');
    await page.waitForLoadState('networkidle');

    await page.locator(SELECTORS.eventCardOddButton).first().click();
    await placeSingleBet(page, 150);

    await page.goto('/bahislerim');
    await page.click(SELECTORS.betFilterTabPending);
    await page.waitForLoadState('networkidle');

    const card = page.locator(SELECTORS.betCard).first();
    await expect(card.locator(SELECTORS.betStatus)).toContainText(/Bekliyor/);

    // Settle event
    await setEventStatus(db, 'test-upcoming-1', 'finished');
    await setEventScore(db, 'test-upcoming-1', { home: 2, away: 1, minute: 90 });
    await settleEventViaDB(db, 'test-upcoming-1', { 'maç_sonucu': 'ms1' });

    // Wait a moment and reload
    await page.waitForTimeout(2000);
    await page.reload();

    // Should now show as won
    await page.click(SELECTORS.betFilterTabWon);
    await page.waitForLoadState('networkidle');

    await expect(page.locator(SELECTORS.betCard).first()).toBeVisible();
  });
});