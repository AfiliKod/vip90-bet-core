import { runBotScheduler } from '../services/bot.js';

export function startBotScheduler() {
  const INTERVAL = 15 * 1000; // her 15 saniyede bir aksiyonu hazır botları kontrol et

  async function run() {
    try {
      const results = await runBotScheduler();
      const executed = results.filter(r => r.executed).length;
      if (executed > 0) {
        console.log(`[botScheduler] ${executed}/${results.length} bot aksiyonu çalıştırıldı`);
      }
    } catch (e) {
      console.error('[botScheduler] hata:', e.message);
    }
  }

  run();
  setInterval(run, INTERVAL);
}
