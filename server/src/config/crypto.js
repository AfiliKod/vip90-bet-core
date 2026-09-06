// Crypto ödeme ayarları — admin panelinden değiştirilecek (şimdilik placeholder)
// Merge sonrası admin/module-settings'e eklenecek
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
};

// Para birimi dönüşüm oranları (placeholder — admin panelinden değiştirilecek)
export const CURRENCY_RATES = {
  USDT_TRY: 1,    // 1 USDT = 1 TRY (test)
  USDT_EUR: 0.92, // 1 USDT = 0.92 EUR (placeholder)
  USDT_GBP: 0.79, // 1 USDT = 0.79 GBP (placeholder)
  USDT_USD: 1,    // 1 USDT = 1 USD
};

// Admin onay eşiği kontrolü
export function shouldAutoCredit(usdtAmount) {
  return usdtAmount < CRYPTO_SETTINGS.deposit.autoCreditLimit;
}

export function shouldAutoProcessWithdraw(usdtAmount) {
  return usdtAmount < CRYPTO_SETTINGS.withdraw.autoProcessLimit;
}
