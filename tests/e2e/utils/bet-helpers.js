/**
 * Bet slip and betting helpers
 */

import { SELECTORS } from '../fixtures/test-data.js';
import { getBalance } from './auth-helpers.js';
import { expect } from '@playwright/test';

export async function placeSingleBet(page, stake, options = {}) {
  const {
    eventId,
    marketType = 'maç_sonucu',
    oddLabel = '1',
    verifySuccess = true,
  } = options;

  // Fill stake
  await page.fill(SELECTORS.stakeInput, stake.toString());

  // Click place bet
  await page.click(SELECTORS.placeBetButton);

  if (verifySuccess) {
    // Wait for success toast
    await expect(page.locator(SELECTORS.toastSuccess)).toBeVisible({ timeout: 10000 });
  }

  // Verify bet slip cleared
  await expect(page.locator(SELECTORS.betSlipCount).filter({ hasText: '0' })).toBeVisible({ timeout: 5000 });

  // Return updated balance
  return getBalance(page);
}

export async function placeComboBet(page, stake, selections, options = {}) {
  // Ensure combo mode is selected
  await page.click(SELECTORS.comboButton);
  await expect(page.locator(SELECTORS.comboButton)).toHaveClass(/active|bg-accent/);

  // Fill stake
  await page.fill(SELECTORS.stakeInput, stake.toString());

  // Click place bet
  await page.click(SELECTORS.placeBetButton);

  if (options.verifySuccess !== false) {
    await expect(page.locator(SELECTORS.toastSuccess)).toBeVisible({ timeout: 10000 });
  }

  return getBalance(page);
}

export async function addSelectionToBetSlip(page, eventId, marketType, oddLabel, oddValue) {
  // Navigate to event if needed
  if (eventId) {
    await page.goto(`/event/${eventId}`);
    await page.waitForLoadState('networkidle');
  }

  // Find and click the odd button
  const oddButton = page.locator(`${SELECTORS.oddCell}:has-text("@${oddValue}"), ${SELECTORS.eventCardOddButton}:has-text("@${oddValue}")`).first();
  await expect(oddButton).toBeVisible({ timeout: 5000 });
  await oddButton.click();

  // Verify bet slip updated
  await expect(page.locator(SELECTORS.betSlipCount)).toBeVisible({ timeout: 5000 });
}

export async function verifyBetSlip(page, expectedSelections = 1, expectedType = 'single', expectedTotalOdds = null) {
  // Check selection count
  await expect(page.locator(SELECTORS.betSlipCount).filter({ hasText: expectedSelections.toString() })).toBeVisible();

  // Check bet type
  if (expectedType === 'combo') {
    await expect(page.locator(SELECTORS.comboButton)).toHaveClass(/active|bg-accent/);
  } else {
    await expect(page.locator(SELECTORS.singleButton)).toHaveClass(/active|bg-accent/);
  }

  // Check total odds if provided
  if (expectedTotalOdds !== null) {
    const oddsText = await page.locator(SELECTORS.totalOdds).locator('..').locator('span').last().textContent();
    const actualOdds = parseFloat(oddsText);
    expect(actualOdds).toBeCloseTo(expectedTotalOdds, 2);
  }
}

export async function calculatePotentialWin(stake, odds, betType = 'single') {
  if (betType === 'single') {
    return +(stake * odds).toFixed(2);
  }
  // For combo, odds is already the multiplied total
  return +(stake * odds).toFixed(2);
}

export async function verifyPotentialWin(page, stake, odds, betType = 'single') {
  const expected = await calculatePotentialWin(stake, odds, betType);
  const winText = await page.locator(SELECTORS.potentialWin).locator('..').locator('span').last().textContent();
  const actual = parseFloat(winText.replace(/[₺,]/g, ''));
  expect(actual).toBeCloseTo(expected, 2);
  return actual;
}

export async function clearBetSlip(page) {
  await page.click(SELECTORS.clearButton);
  await expect(page.locator(SELECTORS.betSlipCount).filter({ hasText: '0' })).toBeVisible({ timeout: 5000 });
}

export async function removeSelection(page, selectionIndex = 0) {
  const removeButtons = page.locator(SELECTORS.selectionItem).locator('button:has-text("✕"), button:has-text("×")');
  await removeButtons.nth(selectionIndex).click();
}

export async function switchToSingle(page) {
  await page.click(SELECTORS.singleButton);
  await expect(page.locator(SELECTORS.singleButton)).toHaveClass(/active|bg-accent/);
}

export async function switchToCombo(page) {
  await page.click(SELECTORS.comboButton);
  await expect(page.locator(SELECTORS.comboButton)).toHaveClass(/active|bg-accent/);
}

export async function getBetSlipSelections(page) {
  return page.evaluate(() => {
    const items = document.querySelectorAll(SELECTORS.selectionItem);
    return Array.from(items).map(item => ({
      eventLabel: item.querySelector('.text-text-2')?.textContent?.trim(),
      oddLabel: item.querySelector('.text-text-3')?.textContent?.trim(),
      oddValue: item.querySelector('.text-primary')?.textContent?.replace('@', '')?.trim(),
    }));
  });
}

export async function verifyMinStakeValidation(page, stake = 0.5) {
  await page.fill(SELECTORS.stakeInput, stake.toString());
  await page.click(SELECTORS.placeBetButton);
  await expect(page.locator(SELECTORS.toastWarning).filter({ hasText: /Minimum.*1/ })).toBeVisible({ timeout: 5000 });
}

export async function verifyInsufficientBalance(page, stake = 999999) {
  await page.fill(SELECTORS.stakeInput, stake.toString());
  await page.click(SELECTORS.placeBetButton);
  await expect(page.locator(SELECTORS.toastError).filter({ hasText: /Yetersiz|Insufficient/ })).toBeVisible({ timeout: 5000 });
}

export async function getBetSlipTotalOdds(page) {
  const oddsText = await page.locator(SELECTORS.totalOdds).locator('..').locator('span').last().textContent();
  return parseFloat(oddsText);
}

export async function getBetSlipPotentialWin(page) {
  const winText = await page.locator(SELECTORS.potentialWin).locator('..').locator('span').last().textContent();
  return parseFloat(winText.replace(/[₺,]/g, ''));
}

export async function verifyBetPlaced(page, expectedBalanceChange) {
  const initialBalance = await getBalance(page);
  // Wait for balance update
  await page.waitForFunction(
    (initial) => {
      const balanceEl = document.querySelector('[class*="balance"], [class*="Balance"]');
      if (!balanceEl) return false;
      const text = balanceEl.textContent;
      const match = text.match(/([\d,]+\.\d{2})/);
      if (!match) return false;
      return Math.abs(parseFloat(match[1].replace(',', '')) - initial) >= 0.01;
    },
    initialBalance,
    { timeout: 10000 }
  );
  return getBalance(page);
}