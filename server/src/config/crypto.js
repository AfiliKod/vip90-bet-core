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
  usdtTryRate: parseFloat(process.env.USDT_TRY_RATE || '1'),

  // Ağ seçimi: mainnet | shasta | nile (admin panelinden değiştirilebilir)
  network: process.env.TRON_NETWORK || 'mainnet',
};

// Admin onay eşiği kontrolü
export function shouldAutoCredit(usdtAmount) {
  return usdtAmount < CRYPTO_SETTINGS.deposit.autoCreditLimit;
}

export function shouldAutoProcessWithdraw(usdtAmount) {
  return usdtAmount < CRYPTO_SETTINGS.withdraw.autoProcessLimit;
}
