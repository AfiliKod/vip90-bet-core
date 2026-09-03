/**
 * Anasayfa referans tasarımının (VIP90-BET-pixel-perfect-homepage,
 * c61b808'de betface.png pilotunun yerini aldı) renk paleti — `styles/brand.js`
 * (sitenin admin'den değiştirilebilir cyan/purple marka rengi) ile KARIŞTIRILMAZ.
 * Bu sabitler yalnızca anasayfaya özgü bileşenlerde (HomeSidebar, WinnersPanel,
 * PromoPanel, HomePage hero/oyun şeridi/istatistik bandı) kullanılır — bilinçli
 * bir tasarım kararı, sitenin geri kalanının marka rengini değiştirmez.
 *
 * HOME_GREEN artık kullanılmıyor (sitewide primary artık var(--color-primary)
 * üzerinden admin temasından geliyor) — betface.png döneminden kalıntı, silinmedi
 * çünkü referanslayan bir şey yok ama silmek de güvenli.
 *
 * HOME_CARD/HOME_BORDER artık `styles/surface.js`'ten re-export ediliyor —
 * bu genel "yüzey" paleti Spor Bahisleri/Canlı Bahis sayfalarına da taşındığı
 * için tek doğruluk kaynağı orada; burada iki ayrı hardcoded sabit olarak
 * durup sessizce diverge etme riski ortadan kalktı.
 */
export const HOME_GREEN = '#5ED631';
export const HOME_GREEN_DARK = '#3FA820';
export const HOME_BG = '#0a0f0d';
export { SURFACE_CARD as HOME_CARD, SURFACE_BORDER as HOME_BORDER } from '../../styles/surface.js';
