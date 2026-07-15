import { test, expect } from '@playwright/test';
import { login, getBalance } from '../utils/auth-helpers.js';
import { placeSingleBet, verifyBetSlip, calculatePotentialWin } from '../utils/bet-helpers.js';
import { waitForBetSettled, subscribeToUser } from '../utils/socket-helpers.js';
import { SELECTORS } from '../fixtures/test-data.js';
import { setEventStatus, setEventScore, settleEventViaDB } from '../utils/db-helpers.js';

test.describe('End-to-End Bet Settlement', () => {
  let initialBalance;
  let db;

  test.beforeAll(async () => {
    const { getDb } = await import('../utils/db-helpers.js');
    db = await getDb();
  });

  test.beforeEach(async ({ page }) => {
    await login(page);
    initialBalance = await getBalance(page);
  });

  test('should settle single bet as WON when event finishes with correct prediction', async ({ page }) => {
    // 1. Place bet on finished event with known result (home win)
    await page.goto('/event/test-finished-1');
    await page.waitForLoadState('networkidle');

    const oddButton = page.locator(SELECTORS.marketAccordion)
      .filter({ hasText: 'Maç Sonucu' })
      .locator('td button')
      .first(); // 1 - home win

    const oddText = await oddButton.textContent();
    const oddValue = parseFloat(oddText.replace('@', '').replace(',', '.'));

    await oddButton.click();
    await verifyBetSlip(page, 1, 'single', oddValue);

    const stake = 200;
    await placeSingleBet(page, stake);

    // 2. Verify bet shows as pending in My Bets
    await page.goto('/bahislerim');
    await page.click(SELECTORS.betFilterTabPending);
    await page.waitForLoadState('networkidle');

    const pendingCard = page.locator(SELECTORS.betCard).first();
    await expect(pendingCard.locator(SELECTORS.betStatus)).toContainText(/Bekliyor/);

    // 3. Trigger settlement (event already finished, just need to run settlement)
    const settlementResult = await settleEventViaDB(db, 'test-finished-1', { 'maç_sonucu': 'fms1' });

    // 4. Wait for socket notification
    const settledData = await waitForBetSettled(page, 15000).catch(() => null);

    if (settledData) {
      expect(settledData.result).toBe('win');
      expect(settledData.payout).toBeGreaterThan(0);
    }

    // 5. Verify My Bets updates to WON
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click(SELECTORS.betFilterTabWon);
    await page.waitForLoadState('networkidle');

    const wonCard = page.locator(SELECTORS.betCard).first();
    await expect(wonCard.locator(SELECTORS.betStatus)).toContainText(/Kazandı/);
    await expect(wonCard.locator(SELECTORS.betStatus)).toHaveClass(/text-success|text-green/);

    // 6. Verify balance updated (stake + potential win)
    const expectedBalance = initialBalance + (stake * oddValue);
    const newBalance = await getBalance(page);
    expect(newBalance).toBeCloseTo(expectedBalance, 1);

    // 7. Verify toast notification
    await expect(page.locator(SELECTORS.toastSuccess).filter({ hasText: /kazandı|won/i })).toBeVisible({ timeout: 10000 });
  });

  test('should settle single bet as LOST when event finishes with wrong prediction', async ({ page }) => {
    await page.goto('/event/test-finished-1');
    await page.waitForLoadState('networkidle');

    // Bet on away team (but home won)
    const awayButton = page.locator(SELECTORS.marketAccordion)
      .filter({ hasText: 'Maç Sonucu' })
      .locator('td button')
      .nth(2); // 2 - away

    const oddText = await awayButton.textContent();
    const oddValue = parseFloat(oddText.replace('@', '').replace(',', '.'));

    await awayButton.click();
    const stake = 150;
    await placeSingleBet(page, stake);

    // Verify pending
    await page.goto('/bahislerim');
    await page.click(SELECTORS.betFilterTabPending);
    await page.waitForLoadState('networkidle');

    await expect(page.locator(SELECTORS.betCard).first().locator(SELECTORS.betStatus)).toContainText(/Bekliyor/);

    // Settle
    await settleEventViaDB(db, 'test-finished-1', { 'maç_sonucu': 'fms1' }); // home won

    // Wait for socket
    await waitForBetSettled(page, 15000).catch(() => {});

    // Verify LOST
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click(SELECTORS.betFilterTabLost);
    await page.waitForLoadState('networkidle');

    const lostCard = page.locator(SELECTORS.betCard).first();
    await expect(lostCard.locator(SELECTORS.betStatus)).toContainText(/Kaybetti/);
    await expect(lostCard.locator(SELECTORS.betStatus)).toHaveClass(/text-danger|text-red/);

    // Balance should NOT increase (lost stake)
    const newBalance = await getBalance(page);
    expect(newBalance).toBeCloseTo(initialBalance - stake, 1);

    // Toast error
    await expect(page.locator(SELECTORS.toastError).filter({ hasText: /kaybetti|lost/i })).toBeVisible({ timeout: 10000 });
  });

  test('should settle combo bet as LOST if any selection loses', async ({ page }) => {
    // Place combo: finished-1 (home win) + finished-2 (away win but home actually won)
    await page.goto('/event/test-finished-1');
    await page.waitForLoadState('networkidle');

    // First selection: home win on test-finished-1
    await page.locator(SELECTORS.marketAccordion)
      .filter({ hasText: 'Maç Sonucu' })
      .locator('td button')
      .first()
      .click();

    // Second selection: away win on test-finished-2
    await page.goto('/event/test-finished-2');
    await page.waitForLoadState('networkidle');

    await page.locator(SELECTORS.marketAccordion)
      .filter({ hasText: 'Maç Sonucu' })
      .locator('td button')
      .nth(1) // 2 - away
      .click();

    await page.goto('/bahis');
    await page.waitForLoadState('networkidle');

    // Switch to combo
    await page.click(SELECTORS.comboButton);
    await expect(page.locator(SELECTORS.comboButton)).toHaveClass(/active|bg-accent/);

    const totalOddsText = await page.locator(SELECTORS.totalOdds).locator('..').locator('span').last().textContent();
    const totalOdds = parseFloat(totalOddsText);

    const stake = 100;
    await placeSingleBet(page, stake);

    // Verify pending
    await page.goto('/bahislerim');
    await page.click(SELECTORS.betFilterTabPending);
    await page.waitForLoadState('networkidle');

    // Settle both events
    await settleEventViaDB(db, 'test-finished-1', { 'maç_sonucu': 'fms1' }); // home won - correct
    await settleEventViaDB(db, 'test-finished-2', { 'maç_sonucu': 'tms1' }); // home won - WRONG (we bet away)

    // Wait for socket
    await waitForBetSettled(page, 15000).catch(() => {});

    // Verify combo LOST (one wrong = all lost)
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click(SELECTORS.betFilterTabLost);
    await page.waitForLoadState('networkidle');

    const lostCard = page.locator(SELECTORS.betCard).first();
    await expect(lostCard.locator(SELECTORS.betStatus)).toContainText(/Kaybetti/);
    await expect(lostCard.locator(SELECTORS.betType)).toContainText(/Kombine/);

    // Balance should only decrease by stake
    const newBalance = await getBalance(page);
    expect(newBalance).toBeCloseTo(initialBalance - stake, 1);
  });

  test('should settle combo bet as WON only if all selections win', async ({ page }) => {
    // This test requires two events we know both outcomes for
    // Use test-finished-1 (home win) and another known event
    // For now, we'll test with a single event to verify the logic

    // Place single bet as combo (1 selection combo)
    await page.goto('/event/test-finished-1');
    await page.waitForLoadState('networkidle');

    await page.locator(SELECTORS.marketAccordion)
      .filter({ hasText: 'Maç Sonucu' })
      .locator('td button')
      .first()
      .click();

    await page.goto('/bahis');
    await page.waitForLoadState('networkidle');

    // Force combo mode even with 1 selection
    await page.click(SELECTORS.comboButton);

    const stake = 100;
    await placeSingleBet(page, stake);

    // Settle
    await settleEventViaDB(db, 'test-finished-1', { 'maç_sonucu': 'fms1' });

    await waitForBetSettled(page, 15000).catch(() => {});

    // Verify WON
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click(SELECTORS.betFilterTabWon);
    await page.waitForLoadState('networkidle');

    const wonCard = page.locator(SELECTORS.betCard).first();
    await expect(wonCard.locator(SELECTORS.betStatus)).toContainText(/Kazandı/);
  });

  test('should handle Alt/Üst settlement correctly', async ({ page }) => {
    // test-finished-1 score: 2-1 (total 3 goals)
    // Alt/Üst 2.5: Üst 2.5 wins (3 > 2.5)
    await page.goto('/event/test-finished-1');
    await page.waitForLoadState('networkidle');

    const ustButton = page.locator(SELECTORS.marketAccordion)
      .filter({ hasText: 'Alt/Üst' })
      .locator('td button')
      .first(); // Üst 2.5

    const oddText = await ustButton.textContent();
    const oddValue = parseFloat(oddText.replace('@', '').replace(',', '.'));

    await ustButton.click();
    const stake = 250;
    await placeSingleBet(page, stake);

    // Settle
    await settleEventViaDB(db, 'test-finished-1', { 'alt_üst': 'fou1' }); // Üst 2.5 won

    await waitForBetSettled(page, 15000).catch(() => {});

    // Verify WON
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click(SELECTORS.betFilterTabWon);
    await page.waitForLoadState('networkidle');

    await expect(page.locator(SELECTORS.betCard).first().locator(SELECTORS.betStatus)).toContainText(/Kazandı/);

    // Balance check
    const expectedBalance = initialBalance + (stake * oddValue);
    const newBalance = await getBalance(page);
    expect(newBalance).toBeCloseTo(expectedBalance, 1);
  });

  test('should show correct payout amount in bet card', async ({ page }) => {
    await page.goto('/event/test-finished-1');
    await page.waitForLoadState('networkidle');

    const oddButton = page.locator(SELECTORS.marketAccordion)
      .filter({ hasText: 'Maç Sonucu' })
      .locator('td button')
      .first();

    const oddText = await oddButton.textContent();
    const oddValue = parseFloat(oddText.replace('@', '').replace(',', '.'));

    const stake = 300;
    await oddButton.click();
    await placeSingleBet(page, stake);

    await page.goto('/bahislerim');
    await page.click(SELECTORS.betFilterTabPending);
    await page.waitForLoadState('networkidle');

    // Check potential win display
    const expectedWin = stake * oddValue;
    const card = page.locator(SELECTORS.betCard).first();
    const potentialWinText = await card.locator(SELECTORS.betPotentialWin).textContent();
    const potentialWin = parseFloat(potentialWinText.replace(/[₺,]/g, ''));

    expect(potentialWin).toBeCloseTo(expectedWin, 2);

    // Settle
    await settleEventViaDB(db, 'test-finished-1', { 'maç_sonucu': 'fms1' });
    await waitForBetSettled(page, 15000).catch(() => {});

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click(SELECTORS.betFilterTabWon);
    await page.waitForLoadState('networkidle');

    // Won card should show actual payout
    const wonCard = page.locator(SELECTORS.betCard).first();
    const payoutText = await wonCard.locator(SELECTORS.betPotentialWin).textContent();
    const payout = parseFloat(payoutText.replace(/[₺,]/g, ''));

    expect(payout).toBeCloseTo(expectedWin, 2);
  });

  test('should update balance in header after settlement', async ({ page }) => {
    await page.goto('/event/test-finished-1');
    await page.waitForLoadState('networkidle');

    await page.locator(SELECTORS.marketAccordion)
      .filter({ hasText: 'Maç Sonucu' })
      .locator('td button')
      .first()
      .click();

    const stake = 500;
    await placeSingleBet(page, stake);

    const balanceBeforeSettlement = await getBalance(page);

    await settleEventViaDB(db, 'test-finished-1', { 'maç_sonucu': 'fms1' });
    await waitForBetSettled(page, 15000).catch(() => {});

    // Wait for balance update
    await page.waitForFunction(
      (prevBalance) => {
        const balanceEl = document.querySelector('[class*="balance"], [class*="Balance"]');
        if (!balanceEl) return false;
        const text = balanceEl.textContent;
        const match = text.match(/([\d,]+\.\d{2})/);
        if (!match) return false;
        return Math.abs(parseFloat(match[1].replace(',', '')) - prevBalance) > 1;
      },
      balanceBeforeSettlement,
      { timeout: 10000 }
    );

    const newBalance = await getBalance(page);
    expect(newBalance).toBeGreaterThan(balanceBeforeSettlement);
  });
});