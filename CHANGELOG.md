# Changelog

VIP90.bet iGaming Platform — değişiklik günlüğü.

Biçim [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) esasına,
sürümleme [Semantic Versioning](https://semver.org/lang/tr/) kuralına dayanır.
Bu günlük yalnızca `feat/integration` dalındaki ürün
geliştirmelerini kapsar; canlı işletilen sitenin bakımı `dev` dalında sürer.

## [Yayınlanmadı]

### Eklendi
- Odds sağlayıcı kayıt defteri ve kontratı (`services/oddsProviders/registry.js`):
  sync katmanının tek bir bahis sitesine doğrudan bağımlılığını sökmenin ilk adımı.
  `ODDS_PROVIDER` env'inden aktif sağlayıcı seçimi, çift kayıt ve bilinmeyen
  sağlayıcı reddi. (T1)
- Sağlayıcı-bağımsız normalize etkinlik sözleşmesi
  (`services/oddsProviders/normalizedEvent.js`): tüm sağlayıcıların hedefleyeceği
  ortak etkinlik/oran biçimi. (T1)

## [0.1.0] — 2026-08-20

İlk sürüm çizgisi. Ürün yol haritasının (52 kart, 9 alan) başlangıç
noktası; çekirdek platform, 13 in-house oyun ve mevcut admin paneli bu temeli
oluşturur.
