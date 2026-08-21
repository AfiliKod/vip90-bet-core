# Changelog

VIP90.bet iGaming Platform — değişiklik günlüğü.

Biçim [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) esasına,
sürümleme [Semantic Versioning](https://semver.org/lang/tr/) kuralına dayanır.
Bu günlük yalnızca `feat/integration` dalındaki ürün
geliştirmelerini kapsar; canlı işletilen sitenin bakımı `dev` dalında sürer.

Madde formatı ve kategoriler için `docs/CHANGELOG_GUIDE.md`'ye bakın —
özellikle **Kırılan Değişiklikler** kategorisi zorunludur, atlanmaz.

## [Yayınlanmadı]

### T4/T5 — Tamamlama: oddsSource/BGaming demo oyun vitrini tamamen kaldırıldı
Aşağıdaki T4 (kısmi) ve T5 kritik bulgu maddelerini kapatır. Palace
casino entegrasyonu (T3) pazara sürülecek üründen çıkarıldığı için,
Palace'tan önceki dönemde deneme amaçlı kurulmuş bu vitrin sistemi
artık hiçbir işlevsel amaca hizmet etmiyordu (oddsSource sadece spor bahis
oranı kaynağı olarak kalıyor — bu kaldırma onu etkilemez).

**Kaldırıldı:**
- `client/src/data/casinoGames.js` (19.952 satır, 1.994 kayıt) — 657
  Pragmatic Play + 969 BGaming kaydı, 646 doğrudan `pragmaticplay.com`
  CDN hotlink'i içeren lisanssız üçüncü taraf veri kümesi.
- `client/src/pages/CasinoGame.jsx` ve `/casino/:gameSymbol` rotası.
- `client/public/images/pragmatic-play/*` (8 dosya) — lisanssız, artık
  hiçbir yerden referans alınmıyor.
- `client/src/pages/HomePage.jsx`: anasayfadaki "Pragmatic Play
  Oyunları" tanıtım bölümü.
- `server/src/services/oddsSourceService.js`, `server/src/services/
  streamService.js` — oddsSource/BGaming oyun sayfalarını canlı proxy'leyip
  CDP screencast ile yayınlayan sunucu-taraflı tarayıcı otomasyonu.
- `server/data/oddsSource-games.json` (3,2 MB) — oddsSource oyun kataloğu.
- `server/src/routes/casino.js`: `/game/:gameId`, `/relay`, `/cdn/*`,
  `/launcher-proxy/*`, `/logo-stub.js`, `/oddsSource-game/:id`,
  `/oddsSource-games`, `/oddsSource-launch`, `/swintt-proxy`,
  `/broken-games`, `/broken-game` — hepsi yalnızca kaldırılan vitrin
  tarafından kullanılıyordu. `POST /api/casino/spin` (in-house oyun
  bakiye güncellemesi) korundu, `useSlotGame.js` hâlâ bağımlı.

### Kırılan Değişiklikler
- `GET /api/casino/game/:gameId`, `ALL /api/casino/relay`,
  `GET /api/casino/cdn/*`, `GET /api/casino/launcher-proxy/*`,
  `GET /api/casino/logo-stub.js`, `GET /api/casino/oddsSource-game/:id`,
  `GET /api/casino/oddsSource-games`, `POST /api/casino/oddsSource-launch`,
  `POST /api/casino/swintt-proxy`, `GET /api/casino/broken-games`,
  `POST /api/casino/broken-game` uç noktaları kaldırıldı — hepsi 404
  döner. Bu uçlar yalnızca artık kaldırılmış demo vitrini tarafından
  çağrılıyordu; hiçbir yayınlanmış API sözleşmesinin parçası değildi.
- `/casino/:gameSymbol` istemci rotası kaldırıldı, artık 404/yönlendirme.
- Socket.IO `/stream` namespace'i (`stream:start/input/spin/stop`
  event'leri) kaldırıldı — yalnızca kaldırılan vitrin kullanıyordu.
- Anasayfadaki (`/`) "Casino — Pragmatic Play Oyunları" bölümü artık
  görünmüyor.

Tam depo çapında test suite (23/23 suite) ve `client` build'i bu
değişiklikten sonra hatasız geçti.

### T5 — Varlık lisans denetimi
- `docs/product/08-varlik-lisans-denetimi.md`: `client/public/`'teki her
  dosya için kaynak + lisans durumu, `git log --follow` ile doğrulanmış.
- **Kritik bulgu:** `client/src/data/casinoGames.js` (19.952 satır,
  1.994 kayıt) lisanssız üçüncü taraf içeriği barındırıyor — 657 kayıt
  Pragmatic Play, 969 kayıt BGaming ibaresi geçiriyor, 646 kayıt
  doğrudan `pragmaticplay.com` CDN'ine hotlink. Commit geçmişi
  (`4b3b764`) bunun bilinçli bir kopyalama olduğunu gösteriyor, kaza
  değil. Üç sayfa (`CasinoGame.jsx`, `HomePage.jsx`, `Casino.jsx`) bu
  veriye doğrudan bağımlı. **Bu oturumda düzeltilmedi** — ayrı, düzgün
  kapsamlı bir kart gerektiriyor (bkz. belge).
- 13 in-house oyun görseli (26 dosya) ve spor görselleri (8 dosya)
  AI-üretimi olarak doğrulandı (FLUX.1-schnell / image-gen commit
  etiketleri) — güvenli.


### T4 — Ölü veri ve dosya temizliği (kısmi)
- Silindi: `server/src/data/oddsSource-events.js` (1.110.619 satır),
  `server/src/data/rakipsite-events.js` (1.798 satır), `server/src/
  utils/sportdigi.js` (36 satır, kullanılmayan), `server/src/backups/
  oddsSourceService.js.bak`, `server/src/backups/casino.js.bak`. Hiçbiri
  hiçbir yerden import edilmiyordu — sıfır işlevsel etki, suite 288/288
  değişmedi. Toplam 1.114.475 satır repo'dan çıktı.
- **Bu kart `done` değil, kasıtlı olarak.** Kabul kriteri ("hiçbir
  üçüncü taraf marka adı geçmiyor") beklenenden çok daha büyük bir
  kapsam ortaya çıkardı: oddsSource yalnızca bahis oranı kaynağı değil,
  `services/oddsSourceService.js` + `services/streamService.js` üzerinden
  **ayrı bir casino oyun akışı sağlayıcısı** olarak da gömülü — bu iki
  ayrı sistemin (odds senkronizasyon motoru + casino akışı) sökülmesi
  gerekiyor. Yarım bırakılmış bir çıkarma, çalışan bir sistemi
  kırma riski taşıdığı için burada durduruldu; kalan iş için önerilen
  takip kartları kullanıcıya iletildi (bkz. sohbet geçmişi).


### T2 — Lisanslı feed sağlayıcısı, ilk gerçek adaptör
- `services/oddsProviders/theOddsApiProvider.js`: The Odds API adaptörü,
  T1'deki oddsSource adaptörüyle aynı sözleşmeye (NormalizedEvent) uyuyor.
  Sağlayıcı canlı/yaklaşan ayrımını ayrı uçlarla vermediği için
  `commence_time`'a göre sınıflandırma yapılıyor (basitleştirilmiş
  sezgisel — kesin dakika-bazlı canlı skor bu sağlayıcıdan gelmiyor,
  oddsSource'in nodeupd akışının aksine).
- `oddsProviders/index.js`: kayıt defterine eklendi.
  `ODDS_PROVIDER=theoddsapi` ile aktif hale geliyor — kaynağı
  değiştirmek env değiştirmekten ibaret, sync job'ı hiç değişmiyor
  (T1'in kurduğu ayrışmanın kanıtı).
- `ODDS_API_KEY` artık gerçekten kullanılıyor — önceki sürümde
  "kullanılmayan kalıntı" olarak işaretlenmişti, docs/product/
  02-yapilandirma.md düzeltildi.

TDD: 9 yeni test, tamamı önce kırmızı. Suite 288/288. (T2)


### D2 — Video kütüphanesi storyboard'ları (kısmi)
- `docs/product/07-video-storyboardlari.md`: 18 video için sahne-sahne
  storyboard (ekran + anlatım + süre), D2'nin istediği 15-20 aralığında.
  Yalnızca bugün var olan özellikler storyboard'landı; K2/M2/M3/O6/D5-
  istemci'ye bağlı videolar açıkça "bekliyor" işaretlendi.
- **Bu kart `done` değil, kasıtlı olarak.** Kabul kriteri ("her ana
  akışın bir videosu var, ürün sayfasına gömülü") gerçek video dosyası
  ve embed gerektiriyor — bunları üretecek yetenek (kayıt/kurgu) bu
  oturumda yok. Storyboard'lar, geliştirme sürecinin sonunda
  araştırılacak bir video üretim aracının üzerine kurulacağı temel.


### D3 — Ürüne hakim chatbot
- `services/chatbotKnowledge.js`: docs/product/ ve CHANGELOG.md'yi
  başlıklara göre parçalayan `chunkMarkdown`, terim örtüşmesine dayalı
  `searchKnowledge`. Vektör/embedding altyapısı yok — bilinçli kapsam
  kararı, küçük doküman kümesinde terim örtüşmesi yeterli sinyal verir.
- `services/chatbot.js`: `answerQuestion` — alakalı hiçbir doküman
  parçası bulunamazsa **LLM'e hiç gidilmez**, deterministik bir
  yönlendirme mesajı döner. "Bilmediğinde insana yönlendiriyor" kabul
  kriteri bir prompt talimatına değil, koda dayanır. Sistem prompt'u
  her seferinde güncel sürüm numarasını taşır (sürüm farkı kriteri).
- `routes/help.js`: eskiden VIP90.bet'e özgü, ürünle bağlantısız sabit
  bir prompt kullanıyordu — artık gerçek dokümanlara köklenmiş.
- `LiveHelp.jsx`: `escalated` bayrağı görsel olarak ayırt ediliyor.
  Oyuncuya dönük ticket oluşturma ekranı (D5'in istemci tarafı) henüz
  yok — bu yüzden işlevsiz bir "ticket aç" linki eklenmedi, yalnızca
  dürüst bir görsel işaret var.

TDD: 14 yeni test, tamamı önce kırmızı. Suite 279/279. Build başarılı. (D3)

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
