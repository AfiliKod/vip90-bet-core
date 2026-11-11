// Crypto ödeme ayarları — admin panelinden değiştirilebilir
export const CRYPTO_SETTINGS = {
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
Object.assign(CRYPTO_SETTINGS, cryptoEnvDefaults());

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
