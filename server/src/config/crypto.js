// Crypto ödeme ayarları — admin panelinden değiştirilebilir
import { getCurrentTenantId } from '../tenancy/context.js';
import { getTenancyMode } from './tenancy.js';

const BASE_SETTINGS = {
  // Otomatik yatırma (deposit) limitleri
  deposit: {
    autoCreditLimit: 100,       // $100 Altı otomatik hesaba eklenir
    requireApprovalAbove: 100,  // $100+ admin onayı bekler
  },

  // Otomatik çekim (withdrawal) limitleri
  withdraw: {
    autoProcessLimit: 15,       // $15 Altı otomatik işlenir
    requireApprovalAbove: 15,   // $15+ admin onayı bekler
  },

  // Desteklenen para birimleri (TRC20 ağından)
  supportedCurrencies: ['USDT', 'USDC', 'TRX'],

  // Kullanılabilir ağlar
  networks: ['TRC20'],

  // Minimum çekim miktarı (USDT)
  minWithdraw: 5,

  // USDT ↔ TRY dönüşüm oranı (admin panelinden değiştirilebilir)
  usdtTryRate: 1,

  // Ağ seçimi: mainnet | shasta | nile (admin panelinden değiştirilebilir)
  network: 'mainnet',
};

// Per-tenant buckets (İP-4 Task 4). Single mode always uses the one 'global'
// bucket so existing installs keep exactly today's values; multi mode
// partitions by the ambient tenant. Boot hydrate runs before any tenant
// context (and before the default tenant id is resolved), so the no-context
// bucket is 'global' in both modes.
const buckets = new Map();

export function currentCryptoBucketKey() {
  if (getTenancyMode() === 'single') return 'global';
  const tid = getCurrentTenantId();
  return tid ? String(tid) : 'global';
}

function ambientBucket() {
  const key = currentCryptoBucketKey();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = structuredClone(BASE_SETTINGS);
    buckets.set(key, bucket);
  }
  return bucket;
}

// Backward-compatible view: every existing CRYPTO_SETTINGS consumer reads and
// writes the ambient tenant's bucket through these accessors (in-place semantics
// preserved — applyCryptoSettings mutates whatever bucket is active). A plain
// object with accessors, not a Proxy: structuredClone rejects proxies outright.
export const CRYPTO_SETTINGS = {};
for (const key of Object.keys(BASE_SETTINGS)) {
  Object.defineProperty(CRYPTO_SETTINGS, key, {
    enumerable: true,
    configurable: true,
    get() { return ambientBucket()[key]; },
    set(value) { ambientBucket()[key] = value; },
  });
}

// Env-derived defaults for the adjustable fields. A stored admin value (Setting
// `crypto.settings`) overrides only the keys the admin actually saved; the rest keep
// following the environment. An invalid USDT_TRY_RATE falls back to 1 (logged).
export function cryptoEnvDefaults(env = process.env, logger = console) {
  let usdtTryRate = 1;
  if (env.USDT_TRY_RATE !== undefined && env.USDT_TRY_RATE !== '') {
    const n = Number(env.USDT_TRY_RATE);
    if (Number.isFinite(n) && n > 0 && n <= 1_000_000) usdtTryRate = n;
    else logger.error?.('[crypto-settings] USDT_TRY_RATE is not a valid positive number; using 1');
  }
  return {
    deposit: { autoCreditLimit: 100, requireApprovalAbove: 100 },
    withdraw: { autoProcessLimit: 15, requireApprovalAbove: 15 },
    usdtTryRate,
    network: env.TRON_NETWORK || 'mainnet',
  };
}
// Multi mode never seeds tenant settings from the host environment.
if (getTenancyMode() === 'single') Object.assign(CRYPTO_SETTINGS, cryptoEnvDefaults());

// Admin-adjustable fields (deposit, withdraw, usdtTryRate, network) are persisted in
// Setting `crypto.settings` (services/cryptoSettings.js) and survive a restart.
// Applies an already validated partial patch to the in-memory settings (in place,
// so every module holding a CRYPTO_SETTINGS reference sees the change).
export function applyCryptoSettings(patch = {}) {
  if (patch.deposit) CRYPTO_SETTINGS.deposit = { ...CRYPTO_SETTINGS.deposit, ...patch.deposit };
  if (patch.withdraw) CRYPTO_SETTINGS.withdraw = { ...CRYPTO_SETTINGS.withdraw, ...patch.withdraw };
  if (patch.usdtTryRate !== undefined) CRYPTO_SETTINGS.usdtTryRate = patch.usdtTryRate;
  if (patch.network !== undefined) CRYPTO_SETTINGS.network = patch.network;
  return CRYPTO_SETTINGS;
}

// Admin onay eşiği kontrolü
export function shouldAutoCredit(usdtAmount) {
  return usdtAmount < CRYPTO_SETTINGS.deposit.autoCreditLimit;
}

export function shouldAutoProcessWithdraw(usdtAmount) {
  return usdtAmount < CRYPTO_SETTINGS.withdraw.autoProcessLimit;
}