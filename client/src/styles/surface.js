/**
 * Genel "yüzey" (kart/panel) tasarım token'ları — anasayfanın (homeTheme.js)
 * pixel-perfect referanstan türeyen koyu navy paletini platformun geri
 * kalanına (Spor Bahisleri, Canlı Bahis, ileride diğer sayfalar) taşımak
 * için tek doğruluk kaynağı. `styles/brand.js` (admin'den değiştirilebilir
 * cyan/purple vurgu rengi) ile KARIŞTIRILMAZ — bu yalnızca nötr kart/panel
 * arkaplanı ve kenarlığı.
 */
export const SURFACE_CARD = '#0d1526';           // = tailwind.config.js colors.bg.base, Navbar.jsx ile aynı
export const SURFACE_CARD_GRADIENT_END = '#071016';
export const SURFACE_BORDER = 'rgba(255,255,255,0.06)';
export const SURFACE_CARD_BG = `linear-gradient(180deg, ${SURFACE_CARD} 0%, ${SURFACE_CARD_GRADIENT_END} 100%)`;
