import { test, expect } from '@playwright/test';
import { login, getBalance } from '../utils/auth-helpers.js';
import {
  placeSingleBet,
  verifyBetSlip,
  calculatePotentialWin,
  clearBetSlip,
  verifyMinStakeValidation,
  verifyInsufficientBalance,
  switchToSingle,
  switchToCombo,
  getBetSlipTotalOdds,
  getBetSlipPotentialWin,
} from '../utils/bet-helpers.js';
import { SELECTORS } from '../fixtures/test-data.js';

test.describe('BetSlip Component', () => {
  let initialBalance;

  test.beforeEach(async ({ page }) => {
    await login(page);
    initialBalance = await getBalance(page);
    await page.goto('/bahis');
    await page.waitForLoadState('networkidle');
    await expect(page.locator(SELECTORS.eventCard)).toBeVisible({ timeout: 10000 });
  });

  test('should show empty state when no selections', async ({ page }) => {
    // Ensure bet slip is empty
    await clearBetSlip(page);

    await expect(page.locator(SELECTORS.emptyBetSlip)).toBeVisible();
    await expect(page.locator(SELECTORS.emptyBetSlip)).toContainText(/boş|empty/i);
  });

  test('should show selection count in title', async ({ page }) => {
    const eventCard = page.locator(SELECTORS.eventCard).first();
    const oddButton = eventCard.locator(SELECTORS.eventCardOddButton).first();
    await oddButton.click();

    await expect(page.locator(SELECTORS.betSlipCount)).toContainText('1');

    // Add another
    const eventCard2 = page.locator(SELECTORS.eventCard).nth(1);
    const oddButton2 = eventCard2.locator(SELECTORS.eventCardOddButton).first();
    await oddButton2.click();

    await expect(page.locator(SELECTORS.betSlipCount)).toContainText('2');
  });

  test('should display single bet mode by default', async ({ page }) => {
    const eventCard = page.locator(SELECTORS.eventCard).first();
    const oddButton = eventCard.locator(SELECTORS.eventCardOddButton).first();
    await oddButton.click();

    await expect(page.locator(SELECTORS.singleButton)).toHaveClass(/active|bg-accent/);
    await expect(page.locator(SELECTORS.comboButton)).not.toHaveClass(/active|bg-accent/);
  });

  test('should switch to combo mode with multiple selections', async ({ page }) => {
    // Add 2 selections
    await page.locator(SELECTORS.eventCard).nth(0).locator(SELECTORS.eventCardOddButton).first().click();
    await page.locator(SELECTORS.eventCard).nth(1).locator(SELECTORS.eventCardOddButton).first().click();

    // Combo button should be available
    await expect(page.locator(SELECTORS.comboButton)).toBeVisible();

    // Switch to combo
    await switchToCombo(page);

    await expect(page.locator(SELECTORS.comboButton)).toHaveClass(/active|bg-accent/);
    await expect(page.locator(SELECTORS.comboButton)).toContainText(/Kombine.*2/);
  });

  test('should calculate total odds correctly for single', async ({ page }) => {
    const eventCard = page.locator(SELECTORS.eventCard).first();
    const oddButton = eventCard.locator(SELECTORS.eventCardOddButton).first();

    const oddText = await oddButton.textContent();
    const oddValue = parseFloat(oddText.replace('@', '').replace(',', '.'));

    await oddButton.click();

    const totalOdds = await getBetSlipTotalOdds(page);
    expect(totalOdds).toBeCloseTo(oddValue, 2);
  });

  test('should calculate total odds correctly for combo', async ({ page }) => {
    // Add first selection
    const oddButton1 = page.locator(SELECTORS.eventCard).nth(0).locator(SELECTORS.eventCardOddButton).first();
    const oddText1 = await oddButton1.textContent();
    const oddValue1 = parseFloat(oddText1.replace('@', '').replace(',', '.'));

    await oddButton1.click();

    // Add second selection
    const oddButton2 = page.locator(SELECTORS.eventCard).nth(1).locator(SELECTORS.eventCardOddButton).first();
    const oddText2 = await oddButton2.textContent();
    const oddValue2 = parseFloat(oddText2.replace('@', '').replace(',', '.'));

    await oddButton2.click();

    // Switch to combo
    await switchToCombo(page);

    const totalOdds = await getBetSlipTotalOdds(page);
    const expectedTotal = oddValue1 * oddValue2;

    expect(totalOdds).toBeCloseTo(expectedTotal, 2);
  });

  test('should calculate potential win correctly', async ({ page }) => {
    const eventCard = page.locator(SELECTORS.eventCard).first();
    const oddButton = eventCard.locator(SELECTORS.eventCardOddButton).first();

    const oddText = await oddButton.textContent();
    const oddValue = parseFloat(oddText.replace('@', '').replace(',', '.'));

    await oddButton.click();

    const stake = 150;
    await page.fill(SELECTORS.stakeInput, stake.toString());

    const expectedWin = await calculatePotentialWin(stake, oddValue);
    const actualWin = await getBetSlipPotentialWin(page);

    expect(actualWin).toBeCloseTo(expectedWin, 2);
  });

  test('should calculate combo potential win correctly', async ({ page }) => {
    // Add 2 selections
    await page.locator(SELECTORS.eventCard).nth(0).locator(SELECTORS.eventCardOddButton).first().click();
    await page.locator(SELECTORS.eventCard).nth(1).locator(SELECTORS.eventCardOddButton).first().click();

    await switchToCombo(page);

    const totalOdds = await getBetSlipTotalOdds(page);
    const stake = 100;

    await page.fill(SELECTORS.stakeInput, stake.toString());

    const expectedWin = await calculatePotentialWin(stake, totalOdds, 'combo');
    const actualWin = await getBetSlipPotentialWin(page);

    expect(actualWin).toBeCloseTo(expectedWin, 2);
  });

  test('should clear all selections', async ({ page }) => {
    await page.locator(SELECTORS.eventCard).nth(0).locator(SELECTORS.eventCardOddButton).first().click();
    await page.locator(SELECTORS.eventCard).nth(1).locator(SELECTORS.eventCardOddButton).first().click();

    await clearBetSlip(page);

    await expect(page.locator(SELECTORS.emptyBetSlip)).toBeVisible();
    await expect(page.locator(SELECTORS.betSlipCount).filter({ hasText: '0' })).toBeVisible();
  });

  test('should remove individual selection', async ({ page }) => {
    await page.locator(SELECTORS.eventCard).nth(0).locator(SELECTORS.eventCardOddButton).first().click();
    await page.locator(SELECTORS.eventCard).nth(1).locator(SELECTORS.eventCardOddButton).first().click();

    // Remove first selection
    const removeButtons = page.locator(SELECTORS.selectionItem).locator('button:has-text("✕"), button:has-text("×")');
    await removeButtons.first().click();

    await expect(page.locator(SELECTORS.betSlipCount)).toContainText('1');
  });

  test('should validate minimum stake (1₺)', async ({ page }) => {
    const eventCard = page.locator(SELECTORS.eventCard).first();
    const oddButton = eventCard.locator(SELECTORS.eventCardOddButton).first();
    await oddButton.click();

    await verifyMinStakeValidation(page, 0.5);
  });

  test('should show error for stake below minimum', async ({ page }) => {
    const eventCard = page.locator(SELECTORS.eventCard).first();
    const oddButton = eventCard.locator(SELECTORS.eventCardOddButton).first();
    await oddButton.click();

    await page.fill(SELECTORS.stakeInput, '0');
    await page.click(SELECTORS.placeBetButton);

    await expect(page.locator(SELECTORS.toastWarning)).toContainText(/Minimum.*1/);
  });

  test('should show error for insufficient balance', async ({ page }) => {
    const eventCard = page.locator(SELECTORS.eventCard).first();
    const oddButton = eventCard.locator(SELECTORS.eventCardOddButton).first();
    await oddButton.click();

    await verifyInsufficientBalance(page, 999999);
  });

  test('should show selection details correctly', async ({ page }) => {
    const eventCard = page.locator(SELECTORS.eventCard).first();
    const teamText = await eventCard.locator(SELECTORS.eventTeamNames).first().textContent();
    const oddButton = eventCard.locator(SELECTORS.eventCardOddButton).first();
    const oddText = await oddButton.textContent();
    const oddValue = parseFloat(oddText.replace('@', '').replace(',', '.'));

    await oddButton.click();

    const selection = page.locator(SELECTORS.selectionItem).first();
    await expect(selection.locator(SELECTORS.selectionEventLabel)).toContainText(teamText.trim());
    await expect(selection.locator(SELECTORS.selectionOddValue)).toContainText(`@${oddValue.toFixed(2)}`);
  });

  test('should disable place bet button when no stake entered', async ({ page }) => {
    const eventCard = page.locator(SELECTORS.eventCard).first();
    const oddButton = eventCard.locator(SELECTORS.eventCardOddButton).first();
    await oddButton.click();

    await page.fill(SELECTORS.stakeInput, '');

    const placeBetBtn = page.locator(SELECTORS.placeBetButton);
    await expect(placeBetBtn).toBeDisabled();
  });

  test('should enable place bet button when stake entered', async ({ page }) => {
    const eventCard = page.locator(SELECTORS.eventCard).first();
    const oddButton = eventCard.locator(SELECTORS.eventCardOddButton).first();
    await oddButton.click();

    await page.fill(SELECTORS.stakeInput, '10');

    const placeBetBtn = page.locator(SELECTORS.placeBetButton);
    await expect(placeBetBtn).toBeEnabled();
  });

  test('should persist selections on navigation', async ({ page }) => {
    const eventCard = page.locator(SELECTORS.eventCard).first();
    const oddButton = eventCard.locator(SELECTORS.eventCardOddButton).first();
    await oddButton.click();

    // Navigate to event detail
    await eventCard.click();
    await page.waitForLoadState('networkidle');

    // Bet slip should still show selection
    await expect(page.locator(SELECTORS.betSlipCount)).toContainText('1');

    // Navigate back
    await page.goto('/bahis');
    await page.waitForLoadState('networkidle');

    // Selection should still be there
    await expect(page.locator(SELECTORS.betSlipCount)).toContainText('1');
  });
});