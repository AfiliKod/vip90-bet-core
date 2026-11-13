# Changelog

VIP90.bet iGaming Platform — değişiklik günlüğü.

Biçim [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) esasına,
sürümleme [Semantic Versioning](https://semver.org/lang/tr/) kuralına dayanır.
Bu günlük `main` dalına giren her değişikliği kapsar.

**1.0.0 öncesi sürümler.** 0.x geçmişi, `main`'e merge edilen 164 pull
request'in her biri kendi sürümü ve kaydıyla, merge sırasına göre 0.0.0'dan
1.0.0'a doğrusal yerleştirilerek kuruldu:
k'inci PR'ın sürümü `0.⌊(k−1)·100/163⌋`, aynı minor'a düşen sonraki PR'lar
patch alır. Tarihler merge tarihidir. 1.0.0'dan itibaren sürümler SemVer'e
göre kesilir.

Madde formatı ve kategoriler için `docs/CHANGELOG_GUIDE.md`'ye bakın —
özellikle **Kırılan Değişiklikler** kategorisi zorunludur, atlanmaz.

## [Yayınlanmadı]

### İP-9d: Net Gaming Revenue (NGR) tanımları, kesinti motoru ve partner faturalaması (K28)
**Kırılan Değişiklikler**
- **Partner ve bağlantı ticari koşullarında artık yerleşik bir oran (`0.15`) yoktur.** Ticari model ve oranı açıkça yapılandırın; `ngr` tabanı ayrıca bir NGR tanımı gerektirir.
- **`chargebacks` ve `providerFees` alanlarının henüz veri kaynağı yoktur.** İkisi de `0` varsayılır; gerçek bir kaynak eklenene kadar oran veya sabit kesinti yapılandırın. İadeler ve ters kayıtlar chargeback sayılmaz.

**Eklendi**
- Platform düzeyinde sürümlü `NgrDefinition` modeli, kesinti kategorileri (`bonus`, `provider_fee`, `tax`, `chargeback`, `other`) ve veri kaynakları (`stat_field`, `fee_plan`, `rate`, `fixed`).
- Çift kesinti koruması: kaydetme ve hesaplama anında kategori/kaynak tekilliği ile `ggrAlreadyNetOf` kontrolü.
- Kesinleştirilmiş ekstrelerde kullanılan NGR tanım sürümlerinin dondurulması; hesaplamada tamsayı sent hassasiyeti, negatif NGR taban stratejileri ve ekstre satırlarında kalem dökümü.
- Platform Konsolu'nda NGR tanım yönetimi; Partner Portalı ve CSV dışa aktarımında kesinti dökümü görünürlüğü.
### Tek modda canlı yönetim akışı varsayılan kiracı olmadan da çalışıyor

**Düzeltildi**
- **Varsayılan kiracı henüz oluşmamış tek modlu kurulumda yöneticiler canlı yönetim odasına katılamıyordu** (`server/src/socket/handler.js`): İP-7'den sonra `subscribe:admin`, sokete kiracı bağlı değilse hiçbir şey yapmıyordu; aktivite, KYC, destek bildirimleri ve kuyruk sayaçları canlı gelmiyordu. Tek modda bağlamsız soket artık eskisi gibi genel yönetim odasına katılır (izin kontrolü aynı: `admin:activity:read`). Çok modda kiracısız soket yine reddedilir.

### İP-9c: komisyon, faturalama ve platform çapraz raporları
**Eklendi**
- Operatör oran beslemesi maliyet planları, partner ekstreleri, gün bazında geçerli ticari koşullarla GGR komisyon hesaplama, ekstre yaşam döngüsü, denetimli düzeltmeler ve platform/partner raporları eklendi.
- Ticari model, oranlar, sabit ücretler ve negatif GGR davranışı yapılandırmadandır; kurulum sahibi S3 kapsamındaki ticari koşulları doğrulamalıdır.

### İP-9b: partner yönetimi, partner portalı ve denetimli operatör erişimi
**Kırılan Değişiklikler**
- **`TENANCY_MODE=single` kurulumlar için kırılan değişiklik yoktur.** Partner API'si (`/api/partner/*`) tek modda `404` döner; mevcut tek operatörlü akışlar değişmez.

**Eklendi**
- Partner modelleri (`Partner`, `PartnerOperatorLink`, `PartnerGrant`), ticari modeller ve etkin operatör bağlantısı için kısmi bileşik indeks.
- Partnerlerin kendi operatörlerini kota, modül ve yetki tavanları içinde sağlaması; sağlayan partner atfı ve yaşam döngüsü sınırları.
- Yeni `partner:*` ve `admin:partner-grants:*` izin anahtarları; partner personeli çok kiracılı modda 2FA ile erişir.
- `TenantDailyStat` toplamlarıyla partner metrikleri ve `activePlayers < 5` için küçük hücre gizleme.
- Süresi en fazla 90 gün olan `PartnerGrant`, denetim kaydı ve partnerlerin finansal işlemlerden/sahip olunan operatörlerdeki kendine rol atamasından korunması.
- Konsolda partner kapsamlı portal ekranları ve satış-partneri akışını gerçek HTTP API üzerinde doğrulayan kabul paketi.

### İP-9a: Platform Sahibi konsolu — kurulum, operatör sağlama, alan adı doğrulama, canlıya geçiş ve denetim
**Kırılan Değişiklikler**
- **`TENANCY_MODE=single` kurulumlar için işlem gerekmez.** Platform API'si (`/api/platform/*`) ve Platform Sahibi konsolu (`/console`) yalnız `TENANCY_MODE=multi` altında sunulur; tek modda her ikisi de `404` döner. Mevcut tek operatörlü akışlar, uçlar ve yanıt gövdeleri değişmez, yeni bir ortam değişkeni tanımlamak gerekmez.
- **Yeni ortam değişkeni `PLATFORM_HOST`.** Tanımlıyken `/api/platform/*` ve `/console` yalnız bu ana makinede servis edilir; bir kiracı alan adı bu yolları hiçbir zaman sunmaz (istek kiracı çözümlemesinden geçer). Tanımsızken (geliştirme) platform isteğine yalnız yol öneki karar verir. Çok kiracılı üretim kurulumunda konsolu kendi ana makinenizde yayınlamak için `PLATFORM_HOST`'u konsol adresine ayarlayın.
- **Yeni ortam değişkeni `SCOPE_GATE_ENV`.** `staging`/`production` gibi bir değer verildiğinde N6 kapsam ihlali telemetrisi (`ScopeGateDay`) kaydedilir; tanımsızken hiçbir şey yazılmaz. Canlıya geçiş kapılarını ölçmek için ayarlayın.
- **`AUDIT_RETENTION_DAYS` çok kiracılı modda en az 1825 (5 yıl) olmalıdır.** `TENANCY_MODE=multi` iken 1825'ten küçük bir değer açılış doğrulamasını düşürür (`AUDIT_RETENTION_DAYS must be at least 1825`); `AuditLog` TTL süresi ve kapanış sonrası yasal saklama (`legalRetentionUntil`) her durumda 1825 güne tabanlanır. **Mevcut bir veritabanında `AUDIT_RETENTION_DAYS` değerini değiştirmek, daha önce kurulmuş TTL indeksini kendiliğinden güncellemez:** `expireAfterSeconds`'ı yeni değere çekmek için indeks üzerinde `collMod` uygulayın (ör. `db.runCommand({ collMod: 'auditlogs', index: { name: 'createdAt_-1', expireAfterSeconds: <gün×86400> } })`). Tek modda varsayılan saklama (365 gün) değişmez.

**Eklendi**
- **N1 — platform kurulumu** (`server/src/platform/bootstrap.js`, geçiş `platform-001-bootstrap`): boş bir çok kiracılı veritabanında yetki kataloğunu, kapsamlı rol şablonlarını ve platform `Setting` satırlarını (`platform_initialized`, `audit_retention_days`) bir kez kurar; kiracı oluşturmaz. İdempotenttir: ikinci çalıştırma `alreadyApplied` döner.
- **N2 — ilk Platform Sahibi CLI'ı** (`scripts/platform-bootstrap.mjs`): `bootstrapFirstPlatformOwner` ilk `platform_owner` hesabını ve rol atamasını oluşturur; parola komut satırından alınmaz (`--password-stdin`). 2FA kurulu başlamaz ve ilk girişte zorunlu kayıt akışını tetikler. İkinci çalıştırma `alreadyInstalled` bildirir, hesap çoğaltmaz.
- **N4 — operatör sağlama** (`POST /api/platform/tenants`, `server/src/platform/services/provisioningService.js`): `provisioning` durumunda bir `Tenant`, varsayılan `Brand`, TXT doğrulama jetonlu doğrulanmamış birincil `Domain`, temel kiracı alt kümesi ve tek kullanımlık davetiyeli bir sahip `StaffAccount`'u oluşturur. Aynı anahtarla tekrar çağrı güvenlidir; sahip davetiyesi yalnız ilk oluşturmada döner (`ownerInviteUrl`). Sağlama sırasında kiracı yalnız personel yollarını sunar, oyuncu trafiği `503 TENANT_NOT_READY` alır.
- **K25 — alan adı doğrulama ve TLS** (`server/src/platform/services/domainService.js`, `cloudflareSaaS.js`): `POST /api/platform/tenants/:id/domains/:domainId/verify-dns` sahipliği `_domain-verify.<host>` (ya da çıplak host) TXT kaydıyla doğrular ve `verifiedAt` damgalar; `sync-tls` Cloudflare for SaaS sertifika durumunu çeker. Doğrulanmamış alan adı kiracıya çözülmez (`404 TENANT_NOT_FOUND`).
- **N5 — canlıya geçiş kontrol listesi** (`server/src/platform/services/goLiveChecklist.js`, K22): tüzel kişi, PSP sandbox, KYC webhook, e-posta gönderimi ve alan adı TLS kapılarını değerlendirir; yazılı sağlayıcı onayı yalnız `casino-content`/`igames` modülüne yetkili kiracılarda istenir. Liste tamamlanmadan `active` geçişi `409 CHECKLIST_INCOMPLETE` döner.
- **K26 — kiracı durum geçişleri** (`server/src/platform/services/tenantLifecycle.js`): `provisioning → active|closed`, `active ⇄ suspended`, `closed` terminal. `PATCH /api/platform/tenants/:id/status` geçiş matrisini uygular; kapanışta `closedAt` ve en az 5 yıllık `legalRetentionUntil` yazılır. Askıya alınmış kiracı `503 TENANT_SUSPENDED`, kapalı kiracı `404 TENANT_CLOSED` döner.
- **K23 — süreli, denetlenen yazma istisnası** (`PlatformWriteGrant`): platform personeli kiracı uçlarında varsayılan olarak salt okunurdur; `POST /api/platform/tenants/:id/write-grants` (yalnız Platform Sahibi, en fazla 24 saat, gerekçe zorunlu) aktif bir grant verildiğinde yazmayı `PLATFORM_WRITE_EXCEPTION` denetim satırıyla mümkün kılar. Grant süresi dolunca ya da iptal edilince yazma yeniden `403 PLATFORM_READ_ONLY` olur.
- **N6 — kapsam kapısı telemetrisi** (`server/src/platform/services/scopeTelemetry.js`, `GET /api/platform/system/scope-gates`): `ScopeGateDay` her UTC gününde kapsam ihlallerini sayar; kapılar staging'de 14, production'da 7 ardışık temiz gün ister.
- **Platform API'si ve konsol sunumu** (`server/src/platform/routes/index.js`, `server/src/app.js`): kiracı/domain/personel yönetimi uçları `requireStaff('platform')` ve `platform:*` yetkileriyle korunur; konsol SPA'sı yalnız multi modda, production'da ve platform ana makinesinde servis edilir.
- **Uçtan uca kabul paketi** (`server/test/platformConsoleAcceptance.test.js`): gerçek HTTP API'sini multi+enforce altında N1→N2→N4→N5→K23→K24→N6 boyunca sürer; her adım iki kez koşarak idempotence'ı doğrular, DNS ve TLS'i enjekte edilmiş sahtelerle değiştirir.

**Güvenlik**
- **Platform personeli kiracı uçlarında salt okunur (K23):** yazma denemesi `403 PLATFORM_READ_ONLY` döner ve aktör/kiracı/rota/yöntemle bir `AuditLog` satırı yazar; istisna yalnız süreli, gerekçeli ve denetlenen `PlatformWriteGrant` ile açılır.
- **Sahip devri koruması:** zaten giriş yapmış bir kiracı sahibi (`lastLoginAt` dolu) platform personeli tarafından yeniden davet edilemez (`409 OWNER_ALREADY_ACTIVE`); sahip parolasını kendisi sıfırlar.
- **Personel 2FA'sı çok kiracılı modda zorunlu:** `amr` içinde `otp` olmayan hiçbir personel erişim token'ı kabul edilmez (`403 TWO_FACTOR_REQUIRED`).

### İP-8: çok kiracılı modda zorunlu `enforce`, kiracı bazlı manifest ve başlık, yasal tüzel kişi
**Kırılan Değişiklikler**
- **Site adı ayarlanmamış tek modlu kurulumlar artık yerleşik ürün adını değil kiracı adını gösterir.** Çekirdek marka nötrdür: `branding.siteName` boşsa sunucu ve istemci kiracının `name` değerine düşer, o da yoksa kurulum adresinin (`CLIENT_URL`) host'una. Eski görünümü korumak için admin panelinde **Marka → Site adı** alanını doldurun (tek modda varsayılan kiracının adı `Default`'tur). Veri geçişi gerekmez, yalnız ayar gerekir.
- **`TENANCY_MODE=multi` kurulumlar `TENANCY_ENFORCEMENT=log` veya `off` ile çalışamaz.** Çok kiracılı modda zorlama her zaman `enforce`'dur; açıkça `log`/`off` verilirse açılış doğrulaması bunu hata olarak raporlar ve süreç durur. `.env`'inizde `log` ya da `off` yazıyorsa satırı silin veya `enforce` yapın. Tek modlu kurulumların varsayılanı değişmez: G3 geri doldurması tamamlandıysa `log`, değilse `off`.

**Eklendi**
- **Tek modda isteğe bağlı `enforce` (G8):** `TENANCY_MODE=single` ile `TENANCY_ENFORCEMENT=enforce` açıkça verilebilir; kiracı kapsamı olmayan sorgular `TenantScopeError` fırlatır. Açıkça değer verilmediğinde tek modun davranışı bugünküyle aynıdır.
- **Kiracı bazlı dinamik PWA manifest'i** (`server/src/controllers/manifestController.js`, `server/src/routes/manifest.js`): `GET /manifest.webmanifest` ve `GET /site.webmanifest` istek host'unun kiracısına göre `name`, `short_name` ve tema rengini üretir; site adı ve renk kurulumun kendi marka ayarlarından okunur, ayar yoksa kiracı adı kullanılır. Rota `express.static`'ten **önce** bağlanır, böylece derleme zamanında üretilen manifest çok kiracılı istemciye servis edilmez.
- **`index.html` başlığı ve OpenGraph etiketleri sunucuda kiracı bazında üretiliyor** (`server/src/seo/http.js`, `server/src/seo/render.js`): SPA fallback her istekte `<title>`, `og:title`, `og:site_name` ve `og:url` etiketlerini enjekte eder — SEO kaydı hiç olmasa bile. Marka ayarı da boşsa başlık tarafsız biçimde istek host'una düşer; çekirdek ürün adı üretilmez.
- **Yasal metinler `Tenant.legalEntity`'den geliyor:** `GET /api/branding` artık `legalEntity` (ad, sicil no, adres) ve `tenantName` döner; istemcinin yasal ve şirket sayfaları bu değerleri kullanır. Varsayılan kiracı için `LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_REGISTRATION_NO` ve `LEGAL_ENTITY_ADDRESS` ortam değişkenleri eklendi — yalnız kiracı **ilk oluşturulurken** okunur, sonraki açılışlarda DB'deki değer korunur. Çekirdekte tüzel kişi sabiti yoktur.

**Değişti**
- **İstemcideki sabit marka geri dönüşleri kaldırıldı** (`Navbar`, `Footer`, `LiveHelp`, `HomePage`, `Login`, `PromoHeroSlider`, `client/src/seo/titles.js`): site adı artık marka deposundan gelir, ayar yoksa kiracı adı kullanılır; ürün adı geri dönüş sabiti kalmaz.

### İP-7: işler, soketler, kampanya kitleleri ve önbellekler kiracıya göre
**Kırılan Değişiklikler**
- **`TENANCY_MODE=single` kurulumlar için işlem gerekmez.** Varsayılan kiracı oluştuysa (`G1`) bütün akışlar o kiracının tek odasına ve tek önbellek anahtarına gider; tek kiracılı kurulumlarda bu, bugünkü davranışla aynıdır. Varsayılan kiracı henüz yoksa (G1 çalışmamış) eski oda adları (`role:admin`, `room:<roomId>`) ve global istemci yayını (`clientsRoom()` → `null`), ayrıca `g:` önbellek öneki korunur; hiçbir yayın atlanmaz.
- **Özel istemci kodu `role:admin` odasını dinliyorsa yeni kiracı yönetim odasına (`t:<tenantId>:admin`) geçmeli.** Yönetim bildirimleri (`activity:*`, `ticket:*`, `kyc:*`, `admin:counts`) artık `server/src/socket/publish.js` üzerinden yalnız o kiracının yönetim odasına gider; `clients` (`online:count`, `winners:new`, `bot:action`, `chat:*`, `game:update`, `activity:update`) ve `/live` odaları da kiracı önekini taşır (`t:<tenantId>:clients`, `t:<tenantId>:chat:<roomId>`, `t:<tenantId>:live:<gameId>`). Resmî istemci güncel sürümle birlikte gelir; yalnız kendi istemci kodunuz eski oda adlarını elle dinliyorsa değiştirmeniz gerekir.

**Eklendi**
- **Zamanlanmış işler kiracı başına sıralı çalışıyor** (`server/src/tenancy/forEachTenant.js`): bonus çevrim süresi (`bonusExpiry`), KYC süresi (`kycExpiry`), kripto çekim uzlaştırma (`cryptoWithdrawalReconcile`), kapanmış oyun oturumlarının kapatılması (`closeStaleGameSessions`) ve zamanlanmış e-posta/SMS gönderimi her etkin kiracı için kendi bağlamında (`runWithTenant`) bir kez koşar; bir kiracının hatası `error` olarak kaydedilir ve döngü diğer kiracılarla devam eder. Askıya alınmış/kapalı kiracılar atlanır.
- **Etkinlik bakımı platform kapsamında** (`server/src/jobs/cleanup.js`): arşivleme, bayat/işaretli `upcoming` temizliği ve iptal edilmiş etkinliklerin silinmesi `Event` kataloğuna ait platform verisi olduğu için `runAsPlatform('event-cleanup')` ile yürür ve kiracı döngüsüne dahil edilmez.
- **Tek soket yayın yüzeyi `server/src/socket/publish.js`:** `publishToRoom`, `publishToTenant`, `publishToTenantAdmins` ve `publishToAllTenants`. Canlı skor/oran gibi gerçekten platform geneli güncellemeler (`startLiveSimulation`, admin `odds:update`) `publishToAllTenants` ile etkin kiracıları tek tek sayar, `io.emit` kullanmaz.
- **Soket kiracı bağlaması** (`server/src/socket/tenant.js`): `/`, `/live` ve `/chat` ad alanlarındaki her socket, el sıkışma Host'undan (tek mod: varsayılan kiracı) kiracıya bağlanır (`socket.request.tenant`, `socket.data.tenantId`) ve her paket geri çağrısı `runWithTenant` içinde koşar, böylece `tenantScoped` eklentisi ve etkinlik kaydı bekleme noktalarından sonra da doğru kiracıyı görür. `subscribe:admin` yalnız o kiracının yönetim odasına alır: kiracı kapsamlı bir personel token'ı başka kiracının odasına katılamaz (`admin:activity:read` yetkisi kiracı kapsamında değerlendirilir).
- **Sohbet odaları kiracı önekli:** `chat:join` odayı kiracı bağlamında doğrular ve `t:<tenantId>:chat:<roomId>` odasına alır; mesaj, silme, susturma/yasaklama ve yağmur yayınları aynı odadan gider.
- **E-posta/SMS kampanya kitleleri kiracıya filtreleniyor** (`server/src/services/systemMail.js`, `server/src/services/smsTemplate.js`): `resolveAudience` ve `resolveRecipients` sorgularına etkin kiracı açıkça eklenir (`TENANCY_ENFORCEMENT=log` iken de), böylece başka kiracının segmenti sıfır alıcı çözer. Zamanlanmış gönderimler kiracı başına bir kez koşar.
- **Bot zamanlayıcısı kiracıyı loopback çağrısında taşıyor** (`server/src/services/internalApi.js`, `bot.js`): in-house bahis çağrısı `X-Internal-Tenant` ve yapılandırılmışsa `X-Internal-Token` başlıklarını gönderir; `X-Internal-Tenant` yalnız loopback adresinden ve birebir eşleşen `INTERNAL_API_TOKEN` ile kabul edilir, başlık `resolveTenantHost()`'tan önce çözülür. Bots, sahte kazananlar ve demo verisi `TENANCY_MODE=multi` iken hiç başlamaz; `DEMO_*` bayrakları yanlışlıkla açık olsa da etkisizdir.
- **Önbellekler kiracıya anahtarlanıyor** (`server/src/services/mailTemplates.js`, `server/src/services/casinoStatsService.js`): posta şablonu ve popüler oyun önbellekleri `cacheKey`/`cachePrefix` ile `t:<tenantId>:` altında tutulur (varsayılan kiracı yoksa `g:`), popüler oyun sorgusu `tenantId` filtresi taşır.
- **CI lint `node scripts/lint-tenant-sockets.mjs`** (`npm run lint:tenant-sockets`): `server/src` içinde global `io.emit(` çağrısını ve `role:admin` oda adını (tek istisna: `tenantKeys.js`'teki `LEGACY_ADMIN_ROOM` tanımı) her PR'da hata olarak işaretler.

**Güvenlik**
- **İç kiracı başlığı yalnız loopback ve eşleşen token ile güvenilir:** `INTERNAL_API_TOKEN` tanımlı değilken `X-Internal-Tenant`/`X-Internal-Token` hiçbir etki yapmaz; sahte başlık, yanlış token ya da loopback dışı bir kaynak isteği kiracı bağlamadan geçirir (bilinmeyen/etkin olmayan kiracı kimliği `404 TENANT_NOT_FOUND`).

### İP-6: callback atfı — Slikair kayıttan, Sumsub URL'den, eklenti callback'leri kiracıya göre
**Kırılan Değişiklikler**
- **`TENANCY_MODE=single` kurulumlar için işlem gerekmez.** Eski callback adresleri (`/api/webhook/sumsub`, in-house `/callback`, igames `/callback`, Slikair webhook'u) kiracı parametresi olmadan da varsayılan kiracıda bugünkü gibi çalışır; mevcut imza, HMAC ve IP kontrolleri gevşetilmez ve mevcut entegrasyonların yapılandırması değişmez.
- **Çok kiracılı operatörler Sumsub webhook adresini kiracı kapsamlı biçime taşımalı.** `TENANCY_MODE=multi` altında webhook adresi `/api/webhook/sumsub/:tenantId` (`tenantId` kiracının kimliği ya da anahtarı) olmalıdır; kiracı parametresiz eski adres `400` ile reddedilir. Her kiracının Sumsub panelinde kendi webhook adresini ve o kiracının webhook sırrını tanımlaması gerekir.

**Eklendi**
- **Slikair bildirimleri kayıtlı kayıttan kiracıya atfediliyor:** `payin`/`payout` webhook'u kiracı bilgisi taşımadığından `SlikairPayment`/`SlikairPayout` kaydı üzerinden çözülür ve durum doğrulaması ile bakiye hareketleri o kiracının Slikair kimlik bilgileriyle, kiracı bağlamında (`runWithTenant`) koşar; işlem anahtarı kiracıyı içerir (`slikair_payin_<tenantId>_<payinId>`). Çok kiracılı modda kiracısı belirlenemeyen kayıt hiçbir bakiyeye dokunmaz ve işlem yazmaz (spec §9 G-4).
- **Sumsub webhook kiracı URL'si ve gövde ayrıştırmasından önce sır seçimi:** `kycConfig` kiracı kapsamlı sırrı (`SUMSUB_WEBHOOK_SECRET`) döner, imza ham gövde üzerinde ilgili kiracının sırrıyla doğrulanır; webhook gövdesindeki `externalUserId` o kiracıya ait değilse `404` döner ve KYC durumu değişmez.
- **Çekirdek eklentilere callback atıf yardımcılarını açıyor:** `findPaymentForCallback`, `findPayoutForCallback` ve `tenantFilter`, `runWithTenant`, `runAsPlatform`, `defineTenantModel` ile birlikte `server/src/tenancy/index.js` üzerinden ihraç edilir.
- **Igames ve in-house eklentileri (ayrı özel depolar) callback'lerini kiracıya göre işliyor:** igames kiracı başına agent hesabı ve kimlik bilgileriyle (K13, K22) `/callback/:tenantId` uçunda kiracının callback token'ını doğrular, oyuncuyu `{tenantId, palaceUserCode}` ile arar ve tur ile ledger satırını kiracı damgasıyla yazar; in-house sağlayıcı `/callback/:operatorKey` uçundaki operatör anahtarını `Tenant.providerOperatorId` ile kiracıya eşler, imzayı operatörün `walletCallbackSecret` değeriyle doğrular ve oyuncunun o kiracıya ait olduğunu kontrol eder. In-house game-host temasını başlatma (launch) token'ından alabilir; token'da tema yoksa mevcut tema kaynağı ve varsayılan görünüm aynen korunur (Y4).

### İP-5: para ve yönetim uç noktaları kiracı kapsamı, `TenantDailyStat` ve tenancy lint
**Kırılan Değişiklikler**
- **`TENANCY_MODE=single` kurulumlar için işlem gerekmez.** Tek modda kiracı filtresi uygulanmaz: `:id` aramaları bugünkü sorguyu korur, başka kiracıya ait bir kayıt kavramı yoktur ve mevcut akışlar, yanıt kodları ve hata kodları değişmez. Tek bir ortam değişkeni tanımlamak ya da geçiş koşmak gerekmez.
- **Tek modda yükseltmeden sonra log uyarıları görünebilir.** G3 geri doldurma (`tenancy-002-backfill-tenant-id`) tüm koleksiyonlarda `completed` olarak kaydedildiyse ve `TENANCY_ENFORCEMENT` açıkça elle verilmediyse tek modun varsayılanı artık `log`'dur (G7): kiracı bağlamındaki sorgulara `{ tenantId }` eklenir ve kapsamsız sorgular `TenantScopeError` fırlatmadan loglanır. Bu satırlar model ve işlem başına dakikada en fazla bir kez yazılır, tek modlu akış kesilmez; gürültüyü tamamen susturmak için `TENANCY_ENFORCEMENT=off` yeterlidir. G3 henüz tamamlanmadıysa varsayılan eskisi gibi `off` kalır.

**Eklendi**
- **G-3 — `:id` aramaları kiracıya göre kapsanıyor (İP-5):** Para (banka yatırımı, kripto çekim onayı, Slikair payout, bakiye düzeltmesi), yönetim (KYC, kullanıcı yönetimi, raporlar), promosyon, oyuncu segmenti, sohbet, destek talebi, marka/domain, sayfa, SMS/e-posta şablonu, mutabakat, etkinlik ve bahis uçlarında kimlikle yapılan aramalar `tenantFilter`/`scopeTenantId` (`server/src/tenancy/tenantFilter.js`) ile kiracıya bağlanır. Çok kiracılı modda başka bir kiracının kimliği `404 NOT_FOUND` döner (403 değil, kayıt hiçbir alanıyla açığa çıkmaz); olmayan bir kimliğin yanıtıyla birebir aynıdır. Slikair payout'u başlatılmadan önce oyuncunun (`userId`) kiracıya ait olduğu doğrulanır (§3 #4), `sendTip` gönderen ve alıcının aynı kiracıda olduğunu kontrol eder ve başka kiracıya bahşişi bakiyeye dokunmadan `404 RECIPIENT_NOT_FOUND` ile reddeder (§3 #6).
- **`TenantDailyStat` günlük toplama modeli ve işi** (`server/src/models/TenantDailyStat.js`, `server/src/services/tenantDailyStat.js`; §4.3.6): kiracı, marka, gün ve para birimi kırılımında casino/devre ciro ve `ggr`, bonus maliyeti, yatırım/çekim, aktif ve yeni oyuncu, yatırım yapan oyuncu ve FTD sayacı tutar. Bot (`isBot`), seed (`isSeed`) ve demo (`DEMO_*`) hareketleri toplamaya hiç girmez. Partner görünümü yalnız bu koleksiyonu okur, 5'ten az aktif oyuncuyu küçük hücre bastırmasıyla `"<5"` olarak gösterir ve kişisel veri içermez (§4.3.6, G-6).
- **Kiracı kapsamsız sorgu lint'i** (`scripts/lint-tenancy.mjs`, `npm run lint:tenancy`, CI her PR'da koşar): `runAsPlatform` yalnız izin listesindeki dosyalarda (mutabakat döngüleri, toplama, defter tekrar ayıklama, sağlama, açılış geçişleri) kullanılabilir; controller'larda `req.params` ile yapılan doğrudan `findById*` çağrıları `tenantFilter`'a yönlendirilmedikçe hata verir (spec §4.4 #5, §9 G-2).

**Değişti**
- **G7 — tek modda varsayılan `TENANCY_ENFORCEMENT` `off` yerine `log`:** G3 geri doldurması tüm koleksiyonlar için `completed` kaydedildiğinde tek modun varsayılanı `log` olur (satır başına dakikada bir uyarı), böylece kapsamsız bir sorgu üretime zarar vermeden görünür hâle gelir. Açıkça verilen `TENANCY_ENFORCEMENT` değeri her zaman kazanır; çok kiracılı modda değişiklik yoktur ve zorlama `enforce` kalır.
- **K23 — platform personeli kiracı uçlarında salt okunur:** `requireStaff` ile doğrulanan platform kapsamlı bir token kiracı rotasında yalnız `GET`/`HEAD`/`OPTIONS` kullanabilir; yazma denemesi `403 PLATFORM_READ_ONLY` döner ve aktör, kiracı, rota ve yöntemle bir `AuditLog` satırı yazar. Kiracı personeli etkilenmez; süreli ve denetlenen yazma istisnası İP-9a'da gelir.
- **Manuel etkinlik mutabakatı çok kiracılı modda platforma özel:** `TENANCY_MODE=multi` iken kiracı personelinin elle etkinlik sonuçlandırması `403 PLATFORM_ONLY` ile reddedilir (`server/src/middleware/platformOnly.js`); tek modlu akış aynen çalışır.

### İP-4: Kiracı bazlı ayarlar, kimlik bilgileri, site adresi, CORS ve e-posta transporter'ı (G6)
**Kırılan Değişiklikler**
- **`TENANCY_MODE=single` kurulumlar için işlem gerekmez.** Site bağlantıları bugünküyle aynı kaynaktan (`CLIENT_URL`'in ilk origin'i), CORS listesi de aynı kaynaklardan (`CLIENT_URL`, `GAME_HOST_URL`, `RAILWAY_PUBLIC_DOMAIN`) üretilir; `.env` kimlik bilgileri eskisi gibi DB'de kayıt yoksa okunur. İP-2 maddesindeki yedek + `node server/scripts/migrate.js` adımı bu sürüm için de geçerlidir: G6 geçişi (`tenancy-005-settings`) aynı koşucuyla, `0006`'dan sonra sırayla uygulanır.
- **Çok kiracılı moda geçecek kurulumlar:** `TENANCY_MODE=multi` altında `CLIENT_URL` site adresi olarak kullanılmaz. Her kiracının site bağlantılarını üretebilmesi için **doğrulanmış** (`verifiedAt`) ve **birincil** (`isPrimary`) bir `Domain` kaydı olmalıdır; yoksa e-posta/doğrulama/şifre sıfırlama/OAuth bağlantısı üreten çağrı `TenantScopeError` verir (sessizce `localhost` bağlantısı üretmez). CORS izin listesi de yalnız doğrulanmış `Domain` kayıtlarından üretilir: doğrulanmamış bir alan adı tarayıcıdan API'ye erişemez. Domain eklendikten/doğrulandıktan sonra etkisi 30 saniyelik süreç içi önbellek dolduğunda görünür.
- **Çok kiracılı modda `.env` kimlik bilgileri kiracılara düşmez:** SMTP/Mailtrap, Slikair, Twilio, Google, Sumsub ve kripto ayarları için `multi` modda DB'de kaydı olmayan bir kiracı alanın varsayılanını (`unset`/şema varsayılanı) alır, `process.env` değerini **asla** almaz. Platform geneli ayarlar (Sentry, Turnstile, Telegram/webhook uyarı kanalları) her iki modda `.env` varsayılanını okuyabilir. Şu an doğrulanmış alan adı olmayan bir kiracı bu yüzden e-posta gönderemez; önce Domain kaydını doğrulayın.
- **Gönderim modu:** `multi` modda bir kiracı panelden ne SMTP ne Mailtrap tanımladıysa gönderici modu `none` olur — test/prod'da gönderim hata döner, geliştirmede mock'a düşer; sunucunun `.env` SMTP'sine sessizce bağlanılmaz.
- **Admin panelden gizli değer kaydetmek** her zamanki gibi `OPERATOR_SECRET_ENCRYPTION_KEY` ister; `multi` modda açılış da bu anahtar olmadan zaten durur.

**Eklendi**
- **G6 — `Setting` hiyerarşisi:** `Setting` koleksiyonu artık `scope` (`platform` | `tenant` | `brand`), `tenantId` ve `brandId` taşır. Okuma önceliği **marka > kiracı > platform > eski (kapsamsız)** satırdır; marka satırı `tenantId` + `brandId`, platform satırı `tenantId: null` ile yazılır. Admin paneli ve tüm ayar depoları (Slikair, Google, KYC, SMS, e-posta, kripto, marka/tema, modül, SEO, sayfalar, oyunlar, para birimi, destek, dil, saat dilimi, davet, bahis gösterimi) değeri o kiracının/markanın satırından okur; süreç içi önbellekkiracı/marka bazında (`tenantId[:brandId]`) tutulur, bir kiracının değişikliği diğerine sızmaz.
- **G6 geçişi `server/migrations/0008_tenancy_settings.js`** (kayıt adı `tenancy-005-settings`, sürüm 1.4.0, `server/src/tenancy/settingsMigration.js`): eski satırları platform anahtar listesine (`TELEGRAM_*`, `ALERT_*`, `oddsFeed.apiKey`, `license.key`, `ai.apiKey`, `sentry.dsn`, `turnstile.*`, `demoData.live.config` ve `alert.`/`platform.` önekli anahtarlar → `scope: platform`, `tenantId: null`) göre ayırır, kalanını varsayılan kiracıya (`scope: tenant`) bağlar ve bileşik tekil indeksi `{ tenantId, scope, brandId, key }` (`tenant_setting_scope_brand_key_uniq`) **çevrimdışına almadan** (`createIndex`, `background`) kurar. Eski global `key_1` tekil indeksi **düşürülmez**; `syncIndexes`/`ensureIndexes` çağrılmaz. Geçiş idempotenttir (uygulanmış `Migration` kaydı atlanır); `multi` modda eski satır varsa varsayılan kiracı aranır, yoksa hata verir. **Elle değil**, İP-2'deki `node server/scripts/migrate.js` adımıyla çalışır.
- **Tek modda `key` hâlâ global tekildir:** temiz bir tek modlu kurulum `autoIndex` ile aynı `key_1` indeksini kurar; `multi` modda bu indeks hiç oluşturulmaz (aynı anahtar her kiracıda farklı satır olabilir). Kip açılışta sabittir.
- **Site adresi `server/src/tenancy/tenantBaseUrl.js`:** `getTenantBaseUrl(tenantId?, brandId?)` (`getTenantOrigin` aynı değeri verir) kiracının birincil `Domain`'ini çözer (`localhost`/`127.0.0.1` → `http://`, diğer → `https://`) ve e-posta/doğrulama/şifre sıfırlama bağlantıları, Google/Telegram dönüş adresleri, Slikair webhook/dönüş adresleri, destek asistanı ve sağlık kontrolleri bunu kullanır. `multi` modda doğrulanmış birincil Domain yoksa `TenantScopeError` fırlatır. 30 saniyelik önbellek; `invalidateTenantBaseUrl(tenantId?)` ile elle temizlenir.
- **Dinamik CORS `server/src/tenancy/corsDomains.js`:** `multi` modda platform API'sinin izin listesi doğrulanmış `Domain` kayıtlarından üretilir, her host kendi www ↔ apex ikiziyle genişletilir, yerel adresler için `http` de dahildir; `GAME_HOST_URL` ve `RAILWAY_PUBLIC_DOMAIN` her iki modda eklenir. Sağlayıcı CORS'u (`/api/provider/v1` ve Socket.IO) eskisi gibi `Operator.allowedOrigins` ile çalışır.
- **Kiracı başına e-posta transporter'ı `server/src/services/email.js`:** transporter ve Mailtrap istemcisi tek singleton yerine kiracı başına havuzda (`Map<tenantId, { client, signature }>`); bir kiracının SMTP/Mailtrap ayarı değişince yalnız o kiracının bağlantısı yeniden kurulur, diğerlerinin açık bağlantıları etkilenmez.

**Değişti**
- **`CLIENT_URL` artık "site" değil:** `multi` modda e-posta, OAuth, Slikair ve destek bağlantıları `getTenantBaseUrl` üzerinden `Domain`'den türetilir ve `CLIENT_URL` CORS listesine de girmez. `healthcheck.js` (ve açılış kontrolü) `CLIENT_URL`'i **yalnız `single` modda** zorunlu sayar.
- Ayar depoları katmanlı kimlik bilgisi yarışmasına girer: panelde kaydedilen değer (şifreli) > kiracının alt kapsamı > platform satırı > `.env` (yalnız `single` ve platform alanlarında). Panel adlı gizli alanın boş bırakılması kaydı değiştirmez; `clear` ile silinen alan `.env`'e döner (yalnız `single`).
- Slikair webhook/dönüş adresleri önce `API_BASE_URL`'i, tanımsızsa çözülen site adresini kullanır. Yeni zorunlu bir ortam değişkeni yok.

### İP-3: kimlik ayrımı, kapsamlı roller, iki token ailesi ve personel girişi
**Kırılan Değişiklikler**
- **Tek operatörlü kurulumlarda kırılan bir şey yok.** `TENANCY_MODE=single` ile çalışan mevcut kurulumlar aynı personel hesabı, aynı kullanıcı adı/şifre ve aynı yetkilerle `/api/auth/login` üzerinden giriş yapmaya devam eder; admin paneli ve `/api/auth/*` yanıt gövdesi ile cookie'si değişmez, `JWT_STAFF_SECRET` tanımlamak gerekmez ve ana makine (Host) çözümlemesi her zaman varsayılan kiracıya bağlanır, bilinmeyen adlarda 404 dönmez. Tek modda 2FA yalnızca hesap kendisi açtıysa istenir. Kurulum tarafında yapılacak bir işlem yoktur; G5 geçişi (`tenancy-004-staff-accounts`) varsayılan kiracı ve rol şablonları hazır olduğunda bir kez koşulur ve yalnız yönetici hesaplarının personel kopyasını ekler.
- **Çok kiracılı (`TENANCY_MODE=multi`) kurulumlar, yükseltmeden önce düzenlenmiş eski token'ları kabul etmez.** Multi modda oyuncu ve personel token'ları `aud`, `typ` ve `tid` taleplerini taşımak zorundadır; eski biçimdeki token'lar `401 INVALID_TOKEN` alır ve kullanıcı yeniden giriş yapar. Multi modda `JWT_STAFF_SECRET` zorunludur (tanımsızken sunucu açılmaz), tüm personel hesapları için 2FA zorunludur ve platform personeli kiracıya ait uçlara `X-Tenant-Id` başlığı olmadan erişemez (`400 TENANT_REQUIRED`).

**Eklendi**
- **Personel kimliği `StaffAccount` ve kapsamlı roller `RoleAssignment`** (`server/src/models/StaffAccount.js`, `server/src/models/RoleAssignment.js`): personel artık platform düzeyinde, e-postası global olarak benzersiz bir hesaptır; oyuncu `User` kayıtları kiracıya ait kalır ve aynı e-posta iki operatörde iki ayrı oyuncu hesabı açar. `Role` şeması `scopeType` (`platform`/`partner`/`tenant`) ve `scopeId` kazanır, atamalar `RoleAssignment` koleksiyonunda tutulur; kiracı rollerine `platform:*` anahtarı yazılamaz ve ortak (partner) personeli bağlı bir operatörde kendine kiracı rolü atayamaz. Personel yetkileri yeni `/api/staff/*` uçlarında `requireStaff` ve `requireStaffPermission` ile denetlenir; mevcut `requireAuth`/`requireAdmin`/`requirePermission` kontrolleri gevşetilmez.
- **G5 geçişi `tenancy-004-staff-accounts` (sürüm 1.3.0, `server/migrations/0007_tenancy_staff_accounts.js`)**: mevcut yönetici `User` kayıtlarını aynı `_id` ile `StaffAccount`'a kopyalar (şifre hashi dahil), tuttukları admin rollerini varsayılan kiracı kapsamlı `RoleAssignment` satırlarına çevirir ve rolü olmayan yöneticiyi yalnızca kurulumun ilk sahibi yoksa `platform_owner`/`tenant_owner` yapar. Eski `User.role: 'admin'` giriş yolu korunur; geçiş idempotenttir ve `node server/scripts/migrate.js` ile ya da açılışta koşar.
- **İki token ailesi**: oyuncu token'ları `JWT_SECRET` ile (`aud: 'player'`, `typ: 'player'`, `tid`), personel token'ları `JWT_STAFF_SECRET` ile (`aud: 'staff'`, `typ: 'staff'`, `scp`, `sid`, `amr`) imzalanır; oyuncu token'ı personel uçlarında, personel token'ı oyuncu uçlarında reddedilir. Tek modda `/api/auth/login`, `/api/auth/refresh` ve 2FA giriş adımı bugünkü yanıtı korur; düzenlenen token bugünkü talepleri (`id`, `role`, `tokenVersion`) ek taleplerle birlikte taşır ve yükseltmeden önceki token'lar süresi dolana kadar geçerli kalır. `JWT_STAFF_SECRET` tek modda isteğe bağlı, çok kiracılı modda zorunludur.
- **Personel giriş uçları `/api/staff/auth/*`** (`server/src/routes/staffAuth.js`, ayrıca `/api/staff/auth/2fa/*`): `POST /login` (kullanıcı adı + şifre; 2FA açıksa `{ requires2fa, challengeToken }`, multi modda 2FA kurulmamışsa `{ requires2faSetup, setupToken }`), `POST /refresh` (`staffRefreshToken` cookie'si), `GET /me` (personel özeti + etkin yetkiler) ve `POST /logout`. Yeni uçlar tüm 2FA akışını (`setup`, `confirm`, `challenge-verify`) sunar.
- **Ana makine (Host) çözümlemesi `resolveTenantHost`** (`server/src/middleware/tenantHost.js`): istekteki ana makine yalnızca **doğrulanmış** `Domain` kayıtlarıyla (`verifiedAt` dolu) kiracıya çözülür, sonuç 60 saniye bellekte önbelleklenir. Çok kiracılı modda eşleşmeyen ana makine `404 TENANT_NOT_FOUND` alır ve platforma ya da başka bir kiracıya düşmez; tek modda her istek varsayılan kiracıya bağlanır.
- **Personel 2FA zorunluluğu yalnızca çok kiracılı modda**: multi modda hiçbir personel erişim token'ı `amr` içinde `otp` olmadan düzenlenmez; ilk girişte 2FA kurulmadan oturum açılmaz. Tek modda 2FA isteğe bağlıdır, açmayan hesaplar yalnız şifreyle girer.
- **Acil kurtarma aracı `scripts/staff-recover.mjs`** (G5): sunucu veritabanına doğrudan bağlanır; `--list`, `--reset-password`, `--reset-2fa`, `--promote-owner` ve `--create-owner` ile kaybolan sahip kimlik bilgilerini geri kazandırır, kilitlenen 2FA'yı sıfırlar ve her işlem tekrar çalıştırıldığında aynı sonucu verir. Şifre ve 2FA sıfırlaması `tokenVersion`'ı artırarak verilmiş token'ları geçersiz kılar.
- **Platform personeli kiracıya ait uçlarda `X-Tenant-Id` vermek zorunda.** Platform kapsamlı (`scp: 'platform'`) bir personel token'ı kiracı uçlarında hangi kiracı adına çalıştığını bu başlıkla belirtir; başlık yoksa `400 TENANT_REQUIRED`, tanınmayan ya da kapalı kiracı `404 TENANT_NOT_FOUND` döner.
- Eklentiler için ortak giriş `server/src/tenancy/index.js` `StaffAccount`, `RoleAssignment`, `resolveTenantHost`, `requireStaff`, `requireStaffPermission` ve `signStaffAccess`'ı da ihraç eder.

### İP-2: Kiracı alanları, damgalama, geri doldurma (G3) ve bileşik indeksler (G4)
**Kırılan Değişiklikler**
- **Yükseltme adımı:** (1) **Önce yedek alın** (`scripts/backup-db.sh` ya da kendi `mongodump` alışınız): G3 `tenantId` taşımayan tüm eski belgeleri günceller, geri dönüş yedekten yapılır. (2) Yeni sürümü aldıktan sonra sunucuyu durdurun ve `node server/scripts/migrate.js` çalıştırın — `tenancy-002-backfill-tenant-id` (G3) ve `tenancy-003-compound-indexes` (G4) açılışta kendiliğinden koşmaz. (3) G4'ü trafiğe girmeden önce koşun: indeksler çevrimiçi derlenir ama büyük koleksiyonlarda dakikalar sürer. Koşucu idempotenttir (uygulanan geçişler atlanır) ve G3 yarıda kesilirse `Migration` kaydındaki ilerlemeden kaldığı belgeye döner. Bu iki geçiş hiç koşulmasa da tek kiracılı kurulum eskisi gibi çalışır (`tenantId` İP-2 boyunca `required: false`, eski belgeler doğrulamayı kırmaz); ancak geri doldurma sıfırlanmadan kiracı zorlamasına (İP-8) geçilemez. Mevcut belge içeriği değişmez, tek bir indeks düşürülmez.

**Eklendi**
- **G2 — her operatör modelinde `tenantId`:** 43 TEN modeli (`User`, `LoginAttempt`, `KycDocument`, `Transaction`, `Bet`, `CasinoRound`, `CasinoSession`, `Ticket`, `ChatMessage`, `AuditLog`, `Agent`, `Brand`, `Promotion`, `RiskRule` …) artık `tenantId: { type: ObjectId, ref: 'Tenant', required: false, index: true, immutable: true }` taşıyor ve `defineTenantModel(name, schema)` (`server/src/tenancy/models.js`) ile derleniyor; bu fonksiyon şemaya `tenantScoped` eklentisini de bağlar ve koleksiyonu kiracı sahibi olarak kaydeder. `required: true` zorlaması İP-8'de devreye alınır. `RiskRule` platform şablonları ile `AuditLog`/`AdminAction` platform geneli satırları için `tenantId: null` yazmaya devam edebilir. Alan `immutable: true` olduğu için kayıt oluşturulduktan sonra `doc.tenantId` üzerine yazma girişimi `immutable` hatası verir. Premium eklentilerin modelleri (`Operator`, `OpenRound`, `IgamesCallbackReceipt` …) kendi paketlerinde kalır; çekirdek `defineTenantModel`, `registerTenantCollection` ve `tenantScoped`'u ihrac ederek onları açılışta kaydettirir.
- **Tek modda varsayılan kiracı damgası:** `TENANCY_MODE=single` iken kiracı bağlamı dışında yazılan yeni kayıtlar da varsayılan kiracıyı (`tenancy-001-default-tenant` geçişinin ürettiği `Tenant{key: 'default'}`) otomatik alır; böylece geri doldurma yalnızca yükseltmeden önce var olan belgeler için bir kez koşulur, sonra koleksiyonlarda atanmamış satır birikmez.
- **K14 — para kayıtlarında `currency`:** `Bet`, `CasinoRound`, `CasinoSession`, `InhousePlaySession`, `BankDepositRequest`, `CryptoDeposit` ve `ReferralCommission` alanı olmayan yerlere `currency: { type: String, default: 'TRY', uppercase: true, trim: true }` eklendi (çoklu para birimi hazırlığı). `Transaction` (`'TRY'`), `SlikairPayment` (`'EUR'`), `SlikairPayout` ve `ActivityEvent` zaten kendi para birimini taşıdığı için değişmedi. Varsayılan yeni kayıtlara yazılır; eski belgeler olduğu gibi kalır.
- **G3 geri doldurma geçişi `server/migrations/0005_tenancy_backfill_tenant_id.js`** (kayıt adı `tenancy-002-backfill-tenant-id`, sürüm 1.2.0, `server/src/tenancy/backfill.js`): tüm TEN koleksiyonlarında `tenantId` taşımayan belgeleri `_id` sıralı imleçle **10.000'lik partiler** halinde varsayılan kiracıya bağlar. Her partiden sonra checkpoint (`{ lastId, processed, status, updatedAt }`) `Migration{name:'tenancy-002-backfill-tenant-id'}.progress[<koleksiyon>]` kaydına yazılır; süreç öldürülüp yeniden başlatıldığında `lastId`'den devam eder ve hiç işlemi tekrarlamaz. Yalnızca **hâlâ atanmamış** belgeler güncellenir (yarışan bir yazım ezilmez), koleksiyon biterken `tenantId: null` / alan yok sayısı **sıfır** doğrulanır, `completed` işaretli koleksiyon bir daha açılmaz. Modeli olmayan `transactions_dedupe_archive` koleksiyonu da varsa kapsanır. `TENANCY_MODE=multi` iken çalışmaz; model kaydı boşsa geçiş "uygulandı" işaretlenmeden hata verir.
- **G4 bileşik indeks geçişi `server/migrations/0006_tenancy_compound_indexes.js`** (kayıt adı `tenancy-003-compound-indexes`, sürüm 1.2.0, `server/src/tenancy/indexBuilder.js`): Spec §2.1'deki bileşik indeksleri (`{tenantId, username}`, `{tenantId, email}`, `{tenantId, slug}`, `{tenantId, createdAt}` …; şu an 43 modelde 105 kayıt) `server/src/tenancy/indexRegistry.js` üzerinden **çevrimiçi** `createIndex` ile kurar. **Legacy global unique indeksler (`username_1`, `email_1`, `idempotencyKey_1` …) düşürülmez** — `listIndexes` eski ve yeni indeksin birlikte çalıştığını doğrular; var olan bileşik indeks yeniden kurulmaz (idempotent). `syncIndexes` / `ensureIndexes` **hiç çağrılmaz**: şemada yazılı olmayan ya da kısmi (partial) indeksleri sildikleri için yasaklandı. Bu yüzden bileşik indeksler `schema.index()` ile şemaya eklenmez ve `autoIndex` dokunulmadan bırakılır — temiz kurulum mevcut unique indeksleri eskisi gibi kendi kurar; `tenantId` alanının tek alanlık indeksi şemadadır. Adlandırma: `tenant_<alan>[_<alan>]_uniq` (unique), `tenant_<alan>[_<alan>]` (diğer).

### İP-1: çok kiracılı temel (kiracı modeli, kiracı bağlamı, kapsam eklentisi, demo bayrakları)
**Kırılan Değişiklikler**
- Demo davranışları artık açık bayrak ister; hepsinin varsayılanı kapalıdır: `DEMO_BOTS` (bot oyuncu zamanlayıcısı ve `/api/admin/bots*`), `DEMO_FAKE_WINNERS` (Son Kazananlar simülasyonu ve `/api/admin/fake-winners`), `DEMO_DATA` (`/api/admin/demo-data/*` ve canlı demo simülasyonunun açılışta geri yüklenmesi). Kapalıyken iş başlatılmaz, uçlar `404 DEMO_FEATURE_DISABLED` döner, admin menüsündeki ilgili öğeler gizlenir. Sahte kazananlar bugüne kadar varsayılan olarak açıktı. Demo kurulumları güncellemeden önce kullandıkları bayrakları `server/.env`'de `true` yapar; gerçek operatör kurulumlarının bir şey yapması gerekmez.
- `TENANCY_MODE` ve `TENANCY_ENFORCEMENT` açılışta doğrulanır. Geçersiz değer ya da `TENANCY_MODE=multi` iken `enforce` dışında bir zorlama değeri, açık bir `DEMO_*` bayrağı, eksik `JWT_STAFF_SECRET` veya `OPERATOR_SECRET_ENCRYPTION_KEY` sunucunun başlamasını engeller. Bu değişkenleri tanımlamayan tek operatörlü kurulumlar etkilenmez.
**Eklendi**
- `Tenant` ve `Domain` modelleri. Açılış geçişi `tenancy-001-default-tenant` tek modda varsayılan kiracıyı (`key: 'default'`) oluşturur, in-house sağlayıcının `vip90` operatörü varsa ona bağlar ve varsayılan markanın alan adlarıyla `CLIENT_URL` kökenlerinden `Domain` kayıtları üretir. Bu kayıtları henüz hiçbir kod okumaz; davranış değişmez. Aynı geçiş `node scripts/migrate.js` ile de çalışır.
- Kiracı bağlamı (`server/src/tenancy/`): `tenantContext`, `runWithTenant`, `runAsPlatform`, `forEachTenant`, `tenantScoped` eklentisi (`TENANCY_ENFORCEMENT=off|log|enforce`, tek modda varsayılan `off`), `defineTenantModel`/`getTenantModel` ve bağlantı çözümleyici; eklentiler için `registerTenantProvisioningHook` ve `registerTenantCredentialSchema`. Bu sürümde hiçbir üretim modeli eklentiyi kullanmaz.
- `GET /api/admin/demo-flags`: admin istemcisinin demo öğelerini gösterip gizlemek için okuduğu etkin bayraklar.

### Admin kullanıcı listesi: güncelleme sonrası seçili kullanıcı korunuyor
**Düzeltildi**
- Admin → Kullanıcılar'da bir kullanıcıyı güncelledikten sonra yan paneldeki kullanıcı `search=<kullanıcı adı>&limit=1` ile yeniden çekiliyordu; benzer adlı daha yeni bir hesap (`ahmet` → `ahmet1907`) seçili kullanıcının yerine geçebiliyordu. Panel artık güncelleme yanıtındaki kullanıcıyı kullanır; yanıt yoksa sonuçlar içinde `_id` ile eşleştirir.

### In-house oyun: CRAZY WHEEL (`crazywheel`) — Wheel'in yerini aldı
**Eklendi**
- 16 dilimli ağırlık çarkı **Crazy Wheel** in-house oyun olarak kayıtlı: `inhouse-crazywheel` GameSettings kaydı (bahis bandı 1–1000, `isActive`), `GAME_FIELD_META`/`OPERATOR_ALLOWED_FIELDS` girdileri, admin kısa-id `crazywheel`, lobi kartı ve `/games/crazywheel` rotası, 8 dilde `games.crazywheel.*` + panel alan etiketleri. RTP **%90.00** kapalı formda kesindir (Σ wᵢ·mᵢ / Σwᵢ = 67.5/75) ve **mühürlüdür**: paytable ve ağırlıklar sağlayıcı eklentideki `math/crazyWheelMath.js` sabitlerinde, `computeRound` ayardan hiçbir şey okumaz — panelde bahis bandı ve aç/kapat dışında düzenlenebilir alan BİLEREK yoktur (King of Money ile aynı mühür). Round başına tavan `25 × maxBet` = 25.000; ayrı max-win cap eklenmedi (cap, 25× dilimini budayıp onaylı RTP'yi geçersiz kılardı).
- Dilim, sunucu-kararlı `roundSeed`'den seçilir: `HMAC-SHA256(key: 'crazywheel-v1', deriveRoundSeed(serverSeed, nonce))`; `clientSeed` bilinçli olarak girdi değildir (eski Wheel'in kararı). Oyuncu doğrulaması tam yeniden-hesap yapar (`FULLY_VERIFIABLE`).
- Migration betikleri: `add-crazywheel-to-operators.mjs` (operatörlerin `allowedGameIds`'ine `crazywheel`; idempotent) ve `remove-wheel-from-operators.mjs` (`wheel` id'sini düşürür; `inhouse-wheel` ayar dokümanı ve oynanmış round'lar KORUNUR). İkisi de `run-migration.yml` seçim listesine eklendi.
- Testler: `server/test/crazyWheelEndpoint.test.js` (bant sınırları, `GET /crazywheel/info`, `GAME_DISABLED`, tek-tohum determinizmi, round kaydı), `client/src/i18n/crazywheelSettingsParity.test.js` (admin formu ↔ şema ↔ `GAME_FIELD_META` drift bekçisi), `gameSettings`/`instantGamesSeed` beklentileri `crazywheel`e çevrildi. Oyun sayısı **15** (Wheel çıktı, Crazy Wheel girdi).

**Değiştirildi**
- Lobi listeleri ve oyun matematiği/SSS/provider belgeleri ile README oyun listeleri Wheel yerine Crazy Wheel'i sayıyor. Sağlayıcı eklentisi `POST /crazywheel/spin`, `GET /crazywheel/info` ve oyun ekranını getirir; oyun-host paketi `crazywheel`'i de içerir.

**Kırılan Değişiklikler**
- **Wheel (`inhouse-wheel`) yayından kalktı.** Motor tarafında `wheelHandler`, `POST /wheel/spin`, `GET /wheel/info`, `wheelPayoutScale/wheelMinBet/wheelMaxBet` şema alanları ve çekirdek kaydı (seed, `GAME_FIELD_META`, `OPERATOR_ALLOWED_FIELDS`, admin kısa-id, validatorlar, bot ve son-kazananlar başlığı) kaldırıldı; panelde Wheel için ayar yazmaya çalışan eski entegrasyonlar `NO_VALID_FIELDS`/`UNKNOWN_GAME` alır. `/games/wheel` adresi `/games/crazywheel`e yönlendirilir (favorilerdeki eski bağlantı ölmesin). Eski Wheel round'ları oyuncular için `commitment-only` görünür — taahhüt kontrolü durur, dilim yeniden-hesabı yapılmaz. Operatör erişimi `remove-wheel-from-operators.mjs` çalışana kadar `allowedGameIds`te kalır; lobi kartı kalktığı için oynanamaz.

### İP-0 takip işleri: Telegram girişi, igames para modeli, geri çağrı kaynağı, personel para araçları (F1–F4)
**Güvenlik**
- F1: Telegram girişi mevcut hesabı yalnız `telegramId` ile bulur; `tg_<kullanıcı adı>` adlı mevcut bir hesaba artık kullanıcı adı üzerinden bağlanmaz (Telegram kullanıcı adları serbest kalıp başkasına geçebilir, yerel bir hesap da o adı önceden alabilir). Eşleşme yoksa her zaman yeni hesap açılır; kullanıcı adı doluysa `tg_<ad>_<telegramId'nin son 6 hanesi>`, o da doluysa rastgele 8 hex son ek alır (en çok 30 karakter). Aynı `telegramId` ile eşzamanlı ilk girişte kazanan hesap döner. Google ve cüzdan girişi de aynı kuralla ad seçer: üretilen ad (`google_<…>`, `web3_<…>`) doluysa kimliğin son 6 karakteriyle, o da doluysa rastgele son ekle (önceden çakışmada giriş hata veriyordu). Widget `hash`'i 64 hex karakter olmalı ve sabit zamanlı karşılaştırılır; `auth_date` sayısal olmalı, 24 saatten eski ya da 5 dakikadan ileri olamaz (`400 INVALID_TELEGRAM_DATA` / `EXPIRED_TELEGRAM_AUTH`; bağlama akışında da). Bir kullanıcıya bağlı `state` yalnız o kullanıcının bağlama isteğinde tüketilir (`400 INVALID_STATE`).
- F2 (Casino Content eklentisi): Sağlayıcı geri çağrı imzası ya da kaynak IP'si belgelemediği için `POST /api/igames/callback` isteğe bağlı bir kaynak IP listesiyle (`IGAMES_CALLBACK_ALLOWED_IPS`) kısıtlanabilir; listede olmayan adres token'dan önce `401 {code:1001}` alır ve hiçbir şey okunmaz/yazılmaz. Reddedilen geri çağrılar kaynak IP ile loglanır (sunulan token loglanmaz, kategori + IP başına dakikada en çok bir satır). Açık oturumu olmayan kullanıcının geri çağrısı kaydedilir ama hiçbir yan etki üretmez (bonus çevrimi, XP, sorumlu oyun günlük istatistikleri, bonus call kazanç toplamı); `authenticate` açık oturum yokken bakiyeyi `0` bildirir (önceden yerel bakiyeyi bildiriyordu). `POST /api/igames/game/url` yalnız personel içindir.
- F3 (Casino Content eklentisi): Igames oturumunun parası kapanışa kadar sağlayıcıda kalır (`CasinoSession.balanceModel: 'provider'`). Geri çağrılar platform bakiyesini artık hareket ettirmez: `CasinoRound` ve `casino_bet` / `casino_win` / `casino_cancel` defter satırı `walletId: 'igames'` üzerinde sağlayıcı bakiyeleriyle yazılır, ana cüzdan zinciri bozulmaz; sahte bir geri çağrı para basamaz. Kapanış `bakiye + çekilen` kredi eder (önceden `max(bakiye, çekilen)`), böylece oturum sırasında yapılan yatırma ve spor bahsi kapanışta kaybolmaz. Dağıtım anında açık olan eski oturumlar (`balanceModel` yok) eski davranışla (`max`) kapanır.
- F4 (Casino Content eklentisi): İşaretli oturumun `settle` tutarı bir tavana bağlandı: transfer + max(oturumdaki kazançlı turların net toplamı, sağlayıcının onayladığı çekilen tutar; personelin oturuma kaydedilen sağlayıcı çekimleri dahil) + 0,01. Üstü yalnız super_admin'in `override: true` ve en az 10 karakterlik notuyla geçer (oturumda `metadata.capOverride`, denetimde kayıtlı). Her resolve denemesi (başarısızlar dahil) `igames_session_resolve` denetim satırı yazar. `/api/igames/user/deposit`, `/user/withdraw`, `/user/withdraw-all` her çağrıda denetlenir ve açık oturumda reddedilir. Admin `withdraw-test-users` sağlayıcı bakiyesini defter dışından kredi ediyordu; artık yalnız sağlayıcının çekildiğini onayladığı tutarı bir `casino_return` satırıyla kredi eder.

**Eklendi**
- `IGAMES_CALLBACK_ALLOWED_IPS` (virgüllü IP/CIDR, `ADMIN_ALLOWED_IPS` ile aynı kurallar). Tanımsızken geri çağrı yalnız token ile korunur ve açılışta `igames_callback_auth` uyarısı loglanır; geçersiz girdiler yok sayılır ve `igames_callback_ip` hatası loglanır; hiç geçerli girdi yoksa her geri çağrı reddedilir. İstemci IP'si `req.ip`'tir; `ADMIN_IP_TRUST_CF_HEADER=true` ise `CF-Connecting-IP` (bayrak admin listesiyle ortaktır).
- `Transaction.type` yeni değer `casino_transfer`: oyun açılışında platform bakiyesinin sağlayıcıya aktarımı (negatif tutar, ana cüzdan, anahtar `igames_launch_<sessionId>`; profil, admin kullanıcı paneli ve 8 dilde etiket). Reddedilen aktarım `reversal` satırıyla iade edilir.
- `CasinoSession` yeni alanlar: `balanceModel`, `depositedAt`, `providerBalanceBeforeDeposit`, `depositRefusedAt`, `depositCheckBalance`, `depositCheckAt`, `strayDepositRecoveredAt`, `reconciliationReason` (`deposit_uncertain`, `stray_deposit`, `possible_stray_deposit`), `metadata` (`withdrawnAboveExpected`, `settleFloor`, `retryAttempts`, `staffProviderWithdrawals`, `capOverride`).
- Oyun açılışında belirsiz sağlayıcı aktarımı (ağ hatası, zaman aşımı, 5xx, okunamayan yanıt) `502 IGAMES_DEPOSIT_PENDING` döner ve iade edilmez; reconcile işi en erken 5 dakika sonra, en az 30 sn arayla iki eşit sağlayıcı okumasıyla ve aktarım öncesi okunan sağlayıcı bakiyesine göre karar verir: ulaştı / iade / `deposit_uncertain` ile personel incelemesi. Karar verilmemiş aktarımın oturumu kapatılmaz (`409 IGAMES_CLOSE_IN_PROGRESS`).
- Resolve yeni eylem `mark_stray_recovered`: reconcile ile iade edilmiş kapalı bir açılışın sonradan ulaşabilecek aktarımı için personel "ulaşmadı / sağlayıcıdan geri alındı" kaydı düşer (`admin:users:balance`, en az 10 karakterlik not, denetlenir; para hareket etmez; uygun olmayan oturum `409 IGAMES_NOT_A_STRAY_RISK`). `stray_deposit` oturumun `amount: 0` settle'ı da bu kaydı düşer.
- `balance:update` socket olayı `activeIgamesBalance` taşır: açık sağlayıcı oturumunda sağlayıcıdaki bakiye, kapanışta ve oturumsuz geri çağrıda `null` (istemci başlıktaki casino bakiyesini temizler).
- Admin kullanıcı işlem listesi (`GET /api/admin/users/:id/transactions`) `walletId` döner; kullanıcı panelinde ana cüzdan dışındaki satırlarda gösterilir.
- Resolve: `override` gövde alanı; yeni hata kodları `400 AMOUNT_ABOVE_CAP`, `403 CAP_OVERRIDE_FORBIDDEN`, `400 OVERRIDE_NOTE_REQUIRED` (üçü de `error.details.cap` taşır), `400 NOTE_TOO_LONG`, `400 AMOUNT_BELOW_WITHDRAWN`, `400 STRAY_DEPOSIT_SETTLE_ZERO`. Denetim satırları: `igames_provider_deposit`, `igames_provider_withdraw`, `igames_provider_withdraw_all`, `igames_test_user_sweep`.

**Düzeltildi**
- Sağlayıcı oturumunda başlıktaki toplam (`balance + activeIgamesBalance`) oturum kazancını iki kez sayıyordu; kapanıştan sonra da eski casino bakiyesi başlıkta kalıyordu.
- Oyun açılışında oturum kaydı aktarımdan sonra oluşturuluyordu: arada çökme parayı kayıtsız bırakabiliyordu. Borç, `casino_transfer` satırı ve oturum artık tek işlemde, aktarımdan önce yazılır.
- Belirsiz aktarım hatasında yerel bakiye hemen iade ediliyordu; aktarım sonradan ulaşırsa para iki kez var oluyordu.
- Aynı oyuncunun eşzamanlı iki oyun açılışı iki oturum açabiliyordu; açık oturum kontrolü artık borç işleminin içinde yapılır, ikinci istek borç ve aktarım olmadan `409 SESSION_ACTIVE` alır.
- İade edilmiş bir açılışın sonradan ulaşabilecek aktarımı yalnız bir sonraki kredi edilmiş kapanışa kadar izleniyordu; artık geri alındığı ya da personelce kapatıldığı ana kadar izlenir (kapanış `possible_stray_deposit`, toplu çekim `needs_review`), 30 günden eski iadeler yok sayılır.
- `stray_deposit` incelemesindeki oturum `/users/me` ve girişte `activeIgamesBalance` olarak gösteriliyordu; aktarımı zaten iade edildiği için başlıkta para iki kez görünüyordu.

**Kırılan Değişiklikler**
- Kayıt (`POST /api/auth/register`) ve admin kullanıcı oluşturma (`POST /api/admin/users`) `tg_`, `google_` ve `web3_` ile başlayan kullanıcı adlarını `400 VALIDATION_ERROR` ile reddeder (büyük/küçük harf duyarsız). Bu adlarla mevcut hesaplar etkilenmez. Bu öneklerle hesap açan bir entegrasyon başka ad seçmelidir.
- Telegram'a hiç bağlanmamış (`telegramId` yok) `tg_<ad>` adlı bir hesabın sahibi Telegram ile girince o hesaba değil yeni bir hesaba girer. Mevcut hesaba Telegram'ı eklemek şu an self-servis değildir (istemcide ekran yok; bağlama geri dönüşü Telegram yönlendirmesinin taşımadığı bir Bearer token ister): oyuncu desteğe başvurur, destek iki hesabın sahipliğini doğrulayıp Telegram kimliğini elle taşır. `telegramId`'si zaten yazılı hesaplar değişmeden çalışır.
- `POST /api/igames/game/url` artık personel + `admin:casino:read` ister (oyuncu `403`). Web istemcisi bu ucu çağırmaz (`/game/launch` kullanır); onu doğrudan çağıran özel istemciler `/game/launch`'a geçmeli.
- Igames `authenticate` geri çağrısı açık oturum yokken `balance: 0` döner. Oturumsuz geri çağrılar (kapanıştan sonra gelen geç turlar dahil) bonus çevrimine, XP'ye ve sorumlu oyun günlük istatistiklerine sayılmaz.
- Igames defteri: yeni oturumların `casino_bet` / `casino_win` / `casino_cancel` satırları `walletId: 'igames'` üzerindedir, `balanceBefore`/`balanceAfter` sağlayıcı bakiyesidir ve `User.balance`'ı değiştirmez. Açılış bir `casino_transfer` (−transfer) yazar; sağlayıcı oturumunun kapanışındaki `casino_return` tutarı artık çekilen tutarın tamamıdır (önceden yalnız bakiye değişimi). Türe göre toplayan raporlar ana cüzdan için `walletId`'ye göre süzmeli. Admin finans analitiğinin tür dağılımında (`GET /api/admin/analytics/finance`) `casino_return` brüt çekilen tutarı gösterir ve `casino_transfer` hacmi ayrı satır olarak görünür.
- Kapanıştan sonra gelen geç turlar platform bakiyesini artık değiştirmez; para sağlayıcıda kalır ve yalnız oyuncunun bir sonraki açılışında ya da kapanışında withdraw-all ile toplanır. Oyuncu bir daha oynamazsa sağlayıcıda kalır.
- Oyun açılışı artık bir MongoDB replica set'i (işlem) ister ve aktarımdan önce sağlayıcıdan bir bakiye okur. Yeni yanıtlar: `502 IGAMES_DEPOSIT_PENDING` (aktarım doğrulanamadı; birkaç dakika içinde otomatik sonuçlanır, oyuncu bu sürede oyunu yeniden açamaz ve kapatamaz), `409 SESSION_CHANGED` (aktarım başka yerde karar verildikten sonra ulaştı; personel incelemeli).
- `/api/igames/user/deposit`, `/user/withdraw`, `/user/withdraw-all`: kullanıcının açık (`active`/`closing`) oturumu varken `409 IGAMES_SESSION_OPEN` (sağlayıcı çağrılmaz). Tek istisna: çekimi kaydedilmiş işaretli oturum (`closing` + `needsReconciliation` + `withdrawnAt`) için `withdraw` ve `withdraw-all` kabul edilir, denetlenir, kesin başarı oturuma (`metadata.staffProviderWithdrawals`) yazılır ve settle tavanına sayılır; `deposit` her zaman reddedilir.
- `POST /api/igames/session/:id/resolve`: `amount` sonlu bir JSON sayısı olmalı ya da hiç gönderilmemeli (`"100"` gibi metin artık `400 INVALID_AMOUNT`), `note` en çok 500 karakter (`400 NOTE_TOO_LONG`). Tavanın üstündeki settle `400 AMOUNT_ABOVE_CAP` alır; uzun oturumlarda tavan gevşektir (kazançlı turların toplamı kayıpları düşmez). `deposit_uncertain` oturumda `retry` sağlayıcıdan çeker ama oturumu işaretli bırakır (`finalBalance: null`, sonra `settle`); `stray_deposit` oturum yalnız `amount: 0` ile settle edilir. Sağlayıcı oturumunda settle `bakiye + amount` kredi eder.
- `POST /api/admin/igames/withdraw-test-users` artık `admin:users:balance` ister (önceden `admin:casino:write`): sistem `casino_manager` rolü bu aracı kaybeder, `finance` kazanır (panelde bu ucu çağıran ekran yoktur). Kredi, ön okunan bakiye değil sağlayıcının withdraw-all yanıtındaki tutardır ve `casino_return` satırıyla (ana cüzdan, `source: 'admin'`, anahtar `igames_sweep_<requestId>_<userId>`) yazılır. Gövde isteğe bağlı `requestId` alır (8–64 `[A-Za-z0-9_-]`, aksi `400 INVALID_REQUEST_ID`; yoksa üretilir); yanıt `requestId` ve `needsReview` listesi döner, yeni durumlar `already_credited` ve `needs_review`. Belirsiz yanıt, ön okumada para varken 0 çekim, kredi hatası ve olası başıboş aktarım (iade edilmiş bir açılışın sonradan sağlayıcıya ulaşmış olabilecek parası) kredi etmez, `needs_review` olur. Sağlayıcı bakiyesi okunamayan kullanıcı `error` olur (önceden 0 sayılıyordu). Her kullanıcı için bir `igames_test_user_sweep` denetim satırı yazılır. Yeniden denemede aynı `requestId` gönderilmeli.
- `needsReconciliation` artık kapanış dışında da konur: belirsiz açılış aktarımı (`deposit_uncertain`, oturum `closing`) ve iade edilmiş açılışın sonradan ulaşan aktarımı (`stray_deposit`, `possible_stray_deposit`). `reconciliationReason`'a bakmadan işaretli oturumları "kapanış eksiği" sayan dış sorgular güncellenmeli.
- Operatör adımları: (1) Dağıtım anında açık igames oturumları eski modelde kalır, taşıma gerekmez. (1a) Güncellemeden hemen önce, eski kod çalışırken, açık oturumu olmayan kullanıcıların sağlayıcı bakiyelerini listeleyin (`GET /api/admin/igames/test-users`, en yeni 100 kullanıcı): bunlar eski geri çağrılarla platformda zaten kredi edilmiştir. Her biri için açık oturum olmadığını doğrulayıp yalnız sağlayıcı tarafında `POST /api/igames/user/withdraw-all` ile çekin ve tutarı kayda geçirin (eski rota denetim satırı yazmaz ve açık oturumu kontrol etmez; platforma kredi yok). Bu stok için `withdraw-test-users` çalıştırmayın: parayı ikinci kez kredi eder. Güncellemeden sonra bu toplu adımı tekrarlamayın: oturumsuz geç turlar artık platform bakiyesini değiştirmediği için o andaki sağlayıcı bakiyesi oyuncunun kredi edilmemiş parası olabilir. (2) Telegram'a bağlı olmayan `tg_*` hesapları listeleyin; sahipleri Telegram'ı eklemek için desteğe başvurmalıdır. (3) Sağlayıcıdan callback IP'lerini alıp `IGAMES_CALLBACK_ALLOWED_IPS`'i ayarlayın, proxy arkasında gerçek istemci IP'sinin uygulamaya ulaştığını test callback'iyle doğrulayın. (4) `withdraw-test-users` gerekiyorsa ilgili role `admin:users:balance` verin. (5) Finans analitiğinde `casino_return` sıçraması ve yeni `casino_transfer` satırı beklenen davranıştır. Geri dönüşten önce aktarımı karar bekleyen ya da `deposit_uncertain` sağlayıcı oturumu kalmamalıdır.

### İP-0 PR-3: para ve yönetim sınırı sertleştirmesi (V4–V11, V15, V17–V19, V22)
**Güvenlik**
- V4: Ödeme almadan bakiye yükleyen `POST /api/transactions/deposit` artık varsayılan olarak kapalıdır: yalnız `DEMO_INSTANT_DEPOSIT=true` ve `TENANCY_MODE` `multi` değilken çalışır, aksi halde `404 DEMO_FEATURE_DISABLED`. İstemcideki kullanılmayan çağrı kaldırıldı.
- V5: `requireAdmin` artık yalnız "personel" demektir; yalnız ona dayanan her admin ucu ayrıca bir izin ister: analytics `admin:reports:read`; mutabakat `admin:reconciliation:read` / POST'lar `:write`; `/api/admin/modules` `admin:settings:read` / `:write`; sağlayıcı ayarları, anahtarları ve kimlik bilgileri (in-house, odds, igames credentials) yeni `admin:integrations:read` / `:write`; igames modül ayarları `admin:settings:read` / `:write`; ticket ve chat admin uçları `admin:support:read` / `:write`; `GET /api/crypto/settings` ve `/hot-wallet-balance` `admin:settings:read`; `POST /api/auth/2fa/{setup,verify,disable}` yalnız personel. Yeni `admin:integrations:*` anahtarları açılışta super_admin ve varsayılan `admin` rolüne eklenir. Personel hesabını düzenlemek/silmek, kullanıcıdan rol kaldırmak ve rol silmek, aktörün hedefin (ya da rolün) tüm izinlerine sahip olmasını ister (`403 STAFF_MANAGE_FORBIDDEN` / `ROLE_GRANT_FORBIDDEN`); rolün izin listesini değiştirmek de rolün şu anki tüm izinlerini ister. Son aktif super_admin pasifleştirilemez ve super_admin rolü alınamaz (`409 LAST_SUPER_ADMIN`, yazımdan sonra yeniden sayılır). Rol silindiğinde rolsüz kalan eski sahipler `role: 'user'`'a düşer ve oturumları biter (önceden bir sonraki açılışta super_admin'e yükseltiliyordu); yetim admin yükseltmesi yalnız hiç super_admin yokken çalışır. Canlı admin socket odası (`role:admin`) `admin:activity:read` ister. Casino Content eklentisinin personel uçları da izin ister (aşağıda V18 maddesi).
- V6: `ADMIN_ALLOWED_IPS` artık yalnız `/api/admin` altında değil, `requireAdmin` kullanan her personel ucunda (ticket/chat admin, `/api/bank/admin/*`, kripto ayarları ve hot wallet, 2FA setup/verify/disable, igames personel uçları) ve canlı admin socket odasında (`subscribe:admin`) uygulanır; KYC belgesinin admin yolu da aynı kontroldedir. Değişken tanımsızken hiçbir şey değişmez; giriş uçları kapsam dışıdır.
- V7: Chat mesajı silme sahipliğe bağlandı: oyuncu `chat:delete` ile yalnız kendi mesajını silebilir (`403 FORBIDDEN`), başkasının mesajı yalnız izinli REST ucuyla (`DELETE /api/chat/admin/messages/:id`, `admin:support:write`) silinir ve yalnız o denetime yazılır. Silinmiş mesajı yeniden silmek hiçbir şey yazmaz.
- V8: Chat rain para basıyordu (oluşturan borçlandırılmıyor, rol bakılmıyordu). Artık yalnız DB'de `role: 'admin'` ve `admin:users:balance` izni olan personel rain yapabilir; rain oluşturanın çekilebilir bakiyesinden fonlanır, kuruş bazında bölünür (alacakların toplamı borca eşit), alıcılar odadaki tekil aktif hesaplardır (oluşturan hariç, en çok 50), pay sınırları ve bekleme süresi oda ayarlarından gelir ve işlem içinde uygulanır; borç, alacaklar, defter satırları ve `ChatRain` tek işlemde yazılır. Tip de tek işlemde yazılır; gönderen çekimle aynı kapılardan geçer (KYC, risk `withdraw`, sorumlu oyun `withdraw`), çekim kilidindeyken ve aktif çevrimdeki bonus parasıyla tip gönderemez, odada banlı/susturulmuşsa ya da oda pasifse reddedilir. Rain ve tip `requestId` ister (`400 REQUEST_ID_REQUIRED`), kimlik kullanıcı bazında kapsamlanır; tekrar ve çift tıklama ilk kaydı döner, para bir kez hareket eder.
- V9: Risk istatistikleri herkese açık `GET /api/health/risk`'ten `GET /api/admin/health/risk`'e taşındı (personel + `admin:risk:read`, `Cache-Control: no-store`); eski yol `404`. Hata artık boş istatistikli `200` yerine hata yanıtı döner. `GET /api/health` ve `/api/health/status` değişmedi.
- V10: Başarısız Slikair ödemesi (payout) oyuncuya iade edilir. Webhook imzasız olduğu için gövdesi parayı hareket ettirmez: durum Slikair'den yeniden sorgulanır ve yalnız sağlayıcının onayladığı başarısızlık (`failed`/`declined`/`expired` ya da kod 311/320/330) iade edilir. Bakiye, `refund` defter satırı (anahtar `slikair_payout_refund_<merchantReference>`, eski senkron iadenin anahtarıyla aynı), payout kaydı ve bekleyen çekim satırının kapanışı tek işlemde ve bir kez yazılır. Senkron `createPayout` hatasında yalnız kesin bir 4xx (408/409/425/429 hariç) iade edilir; 5xx, zaman aşımı, ağ hatası ve kullanılamaz 2xx yanıtı iade etmez, payout'u `needsReconciliation` ile işaretler (`502 SLIKAIR_PAYOUT_UNCONFIRMED`). `createPayout` deterministik `Idempotency-Key` gönderir; bilinmeyen `payoutId`'li webhook, `get-status` aynı `merchantReference`'ı döndürürse kayda bağlanır. İade edilmiş bir payout'u sağlayıcı sonradan başarılı onaylarsa geri alınmaz, işaretlenir (`PAYOUT_REFUND_CONFLICT` denetim kaydı, kritik log). `SlikairPayout` yeni alanlar alır: `refundedAt`, `refundTransactionId`, `providerStatus`, `needsReconciliation`, `reconciliationNote`, `metadata`.
- V11: Sumsub webhook'unun ham gövdesi global JSON ayrıştırıcıdan önce, yol kapsamlı bir ayrıştırıcıyla (100 kb) yakalanır ve HMAC bu baytlar üzerinden hesaplanır; boş gövde ve yanlış uzunlukta imza `401` döner (önceden karşılaştırma hata verip `200` dönüyordu). Okunamayan sır için `503` korunur.
- V15: Operatör origin'leri (`Operator.allowedOrigins`) CORS'ta yalnız `/api/provider/v1` ve Socket.IO için kabul edilir; platform API'si yalnız statik listeye (`CLIENT_URL`, `GAME_HOST_URL`, Railway) açıktır.
- V17: Kripto ayarları (otomatik kredi/çekim limitleri, onay eşikleri, USDT/TRY kuru, ağ) DB'de kalıcıdır; önceden her yeniden başlatmada kayboluyordu ve panelin nesne biçimli kaydı şema tarafından reddediliyordu. Yalnız kaydedilen anahtarlar saklanır, önceki kaydın üzerine birleştirilir, yazmadan önce doğrulanır ve env varsayılanlarının üzerine uygulanır (açılışta ve 30 sn TTL ile ayar okuma, `check-deposit` ve `withdraw-request`'te). Kaydedilmemiş anahtarlar `USDT_TRY_RATE` / `TRON_NETWORK`'ü izler; geçersiz `USDT_TRY_RATE` 1'e düşer. Yatırma adresi indeksi atomik bir sayaçla verilir (eşzamanlı iki istek aynı HD adresini alamaz, aynı kullanıcı tek indeks tutar); `scripts/migrate-crypto-index.mjs` sayacı tohumlar, çift indeksleri raporlar ve ancak çift kalmadığında kısmi tekil indeks `cryptoDepositIndex_unique` ekler.
- V18 (Casino Content eklentisi): Igames geri çağrıları (bet, win, cancel, bonus call) bakiye, `CasinoRound`, defter satırı (`casino_bet` / `casino_win` / `casino_cancel`; işaretli tutar, gerçek önceki/sonraki bakiye, anahtar `igames_<user_code>_<round_id>_<trans_type>`) ve kalıcı makbuzu tek işlemde yazar; tekrar ve eşzamanlı kopyalar parayı bir kez hareket ettirir ve saklanan yanıtı alır. İşlem hatası `500 {code:1000}` döner ve hiçbir şey yazılmaz. Bonus çevrimi ve XP commit'ten sonra bir kez uygulanır. Negatif, sıfır ya da düz ondalık olmayan tutar (`"0x10"`, `"1e3"`, `"12abc"`) `400 {code:1005}` ile reddedilir. Oyuncu uçları çağırana bağlandı: `/game/url` ve `/user/info` yalnız çağıranın hesabıyla çalışır (başka `user_code` `403`), oyuncunun gönderdiği `win_ratio` sağlayıcıya iletilmez; ajan geneli veri döndüren ve personel uçları izin ister.
- V19a: Promosyon talebi (`claimedBy`, kredi, `bonus` defter satırı, `BonusWagering`) tek işlemde yazılır; kısmi hata hepsini geri alır, eşzamanlı talepler bir kez kredi verir. Bonus feshi çağıranın işlemine katılır ya da kendi işlemini açar; her çevrimin durum değişikliği, bakiye düşüşü ve defter satırı birlikte yazılır, bakiye 0'ın altına inmez.
- V19b (Casino Content eklentisi): Igames oturum kapanışı iki kalıcı aşamada çalışır: oturum `active → closing` olur, sağlayıcıdan withdraw-all bir kira (lease) arkasında ve 30 sn zaman aşımıyla bir kez yapılır, sonra tek işlemde `balance = max(balance, çekilen)` ve tek `casino_return` satırı yazılır. Belirsiz sağlayıcı yanıtı (ağ hatası, zaman aşımı, 5xx, okunamayan gövde) oturumu 0 ile kapatmaz; sağlayıcı bakiyesi 0 görünürken beklenen tutar sıfırdan büyükse ya da çekilen tutar beklenenin yarısının altındaysa oturum `needsReconciliation` ile işaretlenir ve kredi yapılmaz. Yarım kalan `closing` oturumlarını reconcile işi tamamlar. Açık (`active`/`closing`) igames oturumu varken platform çekimleri reddedilir: kapanıştaki `max` oturum içi kazancı ikinci kez öderdi.

**Eklendi**
- `DEMO_INSTANT_DEPOSIT` (varsayılan `false`, yalnız tek kiracı modunda etkili) ve `TENANCY_MODE` okuması (`config/demoFlags.js`).
- `admin:integrations:read` / `admin:integrations:write` izinleri.
- `GET /api/admin/health/risk`.
- `POST /api/igames/session/:id/resolve` (`admin:users:balance`, denetim kaydı `igames_session_resolve`): işaretli igames oturumunu `retry` ya da `settle` ile çözer. `GET /api/admin/igames/summary` yanıtına `needsReconciliationCount` eklendi; işaretli oturumlar yaşından bağımsız `stuckSessionCount`'a girer.
- `CasinoSession` `closing` durumu ve `providerBalance`, `withdrawnAt`, `withdrawClaimedAt`, `withdrawUncertainAt`, `withdrawAttempts`, `needsReconciliation`, `expectedAmount`, `resolvedBy`, `resolvedAt`, `resolutionNote` alanları.
- `Transaction.type` yeni değerler: `reversal`, `casino_bet`, `casino_win`, `casino_cancel` (profil, admin kullanıcı paneli ve 8 dilde etiket). `createReversal` deterministik anahtar (`reversal:<id>`) taşır ve aynı işlemi ikinci kez tersine çevirmez.
- `server/scripts/migrate-crypto-index.mjs` (varsayılan dry run, `--commit`, `--fix`) ve `Counter` modeli.

**Düzeltildi**
- Sumsub webhook'u bu güncellemeden önce çalışmıyordu: global JSON ayrıştırıcı gövdeyi tükettiği için istek askıda kalıyordu. Güncellemeden sonra Sumsub sonuçları işlenmeye başlar.
- `createReversal` `reversal` türü enum'da olmadığı için hiç çalışmıyordu.
- Admin kripto ayarlarını kaydetmek şema uyuşmazlığı yüzünden başarısız oluyordu; kaydedilen değerler yeniden başlatmada kayboluyordu.
- `createTransaction` anahtarsız satıra `idempotencyKey: null` yazıyordu; tekil+seyrek indeks null'u da indekslediği için ikinci anahtarsız satır `E11000` ile düşüyordu. Alan artık anahtar yoksa hiç yazılmaz.

**Kırılan Değişiklikler**
- `POST /api/transactions/deposit` varsayılan olarak `404 DEMO_FEATURE_DISABLED` döner. İstemcide artık bu uca çağrı yoktur; `DEMO_INSTANT_DEPOSIT` her kurulumda (demo dahil) tanımsız/`false` bırakılmalıdır. Yalnızca harici bir çağırıcısı olan, bilinçli tek operatörlü test kurulumunda açın; `TENANCY_MODE=multi` iken bayrak yok sayılır. Gerçek para kurulumlarında açmayın.
- V5: Sistem rolleri ve özel roller, izni olmayan ekranları kaybeder (`admin` ve `super_admin` etkilenmez; yeni `admin:integrations:*` açılışta onlara eklenir). Varsayılan sistem rolleri için:

  | Rol | Artık 403 alan ekranlar / uçlar |
  |---|---|
  | `risk_analyst` | Dashboard ve Analytics sayıları (`admin:reports:read`), Mutabakat, Modüller, Ticket'lar, Chat moderasyonu, kripto ayarları ve hot wallet, sağlayıcı entegrasyon ayarları, igames modül ayarları, canlı admin akışı |
  | `support` | Dashboard ve Analytics sayıları, Mutabakat, Modüller, kripto ayarları ve hot wallet, entegrasyon ayarları, igames modül ayarları, canlı admin akışı (ticket ve chat kalır) |
  | `finance` | Mutabakat, Modüller, Ticket'lar, Chat moderasyonu, kripto ayarları ve hot wallet, entegrasyon ayarları, igames modül ayarları, canlı admin akışı (Analytics kalır) |
  | `casino_manager` | Mutabakat, Modüller, Ticket'lar, Chat moderasyonu, kripto ayarları ve hot wallet, entegrasyon ayarları, igames modül ayarları, canlı admin akışı (Analytics kalır) |
  | `content_manager` | Dashboard ve Analytics sayıları, Mutabakat, modül aç/kapa (liste okunur), Ticket'lar, Chat moderasyonu, entegrasyon ayarları, igames modül ayarlarını kaydetme, canlı admin akışı |

  Admin Dashboard bu 403'leri sessizce yutar (kartlar boş kalır, hata görünmez) ve admin menüsü izni olmayan öğeleri gizlemez; personel "boş sayfa" bildirirse rolüne ilgili izni verin (Ayarlar → Roller). Özel roller aynı kurala tabidir.
- Canlı admin socket akışı (`subscribe:admin`: aktivite, KYC/ticket olayları, kuyruk sayıları) artık `admin:activity:read` ister; sistem `support` ve `finance` rolleri bu izne sahip değildir ve canlı bildirimleri kaybeder, gerekiyorsa izin verin.
- `ADMIN_ALLOWED_IPS` tanımlıysa ticket/chat admin, `/api/bank/admin/*`, kripto ayarları/hot wallet, 2FA setup/verify/disable, igames personel uçları ve canlı admin socket odası da IP kısıtlıdır; listede olmayan adresten çalışan personel `403 ADMIN_IP_NOT_ALLOWED` alır. Cloudflare arkasında gerçek IP'nin `req.ip`'e ulaştığını doğrulayın.
- Risk istatistikleri `GET /api/admin/health/risk`'e taşındı; eski `GET /api/health/risk` `404` döner. Onu izleyen harici monitörler `admin:risk:read` izinli bir personel token'ı ile yeni yola geçmeli.
- Oyuncular artık chat rain başlatamaz (`chat:rain` → `chat:error`); rain yalnız `admin:users:balance` izinli personelce ve kendi bakiyesinden yapılır. `chat:rain` ve `chat:tip` socket olayları `requestId` ister (yankı olayları `chat:rainCreated` / `chat:tipSent` onu geri döner); bunu göndermeyen özel istemciler `REQUEST_ID_REQUIRED` alır. Rain'in sorumlu oyun ret kodu `RG_BLOCKED` yerine `ACCOUNT_RESTRICTED`'tır.
- Tip artık göndereni çekim kapılarından geçirir: KYC (`KYC_REQUIRED`, `KYC_CHECK_UNAVAILABLE`), risk (`RISK_BLOCKED`, `RISK_RESTRICTED`), sorumlu oyun (`ACCOUNT_RESTRICTED`, `LIMIT_EXCEEDED`), çekim kilidi (`WITHDRAWAL_LOCKED`), bonus kilidi (`INSUFFICIENT_BALANCE`), oda kuralları (`BANNED`, `MUTED`, `ROOM_INACTIVE`). KYC modülü açıkken KYC'si onaylı olmayan oyuncu tip gönderemez.
- Moderatörler başkasının mesajını socket `chat:delete` ile silemez; admin panelindeki REST silme ucu (`admin:support:write`) kullanılır.
- Operatör origin'leri platform API'sinde CORS'u kaybeder: bir operatörün sayfası tarayıcıdan `/api/provider/v1` dışındaki `/api/*` uçlarını çağıramaz (Socket.IO etkilenmez). Platform istemcisi ve game-host kendi origin'leriyle çalıştığı için etkilenmez.
- Casino Content eklentisi uçları (API tüketicileri için kırıcı): `GET /api/igames/agent/info`, `POST /api/igames/transactions`, `/round-details`, `/game/online`, `/game/call-config` artık personel + `admin:casino:read`; `POST /api/igames/user/create` personel + `admin:casino:write`; `/agent/rtp` `admin:casino:rtp`, `/agent/callback-test` `admin:casino:write`, `/user/deposit`, `/user/withdraw`, `/user/withdraw-all` `admin:users:balance`, `/bonus/start` ve `/bonus/cancel` `admin:casino:bonus`, `/statistics/user` `admin:reports:read` ister. `/game/url` ve `/user/info` yalnız çağıranın hesabını kullanır (başka `user_code` `403`), `win_ratio` gövdeden okunmaz. Web istemcisi yalnız `/game/launch`, `/game/close`, `/games`, `/game/all` çağırdığı için etkilenmez.
- Igames geri çağrıları: tutarı negatif, sıfır ya da düz ondalık olmayan para geri çağrısı `400 {code:1005}` alır (önceden negatif bir "bet" oyuncuya kredi veriyordu, `"12abc"` gibi değerler kabul ediliyordu). Makbuz anahtarı `<round_id>:<trans_type>`'tan `<user_code>:<round_id>:<trans_type>`'a değişti; eski biçimli makbuzlar 30 günlük TTL boyunca işlenmiş sayılır. Reddedilen geri çağrı artık makbuz yakmaz (aynı kopya yeniden gelince yine reddedilir, `{code:0}` almaz); bilinmeyen `user_code` için makbuz yazılmaz. Bahissiz cancel ve win yine kredi verir (eski davranış, değişmedi).
- Kullanıcının açık (`active` ya da `closing`) igames oturumu varken `POST /api/transactions/withdraw`, `POST /api/bank/withdraw` ve `POST /api/crypto/withdraw-request` `409 IGAMES_SESSION_OPEN` döner; oturum incelemeye düşmüşse `409 IGAMES_SESSION_REVIEW`. Oyuncu önce oyunu kapatmalıdır. Admin toplu `withdraw-test-users` aracı açık oturumu olan kullanıcıları atlar.
- Igames kapanış defter satırı: anahtar `igames_return_<sessionId>` yerine `igames_close_<sessionId>`; `casino_return` tutarı çekilen tutar değil bakiyedeki gerçek değişimdir (değişim 0 ise satır yazılmaz). `casino_return` toplamından "igames'ten dönen para" hesaplayan raporlar güncellenmeli. `CasinoSession.status` yeni `closing` değerini alabilir; `active`'i "açık oturum" sayan dış sorgular `closing`'i de saymalı.
- Bonus feshi tek toplu satır yerine her çevrim için bir `bonus_forfeit` satırı yazar: anahtar `forfeit_<wageringId>`, tutar fiilen düşülen miktar (`-deducted`), metadata `{ reason, wageringId, forfeitAmount, deducted }` (önceden `{ forfeitedWagerings, totalForfeitedAmount }`). Bakiye 0'ın altına inmez; düşülecek bir şey yoksa satır yazılmaz.
- Promosyon talebinin tekrarı standart hata gövdesiyle `409 ALREADY_CLAIMED` döner (önceden `{ error: '...' }`); olmayan ya da pasif promosyon `404` kalır.
- `PUT /api/admin/crypto/settings` tel biçimi: `{ deposit: { autoCreditLimit?, requireApprovalAbove? }, withdraw: { autoProcessLimit?, requireApprovalAbove? }, usdtTryRate?, network? }`; dış ve iç nesneler katıdır (bilinmeyen anahtar `400`), limitler 0–1e9, kur 0'dan büyük ve en çok 1e6, ağ `mainnet|shasta|nile`. `deposit`/`withdraw` için boolean artık reddedilir. Panelden kaydedilen değer env'in (`USDT_TRY_RATE`, `TRON_NETWORK`) önüne geçer; kaydedilmemiş anahtarlar env'i izlemeye devam eder.
- Yeni `Transaction.type` değerleri (`reversal`, `casino_bet`, `casino_win`, `casino_cancel`): türe göre süzen ya da toplayan dış raporlar ve entegrasyonlar bunları tanımalı. Igames bahis ve kazançları artık defterde görünür.
- `createTransaction` anahtarsız satırlarda `idempotencyKey` alanını hiç yazmaz (önceden `null`). `{ idempotencyKey: null }` sorgusu eksik alanı da eşlediği için çoğu sorgu etkilenmez; `$type: 'null'` ile arayanlar yeni satırları bulmaz.
- Slikair: senkron `createPayout` 5xx, zaman aşımı ya da ağ hatası verdiğinde bakiye artık otomatik iade edilmez; payout `needsReconciliation` ile işaretlenir ve elle mutabakat gerekir (henüz admin ekranı yok).
- Sumsub webhook'unda yanlış uzunlukta imza artık `200` değil `401` alır.
- Operatör adımları (sıra önemli): (1) `DEMO_INSTANT_DEPOSIT` hiçbir kurulumda açılmaz (istemci çağrısı yok). (2) Güncellemeden önce salt okunur null-anahtar sayımı (`db.transactions.countDocuments({$expr:{$eq:[{$type:"$idempotencyKey"},"null"]}})`). (3) Güncellemeden sonra `node scripts/migrate-crypto-index.mjs` (dry run), sonra `--commit`; çift indeks raporlanırsa `--fix`'ten önce o kullanıcıların yatırma geçmişini inceleyin. (4) V10 öncesi `failed` olup iade edilmemiş Slikair ödemelerini mutabakat sorgusuyla bulun. (5) Kripto ayarlarını panelde kontrol edip bir kez kaydedin. (6) Personel rollerini yukarıdaki tabloya göre gözden geçirin. (7) Igames'te `needsReconciliationCount`'u izleyin ve işaretli oturumları resolve ucuyla çözün.

### İP-0 PR-2: KYC ve kişisel veri sertleştirmesi (V3, V12, V13, V16)
**Güvenlik**
- V3: KYC kimlik belgeleri artık düz `express.static` ile (`/uploads/kyc`) sunulmaz. Dosyalar sunulan hiçbir yolun dışındaki `KYC_UPLOAD_DIR` altında tutulur (varsayılan `server/storage/kyc`), kayıtlar `storageKey` taşır ve belge yalnız kimlik doğrulamalı `GET /api/kyc/documents/:id` ile iner: belgenin sahibi ya da `admin:kyc:read` iznine sahip, izinli IP'den gelen admin. Sahibi olmayan çağıran belge var olsa da olmasa da 403 alır. Yanıtlar `Cache-Control: private, no-store`, `nosniff` ve `Content-Security-Policy: sandbox` ile döner. Taşıma betiği çalışana kadar eski konumlardan (`server/uploads/kyc`, `<cwd>/uploads/kyc`) salt okunur geri dönüş vardır. Admin KYC inceleme sayfası belgeleri yetkili blob isteğiyle açar.
- V12: KYC sağlayıcı sırları (`SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY`, `SUMSUB_WEBHOOK_SECRET`) `OPERATOR_SECRET_ENCRYPTION_KEY` ile AES-256-GCM (`enc:v1:`) şifrelenir; anahtar yoksa yazma fail-closed reddedilir, eski düz metin okunur (uyarı loglanır) ve ilk yazımda şifrelenir. Admin `GET /api/admin/kyc-settings` yalnız maskeli değer görür (`rawValue` null), formdan geri gelen maskeli değer saklı sırrın üzerine yazılmaz; admin KYC ayar sayfası sır alanlarını önceden doldurmaz. Okunamayan webhook sırrı `503` döner ki Sumsub olayı yeniden denesin.
- V13: Canlı kazananlar (`winners:new` socket olayı ve `GET /api/inhouse/recent-winners`) artık `userId` taşımaz; `username` her kazanan için maskelenir (ilk 2 karakter + `***`), sahte kazananlar da aynı şekilde maskelenir, her olay rastgele bir `id` alır.
- V16: Denetim yolları `admin:audit:read` ister; `GET /api/admin/audit/export` ayrıca `admin:reports:export` ister. Denetim CSV'si formül enjeksiyonuna karşı nötrleştirilir (`= + - @ TAB CR` ile başlayan hücrelere `'` eklenir), her hücre tırnak içine alınır (Türkçe yerelli Excel `;` ile böler) ve RFC 4180'e göre kaçırılır.
- Operasyon: `scripts/backup-db.sh` artık `BACKUP_FILES` (iki nokta ile ayrılmış dizin listesi, örn. kalıcı KYC dizini) ile dosya dizinlerini de yedekler: her mevcut dizin dump'tan sonra, rclone yüklemesinden önce `files-<dizin-adı>.tar.gz` (mod 600) olarak arşivlenir; olmayan dizin uyarıyla atlanır, tar hatası yedeği başarısız sayar, `--dry-run` yalnız listeler. Geri yükleme: arşivi dizinin üst klasörüne `tar -xzf` ile açın.

**Kırılan Değişiklikler**
- KYC dosyaları artık `KYC_UPLOAD_DIR` altındadır (varsayılan `server/storage/kyc`). Bu klasör dağıtımlar arasında **kalıcı** olmalı ve rsync'in üzerine yazdığı ya da `--delete` ile sildiği bir yolun içinde olmamalıdır; `KYC_UPLOAD_DIR`'i `DEPLOY_PATH` dışında mutlak bir yola (mod 700) işaretlemeniz önerilir: deploy'daki `rsync -a` `server/storage/kyc` modunu her seferinde sıfırlar, orada `chmod` kalıcı olmaz. Yedeğe alın.
- Eski `/uploads/kyc/*` statik adresleri çalışmaz; belgeler yalnız kimlik doğrulamalı `GET /api/kyc/documents/:id` ile sunulur. Eski adresleri saklayan harici araçlar bu uca geçmeli.
- Winners yayını ve REST yanıtı `userId` taşımaz ve gerçek kullanıcı adı yerine maskeli ad döner; `userId`'ye ya da tam kullanıcı adına dayanan istemciler güncellenmeli.
- Denetim: `finance` rolü denetim dışa aktarımında artık 403 alır (`admin:audit:read` da gerekir); `risk_analyst` denetimi okuyabilir ama dışa aktaramaz. Denetim CSV'si BOM'lu UTF-8, CRLF satır sonlu ve RFC 4180 kaçışlıdır.
- Operatör adımları: (1) Servisin çalışma dizininden ve `server/.env` ile aynı ortamla `node scripts/migrate-kyc-uploads.mjs` (dry run), sonra `--commit`: mevcut KYC dosyalarını `KYC_UPLOAD_DIR`'e taşır ve `storageKey` doldurur; betik `server/.env`'i kendisi yükler, `MONGODB_URI` yoksa hata verir; başka eski dizinler için `--from <dizin>` (tekrarlanabilir). Sonra kontrol: `moved` eski dizinlerdeki dosya sayısına eşit mi, KYC incelemede bir eski ve bir yeni belge açılıyor mu, imzalı bir Sumsub test webhook'u kabul ediliyor mu. (2) `node scripts/migrate-encrypt-secrets.mjs` (dry run), sonra `--commit`: KYC sırlarını da şifreler; bu adım atlanırsa eski KYC sırları yeniden girilene kadar düz metin kalır.

### İP-0 PR-1: kimlik ve oturum sertleştirmesi (V1, V2, V14, V20, V21)
**Güvenlik**
- V1: `GET /api/admin/users` ve `User.toSafeObject` artık şifre sıfırlama/e-posta doğrulama token'larını, 2FA sırrını ve yedek kodlarını döndürmez (alanlar `select: false`). Sıfırlama ve doğrulama token'ları DB'de SHA-256 hash olarak saklanır; ham token yalnız e-posta linkindedir. 2FA sırrı ve yedek kodları `OPERATOR_SECRET_ENCRYPTION_KEY` ile AES-256-GCM (`enc:v1:`) şifrelenir; anahtar yoksa yazma işlemleri fail-closed reddedilir, eski düz metin okunabilir; TOTP sırrı ilk başarılı TOTP'de yeniden şifrelenir, eski yedek kod dizileri ise yalnız bir kod kullanıldığında ya da migrasyon çalıştığında şifrelenir. Mevcut kayıtlar için `server/scripts/migrate-encrypt-secrets.mjs`.
- V2: 2FA'lı hesaplar girişte ikinci faktörü (TOTP veya yedek kod) doğrulamadan oturum alamaz. Şifre, cüzdan, Google ve Telegram girişlerinin hepsi tek oturum kapısından (`issueSession`) geçer; 2FA'lı hesapta yalnız kısa ömürlü (5 dk), tek kullanımlık, 5 denemelik bir challenge döner ve `POST /api/auth/2fa/login` ile tamamlanır. Hesap başına (IP'den bağımsız) 15 dakikada 10 yanlış kod kilitlenir (`429 TOO_MANY_ATTEMPTS`). Personel için 2FA zorunlu değildir; yalnız etkinleştirenler kod sorulur.
- V14: Google girişi, Google'ın doğrulamadığı e-posta ile reddedilir (`GOOGLE_EMAIL_UNVERIFIED`). Bağlı olmayan yerel hesaba otomatik bağlama yalnız iki taraf da e-postayı doğruladıysa yapılır; aksi halde `409 GOOGLE_LINK_REQUIRED` (callback `error=google_link_required`) ve kullanıcı şifreyle girip profilden bağlar. Google profil kimliği normalize edilir; elle bağlamada e-posta yalnız adresler eşleşirse doğrulanmış sayılır.
- V20: Socket el sıkışmaları (`/live`, `/chat`, `subscribe:user`, `subscribe:admin`) imzaya ek olarak `tokenVersion`, `isSeed` ve `purpose` kontrolü yapar (`services/socketAuth.js`); iptal edilmiş token'lar artık socket açamaz.
- V21: `admin:users:write` tek başına admin hesabı açamaz; rol atama ve rol oluşturma/güncelleme yalnız aktörün kendisinde olan izinlerle sınırlıdır (`403 ROLE_GRANT_FORBIDDEN`), yalnız super_admin düzeyindeki aktörler her rolü atayıp admin açabilir. Sistem rolleri değiştirilemez; varsayılan `admin` rolü yoksa admin oluşturma fail-closed (`500 DEFAULT_ADMIN_ROLE_MISSING`) durur.

**Eklendi**
- `POST /api/auth/2fa/login` (`{ challengeToken, token }`); `POST /auth/login` ve `POST /auth/wallet/login` 2FA'lı hesaplarda `{ requires2fa: true, challengeToken }` döner, Google/Telegram callback'i `/auth/callback?requires2fa=1#challenge=...` adresine yönlendirir. İstemcide 2FA adımı ve Google bağlama uyarısı (8 dil).
- `npm run test:security` (`server/test/security/`); `npm test` bu suite'i de çalıştırır.

**Kırılan Değişiklikler**
- Dağıtımdan önce gönderilmiş şifre sıfırlama ve e-posta doğrulama linkleri geçersiz olur (DB artık hash saklar). Kullanıcılar yeni link ister; toplu için `node scripts/resend-verification.js`.
- 2FA etkin hesaplar her girişte kod sorulur; `POST /auth/login`, `/auth/wallet/login` yanıtı kullanıcı/token yerine `requires2fa` + `challengeToken` olabilir. Bu yanıtı işlemeyen özel istemciler `POST /auth/2fa/login` adımını eklemeli. Google/Telegram callback'i de `requires2fa=1#challenge=` ile dönebilir.
- Google ile giriş artık yalnız her iki tarafın e-postası doğrulanmışsa mevcut yerel hesaba otomatik bağlanır; diğer durumlarda `google_link_required` ile profil üzerinden elle bağlama gerekir. Google'ın doğrulamadığı e-postalar reddedilir.
- Eski socket token'ları (iptal edilmiş `tokenVersion`, seed hesap, purpose'lu token) düşer; bağlı istemciler yeniden bağlanıp yeniden giriş yapar.
- `admin:users:write` tek başına admin açamaz; admin oluşturmak/rol atamak için `admin:roles:write` ve atanan rolün tüm izinlerine sahip olmak gerekir, admin açma fiilen super_admin düzeyindeki aktörlere kalır. Rol oluşturma/güncelleme de aynı kuralla sınırlıdır.
- Cüzdan/Google/Telegram girişi de şifreli giriş gibi kullanıcının diğer oturumlarını geçersiz kılar (`tokenVersion` artar).
- Hesap askıya alındığında (`isActive: false`) veya silindiğinde tüm oturumları hemen biter: `tokenVersion` artar, refresh cookie'si dönmez, açık access token'lar ve socket bağlantıları reddedilir. Askıdaki, silinmiş veya seed hesap cüzdan/Google/Telegram ile de giriş yapamaz (`403 ACCOUNT_BANNED`; önceden yalnız şifreli giriş reddediyordu).
- 2FA'yı etkinleştirmek veya kapatmak o kullanıcıyı (yöneticiyi) her yerden çıkarır; yeniden giriş gerekir.
- Google ile bağlı hesap, yerel e-postası Google e-postasından farklı olsa da `googleId` ile bulunur (önceden tekrar girişte hata veriyordu).
- Operatör adımları: (1) `server/.env` içinde `OPERATOR_SECRET_ENCRYPTION_KEY` tanımlayın (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) ve sunucu dışında yedekleyin; anahtar kaybolursa şifreli 2FA sırları okunamaz. (2) `cd server && node scripts/migrate-encrypt-secrets.mjs` (dry-run), sonra `node scripts/migrate-encrypt-secrets.mjs --commit`. Anahtar yokken 2FA kurulumu ve yedek kod yazımı reddedilir.

### Demo/seed hesaplara e-posta gönderimi uygulama düzeyinde baskılanıyor
**Eklendi**
- `MAIL_SUPPRESS_EMAIL_DOMAINS` (virgülle ayrılmış, varsayılan `seed.local,test.local,local`):
  listedeki domainlere **ve alt domainlerine** hiçbir mail gönderilmez. `local` ayrılmış
  TLD olduğu için demo/seed (`@seed.local`) ve e2e (`@test.local`) hesapları da kapsanır;
  bu adresler teslim edilemez, yalnız sağlayıcı hacmi/kotarya ve gönderim günlüğü üretiyordu.
- Kural tek yerde (`server/src/config/mailSuppression.js`), iki bağlantı noktasında:
  `sendEmail` transport sınırında (systemMail aksiyon + kitle, destek bileti, operatör
  uyarıları ve ileride eklenecek her çağıran için emniyet sübabı — sağlayıcıya emisyon
  gitmez, `{ mock: true, suppressed: true }` döner) ve `resolveAudience` kitlesel seçim
  sorgusunda (`email.$not` — adresler kitleye hiç girmez, `SystemMailLog` satırı da
  yazılmaz). `sendActionMail` baskılanmış alıcıyı `skipped/suppressed_domain` olarak
  erken döner (log satırı yok — `bot_user`/`no_recipient` ile aynı aile).
- Panelden "Test e-postası" baskılanmış adrese giderse `400 MAIL_RECIPIENT_SUPPRESSED`
  döner — sahte "gönderildi" izlenimi yerine açık red.
- `scripts/resend-verification.js` artık aynı listeyi kullanıyor (`--exclude-domain`
  buna eklenir); `.local` kuralı scriptte değildi, uygulamanın kendisinde.
- Testler: `server/test/mailSuppression.test.js` (16) — liste çözümü ve env ezmesi,
  boş liste = kapalı, alt domain/lookalike eşleşmeleri, `userSeed.js` SEED_DOMAIN'in
  varsayılan listede kalması (sürüklenme koruması), sağlayıcıya emisyon gitmediği,
  kitle sorgusunun `$not` taşıdığı.

**Değiştirildi**
- Baskılama sağlayıcı çözümlemesinden ÖNCE çalışır: hiçbir credential olmayan
  kurulumda bile baskılanmış adres `MAIL_PROVIDER_NOT_CONFIGURED` değil
  `MAIL_RECIPIENT_SUPPRESSED` alır.


### Scriptler artık her dizinden doğru env dosyasını okuyor (`server/.env`)
**Düzeltildi**
- `server/scripts` içindeki env yükleme iki bozuk desendi: `import 'dotenv/config'` ve
  `config({ path: resolve('../.env') })` **cwd'ye** bakıyor, `config({ path:
  resolve(__dirname, '../../.env') })` ise cwd'den bağımsız ama **repo/decode kökündeki**
  `.env`i okuyor. Belgelenen çağrı biçimi kökten çalıştırma (`node server/scripts/healthcheck.js`,
  `node server/scripts/migrate.js`, `node server/scripts/seed.js`,
  `node server/scripts/ledger-dedupe.mjs`, `node server/scripts/inhouse-audit-report.mjs`,
  `node server/scripts/validate-token.mjs`), yani production'da bu scriptler
  dağıtım kökündeki `.env`i (bayat SMTP değerleri + eksik `OPERATOR_SECRET_ENCRYPTION_KEY`/
  `MAILTRAP_TOKEN`), dev makinesinde kök `.env`i (içinde `MONGODB_URI` **yok**) okuyordu.
  15 script tek kaynağa bağlandı: `server/scripts/lib/env.mjs` → `server/.env`
  (uygulamanın kendi dosyası, `app.js` ile birebir).
- `lib/env.mjs` import edildiği anda yükler: eski `dotenv/config` sıralama semantiğini
  korur — gövdede çağrılan bir yükleme, modül düzeyinde `process.env` okuyan bir
  bağımlılığı env'siz bırakırdı. `dotenv` kuralları gereği dışarıdan enjekte edilen
  env (`CI`, `MONGODB_URI=… node …`) yine önceliklidir.
- `validate-token.mjs`: koda gömülü makineye özgü `.env` yolu ve sağlayıcı API host'u kaldırıldı; `PALACE_API_TOKEN`/`PALACE_API_BASE` env'den okunuyor.
- `resend-verification.js` aynı yardımcıya bağlandı (`resolveEnvFile()` dışa açık kaldı).

**Eklendi**
- `server/test/scriptsEnvLoading.test.js`: `server/scripts` içinde cwd-bazlı
  (`dotenv/config`, `resolve('../.env')`) veya kök `.env` ('`../../.env`') yüklemesi
  bırakan her scripti denetler; `SERVER_ENV_FILE`'ın iki farklı cwd'den aynı yolu
  ürettiğini altprosesle doğrular; `app.js` ile aynı dosyayı hedeflediğini kilitler.


### Doğrulama maili telafi scripti
**Eklendi**
- `node server/scripts/resend-verification.js` — doğrulama maili gitmemiş hesaplara yeni 24 saatlik link gönderir; e-posta aksaklığı sırasında kaydolup doğrulayamayan oyuncular (`EMAIL_NOT_VERIFIED`) için telafi aracıdır.
- `--dry-run` yalnız sayı + domain/ay kovaları yazar (hiç mail göndermez, hiç token üretmez); `--since/--until` penceresi, `--limit` (varsayılan `MAIL_SEND_BATCH_LIMIT`), `--parallel`, `--exclude-domain`. `--yes` verilmeden DB bağlantısı açılmaz; sağlayıcı çözümlenemezse (mod `none`) gönderime başlamadan çıkar.
- Gönderim `sendActionMail('user.emailVerify')` üzerinden: kayıt doğrulama akışıyla aynı şablon/token/TTL yolu, her mail `SystemMailLog`a yazılır. Link origin'i `CLIENT_URL`'in ilk adresidir.
- Env kaynağı `server/.env` olarak sabitlendi (uygulamanın kendi yüklediği dosya): `import 'dotenv/config'` cwd'ye baktığı için dağıtım kökündeki bayat `.env` yüklenebilirdi.
- Testler: `server/test/resendVerificationBackfill.test.js` — seçim filtresi, `.local` (seed.local/test.local) ve bozuk adres dışlaması, kanonik origin, TTL'nin `controllers/auth.js` ile ayrılmazlığı, `--yes` kapısının DB bağlanmadan önce çalışması.



### E-posta gönderimi: Mailtrap Email API sağlayıcısı
**Eklendi**
- `mailtrap` e-posta sağlayıcısı: gönderim Mailtrap **Sending API** ile yapılır
  (`mailtrap` SDK, `MailtrapClient.send`). Yeni ayarlar hem panele (Settings →
  Modules → Email Gateway kartı) hem `.env` örneklerine eklendi: `MAILTRAP_TOKEN`
  (`smtp.token`, gizli — SMTP şifresiyle aynı store ve aynı şifreleme),
  `MAILTRAP_SANDBOX` (varsayılan `false`) ve `MAILTRAP_INBOX_ID`.
- Mekanizma seçimi tek yerden: `emailConfig.resolveEmailMode`. Token çözülmüş ve
  sağlayıcı `mailtrap` ise (ya da SMTP host'u hiç yoksa) API, aksi halde genel
  SMTP transport kullanılır — Mailgun/SES/Postmark/özel SMTP kurulumları
  davranışını değiştirmez.
- Panel: Mailtrap seçiliyken bağlantı alanları (host/port/user/pass/secure)
  yerine API bloğu (token + Sandbox anahtarı + Sandbox inbox ID) çizilir; rozet
  hangi mekanizmanın aktif olduğunu gösterir. API modunda `configured` ölçütü
  host değil token'dır.
- Health: "E-posta gönderimi" kontrolü artık token ya da host'a bakar (adı
  `service:smtp` kalır); bundan önce yalnızca SMTP host'u bakıldığı için,
  sağlayıcı tamamen reddedense bile kontrol `ok` görünürdü.
- Testler: `server/test/emailSettings.test.js` — mekanizma seçimi, API mesaj
  biçimi (`from {email,name}` / `to [{email}]`), client'ın token imzasıyla
  yeniden kurulması, sandbox + inbox zorunluluğu, gateway kapalıyken token'ın
  `.env`'den çözülmesi; `emailProviderLogic.test.js` — mailtrap preset/infer.

**Değiştirildi**
- E-posta gönderimi Mailtrap Email API üzerinden de yapılabilir; Mailgun SMTP kullanan kurulumlar, API'ye geçerken eski SMTP host/kullanıcı/şifre değerlerini `.env`'den kaldırmalıdır. Gönderim günlüğü Mailtrap Email Logs'unda izlenir.
- Sandbox modu açıldığında transport her kurulduğunda sunucu loguna uyarı
  yazılır: Sandbox açıkken hiçbir gerçek alıcıya mail çıkmaz, bu sessiz kalmasın.
- Email Gateway kartındaki host yer tutucusu `smtp.mailgun.org` yerine genel
  örnek `smtp.example.com` (AGENTS.md: forma gerçek sağlayıcı değeri yazılmaz).
- `integrationSettings.update` boolean→string dönüşümü `useSandbox`'u da kapsar;
  sayısal alan listesi `port` ile birlikte `sandboxInboxId`'yi de stringe çevirir.

**Kırılan Değişiklikler**
- `POST /admin/settings/email/test` hata kodları sağlayıcı-bağımsız ad aldı:
  `SMTP_NOT_CONFIGURED` → `MAIL_PROVIDER_NOT_CONFIGURED`, `SMTP_SEND_FAILED` →
  `MAIL_SEND_FAILED`; yeni `MAILTRAP_SANDBOX_INBOX_MISSING` (`400`). API'yi
  tüketen kod bu kodları eşleştiriyorsa güncellemeli.
- Kurulum adımı: yeni bağımlılık için sunucuda `npm install` (veya `npm ci`) gerekir (`server/package.json` → `mailtrap`); atlanırsa e-posta modülü import sırasında düşer.
- Mailtrap ile göndermek için `MAILTRAP_TOKEN` tanımlı olmalı **ve** gönderen
  domain'in Mailtrap Sending Domains içinde doğrulanmış olması gerekir; aksi
  halde API gönderimi reddeder. `SMTP_FROM` doğrulanmış domainin adresinde
  olmalı.


### In-house oyun: King of Money — yeni oyun ekranı, Çifte Şans, Bonus Satın Al, Oto
**Eklendi**
- Çifte Şans (bahsin 1,25 katı tahsil edilir, hazine sandığı daha sık düşer; ölçülen RTP
  %95,94) ve Bonus Satın Al (bahsin 100 katına doğrudan 15 bedava dönüş; ölçülen RTP
  %96,93, hedef bandın üstünde). Kazançlar ve bahis aralığı temel bahis üzerinden.
- Otomatik oyun ve yeni oyun ekranı (In-house Games eklentisinin güncel sürümüyle).
- Oyuncu tohum geçmişi listesi (`GET /fairness/rounds`) `nonce`, `seedHash` ve King of
  Money için `mode` / `x` alanlarını da döner.
**Kırılan Değişiklikler**
- `POST /games/kingofmoney/spin` artık `mode: 'ante' | 'buy'` kabul eder; yanıttaki
  `amount` tahsil edilen tutardır, temel bahis outcome'daki `baseBet`'tir. Migration
  gerekmez; oyun arayüzü (game-host) yeniden build edilmelidir.

### In-house oyunlar: NEON ABYSS kaldırıldı (15 oyun)
**Kaldırıldı**
- NEON ABYSS (`inhouse-neonabyss`) slotu oyunlardan kaldırıldı: lobi kartı ve
  `/games/neonabyss` rotası, admin oyun-ayarları alan bloğu, GameSettings şema
  alanları (`neonabyssMinBet`/`neonabyssMaxBet`), seed ve meta kayıtları, 8 dilde
  oyun adı ve alan etiketleri. In-house Games eklentisinin güncel sürümü oyunun
  motorunu ve ekranını içermez. Oynanmış round'lar ve işlemler silinmez.
- `add-neonabyss-to-operators.mjs` migration'ı kaldırıldı.
**Değiştirildi**
- Oyun sayısı belgelerde ve admin panelindeki In-house modül açıklamasında
  (8 dil) 15 olarak düzeltildi.
**Kırılan Değişiklikler**
- Mevcut kurulumlarda güncellemeden sonra eklentiyle gelen
  `remove-neonabyss-from-operators.mjs` migration'ı `server/` dizininden bir kez
  koşulmalıdır: operatörlerin izinli oyun listesinden `neonabyss` çıkarılır ve
  `inhouse-neonabyss` ayar dokümanları silinir. Koşulmazsa admin oyun-ayarları
  listesinde alanı olmayan bir satır kalır; oyun yine de açılmaz. Oyun arayüzü
  (game-host) yeniden build edilmelidir.

### In-house oyun: KING OF MONEY (kingofmoney) provably-fair slot
**Eklendi**
- `inhouse-kingofmoney` anlık slot oyunu çekirdek kaydı: 6×5 tahta, her yerde öder
  (8+ aynı sembol), yuvarlanma (tumble), çarpan küreleri ve bedava dönüşlerde
  biriken Kral Çarpanı; round başına tavan 10.000× bahis. Matematik eklentide
  mühürlüdür — ölçülen RTP %95.88 ±0.11 pp (300M round simülasyonu; dağılım
  iddiası, tek round garantisi değildir). Admin ve operatör yalnız bahis aralığını
  (varsayılan 0.20–100) ve aç/kapat'ı ayarlar; RTP alanı yoktur.
- Lobi kartı (`images/games/kingofmoney.png`) ve `/games/kingofmoney` rotası, admin
  oyun-ayarları alan bloğu, 8 dilde oyun adı ve alan etiketleri; şema/meta ad
  hizası için bekçi testi (`client/src/i18n/kingofmoneySettingsParity.test.js`).
- v1 yalnız normal modu sunar; başka bir `mode` isteği
  `KINGOFMONEY_MODE_UNAVAILABLE` ile reddedilir.
**Kırılan Değişiklikler**
- Yeni oyun mevcut operatörlerde otomatik görünmez: güncellemeden sonra eklentiyle
  gelen `add-kingofmoney-to-operators.mjs` migration'ı `server/` dizininden bir kez
  koşulmalıdır (idempotent); koşulmazsa launch `UNKNOWN_GAME` döner. Oyun arayüzü
  (game-host) yeniden build edilmelidir. Şema değişikliği yalnız ekleme (iki
  opsiyonel alan); mevcut dokümanlar etkilenmez.

### In-house oyunlar: Coin Flip
**Değiştirildi (oyun-güvenliği — regülasyon tavanı)**
- Coin Flip ödeme çarpanının yazılabilir üst sınırı 2.0 → 1.96'ya indirildi
  (`models/GameSettings.js` şema `max` + `services/gameSettings.js` multField
  validasyonu ve admin legacy dalı; üç yüzey birlikte, tek commit). Gerekçe:
  RTP = %50 × mult olduğundan mult 2.0 TAM %100 RTP / sıfır house edge, üstü
  negatif house edge demekti. Tavan = varsayılan (1.96 = RTP %98.00) olduğundan
  operatör artık yalnız AŞAĞI oynayabilir: yazılabilir RTP aralığı %90.00–98.00,
  alt sınır 1.8 değişmedi.
- Eski kayıtlar: tavan diskteki eski yazımları susturmaz
  (Mongoose validasyonu yalnız save()'de koşar; bant-dışı disk değeri okumada
  olduğu gibi hydrate olur ve ödemede kullanılmaya devam eder), bu yüzden
  deploy-öncesi SADECE-OKUMA denetimi: `server/src/scripts/migrations/audit-coinflip-mult-band.mjs`
  — bant-dışı kayıt bulursa çıkış 1 ile DEPLOY DURUR; onarım (clamp/bildirim)
  CM + Game Math kararıdır, script hiçbir şey yazmaz.
### In-house oyun: NEON ABYSS (neonabyss) provably-fair slot
**Eklendi**
- `inhouse-neonabyss` anlık slot oyunu çekirdek kaydı: 5×3 grid, 20 payline,
  çarpanlı bedava-dönüş zinciri; outcome matematiği tek evaluator
  `math/neonAbyssMath.js` içinde mühürlüdür — ölçülen RTP %95.932 ±0.093 pp
  (100M round × 2 yol, 6/6 gate PASS; dağılım sertifikası). `GAME_FIELD_META`
  girdisi yalnız `neonabyssMinBet`/`neonabyssMaxBet` taşır; `percentField`/
  `multField` BİLEREK yok (coinflipPayoutMult'un karşısı tanısız — admin'e
  açılan her çarpan mührü kırar ve yeniden sim ister). Operatör yetkisi:
  aç/kapat + bet aralığı (0.20–100, onaylı literal).
- Doğrulama sayfası slot round'unu açıklanan seed'lerden uçtan uca bağımsız
  yeniden üretir (pfslot-v1 zinciri + strips-rev4 sürüm kapısı; eksik/yabancı
  sürüm damgasıysa doğrulama reddedilir). Coinflip oyun ekranı ve Santa Crash
  arayüz güncellemesi aynı sürümle gelir; para-yolu düzeltmeleri (Keno tekrarlı
  seçim, Dragon Tiger tie hükmü, Roulette stake) in-house provider'ın güncel
  sürümüyle dahil.
**Değiştirildi**
- In-house provider, neonabyss route'larını (launch/games/operatorSettings) ve
  oyunun matematik belgelerini içeren sürüme güncellendi. Kurulum sırası:
  çekirdek kayıt ve migration önce, provider güncellemesi sonra (aşağıdaki
  Kırılan Değişiklikler).
**Kırılan Değişiklikler**
- Yeni oyun id'si mevcut operatörlerde otomatik görünmez: migration koşusu
  gerekir (`server/src/scripts/migrations/add-neonabyss-to-operators.mjs`,
  coinflip kalıbının devamı). Sıra ZORUNLU: migration + çekirdek kayıt
  (şema+meta+defaults, tek atomik commit) üretime inmeden provider rotaları
  açılmaz — rota önce inerse her spin 500 (fail-closed). Kayıt BÖLÜNÜRSE
  (meta var, şema alanı yok/ada uymuyor) bet aralığı SESSİZCE devre dışı kalır
  (fail-open); bu sınıf tek atomik commit + statik alan-adı bekçisiyle kapatılır.
  Not (2026-10-20 throwaway-Mongo ölçümü): migration'ın kendisi fail-open kapısı
  DEĞİLDİR — `$setOnInsert` upsert şema-default'larını yazar, şema indikten sonra
  okuma eksik yolları hydration'da doldurur; hükmün eski "kalıcı çıplak doc"
  gerekçesi ölçümle çürütüldüğü için düzeltildi.
- `server/test/instantGamesSeed.test.js`: handler listesi assert'i tam-liste
  `deepEqual` yerine içerme + üst-sınır biçimine alındı (gitlink bump'la
  atomiklik tuzağı kapatıldı) ve izole-olmayan `MONGODB_URI` altında koşmak
  artık `before()`da REDDEDİLİYOR (suite `deleteMany({})` koşar).

### In-house oyunlar: açık turlar
**Düzeltildi**
- Mines, HiLo, Blackjack ve Video Poker'da bağlantı kopunca ya da sunucu yeniden
  başlayınca tur kayboluyordu: bahsi çekilmiş, hiç ödeme yapılmıyordu ve oyuncu
  "önceki oturumunuzu kapatın" uyarısıyla oyuna giremiyordu. Artık açık tur veritabanında
  tutuluyor; ekran açıldığında turu geri getiriyor ve oyuncu kaldığı yerden devam ediyor.
- Hareketsiz kalan tur artık oyuncunun lehine otomatik kapanıyor: açılan kareler mevcut
  çarpanla toplanıyor, Blackjack'te krupiye normal kurallarla oynuyor, Video Poker'da beş
  kart da tutuluyor. Hiçbir şey açılmadıysa bahis iade ediliyor — oyuncu zaman aşımından
  zarar görmüyor. Eşik `INHOUSE_IDLE_SETTLE_MINUTES` ile ayarlanır (varsayılan 20 dakika).
- Çekilmiş ama hiç ödenmemiş, sahipsiz kalmış turlar (sunucu çökmesi ya da eski sürüm)
  aynı süpürme ile iade ediliyor. İade edilen turun işlem kimliği tur kimliğinden türetildiği için
  süpürme kaç kez çalışırsa çalışsın bakiye bir kez artıyor.

### In-house oyunlar: Blackjack
**Güvenlik**
- Blackjack'te ikiye katlanan (double) el, çekilen kartla 21'i geçtiğinde kaybetmesi
  gerekirken krupiyeyle karşılaştırılıp kazanç olarak ödenebiliyordu. Artık 21'i geçen
  el kaybeder (ödeme 0) ve krupiye oynamaz; normal eller değişmedi.

### In-house oyunlar: Keno, Rulet ve Dragon Tiger
**Düzeltildi**
- Keno ekranındaki ödeme tablosu, oyunun gerçekte ödediği tablodan yüksekti
  (1 seçim 1 isabet 3,8× yerine 3,0×; 10 seçim 10 isabet 10.000× yerine
  7.900×). Ekran artık motorun tablosunu gösteriyor; ödemeler değişmedi.
- Dragon Tiger beraberlik bahsi "8:1" yazıyordu, varsayılan ayar 13× (12:1)
  öder; etiket 12:1 oldu.
- Ekranlar varsayılan ayarların tablosunu gösterir: panelden `kenoPayoutScale`
  ya da Dragon Tiger çarpanları değiştirilirse ekran bunu henüz yansıtmaz.

**Güvenlik**
- Keno, Rulet ve Dragon Tiger'da bahis doğrulamasındaki üç hata kapatıldı; bu hatalar
  oyuncunun yatırmadığı tutar üzerinden ya da kendi lehine oranla kazanmasına izin
  veriyordu. Normal oyun akışı değişmedi; kurallara uymayan istekler artık hata koduyla
  reddediliyor (`KENO_DUPLICATE_PICK`, `KENO_INVALID_PICK`, `BET_TOTAL_MISMATCH`,
  `INVALID_BET_AMOUNT`, `INVALID_BET_TYPE`).

**Değişti**
- Dragon Tiger kartları artık A (1)'dan K (13)'ya sıralanarak karşılaştırılıyor; 10, J, Q
  ve K birbiriyle berabere sayılmıyor. Beraberlik olasılığı 3/51'e düştü: varsayılan
  ayarlarla Dragon/Tiger bahsi ~%97,1, beraberlik bahsi (13×) ~%76,5 geri dönüş verir.
  Beraberlik çarpanı panelden ayarlanabilir.

### Mobil yerleşim: kenar boşluğu, sohbet butonu ve mobil arama
**Düzeltildi**
- Hero slider mobilde ekranın kenarına yapışıyordu (`w-full`, köşeler yalnız
  `lg:`de yuvarlıktı); artık `mx-4 lg:mx-0` + `rounded-xl`, üstündeki "Son
  Kazananlar" rayıyla aynı 16px ritmi yakalar. Anasayfa, Spor ve Canlı
  sayfalarında aynı bileşen kullanıldığı için üçünde de düzeldi
  (`PromoHeroSlider.jsx`).
- Sohbet butonu (`bottom-5 left-5`, 62px) mobil bottom nav'ın (75px) üstünde
  kaldığı için ⚽Bahis sekmesinin tıklanabilir alanının ~%85'ini kapatıyordu;
  artık nav görünürken `bottom-[5rem]` ile onun üstüne demirliyor, nav'ın hiç
  olmadığı yollarda (`/games/*`, `/casino/:id`) dibe iniyor. Nav'ın hangi
  yollarda olmadığı artık `utils/bottomNav.js` içinde tek kaynak.
- Navbar'daki arama ikonu `hidden sm:flex` yüzünden mobilde tamamen
  kayboluyordu. Mobilde arama tek girişe indi: anasayfada section başlığının
  sağındaki pill, diğer sayfalarda navbar ikonu (anasayfanın mobilinde navbar
  ikonu gizli — aynı sayfada iki buton olmaz).
- Sağlayıcı rayı olmayan (casino add-on'suz) kurulumlarda `ProviderRow` null
  döndüğü için mobil anasayfada arama girişi hiç kalmıyordu; pill artık o
  durumda her zaman render edilen "Tüm Oyunlar" başlığına taşınıyor
  (`ProviderRow` → `onLoaded`, `HomePage.providerRail`, `AllGamesSection`
  `searchTrigger`). Her kurulumda mobil anasayfada tam bir giriş var, ikiden
  fazla değil.
**Eklendi**
- `MobileSearchPanel`: üstten inen, megamenu benzeri tam genişlikte mobil arama
  katmanı — otomatik odaklanan büyük input ve temizleme düğmesi, hızlı geçiş
  kısayolları, gruplanmış canlı sonuçlar, ESC/dışarı tıklama ile kapanma, body
  scroll kilidi, safe-area boşlukları. Masaüstü dropdown ile aynı aramayı
  paylaşır (`useSiteSearch.js`, `SearchResults.jsx`); yeni i18n anahtarı
  gerekmedi.


### Santa Crash oyun ekranı yenilendi
**Değişti**
- Crash oyununun ekranı onaylı Santa Crash tasarımına geçirildi: fotoğraf
  gökyüzü arka planı (gece/patlama), sprite tabanlı kar, eğri boyunca bükülen
  kızak izi, patlamada enkaz, masaüstünde sahne + 340px panel, 920px altında
  tek kolon. Oyun mantığı, socket akışı, provably fair davranışı ve çeviriler
  değişmedi; yalnızca görsel katman yenilendi.
- Görsel varlıklar `game-host` JS bundle'ının içine base64 olarak gömülüyor
  ve her yeni tasarım için bundle şişiyordu; artık
  `game-host/public/images/games/crash/` altına ayrı dosya olarak
  servis ediliyor (sunucu gzip/etag önbelleği çalışır, bundle boyutu
  değişmez).
- `game-host` deploy workflow'unun dışında olduğu için bu değişiklik yalnızca
  repoya girer; canlıya yansıması için `npm run build:game-host` ile derlenip
  sunucudaki kendi origin'üne yüklenmesi gerekir (bkz. `docs/RUNBOOK.md`).

### KYC hata politikası ve kripto çekim uzlaştırması
**Kırılan Değişiklikler**
- KYC çekim kapısı, modül ya da lisans durumu okunamadığında veya modül
  açıkken lisans geçersizse artık çekimi durduruyor (`503
  KYC_CHECK_UNAVAILABLE`). Önceden bu durumlarda kapı sessizce açılıyor,
  çekim KYC'siz geçiyordu. Eski davranışı isteyen operatör, **Ayarlar →
  Modüller → KYC** kartında "Doğrulama yapılamazsa" seçeneğini "KYC'siz
  geçir" yapar (`KYC_FAILURE_POLICY=allow`).
- KYC kartındaki "KYC aktif" anahtarı kapalıyken çekim artık onaylı KYC
  istemiyor (oyuncu başvuru yapamadığı için çekimi kilitlemek anlamsızdı).
- Otomatik kripto çekimi başarılı yanıtta artık `status: 'processing'` döner;
  çekim zincirde doğrulanınca `completed` olur. Yayın sonucu bilinemezse
  `502` yanıtı işlem kimliğini (`txHash`) de içerir.

- **Yeni:** Kripto çekimleri yayından önce imzalanıp işlem kimliği
  kaydediliyor; dakikada bir çalışan uzlaştırma işi zincirden sonucu
  soruyor: başarılıysa tamamlıyor, gönderilmediği kesinleşirse (açık red,
  zincirde başarısız ya da süresi dolduğu halde zincirde yok) otomatik
  çekimi iade ediyor, admin onaylı çekimi yeniden onaya açıyor. Admin
  panelinde "İşlemde" sekmesi, **Zincirde doğrula** ve işlem kimliği
  kaydedilmemiş kayıtlar için **Gönderildi / Gönderilmedi** işaretleme
  (`POST /api/admin/crypto/withdrawals/:id/reconcile`, `/resolve`).
- **Düzeltme (kritik):** `transferUSDT` yayından sonraki ağ hatalarını da
  "başarısız" döndürüyordu; çekim akışı bunu kesin red sayıp, gönderilmiş
  olabilecek bir çekimi iade edebiliyordu. Artık yalnız kesin yanıtlar
  "gönderilmedi" sayılıyor.

### Para hareketlerinde eşzamanlılık güvencesi
**Kırılan Değişiklikler**
- `POST /api/crypto/withdraw-request`: bakiye artık USDT gönderilmeden önce
  düşülüyor. Otomatik transfer zincirde reddedilirse `500` döner, çekim
  `failed` olur ve bakiye iade satırıyla geri verilir; transfer sonucu
  bilinemezse `502` döner ve çekim admin incelemesi için `processing`te
  kalır. İşlem kayıtlarında yeni `processing` durumu var.
- `PATCH /api/bank/admin/pending/:id/approve`: oyuncunun bakiyesi artık
  çekimi karşılamıyorsa `409 INSUFFICIENT_BALANCE` döner (önceden bakiye
  eksiye iniyordu).
- `POST /api/igames/game/launch`: açılış sırasında bakiye değişirse
  `409 BALANCE_CHANGED` dönebilir.

- **Düzeltme (kritik):** Otomatik kripto çekiminde USDT işlem onaylanmadan
  gönderiliyordu; işlem çakışmayla geri alınırsa oyuncu hem USDT'yi alıyor
  hem bakiyesini geri alıyordu. Aynı bekleyen çekime eşzamanlı iki admin
  onayı USDT'yi iki kez gönderebiliyor, onay ile red aynı anda gelirse hem
  transfer hem iade yapılabiliyordu.
- **Düzeltme:** Aynı in-house oyun geri çağrısının ya da Slikair
  webhook'unun eşzamanlı kopyaları bakiyeyi iki kez değiştirebiliyordu.
  Defter kaydı işlem içinde ikinci kez yazılmak istenince artık işlem geri
  alınıyor (`DUPLICATE_TRANSACTION`). Igames geri çağrılarının tekrar
  koruması süreç belleğinden kalıcı tekil indekse taşındı.
- **Düzeltme:** VIP cashback, seviye ödülü, referans komisyonu, ters kayıt,
  promosyon, bonus feshi ve Igames açılış/kapanışı bakiyeyi okuyup mutlak
  değer olarak yazıyordu; aynı anda gelen bir bahis ya da yatırma
  kaybolabiliyordu. Hepsi tek atomik güncellemeye (`adjustBalance`) geçti.
  Seviye ödülü ve bonus feshi artık eşzamanlı çağrılarda bir kez uygulanıyor.
- **Düzeltme:** Banka talebinde red, aynı anda onaylanmış talebin durumunu
  ezebiliyordu; onay ve red artık koşullu ve tek seferlik.

### Sorumlu oyun limitleri eşzamanlı isteklerde aşılmıyor
- **Düzeltme:** Oyuncu yatırması (`POST /api/transactions/deposit`) ve spor
  kuponu (`POST /api/bets`) sorumlu oyun limitini bakiye değişikliğiyle aynı
  veritabanı işleminde denetleyip sayacı orada artırıyor. Önceden limit
  işlemden önce okunup sayaç sonra artırıldığı için aynı anda gelen istekler
  limiti aşabiliyordu (300'lük günlük limitle 10 paralel istekte 1000'e
  kadar). Banka/kripto/Slikair yatırma onayı ve casino oyunlarının kanalları
  henüz bu yapıda değil.
- **Düzeltme:** Aynı oyuncunun eşzamanlı işlemleri (paralel kupon, çekim)
  veritabanında çakışınca yeniden deneme hakkı tükenip `500` dönebiliyordu.
  Yeniden denemeler artık üstel artan, rastgele sapmalı bekleme ile en fazla
  15 kez yapılıyor. Para güvenliği önceden de korunuyordu (işlem geri
  alınıyordu).

### Kurulum: KYC inceleme noktası varsayılan açık
**Kırılan Değişiklikler**
- Yeni kurulumda KYC Kimlik Doğrulama modülü (`kyc-verification`) açık
  başlar: sihirbazdaki kutu işaretli gelir ve `/install/api/run` isteğinde
  `enableKyc` hiç gönderilmezse modül açık yazılır. Böylece oyuncu çekimleri
  ilk günden onaylı KYC ister (`403 KYC_REQUIRED`). KYC'siz başlamak için
  kutunun işaretini kaldırın ya da API'ye `enableKyc: false` gönderin.
  Kurulumu otomatikleştiren betikler bu alanı göndermiyorsa artık KYC açık
  başlar. Mevcut kurulumların modül ayarı değişmez.

### Spor Bahisleri: oran verisi barındırılan beslemeden
**Kırılan Değişiklikler**
- Oran besleme servisi (`odds-provider`) artık Spor Bahisleri eklentisiyle
  gelmiyor; kökteki `odds-provider` symlink'i ve `npm run dev` /
  `install:all` içindeki adımları kaldırıldı. Eklentili platformlar oran
  verisini barındırılan beslemeden alır: `server/.env`'de
  `ODDS_PROVIDER_API_BASE=https://feed.vip90.bet` ve
  `ODDS_PROVIDER_API_TOKEN` olarak geliştirici portalında
  (`https://developers.vip90.bet`) oluşturulan API anahtarı.
  `ODDS_PROVIDER_MANAGEMENT_SECRET` barındırılan beslemede kullanılmaz.
  Kendi odds-provider kurulumunu çalıştıran mevcut kurulumlar, yeni
  anahtarla beslemeye geçene kadar o servisi kendi başına çalıştırmaya devam
  edebilir.

### Spor Bahisleri eklentisi: oran verisi ek sitelere verilebiliyor
- **Yeni:** odds-provider aynı veriyi platform dışındaki sitelere (veri
  alıcılarına) verebilir. Her alıcının kendi anahtarı, spor filtresi, IP izin
  listesi ve dakikalık istek sınırı vardır; istek, canlı mesaj, açık bağlantı
  ve son görülme 30 günlük dökümle izlenir. Alıcılar odds-provider'ın
  yönetim uçlarından (`/internal/consumers`, yönetim sırrıyla) yönetilir;
  eklentinin `odds-provider/docs/consumer-api.md` belgesi alıcıya verilir.
  Platformun kendi bağlantısı eskisi gibi kısıtsızdır.
- **Düzeltme:** odds-provider'ın `package-lock.json`'ı `package.json` ile
  uyumsuzdu; temiz kurulumda `npm ci` çalışmıyordu.

### Coin Flip — site vitrin entegrasyonu (lobby kartı + route + i18n)

- **Eklendi:** Coin Flip artık site client lobisinde de görünüyor: `client/src/App.jsx`'te
  `/games/coinflip` route'u (`<InhouseGameLauncher gameId="coinflip" />`), `client/src/data/inhouseGames.js`
  paylaşan listesinde 14. giriş, `HomePage.jsx`'teki `INHOUSE_GAMES` kart rayında kart ve
  8 dilin tümünde (`tr/en/de/es/pt/ja/ko/th`) `games.coinflip.title` + `subtitle` + `cta` + `cardDesc`.
  Kart görseli `client/public/images/games/coinflip.png` (768×512, mevcut thumbnail'lerle aynı
  biçim) — game-host'un `coinflip-bg.png`'inden bağımsız, vitrin için ayrıca üretildi.
- **Neden gerekliydi:** Engine/API ve game-host tarafı yayındaydı (`POST /api/provider/v1/games/coinflip/flip`
  canlı, migration koşuldu), ancak client lobi listesi yalnız 13 oyun tanıyordu ve route yoktu —
  `/games/coinflip` gerçek 404'e düşüyordu. `build` script'i bu route'u route manifest'e
  dağittiği için manifest de yeniden üretimde otomatik güncellenir.
- **Not:** `client/src/data/inhouseGames.js` yorumunda geçen `CasinoRedesign.jsx` kart listesi
  `8dbb4a07` ile kaldırılmış (`/casino` → `HomePage` yönlendirmesi); bu yüzden ikinci bir kart
  listesi güncellenmedi — güncellenmesi gereken tek kart rayı `HomePage.jsx`'te.

### Coin Flip — 14. in-house oyun (mobil uyumlu, onaylı math spec)

- **Eklendi:** Coin Flip oyunu (`coinflip` / `inhouse-coinflip`): tek dokunuşla yazı-tura;
  kazanana bahis × 1.96 → RTP %98.00 (house edge %2.00), min bahis 1.00 / max 1.000.00 TRY
  (sahip onayı 2026-10-09). Provably-fair: HMAC-SHA256 `coinflip-v1` (msg `roundSeed`,
  ilk byte % 2 → 0=yazı / 1=tura) — game-host `verifyCoinFlip` sunucuyla bayt-bayt aynı
  reçeteyi kullanır. Sunucu tarafı: `GameSettings` şemasına `coinflipMinBet` /
  `coinflipMaxBet` / `coinflipPayoutMult` alanları + `OPERATOR_GAME_DEFAULTS` lazy-seed;
  admin Game Settings sayfasında Coin Flip kartı ve canlı RTP önizlemesi (RTP = ½ × mult);
  `validateOperatorUpdate` mult aralık guardı (1.8–2.0 — üst sınırı aşan çarpan matematiksel
  olarak %100+ RTP üretir).
- **Doğrulandı (QA, 2026-10-09):** production-mount üzerinde endpoint seviyesinde N=20.000
  tur — flipped dağılımı uniform (χ²=2.464, p≈0.116), payout kimliği 20000/20000 birebir,
  endpoint RTP %98.049 (analitik %98.00, ±0.10 pp tolerans içinde); 10M-turluk matematik
  simülasyonu ayrıca ±0.10 pp içinde. `instantGamesSeed` assertasyonu 7→8 handler'a
  güncellendi (bu merge ile birlikte inmek zorundadır, ayrı commit'te kırmızı kalır).
- **Kırılan Değişiklikler:**
  - Coin Flip'in açılması için her operatörün `allowedGameIds` listesi güncellenmeli:
    sunucu ayağa kalktıktan sonra, **ilk trafikten önce** `server/` dizininde
    `node src/scripts/migrations/add-coinflip-to-operators.mjs` çalıştırılır
    (idempotent `$addToSet`; tekrar koşulabilir). Aksi halde launch gate coinflip'i
    503 GAME_DISABLED ile reddeder.
  - Engine (vip90-bet-inhouse) ile platform **birlikte** inmelidir: altmodül pini
    `game/play@46b84fa` (sunucu baytları QA'nın test ettiği `game/math@6530607` ile
    blob-bazında birebir; fark yalnız game-host UI + docs). Eski engine pin'iyle
    platform tek başına coinflip rotasını sunamaz.
### In-house oyunlarda 18+ kapısı, tur başına sorumlu oyuncu denetimi ve oturum tavanı

#### 18+ kapısı artık gerçekten uygulanıyor

- **Düzeltildi:** `User.ageConfirmedAt` / `ageVerifiedAt` alanları şemada vardı
  ama **hiçbir yere yazılmıyordu** ve hiçbir uç denetlemiyordu — 18+ beyanı
  yalnız istemcide bir kutu idi. `server/src/middleware/ageGate.js`
  (`enforceAgeGate`) artık `/api/inhouse-provider` (`/launch`) ve `/api/igames`
  mount'larında çalışır.
- **Davranış değişti (Kırılan Değişiklikler):** 18+ onay kaydı olmayan
  hesaplar `/api/igames/game/launch` ve `/api/inhouse-provider/launch`
  isteklerinde artık `403 { code: 'AGE_CONFIRMATION_REQUIRED' }` alır.
  Yeni uç: `POST /api/auth/age-confirm` (oturum zorunlu), gövde
  `{ confirmed: true, dateOfBirth? }`. Doğum tarihi 18 yaş altını kanıtlıyorsa
  kayıt **yazılmaz**: `422 AGE_NOT_ELIGIBLE`. İstemcide tek tıkla açılan onay
  ekranı 8 dilde (`ageGate.*`).
- **Şema:** değişiklik yok. `ageConfirmedAt`/`ageVerifiedAt` alanları zaten
  vardı, yalnız doldurulmuyordu; **migration gerekmez**. Mevcut hesaplar bir kez
  onayladığında açılır — kalan hesap sayısını `node
  server/scripts/inhouse-audit-report.mjs` (R7) raporlar.
- **Geriye uyum:** `POST /api/auth/register` gövdesine isteğe bağlı
  `ageConfirmed: true` eklenebilir; gönderilmeyen istemciler önceki gibi
  kaydolur (yalnız oyun açamaz). `dateOfBirth` 18 yaş altını kanıtlıyorsa
  kayıt `422 AGE_NOT_ELIGIBLE` ile reddedilir (yeni davranış).

#### Sorumlu oyuncu limitleri artık her turda ölçülüyor

- **Düzeltildi:** limitler yalnız oyun açılışında (`/launch`, `action: 'play'`)
  ölçülüyordu; limitini dolduran oyuncu aynı oturumda oynamaya devam
  edebiliyordu. `server/src/middleware/inhouseRoundLimits.js` artık her
  in-house **debit** turunda `checkPlayerEligibility(userId, 'bet', { amount })`
  çağırır. `RESTRICT`/`BLOCK` → `403 { approved: false, reason:
  'RESPONSIBLE_GAMING_LIMIT' | 'ACCOUNT_RESTRICTED' }` (motor `BET_REJECTED`
  döner, para hareketi yok, retry yok).
- `settle`/`balance` gövdeleri denetlenmez; kabul ve ödeme yolu kapanmaz.
  Kimliği çözülemeyen oyuncu bu katmanda engellenmez (HMAC zaten doğrulandı).

#### `sessionTimeoutMin` artık uygulanıyor

- **Düzeltildi:** `PUT /api/users/limits` ile yazılan
  `responsibleLimits.sessionTimeoutMin` **hiç okunmuyordu** — oyuncunun kendi
  koyduğu oturum limiti sessizce uygulanmıyordu.
- Oturum tavanı sunucu tarafında uygulanır (`InhousePlaySession` +
  `server/src/services/inhouseSession.js`): **oyuncunun limiti varsa o kazanır,
  yoksa `INHOUSE_SESSION_MAX_MINUTES` (varsayılan 120 dk)**, 5–1440 dk
  arasına kırpılır. Tavan aşılınca oturum `closeReason: 'max_duration'` ile
  kapanır, `POST /api/inhouse-provider/launch` yeni oturum açar ve sonraki
  turlar `403 { approved: false, reason: 'SESSION_LIMIT_REACHED' }` alır.
- **Ortam değişkeni (yeni, isteğe bağlı):** `INHOUSE_SESSION_MAX_MINUTES`
  (varsayılan `120`). Davranış değişmezse oyuncuların varsayılan tavanı 120
  dakikadır.
- **Şema (yeni koleksiyon):** `inhouseplaysessions`. Doldurma/migration yok;
  ilk oyunda kendiliğinden oluşur.

#### Bağımsız denetim raporu (yeni, elle çalıştırılır)

- `node server/scripts/inhouse-audit-report.mjs` — `ProviderRound`,
  `Transaction`, `CasinoRound`, `InhouseCallbackReceipt` kayıtlarını
  çapraz karşılaştırır (R1–R7: eksik ledger kaydı, bilinmeyen tur,
  ödenmemiş kazanç, tur sayısı farkı, askıda outbox, tavanı aşmış oturum,
  18+ kaydı olmayan hesap). Salt-okunur; `--days N`, `--out <dosya>`,
  `--strict` (KRİTİK bulguda çıkış kodu 1). Hiçbir deploy adımı çağırmaz.

#### Lobide 13. oyun görünür oldu

- **Düzeltildi:** `videopoker` kayıtlı oyunlar arasındaydı ama ana sayfa
  listesinde yoktu; yalnız `/games/videopoker` rotasından açılabiliyordu.
- Yeni e2e kapsamı: `tests/e2e/specs/inhouse-game.spec.js` (18+ kapısının
  uçtan uca akışı, yetersiz bakiye ekranı, bilinmeyen oyun yolunda gerçek 404).
  Testler: `server/test/ageGate.test.js`, `server/test/inhouseRoundLimits.test.js`,
  `server/test/inhouseSession.test.js`, `server/test/inhouseSessionLimit.test.js`.

#### Hâlâ açık (düzeltilmedi)

- Casino launch/bet için KYC kapısı **yok** — ürün politikası kararı gerektiriyor
  (`kycGate.js` yalnız withdrawal'ı kapatıyor).
- Oyun açılışında **jurisdiksiyon/geo kısıtı yok** — izinli ülke listesi hukuki
  karardır.
- **RNG modulo bias** (`engine/provablyFair.js`), motor içi **session limit** ve
  eksik oyunlar için **RTP simülatörleri** `vip90-bet-inhouse` submodule'ında;
  ayrı PR ile ele alınacak. Ayrıntı: `docs/product/09-bilinen-kisitlar.md`.

## [1.0.0] — 2026-10-09

İlk kararlı sürüm. 1.0.0, değişikliklerin büyüklüğünü değil bir taahhüdü işaret eder: 0.x sürümleri başlangıç geliştirmesiydi ve her şey değişebiliyordu. Bu sürümden itibaren kurulum yolu (Docker ve elle), `.env` değişkenleri, HTTP API'si ve veritabanı şeması kararlı kabul edilir; bunları bozan her değişiklik **Kırılan Değişiklikler** altında yazılır ve ana sürümü artırır. Sürüm, 0.x geçmişinin son PR'ına ek olarak sürüm kesilmeden önce `main`'e giren service worker düzeltmesini de içerir.

### Favicon ve uygulama ikonları elmas logo

#### Marka: favicon ve uygulama ikonları elmas logoya geçti
- **Değişti:** Tarayıcı sekmesindeki simge Vite'ın logosuydu; satış
  sitesiyle aynı 💎 oldu. Ana ekrana eklenen uygulamanın (PWA) ikonları da
  koyu zemin üzerinde elmasla yeniden üretildi (Noto Emoji, Apache 2.0).
  Admin → Marka'dan yüklenmiş bir favicon varsa o kullanılmaya devam eder.
- **Kaldırıldı:** Kullanılmayan `images/login-bg.png`, `images/cta-bg.png`
  ve `icons.svg`.

### Service worker gerçek 404'ü artık yutmuyor (SPA navigate allowlist)
PWA'nın service worker'ı (`vite-plugin-pwa` → workbox `NavigationRoute`) sayfa
geçişlerini varsayılan olarak **her zaman** precache'lenmiş `index.html` ile
karşılıyordu; bu yüzden "olmayan sayfa = 404" davranışı yalnız SW kurulmamış
tarayıcıda (curl, ilk ziyaret, arama motoru) geçerliydi. Geri dönen bir
ziyaretçinin tam sayfa yenilemesinde `/olmayansayfa` **200** dönüyor, kullanıcı
doğru 404 sayfasını görüyor ama `X-Robots-Tag: noindex` kayboluyordu.
- SW artık **yalnız gerçek uygulama rotalarını** index.html'e düşürür; allowlist
  `App.jsx`'ten build sırasında türetilir (`client/scripts/pwa-route-allowlist.mjs`,
  `navigateFallbackAllowlist`). `/api/*`, `/install`, `/uploads/*`, `robots.txt`,
  `sitemap.xml`, statik dosyalar ve **rota tablosunda olmayan her yol** ağa gider,
  sunucunun yanıtı geçerli olur (bilinen rotalar hâlâ SW'den, çevrimdışı
  çalışır).
- Elle tutulan liste yoktur: rota tablosuyla aynı parser kullanılır, yeni rota
  eklemek ek iş gerektirmez, parser boş liste üretirse build fail eder.
- Testler: `client/scripts/__tests__/pwa-navigate-fallback.test.mjs`.

## [0.99.0] — 2026-10-08

### Belgeler İngilizce; sosyal giriş belgesi
- **Değişti:** SMS ağ geçidi, e-posta şablonları, SEO ve sağlayıcı belgeleri İngilizce; Google ve Telegram ile giriş kurulum belgesi eklendi.

## [0.98.1] — 2026-10-08

### Google ile giriş: 404 düzeltmesi ve Modules → Google Login kartı

#### Giriş: "Google ile devam et" 404 veriyordu
- **Düzeltme:** Siteyi daha önce ziyaret etmiş tarayıcılarda service worker,
  `/api/...`, `/install` ve `/uploads/...` adreslerine yapılan sayfa
  geçişlerini uygulamaya yönlendiriyor, sunucuya hiç gitmeden 404 sayfası
  açılıyordu. Bu yollar artık doğrudan sunucuya gider.
- **Yeni:** Admin → Settings → Modules → **Google Login** kartı. Google ile
  girişi açıp kapatan anahtar ile Client ID, Client Secret (şifreli saklanır,
  `OPERATOR_SECRET_ENCRYPTION_KEY` gerekir) ve Redirect URI artık panelden
  girilir; panel değeri `.env`'dekinden önceliklidir. Uçlar:
  `GET/PUT /api/admin/settings/google-auth`.
- **Değişti:** "Google ile devam et" butonu yalnız kart anahtarı açık ve
  Client ID + Secret tanımlıysa görünür (yeni uç:
  `GET /api/auth/google/state` → `{ enabled }`). Tanımsızken Google'a
  `client_id=undefined` ile gidip hata sayfası gösteriyordu. Yalnız `.env`
  ile yapılandırılmış kurulumlarda bir şey değişmez (anahtar varsayılan açık).
- **Değişti:** `GOOGLE_REDIRECT_URI` boşsa `http://localhost:3001/...` yerine
  `CLIENT_URL`'deki ilk adres + `/api/auth/google/callback` kullanılır.

## [0.98.0] — 2026-10-08

### Betik yorumları
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.97.0] — 2026-10-08

### Temiz Docker kurulumunda üç engel giderildi

#### Docker kurulumu: temiz kurulumda üç engel giderildi
- **Düzeltme:** Docker kurulumunda uygulama MongoDB'ye bağlanamıyor, site
  502 dönüyordu. Replica set üyesi artık `mongo:27017`. Mevcut kurulumlarda
  mongo konteyneri yeniden oluşturulunca (`docker compose up -d`) bir kez
  yeniden yapılandırılır, veri korunur.
- **Düzeltme:** Kurulum sihirbazının oluşturduğu ilk yönetici, sunucu
  yeniden başlayana kadar yatırma onayı gibi işlemlerde "Yetki yok" alıyordu.
  `super_admin` rolü artık kurulum anında atanır.
- **Yeni:** Admin → Kullanıcılar → kullanıcı penceresinde "E-posta
  doğrulaması → Doğrulanmış işaretle". E-posta yapılandırılmamış kurulumlarda
  oyuncunun giriş yapabilmesi için. Geri alınamaz.
- **Değişti:** `.env.docker.example` İngilizce; SMTP ve casino sağlayıcısı
  alanları sahte değer yerine boş geliyor, `OPERATOR_SECRET_ENCRYPTION_KEY`
  "önerilen" bölümünde.

## [0.96.1] — 2026-10-08

### CHANGELOG girdisini denetleyen betik
- **Yeni:** `node scripts/check-changelog.mjs` ve pre-push hook'u (`sh scripts/install-hooks.sh`): kurulumu etkileyen bir değişiklik `CHANGELOG.md` girdisi olmadan push edilemez; bilinçli istisna için commit mesajına `Changelog: none`.

## [0.96.0] — 2026-10-08

### Lansman kontrol listesi
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.95.1] — 2026-10-08

### Çekirdek geçmişi temizleme kuralları
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.95.0] — 2026-10-08

### Sürüm betiği ve çalışan sürümün görünmesi

#### Sürümleme: sürüm betiği, çalışan sürüm görünür, paket bilgileri
- `node scripts/release.mjs <X.Y.Z>` sürümü hazırlar: bu bölümü sürüm
  başlığına çevirir, kök/server/client `package.json` ve lock dosyalarını aynı
  numaraya çeker, README rozetlerini günceller. Etiket ve GitHub Release,
  değişiklik `main`'e girdikten sonra merge commit'ine atılır.
- `GET /api/health` yanıtında `version` alanı var: canlıdaki sürüm okunabilir.
- `package.json`'larda açıklama, depo, ana sayfa ve `engines.node >= 22`.
- Admin e-posta sağlayıcı formundaki yer tutucular genel örnek adreslere
  çevrildi.

#### Public çekirdek: eksik belgeler ve kırık bağlantılar
`docs/product/10` (bonus ve çevrim), `11` (admin araçları), SEO, sistem
e-postaları ve SMS Gateway belgeleri artık çekirdekle birlikte geliyor. Ürün
belgelerinin çekirdekte bulunmayan belgelere verdiği bağlantılar kaldırıldı;
eklentilere ait ayrıntılar için eklentilerin kendi belgelerine yönlendiriliyor.

## [0.94.0] — 2026-10-08

### Belge temizliği
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.93.1] — 2026-10-08

### İngilizce README, iki dilli kurulum sihirbazı, oyuncu ekranı çevirileri

#### İngilizce README, iki dilli kurulum sihirbazı, oyuncu ekranlarının çevirisi
- `README.md` artık İngilizce; Türkçesi `README.tr.md`. İkisi de yalnız
  public çekirdekte bulunan belgelere bağlantı veriyor (eskiden
  çekirdeğe gitmeyen iç belgelere verilen bağlantılar orada kırıktı).
- Kurulum sihirbazı (`/install`) İngilizce ve Türkçe: tarayıcı dili Türkçeyse
  Türkçe, değilse İngilizce açılır; sağ üstteki düğme ya da `?lang=en|tr`
  dili değiştirir. Sihirbazın ürettiği `.env` çıktısındaki yorumlar
  İngilizce.
- Sorumlu Oyun sayfası ve KYC akışı (77 metin) ile kalan genel arayüz
  metinleri `de`, `es`, `pt`, `ja`, `ko`, `th`'ye çevrildi; oyuncu ekranları
  artık 8 dilde çevrili. Admin panelinin bir kısmı bu altı dilde hâlâ
  İngilizce.

**Kırılan Değişiklikler:**
- Sihirbazın ürettiği `.env` yorum satırları Türkçeden İngilizceye döndü;
  değişkenler ve değerler aynı.

## [0.93.0] — 2026-10-08

### Alan adı yönlendirme belgesi
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.92.1] — 2026-10-08

### SMS göndericileri, kalıcı referans ayarı, demo veri ve test düzeltmeleri

#### Admin: SMS gönderici ekranı yeniden erişilebilir
Gönderici kaydı (hesap tipi, doğrulanmış trial numaraları, onaylı ülkeler)
2026-10-06'dan beri hiçbir rotadan açılmıyordu; kayıt olmadan gönderim
`SMS_SENDER_NOT_REGISTERED` ile engellendiği için SMS panelden kurulamıyordu.
Ekran artık **Modules → SMS Gateway** kartında **Göndericileri yönet** ile
açılıyor; kapatınca kartın gönderim durumu yenileniyor.

#### Referans komisyonu ayarı kalıcı
`PUT /api/admin/referral/settings` yalnız bellekteki değeri değiştiriyordu;
her restart/deploy oranı ve aç/kapa durumunu varsayılana döndürüyor, birden
fazla süreçte her süreç farklı oran kullanıyordu. Değerler artık `Setting`
koleksiyonunda (`referral.enabled`, `referral.commissionRate`) saklanıyor;
`config/referral.js` yalnız kayıt yokken geçerli varsayılanları tutuyor.

**Kırılan Değişiklikler:**
- Önceden panelden değiştirilip restart'la kaybolmuş oranlar geri gelmez;
  güncellemeden sonra oranı panelden bir kez yeniden kaydedin. `config/referral.js`'i
  çalışma anında değiştiren özel kod artık etkisizdir.

#### Komisyon ve cashback tekrar koruması eklentilerde de etkin
Spor bahsi sonuçlandırması ve casino oturumu kapanışı, referans komisyonu ve
cashback ödemelerine kaynak kimliğini (`sourceId`) geçiriyor; aynı olay ikinci
kez işlense de ödeme bir kez yapılıyor. Düzeltme 2026-10-03'te eklenti
depolarında yapılmıştı ama bu depodaki alt modül işaretçileri güncellenmediği
için kurulumlara gitmemişti.

#### Demo veri: temizlenen veri canlı simülasyonla geri gelmiyor
Canlı simülasyonun risk adımı, havuz boşken 20 yeni demo kullanıcı açıyordu:
"Tümünü Temizle" sonrası demo veri kendiliğinden geri geliyor ve simülasyon
kendini hiç durdurmuyordu. Canlı adım artık havuzu doldurmuyor; havuz boşsa
simülasyon durur.

#### Testler: `npm test` tamamlanıyor, ağ testleri ayrı
Casino Content eklentisindeki bir temizlik zamanlayıcısı süreci açık
tuttuğu için `app.js`'i içe aktaran test hiç sonlanmıyor ve paket bitmiyordu
(eklentide `unref`). Gerçek Slikair sandbox'ına giden testler
`server/test/network/` altına taşındı ve `npm run test:network` ile ayrı
çalışıyor. Rastgele kategori seçimi yüzünden ara ara düşen demo simülasyon
testi deterministik hâle getirildi.

**Kırılan Değişiklikler:**
- `server/test/slikair-sandbox.test.js` → `server/test/network/slikair-sandbox.test.js`;
  bu dosyayı doğrudan çağıran betikler yolu güncellemeli.

## [0.92.0] — 2026-10-08

### Güvenlik: bağımlılık açıkları, seed betiği, çift bakiye düzeltmesi

#### Güvenlik: üretim bağımlılıklarındaki açıklar kapatıldı
`npm audit --omit=dev` üç pakette de temiz. Sunucu: `proxy-addr` 2.0.8
(kritik — IPv4-mapped IPv6 adresle `trust proxy` atlatılıp IP sahteciliği;
admin IP kısıtını ve rate limit'i etkiliyordu), `engine.io` 6.6.11 ve
`socket.io-parser` 4.2.7 (DoS), `nodemailer` 10.0.16, `compression` 1.8.2,
`undici` 8.11.2, `brace-expansion`; `tronweb`'in sabitlediği `axios`
`overrides` ile 1.20.0'a çekildi. Client: `@capacitor/ios` 8.5.3 (kritik),
`react-router` 7.18.4 (açık yönlendirme), `axios` 1.20.0, `tar`,
`@xmldom/xmldom`, `socket.io-parser`.

**Kırılan Değişiklikler:**
- `nodemailer` 10 Node.js 20 veya üstünü ister. Desteklenen sürüm zaten
  Node.js 22; daha eski Node ile çalışan kurulumlar önce Node'u yükseltmeli.

#### Güvenlik: `server/src/seed.js` kaldırıldı
Bu geliştirme betiği çalıştırıldığında önce **tüm kullanıcıları siliyor**,
sonra `admin` / `Admin1234!` ve parolası kaynakta yazılı demo hesaplar
açıyordu. Belgelerdeki `server/scripts/seed.js` ile adı neredeyse aynıydı.

**Kırılan Değişiklikler:**
- `node server/src/seed.js` artık yok. Site ayarlarını ve ilk yöneticiyi
  tohumlamak için `node server/scripts/seed.js [--admin]` kullanın.

#### Admin: bakiye düzeltmesi çift tıklamada iki kez uygulanmıyor
`PATCH /api/admin/users/:id/balance` her çağrıda yeni bir idempotency anahtarı
üretiyordu; çift tıklama ya da yeniden deneme bakiyeyi iki kez değiştiriyordu.
Panel artık işlem başına bir `requestId` gönderiyor; aynı kimlikle gelen istek
bakiyeye dokunmadan ilk kaydı döndürür (`duplicate: true`). Bakiye, defter
kaydı ve bonus çevrim kaydı tek veritabanı transaction'ında yazılıyor; borçta
bakiye kontrolü güncellemeyle aynı koşulda yapıldığı için eşzamanlı düşümler
bakiyeyi eksiye indiremiyor.

**Kırılan Değişiklikler:**
- Bu ucu kendi aracından çağıranlar tekilleştirme için gövdeye
  `requestId` (UUID) eklemeli; göndermeyen istekler eskisi gibi her seferinde
  ayrı işlem sayılır. Yanıta `duplicate` alanı eklendi.

## [0.91.0] — 2026-10-08

### Olmayan sayfa gerçek HTTP 404 döndürüyor

#### SPA'da gerçek HTTP 404: olmayan sayfa artık 404 + kendi 404 sayfası
Olmayan her sayfa `200` + ana sayfa dönüyordu: sunucu `app.get('*')` ile
`index.html` servis ediyor, istemci de eşleşmeyen yolu sessizce ana sayfaya
yönlendiriyordu. Artık geçerli rotalar `200` + `index.html` (derin linklerde
yenileme çalışmaya devam eder), **geçersiz rotalar `404`** +
`X-Robots-Tag: noindex` + `index.html` döner; 404 görselini uygulamanın kendi
sayfası (`client/src/pages/NotFound.jsx`, 8 dil) çizer, canonical/SEO etiketi
enjekte edilmez.
- Rota tablosu **elle tutulmaz**: `npm run build --prefix client` sırasında
  `App.jsx` taranıp `client/dist/routes.json` üretilir, sunucu bunu okuyup
  `req.path`'i eşleştirir (`shared/route-matcher.js`). Yeni `<Route>` eklemek
  yeterlidir — CI kırılmaz, senkron denetimi (`npm run routes:check`) yalnız
  uyarır.
- **Fail-open:** tablo yoksa/bozuksa sunucu eski davranışı sürdürür (tüm yollar
  200) ve ilk istekte bir kez uyarır. `ROUTE_404_REPORT_ONLY=1` ile 404 yerine
  yalnız log üretilebilir (yayına geçişin 1. fazı; 2. fazda değişken kaldırılır).
- Statik dosyalar, `/api/*` (JSON 404), `/robots.txt`, `/sitemap.xml` ve
  PWA dosyaları etkilenmez.

**Kırılan Değişiklikler:**
- Var olmayan bir sayfa URL'si artık `200` değil `404` döner. Buna bağlı üçüncü
  taraf testler (Playwright, izleme, "her URL 200" varsayan betikler) bu
  davranışı görecek. Geçici olarak eski davranışa dönmek için sunucuya
  `ROUTE_404_REPORT_ONLY=1` ekleyip servisi restart edin. `client/dist`
  elle dağıtılan (build'siz) kurulumlarda tablo üretilmediği için sunucu zaten
  fail-open davranışındadır.
- `Dockerfile` artık `shared/` dizinini kopyalar (sunucu bu dizinden import
  ediyor). Elle kurulumlarda `shared/` klasörü silinmemeli.

## [0.90.1] — 2026-10-08

### Belgeler güncel durumla eşitlendi
- **Değişti:** Ürün belgeleri, işletim kılavuzu ve sağlayıcı belgeleri kodla ve birbirleriyle karşılaştırılıp çelişkiler giderildi; `docs/README.md` belge haritası oldu.

## [0.90.0] — 2026-10-08

### Dal akışı belgesi
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.89.0] — 2026-10-08

### Kayıt formu: doğum tarihi seçimi ve benzersiz telefon

#### Kayıt formu: doğum tarihi seçimi görünüyor, telefon numarası benzersiz
- Kayıt formunda gün/ay/yıl seçimi ekranda kalmıyordu: üçü birden seçilene
  kadar forma boş değer gidiyor, tam tarihte de `'06'` ile `6` seçeneği
  eşleşmiyordu. Seçimler artık bileşenin içinde tutuluyor.
- Telefon kaydedilmeden önce E.164'e çevriliyor (`0555…` → `+90555…`) ve başka
  bir hesapta kullanılıyorsa kayıt `409 PHONE_EXISTS`, geçersizse
  `400 INVALID_PHONE` döner. Kayıt ve admin panelinden kullanıcı oluşturma
  aynı kuralı kullanır; kayıt formu iki hata için 8 dilde mesaj gösterir.

**Kırılan Değişiklikler:**
- `User.phone` alanına benzersiz kısmi index eklendi (yalnız dolu telefonlar;
  telefonsuz hesaplar etkilenmez). Aynı telefonu taşıyan birden fazla hesap
  varsa index kurulamaz: sunucu açılır ve yeni kayıtlarda kontrol çalışır, ama
  eşzamanlı kayıtlara karşı veritabanı güvencesi olmaz. Güncellemeden önce
  `db.users.aggregate([{ $match: { phone: { $type: 'string' } } }, { $group:
  { _id: '$phone', n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }])` ile
  tekrarları bulup fazlalıkların telefonunu temizleyin.

## [0.88.1] — 2026-10-07

### Alan adı belgeleri
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.88.0] — 2026-10-07

### Senkron izleme adresi
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.87.1] — 2026-10-07

### `CLIENT_URL` listesinde ilk adres kanonik

#### `CLIENT_URL` virgüllü listede ilk origin kanonik
`CLIENT_URL` CORS için virgüllü birden fazla origin taşıyabiliyordu, ama
Slikair webhook/redirect adresleri, sistem e-postalarındaki bağlantılar ve
destek asistanının `HTTP-Referer` başlığı değerin tamamını kullanıyordu
(`https://a,https://b/api/...` gibi geçersiz URL'ler). Artık bu yerler listenin
**ilk** değerini kullanır.

**Kırılan Değişiklikler:**
- `CLIENT_URL`'de birden fazla origin varsa oyuncuların kullandığı adres ilk
  sırada olmalı; Slikair panelindeki URL'ler de bu adrese göre güncellenmeli.

## [0.87.0] — 2026-10-07

### Email Gateway kartı listenin sonunda, başlıkta anahtar
- **Değişti:** Settings → Modules'ta Email Gateway kartı listenin sonunda; kart başlığındaki anahtar panel ayarı ile sunucu `.env` SMTP'si arasında seçim yapar. Kartlardaki lisans rozetleri ve "Yönet" bağlantıları kaldırıldı.

## [0.86.0] — 2026-10-07

### Dağıtımda eski yedeklerin temizlenmesi
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.85.1] — 2026-10-07

### Dağıtım ve alan adı notları
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.85.0] — 2026-10-07

### Tekrar eden veritabanı index tanımları kaldırıldı

#### Modeller: tekrar eden index tanımları kaldırıldı
`Agent.userId`, `Brand.slug`, `ChatRoom.slug`, `Currency.code`,
`Jurisdiction.code` hem alan düzeyinde `unique: true` hem de ayrıca
`schema.index` ile tanımlıydı; her açılışta Mongoose uyarısı basılıyordu.
Fazla tanımlar silindi; veritabanındaki index'ler ve benzersizlik değişmez,
migration gerekmez.

## [0.84.1] — 2026-10-07

### Modules: Email ve SMS Gateway kartları, iletişim sekmeleri

#### Admin: Modules'ta Email Gateway ve SMS Gateway kartları
- Tek "Communication Providers" kartı kaldırıldı. E-posta sağlayıcısı
  (SMTP/Mailgun) **Modules → Email Gateway** kartında (listenin sonunda,
  çekirdeğe ait). Kart başlığındaki anahtar açıkken panel değerleri, kapalıyken
  yalnız sunucu `.env` SMTP değerleri kullanılır (`SMTP_GATEWAY_ENABLED`,
  varsayılan `true`). SMS sağlayıcısı ve gönderici alanları **Modules → SMS
  Gateway** kartında tek gövdede.
- İletişim sayfasındaki sağlayıcı/gönderici sekmeleri kaldırıldı: e-posta
  `templates · identities · logs · test`, SMS `templates · logs · test`.
- Modül kartlarındaki lisans durum rozetleri ve "Yönet →" bağlantıları
  kaldırıldı; lisansı olmayan açık modül için uyarı kalıyor.
- SMS şablonunu yalnızca aç/kapatmak, kitlesi bozuk bir şablonda "Şablon
  kaydedilemedi" hatası veriyordu; denetimler artık yalnız gönderilen alanlara
  uygulanıyor. Hata mesajları sunucunun nedenini, HTTP durumunu ya da bağlantı
  hatasını gösteriyor.

**Kırılan Değişiklikler:**
- `?sub=provider` / `?sub=sender` içeren İletişim yer imleri şablon listesine
  düşer.
- Bilinen sorun: SMS gönderici kayıt ekranına panelden ulaşılamıyor (bkz.
  `docs/product/09-bilinen-kisitlar.md`); göndericiler şimdilik
  `/api/admin/sms/senders` ile yönetilir.

## [0.84.0] — 2026-10-06

### SMS sağlayıcı paneli: eksik alan listesi ve hata metinleri

#### Admin: SMS sağlayıcı panelinde eksik alan listesi
Kimlik bilgileri girildiği hâlde test/gönderim "kimlik bilgileri eksik"
diyordu; eksik olan aslında göndericiydi (From numarası ya da Messaging Service
SID). `GET /api/admin/sms/settings` ve `POST /settings/test` artık eksik
parçaları (`accountSid`, `authToken`, `sender`) listeliyor; panel kayıtlı Auth
Token'ı maskeli gösteriyor ve hata kodlarını 8 dilde çeviriyor.

## [0.83.0] — 2026-10-06

### İletişim merkezi ve SMS otomatik gönderim

#### İletişim merkezi ve SMS otomatik gönderim
- Yeni **İletişim** sayfası (`/admin/communications`, menüde Engagement
  altında): e-posta ve SMS şablonları, kampanyalar, otomasyonlar, segmentler,
  gönderim günlükleri ve test gönderimi tek yerde. `/admin/mail-templates` ve
  `/admin/sms-templates` buraya yönlenir.
- SMS şablonlarına kitle (`all` / `segment` / `users`) ve zamanlama
  (`schedule.intervalHours`) eklendi; zamanlanmış şablonlar 15 dakikalık işle
  gönderilir.
- Olay SMS'leri artık gerçekten gönderiliyor: kayıt/e-posta doğrulama,
  yatırım tamamlanması, çekim talebi ve tamamlanması, bahis kazanç/kayıp,
  casino oturumu kâr/zarar.
- `POST /api/admin/sms/test-send` (`{ to, message }`) ve
  `POST /api/admin/settings/email/test` için isteğe bağlı `to`.

**Kırılan Değişiklikler:**
- `sms-gateway` modülü açık ve sağlayıcı yapılandırılmışsa, ilgili olaya bağlı
  aktif bir SMS şablonu olan her olay gerçek (ücretli) SMS üretir. Açmadan önce
  aktif şablonları gözden geçirin; maliyet notu `docs/sms-gateway/README.md`
  §12'de.

## [0.82.1] — 2026-10-03

### Socket.IO oda koruması, bonus süresi, demo hesapları, admin yetkisi, kurulum

#### Ledger: geçmiş çift kayıtlar için elle çalıştırılan temizlik betiği
2026-09-17 ledger geçişinin geçmişte yazdığı ham kopya `Transaction` satırlarını bulan `server/scripts/ledger-dedupe.mjs` eklendi. Varsayılan **kuru çalıştırmadır** (rapor, veri yazmaz); `--commit` ile kopyalar önce `transactions_dedupe_archive`'a yedeklenip silinir, referanslar korunan satıra çevrilir. Yalnız `idempotencyKey`'siz ham satır + aynı alanlı anahtarlı eşi hedeflenir; tekil anahtarlı kayıtlara dokunulmaz. Onay bekleyen kripto çekimlerde admin kopyalardan birini işlemişse bekleyen kopya kaldırılır (çift USDT gönderimi/iadesi olmasın diye). Hiçbir açılış veya deploy adımı bunu otomatik çalıştırmaz.

#### Güvenlik: Socket.IO admin/kişisel odaları token ile korunuyor
`subscribe:admin` ve `subscribe:user` istemcinin gönderdiği `userId`'ye güveniyordu. Ana kanalda kimlik doğrulaması olmadığı için bir admin'in id'sini bilen herkes `role:admin` odasındaki tüm yatırma/çekme, KYC ve kuyruk olaylarını dinleyebiliyordu; herhangi bir oyuncunun id'siyle de onun bakiye olayları dinlenebiliyordu. İki olay da artık access token istiyor ve sunucu yalnızca token sahibinin odasına katıyor.

**Kırılan Değişiklikler:**
- `subscribe:user` / `subscribe:admin` olaylarını kendi istemcisinden gönderen entegrasyonlar artık `{ token: <accessToken> }` göndermeli; yalnızca `userId` gönderen abonelik sessizce yok sayılır.

#### Bonus: süresi dolan bonus artık çekilebilir olmuyor
Süresi dolan çevrim, bonusun kilidini tamamen açıyordu (100 gerçek + 100 bonus → 200 çekilebilir). Artık oyuncunun bonusu iptal etmesiyle aynı kural uygulanıyor: çevrilmemiş pay geri alınıyor, bakiye negatife inmiyor. İşlem tek DB transaction'ında ve idempotent `bonus_forfeit` kaydıyla yapılıyor; çekim kapısından önce ve saatte bir (`jobs/bonusExpiry.js`) çalışıyor.

#### Güvenlik: demo veri hesapları oturum açamaz
`isSeed` hesaplar login, `/auth/refresh` ve tüm kimlik doğrulamalı isteklerde reddediliyor. Üretici artık sabit parola yerine her yüklemede saklanmayan rastgele bir parola yazıyor. Migration `0003` (elle: `node server/scripts/migrate.js`) mevcut seed parolalarını değiştiriyor ve oturumlarını düşürüyor.

#### Admin: "Bekleyen finans" tablosu, panelden açılan admin yetkisi, kurulum admin'i
- Dashboard'daki "Bekleyen finans" tablosu oyuncu adı ve tutar yerine "—", risk sütununda her satırda "Orta" gösteriyordu. Tablo artık yeni `GET /api/admin/queues/pending-finance` ucundan besleniyor: kripto ve banka talepleri, en uzun bekleyen önce, gerçek oyuncu adı, tutar ve risk.
- Panelden rol seçilmeden açılan admin, sunucu yeniden başlayana dek tüm ayrıntılı izinlerde (`/api/admin/activity` dahil) 403 alıyordu. Artık oluşturulurken `admin` sistem rolünü alıyor.
- `seed.js --admin` ve `/install` sihirbazıyla açılan admin, e-postası doğrulanmadığı için giriş yapamıyordu. Artık e-posta doğrulanmış olarak oluşturuluyor.

#### Demo veri: "Tümünü Temizle" artık aktivite akışını da temizliyor
Canlı simülasyonun seed kullanıcılar için ürettiği `ActivityEvent` kayıtları (modelde `isSeed` yok, 30 gün TTL) temizlemede silinmiyordu; Dashboard'daki Canlı Aktivite, silinmiş kullanıcılara ait sahipsiz satırları 30 gün boyunca göstermeye devam ediyordu. `userSeed.clear` artık bu olayları da siliyor ve yanıtında `activityEventsDeleted` döndürüyor. Demo-data planının tarayıcı kontrol listesi `server/scripts/verify-demo-data-checklist.mjs` ile otomatikleştirildi (yalnızca yerel DB).

#### Admin: agent ve reconciliation listelerine `limit` sınırı
`GET /api/admin/agents` ve `GET /api/admin/reconciliation/jobs` / `jobs/:id/items` `page >= 1`, `limit` 1-100 (varsayılan 20) uyguluyor; `?limit=1000000` artık tüm koleksiyonu yüklemiyor.

**Kırılan Değişiklikler:**
- `?limit` 100'ün üzerindeki değerlerle bu uçları çağıran araçlar artık en fazla 100 kayıt alır; sayfalamak için `page` kullanın.

## [0.82.0] — 2026-10-03

### Çekirdek senkronu düzeltmeleri
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.81.0] — 2026-10-03

### Sistem e-postaları şablon paneli

#### Sistem e-postaları şablon paneli
Sistemin gönderdiği e-postalar panelden düzenlenebilir. Olaya bağlı
şablonlar (doğrulama, hoş geldin, şifre, KYC, bahis, casino, yatırım/çekim)
olay anında gider ve panelden elle gönderilemez; zamana bağlı şablonlar
(duyuru, hareketsiz kullanıcılar, yeniden etkinleştirme) kitle seçilerek
"Şimdi gönder" ile ya da 15 dakikalık işle gönderilir. Önizleme, gönderim
geçmişi ve 8 dilde panel metinleri dahil. Yeni ortam değişkenleri:
`MAIL_SEND_BATCH_LIMIT` (toplu gönderim tavanı, varsayılan 500, en çok 5000)
ve `MAIL_SYSTEM_DISABLED` (`true` tüm sistem e-postalarını durdurur).
Ayrıntı: `docs/mail-templates.md`.

## [0.80.1] — 2026-10-03

### Lisans AGPL-3.0; ürün belgeleri kodla eşitlendi
- **Kırılan Değişiklikler:** Çekirdek **AGPL-3.0** ile lisanslanır (`LICENSE`, `package.json`: `AGPL-3.0-only`); önceki sürümlerde BUSL yazıyordu. Çekirdeği değiştirip ağ üzerinden hizmet olarak sunan, değiştirilmiş kaynak kodunu kullanıcılarına açmakla yükümlüdür. Ücretli eklentiler ayrı lisanslıdır.
- **Değişti:** Ürün belgeleri kodla tek tek karşılaştırılıp düzeltildi.

## [0.80.0] — 2026-10-03

### SMS gönderici kaydı ve ülke/mevzuat onayı

#### Gönderici kaydı ve ülke/mevzuat onayı — trial hesabın kısıtları artık panelde
SMS Gateway'in ikinci bölümü: **Modüller → SMS Gateway** ve **SMS Mesaj
Şablonları → Göndericiler** sekmesinde numara/Messaging Service kaydı, **mevzuat
onay durumu** (A2P 10DLC, toll-free doğrulaması, yerel sender ID ön kaydı) ve
onaylı hedef ülkeler yönetiliyor. Hesabın gerçek tipi **Twilio API'sinden
okunuyor** (`type: Trial`), varsayılmıyor; panel "Bu bir trial (ücretsiz demo)
hesabı" diye dört kuralı açıkça listeliyor: yalnız panelde doğrulanmış numaralara
(en fazla 5), yalnız kayıt ülkesine, mesaj metnine Twilio'nun kendi şablonu
eklenir, hesap 30 gün sonra biter. Gönderim bu kayda göre **engellenir ya da
alıcı bazında atlanır** — `SMS_SENDER_NOT_REGISTERED`, `SMS_SENDER_MISMATCH`,
`SMS_SENDER_COUNTRY_DENIED`, `SMS_TRIAL_NUMBER_NOT_VERIFIED`,
`SMS_TRIAL_COUNTRY_DENIED`; her atlanan alıcı gönderim günlüğüne nedeniyle
yazılır. 24 ilgili Twilio hata kodu (`30034` A2P kayıtsız, `30041` ülkede
kısıtlı gönderici, `21610` opt-out, `30461` toll-free'de kumar içeriği reddi
vb.) sözlüğe girip günlükte insan diliyle gösteriliyor. Kaynak:
`docs/sms-gateway/README.md` §11.

## [0.79.1] — 2026-10-03

### Eklentilerde komisyon/cashback tekrar koruması
- **Düzeltme:** Spor bahsi ve casino içerik eklentilerindeki komisyon ve cashback ödemeleri de kaynak olaya göre tekrar korumalı.

## [0.79.0] — 2026-10-03

### Dağıtımda depo erişimi
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.78.0] — 2026-10-03

### SMS Gateway (Twilio) ve mesaj şablonları

#### SMS Gateway (Twilio) + sistem/kampanya mesaj şablonları CRUD'u
**Modüller** sayfasına altıncı sağlayıcı
kartı (`sms-gateway`) geldi: Twilio `Account SID` / `Auth Token` / gönderici
numara / `Messaging Service SID` / varsayılan ülke kodu, kaynak rozetleri
(`db` / `.env` / tanımsız) ve **mesaj göndermeyen** bir "Bağlantıyı Test Et"
(kuru çalışma — Twilio `GET /Accounts/{Sid}.json`, tek kuruş maliyeti yok).
Auth Token DB'de **düz metin tutulmuyor**: `utils/secretCrypto.js` ile
AES-256-GCM şifreleniyor; şifreleme anahtarı yoksa token yazılmıyor ve panel
açık bir hata gösteriyor. Yeni **SMS Mesajları** sayfası
(`/admin/sms-templates`, sidebar → Engagement): iki tür şablon yönetiliyor —
bir **olaya bağlı sistem mesajı** (`userRegistered`, `betWon`, `betLost`,
`casinoSessionProfit/Loss`, `depositCompleted`, `withdrawalCompleted`,
`inactiveReminder`) ve bir **zamana duyarlı mesaj** (`bonusExpiring`,
`weeklyBonus`, `tournamentReminder`, `campaignAnnouncement` vb.). Sistem
mesajları bilinçli olarak **panelden gönderilemez** (tetikleyen domain kodudur);
zamana duyarlı olanlar tek kullanıcıya, tüm kullanıcılara ya da bir oyuncu
segmentine gönderilebilir. 15 demo şablon boot'ta eklenir, hepsi panelde
düzenlenebilir satırdır; operatörün düzenlemesi ezilmez, sildiği demo şablon
restart'ta geri gelmez. Her mesaj alıcı bazında `SmsLog`'a yazılır
(gönderildi / başarısız / atlandı + hata), tek istekte 2000 alıcı tavanı
vardır ve boş değişkenler sessizce gitmek yerine gönderim özetinde raporlanır.
Telefonlar E.164'e çevrilir; `+`/`00` yoksa **ülke kodu tahmin edilmez**
(operatörün beyanı gerekir) — aksi hâlde `+53` gibi yanlış bir ülkeye sessiz
gönderim yapılırdı. Mesaj satırları GSM 03.38'e göre segment sayacı gösterir:
`ğĞşŞıİç` tabloda olmadığı için Türkçe SMS 160 değil **70** karaktere sığar.
Domain kodunun bağlanacağı giriş noktası hazır
(`dispatchSmsEvent('betWon', user, {...})` — asla throw etmez), ancak bahis/çekim
akışlarına bağlanmadı: canlı SMS trafiği operatör kararıdır.
Ayrıntı: `docs/sms-gateway/README.md`. Demo Twilio kimlik bilgileri koda
yazılmadı (policy §8) — `.env` (`TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` /
`TWILIO_FROM_NUMBER`) veya panel üzerinden verilir.

## [0.77.1] — 2026-10-03

### Belge denetiminde bulunan 16 kod sorunu
- **Kırılan Değişiklikler:** KYC modülü açıkken tüm çekimler onaylı KYC ister (`KYC_REQUIRED`); süresi dolan KYC günlük düşürülür.
- **Yeni:** `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` tanımlıysa kayıt/giriş/şifre sıfırlamada Cloudflare Turnstile; `ADMIN_ALLOWED_IPS` tanımlıysa admin uçları yalnız bu adreslerden. İkisi de tanımlanmadıkça etkisiz.
- **Düzeltme:** VIP, referans, ajan, admin ve casino oturumu hareketleri ledger'a iki kez yazılabiliyordu; tek kayıt. Komisyon ve cashback kaynak olaya göre tekrar korumalı.
- **Değişti:** Kurulum sihirbazı site adını ve para birimini gerçek ayarlara yazar, kripto/KYC'yi başlangıçta açabilir; banka/kart yatırmaları risk kontrolünden geçer; yedekler 90 gün saklanır.
- **Kaldırıldı:** Kullanılmayan `services/oddsApi.js` ve `jobs/dataSync.js`.

## [0.77.0] — 2026-10-03

### Public çekirdek için senkron ve geçmiş temizleme betikleri
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.76.1] — 2026-10-03

### Admin Users sayfası gerçek veri gösteriyor
- **Düzeltme:** Sekme sayaçları, KPI şeridi ve KYC/Risk sütunları sabit örnek veriden geliyordu.
- **Yeni:** `GET /api/admin/users/facets`, `GET /api/admin/users/kpis`.

## [0.76.0] — 2026-10-02

### Dağıtımda yeniden başlatma denetimi
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.75.0] — 2026-10-02

### SEO ayarları
- **Yeni:** Settings → SEO: site başlığı ve şablonu, açıklama, canonical, sosyal paylaşım etiketleri, doğrulama ve analitik kodları; sunucu tarafında `<head>`'e yazılıyor. `robots.txt` ve `sitemap.xml` otomatik.

## [0.74.1] — 2026-10-02

### Admin: Products menüsü, Settings sekmeleri, tek tip tablolar
- **Değişti:** Para birimleri, yargı bölgeleri ve markalar Settings sekmeleri oldu; eski adresler yönlendiriliyor.
- **Değişti:** Tüm admin tabloları tek bileşen ve ⋮ aksiyon menüsü kullanıyor.

## [0.74.0] — 2026-10-02

### Admin: Settings adı, kripto cüzdan, Slikair ve SMTP ayarları
- **Değişti:** Platform ayarları menüsü "Settings".
- **Düzeltme:** Hiç işlem görmemiş sıcak cüzdan 500 veriyordu; anahtar yoksa açıklayıcı hata.
- **Yeni:** Slikair kimlik bilgileri ve SMTP ayarları panelden girilebilir (sırlar şifreli; `OPERATOR_SECRET_ENCRYPTION_KEY`).

## [0.73.1] — 2026-10-02

### Spor Bahisleri eklentisi: kısmi veri diğer sporları bitirmiyor
- **Düzeltme:** Kaynak yalnız bir sporu döndürdüğünde diğer sporlardaki yaklaşan maçlar "bitti" sayılıyordu. Kısmi veri tanınıyor; yanlışlıkla bitirilenler geri alındı.

## [0.73.0] — 2026-10-02

### Spor Bahisleri eklentisi: yaklaşan maç oranları donmuyor
- **Düzeltme:** Oran kaynağı boş liste döndüğünde senkron sessizce "başarılı" sayıyordu; yaklaşan maçlar saatlerce güncellenmiyordu. Boş tur artık sağlık durumuna yansıyor ve yeniden deneniyor.

## [0.72.0] — 2026-10-02

### Casino içerik eklentisi: kayıtlı Bonus Call ve Freeround

#### Casino ödülleri: kayıtlı Bonus Call + Freeround
Casino Yönetimi'ndeki bonus sekmesi "Bonus & Freeround" olarak yeniden kuruldu: admin açık oturumlara bonus call, herhangi bir oyuncuya freeround (tur sayısı × tur başı bahis, bitiş tarihi) verebiliyor, iptal edebiliyor; her işlem `CasinoPromoGrant` kaydı + ham sağlayıcı yanıtıyla saklanıyor, geçmiş tablosu 15 sn'de bir yenileniyor, iki adımlı onay düğmesi var. Sağlayıcının HTTP 200 + `code ≠ 0` yanıtı artık başarı sayılmıyor; çift tıklamada ikinci bonus call sağlayıcıya gitmiyor (`409 PROMO_CALL_DUPLICATE`). Sunucu sınırları: set point ≤ 100.000, ≤ 500 tur, bahis×tur ≤ 100.000, ≤ 90 gün. Yeni izin: `admin:casino:bonus`. Oyuncu detayında "Casino ödülü ver" kısayolu. Belge: `docs/product/11-admin-araclari.md`, `docs/providers/igames-casino.md`.

**Kırılan Değişiklikler:**
- `POST /api/admin/igames/bonus/cancel` artık `{ grant_id }` (kayıtlı ödülün `_id`'si) bekliyor; sağlayıcının `call_id`'si ile gelen eski gövde `400` döner. Bu uca doğrudan istek atan entegrasyonlar önce `GET /api/admin/igames/promo/grants` ile kaydı bulup `grant_id` göndermeli.

## [0.71.1] — 2026-10-02

### Platform Sağlığı kartı
- **Düzeltme:** Kart yanlış uca gidiyor ve sonsuza dek "Yükleniyor" kalıyordu.

## [0.71.0] — 2026-10-02

### Yeni sürüm tarayıcıya hemen geçiyor
- **Düzeltme:** Yeni service worker beklemede kalıyor, tarayıcı eski sürümü çalıştırmaya devam ediyordu (`skipWaiting`, `clientsClaim`).

## [0.70.0] — 2026-10-02

### Admin gösterge panelinde 404'ler
- **Düzeltme:** Sistem sağlığı ve risk bulguları uçları yanlış yolda/bağlanmamıştı; gösterge panelinde 404 veriyordu.

## [0.69.1] — 2026-10-02

### Dağıtımda bağımlılık klasörü
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.69.0] — 2026-10-02

### Dağıtımda yeniden başlatma komutu
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.68.1] — 2026-10-02

### Dağıtımda yeniden başlatma adımı
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.68.0] — 2026-10-02

### Dağıtımda bağımlılık kurulumu
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.67.0] — 2026-10-02

### Dağıtım tetikleyicisi
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.66.1] — 2026-10-02

### Dağıtım notu düzeltmesi
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.66.0] — 2026-10-02

### Rol atanan kullanıcı admin paneline girebiliyor
- **Düzeltme:** Kullanıcıya rol atanınca panele giremiyordu.
- **Yeni:** Kullanıcı detayında rol atama.

## [0.65.1] — 2026-10-02

### Tarih aralığı tüm KPI'lara uygulanıyor
- **Düzeltme:** Gösterge panelindeki tarih aralığı yalnız grafiğe uygulanıyordu; KPI kartları da filtreleniyor. Grafik ızgarası düzeltildi.

## [0.65.0] — 2026-09-30

### Admin canlı sayaçlar üretime alındı
- **Değişti:** Önceki sürümdeki admin değişiklikleri `main`'e taşındı.

## [0.64.0] — 2026-09-30

### Admin sayaçları canlı veriye bağlandı
- **Düzeltme:** Gösterge paneli ve menü rozetlerindeki sabit örnek sayılar gerçek veriyle değiştirildi; kayıt işlenince sayaç anında düşüyor.
- **Yeni:** Marka, para birimi ve yargı bölgesi listelerinde sunucu taraflı arama; ortak tablo bileşeni.

## [0.63.1] — 2026-09-29

### Casino içerik eklentisi: Bonus Call çalışıyor
- **Düzeltme:** Bonus Call formu oyun kodu gönderiyordu; sağlayıcı oyuncunun açık oyun oturumunu bekliyor. Form açık oturumları listeliyor.

## [0.63.0] — 2026-09-29

### Kayıtta "Çok fazla deneme" hatası
- **Düzeltme:** Kayıt, giriş, doğrulama e-postası ve şifre sıfırlama tek bir istek sayacını paylaşıyordu; birkaç hatalı denemeden sonra yeni oyuncu giriş yapamıyordu. Her akışın kendi sınırı var.

## [0.62.0] — 2026-09-27

### Sektör standardı kasa avantajı varsayılanları
- **Değişti:** In-house oyunların varsayılan kasa avantajları sektör ortalamasına çekildi (Crash/Limbo %3, Mines/Hilo/Dice 0,97, Baccarat banker 1,95× vb.).
- **Yeni:** Oyun hata mesajları 8 dilde.

## [0.61.1] — 2026-09-27

### Sıfır bakiye ekranı, oyunda sohbet, para birimi düzeltmeleri
- **Değişti:** In-house oyunlar sıfır bakiyede açılmıyor, "yetersiz bakiye" ekranı gösteriliyor.
- **Yeni:** Oyun içinde sohbet.
- **Düzeltme:** Para birimi gösterimi ve eksik çeviriler.

## [0.61.0] — 2026-09-26

### Provably-fair doğrulama ve canlı aktivite akışı

#### Provably-fair: oyuncu tarafından doğrulanabilir seed çiftleri
11 tek-oyunculu in-house oyun ad-hoc `randomBytes` yerine oyuncunun önceden taahhüt edilmiş (`serverSeedHash` yayınlanmış) seed çiftini + artan `nonce`'u kullanıyor (`roundSeed = HMAC(serverSeed, nonce)`); oyunların kendi matematiği ve RTP değişmedi. Oyun üzerindeki Fairness paneli client seed'i değiştirip seed'i yeniliyor (eski seed açıklanıyor) ve geçmiş turları Web Crypto ile tarayıcıda yeniden hesaplıyor. Ham `serverSeed` artık hiçbir tur yanıtında dönmüyor (Mines/Hi-Lo/Video Poker'daki sızıntı kapandı). Yeni uçlar: `/api/provider/v1/fairness/{active,rotate,round/:id,rounds}`. Özellikten önceki turlar "doğrulanamaz" olarak işaretlenir. Belge: `docs/product/04-oyun-matematigi.md`, `docs/providers/inhouse-games.md`.

## [0.60.1] — 2026-09-25

### Admin kart tasarımı ve 8 dilde tüm panel
- **Değişti:** Admin sayfaları tek tip kart ve istatistik şeridi tasarımına geçti.
- **Yeni:** Panelde sabit metin kalmadı; tamamı 8 dilde.

## [0.60.0] — 2026-09-24

### Admin paneli düzeltmeleri
- **Düzeltme:** Önceki sürümdeki admin yeniden yapılanmasının ardından bulunan panel hataları.

## [0.59.0] — 2026-09-24

### Admin paneli kapsamlı düzeltme ve yeniden yapılanma

#### Admin: canlı aktivite akışı
Dashboard'daki AuditLog tabanlı "Son Aktivite" widget'ı, oyuncu aktivitesini (yatırma/çekme, kupon, in-house oyun oturumu, KYC, risk bayrağı, giriş kilidi) Socket.IO ile anlık gösteren `ActivityFeed` ile değiştirildi; kayıtlar 30 gün sonra TTL ile silinir. Yeni uç `GET /api/admin/activity`, yeni izin `admin:activity:read`. Belge: `docs/product/11-admin-araclari.md`.

## [0.58.1] — 2026-09-23

### Admin menü düzeni
- **Değişti:** KYC ayarları Uyum sekmesine, oyun vitrini igames sekmesine taşındı; Sağlık ve Hata Logu birleşti. Eski adresler yönlendiriliyor.

## [0.58.0] — 2026-09-23

### Admin paneli çok dilli
- **Yeni:** Ajanlar, KYC ayarları, demo veri ve aktivite akışı sayfaları 8 dilde.

## [0.57.1] — 2026-09-23

### Aralıklı "oturum geçersiz" hatası
- **Düzeltme:** Token yenilemesi sonrası 30 saniyelik önbellek eski sürümü tutuyordu; geçerli token'lar zaman zaman 401 alıyordu.

## [0.57.0] — 2026-09-23

### Yetki reddi tanı logları
- **Değişti:** Kimlik doğrulama ve yetki reddedildiğinde nedeni sunucu loguna yazılıyor.

## [0.56.0] — 2026-09-23

### Demo verisi gelir raporlarını bozuyordu
- **Düzeltme (kritik):** Gösterge paneli ve analitik sorguları demo kayıtlarını da sayıyordu; gelir rakamları anlamsızlaşıyordu. Demo kayıtları raporlardan hariç.
- **Düzeltme:** Slikair ödemeleri sayfasındaki çökme.

## [0.55.1] — 2026-09-23

### Admin demo veri ekranı tema düzeltmesi
- **Düzeltme:** Demo veri sayfası panelin koyu temasına uymuyordu.

## [0.55.0] — 2026-09-23

### Admin demo veri ekranı iyileştirildi
- **Değişti:** Demo veri sayfasında kategori açıklamaları, canlı simülasyon durumu, silme onayı.

## [0.54.0] — 2026-09-23

### Admin: demo veri üreticisi ve canlı simülasyon

#### Admin: demo veri üreticisi + canlı simülasyon
`/admin/demo-data` sayfası 8 kategoride (`users`, `sports`, `casino`, `kyc`, `risk`, `tickets`, `agents`, `payments`) son 90 güne yayılmış, `isSeed: true` işaretli veri yüklüyor/temizliyor; canlı simülasyon açıkken gerçek giriş noktaları üzerinden periyodik kayıt üretip aktivite akışını besliyor. Yeni izin: `admin:demo-data:manage`. Seed verisi Dashboard/Analytics sayılarına dahildir. Belge: `docs/product/11-admin-araclari.md`.

## [0.53.1] — 2026-09-23

### Mevcut admin hesaplarına rol atandı
- **Düzeltme:** Rol sistemi öncesinden kalan admin hesapları hiçbir role bağlı değildi; panelin çoğu "yetki yok" veriyordu. Rolü olmayan adminler açılışta `super_admin`'e bağlanıyor.

## [0.53.0] — 2026-09-22

### İşlem geçmişi yenilemesi ve mükerrer kayıt
- **Düzeltme:** Ödeme sonrası işlem geçmişi eski yanıtla ezilebiliyordu; Slikair yatırması listede iki kez görünüyordu.

## [0.52.1] — 2026-09-22

### Slikair dönüşünde oyuncu bildirimi
- **Düzeltme:** Ödeme sonrası yönlendirmede yöntem bilgisi eksikti; oyuncu bildirim görmüyor, bakiyesi yenilenmiyordu.

## [0.52.0] — 2026-09-22

### Slikair başarılı ödemeleri bakiyeye yansıtıyor
- **Düzeltme:** Başarılı ödeme durumu "işleniyor" sanılıyordu; ödeme takılı kalıyor, bakiye yüklenmiyordu.

## [0.51.0] — 2026-09-22

### Slikair: admin çekim başlatma
- **Yeni:** Adminin oyuncu adına Slikair çekimi başlatabildiği uç ve form.

## [0.50.1] — 2026-09-18

### PWA güncellemeleri tarayıcıya ulaşmıyordu
- **Düzeltme:** `sw.js` uzun süreli önbelleğe alınıyordu; yeni sürümler tarayıcıya hiç gelmiyordu. Service worker dosyası artık önbelleğe alınmıyor.

## [0.50.0] — 2026-09-18

### Mutabakat: kripto yatırmalar zincirden doğrulanıyor
- **Yeni:** Mutabakat modülü kripto yatırmaları TronGrid üzerinden zincirdeki kayıtla karşılaştırıyor (önceden dış kaynak boştu).

## [0.49.1] — 2026-09-17

### Slikair ödeme bildirimleri doğrulanıyor
- **Güvenlik:** Slikair bildirimleri imzasız olduğu için ödeme kimliğini bilen biri sahte "başarılı" bildirimle bakiye yükleyebiliyordu. Her başarılı bildirim Slikair'in durum API'siyle çapraz doğrulanıyor.

## [0.49.0] — 2026-09-17

### Admin paneli yeniden yapılandı
- **Değişti:** Admin paneli düz kart ızgarası yerine gruplu kenar çubuğu, detay çekmecesi ve sekmeli sayfalarla (Uyum, Cüzdan vb.) düzenlendi.

## [0.48.0] — 2026-09-17

### Yakalanmamış hatalar sunucuyu çökertmiyor
- **Düzeltme:** Geçici bir veritabanı zaman aşımı gibi yakalanmamış promise hataları süreci sonlandırıyordu; artık loglanıp devam ediliyor.

## [0.47.1] — 2026-09-17

### Slikair için eksik bağımlılık
- **Düzeltme (kritik):** `uuid` bağımlılığı bildirilmemişti; temiz kurulumda sunucu açılmıyordu.

## [0.47.0] — 2026-09-17

### Slikair geri çağrı adresi
- **Düzeltme:** Webhook adresinin varsayılanı var olmayan bir alt alan adına işaret ediyordu; artık sitenin kendi adresinden türetiliyor.

## [0.46.1] — 2026-09-17

### Bazı dil dosyalarında sözdizimi hatası
- **Düzeltme:** İspanyolca, Japonca ve Korece sözlüklerde eksik virgül; bu dillere geçince arayüz çöküyordu.

## [0.46.0] — 2026-09-17

### Slikair ödeme ağ geçidi
- **Yeni:** Slikair ile kart ve alternatif yöntemlerle para yatırma; 8 dilde metinler. Kimlik bilgileri `.env`'den.

## [0.45.0] — 2026-09-17

### Oyuncu hesabı yönetimi ve risk/dolandırıcılık tamamlandı
- **Yeni:** Sorumlu oyun limitleri (günlük/haftalık/aylık yatırma, kayıp, bahis) ve oyuncu ekranı.
- **Yeni:** Risk motoru kuralları yatırma/çekme uçlarına bağlandı; mutabakat ve ajan ekranları.
- **Güvenlik:** Bir dizi güvenlik açığı kapatıldı.

## [0.44.1] — 2026-09-15

### Eklenti depolarına README
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.44.0] — 2026-09-15

### Yeniden adlandırma sonrası betik ve test düzeltmeleri
- **Düzeltme:** Yeniden adlandırmada atlanan sunucu betikleri; tarihe bağlı iki kararsız test.

## [0.43.0] — 2026-09-15

### Casino içerik eklentisinin adı igames oldu
- **Kırılan Değişiklikler:** Casino içerik eklentisi `server/src/premium/igames` altında; API yolları ve admin sayfası buna göre yeniden adlandırıldı.

## [0.42.1] — 2026-09-14

### Açılışta dotenv ipucu satırı susturuldu
- **Değişti:** dotenv'in açılışta bastığı reklam/ipucu satırı kapatıldı (`quiet: true`).

## [0.42.0] — 2026-09-13

### Eklentiler alt modül olarak bağlandı
- **Kırılan Değişiklikler:** Üç ücretli eklenti ayrı özel depolarda; ana depoya git alt modülü olarak bağlı. Eklentisiz kurulumda bu klasörler boştur.

## [0.41.1] — 2026-09-12

### Ücretli eklentiler çekirdekten ayrıldı
- **Kırılan Değişiklikler:** Casino içerik, in-house oyunlar ve spor bahsi kodu `server/src/premium/` altına taşındı ve isteğe bağlı yükleniyor. Eklenti kurulu değilse ilgili uçlar 503 döner, sunucu çökmez.
- **Güvenlik:** Koda gömülü bir erişim belirteci ortam değişkenine taşındı.

## [0.41.0] — 2026-09-11

### Rulet kasa avantajı ayarı ödemeye yansıyor; tek marka adı
- **Düzeltme:** `rouletteHouseEdgePercent` ve `rouletteMaxPayout` gerçek ödemeyi etkiliyor (varsayılanlarla eski davranış aynı).
- **Değişti:** Koddaki eski marka adları kaldırıldı; site adı ve yasal unvan admin panelinden yönetiliyor.

## [0.40.0] — 2026-09-11

### Kripto ödeme, KYC ve admin gelir grafiği
- **Yeni:** USDT (TRC20) kripto ödeme modülü: oyuncuya özel adres, sıcak cüzdan, kur ayarı.
- **Yeni:** KYC: yerel belge incelemesi ve Sumsub entegrasyonu.
- **Yeni:** Admin gösterge panelinde canlı gelir grafiği.

## [0.39.1] — 2026-09-07

### Oyun sunucusunda harici yazı tipi bağımlılığı kaldırıldı
- **Düzeltme:** In-house oyun sunucusu (game-host) da yazı tiplerini kendisi servis ediyor.

## [0.39.0] — 2026-09-07

### Spor Bahisleri eklentisi: outright marketleri
- **Yeni:** "Kazananı seç" (outright) biçimindeki spor kategorileri de senkronlanıyor (satranç, golf, Formula 1, motor sporları, bisiklet vb.).

## [0.38.1] — 2026-09-07

### Spor Bahisleri eklentisi: oran kaynağı bağlantı düzeltmeleri
- **Düzeltme:** odds-provider'ın oturum ve vekil zinciri canlı veriyi çekemiyordu.
- **Değişti:** odds-provider varsayılan portu 3003.

## [0.38.0] — 2026-09-07

### Dağıtım betiğinde npm yolu
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.37.0] — 2026-09-07

### Yazı tipleri sunucudan servis ediliyor
- **Düzeltme:** İkon ve başlık yazı tipleri harici CDN yerine sitenin kendisinden yükleniyor; reklam engelleyicili tarayıcılarda ikonlar düz metin görünüyordu.

## [0.36.1] — 2026-09-07

### `app.js` depoya alındı
- **Düzeltme:** Kök `app.js` depoda yoktu; dağıtımda modül türü uyuşmazlığına yol açıyordu.
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.36.0] — 2026-09-07

Ürün yol haritasının ilk üç aşaması (sözleşmeler, paralel geliştirme akışları, entegrasyon) 2026-08-20 ile 2026-09-07 arasında ayrı bir dalda geliştirildi ve bu sürümle `main`'e birleşti. Aşağıdaki kayıtlar o dalda yazıldıkları biçimde korunmuştur.

### Ürün yol haritasının ilk üç aşaması birleştirildi

#### Sağ ray tüm sayfalara yayıldı, Canlı Yardım artık yalnızca footer'dan
Kampanyalar/Bahis/Canlı'da zaten var olan sağ ray (Son Kazananlar paneli) artık Hakkımızda/Kariyer/Basın/İletişim, Yardım Merkezi ve Profil (Para Yatır/Çek) sayfalarında da var — site genelinde tutarlı 3-sütun düzen. Sağ-alttaki sabit "Canlı Yardım" (💬) ikonu kaldırıldı; özelliğin kendisi (`LiveHelp.jsx`) ve footer'daki "Canlı Yardım" linki duruyor — yalnızca kalıcı floating giriş noktası kaldırıldı, panel hâlâ footer'dan açılabiliyor.

#### Oranı olmayan canlı/yaklaşan etkinlikler artık sayaçlarla tutarlı
`MiniEventCard`, geçerli 1X2 oranı olmayan (market dizisi boş) etkinlikleri sessizce render etmiyordu (`return null`) ama lig/spor başlıklarındaki sayaçlar bu filtrelemeden önceki ham sayıyı gösteriyordu — sonuç, "CAF Kupası 1 maç" yazıp altında hiç kart göstermeyen hayalet lig grupları (canlı futbol etkinliklerinin ~%6-7'si şu an bu durumda; canlı senkron bazı maçları oranı gelmeden de "canlı" işaretleyebiliyor). `hasDisplayableOdds` paylaşılan bir yardımcıya çıkarıldı; `Live.jsx`/`EventDetail.jsx`'in canlı etkinlik listesi ve Bahis'in `LazyLeagueGroup`'u artık aynı filtreden geçiyor, sayaç ile gösterilen kart sayısı her zaman eşleşiyor.

#### Footer artık tam genişlik, yasal/kurumsal sayfalar yeni arayüze gömüldü
`Layout.jsx`'te Footer, sidebar+içerik flex satırının İÇİNDEYDİ — sidebar içerikten kısa kaldığında Footer yalnızca içerik sütunu genişliğinde görünüyor, solunda boşluk kalıyordu. Footer artık tek scroll konteynerinin içinde ama flex satırının dışında, her zaman tam genişlikte. `/legal/*`, Hakkımızda/Kariyer/Basın/İletişim ve Yardım Merkezi artık `Layout`'a sarılı — Footer/ScrollToTop/HomeSidebar alıyorlar (legal sayfalar kendi içindekiler sidebar'ını koruyor, iki sidebar çakışmasın diye). Sistem Durumu (`/status`) sayfası tamamen kaldırıldı — Casino Sağlayıcısı için yanlış "Kapalı" gösteriyordu. Admin > Statik Sayfalar düzenleme modalı artık her zaman 1. maddeden açılıyor (`flex items-center` + `overflow-y-auto` birleşimi, içerik viewport'tan uzun olduğunda `scrollTop=0`'ı içeriğin ortası gibi konumlandırıyordu). Bahis'teki "Yaklaşan Etkinlikler" linki artık tıklanınca kategori filtresini "Tümü"ye sıfırlayıp listeye kaydırıyor (önceden kendi sayfasına link verdiği için tıklamak hiçbir şey yapmıyordu).

**Kırılan Değişiklikler:**
- `/status` route'u ve `client/src/pages/Status.jsx` kaldırıldı. Bu sayfaya
  dışarıdan link veren veya özelleştirmiş kurulumlar 404 yerine ana sayfaya
  yönlenir (catch-all route zaten `Navigate to="/"` yapıyor) ama sayfanın
  kendisi artık yok — sistem durumu göstermek isteyen kurulumlar bu
  özelliği yeniden eklemeli.

#### Kritik: BetSlip herhangi bir orana tıklayınca sayfayı çökertiyordu
`BetSlip` bileşeni `useTranslation`'ı hiç çağırmıyordu — mobil kupon barı render olurken `t is not defined` ile tüm sayfa çöküyordu (yalnızca arkaplan renginden ibaret kalıyordu). Ayrıca `SlipContent` içinde `.map(t => ...)` çeviri fonksiyonunu gölgeliyordu, Tekli/Kombine butonları kırıktı. Kök neden ayrıca bulundu: `Layout.jsx`'in `showSidebar` mantığı eski spor-filtre ağacını (`Sidebar.jsx`) yalnızca Bahis/Live'da gizliyordu — Kampanyalar/Profil/Ayarlar/Favoriler/Bahislerim/Son Oynananlar sayfaları hâlâ bu sayfalarla hiç ilgisi olmayan "Futbol/Basketbol/Tenis" ağacını gösteriyordu; artık hepsi genel `HomeSidebar` kabuğu alıyor. `HomeSidebar`'daki "Yaklaşan Etkinlikler" linki kendi sayfasına işaret ettiğinden sürekli aktif görünüyordu, düzeltildi. Üst menüde aktif sayfanın altına birincil renkte ince bir çizgi eklendi.

#### Kaynağın 26 spor kategorisinin tamamı artık senkronize ediliyor
Önceki `SPORT_MAP` kodlarının çoğu (`am`, `cr`, `wp`, `ru`, `sn`, `mma`, `dr`, `e`, `bs`, `fs`) kaynak tarafında hiç çalışmıyordu — sessizce boş yanıt dönüyordu, bu sporlar hiç senkronize olmuyordu. Doğru kodlar kaynağın sidebar linklerinin CSS class'ından (`m-menu__link_XXX`) tek tek çıkarılıp doğrulandı: Amerikan Futbolu (`am`→`rg`), Kriket (`cr`→`c`), Su Topu (`wp`→`wat`), Rugby ikiye ayrıldı (Rugby Ligi/`rgl`, Rugby Birliği/`rug`), Bilardo (`sno`) eklendi, 9 yeni kategori (Avustralya Futbolu, Bisiklet Yarışı, Formula 1, Motor Sporları, Yelken, Kayak, Otomobil Yarışı, Biatlon, Satranç) eklendi — Politikalar (seçim bahisleri) bilinçli olarak dahil edilmedi. Ayrıca özet penceresinin (14 gün) senkronizasyon ufkuyla (30 gün) uyuşmaması futbol sayısını 1377/1524'ten 1423'e çıkardı.

#### Canlı rozeti kaldırıldı, Tümü toplamı doğru sayıyor, Etkinlik Detay yeniden giydirildi
Kategoriler üstündeki kırmızı "X canlı etkinlik" rozeti kaldırıldı; hem Canlı hem Bahis sayfalarında toplam sayı artık Kategoriler altındaki "Tümü" karşısında, Canlı'da da Bahis'teki gibi "Tümü" varsayılan seçili. Etkinlik Detay sayfası (`/events/:id`) artık aynı 3-sütun `HomeSidebar` düzenini kullanıyor — ziyaret edilen etkinlik canlıysa Canlı bağlamı, yaklaşansa Bahis bağlamı sidebar'da gösteriliyor.

#### Anasayfa promo slider'ı Bahis/Canlı'ya taşındı, sidebar zenginleştirildi, arama birleştirildi
Anasayfanın promo/hero slider'ı yeni `PromoHeroSlider.jsx` ile Bahis/Canlı sayfalarına aynen taşındı. `HomeSidebar` artık Bahis/Canlı'da da kullanılıyor — "Öne Çıkan Ligler" bölümü ve sayfa-özel üst link (Bahis'te "Yaklaşan Etkinlikler") eklendi. Navbar arama artık sayfa-bağımsız: hem oyunları/sağlayıcıları hem canlı+yaklaşan etkinlikleri aynı anda arıyor (önceden sayfaya göre mod ayrımı vardı — bir etkinlik ya canlıda ya bahiste bulunabileceğinden ayrım kaldırıldı). Canlı bahis kazanç simülasyonu artık olay-güdümlü: sahte kazananlar maç bitene kadar birikiyor, etkinlik sonuçlanınca hepsi birden (market değil etkinlik adıyla, generik ikonla) açığa çıkıyor — bir bahsin sonucu maç ortasında mantıksal olarak tanımsız olduğundan.

#### Kritik: OddsSource canlı senkronizasyon WS hatası tüm sunucuyu çökertiyordu
`jobs/oddsSourceLiveSync.js`'teki `nodeupd` Socket.IO bağlantısında `ws.onerror =  => ws.close;` deseni — bir bağlantı hatasında `close` çağrısı bazen (undici/`ws` kütüphanesinin bilinen bir tuzağı) yeni bir `error` event'i daha fırlatıyor, bu da `onerror`'ı SENKRON olarak yeniden tetikleyip sonsuz özyinelemeyle `RangeError: Maximum call stack size exceeded` ile **backend process'ini komple çökertiyordu**. `node --watch` her seferinde otomatik yeniden başlattığı için görünürde "çalışıyor" gibiydi, ama her çöküş anında Vite dev proxy'sinin o anki `/socket.io` bağlantıları "http proxy error" ile başarısız oluyordu (kullanıcının fark ettiği asıl belirti — proxy/socket.io yapılandırması değil, backend'in kendisiydi). Basit bir `erroring` bayrağı + `try/catch` ile ikinci `onerror` girişi yok sayılıyor artık.

#### Çevrimiçi sayaç artık polling değil, socket push
`GET /api/health/status`'un 10sn'de bir polling'i (madde: "neden hâlâ HTTP ile, socket zaten açıkken") tamamen kaldırıldı. Yeni `server/src/services/onlineCount.js` — `getOnlineCount`/`broadcastOnlineCount` — bir socket bağlanınca/koparınca (`socket/handler.js`) ve fake-winners oyuncu havuzu yeniden zarlanınca (`fakeWinners.js` `regeneratePool`, admin ayar kaydında da tetikleniyor) tüm bağlı client'lara `online:count` event'i yayınlıyor. `useOnlineCount.js` artık yalnızca İLK değeri (guest/socket-bağlı-değilken flaş önlemek için) `GET /api/health/status`'tan tek seferlik çekiyor, sonrası socket'ten geliyor — `setInterval` tamamen kalktı. `/api/health/status` zaten rate limiter'dan muaftı (`skip:` — hiçbir zaman 429'a sebep olamazdı), ama tekrarlı istek olması gereksizdi; artık yok.

Canlı doğrulama: bir sekmede anasayfa açık bırakıldı, ikinci sekmeden admin'de oyuncu havuzunu 200-300'den 500-500'e değiştirip kaydedince, ilk sekmedeki sayaç **hiçbir sayfa yenileme/HTTP isteği olmadan** 290'dan 506'ya güncellendi (`read_network_requests` ile 16sn+ boyunca `/health/status`'a tek bir istek gittiği doğrulandı).

#### Kaydırma butonu artık çift yönlü
`ScrollHintArrow.jsx` (ProviderRow + GameRowSection) yalnızca sağa değil, satır sağa kaydırılıp solda oyun biriktiğinde sola da kaydırabiliyor — sol/sağ butonlar bağımsız olarak, yalnızca o yöne gerçekten kaydırılabilirken görünüyor (satırın başında sol buton, sonunda sağ buton kayboluyor). Tarayıcıda uçtan uca doğrulandı.

`AllGamesSection.jsx`'in ("Tüm Oyunlar") `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8` responsive grid'i bir önceki turda zaten eklenmişti — ekran genişliğine göre 2/3/4/6/8 arası farklı sayıda oyun gösteriyor, kart genişlikleri sabit değil (grid hücresi kadar esniyor). Bu oturumda tarayıcı otomasyon aracının pencereyi gerçekten daraltamaması nedeniyle mobil genişlikte görsel doğrulama YAPILAMADI — mekanizma standart Tailwind responsive grid deseni, kod değişikliği gerekmedi.

#### Kaydırma butonu, 8'li grid, misafir kazananlar, doğru çevrimiçi sayacı, admin sadeleştirme, rate limit
Bir önceki turdaki özelliklerin gerçek kullanımda ortaya çıkan sorunlarını düzeltir.

**Düzeltildi:**
- **Kaydırma ipucu → gerçek buton** — `ScrollHintArrow.jsx` artık salt görsel
  bir fade+ikon değil, tıklanınca satırı yumuşak kaydıran (`scrollBy`), daha
  büyük/belirgin dairesel bir buton (`ProviderRow` + `GameRowSection`).
- **"Tüm Oyunlar" artık bir satırda 8 oyun** — `AllGamesSection.jsx` grid'i
  `lg:grid-cols-6`'dan `lg:grid-cols-8`'e (xl breakpoint), sayfalama 30'dan
  40'a (8×5) çıktı — diğer `GameRowSection` satırlarıyla aynı yoğunluk.
- **`GET /api/inhouse/recent-winners` artık herkese açık** — bu route
  `router.use(requireAuth)`'un ÖNÜNE alındı; misafir kullanıcılar 401
  alıp Son Kazananlar panelini/şeridini hiç göremiyordu (route dosyasındaki
  diğer TÜM uçlar hâlâ login gerektiriyor, yalnızca bu salt-okunur/herkese
  açık sosyal-kanıt ucu ayrıldı).
- **Çevrimiçi sayaç yanlış kaynaktan besleniyordu** — `GET /api/health/status`
  bot payını `User.countDocuments({isBot:true,...})`'tan (P3'ün gerçek bot
  mimarisi — şu an yalnızca birkaç, çoğu pasif kayıt, "200-300" ayarını hiç
  yansıtmıyordu) değil, artık `services/fakeWinners.js`'in periyodik
  yeniden-zarlanan oyuncu havuzu büyüklüğünden (`getPoolSize`) alıyor —
  admin'deki "Oyuncu Havuzu (min/maks)" ayarı gerçekten burayı besliyor.
- **Favori kalp ikonu artık gerçekten "içi dolu"** — `material-symbols-outlined`
  sınıfı varsayılan `FILL:0` kullandığından, favorilenince yalnızca renk
  değişip glyph ince bir anahat olarak kalıyordu (görsel fark yetersizdi).
  `HomeUI.jsx`'teki `FavoriteButton` artık tek "favorite" glyph'i +
  `font-variation-settings: 'FILL' 1/0` ile favorilenince gerçek bir solid
  kalp, favorilenmeyince anahat kalp render ediyor.
- **Global rate limit çok düşüktü (200/15dk)** — modern bir SPA'nın normal
  kullanımı (ilk yüklemede 10+ paralel istek, çevrimiçi sayacı 10sn'de bir
  polling, aynı IP'den birden fazla sekme/kullanıcı) bunu kısa sürede aşıp
  meşru trafiği 429'a düşürüyordu. `globalLimiter.max` 1200'e çıkarıldı.

**Değiştirildi:**
- **Admin `/admin/bots` sayfası sadeleştirildi** — "Bot Oyuncular" (isBot
  bayraklı GERÇEK User hesaplarının liste/oluştur/başlat/durdur/sil UI'ı)
  kaldırıldı: kozmetik "Son Kazananlar" akışının yanında ayrı, kafa
  karıştırıcı ve siteteki çevrimiçi sayısını yansıtmayan bir yönetim
  yüzeyiydi (backend'deki P3 bot mimarisi — `services/bot.js`,
  `jobs/botScheduler.js` — dokunulmadan duruyor, yalnızca admin UI'ından
  kaldırıldı; tek gerçek bot kaydı zaten pasifti). Geriye kalan "Son
  Kazananlar Simülasyonu" kartı Oyuncu Havuzu / Kazanç Zamanlaması / Kazanç
  Tutarı Aralığı / Kazanç Alanları olarak gruplandı, her bölüme havuzun
  çevrimiçi sayacını da beslediğini ve zamanlama alanlarının ne anlama
  geldiğini açıklayan metinler eklendi. `Dashboard.jsx`'teki kısayol kartı
  buna göre yeniden etiketlendi.

#### Kaydırma ipucu, sayfa-içi sağlayıcı filtresi, Tüm Oyunlar grid'i, çevrimiçi/bot sayacı, bot kazanç alanları
Anasayfa etkileşimini ve "Son Kazananlar Simülasyonu" ayarlarını genişletir.

**Eklendi:**
- **Kaydırma ipucu oku** — yeni `ScrollHintArrow.jsx`, `ProviderRow` ve
  `GameRowSection` satırlarının sağ kenarında, satır gerçekten sağa
  kaydırılabilirken bir gradient-fade + ok ikonu gösterir; sona gelince
  kaybolur.
- **"Tüm Oyunlar" artık gerçek bir grid alanı** — yeni `AllGamesSection.jsx`:
  diğer satırlar gibi rastgele örneklenmiş oyunları 6-sütun × 5-satır (30)
  grid'de gösterir, "Daha Fazla Göster" butonu her tıklamada +30 açar.
  Kaydırılabilir DEĞİL — önceki tek-link kartın yerini aldı.
- **Sayfa-içi sağlayıcı filtresi** — `ProviderRow`'dan bir sağlayıcıya
  tıklamak artık `/casino`'ya GİTMİYOR: sayfada kalıp diğer kürasyonlu
  satırları (Popüler/Özel/Slot/Yeni) gizliyor, "Tüm Oyunlar" alanını
  yalnızca o sağlayıcının oyunlarıyla dolduruyor ("× Filtreyi Kaldır" ile
  geri dönülür). `/casino?provider=X` deep-link'i (`CasinoRedesign.jsx`)
  hâlâ duruyor, yalnızca ProviderRow'un davranışı değişti.
- **Çevrimiçi + bot sayacı** — sağ raydaki Son Kazananlar panelinin "Tümü"
  linki yerine artık çevrimiçi kullanıcı sayısı (`useOnlineCount.js`)
  gösteriliyor; backend `GET /api/health/status`'un `onlineCount`'u artık
  gerçek socket bağlantısı + anlık aktif bot sayısı (`isBot:true,
  isActive:true`) toplamı. Sayfanın en üstündeki ayrı yeşil "X çevrimiçi |
  PWA" bandı (`OnlineStatusIndicator`) kaldırıldı.
- **Bot kazanç alanları** — `/admin/bots`'taki Son Kazananlar Simülasyonu
  ayarlarına "Kazanç Alanları" eklendi: Çekirdek (in-house, her zaman
  açık) + Casino oyunları + Bahisler. İkinci ikisi yalnızca ilgili modül
  (`casino-content`/`betting`) sitede gerçekten kullanılabilirken
  (`isModuleUsable` — panel anahtarı VE lisans) seçilebilir/etkilidir;
  `services/fakeWinners.js` artık her ateşlemede etkin alanlardan birini
  rastgele seçiyor — Casino kazananları casino içerik sağlayıcısının gerçek CDN görseliyle
  (`addRecentWinner`'a yeni `image` alanı), Bahis kazananları jenerik bir
  pazar/takım havuzundan (gerçek fikstür verisine dokunmuyor).

#### Favoriler, Son Oynananlar, arama, sağlayıcı rayı, navbar sadeleştirme
Anasayfa sol menüsündeki placeholder "Yakında" satırlarını gerçek özelliğe çevirir, navbar'ı sadeleştirir.

**Eklendi:**
- **Favoriler** — her oyun kartında kalp ikonu (`FavoriteButton`), `User.favoriteGames`
  (`{gameId, kind}`, casino içerik sağlayıcısı için `game_code` in-house için route path) alanına
  `POST /api/users/me/favorites/toggle` ile ekler/çıkarır; `GET /api/users/me/favorites`.
  Sol menüdeki "Favoriler" artık `/favorites` sayfasına gidiyor (yeni `Favorites.jsx`).
- **Son Oynananlar** — bir oyun kartına tıklanınca (fire-and-forget)
  `POST /api/users/me/recently-played` ile kaydediliyor; `User.recentlyPlayed`
  dizisi dedupe + en-yeni-başta + son 20 ile sınırlı (`$pull` + `$push $slice`).
  Sol menüdeki "Son Oynananlar" artık `/recently-played` sayfasına gidiyor
  (yeni `RecentlyPlayed.jsx`). İkisi de yeni `gameActivityStore.js` (zustand,
  optimistic toggle + rollback) üzerinden çalışıyor.
- **Arama** — navbar'daki arama ikonu artık `/casino`'ya giden ölü bir link
  değil, yeni `SearchOverlay.jsx` dropdown'unu açan bir buton. Oyun adı +
  sağlayıcı adına göre canlı filtre (lisanslı casino içerik sağlayıcısı kataloğu + in-house
  oyunlar + provider listesi, `CasinoRedesign.jsx`'teki cache deseninden
  ayrıştırılan `utils/apiCache.js` ile bellek-içi TTL cache). Spor
  Bahisleri/Canlı Bahis için ayrı bir arama modu bu turda YOK — route-aware
  genişletme noktası kod içinde işaretli, sahte UI eklenmedi.
- **Sağlayıcı rayı** — anasayfada slider'ın hemen altına, oyun satırlarından
  önce yeni `ProviderRow.jsx`: `GET/POST /api/palace/providers` listesini
  `GameRowSection` ile aynı yatay-kaydırmalı `flex + overflow-x-auto +
  shrink-0` deseninde, her kartta logo + sağlayıcı adıyla birlikte gösterir,
  bir sağlayıcıya tıklayınca `/casino?provider={id}`'ye gider.
  `CasinoRedesign.jsx` artık mount'ta bu query param'ı okuyup ilgili
  sağlayıcı filtresiyle açılıyor (`useSearchParams`). casino içerik sağlayıcısının kendi
  provider API'si `provider_logo` alanını güvenilir doldurmadığından
  (çoğu sağlayıcıda boş), 21 sağlayıcının gerçek logosu casino içerik sağlayıcısı/GoldSlot
  admin panelinden (Games > Providers List, kullanıcı onayıyla) indirilip
  `client/public/images/providers/{provider_id}.png` altına eklendi;
  `ProviderRow.jsx` provider ID'sine göre yerel logoyu kullanıyor.

**Değiştirildi:**
- Dil değiştirici (`LanguageSwitcher.jsx`) buton grubundan native `<select>`'e
  geçti — üçüncü bir dil eklendiğinde bileşende değişiklik gerekmeyecek.
- Navbar'daki bildirim ikonu kaldırıldı (arkasında hiçbir gerçek bildirim
  sistemi olmadan salt görsel duruyordu).
- "Casino" nav linki (masaüstü navbar + mobil alt navigasyon) artık `/casino`
  yerine `/`'e gidiyor — anasayfa zaten casino dashboard'unun kendisi;
  `/casino` route'u kaldırılmadı, tam katalog/filtre sayfası olarak "tümünü
  gör" linklerinden erişilebilir durumda kalıyor.

**Kırılan Değişiklikler:**
- Yok — `/casino` route'u ve mevcut linkleri değişmedi, yalnızca üst navbar/
  alt navigasyondaki "Casino" sekmesinin hedefi değişti.

#### Son Kazananlar simülasyonu + navbar/hizalama düzeltmeleri
Bir önceki karttaki casino anasayfasına gelen geri bildirimlerin düzeltmesi.

**Eklendi:**
- **Son Kazananlar simülasyonu** (`services/fakeWinners.js`, yeni) —
  P3'ün gerçek `User`/bakiye mimarisinden BİLİNÇLİ olarak ayrı: hiçbir
  gerçek kullanıcı kaydı, bahis ya da bakiye değişimi yok. Değişen
  aralıklarla (varsayılan 8-45sn, admin'den ayarlanabilir) rastgele bir
  Türkçe isim + in-house oyun + tutar (varsayılan ₺500-₺150.000) seçip
  gerçek kazananlarla AYNI mekanizmayı (`addRecentWinner`) çağırıyor —
  client tarafında (`RecentWinnersTicker`/`WinnersPanel`) hiçbir değişiklik
  gerekmedi. "Oyuncu havuzu" (varsayılan 200-300 isim) birkaç dakikada
  bir yeniden zarlanıyor — kullanıcıların giriş/çıkış yapması illüzyonu.
  Admin ayarları: `/admin/bots` sayfasının üstüne yeni bir kart eklendi
  (etkin/pasif, havuz min-max, tetiklenme aralığı min-max, tutar min-max).
- Navbar'a eksik arama/bildirim/dil ikonları eklendi (referansta vardı,
  atlanmıştı) — dil değiştirici gerçek `LanguageSwitcher.jsx`'i kullanıyor
  (zaten Login.jsx'te kanıtlanmış); arama ikonu `/casino`'ya yönlendiriyor,
  bildirim ikonu şimdilik salt görsel (arkasında gerçek bir bildirim
  sistemi yok, bunu gizlemiyoruz).

**Düzeltildi:**
- Oyun satırları (Popüler/Özel/Slot/Yeni Oyunlar) sağ raya (Son
  Kazananlar/Promosyonlar/Kupon, 260px) kadar taşıyordu. Kök neden: hero
  slider kendi İÇ grid'ini (`[1fr_260px]`) kuruyordu — slider sol sütunda,
  sağ ray o grid'in ikinci sütunundaydı — ama altındaki `GameRowSection`
  satırları bu grid'in DIŞINDA, ana flex-column akışında tam genişlikte
  kardeş bloklardı; dolayısıyla sağ rayın altında boş kalan alana doğru
  yayılıyorlardı. Ara adımda `max-w-6xl mx-auto` → `px-4` değişikliği ve
  kart konteynerinin grid/flex arası denemeleri sadece semptomu maskeledi,
  kökü çözmedi. Asıl düzeltme: hero'nun kendi iç grid'i kaldırıldı, bunun
  yerine slider + tüm oyun satırları + "Tüm Oyunlar" kartı TEK bir üst
  grid'in sol (1fr) sütununa, sağ ray (Son Kazananlar/Promosyonlar/Kupon)
  aynı grid'in sağ (260px) sütununa kardeş olarak yerleştirildi — artık
  main sütun sağ raya asla taşamıyor, sağ ray kendi içeriği bitince altını
  boş bırakıyor (main sütun altta devam etse bile). Oyun kartları
  `shrink-0 w-[140px] sm:w-[150px]` sabit genişlikte, yatay-kaydırmalı
  (`overflow-x-auto`) bir `flex` satırında, "tümünü gör" linkleriyle
  birlikte kalmaya devam ediyor. Ayrıca sağ ray paneli "Kazananlar" değil
  "Son Kazananlar" olarak yeniden adlandırıldı (TR/EN).
- Boş Bahis Kuponu konteyneri, anasayfada hiçbir bahis seçeneği olmamasına
  rağmen "Tüm Oyunlar" kartından sonra sayfanın en altında görünüyordu —
  `BetSlip`, yan yana (flex-row) sayfalar için tasarlanmış bir `<aside>`
  iken anasayfanın dikey (flex-column) akışına dahil edilince kendi bloğu
  olarak en alta düşüyor, seçim olmasa bile boş durum metniyle render
  ediliyordu. `BetSlip.jsx`'ten `SlipContent` export edildi ve `BetSlip`'e
  masaüstü `<aside>` bloğunu bastıran bir `desktopHidden` prop'u eklendi
  (mobil bar/sheet davranışı etkilenmedi); anasayfada artık yalnızca aktif
  bir seçim varken (`selections.length > 0`) sağ rayda Promosyonlar'dan
  hemen sonra konumlanan bir kart olarak gösteriliyor, seçim yoksa hiç
  render edilmiyor.

#### Anasayfa artık casino sayfası + sitewide yeşil tema + gerçek casino içerik sağlayıcısı kataloğu
Kullanıcının onayladığı bir statik referans tasarıma (üç sütunlu casino
dashboard) göre anasayfa yeniden yapıldı. Bu kart, önceki "Anasayfa görsel
yenileme" pilotunun (aşağıda) yerini alıyor — hero/sidebar/sağ ray yapısı
korundu, içerik ve renk sistemi baştan ele alındı.

**Eklendi:**
- **Sitewide yeşil tema** — `server/src/theme/registry.js`'teki gerçek
  varsayılan renkler (`--color-primary`/`--color-primary-dark`/
  `--color-accent`) cyan/mordan (#00d4ff/#7c3aed) yeşile (#63d629/#4fae20/
  #3a9e18) çevrildi; bu, admin panelinden hâlâ değiştirilebilen AYNI tema
  sistemi (A1/A2) — override yoksa görülen varsayılan artık yeşil.
  `styles/brand.js`'teki `BRAND_GRADIENT`/`BRAND_GLOW`/`BRAND_BORDER` gibi
  sabitler sabit hex yerine `var(--color-primary)`/`color-mix` kullanacak
  şekilde yeniden yazıldı — daha önce admin tema değişikliğine hiç tepki
  vermiyorlardı (sabit cyan/mor hex'ti), artık gerçekten tema-duyarlı.
- **Navbar yeniden düzenlendi** — sıra Casino/Spor Bahisleri/Canlı Bahis/
  Kampanyalar oldu (Casino ilk sırada + `/` üzerinde de aktif görünüyor,
  çünkü anasayfa artık casino sayfası), ayrı bir "Kayıt Ol" butonu eklendi
  (`/login?tab=register`). Bakiye dropdown'u, admin linki, çıkış — hepsi
  aynen korundu, yalnızca sabit cyan/mor hex'ler tema değişkenlerine çevrildi.
- **Gerçek, lisanslı casino içerik sağlayıcısı kataloğu** — "Popüler Oyunlar", "Slot Oyunları",
  "Yeni Oyunlar" satırları artık `POST /api/palace/games` ile CANLI çekilen
  gerçek oyun verisi kullanıyor (Pragmatic Play + Spribe). Hiçbir oyun adı/
  görseli kod içine gömülmedi — hepsi casino içerik sağlayıcısının kendi CDN'inden geliyor.
  Bu bilinçli bir tercih: proje daha önce (T5 varlık denetimi) tam olarak
  bu yüzden lisanssız Pragmatic Play/BGaming verisini silmişti; bu kez
  veri gerçekten bizim lisanslı aggregator kontratımızdan (T3) geliyor.
- **HomeSidebar** yeniden yazıldı: konteyner arka planı (referanstaki gibi
  çerçeveli), Ana Sayfa/Favoriler/Son Oynananlar (son ikisi "Yakında"
  rozetiyle, henüz gerçek özellik değil — kullanıcı kararıyla bu turun
  kapsamı dışında), Kategoriler (aynı sayfadaki bölümlere kaydırma) ve
  Hızlı Erişim (Profil/Bahislerim/Yardım Merkezi/Ayarlar, gerçek route'lar).
- "Özel Oyunlar" satırı artık gerçekten "özel" olanı gösteriyor: 13 in-house
  oyunumuz — önceki turda buraya Aviator gibi 3. parti oyunlar da karışmıştı,
  şimdi dürüst bir ayrım var (in-house = Özel Oyunlar, casino içerik sağlayıcısı = Popüler/
  Slot/Yeni).
- "Tüm Oyunlar" tek bir CTA kartı olarak `/casino`'ya (gerçek tam katalog
  sayfası) yönlendiriyor — aynı casino içerik sağlayıcısı oyunlarını 4. kez tekrar etmek yerine.

**Kaldırıldı:**
- Hero altındaki eski "Hızlı Kategori Şeridi", Spor Bahisleri/Canlı Bahis
  öne-çıkan-maç bölümleri, "Neden Biz?" ve alt CTA bandı anasayfadan
  kaldırıldı — anasayfa artık casino'ya odaklı, spor bahis içeriği kendi
  sayfalarında (`/bahis`, `/canli`) kalmaya devam ediyor.

**Bilinen sınır:**
- Admin panelindeki A4 bölüm sırası/görünürlük ayarı (`sportsBets`,
  `liveBets`, `features`, `bottomCta` id'leri) artık homepage'de karşılığı
  olmayan seçenekler içeriyor — o id'leri aç/kapat yapmanın artık hiçbir
  görsel etkisi yok. Ayrı bir işte A4 admin ekranının bu yeni yapıya göre
  güncellenmesi gerekiyor.
- Kazananlar paneli (sağ ray) yalnızca gerçek kazanan verisi varsa görünür
  — geliştirme ortamında bu veri boşsa panel hiç render olmuyor (bilinçli,
  var olmayan veriyle dolu göstermiyoruz).
- casino içerik sağlayıcısı kataloğu yalnızca Pragmatic Play + Spribe'tan çekiliyor (2/21
  sağlayıcı) — daha fazla çeşitlilik istenirse `PALACE_PROVIDER_IDS`
  genişletilebilir.

#### Anasayfa görsel yenileme (pilot)
Anasayfanın görsel dili baştan ele alındı — amaç, endüstri genelinde
tanınan casino/betting görsel diline (koyu zemin + altın vurgu, gerçek
fotoğraf, provably-fair rozetleri) geçmek ve mevcut "AI-jenerik" izlenimi
(emoji ikon, düz gradient kart, tek tip Inter tipografi) kırmak. Kapsam
bilinçli olarak yalnızca `HomePage.jsx` ile sınırlı tutuldu — diğer
sayfalar bu turun dışında; beğenilirse aynı dil yayılacak.

**Eklendi:**
- `Anton` (başlık) + `Manrope` (rozet/etiket) Google Fonts — mevcut
  gövde fontu (Inter) değişmedi, yalnızca yeni bölümlerde kullanıldı.
- Material Symbols Outlined ikon seti aktif edildi — `index.html`'de
  önceden bağlıydı ama hiç kullanılmıyordu (`.material-symbols-outlined`
  CSS sınıfı hiç tanımlanmamıştı, ligature glifleri düz metin olarak
  render oluyordu); `index.css`'e eksik sınıf eklenip emoji ikonlar
  (⚽🔴🎰💎 vb.) bu setle değiştirildi.
- Güven rozeti şeridi (Lisanslı & Güvenli / Provably Fair / Anlık Çekim /
  7/24 Destek) hero altına eklendi — endüstri standardı bir kalıp.
- İki yeni görsel `image-gen` skill'i ile (Cloudflare Workers AI,
  FLUX.1-schnell) üretildi: `cta-bg-v2.png` (VIP elmas kupa sahnesi,
  alt çağrı bandı) ve `features-texture.png` (altın damarlı mermer
  doku, "Neden Biz?" bölümü arka planı).
- `tailwind.config.js`'e `gold` renk paleti ve `font-display`/`font-ui`
  aileleri eklendi.
- **İkinci iterasyon** — gerçek rakip sitelerinde (OddsSource7502, Exonbet291;
  1xbet güvenlik kısıtlamasıyla engellendi) yapılan tarayıcı incelemesi
  sonrası üç endüstri-standardı kalıp eklendi: (1) `RecentWinnersTicker`
  ince metin şeridinden yatay kaydırılan **kazanan kartlarına** çevrildi
  (oyun görseli + maskelenmiş kullanıcı adı — "ad***n" kalıbı, salt
  görüntü amaçlı; backend hâlâ gerçek username yayınlıyor + tutar), (2)
  fotoğraflı Quick Nav kartları yerine **ikon-öncelikli kategori şeridi**
  (Bahis/Canlı/Casino/Kampanyalar/Yardım Merkezi) eklendi, (3) oyun
  kartları 4:3 yatay yerine **3:4 dikey (box-art) formata** çevrildi,
  köşeye "VIP90.bet Original" rozeti eklendi (3. parti sağlayıcı logosu
  yerine).
- **Üçüncü iterasyon** — kullanıcının verdiği somut bir referans tasarıma
  (üç sütunlu casino dashboard mizanpajı) göre pixel-seviyesinde yeniden
  yapıldı: sol kategori/hesap navigasyonu (`HomeSidebar.jsx`, yalnızca
  anasayfada — yalnızca gerçekten var olan route'lara bağlı, referanstaki
  "Favoriler/Jackpot/Turnuvalar/Sadakat Programı" gibi bizde karşılığı
  olmayan sayfalar eklenmedi) ve sağ rayda `WinnersPanel`/`PromoPanel`
  (aynı gerçek veriyi paylaşan yeni `useRecentWinners` hook'u) eklendi.
  Renk paleti referansa uyacak şekilde yeşil/koyu-antrasite bir homepage-
  özel palete (`pages/home/homeTheme.js`) çevrildi — sitenin geri kalanının
  cyan/purple marka rengine dokunulmadı. Başlıklar `Anton` yerine
  `Manrope` kalın ağırlık kullanıyor (referans tipografisi condensed değil,
  standart kalın sans). Referansta olup bizde karşılığı olmayan "Canlı
  Casino" (masa/krupiye) satırı ve "10.000+ Oyun/50.000+ Kullanıcı/%98
  Memnuniyet" gibi doğrulanamayan rakamlar bilerek kopyalanmadı; ödeme
  logoları da yalnızca gerçekten desteklenenlerle (Havale/EFT, Kripto/USDT)
  sınırlı tutuldu.

**Değişti:**
- Hero slider ve Quick Nav kartlarındaki fotoğraflar artık **görünür**:
  önceki üç kat üst üste karartma gradyanı (+ Quick Nav kartlarında
  %6-%12 opaklık) fotoğrafları neredeyse tamamen gizliyordu — mevcut
  görsellerin (hero-sports/live/casino, 13 oyun görseli) kalitesi zaten
  yüksekti, sorun sadece CSS katmanlamasıydı. Tek yönlü, daha ince bir
  karartma ile değiştirildi.
- `cta-bg.png` yerine `cta-bg-v2.png` kullanılıyor — eskisinde arka
  plandaki tabelalarda AI görsellerinin klasik hatası olan anlamsız
  sahte yazılar vardı ("CARACAR", "CALSIN"), yenisinde okunaklı/sahte
  metin yok.
- Oyun grid'i mobilde `grid-cols-3`'ten `grid-cols-2`'ye düşürüldü —
  12 oyun 3 sütunda dar ekranlarda aşırı sıkışıyordu.
- Material Symbols Google Fonts bağlantısına `&display=block` eklendi —
  önceki (varsayılan `swap`) davranışta, font yüklenene kadar ikon
  yerine düz İngilizce ligature metni ("sports_soccer", "shield" vb.)
  bir an görünüyordu; `block` bu aralıkta ikonu boş bırakıyor, metni
  hiç göstermiyor.
- Hero altındaki ikon-öncelikli hızlı kategori şeridi (Bahis/Canlı/
  Casino/Kampanyalar/Yardım Merkezi) kaldırıldı — bu bilgi artık sol
  sidebar'da zaten var, anasayfada tekrar oluyordu.

**Bilinen sınır:** `resize_window` aracı bu tarayıcı otomasyonu ortamında
gerçek viewport'u değiştirmiyor (`window.innerWidth` sabit kalıyor) —
mobil doğrulama bu yüzden sayfa içine 390px'lik bir `<iframe>` enjekte
edilerek yapıldı (iframe'in kendi rendering viewport'u var, media query'ler
doğru tetikleniyor). Bu yöntemle hero/istatistik şeridi/oyun kartları/
sidebar-gizleme davranışı görsel olarak doğrulandı; yine de gerçek
cihaz/DevTools ile bir kontrol faydalı olur.

#### P1/P2 — Sohbet + bahşiş aktif edildi
`services/chat.js` (oda/mesaj/moderasyon/bahşiş/yağmur iş mantığı) büyük
ölçüde daha önceki bir fazda yazılmıştı ama hiçbir route/controller katmanı
mount edilmemişti, hiç sohbet odası oluşturulmamıştı ve client'ta hiçbir
arayüz yoktu — yani kod tamamen orphan durumdaydı. Entegrasyon sırasında bu
kodun **hiç çalışır durumda olmadığı** ortaya çıktı; TDD ile (önce test,
sonra düzeltme) art arda 4 gerçek hata bulundu.

**Eklendi:**
- `GET /api/chat/rooms`, `GET /api/chat/rooms/:slug/messages` (herkese
  açık) + admin uçları (oda oluştur/güncelle/sil, kullanıcı yasakla/
  sustur, mesaj sil) — hepsi `auditLog` ile denetleniyor.
- `client/src/services/chatSocket.js` — `/chat` namespace'ine JWT-token
  auth ile bağlanan, `connect_error` üzerinde token yenileme deneyen
  socket istemcisi (`games/Crash.jsx`'teki `/crash` deseni takip edilerek).
- Global sohbet widget'ı (mesajlaşma paneli, kullanıcı rozetleri, bahşiş
  butonu), bahşiş modalı ve yağmur bildirimi — arayüz markup'ı `opencode`
  (model: `opencode/x-preview-f-free`) ile üretildi, socket/state/API
  entegrasyonu elle yazıldı.
- Sunucu açılışında "Genel Sohbet" odası idempotent olarak tohumlanıyor
  (`initDefaultChatRoom`).
- `server/test/chatService.test.js` — 13 test (regresyon + mutlu yol),
  aşağıdaki 4 hatayı da kanıtlayan/doğrulayan testler içeriyor.

**Düzeltildi:**
- `/chat` namespace auth middleware'i `const jwt = require('jsonwebtoken')`
  kullanıyordu — proje ESM (`"type":"module"`) olduğu için bu satır HER
  bağlantıda `ReferenceError` fırlatıyordu, yani sohbete kimse hiçbir
  zaman bağlanamıyordu. ESM `import`'a çevrildi.
- `sendTip` ve `createRain`'deki bakiye güncellemeleri oku-değiştir-yaz
  (`findById` + `.save`) deseni kullanıyordu, eşzamanlı isteklerde çifte
  düşüş/artış riski taşıyordu. Atomic `findOneAndUpdate` (`$gte`+`$inc`)
  desenine çevrildi.
- `createRain`, `ChatRain.create([{...}], {session})` çağrısının
  Mongoose'da HER ZAMAN array döndürdüğü gerçeğini gözden kaçırmıştı
  (`rain.recipients.push(...)`, `rain.save` gibi tekil-obje kullanımları
  `Cannot read properties of undefined` ile patlıyordu) — array destructure
  edilerek düzeltildi.
- `sendTip`, `fromUserId.equals(toUserId)` çağırıyordu; `fromUserId` JWT'den
  gelen düz bir string olduğu için (Mongoose ObjectId değil) bu her zaman
  `TypeError` fırlatıyordu. `String(fromUserId) === String(toUserId)`
  karşılaştırmasına çevrildi.
- `Transaction.type` enum'ında `tip_sent`, `tip_received`, `rain`
  değerleri hiç yoktu — bu üç düzeltme yapılmadan önce bahşiş/yağmur
  işlemleri `Transaction.create` çağrısında her zaman `ValidationError`
  ile patlıyordu (yukarıdaki bug'lardan bağımsız, ayrı bir kırık nokta).
  Enum'a eklendi.

**Bilinen sınır:** Navbar'daki bakiye, bahşiş/yağmur sonrası anlık olarak
(canlı `balance:update` push'uyla) güncellenmiyor — sayfa yenilenince veya
yeniden login olunca doğru bakiye görünüyor, DB her zaman doğru. Kök neden
`authStore.js`'in mevcut (bu fazda dokunulmayan) `subscribe:user` socket
akışında; ayrı bir iş kalemi olarak bırakıldı.

#### D5 — Yardım Merkezi (ticket) sistemi aktif edildi
Backend zaten tam yazılmıştı (`models/Ticket.js`, `services/ticket.js`,
`routes/ticket.js`, `/api/tickets` mount edilmişti) ama hiçbir client
sayfası yoktu ve footer'daki "Yardım Merkezi" linki yanlış yere
(`/status`, sistem durumu sayfası) gidiyordu — ticket API'si tamamen
kullanılmayan (orphan) kod hâlindeydi.

**Eklendi:**
- Oyuncu tarafı: `/help` sayfası — talep listesi, "Yeni Talep" formu,
  talep detay/mesajlaşma paneli.
- Admin tarafı: `/admin/tickets` sayfası — durum filtreli liste, detay
  paneli, yanıt kutusu, durum değiştirme; Dashboard'a açık talep
  sayaçlı kısayol kartı.
- `services/ticket.js`'e bildirim entegrasyonu (KYC deseni takip edilerek):
  yeni talep açıldığında adminlere socket bildirimi, admin yanıtladığında
  oyuncuya socket bildirimi + e-posta.
- `socket/handler.js`'e `subscribe:admin` event'i — **önceden hiçbir socket
  `role:admin` odasına katılmıyordu**, bu yüzden `services/kyc.js`'teki
  `io.to('role:admin').emit('kyc:new_submission', ...)` çağrısı da fiilen
  hiç kimseye ulaşmıyordu; bu düzeltme KYC bildirimini de çalışır hâle
  getiriyor. Katılım DB'den `role==='admin'` doğrulamasıyla yapılıyor
  (client'ın kendi beyanına güvenilmiyor).
- Admin ticket yanıt/durum değişikliği işlemleri artık `auditLog` ile
  denetleniyor.

**Değişti:**
- Footer'daki "Yardım Merkezi" linki `/status`'tan `/help`'e düzeltildi.

Canlı önizleme sunucusunda uçtan uca doğrulandı: oyuncu talep açtı, admin
yanıtladı (durum open→in_progress otomatik geçti), admin durumu "Çözüldü"
yaptı, oyuncu tekrar yazınca durum otomatik "Açık"a döndü.

#### SF — Footer/statik sayfa yönetimi (Hakkımızda, Kariyer, Basın, İletişim, Yasal, Sorumlu Oyun)
Hakkımızda/Kariyer/Basın/İletişim footer linkleri daha önce tamamen ölüydü
(`href:'#'`, hiçbir sayfa yoktu); Yasal ve Sorumlu Oyun sayfalarının içeriği
ise `client/src/data/legalContent.js`'e sabit kodlanmıştı, değiştirmek kod
değişikliği gerektiriyordu.

**Eklendi:**
- Yeni `StaticPage` modeli + admin CRUD (`GET/PUT /admin/static-pages/:slug`,
  `PATCH .../toggle`) — 11 sayfa (4 yeni kurumsal + 7 mevcut yasal/sorumlu
  oyun) artık admin panelinden ("Statik Sayfalar") başlık/giriş/bölüm
  metinleriyle düzenlenebiliyor ve tek tıkla açılıp kapatılabiliyor. Kapalı
  bir sayfa footer'dan gizlenir, doğrudan URL'e gidilirse boş-durum
  gösterilir.
- Yeni herkese açık `GET /api/static-pages` (footer listesi) ve
  `GET /api/static-pages/:slug` uçları.
- 4 yeni kurumsal sayfa: `/about`, `/career`, `/press`, `/contact`
  (placeholder içerikle, admin panelinden doldurulur).
- Footer'daki marka adı artık admin panelindeki Marka Kimliği (A3)
  ayarından geliyor — site adı değiştirildiğinde footer'daki isim ve
  copyright metni otomatik güncelleniyor.

**Değişti:**
- 7 yasal sayfa (`/legal/terms`, `/legal/privacy`, `/legal/kvkk`,
  `/legal/cookies`, `/legal/bonus-terms`, `/legal/responsible-gaming`,
  `/legal/user-agreement`) artık içeriğini `legalContent.js`'teki sabit
  metin yerine yeni `StaticPage` koleksiyonundan çekiyor. **URL'ler
  değişmedi**, mevcut linkler/SEO etkilenmiyor. "Kullanıcı Sözleşmesi"
  daha önce footer'a hiç eklenmemişti (yalnızca sidebar'da vardı) — artık
  footer'da da görünüyor.

**Kırılan Değişiklikler:**
- Bonus/kullanım koşulları metnindeki iki madde (`legalContent.js`'teki
  `formatMoney` çağrıları) artık aktif para birimine göre otomatik
  hesaplanmıyor — Mongo'da fonksiyon saklanamadığı için migrasyonda o anki
  TRY değeriyle ("₺50,00", "₺100,00") düz metne dönüştürüldü. Admin
  panelinden düzenlenebilir ama para birimi değişince kendiliğinden
  güncellenmez; operatör para birimini değiştirirse bu iki metni elle
  düzeltmesi gerekir.

#### T4/T5 — Takip: kullanıcıya görünen marka izi ve ölü betikler (kısmi)
Dev server önizlemesi sırasında `server/src/data/oddsSource-domain.json`'ın
(OddsSource'in Türkiye'de engellenen ayna domain'lerini DNS/HTTP ile keşfeden
canlı bir mekanizmanın önbelleği olduğu) sorgulanmasıyla ortaya çıktı: T4'ün
orijinal kabul kriteri ("hiçbir üçüncü taraf marka adı geçmiyor") yalnızca
kısmen karşılanmıştı — bu maddeyle şu güvenli/kullanıcıya-görünen kısım
kapatıldı:
- `/status` sayfasındaki `status.component.oddsSource.desc` sözlük değerinden
  ("OddsSource — canlı oran ve maç verisi") marka adı çıkarıldı, jenerik hâle
  getirildi (`tr.js`, `en.js`). Anahtar adı (`oddsSource`) dahili tanımlayıcı
  olduğu için kullanıcıya görünmüyor, değiştirilmedi.
- `server/scripts/oddsSource.har` (30 MB ölü HAR yakalaması) ve
  `server/scripts/fetch-oddsSource-games.js` (hedefi zaten T4'te silinmiş ölü
  betik) kaldırıldı.

**Bu kart hâlâ `done` değil, kasıtlı olarak.** İnceleme sırasında yeni bir
bulgu ortaya çıktı: `ODDS_PROVIDER` ayarı canlı/fikstür senkronizasyon
job'larının hangisinin çalışacağını seçmiyor — `server.js`,
`startOddsSourceLiveSync`/`startOddsSourceUpcomingSync`'i bu ayardan bağımsız,
koşulsuz başlatıyor; bu job'lar her zaman OddsSource'in ayna domain'ini
keşfedip WebSocket'le bağlanıyor. `ODDS_PROVIDER=theoddsapi` yapmak yalnızca
ayrıştırma mantığını etkiliyor, bu trafiği durdurmuyor. Gerçek bir sağlayıcı
değişimi (theoddsapi için yeni bir senkronizasyon job'ı + `server.js`'te
provider'a göre gate) canlı bahis motorunun kalbine dokunan ayrı, büyük ve
riskli bir mühendislik kartı gerektiriyor — bilinçli olarak bu oturumun
kapsamı dışında bırakıldı (bkz. `server/.env.example` ve
`docs/product/02-yapilandirma.md`'deki yeni uyarı notları).

#### T4/T5 — Tamamlama: OddsSource/BGaming demo oyun vitrini tamamen kaldırıldı
Aşağıdaki T4 (kısmi) ve T5 kritik bulgu maddelerini kapatır. casino içerik sağlayıcısı
casino entegrasyonu (T3) pazara sürülecek üründen çıkarıldığı için,
casino içerik sağlayıcısınınn önceki dönemde deneme amaçlı kurulmuş bu vitrin sistemi
artık hiçbir işlevsel amaca hizmet etmiyordu (OddsSource sadece spor bahis
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
  streamService.js` — OddsSource/BGaming oyun sayfalarını canlı proxy'leyip
  CDP screencast ile yayınlayan sunucu-taraflı tarayıcı otomasyonu.
- `server/data/oddsSource-games.json` (3,2 MB) — OddsSource oyun kataloğu.
- `server/src/routes/casino.js`: `/game/:gameId`, `/relay`, `/cdn/*`,
  `/launcher-proxy/*`, `/logo-stub.js`, `/oddsSource-game/:id`,
  `/oddsSource-games`, `/oddsSource-launch`, `/swintt-proxy`,
  `/broken-games`, `/broken-game` — hepsi yalnızca kaldırılan vitrin
  tarafından kullanılıyordu. `POST /api/casino/spin` (in-house oyun
  bakiye güncellemesi) korundu, `useSlotGame.js` hâlâ bağımlı.

**Kırılan Değişiklikler:**
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

#### T5 — Varlık lisans denetimi
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

#### T4 — Ölü veri ve dosya temizliği (kısmi)
- Silindi: `server/src/data/oddsSource-events.js` (1.110.619 satır),
  `server/src/data/rakipsite-events.js` (1.798 satır), `server/src/
  utils/sportdigi.js` (36 satır, kullanılmayan), `server/src/backups/
  oddsSourceService.js.bak`, `server/src/backups/casino.js.bak`. Hiçbiri
  hiçbir yerden import edilmiyordu — sıfır işlevsel etki, suite 288/288
  değişmedi. Toplam 1.114.475 satır repo'dan çıktı.
- **Bu kart `done` değil, kasıtlı olarak.** Kabul kriteri ("hiçbir
  üçüncü taraf marka adı geçmiyor") beklenenden çok daha büyük bir
  kapsam ortaya çıkardı: OddsSource yalnızca bahis oranı kaynağı değil,
  `services/oddsSourceService.js` + `services/streamService.js` üzerinden
  **ayrı bir casino oyun akışı sağlayıcısı** olarak da gömülü — bu iki
  ayrı sistemin (odds senkronizasyon motoru + casino akışı) sökülmesi
  gerekiyor. Yarım bırakılmış bir çıkarma, çalışan bir sistemi
  kırma riski taşıdığı için burada durduruldu; kalan iş için önerilen
  takip kartları kullanıcıya iletildi (bkz. sohbet geçmişi).

#### T2 — Lisanslı feed sağlayıcısı, ilk gerçek adaptör
- `services/oddsProviders/theOddsApiProvider.js`: The Odds API adaptörü,
  T1'deki OddsSource adaptörüyle aynı sözleşmeye (NormalizedEvent) uyuyor.
  Sağlayıcı canlı/yaklaşan ayrımını ayrı uçlarla vermediği için
  `commence_time`'a göre sınıflandırma yapılıyor (basitleştirilmiş
  sezgisel — kesin dakika-bazlı canlı skor bu sağlayıcıdan gelmiyor,
  OddsSource'in nodeupd akışının aksine).
- `oddsProviders/index.js`: kayıt defterine eklendi.
  `ODDS_PROVIDER=theoddsapi` ile aktif hale geliyor — kaynağı
  değiştirmek env değiştirmekten ibaret, sync job'ı hiç değişmiyor
  (T1'in kurduğu ayrışmanın kanıtı).
- `ODDS_API_KEY` artık gerçekten kullanılıyor — önceki sürümde
  "kullanılmayan kalıntı" olarak işaretlenmişti, docs/product/
  02-yapilandirma.md düzeltildi.

TDD: 9 yeni test, tamamı önce kırmızı. Suite 288/288. (T2)

#### Akış K — Kurulum ve dağıtım (K1–K4)
- **K2 — Web kurulum sihirbazı** (`installer/`, `POST /install`): terminal
  açmadan site adı, para birimi ve ilk yönetici hesabı kurulur; sihirbaz
  üretilen `.env` içeriğini kopyala-yapıştır olarak gösterir. Client
  build'siz de çalışır (bağımlılıksız statik HTML). Varsayılan parolayla
  admin hesabı açılmaz.
- **K4 — Migration koşucusu** (`server/migrations/`, `runner.js`): D9'un
  bıraktığı `applyMigration({version, manifest})` enjeksiyon noktasına
  bağlanır; semver-sıralı ve idempotent çalışır, patlayan migration
  işaretlenmez — retry kaldığı yerden devam eder.
- **K3 — Sağlık kontrolü ve ilk çalıştırma tohumlaması** (`server/src/
  health/`): `checks.js` Docker healthcheck/izleme ile uyumlu 0/1 çıkış
  kodu döner; `seed.js` idempotent — mevcut ayarların üzerine yazmaz.
- `docker-compose.yml` + `deploy/Caddyfile` + `.env.docker.example`
  (K1): sabit `tls internal` kullanmaz — Caddy varsayılanı
  gerçek domainde Let's Encrypt, localhost'ta self-signed sertifika verir.
  Mongo ve uygulama dış dünyaya port açmaz.

#### Akış M — Modül ve lisans altyapısı (M1–M4)
- **M2 — Abonelik doğrulama servisi** (`services/licensing/`): çevrimdışı
  toleranslı lisans deposu. `modules/`'tan bilinçli olarak farklı fail
  yönü — modül kayıt defteri DB'ye erişemeyince fail-CLOSED (hepsi
  kapalı) davranırken, licensing merkez sunucuya erişemeyince son bilinen
  geçerli durumu `graceMs` (varsayılan 72 saniye) kadar korur.
  `LICENSE_SERVER_URL` tanımlı değilse tanımlı modüller geçerli sayılır
  (kutudan çalışan ürün) — merkezi zorlama yalnızca bir lisans sunucusuna
  bağlanınca devreye girer.
- **M3 — Admin modül ekranı** (`GET/PATCH /admin/modules`,
  `POST /admin/modules/refresh`): aktivasyon durumu + lisans bilgisi
  birleşik listelenir, panelden aç/kapa ve önbellek tazeleme yapılır.
  Kendi router'ı olarak mount edilir, `routes/admin.js`'e dokunmaz.
- **M4 — Modül kapalıyken zarif bozulma**: kapalı modüle bağlı API
  route'ları artık 404 üretmiyor, anlamlı `503
  { error: { code: 'MODULE_DISABLED', module } }` (no-store) dönüyor.
  İstemcide `<ModuleGate>` nazik bir bilgilendirme gösterir, `BottomNav`
  ilgili sekmeyi gizler. "Kullanılabilir" = panel anahtarı açık VE lisans
  geçerli (çift kapı). `/api/events` + `/api/bets` → betting modülü,
  `/api/casino` → casino-content modülü kapsamında; `/api/inhouse`
  çekirdek platform olduğu için hiçbir zaman gate'lenmez.

#### Akış U — Çeviri, para birimi ve biçimlendirme (U2–U5)
- **U2 — Tam çeviri taşıması**: platformdaki tüm sayfa ve bileşenlerdeki
  sabit Türkçe metinler `t('...')` anahtarlarına taşındı (oyun sayfaları,
  admin paneli, profil, bahis kuponu, vb.) — eksik sözlük anahtarı
  denetimiyle doğrulanmış.
- **U3 — İngilizce sözlük kalite geçişi**: `en.js`/`tr.js` tam okundu,
  gerçek yinelenen-anahtar hataları (ör. `profile.bonus` çakışması,
  `profile.*` bloğunun iki kez tanımlanması) düzeltildi.
- **U4 — Para birimi soyutlaması** (`server/src/currency/`,
  `client/src/utils/money.js`): sabit `₺` sembolü kod tabanından
  kaldırıldı, yerine `formatMoney` (Intl.NumberFormat tabanlı, aktif
  para birimini `Setting` koleksiyonundaki `currency.code` anahtarından
  okur) geçti. `GET /api/currency` herkese açık uçtan istemci aktif para
  birimini öğrenir.
- **U5 — Tarih, saat dilimi ve sayı biçimlendirme**
  (`i18n/useFormatters.jsx`, `services/timezone.js`): operatör saat
  dilimi ayarı (`general.timezone` Setting anahtarı, varsayılan
  `Europe/Istanbul`, IANA doğrulamalı) + `Intl`-tabanlı `formatDate`/
  `formatTime`/`formatDateTime`/`formatNumber`. `GET /api/locale-config`
  ile istemci render'da operatör bölgesine çevirir; geçersiz tarih/sayı
  `'—'` döner, throw etmez. 12 dosyadaki ham `toLocaleDateString/
  TimeString` kullanımları ve hardcoded `'tr-TR'` locale'i temizlendi.

**Kırılan Değişiklikler:**
- Kapalı bir modüle (`betting` veya `casino-content`) bağlı API uçları
  artık 404 yerine `503 { error: { code: 'MODULE_DISABLED' } }` döner —
  bu uçları doğrudan tüketen entegrasyonlar 404 kontrolü yapıyorsa
  güncellenmeli.
- `₺` sembolü artık kod içinde sabit değil; para birimi operatör
  panelinden (`currency.code` Setting anahtarı) değiştirilebilir.
  Varsayılan hâlâ TRY, davranış değişmez, ancak sabit metin arayan
  entegrasyon/test varsa `formatMoney` çıktısına göre güncellenmeli.

#### V1 — Demo ortamı ve sınırlı demo yöneticisi
- `demo/seedCore.js`: `demo_admin` (role=admin + `isDemoAdmin` bayrağı),
  3 demo oyuncu, örnek etkinlik ile bahis/casino geçmişi — tümü açıkça
  sahte (`demo_` öneki, `@demo.local`). İdempotent, ikinci koşuda hiçbir
  varlık çoğalmaz.
- `middleware/demoAdmin.js`: demo yönetici hesabı yıkıcı işlemler
  (kullanıcı silme, bakiye değiştirme, etkinlik sonuçlandırma) yapamaz —
  403 `DEMO_ADMIN_READONLY`. Bayrak her istekte DB'den taze okunur, yeni
  bir rol değeri eklemez.
- `GET /api/demo/showcase`: her vitrin kalemini bağlı modülün lisans
  durumuna (M4'ün `isModuleUsable` çift kapısı) göre `requiresModule`
  bayrağıyla döner — kapalı/lisanssız modül rozetle işaretlenir, asla
  500 dönmez.

#### V4 — Satış sitesi (sales-site/)
- Ayrı, sade Vite+React uygulaması (`sales-site/`): İngilizce pazarlama
  sayfası — hero, kutu içeriği, modül listesi, "dahil olmayanlar"
  bölümü, SSS. Tüm içerik `docs/product/*.md` kaynaklı.
- Sepet + checkout formu **TEST MODU**: gerçek ödeme entegrasyonu ve
  gerçek anahtar yok (`.env.example`'da `PAYMENT_PROVIDER_KEY=sk_test_...`
  placeholder'ı). Fiyat alanı katalogda `price:null`; arayüz her yerde
  "[FİYAT — insan onayı bekliyor]" gösterir, sepet null fiyatta toplam
  üretmez.

#### D2 — Video kütüphanesi storyboard'ları (kısmi)
- `docs/product/07-video-storyboardlari.md`: 18 video için sahne-sahne
  storyboard (ekran + anlatım + süre), D2'nin istediği 15-20 aralığında.
  Yalnızca bugün var olan özellikler storyboard'landı; K2/M2/M3/O6/D5-
  istemci'ye bağlı videolar açıkça "bekliyor" işaretlendi.
- **Bu kart `done` değil, kasıtlı olarak.** Kabul kriteri ("her ana
  akışın bir videosu var, ürün sayfasına gömülü") gerçek video dosyası
  ve embed gerektiriyor — bunları üretecek yetenek (kayıt/kurgu) bu
  oturumda yok. Storyboard'lar, geliştirme sürecinin sonunda
  araştırılacak bir video üretim aracının üzerine kurulacağı temel.

#### D3 — Ürüne hakim chatbot
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

#### D5 — Oyuncu yardım masası / ticket sistemi
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
  test veritabanı kullanır ve after'da güvenle dropDatabase+
  disconnect çağırır — Akış B'de tespit edilen paylaşımlı-DB
  izolasyon sorununun önlenmiş hali. Ayrıca disconnect olmadan
  mongoose bağlantısının process'i sonsuza kadar canlı tuttuğu bir
  hata bu kartta bulunup düzeltildi.

TDD: 13 yeni test, tamamı önce kırmızı. Suite 265/265. (D5)

**Eklendi:**
- Odds sağlayıcı kayıt defteri ve kontratı (`services/oddsProviders/registry.js`):
  sync katmanının tek bir bahis sitesine doğrudan bağımlılığını sökmenin ilk adımı.
  `ODDS_PROVIDER` env'inden aktif sağlayıcı seçimi, çift kayıt ve bilinmeyen
  sağlayıcı reddi. (T1)
- OddsSource odds adaptörü (`services/oddsProviders/oddsSourceProvider.js`): mevcut
  OddsSource bağlantısını kontratın arkasına alır, ham veriyi normalize etkinliğe
  çevirir. Ağ erişimi enjekte edilebilir — testler ağa çıkmaz. Bozuk satırları
  atlar, batch'i öldürmez. (T1)
- LiveSync job'ı odds sağlayıcı kontratına bağlandı
  (`jobs/oddsSourceLiveSync.js`): `/livemenu/left/` parse'ı ve normalizasyon
  `oddsSourceProvider`'a taşındı, job artık kaynağı `getActiveOddsProvider`
  üzerinden çözüyor. Kaynağı değiştirmek job'ı düzenlemeyi değil,
  `ODDS_PROVIDER` env'ini değiştirmeyi gerektiriyor. DB eşleme, canlı oran
  çekme (`/live/{eid}/`) ve WebSocket orkestrasyonu job'da kaldı — oran
  teslim mekanizması T2'de (lisanslı feed) soyutlanacak. (T1 — hakkıyla
  tamamlandı: sağlayıcı artık üretimde de değiştirilebilir, yalnızca test
  kontratında değil)
- Sağlayıcı-bağımsız normalize etkinlik sözleşmesi
  (`services/oddsProviders/normalizedEvent.js`): tüm sağlayıcıların hedefleyeceği
  ortak etkinlik/oran biçimi. (T1)

#### T3 — Casino aggregator kontratı
- casino içerik sağlayıcısı bağlantısı genel aggregator kontratının arkasına alındı
  (`services/casinoAggregators/`): kayıt defteri + kontrat (oyun kataloğu,
  oyun URL'i, kullanıcı/bakiye, callback doğrulama, health check) +
  `palaceAdapter.js` (mevcut palaceCasinoService'i saran passthrough,
  DI ile ağa çıkmadan test edilebilir) + bootstrap (`CASINO_AGGREGATOR`
  env seçimi, varsayılan palace).
- `routes/palace.js` artık `palaceCasinoService`'i doğrudan değil,
  `getActiveCasinoAggregator` üzerinden çözüyor — ikinci bir aggregator
  eklemek yeni bir adaptör kaydetmekten ibaret, route dosyası değişmez.
- casino içerik sağlayıcısının özgü idari/raporlama uçları (bonus call, RTP, transactions,
  statistics) kontratın zorunlu parçası değil; enjekte edilen serviste
  varsa opsiyonel olarak taşınır. (T3)

#### M1 — Modül kayıt defteri
- `modules/registry.js`: üç satılabilir modülün (betting, casino-content,
  live-casino) tek doğruluk kaynağı. Çekirdek platform (13 in-house oyun)
  bilinçli olarak bir modül DEĞİL — her zaman açık. `services/settings.js`
  ile aynı DI deseni (`load`/`now`/`ttlMs` enjekte edilebilir, TTL cache).
  Fail-closed: DB okunamazsa tüm modüller kapalı sayılır.
- `modules/index.js`: üretim bağlantısı, mevcut `Setting` koleksiyonunu
  (`module.<id>.enabled` anahtarıyla) kullanır — yeni şema açmadan.
  `setModuleEnabled` admin panelinin (M3) üzerine ineceği yüzey. (M1)

#### U1 — i18n çekirdeği
- `client/src/i18n/core.js`: framework'ten bağımsız saf çeviri mantığı
  (arama, `{param}` interpolasyonu, fallback, anahtar doğrulama). Anahtar
  kuralı: nokta ayraçlı, en az iki segment, küçük harfle başlayan camelCase
  (`auth.username`). DOM/React olmadan test edilir.
- `I18nProvider.jsx` + `useTranslation`: React'e ince bir sargı,
  localStorage'da dil kalıcılığı; mantık tekrarlanmaz, çekirdeğe delege eder.
- `LanguageSwitcher.jsx`: sözleşmenin kanıtı — yalnızca `useTranslation`
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

#### A1 — Tema token sistemi
- `theme/registry.js`: renk/tipografi/köşe/gölge token'larının tek doğruluk
  kaynağı (`primary`, `primaryDark`, `accent`, `radiusMd`, `fontDisplay`).
  Varsayılanlar mevcut tasarımın gerçek değerleri — override yoksa görsel
  hiçbir şey değişmez. `modules/registry.js` ile aynı DI deseni, fail-safe
  (DB okunamazsa varsayılanlara düşer).
- `theme/index.js`: mevcut Setting koleksiyonu üzerinden üretim bağlantısı
  (`theme.<id>` anahtarı), `setThemeToken` admin ekranının (A2/A3)
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

#### D6 — Otonom bakım ajanı çekirdeği
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

#### D7 — Action-ID risk sınıflaması ve insan onay kapısı
- `agent/actionCatalog.js`: merkezi Action-ID kataloğu, her eylem `safe`/
  `destructive` olarak sınıflı. Kayıtsız eylem için risk sorgusu sessizce
  "safe" varsaymaz, hata fırlatır (fail-closed).
- `agent/approvalGate.js`: salt-okunur eylemler `propose` anında
  auto-approved; yıkıcı eylemler yalnızca temsilcinin açık `approve`
  çağrısıyla onaylanır (`reject` de var). Kayıtsız eylem için öneri
  hiç oluşmaz.
- **Sertleştirme** (ilk entegrasyon testi yazarken bulundu): kriptografik
  imza tek başına "onaylandı mı" sorusuna cevap vermiyordu — süreç
  atlanıp doğrudan imzalansa bile localAgent reddetmiyordu. Düzeltildi:
  `approvedBy` artık imza kapsamının içinde (`signature.js` canonical
  payload'a eklendi, kurcalanamaz), ve `localAgent.tick` yıkıcı eylemde
  bunu yapısal olarak zorunlu kılıyor (`missing-approval` reddi).
- **Fail-closed düzeltmesi:** lokal registry ile merkezi katalog iki ayrı
  doğruluk kaynağı ve ayrışabilir — lokalde kayıtlı ama katalogda tanımsız
  bir eylem artık `tick`'i çökertmiyor, `unclassified-risk` ile temiz
  reddediliyor.
- Uçtan uca entegrasyon testi: propose→gate→sign→lokal ajan zinciri hem
  salt-okunur hem yıkıcı yol için, onay atlanırsa reddi de dahil.

TDD: 27 yeni test, tamamı önce kırmızı. Suite 220/220. (D7)

#### D8 — Merkez WAF ve HSM-uyumlu imza sağlayıcı
- `agent/promptFirewall.js`: prompt-injection filtresi. D6'nın maskelemesi
  hangi ALANLARIN geçtiğini sınırlar, bu ise geçen alanların İÇERİĞİNİ
  tarar ("ignore previous instructions", sahte `system:`/`assistant:`
  rol işaretleyicileri vb.). Fail-closed: herhangi bir alan şüpheliyse
  TÜM payload reddedilir, kısmi temizlik yapılmaz.
- `services/support/index.js` → `createDiagnosticInbox`: müşteriden
  merkeze giden teşhis raporu kuyruğu, `submit` anında WAF'tan geçer —
  şüpheli veri kuyruğa hiç girmez (`size`/`next` ile ispatlı).
- `agent/signingProvider.js` + `signature.js` → `signCommandWithProvider`:
  imza sağlayıcı arayüzü (`{ sign(buffer): Promise<Buffer> }`). Bu commit
  yalnızca bellek-içi (dev/test) sağlayıcıyı içerir — **gerçek HSM/KMS
  entegrasyonu (donanım seçimi, provisioning, IAM, maliyet) bir operasyon
  kararıdır ve bilerek bu kod oturumunun kapsamı dışında bırakıldı.**
  Kurulan şey: çağıran kodun özel anahtarı hiç görmediği, gerçek bir
  HSM/KMS sağlayıcısının aynı sözleşmeyle (drop-in) takılabileceği arayüz.
  D6'nın `signCommand` (ham anahtar) fonksiyonu değişmeden duruyor.

TDD: 20 yeni test, tamamı önce kırmızı. Suite 240/240. (D8)

#### D9 — İmzalı güncelleme paketi
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

#### D1 — Yazılı dokümantasyon
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

## [0.35.0] — 2026-08-20

### Giriş yapmış kullanıcı misafir sayfalarını göremez
- **Güvenlik:** Oturum açıkken `/login`, `/forgot-password`, `/reset-password` ve ilgili API uçları kullanılamıyor; açık oturumla şifre sıfırlama başlatılamıyordu.

## [0.34.1] — 2026-08-20

### IBAN maskeleme
- **Değişti:** `GET /bank/info` IBAN ve hesap sahibini maskeli döner; maskeliyken kopyala butonu gizli. Gerçek değerler `BANK_IBAN` / `BANK_HOLDER` ile verilebilir.

## [0.34.0] — 2026-08-20

### Casino oyunları Türkçe açılıyor
- **Düzeltme:** Sağlayıcının dil tablosunda Türkçe karşılığı yoktu; oyunlar sessizce İngilizce açılıyordu.

## [0.33.1] — 2026-08-20

### www adresinden erişim ve senkron sağlık izleme
- **Düzeltme:** `CLIENT_URL`'de olmayan bir alan adından (ör. `www`) gelen istekler CORS'ta reddediliyordu.
- **Yeni:** Oran senkronu sağlık izleme: senkron durursa durum ucunda ve uyarı kanalında görünür.

## [0.33.0] — 2026-08-13

### Çalışma zamanı oturum dosyası depodan çıkarıldı
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.32.0] — 2026-08-13

### Dağıtım iş akışı
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.31.1] — 2026-08-13

### Profesyonel HTML e-posta şablonları
- **Yeni:** Doğrulama ve işlem e-postaları ortak, markalı bir HTML şablonla gönderiliyor.

## [0.31.0] — 2026-08-13

### Bahis sayfasında tembel yükleme ve tam market listesi
- **Performans:** Bahis sayfası spor → lig ağacını özet olarak yüklüyor, ligler açıldıkça maçları getiriyor; arama ve ülke/lig filtreleri.
- **Düzeltme:** Maçların market sayısı ve tam market listesi doğru; oran düzeltmeleri.

## [0.30.1] — 2026-07-21

### Misafire sahte oturum uyarısı ve mobil spor çipleri
- **Düzeltme:** Giriş yapmamış ziyaretçi "Oturum zaman aşımı" uyarısıyla yönlendiriliyordu.
- **Yeni:** Mobilde Spor ve Canlı sayfalarında spor kategorisi çipleri.

## [0.30.0] — 2026-07-20

### Casino yeniden tasarımı, mobil kupon, girişsiz gezinme
- **Değişti:** Casino sayfasının başında tam genişlik in-house oyun slider'ı; kategoriler ve arama tek panelde.
- **Düzeltme:** Mobilde bahis kuponu.
- **Yeni:** Ziyaretçiler giriş yapmadan casino ve bahis sayfalarını gezebiliyor.

## [0.29.0] — 2026-07-17

### Spor bahsi sonuçlandırma hataları ve banka bilgisi
- **Düzeltme (kritik):** Spor bahsi sonuçlandırmada bir dizi hata (tekrar sonuçlandırma, kombine ödemeler) düzeltildi.
- **Değişti:** Banka hesap bilgisi ekranı sadeleşti; "yalnızca kendi hesabınızdan gönderin" uyarısı.
- **Düzeltme:** Geliştirme sunucusunun API vekil portu.

## [0.28.1] — 2026-07-16

### SMTP yokken doğrulama bağlantısı konsola yazılıyor
- **Değişti:** Geliştirme ortamında SMTP tanımlı değilse doğrulama ve sıfırlama bağlantıları sunucu konsoluna yazılıyor; kayıt testleri tıkanmıyor.

## [0.28.0] — 2026-07-15

### Eski casino sayfası kaldırıldı
- **Kaldırıldı:** `/casino-v2` rotası; tek casino sayfası `/casino`.

## [0.27.0] — 2026-07-15

### 18+ yaş doğrulama kapısı kaldırıldı
- **Değişti:** Siteye girişte gösterilen 18+ yaş doğrulama kapısı kaldırıldı.
- Dahili: yalnız geliştirme/dağıtım altyapısını etkiler; kurulumda ve kullanımda değişiklik yok.

## [0.26.1] — 2026-07-15

### Uçtan uca test paketi
- **Yeni:** Playwright testleri (giriş, kupon, canlı bahis, sonuçlandırma, gerçek zamanlı güncellemeler); `npm run test:e2e`.

## [0.26.0] — 2026-07-15

### Oran değişimi renkle gösteriliyor
- **Yeni:** Bir oran yükselince yeşil, düşünce kırmızı kısa bir vurguyla gösteriliyor (kupon, market listesi, maç detayı).

## [0.25.1] — 2026-07-14

### Giriş sayfası iyileştirmeleri ve zorunlu e-posta doğrulama
- **Kırılan Değişiklikler:** Yeni hesaplar e-postalarını doğrulamadan giriş yapamaz.
- **Yeni:** Kullanıcı Sözleşmesi bağlantısı, şifre göster/gizle, yeni arkaplan.

## [0.25.0] — 2026-07-11

### Casino bağlantıları ve para yatırma/çekme düzeltmesi
- **Düzeltme:** Menüdeki tüm Casino bağlantıları yeni casino sayfasına gidiyor.
- **Düzeltme (kritik):** Profildeki para yatırma/çekme formu tanımsız alanlar yüzünden hiç gönderilemiyordu.

## [0.24.0] — 2026-07-11

### Slider takım renkleri, hafif etkinlik listesi, VIP90.bet markası
- **Değişti:** Bahis/Canlı slider'ları stok fotoğraf yerine takım renklerinden üretilen maça özel görsel kullanıyor.
- **Performans:** Etkinlik listesi 14 günlük pencereyle ve hafif yükle dönüyor.
- **Değişti:** Marka VIP90.bet oldu.

## [0.23.1] — 2026-07-10

### Kilitli bakiye bonus modeli
- **Kırılan Değişiklikler:** Bonus ayrı havuz yerine doğrudan bakiyeye eklenir ve hemen oynanabilir; çevrim tamamlanana kadar yalnız **çekimi** kilitler.
- **Yeni:** Aktif bonusu varken çekim isteyen oyuncu bonustan vazgeçip gerçek parasını çekebilir (`ACTIVE_BONUS_LOCK` + onay).

## [0.23.0] — 2026-07-08

### Casino önbellek ısıtma üretime alındı
- **Değişti:** Önceki sürümdeki önbellek ısıtma `main`'e taşındı.

## [0.22.1] — 2026-07-08

### Casino önbelleği açılışta ısıtılıyor
- **Performans:** Sağlayıcı ve oyun listeleri sunucu açılırken önbelleğe alınıyor; ilk ziyaretçi soğuk isteği beklemiyor.

## [0.22.0] — 2026-07-08

### Oturum, bonus ve casino düzeltmeleri üretime alındı
- **Değişti:** Önceki dört sürümdeki oturum, kampanya bonusu, casino tasarımı ve Canlı sayfası düzeltmeleri `main`'e taşındı.

## [0.21.0] — 2026-07-08

### Canlı sayfası slider genişliği ve "Tümü" bağlantısı
- **Düzeltme:** Canlı sayfasındaki slider tam genişlikte; "Tümü" yanlış sayfaya yönlendirmiyor.

## [0.20.1] — 2026-07-08

### Yeni casino tasarımı geliştirme dalına alındı
- **Düzeltme:** Yeni casino sayfası hiç birleştirilmemişti; `/casino` eski tasarımı gösteriyordu.

## [0.20.0] — 2026-07-08

### Kampanya bonusu bakiyede anında görünüyor
- **Düzeltme:** Kampanyadan alınan bonus sayfa yenilenene kadar görünmüyordu.

## [0.19.1] — 2026-07-08

### Oturum süresi dolduktan sonra yarım çıkış
- **Düzeltme:** Eşzamanlı token yenilemeleri yarışıyordu; "oturum sona erdi" mesajından sonra menü açık kalıyordu. Yenileme tek seferde yapılıyor, çıkışta oturum tamamen temizleniyor.

## [0.19.0] — 2026-07-08

### Referans komisyonu üretime alındı
- **Değişti:** Önceki sürümdeki referans sistemi `main`'e taşındı.

## [0.18.0] — 2026-07-08

### Referans sistemi: net gelirden %10 komisyon
- **Yeni:** Referansla gelen oyuncunun platforma kazandırdığı net gelirin %10'u referans edenin çekilebilir bakiyesine aktarılır.
- **Yeni:** Referans bağlantısı ve elle kod girişi, profilde paylaşılabilir bağlantı, kampanyalarda tanıtım kartı.

## [0.17.1] — 2026-07-07

### Admin bonus gönderme ve casino özeti üretime alındı
- **Değişti:** Önceki sürümdeki iki admin özelliği `main`'e taşındı.

## [0.17.0] — 2026-07-07

### Admin: bonus gönderme ve oyuncu casino özeti
- **Yeni:** Admin bakiye formunda "Bonus olarak gönder": tutar bonus bakiyesine eklenir, standart çevrim şartıyla.
- **Yeni:** Kullanıcı detayında casino özeti (oynanan oyun, toplam bahis/kazanç).

## [0.16.0] — 2026-07-07

### Casino oyun penceresi düzeltmesi üretime alındı
- **Değişti:** Önceki sürümdeki `frame-src` düzeltmesi `main`'e taşındı.

## [0.15.1] — 2026-07-07

### Casino oyunları yeniden açılıyor
- **Düzeltme:** Bir güvenlik sıkılaştırması `frame-src`'yi yalnız kendi alan adına daraltmıştı; sağlayıcı oyunları "Bu içerik engellenmiştir" ile açılmıyordu.

## [0.15.0] — 2026-07-07

### Deneme Bonusu ve bahis otomasyonu üretime alındı
- **Değişti:** Önceki sürümdeki kampanya, sonuçlandırma ve slider değişiklikleri ile yeni kullanıcı oyun hesabı düzeltmesi `main`'e taşındı.

## [0.14.1] — 2026-07-07

### Deneme Bonusu, bahis sonuçlandırma otomasyonu, sayfa slider'ları
- **Yeni:** "Deneme Bonusu" kampanyası (tek kullanımlık).
- **Düzeltme:** Kombine bahislerde erken/yanlış ödeme yapan sonuçlandırma hatası; maç sonucu ve alt/üst marketleri otomatik sonuçlanıyor.
- **Yeni:** Bahis ve Canlı sayfalarına ayrı slider'lar; yukarı çık butonu bu sayfalarda da çalışıyor.

## [0.14.0] — 2026-07-07

### Kayıt formundan 18+ onay kutusu kaldırıldı
- **Değişti:** Kayıt formundaki "18 yaşından büyüğüm" onay kutusu kaldırıldı (sunucu doğrulaması dahil). Yaş doğrulamasının yasal gereklilik olduğu yargı bölgelerinde operatör ayrıca sağlamalıdır.

## [0.13.0] — 2026-07-07

### Yeni kullanıcılar casino oyunu açabiliyor
- **Düzeltme:** Yeni kullanıcı için sağlayıcı hesabı hiç oluşturulmuyordu; oyun açılışında "Kullanıcı bulunamadı" hatası alınıyordu.

## [0.12.1] — 2026-07-07

### Sunucu modül türü uyarısı giderildi
- **Düzeltme:** Üretim imajına `server/package.json` kopyalanmıyordu; Node açılışta modül türü uyarısı veriyordu.

## [0.12.0] — 2026-07-07

### Takım renkli maç başlığı ve senkron düzeltmesi üretime alındı
- **Değişti:** Önceki iki sürümdeki maç başlığı ve Chromium düzeltmesi `main`'e taşındı.

## [0.11.1] — 2026-07-07

### Oran senkronu için tarayıcı bileşeni imajda eksikti
- **Düzeltme:** Docker imajında oran senkronunun kullandığı Chromium kurulmamıştı; canlı ve yaklaşan maç senkronu çalışmıyordu.

## [0.11.0] — 2026-07-05

### Maç detayında takım renkli başlık
- **Yeni:** Maç detay başlığı iki takımın renklerinden üretilen geçişle gösteriliyor; renk yoksa spora göre varsayılan.

## [0.10.0] — 2026-07-03

### Casino'da Popüler ve Yeni Çıkanlar satırları
- **Yeni:** Son 7 günde en çok oynanan oyunlar ve kataloğa en son eklenenler casino sayfasında ayrı satırlarda.

## [0.9.1] — 2026-07-03

### Casino ve bahis sayfaları hızlandı
- **Performans:** Casino sağlayıcı ve oyun listeleri sunucu ve tarayıcıda önbellekleniyor (ilk yükleme ~1 sn → birkaç ms).
- **Performans:** Etkinlik listesi her maç için tüm marketleri göndermiyor; yanıt boyutu ciddi ölçüde küçüldü.
- **Düzeltme:** Docker imajında eksik kopyalama ve log dizini izni.

## [0.9.0] — 2026-07-03

### Bakiye güvenliği ve güvenlik sıkılaştırmaları
- **Güvenlik:** Casino ve in-house oyun bakiye işlemleri atomik; eşzamanlı isteklerle bakiye bozulamıyor.
- **Güvenlik:** Spin ucuna istek sınırı ve ödeme üst sınırı; sağlayıcı geri çağrılarına tekrar ve tutar denetimi.
- **Güvenlik:** Admin işlemlerine denetim kaydı; CORS/CSP sıkılaştırıldı; Docker imajı çok aşamalı ve root olmayan kullanıcıyla çalışıyor.

## [0.8.0] — 2026-07-02

### Ana sayfa ve etkinlik kartları
- **Yeni:** Ana sayfa (hero banner, lig grupları, casino önizlemesi) ve maç kartı bileşeni.

## [0.7.1] — 2026-07-01

### Profil sayfası açılmıyordu
- **Düzeltme:** Profil sayfasında eksik bileşen içe aktarması sayfayı çökertiyordu.

## [0.7.0] — 2026-07-01

### In-house oyun görselleri v2
- **Değişti:** 13 oyunun kart ve banner görselleri ile giriş arkaplanı ikinci sürümle değiştirildi; casino ve in-house slider'ı yeni görselleri kullanıyor.

## [0.6.1] — 2026-07-01

### In-house oyun görselleri (geliştirme dalı)
- **Değişti:** Önceki sürümdeki oyun ve giriş görselleri geliştirme dalına da işlendi.

## [0.6.0] — 2026-07-01

### In-house oyun görselleri ve giriş düzeltmesi
- **Yeni:** 13 in-house oyunun kart ve banner görselleri (yapay zekâ ile üretildi).
- **Düzeltme:** Giriş formu e-posta yerine kullanıcı adı gönderiyor (sunucu şemasıyla uyumlu).

## [0.5.0] — 2026-07-01

### Giriş arkaplanı yenilendi
- **Değişti:** Yeni giriş arkaplan görseli; tarayıcı önbelleğinde eskisinin kalmaması için sürüm parametresi.

## [0.4.1] — 2026-07-01

### Oyun ekranında oyun adı gösteriliyor
- **Düzeltme:** Oyun penceresinin üst çubuğunda sağlayıcı kodu yerine oyunun adı görünüyor.

## [0.4.0] — 2026-07-01

### Oyun pencerelerinde tüm HTTPS kaynaklarına izin
- **Değişti:** Sağlayıcı oyunları değişken alan adlarından açıldığı için `frame-src` tüm HTTPS kaynaklarına açıldı.

## [0.3.1] — 2026-07-01

### Casino oyun pencereleri için içerik güvenliği izni
- **Düzeltme:** İçerik güvenlik politikası (CSP) sağlayıcının oyun alan adlarını engelliyordu; `frame-src` izni eklendi.

## [0.3.0] — 2026-07-01

### Şifremi unuttum ve şifre sıfırlama sayfaları
- **Yeni:** Giriş formunda "Şifremi unuttum" bağlantısı; e-postayla sıfırlama bağlantısı gönderen ve yeni şifre belirleten sayfalar.
- **Değişti:** Giriş ekranına arkaplan görseli.

## [0.2.0] — 2026-07-01

### Eksik sunucu bağımlılığı eklendi
- **Düzeltme:** `escape-string-regexp` kullanılıyor ama bağımlılıklarda yoktu; sunucu açılışta çöküyordu.

## [0.1.1] — 2026-07-01

### Oturum, kayıt ve casino oturumu düzeltmeleri
- **Düzeltme:** Yenileme çerezi yerelde de çalışıyor; karşılama sayfasındaki sonsuz yönlendirme giderildi.
- **Düzeltme:** Yetersiz bakiye hatası anlaşılır bir mesajla gösteriliyor; kayıt formu alan bazında hata veriyor.
- **Düzeltme:** Yeni oyun açılırken takılı kalan eski oyun oturumu kapatılıyor; elle kapatma butonu eklendi.

## [0.1.0] — 2026-06-30

### Yeni casino arayüzü ve ilk in-house oyunlar
- **Yeni:** Casino arayüzü güncellendi; ilk in-house oyunlar (Crash, Rulet) eklendi.

## [0.0.1] — 2026-06-18

### Casino oyunlarında karma içerik hatası giderildi
- **Düzeltme:** Ters vekil arkasında oyun varlık adresleri `http://` üretiliyordu ve tarayıcı engelliyordu; `X-Forwarded-Proto` dikkate alınıyor (`trust proxy`).
- **Düzeltme:** Yanlışlıkla değişen demo oyun adresleri geri alındı.
- **Yeni:** `main`'e doğrudan push'u engelleyen hook kurulum betiği (`scripts/install-hooks.sh`).

## [0.0.0] — 2026-06-18

### Üretimde statik dosyalar doğru sunuluyor
- **Düzeltme:** `/assets/*` istekleri API zincirine düşüp JSON dönüyordu; CSS reddediliyor, JS 500 veriyordu. Statik dosyalar ve SPA geri dönüşü API rotalarından önce/sonra doğru sırada.
