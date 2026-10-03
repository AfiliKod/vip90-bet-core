// Casino ödülleri (bonus call + freeround) sabitleri — tek yerde tutulur ki
// sağlayıcı gerçekleri değiştiğinde (bkz. spec "Belgelenmemiş noktalar ve
// varsayımlar") tek dosya güncellenir.
export const PROMO_LIMITS = {
  maxSetPoint: 100000,
  maxRounds: 500,
  maxFreeRoundValue: 100000, // bet * rounds üst sınırı
  maxExpiryDays: 90,
};

// Varsayım (spec md.1): expirationDate Unix SANİYE. Sağlayıcı netleştirdiğinde
// tek burada değiştirilir.
export const FREEROUND_EXPIRATION_UNIT = 'seconds';
