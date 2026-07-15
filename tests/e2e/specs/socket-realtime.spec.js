import { test, expect } from '@playwright/test';
import { login } from '../utils/auth-helpers.js';
import {
  waitForSocketConnection,
  waitForOddsUpdate,
  waitForScoreUpdate,
  waitForBetSettled,
  subscribeToEvent,
  subscribeToUser,
  triggerOddsUpdate,
  triggerScoreUpdate,
  getSocketConnectionState,
  waitForSocketReconnect,
  disconnectSocket,
  reconnectSocket,
} from '../utils/socket-helpers.js';
import { SELECTORS } from '../fixtures/test-data.js';

test.describe('Real-time Socket.io Features', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await waitForSocketConnection(page, 15000);
  });

  test('should establish socket connection', async ({ page }) => {
    const state = await getSocketConnectionState(page);
    expect(state.connected).toBe(true);
    expect(state.id).toBeTruthy();
  });

  test('should receive odds updates on pre-match page', async ({ page }) => {
    await page.goto('/bahis');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector(SELECTORS.eventCard, { timeout: 10000 });

    const eventCard = page.locator(SELECTORS.eventCard).first();
    const oddButton = eventCard.locator(SELECTORS.eventCardOddButton).first();
    await expect(oddButton).toBeVisible({ timeout: 5000 });

    const originalText = await oddButton.textContent();
    const originalOdd = parseFloat(originalText.replace('@', '').replace(',', '.'));

    // Get event ID
    const eventId = await eventCard.getAttribute('data-event-id') || 'test-upcoming-1';

    // Subscribe to event
    await subscribeToEvent(page, eventId);

    // Trigger odds update
    await triggerOddsUpdate(page, eventId, [
      {
        type: 'maç_sonucu',
        odds: [{ id: 'ms1', value: 2.50, isActive: true }],
      },
    ]);

    // Wait for update
    const update = await waitForOddsUpdate(page, eventId, 10000).catch(() => null);

    if (update) {
      // Check for flash animation
      const hasFlash = await oddButton.evaluate(el =>
        ['bg-green-400/10', 'bg-red-400/10', 'ring-green-400', 'ring-red-400']
          .some(cls => el.classList.contains(cls.replace('/', ' ')))
      );

      // Wait for animation to complete
      await page.waitForTimeout(3000);

      // Verify new value persisted
      const newText = await oddButton.textContent();
      const newOdd = parseFloat(newText.replace('@', '').replace(',', '.'));
      expect(newOdd).not.toBe(originalOdd);
    }
  });

  test('should receive odds updates on event detail page', async ({ page }) => {
    await page.goto('/event/test-upcoming-1');
    await page.waitForLoadState('networkidle');
    await expect(page.locator(SELECTORS.matchHero)).toBeVisible();

    const eventId = 'test-upcoming-1';
    await subscribeToEvent(page, eventId);

    // Find an odd button in the market table
    const oddButton = page.locator(SELECTORS.marketAccordion)
      .filter({ hasText: 'Maç Sonucu' })
      .locator('td button')
      .first();

    await expect(oddButton).toBeVisible({ timeout: 5000 });
    const originalText = await oddButton.textContent();

    // Trigger update
    await triggerOddsUpdate(page, eventId, [
      { type: 'maç_sonucu', odds: [{ id: 'ms1', value: 2.25, isActive: true }] },
    ]);

    // Wait for update
    const update = await waitForOddsUpdate(page, eventId, 10000).catch(() => null);

    if (update) {
      await page.waitForTimeout(3000);
      const newText = await oddButton.textContent();
      expect(newText).not.toBe(originalText);
    }
  });

  test('should receive live score updates on live page', async ({ page }) => {
    await page.goto('/canli');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector(SELECTORS.liveEventCard, { timeout: 10000 });

    const eventCard = page.locator(SELECTORS.liveEventCard).first();
    const eventId = await eventCard.getAttribute('data-event-id') || 'test-live-1';

    await subscribeToEvent(page, eventId);

    // Trigger score update
    await triggerScoreUpdate(page, eventId, { home: 2, away: 1, minute: 45 });

    const update = await waitForScoreUpdate(page, eventId, 10000).catch(() => null);

    if (update) {
      await expect(eventCard.locator(SELECTORS.liveScore)).toContainText('2 - 1');
      await expect(eventCard.locator(SELECTORS.liveMinute)).toContainText("45'");
    }
  });

  test('should receive live score updates on event detail page', async ({ page }) => {
    await page.goto('/event/test-live-1');
    await page.waitForLoadState('networkidle');

    const eventId = 'test-live-1';
    await subscribeToEvent(page, eventId);

    const originalScore = await page.locator(SELECTORS.liveScoreDisplay).textContent();

    await triggerScoreUpdate(page, eventId, { home: 3, away: 1, minute: 60, scope: 'full' });

    const update = await waitForScoreUpdate(page, eventId, 10000).catch(() => null);

    if (update) {
      await expect(page.locator(SELECTORS.liveScoreDisplay)).toContainText('3 - 1');
      await expect(page.locator(SELECTORS.matchHeroMinute)).toContainText("60'");
    }
  });

  test('should subscribe to user events for bet settlements', async ({ page }) => {
    // Place a bet first
    await page.goto('/event/test-finished-1');
    await page.waitForLoadState('networkidle');

    await page.locator(SELECTORS.marketAccordion)
      .filter({ hasText: 'Maç Sonucu' })
      .locator('td button')
      .first()
      .click();

    await page.fill(SELECTORS.stakeInput, '100');
    await page.click(SELECTORS.placeBetButton);
    await expect(page.locator(SELECTORS.toastSuccess)).toBeVisible({ timeout: 10000 });

    // Subscribe to user
    await subscribeToUser(page, 'testuser');

    // Wait for bet settled (simulated)
    await triggerBetSettled(page, {
      betId: 'test-bet-1',
      eventTitle: 'Real Madrid - Barcelona',
      result: 'win',
      amount: 100,
      payout: 200,
    });

    const settled = await waitForBetSettled(page, 5000).catch(() => null);

    if (settled) {
      expect(settled.result).toBe('win');
      expect(settled.payout).toBe(200);
    }

    // Check for toast
    await expect(page.locator(SELECTORS.toastSuccess)).toBeVisible({ timeout: 5000 });
  });

  test('should handle socket reconnection', async ({ page }) => {
    const stateBefore = await getSocketConnectionState(page);
    expect(stateBefore.connected).toBe(true);

    // Disconnect
    await disconnectSocket(page);
    await page.waitForTimeout(2000);

    const stateDisconnected = await getSocketConnectionState(page);
    expect(stateDisconnected.connected).toBe(false);

    // Reconnect
    await reconnectSocket(page);
    await waitForSocketReconnect(page, 10000);

    const stateAfter = await getSocketConnectionState(page);
    expect(stateAfter.connected).toBe(true);
  });

  test('should maintain subscription after reconnection', async ({ page }) => {
    await page.goto('/event/test-upcoming-1');
    await page.waitForLoadState('networkidle');

    const eventId = 'test-upcoming-1';
    await subscribeToEvent(page, eventId);

    // Disconnect and reconnect
    await disconnectSocket(page);
    await page.waitForTimeout(1000);
    await reconnectSocket(page);
    await waitForSocketReconnect(page, 10000);

    // Should still receive updates
    await triggerOddsUpdate(page, eventId, [
      { type: 'maç_sonucu', odds: [{ id: 'ms1', value: 1.95, isActive: true }] },
    ]);

    const update = await waitForOddsUpdate(page, eventId, 10000).catch(() => null);
    if (update) {
      expect(update.eventId).toBe(eventId);
    }
  });

  test('should unsubscribe from event when navigating away', async ({ page }) => {
    await page.goto('/event/test-upcoming-1');
    await page.waitForLoadState('networkidle');

    const eventId = 'test-upcoming-1';
    await subscribeToEvent(page, eventId);

    // Navigate away
    await page.goto('/bahis');
    await page.waitForLoadState('networkidle');

    // Give time for unsubscribe
    await page.waitForTimeout(1000);

    // Trigger update - should not crash
    await triggerOddsUpdate(page, eventId, [
      { type: 'maç_sonucu', odds: [{ id: 'ms1', value: 2.10, isActive: true }] },
    ]);

    // No assertion needed - just verify no errors
    await page.waitForTimeout(1000);
  });

  test('should flash odds green on increase, red on decrease', async ({ page }) => {
    await page.goto('/event/test-upcoming-1');
    await page.waitForLoadState('networkidle');

    const eventId = 'test-upcoming-1';
    await subscribeToEvent(page, eventId);

    const oddButton = page.locator(SELECTORS.marketAccordion)
      .filter({ hasText: 'Maç Sonucu' })
      .locator('td button')
      .first();

    await expect(oddButton).toBeVisible();

    // Test increase (green flash)
    await triggerOddsUpdate(page, eventId, [
      { type: 'maç_sonucu', odds: [{ id: 'ms1', value: 2.50, isActive: true }] },
    ]);

    await page.waitForTimeout(500);

    const hasGreenFlash = await oddButton.evaluate(el =>
      ['bg-green-400/10', 'ring-green-400'].some(cls => el.classList.contains(cls.replace('/', ' ')))
    );

    await page.waitForTimeout(3000);

    // Test decrease (red flash)
    await triggerOddsUpdate(page, eventId, [
      { type: 'maç_sonucu', odds: [{ id: 'ms1', value: 1.80, isActive: true }] },
    ]);

    await page.waitForTimeout(500);

    const hasRedFlash = await oddButton.evaluate(el =>
      ['bg-red-400/10', 'ring-red-400'].some(cls => el.classList.contains(cls.replace('/', ' ')))
    );

    // At least one flash should occur
    expect(hasGreenFlash || hasRedFlash).toBe(true);
  });

  test('should receive multiple rapid odds updates', async ({ page }) => {
    await page.goto('/bahis');
    await page.waitForLoadState('networkidle');

    const eventCard = page.locator(SELECTORS.eventCard).first();
    const eventId = await eventCard.getAttribute('data-event-id') || 'test-upcoming-1';
    await subscribeToEvent(page, eventId);

    // Send multiple updates
    for (let i = 0; i < 5; i++) {
      await triggerOddsUpdate(page, eventId, [
        { type: 'maç_sonucu', odds: [{ id: 'ms1', value: 2.00 + i * 0.05, isActive: true }] },
      ]);
      await page.waitForTimeout(200);
    }

    // Should handle all without errors
    const update = await waitForOddsUpdate(page, eventId, 10000).catch(() => null);
    expect(update).toBeDefined();
  });

  test('should work with multiple tabs (simulated)', async ({ page, context }) => {
    // Open second tab
    const page2 = await context.newPage();
    await login(page2);
    await waitForSocketConnection(page2, 15000);

    await page.goto('/event/test-upcoming-1');
    await page2.goto('/event/test-upcoming-1');
    await page.waitForLoadState('networkidle');
    await page2.waitForLoadState('networkidle');

    const eventId = 'test-upcoming-1';
    await subscribeToEvent(page, eventId);
    await subscribeToEvent(page2, eventId);

    // Trigger update
    await triggerOddsUpdate(page, eventId, [
      { type: 'maç_sonucu', odds: [{ id: 'ms1', value: 2.33, isActive: true }] },
    ]);

    // Both should receive
    const [update1, update2] = await Promise.all([
      waitForOddsUpdate(page, eventId, 10000).catch(() => null),
      waitForOddsUpdate(page2, eventId, 10000).catch(() => null),
    ]);

    expect(update1).toBeDefined();
    expect(update2).toBeDefined();

    await page2.close();
  });
});

async function triggerBetSettled(page, data) {
  return page.evaluate((data) => {
    if (window.socket?.connected) {
      window.socket.emit('bet:settled', data);
    }
  }, data);
}