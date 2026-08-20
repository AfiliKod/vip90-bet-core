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
- oddsSource odds adaptörü (`services/oddsProviders/oddsSourceProvider.js`): mevcut
  oddsSource bağlantısını kontratın arkasına alır, ham veriyi normalize etkinliğe
  çevirir. Ağ erişimi enjekte edilebilir — testler ağa çıkmaz. Bozuk satırları
  atlar, batch'i öldürmez. (T1)
- LiveSync job'ı odds sağlayıcı kontratına bağlandı
  (`jobs/oddsSourceLiveSync.js`): `/livemenu/left/` parse'ı ve normalizasyon
  `oddsSourceProvider`'a taşındı, job artık kaynağı `getActiveOddsProvider()`
  üzerinden çözüyor. Kaynağı değiştirmek job'ı düzenlemeyi değil,
  `ODDS_PROVIDER` env'ini değiştirmeyi gerektiriyor. DB eşleme, canlı oran
  çekme (`/live/{eid}/`) ve WebSocket orkestrasyonu job'da kaldı — oran
  teslim mekanizması T2'de (lisanslı feed) soyutlanacak. (T1 — hakkıyla
  tamamlandı: sağlayıcı artık üretimde de değiştirilebilir, yalnızca test
  kontratında değil)
- Sağlayıcı-bağımsız normalize etkinlik sözleşmesi
  (`services/oddsProviders/normalizedEvent.js`): tüm sağlayıcıların hedefleyeceği
  ortak etkinlik/oran biçimi. (T1)

### T3 — Casino aggregator kontratı
- Palace bağlantısı genel aggregator kontratının arkasına alındı
  (`services/casinoAggregators/`): kayıt defteri + kontrat (oyun kataloğu,
  oyun URL'i, kullanıcı/bakiye, callback doğrulama, health check) +
  `palaceAdapter.js` (mevcut palaceCasinoService'i saran passthrough,
  DI ile ağa çıkmadan test edilebilir) + bootstrap (`CASINO_AGGREGATOR`
  env seçimi, varsayılan palace).
- `routes/palace.js` artık `palaceCasinoService`'i doğrudan değil,
  `getActiveCasinoAggregator()` üzerinden çözüyor — ikinci bir aggregator
  eklemek yeni bir adaptör kaydetmekten ibaret, route dosyası değişmez.
- Palace'a özgü idari/raporlama uçları (bonus call, RTP, transactions,
  statistics) kontratın zorunlu parçası değil; enjekte edilen serviste
  varsa opsiyonel olarak taşınır. (T3)

### M1 — Modül kayıt defteri
- `modules/registry.js`: üç satılabilir modülün (betting, casino-content,
  live-casino) tek doğruluk kaynağı. Çekirdek platform (13 in-house oyun)
  bilinçli olarak bir modül DEĞİL — her zaman açık. `services/settings.js`
  ile aynı DI deseni (`load`/`now`/`ttlMs` enjekte edilebilir, TTL cache).
  Fail-closed: DB okunamazsa tüm modüller kapalı sayılır.
- `modules/index.js`: üretim bağlantısı, mevcut `Setting` koleksiyonunu
  (`module.<id>.enabled` anahtarıyla) kullanır — yeni şema açmadan.
  `setModuleEnabled()` admin panelinin (M3) üzerine ineceği yüzey. (M1)

### U1 — i18n çekirdeği
- `client/src/i18n/core.js`: framework'ten bağımsız saf çeviri mantığı
  (arama, `{param}` interpolasyonu, fallback, anahtar doğrulama). Anahtar
  kuralı: nokta ayraçlı, en az iki segment, küçük harfle başlayan camelCase
  (`auth.username`). DOM/React olmadan test edilir.
- `I18nProvider.jsx` + `useTranslation()`: React'e ince bir sargı,
  localStorage'da dil kalıcılığı; mantık tekrarlanmaz, çekirdeğe delege eder.
- `LanguageSwitcher.jsx`: sözleşmenin kanıtı — yalnızca `useTranslation()`
  ile render olan, iki dilde çalışan tek bileşen (kabul kriteri).
- Gerçek entegrasyon: `App.jsx` kökte `I18nProvider` ile sarıldı;
  `Login.jsx`'te kullanıcı adı placeholder'ı `t('auth.username')`'e
  bağlandı, `LanguageSwitcher` mount edildi. Bu sırada dosyada önceden var
  olan bir `t` isimli tab-state değişkeniyle isim çakışması bulundu ve
  `tabId` olarak yeniden adlandırılarak çözüldü.
- Not: çekirdek 14 testle kapsanıyor; React sargısı (Provider/hook/
  LanguageSwitcher) projede React test renderer bulunmadığı için otomatik
  render testiyle değil, build doğrulaması + saf delegasyon mantığıyla
  güvence altına alındı. Tam metin taşıması U2'nin kapsamı. (U1)

### A1 — Tema token sistemi
- `theme/registry.js`: renk/tipografi/köşe/gölge token'larının tek doğruluk
  kaynağı (`primary`, `primaryDark`, `accent`, `radiusMd`, `fontDisplay`).
  Varsayılanlar mevcut tasarımın gerçek değerleri — override yoksa görsel
  hiçbir şey değişmez. `modules/registry.js` ile aynı DI deseni, fail-safe
  (DB okunamazsa varsayılanlara düşer).
- `theme/index.js`: mevcut Setting koleksiyonu üzerinden üretim bağlantısı
  (`theme.<id>` anahtarı), `setThemeToken()` admin ekranının (A2/A3)
  üzerine ineceği yüzey.
- `GET /api/theme`: herkese açık, kimlik doğrulama gerektirmez; CSS custom
  property haritası döner (30 sn cache).
- İstemci: `ThemeStyleInjector` sayfa yüklenirken override'ları çekip
  `document.documentElement`e enjekte eder; fetch başarısız olursa
  `index.css`'teki varsayılanlarla sessizce devam eder.
- Uçtan uca kanıt: `primary` ve `accent` CSS var'a bağlandı
  (`tailwind.config.js`), her ikisi de düzinelerce bileşende
  (`text-primary`, `bg-primary`, vb.) zaten kullanılıyor — tek bir DB
  değeri değişince bu bileşenlerin tümü etkilenir (kabul kriteri).
- Not: paletin geri kalanı (bg/text/danger/success vb. hâlâ sabit hex) ve
  admin düzenleme arayüzü A2/A3/A6'nın kapsamı; A1 yalnızca kontratı ve
  uçtan uca boru hattını kanıtlar. (A1)

## [0.1.0] — 2026-08-20

İlk sürüm çizgisi. Ürün yol haritasının (52 kart, 9 alan) başlangıç
noktası; çekirdek platform, 13 in-house oyun ve mevcut admin paneli bu temeli
oluşturur.
