// Referans komisyonu VARSAYILANLARI. Panelden yapılan değişiklik `Setting`
// koleksiyonunda saklanır ve bunları ezer (bkz. services/referralSettings.js);
// bu nesneyi çalışma anında değiştirmeyin.
export const REFERRAL_SETTINGS = {
  // Referans komisyonu aktif mi?
  enabled: true,

  // Komisyon oranı (%) — houseProfit üzerinden hesaplanır
  commissionRate: 10,

  // Minimum house profit komisyon tetikleme eşiği
  minHouseProfit: 0,
};
