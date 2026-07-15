import { test, expect } from '@playwright/test';

/**
 * Socket.io test helpers for real-time features
 * These work with the actual socket.io connection in the browser
 */

export async function waitForSocketConnection(page, timeout = 10000) {
  return page.waitForFunction(
    () => window.socket?.connected === true,
    { timeout }
  );
}

export async function emitSocketEvent(page, eventName, data) {
  return page.evaluate(({ eventName, data }) => {
    return new Promise((resolve, reject) => {
      if (!window.socket?.connected) {
        reject(new Error('Socket not connected'));
        return;
      }
      window.socket.emit(eventName, data, (response) => {
        if (response?.error) reject(new Error(response.error));
        else resolve(response);
      });
    });
  }, { eventName, data });
}

export async function listenForSocketEvent(page, eventName, timeout = 10000) {
  return page.evaluate(({ eventName, timeout }) => {
    return new Promise((resolve, reject) => {
      if (!window.socket?.connected) {
        reject(new Error('Socket not connected'));
        return;
      }
      const timer = setTimeout(() => {
        window.socket.off(eventName, handler);
        reject(new Error(`Timeout waiting for ${eventName}`));
      }, timeout);

      const handler = (data) => {
        clearTimeout(timer);
        window.socket.off(eventName, handler);
        resolve(data);
      };
      window.socket.on(eventName, handler);
    });
  }, { eventName, timeout });
}

export async function waitForOddsUpdate(page, eventId, marketType = 'maç_sonucu', timeout = 10000) {
  return listenForSocketEvent(page, 'odds:update', timeout).then(data => {
    if (data.eventId === eventId) {
      const market = data.markets?.find(m => m.type === marketType);
      if (market) return market;
    }
    return waitForOddsUpdate(page, eventId, marketType, timeout - 1000);
  });
}

export async function waitForScoreUpdate(page, eventId, timeout = 10000) {
  return listenForSocketEvent(page, 'score:update', timeout).then(data => {
    if (data.eventId === eventId) return data.score;
    return waitForScoreUpdate(page, eventId, timeout - 1000);
  });
}

export async function waitForBetSettled(page, timeout = 15000) {
  return listenForSocketEvent(page, 'bet:settled', timeout);
}

export async function subscribeToEvent(page, eventId) {
  return emitSocketEvent(page, 'subscribe:event', { eventId });
}

export async function unsubscribeFromEvent(page, eventId) {
  return emitSocketEvent(page, 'unsubscribe:event', { eventId });
}

export async function subscribeToUser(page, userId) {
  return emitSocketEvent(page, 'subscribe:user', { userId });
}

export async function unsubscribeFromUser(page, userId) {
  return emitSocketEvent(page, 'unsubscribe:user', { userId });
}

/**
 * Trigger odds update from test (via page.evaluate to access socket)
 */
export async function triggerOddsUpdate(page, eventId, markets) {
  return page.evaluate(({ eventId, markets }) => {
    if (window.socket?.connected) {
      window.socket.emit('odds:update', { eventId, markets });
      return true;
    }
    return false;
  }, { eventId, markets });
}

/**
 * Trigger score update from test
 */
export async function triggerScoreUpdate(page, eventId, score) {
  return page.evaluate(({ eventId, score }) => {
    if (window.socket?.connected) {
      window.socket.emit('score:update', { eventId, score });
      return true;
    }
    return false;
  }, { eventId, score });
}

/**
 * Trigger bet settled notification
 */
export async function triggerBetSettled(page, data) {
  return page.evaluate((data) => {
    if (window.socket?.connected) {
      window.socket.emit('bet:settled', data);
      return true;
    }
    return false;
  }, data);
}

/**
 * Get socket connection state
 */
export async function getSocketState(page) {
  return page.evaluate(() => ({
    connected: window.socket?.connected,
    id: window.socket?.id,
    io: !!window.socket?.io,
  }));
}

/**
 * Wait for socket to reconnect
 */
export async function waitForSocketReconnect(page, timeout = 15000) {
  await page.waitForFunction(
    () => window.socket?.connected === true,
    { timeout }
  );
}

/**
 * Disconnect socket (for testing reconnection)
 */
export async function disconnectSocket(page) {
  return page.evaluate(() => {
    if (window.socket?.connected) {
      window.socket.disconnect();
    }
  });
}

/**
 * Reconnect socket
 */
export async function reconnectSocket(page) {
  return page.evaluate(() => {
    if (window.socket && !window.socket.connected) {
      window.socket.connect();
    }
  });
}

/**
 * Listen for any socket event (debugging)
 */
export async function listenAllSocketEvents(page, events = [], timeout = 5000) {
  return page.evaluate(({ events, timeout }) => {
    return new Promise((resolve) => {
      const results = {};
      let received = 0;

      const handler = (eventName, data) => {
        results[eventName] = data;
        received++;
        if (received >= events.length) {
          resolve(results);
        }
      };

      events.forEach(eventName => {
        window.socket?.on(eventName, (data) => handler(eventName, data));
      });

      setTimeout(() => {
        events.forEach(eventName => window.socket?.off(eventName, handler));
        resolve(results);
      }, timeout);
    });
  }, { events, timeout });
}