import Setting from '../models/Setting.js';
import { getDemoFlags } from '../config/tenancy.js';
import { startBotScheduler } from './botScheduler.js';
import { startFakeWinnersScheduler } from '../services/fakeWinners.js';

async function startDemoDataLiveRestore() {
  const demoDataLiveRow = await Setting.findOne({ key: 'demoData.live.config' }).lean();
  if (demoDataLiveRow?.value) {
    const config = JSON.parse(demoDataLiveRow.value);
    if (config.enabled) {
      const { startDemoDataLiveJob } = await import('./demoDataLiveSimulation.js');
      startDemoDataLiveJob((config.tickIntervalMinutes || 2) * 60 * 1000);
    }
  }
}

export const DEFAULT_STARTERS = Object.freeze({
  bots: startBotScheduler,
  fakeWinners: startFakeWinnersScheduler,
  data: startDemoDataLiveRestore,
});

/** Start only the explicitly enabled demo jobs, in their fixed startup order. */
export async function startDemoJobs({ env = process.env, starters = DEFAULT_STARTERS } = {}) {
  const flags = getDemoFlags(env);
  const started = [];

  for (const name of ['bots', 'fakeWinners', 'data']) {
    if (flags[name]) {
      await starters[name]();
      started.push(name);
    }
  }

  return started;
}
