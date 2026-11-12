import { runBotSchedulerForTenant } from '../services/bot.js';

export function startBotScheduler({ intervalMs = 15 * 1000, run = runBotSchedulerForTenant } = {}) {
  async function tick() {
    try {
      const results = await run();
      const executed = results.filter((r) => r.executed).length;
      if (executed > 0) {
        console.log(`[botScheduler] ${executed}/${results.length} bot actions executed`);
      }
    } catch (e) {
      console.error('[botScheduler] error:', e.message);
    }
  }
  tick();
  const interval = setInterval(tick, intervalMs);
  if (typeof interval.unref === 'function') interval.unref();
  return interval;
}
