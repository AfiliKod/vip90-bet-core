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
 */
export const HOME_GREEN = '#5ED631';
export const HOME_GREEN_DARK = '#3FA820';
export const HOME_BG = '#0a0f0d';
export const HOME_CARD = '#0b131a';
export const HOME_BORDER = 'rgba(255,255,255,0.06)';
