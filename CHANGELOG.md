# Changelog

VIP90.bet iGaming Platform — değişiklik günlüğü.

Biçim [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) esasına,
sürümleme [Semantic Versioning](https://semver.org/lang/tr/) kuralına dayanır.
Bu günlük yalnızca `feat/integration` dalındaki ürün
geliştirmelerini kapsar; canlı işletilen sitenin bakımı `dev` dalında sürer.

Madde formatı ve kategoriler için `docs/CHANGELOG_GUIDE.md`'ye bakın —
özellikle **Kırılan Değişiklikler** kategorisi zorunludur, atlanmaz.

## [Yayınlanmadı]

## [0.2.0] — 2026-08-21

Faz 0 (Sözleşmeler) tamamlandı ve Faz 1'in (dört paralel akış) büyük
bölümü bu sürümde toplandı: Akış A (arayüz özelleştirme) tam, Akış B
(operatör araçları) tam, Akış C (oyuncu deneyimi) büyük ölçüde tam,
D akışının (bakım ajanı + dokümantasyon) 7/9 kartı, Akış K'nın ilk
kartı. Toplam 29/52 kart.

**Bu hâlâ bir geliştirme sürümüdür, satışa hazır sürüm değildir.**
1.0.0 etiketi, Faz 2 (entegrasyon ve sertleştirme) ile Faz 3 (vitrin ve
yayına çıkış) tamamlanıp ürün yayına gönderilmeye hazır olduğunda
verilecek.

### D5 — Oyuncu yardım masası / ticket sistemi
- `models/Ticket.js`: konu + mesaj dizisi (gönderen, rol, metin),
  status (open/in_progress/resolved/closed).
- `services/ticket.js`: iş kuralları — operatör yanıtlarsa open tiket
  otomatik in_progress'e geçer; oyuncu resolved bir tikete yazarsa
  otomatik yeniden open olur; closed bir tikete yazmak status'ü
  değiştirmez (kapanmış tiket sessizce yeniden açılmaz).
- `routes/ticket.js` + `controllers/ticket.js`: oyuncu uçları
  (kendi tiketiyle sınırlı) ve admin uçları (tüm tiketler + durum
  değiştirme).
- Test izolasyonu notu: bu kartın testleri kendine özgü, benzersiz bir
  test veritabanı kullanır ve after()'da güvenle dropDatabase()+
  disconnect() çağırır — Akış B'de tespit edilen paylaşımlı-DB
  izolasyon sorununun önlenmiş hali. Ayrıca disconnect() olmadan
  mongoose bağlantısının process'i sonsuza kadar canlı tuttuğu bir
  hata bu kartta bulunup düzeltildi.

TDD: 13 yeni test, tamamı önce kırmızı. Suite 265/265. (D5)

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

### D6 — Otonom bakım ajanı çekirdeği
- `agent/masking.js`: allowlist tabanlı teşhis verisi maskeleme. Denylist
  değil allowlist — bilinmeyen alan sızmaz. Allowlist'teki alanın değeri
  primitive değilse (obje/dizi) hiç geçirilmez; beklenmeyen şekli
  serileştirmek (JSON.stringify ile nested içerik) sızıntının ta kendisi
  olduğu için bilerek reddedildi.
- `agent/signature.js`: Ed25519 imzalama/doğrulama. Yalnızca `actionId`+
  `params` imza kapsamında; özel anahtar hiçbir zaman müşteri makinesine
  geçmez, yalnızca doğrulama (açık) anahtarı dağıtılır.
- `agent/registry.js`: minimal Action-ID kayıt defteri — kayıtsız eylem,
  imza geçerli olsa bile asla çalıştırılmaz. Etki-yarıçapı sınıflaması ve
  insan onay kapısı D7'nin kapsamı.
- `agent/localAgent.js`: pull döngüsü orkestrasyonu. Sıra: kapalıysa
  pull hiç çağrılmaz → komut yoksa geç → imza geçersizse çalıştırma →
  eylem kayıtsızsa çalıştırma → yalnızca tüm kapılardan geçen çalışır.
- `services/support/agentToggle.js` + `index.js`: panelden aç/kapat
  (varsayılan KAPALI), mevcut Setting koleksiyonu üzerinden — modules/
  ve theme/ ile aynı DI deseni. Minimal bellek-içi komut kuyruğu (D8
  kalıcı depolama + WAF ile sertleştirecek), komut bir kez teslim
  edilince kuyruktan düşer (çift çalıştırma yok).

Dürüstlük notu: `commandQueue` testleri implementasyondan SONRA yazıldı
(TDD sırası burada tersine döndü) — diğer tüm modüller sıkı red-first.

TDD: 38 yeni test (37'si önce kırmızıydı). Suite 193/193. (D6)

### D7 — Action-ID risk sınıflaması ve insan onay kapısı
- `agent/actionCatalog.js`: merkezi Action-ID kataloğu, her eylem `safe`/
  `destructive` olarak sınıflı. Kayıtsız eylem için risk sorgusu sessizce
  "safe" varsaymaz, hata fırlatır (fail-closed).
- `agent/approvalGate.js`: salt-okunur eylemler `propose()` anında
  auto-approved; yıkıcı eylemler yalnızca temsilcinin açık `approve()`
  çağrısıyla onaylanır (`reject()` de var). Kayıtsız eylem için öneri
  hiç oluşmaz.
- **Sertleştirme** (ilk entegrasyon testi yazarken bulundu): kriptografik
  imza tek başına "onaylandı mı" sorusuna cevap vermiyordu — süreç
  atlanıp doğrudan imzalansa bile localAgent reddetmiyordu. Düzeltildi:
  `approvedBy` artık imza kapsamının içinde (`signature.js` canonical
  payload'a eklendi, kurcalanamaz), ve `localAgent.tick()` yıkıcı eylemde
  bunu yapısal olarak zorunlu kılıyor (`missing-approval` reddi).
- **Fail-closed düzeltmesi:** lokal registry ile merkezi katalog iki ayrı
  doğruluk kaynağı ve ayrışabilir — lokalde kayıtlı ama katalogda tanımsız
  bir eylem artık `tick()`'i çökertmiyor, `unclassified-risk` ile temiz
  reddediliyor.
- Uçtan uca entegrasyon testi: propose→gate→sign→lokal ajan zinciri hem
  salt-okunur hem yıkıcı yol için, onay atlanırsa reddi de dahil.

TDD: 27 yeni test, tamamı önce kırmızı. Suite 220/220. (D7)

### D8 — Merkez WAF ve HSM-uyumlu imza sağlayıcı
- `agent/promptFirewall.js`: prompt-injection filtresi. D6'nın maskelemesi
  hangi ALANLARIN geçtiğini sınırlar, bu ise geçen alanların İÇERİĞİNİ
  tarar ("ignore previous instructions", sahte `system:`/`assistant:`
  rol işaretleyicileri vb.). Fail-closed: herhangi bir alan şüpheliyse
  TÜM payload reddedilir, kısmi temizlik yapılmaz.
- `services/support/index.js` → `createDiagnosticInbox()`: müşteriden
  merkeze giden teşhis raporu kuyruğu, `submit()` anında WAF'tan geçer —
  şüpheli veri kuyruğa hiç girmez (`size()`/`next()` ile ispatlı).
- `agent/signingProvider.js` + `signature.js` → `signCommandWithProvider`:
  imza sağlayıcı arayüzü (`{ sign(buffer): Promise<Buffer> }`). Bu commit
  yalnızca bellek-içi (dev/test) sağlayıcıyı içerir — **gerçek HSM/KMS
  entegrasyonu (donanım seçimi, provisioning, IAM, maliyet) bir operasyon
  kararıdır ve bilerek bu kod oturumunun kapsamı dışında bırakıldı.**
  Kurulan şey: çağıran kodun özel anahtarı hiç görmediği, gerçek bir
  HSM/KMS sağlayıcısının aynı sözleşmeyle (drop-in) takılabileceği arayüz.
  D6'nın `signCommand` (ham anahtar) fonksiyonu değişmeden duruyor.

TDD: 20 yeni test, tamamı önce kırmızı. Suite 240/240. (D8)

### D9 — İmzalı güncelleme paketi
- Yeni bir mekanizma icat edilmedi: `APPLY_UPDATE`, `actionCatalog.js`'e
  yıkıcı bir Action-ID olarak eklendi — D6/D7/D8'in aynı boru hattından
  (kayıt→onay→imza→doğrulama) geçiyor. "Güncelleme operatör onayıyla
  uygulanıyor, paket imzası doğrulanıyor" kabul kriteri bu yüzden zaten
  var olan mekanizmanın bir kompozisyonu.
- `agent/updatePackage.js`: güncellemeye özgü ek denetimler — manifest
  şekli (`file`+`checksum` zorunlu) ve sürüm monotonluğu (eski/eşit
  sürüm, operatör onaylasa ve imza geçerli olsa BİLE reddedilir — ek
  güvenlik katmanı).
- `registerUpdateHandler`: gerçek dosya uygulaması (`applyMigration`)
  enjekte edilir — K4'ün migration runner'ı (henüz `todo`) hazır
  olduğunda buraya bağlanacak. Bu ayrım bilinçli: D9 "ne zaman ve kimin
  onayıyla" sorusunu çözer, "dosyalar nasıl uygulanır" K4'ün işi.

Uçtan uca entegrasyon testi: onay atlanırsa red, onaylanınca uygulanır,
eski sürüm onaylansa bile reddedilir.

TDD: 12 yeni test, tamamı önce kırmızı. Suite 252/252. (D9)

**D akışı (dokümantasyon, destek, bakım ajanı — 9 kart) TAMAMLANDI.**
Kalan: D1-D5 (yazılı doküman, video, chatbot, ticket sistemi) — bu
oturumun kapsamı dışında, ayrı bir üretim/içerik işi.

### D1 — Yazılı dokümantasyon
- `docs/product/` (7 dosya): kurulum, yapılandırma, modül sistemi,
  oyun matematiği, API referansı, SSS. Gerçek sistemin bugünkü
  durumunu yansıtır — henüz yapılmamış işleri (Docker kurulumu,
  panelden modül satın alma, panelden RTP ayarı, tam çeviri) varmış
  gibi göstermez, her belgede "bugün ne var, ne yok" açıkça ayrılmış.
- `.env.example`'daki kullanılmayan `ODDS_API_KEY` kalıntısı belgelerde
  not düşüldü (temizlenmesi ayrı bir iş).

Not: içerik yazımı, kod gibi kırmızı/yeşil TDD döngüsüne tabi değil —
doğrulama yöntemi farklıydı: her iddia, ilgili kaynak dosya (route
listesi, .env.example, crashGame.js vb.) okunarak teyit edildi. (D1)

## [0.1.0] — 2026-08-20

İlk sürüm çizgisi. Ürün yol haritasının (52 kart, 9 alan) başlangıç
noktası; çekirdek platform, 13 in-house oyun ve mevcut admin paneli bu temeli
oluşturur.
