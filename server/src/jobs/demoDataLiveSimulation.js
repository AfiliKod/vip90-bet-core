// server/src/jobs/demoDataLiveSimulation.js
let _intervalHandle = null;

const DEMO_DATA_LIVE_CONFIG_KEY = 'demoData.live.config';

export function isDemoDataLiveJobRunning() {
  return _intervalHandle !== null;
}

/**
 * Spec §Güvenlik ve Idempotency: seed kullanıcı havuzu tamamen boşsa
 * (isSeed:true kullanıcı yok) job bir sonraki tick'te kendini durdurur ve
 * Setting'i enabled:false yapar. Tek bir null kategori AYRIKSIN — yalnızca
 * users havuzu sıfırsa durur. Setting yazımı try/catch ile korunur.
 */
async function maybeStopOnEmptyPool() {
  try {
    const { default: User } = await import('../models/User.js');
    const seedUserCount = await User.countDocuments({ isSeed: true });
    if (seedUserCount > 0) return;

    stopDemoDataLiveJob();
    try {
      const { default: Setting } = await import('../models/Setting.js');
      await Setting.findOneAndUpdate(
        { key: DEMO_DATA_LIVE_CONFIG_KEY },
        { key: DEMO_DATA_LIVE_CONFIG_KEY, value: JSON.stringify({ enabled: false, tickIntervalMinutes: 2 }) },
        { upsert: true },
      );
    } catch (e) {
      console.error('[demoDataLiveSimulation] boş havuz Setting yazımı hatası:', e.message);
    }
    console.log('[demoDataLiveSimulation] seed kullanıcı havuzu boş — job kendini durdurdu.');
  } catch (e) {
    console.error('[demoDataLiveSimulation] boş havuz kontrolü hatası:', e.message);
  }
}

export async function runDemoDataLiveTick() {
  const { runLiveTick } = await import('../services/demoData/registry.js');
  const results = await runLiveTick();
  await maybeStopOnEmptyPool();
  return results;
}

// Son tick'in promise'i: start() ilk tick'i beklemeden başlatır; testler bir
// sonraki teste geçmeden arka plandaki tick'in bitmesini `_waitForIdle()` ile
// bekler (aksi halde önceki testin tick'i sonraki testin verisine yazıyordu).
let _lastRun = Promise.resolve();

export function startDemoDataLiveJob(intervalMs) {
  if (_intervalHandle) clearInterval(_intervalHandle);
  async function run() {
    try {
      await runDemoDataLiveTick();
    } catch (e) {
      console.error('[demoDataLiveSimulation] error:', e.message);
    }
  }
  _lastRun = run();
  _intervalHandle = setInterval(() => { _lastRun = run(); }, intervalMs);
}

export function _waitForIdle() {
  return _lastRun;
}

export function stopDemoDataLiveJob() {
  if (_intervalHandle) {
    clearInterval(_intervalHandle);
    _intervalHandle = null;
  }
}
