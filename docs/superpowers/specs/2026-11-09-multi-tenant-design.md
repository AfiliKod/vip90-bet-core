# Çok Kiracılı (Multi-Tenant) SaaS Mimarisi: Tasarım Raporu

> Bu belge, onaylanan tasarım raporunun public kopyasıdır (2026-11-12). İç ayrıntılar (sunucu yolları, iç alan
> adları, ticari ortak adları, kanıt ekleri) çıkarılmıştır. 10. bölümdeki açıkların tamamı İP-0 ile kapatılmış ve
> yayınlanmıştır.

Tarih: 2026-11-09 · Durum: **Onaylandı** (sahip, 2026-11-12), v2 metniyle; uygulama İP-U ile başladı ·
Kanıt tabanı: geliştirme deposunun 2026-11-09 durumu (core'a karşılığı `bet@ba21db9e` senkronu)
(premium alt modüller: betting `5eec3ff`, igames `248f356`, inhouse-provider `d06359d`, salt okunur incelendi)

Rapor ve dal şimdilik `bet` deposundadır (`docs/multi-tenant-design`). Onaylanan rapor, geliştirmenin yapılacağı
public `vip90-bet-core` deposuna da konur (K18); oraya konmadan önce iç ayrıntılar (sunucu yolları, iç alan adları,
ticari ortak adları) çıkarılır ve 10. bölüm, İP-0 düzeltmeleri yayınlanana kadar özetlenir (henüz düzeltilmemiş açıklar public depoda
ayrıntılı yayımlanmaz).

Ekler (kanıt tabanı, `dosya:satır` referanslarıyla) private geliştirme deposundadır ve burada yayımlanmaz; metindeki
`A§n`, `B§n`, `C§n` referansları o eklere (A: veri katmanı ve para akışları, B: API/kimlik/yetki/admin/raporlama,
C: entegrasyonlar/işler/yapılandırma/istemci/deploy) işaret eder.

Satır numaraları aksi yazılmadıkça `server/src/` altındadır. Premium dosyalar `[betting]`, `[igames]`, `[inhouse]`
önekiyle yazılır.

## İçindekiler

0. Amaç, bağlayıcı kararlar, bu raporun kararları
1. Mevcut durum envanteri
2. Kiracı yalıtımı gereken koleksiyonlar ve akışlar
3. Eksik ve riskli yalıtım noktaları (sıralı)
4. Önerilen veri modeli ve kiracı kimliğinin taşınması
5. Yetki matrisi, kimlik ayrımı, JWT ve kiracı çözümleme
6. Kurulum ve geçiş stratejisi (yeni merkezi kurulum; tek operatörlü kurulumlar bozulmadan)
7. İş paketleri ve sıralama; geliştirmenin public core'da yapılması, premium eklentilerle sınır
8. Test planı
9. Güvenlik açısından kritik riskler ve kapanış ölçütleri
10. Bugünkü kurulumda bulunan güvenlik açıkları (çok kiracılıktan bağımsız)
11. Varsayımlar ve sahibin yanıtlaması gereken açık sorular
12. Değişiklik kaydı

---

## 0. Amaç, bağlayıcı kararlar, bu raporun kararları

### 0.1 Amaç

Tek merkezi VIP90 kurulumu, birbirinden tamamen bağımsız birden çok iGaming operatörünü çalıştırır. İlk kullanım
senaryosu: bir teknoloji/satış ortağının VIP90'ı birden çok operatöre yeniden satması. Bugünkü
model "her operatöre ayrı kurulum ve sunucu"dur. Hedef kozmetik çoklu marka değildir: gerçek veri yalıtımı,
kiracı bazlı yetkilendirme ve merkezi operatör yönetimi.

Çok kiracılı sistem **yeni ve temiz bir merkezi kurulumdur** (K10). Bugünkü `app.vip90.bet` demo/satış ortamıdır
(botlar, sahte kazananlar, ödeme almayan demo depozit) ve olduğu gibi tek operatörlü kalır; merkezi kuruluma
taşınmaz. Yeni merkezi kurulumda şunlar bulunur: VIP90 Platform Sahibi paneli, Partner yönetimi, Operatör yönetimi,
kiracı veri ve yetki yalıtımı, operatör başına bağımsız alan adı ve marka yapılandırması.

### 0.2 Sahibin bağlayıcı kararları (karar verildi)

| # | Karar |
|---|---|
| K1 | Hiyerarşi: Platform Sahibi (VIP90) → Partner/Bayi-satıcı (isteğe bağlı) → Operatör → marka(lar)/alan adı(ları). VIP90'ın doğrudan operatörleri ve partner kaynaklı operatörleri olabilir |
| K2 | Operatör verisinin sahibi yalnız operatördür; hiçbir veri partner anahtarıyla tutulmaz. Partner-operatör ilişkisi ayrı ve değiştirilebilir bir kayıttır (operatör partner değiştirebilir ya da doğrudan VIP90 yönetimine geçebilir) |
| K3 | Partner yalnız kendi operatörlerinin toplulaştırılmış ticari metriklerini görür (GGR, turnover, aktif oyuncu, komisyon vb.). Oyuncu kişisel verisi, bakiyeler ve finansal hareketler varsayılan olarak yalnız operatöre açıktır; partner erişimi açıkça verilir ve denetim kaydına yazılır. Partnerin kurulum yazma yetkileri K16'dadır |
| K4 | Her operatörün kendi markası, alan adları, oyuncuları, bakiyeleri, işlemleri, bahisleri, casino oturumları, oyun yapılandırmaları, bonusları, raporları ve admin kullanıcıları vardır. Hiçbir operatör diğerinin verisini göremez ve üzerinde işlem yapamaz |
| K5 | Aynı e-posta iki operatörde iki ayrı oyuncu hesabıdır (bağlanmaz) |
| K6 | Ödeme, KYC, e-posta/SMS ve oyun sağlayıcı kimlik bilgileri operatör başınadır |
| K7 | Mevcut Agent (bayi) sistemi Partner'dan farklı bir kavramdır ve ayrı kalır |
| K8 | Mevcut tek operatörlü kurulumlar varsayılan kiracı olarak değişmeden çalışmaya devam eder |
| K9 | Bu iş, AGENTS.md'deki yerleşik kararı ("Multi-brand data isolation is not enforced, no `brandId` …") bilerek tersine çevirir |

Sahibin 2026-11-09 kararları (v2'de eklendi, bağlayıcı):

| # | Karar (sahip, 2026-11-09) |
|---|---|
| K10 | Çok kiracılı sistem **yeni, temiz bir merkezi kurulumdur**. `app.vip90.bet` demo/satış ortamı (botlar, sahte kazananlar, ödeme almayan demo depozit) olarak tek operatörlü kalır ve **taşınmaz**. Merkezi kurulum demo verisi ya da demo davranışı üzerine kurulmaz: multi modda bot, sahte kazanan ve demo depozit yoktur; bunlar tek modlu demo kurulumlar için açık bayrakların arkasında kalabilir, bayrakların varsayılanı kapalıdır. Merkezi kurulumda bulunması gerekenler: VIP90 Platform Sahibi paneli, Partner yönetimi, Operatör yönetimi, kiracı veri ve yetki yalıtımı, operatör başına bağımsız alan adı ve marka yapılandırması |
| K11 | Mevcut tek operatörlü kurulumların geriye uyumluluğu korunur (K8'i pekiştirir) |
| K12 | Zorunlu personel 2FA'sı **yalnız çok operatörlü (multi) modda** geçerlidir. Tek modda bugünkü davranış sürer; tek fark, 2FA'yı etkinleştirmiş kullanıcıya girişte kodun sorulmasıdır (V2 güvenlik düzeltmesi; yeni bir zorunluluk değil, bir düzeltme) |
| K13 | Igames: her operatörün kendi agent hesabı ve kendi kimlik bilgileri vardır. Palace'ın ticari izni ayrıca teyit edilecektir (S4) |
| K14 | Çoklu para birimi şimdilik kapsam dışıdır; veri modeli ileride eklenebilmesi için para birimi alanını korur |
| K15 | non-custodial zincir sürümü kiracı işinin kapsamı dışındadır. Onunla ortak güvenlik düzeltmeleri ayrı ve cherry-pick edilebilir commit'ler olarak yapılır |
| K16 | Partner, "VIP90'ın kendisi için tanımladığı yetkiler dahilinde kendi operatörlerini oluşturabilir, yönetebilir ve ticari performanslarını takip edebilir; diğer partnerlerin operatörlerine erişemez". Partner, platformun verdiği yetenek seti içinde kendi operatörlerinin kurulumunda **yazma** yetkisine sahiptir (kiracı oluşturma/provizyon, kiracı yapılandırması, marka ve alan adı, operatör admin kullanıcıları). Oyuncu kişisel verisine, bakiyelere ve finansal hareketlere varsayılan erişimi yine **yoktur**; bunlar açık ve denetim kaydına yazılan `PartnerGrant` ister. Platform Sahibi her partnerin yetenek setini tanımlar |
| K17 | 10. bölümdeki güvenlik düzeltmeleri (V1-V22) kesin yapılır; bu rapor onaylandıktan sonra ilk iş olarak İP-0'dır. Henüz kod yazılmaz |
| K18 | Çok operatörlü işin **tamamı** (kiracı yalıtımı **ve** Platform Sahibi paneli, Partner yönetimi, operatör provizyonu, faturalama) doğrudan public AGPL `AfiliKod/vip90-bet-core` deposunda geliştirilir; core bu iş için kaynak (upstream) olur. Sahip şunları bildi ve kabul etti: (1) akış tersine döner, `bet` (core + private premium eklentiler betting/igames/inhouse) bu değişiklikleri core'dan alır; `scripts/sync-core.mjs`, `.core-sync.json` tabanı ve AGENTS.md'deki "Core'u doğrudan düzenleme; değişikliği bet'te yap" kuralı değişir (7.3); (2) platform/partner konsolu ve faturalama dahil core'daki her şey public AGPL'dir |

### 0.3 AGENTS.md: tersine çevrilen karar ve önerilen yeni metin

Bugünkü metin (`AGENTS.md:85-87`): "Multi-brand data isolation is **not enforced**, no `brandId` on `User`,
`Transaction`, `Bet`, `CasinoRound`, `Agent`. Do not treat brand/jurisdiction pages as functionally load-bearing,
and do not remove them."

Bu rapor bu kararı **tersine çevirir** (K9). AGENTS.md bu raporla düzenlenmez; aşağıdaki metin, iş paketi
İP-1 birleştirildiğinde aynı PR'da yerine konmak üzere önerilir:

```
- **`2026-11-09`: Çok kiracılı veri yalıtımı (multi-tenant) zorunludur.** Bu karar
  "Multi-brand data isolation is not enforced" kararının yerini alır
  (docs/superpowers/specs/2026-11-09-multi-tenant-design.md). Operatöre ait her koleksiyon
  `tenantId` taşır; operatöre ait modellerde kapsamsız sorgu `tenantScoped` eklentisi
  tarafından reddedilir; kapsam dışı çalışan platform işleri `runAsPlatform(reason, fn)`
  ile açıkça işaretlenir. Kiracı modeli `Tenant`'tır; `Operator` adı in-house
  sağlayıcının B2B müşteri modeline aittir ve kiracı anlamında kullanılmaz. Tek operatörlü
  kurulumlar varsayılan kiracıyla (`TENANCY_MODE=single`) değişmeden çalışır.
  Brand/Jurisdiction sayfaları artık işlevseldir: Brand bir kiracıya aittir, alan adı →
  kiracı çözümlemesi `Domain` koleksiyonundan yapılır. Yalıtım çekirdeği, Platform Sahibi
  paneli, Partner hiyerarşisi, operatör provizyonu ve faturalama public core'dadır ve
  core'da geliştirilir (core upstream'dir, bkz. "Repo dağılımı"). Merkezi çok kiracılı
  kurulum yeni ve temiz bir kurulumdur; app.vip90.bet tek operatörlü demo ortamı olarak
  kalır ve taşınmaz. Multi modda bot, sahte kazanan ve demo depozit çalışmaz; personel
  2FA'sı yalnız multi modda zorunludur. Agent (bayi) ile Partner ayrı kavramlardır;
  birleştirme önerme.
```

"Repo dağılımı ve core senkronu" bölümü için önerilen yeni metin 7.3'tedir; o da İP-U birleştirildiğinde
yerine konur.

### 0.4 Bu raporun ana kararları (gerekçeleri ilgili bölümlerde)

| # | Karar | Bölüm |
|---|---|---|
| R1 | **Paylaşımlı veritabanı + satır düzeyinde `tenantId`**. Operatör başına veritabanı şimdi yapılmaz (varsayım Y1); sorgu koruması ve eklenti, modeller yeniden yazılmadan kiracı başına bağlantı eklenebilecek şekilde yazılır (4.4 madde 7) | 4.1 |
| R2 | Kiracı modelinin adı **`Tenant`**, alan adı **`tenantId`**. In-house sağlayıcının `Operator` modeliyle birleştirilmez; her `Tenant` 1:1 bir sağlayıcı `Operator` kaydına bağlanır (`Tenant.providerOperatorId`). Arayüz ve belgelerde kullanıcıya görünen terim "Operatör" kalır | 4.2 |
| R3 | **Kimlik ayrımı:** oyuncular kiracıya bağlı `User` koleksiyonunda kalır; tüm personel (platform, partner, operatör) yeni **`StaffAccount`** koleksiyonuna taşınır, yetki **`RoleAssignment { scopeType, scopeId }`** ile verilir | 5.1 |
| R4 | **Kiracı bağlamı:** `AsyncLocalStorage` + operatöre ait modellerde kapsamsız sorguyu reddeden `tenantScoped` Mongoose eklentisi; platform işleri için açık `runAsPlatform(reason, fn)` / `forEachTenant(fn)` | 4.4 |
| R5 | **Kademeli zorlama:** `TENANCY_ENFORCEMENT=off → log → enforce`; ayrıca `TENANCY_MODE=single|multi` (single: her istek varsayılan kiracı) | 6 |
| R6 | **Her şey public core'da (K18):** yalıtım çekirdeği, Platform Sahibi paneli, Partner hiyerarşisi, operatör provizyonu, partner portalı, komisyon ve faturalama `vip90-bet-core`'da geliştirilir. `premium/platform` alt modülü yoktur. Konsol ve portal istemcisi core içinde `client/`'tan ayrı bir uygulamadır (`console/`). Mevcut premium eklentiler (betting, igames, inhouse) private ve isteğe bağlı kalır; core onlarsız çalışır, eklentiler core'un sağladığı kancalara bağlanır | 7.2 |
| R7 | **Paylaşımlı spor kataloğu:** `Event` platform verisidir; olay uzlaştırma (settle) yalnız platform personelinin yetkisidir ve her bahsin yan etkileri (referans, VIP, cashback) bahsin kiracısının bağlamında çalışır | 4.6 |
| R8 | Bölüm 10'daki mevcut açıklar **kiracı işinden önce** kapatılır (İP-0, sahibin kararı K17) | 7, 10 |
| R9 | **Ana yol yeni kurulumdur:** merkezi kurulum boş veritabanıyla `TENANCY_MODE=multi` olarak açılır (platform kurulumu → ilk Platform Sahibi personeli → partnerler → kiracılar). Varsayılan kiracı geçişi (G1-G8) yalnız mevcut tek kurulumların geriye uyum yoludur | 6 |
| R10 | **Partner yetenek seti:** partner personelinin etkin izni = rolünün izinleri ∩ platformun o partnere verdiği yetenek seti (∩ bağlantıdaki daraltma). Partner kendi operatörlerinin kurulumunu yazar; oyuncu verisi, bakiye ve para yalnız `PartnerGrant` ile | 4.3.4, 5.3 |
| R11 | **Demo davranışı bayrak arkasında:** bot, sahte kazanan, demo depozit ve demo verisi yükleme açık bayraklarla (`DEMO_*`, varsayılan kapalı) açılır; multi modda bayraklardan biri açıksa sunucu başlamaz | 6.1 |
| R12 | **Core upstream olur (İP-U):** İP-0 bugünkü akışla (bet → core) yayınlanır, ardından akış çevrilir ve İP-1'den itibaren her şey core'da geliştirilip bet'e çekilir | 7.3 |

---

## 1. Mevcut durum envanteri

Ayrıntı ve tüm `dosya:satır` kanıtları eklerdedir; burada karar için gereken özet var. Bu rapor için ayrıca kodda
tek tek doğrulanan iddialar "doğrulandı" diye işaretlidir.

### 1.1 Veri katmanı (Ek A)

- 52 core + 6 premium = **58 Mongoose modeli**; ayrıca ham koleksiyon erişimi (`services/ledgerDedupe.js:100-119`)
  ve kalıcı olmayan süreç içi durum (`CRYPTO_SETTINGS`, `controllers/admin.js:1863-1882`). A§0
- `User`, `Transaction`, `Bet`, `CasinoRound`, `Agent` üzerinde hiçbir `brandId`/`operatorId`/`tenantId` yok.
  `brandId`/`jurisdictionId` yalnız risk modellerinde var ve hiçbir çağıran doldurmuyor. A§0.2
- Core'daki tek `operatorId`: `GameSettings.operatorId` (`models/GameSettings.js:15`, doğrulandı); bu alan in-house
  sağlayıcının `Operator` modeline (`[inhouse] engine/models/Operator.js:55`) referans verir. Bu `Operator`
  sağlayıcının B2B müşterisidir, platform kiracısı değildir; aynı mongoose bağlantısında kayıtlıdır. A§0.1
- `User` hem oyuncuları hem personeli tutar (`role: user|admin`, `roles[]`). 6 global unique indeks
  (username, email, phone, walletAddress, googleId, telegramId) operatörler arasında çakışır. A§1.1
- Operatörler arasında çakışacak **20 unique indeks** (A§1.6): User ×6, `Role.name`, `ChatRoom.name/slug`,
  `PlayerSegment.slug`, `StaticPage.slug`, `SmsTemplate.key`, `SystemMailTemplate.event`, `RiskRule.name`,
  `VipLevel.level`, `Setting.key`, `GameSettings.gameId` (eski partial), `IgamesCallbackReceipt.key`,
  `CasinoPromoGrant.callId/gplayId`.
- Global arama anahtarı olarak kullanılan unique olmayan alanlar: `User.palaceUserCode`, `User.cryptoDepositIndex`
  (max+1 ile yarışlı ayırma, `routes/crypto.js:28-40`), `User.sumsubApplicantId` (indeks yok),
  `SlikairPayment.payinId`, `SlikairPayout.payoutId`, `Brand.domains.domain`. A§1.6
- **46 para yolu** izlendi (A§2.1). Admin onaylarının tamamı `findById(req.params.id)` ile sahiplik kontrolü
  olmadan çalışır (banka `controllers/bank.js:111`, kripto `controllers/admin.js:1888,1931,1956,2015`, bakiye
  `:257`, Slikair payout gövdedeki `userId` `controllers/slikairController.js:110`, promosyon talebi
  `controllers/promotions.js:25`).
- İşlem (transaction) dışında para hareketi: Igames callback'leri (ledger satırı da yazmaz), Igames oturum
  kapama, chat tip/rain, promosyon talebi, bonus forfeit, Slikair payout iadesi. A§2.2
- `Transaction.idempotencyKey` global unique ama anahtarların neredeyse tamamı ObjectId/uuid içerdiği için
  kiracılar arası güvenli; yalnız `slikair_payin_${payinId}` kiracı öneki almalı. A§2.3
- Raporlar ve işler tüm koleksiyonu tarar (A§3); partner metriği için `Transaction`, `Bet`, `CasinoRound` üzerinde
  kiracı anahtarı ve önceden toplanmış günlük tablo şart.

### 1.2 API, kimlik, yetki (Ek B)

- **401 route handler** (286 admin, 67 oyuncu, 45 public, 3 webhook), Agent self-servis yüzeyi yok. B§0, B§1.2
- Tek `JWT_SECRET`, yük `{id, role, tokenVersion}` (`controllers/auth.js:37-43`); kiracı, hedef kitle (aud) ya da
  kapsam bilgisi yok. Hiçbir middleware Host'tan marka/operatör çözmüyor. B§2
- `requireAdmin` yalnız JWT'deki `role` iddiasına bakar (`middleware/auth.js:89-92`, doğrulandı);
  `assignRoleToUser` herhangi bir rol atandığında `role='admin'` yapar (`services/permissions.js:368`, doğrulandı).
  Bu yüzden yalnız `requireAdmin` ile korunan her rota her personel rolüne açıktır. B§3.1, B§3.3
- 43 izin anahtarı, 7 tohum rol, hepsi global; `super_admin` kurulum geneli tam yetki. 7 anahtar tanımlı ama hiçbir
  yerde uygulanmıyor. B§3.2
- Brand/Jurisdiction/Currency modelleri veri kapsamlamıyor; `getBrandByDomain` yalnız bir admin rotasından
  erişilebilir (`routes/multiBrand.js:13`). B§3.4
- Raporlama: casino GGR, gerçekleşmiş spor GGR, depozit/çekim, aktif oyuncu var; NGR, operatör ya da partner
  komisyonu yok; analizler bilinçli olarak seed ve bot verisini içerir. B§6

### 1.3 Entegrasyonlar, işler, yapılandırma, istemci (Ek C)

- Tüm sağlayıcı kimlik bilgileri tek `Setting` deposunda ya da env'de (Slikair, SMTP, SMS, Google, Igames, KYC,
  kripto tohumu). Tüm ayar depolarında kiracı anahtarı olmayan 30 sn'lik süreç içi önbellek var (17 ayrı kopya).
  C§2.1
- Gelen callback'ler: Slikair (imzasız, durum sorgusuyla doğrulanıyor), Sumsub (HMAC, gövdeden önce sır seçilmeli),
  Igames (kurulum başına tek statik token), in-house (HMAC, sağlayıcı Operator'ı `operatorKey:'vip90'` sabit kodlu,
  `[inhouse] inhouseProviderProxy.js:107`, doğrulandı). C§1.2
- `CLIENT_URL`'in ilk değeri 10 yerde "site" kabul ediliyor (OAuth dönüşleri, Slikair bildirim/dönüş adresleri,
  e-posta bağlantıları). C§2.4
- Soket: `role:admin` odası global; `winners:new` gerçek kazananların `userId` ve `username` bilgisini herkese
  yayınlıyor (`services/liveGameStream.js:68-91`, doğrulandı). C§3.2
- Zamanlanmış e-posta/SMS kitleleri tüm `User`'ları tarıyor (`services/systemMail.js:210-235`,
  `services/smsTemplate.js:321`). C§3.1
- İstemci API ve soketleri zaten aynı kökene göre çalışıyor; marka/tema/modül çalışma anında `/api/*`'dan
  okunuyor. PWA manifesti ve `index.html` başlığı derleme anında `VIP90.bet`'e sabit. C§4
- Tek Node süreci, Redis adaptörü yok, MongoDB replica set (`docker-compose.yml`, `mongo:7`). C§5
- `scripts/sync-core.mjs` `server/src` (premium hariç) ve `client/` altındaki her şeyi public AGPL core'a taşır.
  C§6. Bugünkü akış bet → core'dur; K18 ile tersine döner (7.3).
- Demo davranışları çekirdekte ve varsayılan olarak açık: bot oyuncular (`services/bot.js`, loopback HTTP),
  sahte kazananlar (`services/fakeWinners.js:32`, `enabled: true`), demo verisi yükleme
  (`routes/admin.js:92-96`), ödemesiz demo depozit (V4). Merkezi kurulumda bunların hiçbiri çalışmamalı (K10, R11).

### 1.4 Bulunan önemli sürpriz

In-house premium modül **zaten çok kiracılı bir sağlayıcıdır**: `Operator` başına anahtar, IP/köken listesi, oyun
listesi, HMAC cüzdan callback'i, yeniden deneme kuyruğu, operatör başına crash/rulet odası. Platform kendisine
"Operatör #1" (`vip90`) olarak loopback HTTP üzerinden bağlanıyor. `GameSettings.operatorId` sayesinde oyun
başına RTP/limit zaten sağlayıcı-operatör başına tutulabiliyor. Bu, kiracı başına oyun yapılandırması için
hazır bir yoldur (R2).

---

## 2. Kiracı yalıtımı gereken koleksiyonlar ve akışlar

Sahiplik sınıfları:

- **TEN**: kiracıya (operatöre) ait. `tenantId` zorunlu, `tenantScoped` eklentisi, kiracı içi unique indeksler.
- **TEN-BRAND**: kiracıya ait, ayrıca markaya göre değişir (`tenantId` + isteğe bağlı `brandId`).
- **PLAT**: platform geneli (kiracı alanı yok; yalnız platform personeli yazar).
- **CAT**: paylaşımlı katalog (platform yazar, kiracılar okur; kiracı tercihleri ayrı bir kaplama kaydında).
- **PROV**: in-house sağlayıcı tarafı; zaten sağlayıcı `operatorId` ile kapsamlı.
- **PART**: partner katmanı (core'da, K18).

Yalıtım mekanizmaları (kısaltma): **F** = `tenantId` alanı + eklenti filtresi; **U** = `{tenantId, alan}` bileşik
unique; **R** = callback/webhook kaydından kiracı türetme; **H** = Host → kiracı; **C** = kiracı başına
kimlik bilgisi/ayar; **S** = kiracı başına soket odası; **J** = iş `forEachTenant` ile kiracı başına döner;
**P** = platform-only yetki.

### 2.1 Koleksiyonlar

| Koleksiyon | Sınıf | Mekanizma | Not |
|---|---|---|---|
| User (oyuncu) | TEN | F, U(username, email, phone, walletAddress, googleId, telegramId, palaceUserCode), H | Personel `StaffAccount`'a taşınır (R3). Aynı e-posta iki kiracıda iki hesap (K5) |
| StaffAccount (yeni) | PLAT/PART/TEN | `RoleAssignment` kapsamı | Kimlik global unique (e-posta); yetki kapsama göre |
| LoginAttempt | TEN | F | Kilit sayacı `{tenantId, username, ip}` |
| KycDocument | TEN | F; dosyalar `uploads/kyc/<tenantId>/` + yetkili indirme | Partner hiçbir zaman göremez |
| Ticket | TEN | F, S | |
| Role | PLAT (sistem şablonları) + TEN (özel roller) | `scopeType`, `scopeId`, U(scopeId, name) | 5.2 |
| Permission | PLAT | yok | katalog |
| Transaction | TEN | F | `idempotencyKey` global unique kalır; `slikair_payin_` anahtarına kiracı öneki |
| Bet | TEN | F | `Event` CAT'e referans |
| CasinoRound, CasinoSession, InhousePlaySession | TEN | F | |
| InhouseCallbackReceipt | TEN | F; `txnId` global unique kalır (sağlayıcı txnId'si sağlayıcı operatorId içerir) | |
| BankDepositRequest, CryptoDeposit | TEN | F; `txHash` global unique kalır | |
| SlikairPayment, SlikairPayout | TEN | F, R, C | webhook kiracıyı kayıttan alır |
| BonusWagering, CasinoPromoGrant | TEN | F, U(tenantId, callId), U(tenantId, gplayId) | |
| ReferralCommission, ReferralTree | TEN | F | referans veren aynı kiracıda olmalı |
| Agent | TEN | F; `userId` global unique kalır (oyuncu `_id`'si zaten kiracıya özgü) | 5.5 |
| ChatRoom, ChatMessage, ChatRain, ChatTip | TEN | F, U(tenantId, name/slug), S | tip alıcısı aynı kiracıda olmalı |
| ActivityEvent | TEN | F, S | admin canlı akışı |
| RiskProfile, RiskSignal, RiskFinding, RiskEvaluation | TEN | F; mevcut `brandId` kiracı içi alt filtre olur | |
| RiskRule | PLAT şablon + TEN kopya | U(tenantId, name), `tenantId:null` = şablon | |
| ReconciliationJob/Item | TEN | F, J | |
| SmsLog, SystemMailLog | TEN | F | kişisel veri |
| AuditLog, AdminAction | TEN + PLAT + PART | `tenantId` (null = platform), `actorScope`, `onBehalfOfTenantId` | 4.3.7 |
| Promotion, VipLevel, PlayerSegment, SmsTemplate, SmsSender, SystemMailTemplate | TEN | F, U(tenantId, level/slug/key/event) | kiracı oluştururken tohumlanır |
| StaticPage | TEN-BRAND | F, U(tenantId, brandId, slug) | yasal sayfalar markaya göre |
| GameSettings | TEN (sağlayıcı Operator üzerinden) | mevcut `operatorId` (sağlayıcı) = `Tenant.providerOperatorId` | adı değişmez, 4.2 |
| Brand | TEN | F, U(tenantId, slug) | `domains[]` yeni `Domain` koleksiyonuna taşınır |
| Domain (yeni) | TEN | `host` **global** unique, H | |
| Currency | CAT + TEN politika | katalog global; kiracı başına tek para birimi `Tenant.baseCurrency` (K14); para kayıtlarındaki `currency` alanı korunur | çoklu para birimi kapsam dışı (K14); `TenantCurrency` ileride |
| Jurisdiction | CAT + TEN atama | katalog global; `Tenant.jurisdictionIds` / `Brand.jurisdictionId` | |
| Setting | PLAT + TEN + TEN-BRAND | `{scope, tenantId, brandId, key}` unique; C | 4.5 |
| Event | CAT | P (uzlaştırma) | 4.6 |
| GameTask | PLAT | P | |
| Migration | PLAT | | |
| [inhouse] Operator | PROV | 1:1 `Tenant.providerOperatorId` | |
| [inhouse] OpenRound, PlayerSeedPair, ProviderRound, WalletCallbackOutbox | PROV | mevcut sağlayıcı `operatorId` | doğru anahtarlı |
| [igames] IgamesCallbackReceipt | TEN | `key = ${tenantId}:${round_id}:${trans_type}` | |
| `transactions_dedupe_archive` (ham) | TEN | `tenantId` alanı; ham erişim `runAsPlatform` içinde | |
| Tenant, Partner, PartnerOperatorLink, PartnerGrant, TenantDailyStat (yeni) | PLAT / PART | 4.3 | |

### 2.2 Süreç akışları

| Akış | Sınıf | Mekanizma | Kanıt |
|---|---|---|---|
| Oyuncu kayıt/giriş/şifre sıfırlama/e-posta doğrulama | TEN | H; tüm aramalar `{tenantId, …}`; referans veren aynı kiracıdan | `controllers/auth.js:83,90,160-241,374` |
| Google/Telegram/Web3 giriş | TEN | OAuth `state` içinde `tenantId`; kiracı başına istemci/bot; e-postayla otomatik bağlama kiracı içinde | `services/socialAuth.js:36,185`; `routes/socialAuth.js:20` |
| Personel girişi ve admin paneli | TEN/PLAT/PART | ayrı personel tokeni, `RoleAssignment` kapsamı, Host ile çapraz kontrol | 5 |
| Oyuncu depozit/çekim (banka, kripto, Slikair) | TEN | F, C; admin onayları `findOne({_id, tenantId})` | A§2.1 #1-15 |
| Kripto adres türetme ve çekim | TEN | kiracı başına tohum/hot wallet ya da paylaşımlı saklama (açık soru S1); `cryptoDepositIndex` kiracı başına sıra | `routes/crypto.js:28-40`, `services/cryptoService.js:83,158` |
| Spor bahsi yerleştirme | TEN | F | `controllers/bets.js:13-79` |
| Spor uzlaştırma (otomatik ve elle) | CAT→TEN | P; bahis başına `runWithTenant(bet.tenantId)` | `[betting] settlement.js:12`, `controllers/admin.js:522-554` |
| In-house başlatma ve cüzdan callback | TEN/PROV | callback URL'sinde kiracı anahtarı → `Tenant` → sağlayıcı Operator ile HMAC; `externalPlayerId` kiracıya ait olmalı | `[inhouse] inhouseProviderProxy.js:107,124,158,208` |
| Igames başlatma, callback, oturum kapama | TEN | C; kiracı başına kendi agent hesabı ve kimlik bilgileri (K13), kiracı başına callback URL + token; `{tenantId, palaceUserCode}` | `[igames] igames.js:433-680` |
| Promosyon talebi, bonus, wagering, VIP, cashback, referans | TEN | F; kiracının VIP tablosu ve referans oranı | `controllers/promotions.js:25`, `services/vip.js:96-101,145`, `services/referralCommission.js:22` |
| Agent → oyuncu transferi | TEN | F; agent ve oyuncu aynı kiracıda | `services/agent.js:99-178` |
| Chat mesaj, tip, rain | TEN | F, S; alıcı aynı kiracıda | `services/chat.js:348-535,650-701` |
| KYC (Sumsub ve elle) | TEN | C; webhook URL'si kiracı anahtarlı; dosyalar yetkili indirme | `routes/sumsubWebhook.js:11`, `app.js:190-191` |
| E-posta/SMS gönderimi ve zamanlanmış kampanyalar | TEN | C, J; kitle sorgusu kiracı içinde; kiracı başına transporter | `services/systemMail.js:210-235`, `services/smsTemplate.js:321`, `services/email.js:18-75` |
| Admin raporları, analiz, sayaçlar, bekleyen finans kuyruğu | TEN | F; platform için `runAsPlatform` toplamı | A§3 |
| Partner metrikleri | PART | yalnız `TenantDailyStat` okur | 4.3.6 |
| Partnerin kendi operatörlerinin kurulumu (kiracı oluşturma, yapılandırma, marka/alan adı, operatör admin kullanıcıları) | PART→TEN | partner yetenek seti (4.3.4) + geçerli `PartnerOperatorLink`; `onBehalfOfTenantId` ile denetim | K16 |
| Arka plan işleri (bonus süresi, KYC süresi, kripto mutabakat, Igames mutabakat) | TEN | J | C§3.1 |
| Bot ve sahte kazanan işleri | TEN | J; yalnız tek modda ve `DEMO_BOTS` / `DEMO_FAKE_WINNERS` açıksa kaydedilir; multi modda hiç kaydedilmez | `services/bot.js`, `services/fakeWinners.js` |
| Soket yayınları | TEN | S: `t:<tenantId>:admin`, `t:<tenantId>:chat:<roomId>`, `t:<tenantId>:live:<gameId>`, global yayınlar kiracı odasına | C§3.2 |
| Demo verisi, botlar, demo depozit | TEN | yalnız tek modda, `DEMO_*` bayraklarıyla (varsayılan kapalı); multi modda rota 404 ve sunucu bayrak açıkken başlamaz (K10) | `routes/admin.js:92-96,211-217`, V4 |
| Kurulum sihirbazı | PLAT | tek mod: varsayılan kiracı oluşturur (bugünkü gibi); multi mod: platform kurulumu ve ilk Platform Sahibi personeli (6.2), sonra kapanır | `routes/install.js:6-90` |
| Modül/lisans aç-kapa | PLAT hak + TEN tercih | `Tenant.entitlements` ∩ `module.*` | `modules/index.js:21-55` |

---

## 3. Eksik ve riskli yalıtım noktaları (sıralı)

Sıralama: başka operatörün parasına etki > başka operatörün oyuncu kişisel verisine erişim > yapılandırma etki
alanı > bilgi sızıntısı.

| # | Nokta | Etki | Kanıt |
|---|---|---|---|
| 1 | Personel yetkisi kapsam taşımıyor: `requireAdmin` yalnız `role` iddiası, roller global, `super_admin` kurulum geneli, her rol atanınca `role='admin'` | Bir operatörün herhangi bir personeli tüm operatörlerin verisine ve ayarına erişir | `middleware/auth.js:89-92`, `services/permissions.js:282-285,368` |
| 2 | Token kiracıya bağlı değil (tek `JWT_SECRET`, `{id, role}`) | A operatörünün tokeni B'nin alan adında çalışır | `controllers/auth.js:37-43` |
| 3 | In-house cüzdan callback'i `externalPlayerId`'yi doğrudan `User._id` sayıyor, sağlayıcı Operator `vip90` sabit | Kiracılar arası borç/alacak ve bakiye okuma | `[inhouse] inhouseProviderProxy.js:107,123-127,158-163,208` |
| 4 | Admin para onayları `findById(:id)` ile sahiplik kontrolsüz; Slikair payout gövdedeki `userId`'ye ödeme yapar | Başka operatörün oyuncusuna kredi/borç/ödeme | A§2.1 #4,8-11,14,28; B§4 #2-6 |
| 5 | Igames callback'leri global, unique olmayan `palaceUserCode` ile oyuncu buluyor, işlem ve ledger satırı yok, tekilleştirme anahtarı global | Yanlış kiracı oyuncusunun bakiyesi değişir; çakışan tekrar anahtarları | `[igames] igames.js:461-464,515-680` |
| 6 | Chat tip herhangi bir `toUserId`'ye; rain para basıyor | Kiracılar arası para akışı | `services/chat.js:348-535,685-700` |
| 7 | Global unique indeksler (20 adet) ve global arama anahtarları | İkinci kiracıda kayıt/tohumlama hata verir ya da yanlış kayıt eşleşir | A§1.6 |
| 8 | Para kurallarını belirleyen global yapılandırma: tek para birimi damgası, tek VIP tablosu, tek referans oranı, tek kripto tohumu, tek PSP/SMTP/Igames kimliği | B'nin oyuncusu A'nın kuralı ve hesabıyla işlem görür | A§5 #5, C§2.1 |
| 9 | Spor elle uzlaştırma uç noktası olay düzeyinde | Bir operatör admini tüm operatörlerin bahislerini uzlaştırır | `controllers/admin.js:522-554` |
| 10 | `role:admin` soket odası global | Her operatör admini herkesin depozit/çekim/KYC/ticket akışını görür | `services/adminCounts.js:40-57`, `services/activityFeed.js:32,65`, `services/kyc.js:419`, `services/ticket.js:31` |
| 11 | Webhook kiracı yönlendirmesi yok (Slikair kayıt, Sumsub URL, Igames token, in-house anahtar) | Yanlış kimlik bilgisiyle doğrulama, yanlış kiracıya kredi | C§1.2 |
| 12 | Zamanlanmış e-posta/SMS kitleleri global | Kampanya tüm operatörlerin oyuncularına tek marka ve gönderenle gider | `services/systemMail.js:210-235`, `services/smsTemplate.js:321` |
| 13 | Raporlar/analiz/sayaçlar kurulum geneli; `casino/stats.topUsers` kişisel veri içeriyor | Rakip operatörün GGR'ı ve oyuncu adları görünür | A§3, B§4 #17-18 |
| 14 | `User` hem oyuncu hem personel; Google girişi e-postayla otomatik bağlıyor | Kiracılar arası hesap birleşmesi; oyuncu kimliğiyle personel kimliği karışır | `services/socialAuth.js:185`, `models/User.js:8-14` |
| 15 | Global yayınlar: `winners:new` (kullanıcı adı), `online:count`, `bot:action` | Bilgi sızıntısı; rakibin trafiği görünür | C§3.2 |
| 16 | `CLIENT_URL` ilk köken varsayımı | Oyuncu başka operatörün alan adına yönlenir (OAuth, ödeme dönüşü, e-posta bağlantısı) | C§2.4 |
| 17 | Süreç içi önbellekler kiracı anahtarı taşımıyor | Bir kiracının ayarı 30 sn boyunca diğerine servis edilir | C§2.1 |
| 18 | Arka plan işleri tüm veriyi tarıyor; bot zamanlayıcısı loopback HTTP ile çağırıyor | Kiracı bağlamı olmayan yazımlar | C§3.1, `services/bot.js:22,236` |
| 19 | Sağlayıcı `Operator.allowedOrigins` tüm platform API'sine kimlikli CORS açıyor | Bir sağlayıcı müşterisinin kökeni oyuncu API'sini çağırabilir | `app.js:128-136` (doğrulandı) |
| 20 | KYC dosyaları kimlik doğrulamasız, kiracı öneki yok | Tahmin edilen dosya adıyla kimlik belgesi | `app.js:190-191`, `middleware/upload.js:12-21` |
| 21 | Demo davranışları (bot, sahte kazanan, demo depozit, demo verisi) çekirdekte varsayılan açık ya da bayraksız | Merkezi kurulumda gerçek operatörün oyuncusuna sahte etkinlik, ödemesiz bakiye; partner metriklerinde sahte hacim | `services/fakeWinners.js:32`, `services/bot.js`, V4 |

---

## 4. Önerilen veri modeli ve kiracı kimliğinin taşınması

### 4.1 Karar: paylaşımlı veritabanı + satır düzeyinde `tenantId`

| Ölçüt | Paylaşımlı DB + `tenantId` | Operatör başına DB |
|---|---|---|
| Mongo işlemleri | Tek bağlantı, bugünkü `withTransactionRetry` deseni aynen çalışır | Aynı replica set üzerinde DB'ler arası işlem mümkün ama Mongoose model-bağlantı eşlemesi her çağrıda değişmeli; `Event` (paylaşımlı) + `Bet` (kiracı) aynı işlemde farklı DB'lerde |
| Paylaşımlı katalog ve uzlaştırma | `Bet.find({selections.eventId})` tek sorgu, bahis başına kiracı bağlamı | Her olay için N veritabanında sorgu ve işlem |
| Varsayılan kiracı (K8) | Mevcut DB yerinde kalır, yalnız alan eklenir | Mevcut DB "varsayılan kiracı DB'si" olur; yeni kiracılar başka DB'de; iki ayrı kod yolu |
| Operasyon maliyeti | Tek yedek, tek indeks seti, tek izleme | N yedek, N indeks derlemesi, N bağlantı havuzu; Mongoose model kaydı bağlantı başına |
| Platform/partner raporlaması | Tek toplama (rollup) işi | N DB üzerinde dağıtık toplama |
| Yalıtım gücü | Uygulama katmanı (eklenti + testler) | Fiziksel |
| Gürültülü komşu | Paylaşımlı kaynak | Ayrık |
| Kiracı silme/taşıma | `tenantId` ile dışa aktarım betiği | DB kopyala/sil |

**Karar R1:** paylaşımlı veritabanı. Gerekçe: işlemler ve paylaşımlı spor kataloğu tek bağlantı istiyor, varsayılan
kiracı gereksinimi verinin yerinde kalmasını istiyor, partner/platform raporları tek toplama istiyor ve operasyon
ekibi tek sunucu modeline göre kurulu. Yalıtım gücü eksikliği eklenti + zorunlu test kosumu + denetimle telafi
edilir (bölüm 8, 9). İleride düzenleyici talep olursa "ayrık kiracı" katmanı eklenebilir: eklenti filtreyi bağlamdan
okuduğu için, model kaydını bağlantı başına yapan bir fabrika ile aynı kod ayrı DB'ye yönlendirilebilir. Bu iş şimdi
yapılmaz.

Varsayım (Y1, sahip yanıtlayana kadar): açılıştaki hiçbir operatör ülke içinde barındırma ya da ayrı veritabanı
istemez; bu yüzden R1 geçerlidir. Bir operatör isterse değişecekler:

- O kiracı için ayrı bağlantı (aynı ya da ülke içi ayrı küme); 4.4 madde 7'deki çözümleyici `tenantId` → bağlantı
  eşlemesini okur, modeller değişmez.
- Ayrık kiracıda paylaşımlı `Event` ile `Bet` aynı işlemde olamaz: uzlaştırma bahis başına kiracı bağlantısında
  çalışır (bugünkü tasarım zaten bahis başına `runWithTenant`), olay okuması platform bağlantısından yapılır.
- `TenantDailyStat` toplaması kiracı bağlantısında hesaplanıp platforma yalnız toplu satır olarak yazılır (kişisel
  veri ülke dışına çıkmaz).
- Yedek, izleme ve geçiş betikleri bağlantı başına çalışır; `forEachTenant` bağlantıyı da kurar.
- Ülke içi barındırma gerekiyorsa uygulama süreci de oraya gider: bu, ayrı bir dağıtım (aynı kod, `multi` mod, tek
  ya da birkaç kiracı) demektir ve Host yönlendirmesi DNS düzeyinde yapılır.

### 4.2 Karar: `Tenant` adı ve sağlayıcı `Operator` ile ilişki

- Mongoose kayıt defterinde `Operator` adı in-house sağlayıcıya ait (`[inhouse] engine/models/Operator.js:55`) ve
  aynı süreçte yüklü (`app.js:84-86`). Aynı adla ikinci model kaydedilemez.
- Sağlayıcı modellerinde (`OpenRound`, `ProviderRound`, `PlayerSeedPair`, `WalletCallbackOutbox`) ve core'da
  `GameSettings`'te `operatorId` alanı zaten "sağlayıcı müşterisi" anlamında kullanılıyor. Kiracı alanına da
  `operatorId` denirse eklentinin hangi modelde hangi anlamı filtrelediği belirsizleşir; `GameSettings`'te iki anlam
  aynı alanda çakışır.
- **Birleştirme reddedildi.** Sağlayıcı `Operator`'ı oyun sağlayıcısının B2B API müşterisidir: VIP90 dışındaki harici
  casinolar da olabilir, API anahtarı, IP listesi ve cüzdan callback URL'si vardır, yaşam döngüsü ve kodu private
  inhouse alt modülündedir. Platform kiracısı ise marka, alan adı, oyuncu, ödeme ve personel taşır ve yalıtım
  çekirdeği public core'da olacaktır (R6). Birleştirmek core'u private modüle bağımlı kılar.
- **Karar R2:** model `Tenant` (koleksiyon `tenants`), her kiracıya ait kayıtta alan `tenantId`. Arayüz ve belgelerde
  terim "Operatör" kalır. `Tenant.providerOperatorId` 1:1 olarak bir sağlayıcı `Operator` kaydını gösterir; bugünkü
  `operatorKey:'vip90'` kaydı varsayılan kiracıya bağlanır. Sonuç: `GameSettings.operatorId` adı değişmeden kiracı
  başına oyun yapılandırması taşır; sağlayıcı tarafı GGR'ı kiracı başına zaten ayrılmış olur.
- Bu belgede sahibin "operatorId" dediği kavram `tenantId` alanıyla uygulanır. Yeni ve çakışmayan modeller sahibin
  verdiği adları korur (`PartnerOperatorLink`, `PartnerGrant`), alanları `tenantId`'dir.

### 4.3 Modeller

#### 4.3.1 Platform Sahibi

Ayrı koleksiyon yok. Platform kök kapsamdır: `scopeType:'platform'`, `scopeId:null`. Platform ayarları
`Setting{scope:'platform'}` satırlarıdır. Platform personeli `StaffAccount` + `RoleAssignment{scopeType:'platform'}`.

#### 4.3.2 Tenant (Operatör)

```
Tenant {
  _id, key (global unique, URL/callback'te kullanılan kısa ad, değişmez),
  name, legalEntity { name, registrationNo, address },   // client/src/data/legalContent.js sabitinin yerine
  status: 'provisioning'|'active'|'suspended'|'closed',
  isDefault (yalnız bir kayıtta true; partial unique),
  ownership: 'direct'|'partner'   // bilgi amaçlı önbellek, doğruluk kaynağı PartnerOperatorLink
  providerOperatorId -> [inhouse] Operator (unique, sparse),
  entitlements: { modules: [moduleId], limits: {...} },   // platformun verdiği hak; kiracının aç/kapası Setting'te
  timezone, defaultLocale, baseCurrency, jurisdictionIds[],
  createdBy -> StaffAccount, createdVia: 'platform'|'partner', createdAt, closedAt
}
```

`baseCurrency` kiracının tek para birimidir (K14). Para taşıyan kayıtlardaki (`Transaction`, `Bet`, `CasinoRound`,
`TenantDailyStat`) `currency` alanı korunur ve doldurulur; böylece çoklu para birimi ileride şema kırılmadan
eklenebilir. Çoklu para birimi (kiracı başına birden çok bakiye) bu planın kapsamı dışıdır.

#### 4.3.3 Brand ve Domain

- `Brand`: mevcut modele `tenantId` eklenir; unique `{tenantId, slug}`; `isDefault` kiracı içinde partial unique.
- `Domain` (yeni, `Brand.domains[]` buraya taşınır):

```
Domain { host (küçük harf, global unique), tenantId, brandId, isPrimary, purpose: 'player'|'admin'|'api',
         verifiedAt, tls: { status, provider }, createdAt }
```

Ayrı koleksiyon gerekçesi: istek başına Host araması tek indeksli sorgu + süreç önbelleği; alan adı bir kiracıdan
diğerine taşınırken atomik güncelleme; TLS durumu takibi.

#### 4.3.4 Partner, yetenek seti ve PartnerOperatorLink (core, K18)

```
Partner { _id, key (unique), name, legalEntity, status, contact,
  capabilities: [capability],          // Platform Sahibi tanımlar (K16); varsayılan: metrics.read, staff.manage
  provisioningLimits: { maxTenants, allowedModules: [moduleId], entitlementCeiling: {...} },
  createdBy, createdAt }

PartnerOperatorLink {
  _id, partnerId, tenantId,
  validFrom (dahil), validTo (hariç, null = açık),
  capabilities: [capability] | null,   // null = partnerin seti; doluysa bu kiracı için daraltma (genişletemez)
  commercialTerms: { model: 'revshare_ggr'|'revshare_ngr'|'turnover'|'fixed', rate, currency, minimumFee },
  createdBy, endedBy, endReason
}
```

Yetenek kataloğu (Platform Sahibi partner başına seçer; her biri bir `partner:*` izin anahtarına karşılık gelir, 5.2):

| Yetenek | İzin anahtarı | Ne yapar | Sınır |
|---|---|---|---|
| `metrics.read` | `partner:metrics:read` | kendi operatörlerinin `TenantDailyStat` metrikleri ve komisyon | yalnız toplu (4.3.6) |
| `staff.manage` | `partner:staff:write` | kendi partner personeli ve rolleri | partner kapsamı dışına rol veremez |
| `tenants.create` | `partner:tenants:create` | kiracı oluşturma ve provizyon (tohum, sağlayıcı Operator kaydı, ilk `tenant_owner` daveti); oluşturulan kiracıya bu partnere açık bağlantı otomatik açılır | `maxTenants`; modüller `allowedModules` ve `entitlementCeiling` içinde |
| `tenants.configure` | `partner:tenants:config:write` | marka, tema, sayfa, VIP, promosyon şablonu, kiracı ayarları | para kurallarını belirleyen ayarlar (VIP oranı, referans oranı, limitler) kiracı tavanı içinde |
| `tenants.domains` | `partner:tenants:domains:write` | alan adı ekleme/kaldırma | DNS TXT doğrulaması olmadan etkinleşmez (G-11) |
| `tenants.staff` | `partner:tenants:staff:write` | operatör admin kullanıcıları oluşturma, devre dışı bırakma, kiracı rolü atama | aşağıdaki kendi kendine atama yasağı; `tenant_owner`'ı kaldıramaz (platform yapar) |
| `tenants.status` | `partner:tenants:status:write` | kendi operatörünü askıya alma/yeniden açma | kapatma (`closed`) ve veri silme yalnız platform |
| `tenants.integrations` | `partner:tenants:integrations:write` | sağlayıcı kimlik bilgilerini (PSP, KYC, SMTP/SMS, OAuth, Igames) **yalnız yazma** | geri okunmaz, maskeli; varsayılan kapalı; her değişiklik kiracı sahibine bildirim |

Kurallar:

- Etkin izin = partner personelinin rol izinleri ∩ `Partner.capabilities` ∩ (`PartnerOperatorLink.capabilities` doluysa
  o). Hepsi istek anında, geçerli (`validTo` geçmemiş) bağlantıyla kontrol edilir; bağlantı kapanınca partner
  o kiracıda hiçbir şey yapamaz.
- Hiçbir yetenek oyuncu kişisel verisine, bakiyeye, finansal harekete ya da para onayına erişim vermez; bunlar
  yalnız `PartnerGrant` ile (4.3.5).
- Kendi kendine atama yasağı: partner kapsamında rolü olan bir `StaffAccount`, o partnere bağlı bir kiracıda kiracı
  kapsamlı rol alamaz (doğrulayıcı reddeder). Aksi halde partner, kendine operatör admin hesabı açarak `PartnerGrant`
  sınırını aşardı. İstisna yalnız Platform Sahibi tarafından, süreli ve denetimli verilir.
- Partner bir kiracıyı başka partnere taşıyamaz ve bağlantı koşullarını değiştiremez; bunlar Platform Sahibi
  işidir.

- Değişmezlik kuralı: bir kiracı için aynı anda en fazla bir açık bağlantı (uygulama düzeyinde işlem içinde kontrol
  + `{tenantId, validTo:null}` partial unique).
- Partner değiştirme ya da doğrudan yönetime geçiş = mevcut bağlantıyı `validTo=now` ile kapat, yenisini aç (ya da
  açma). Kiracı verisine hiç dokunulmaz (K2).
- Komisyon hesabı: `TenantDailyStat` günü × o günde geçerli bağlantının koşulları.

#### 4.3.5 PartnerGrant (açık erişim izni)

```
PartnerGrant {
  _id, partnerId, tenantId,
  scopes: [scope],
  grantedBy -> StaffAccount (kiracı personeli, izin: admin:partner-grants:write),
  reason, validFrom, expiresAt (zorunlu, en fazla 90 gün), revokedAt, revokedBy
}
```

Kapsamlar (okuma ve sınırlı yazma):

| Kapsam | Tür | İçerik | Verebilen |
|---|---|---|---|
| `players:read` | okuma | oyuncu listesi, maskeli kişisel veri | `tenant_owner`, kiracı `admin` |
| `players:pii` | okuma | maskesiz kişisel veri, KYC durumu (belge dosyası hariç) | `tenant_owner` |
| `finance:read` | okuma | bakiyeler, işlemler, depozit/çekim | `tenant_owner`, kiracı `admin` |
| `reports:raw` | okuma | ham raporlar | `tenant_owner`, kiracı `admin` |
| `support:write` | sınırlı yazma | ticket yanıtlama, oyuncu notu | `tenant_owner` |
| `players:status:write` | sınırlı yazma | oyuncu hesabını kilitleme/açma (sorumlu oyun ve dolandırıcılık şüphesi) | `tenant_owner` |
| `promotions:assign` | sınırlı yazma | mevcut bir promosyonu oyuncuya atama (yeni bütçe yaratmaz) | `tenant_owner` |

Kural: izin yalnız kiracı tarafından verilir, partner kendine izin veremez. Hiçbir kapsam bakiye düzeltme, para
onayı, çekim, KYC kararı ya da KYC belge dosyasına erişim vermez. Her izinli okuma ve yazma `AuditLog`'a
`actorScope:'partner'`, `tenantId`, `onBehalfOfTenantId`, `grantId` ile yazılır ve kiracının denetim ekranında görünür.
Bağlantı kapanınca izinler otomatik geçersizdir (istek anında `PartnerOperatorLink` geçerliliği de kontrol edilir).

#### 4.3.6 TenantDailyStat (toplama tablosu)

```
TenantDailyStat { tenantId, brandId?, date (kiracı saat diliminde), currency,
  casinoTurnover, casinoGgr, sportsTurnover, sportsGgrRealized, bonusCost, deposits, withdrawals,
  activePlayers, newPlayers, depositors, ftd, computedAt }
unique {tenantId, brandId, date, currency}
```

Bir iş tarafından `isSeed`, `isBot` ve demo etkinliği hariç doldurulur. Partner uç noktaları yalnız bu koleksiyonu
okur; fiziksel olarak kişisel veri döndüremez. Küçük hücre bastırma: aktif oyuncu < 5 ise partner görünümünde "<5".
Koleksiyon, işi ve partner uç noktaları core'dadır (K18). `currency` alanı kiracının tek para birimidir (K14);
anahtarda kalır ki çoklu para birimi geldiğinde şema değişmesin.

#### 4.3.7 Denetim

`AuditLog` ve `AdminAction` alanları eklenir: `tenantId` (null = platform), `actorType: 'staff'|'player'|'system'`,
`actorScope: 'platform'|'partner'|'tenant'`, `actorStaffId`, `partnerId`, `onBehalfOfTenantId`, `capability`,
`grantId`. "Kiracı adına çalışma" kuralı platform personeli **ve partner personeli** için aynıdır: kiracı
kapsamı dışından bir personel kiracı üzerinde okuma ya da yazma yaptığında kayıt `onBehalfOfTenantId` ile yazılır;
partner için ayrıca `partnerId` ve işlemi mümkün kılan `capability` (kurulum yazımı) ya da `grantId` (oyuncu/para
verisi) zorunludur. Kurulum yazımları (kiracı oluşturma, ayar, alan adı, personel) her zaman kaydedilir; okumalar
`PartnerGrant` kapsamındaysa kaydedilir. Görünürlük: kiracı kendi `tenantId` kayıtlarını görür (platformun ve
partnerin kendi kiracısı üzerindeki işlemleri dahil); platform hepsini; partner yalnız kendi `actorScope:'partner'`
kayıtlarını. Denetim kayıtları yalnız eklenir, silme/güncelleme uç noktası yoktur; TTL 365 gün korunur, platform
kayıtları için ayrı saklama süresi açık sorudur.

#### 4.3.8 StaffAccount ve RoleAssignment

```
StaffAccount { _id, email (global unique), username, passwordHash, status,
  twoFactor { enabled, secretEnc, backupCodesHash[] },   // multi modda zorunlu (K12); tek modda isteğe bağlı
  tokenVersion, lastLoginAt, createdBy, createdAt }

Role { _id, scopeType: 'platform'|'partner'|'tenant', scopeId (null = şablon), name, permissions[], isSystem }
unique {scopeType, scopeId, name}

RoleAssignment { staffId, roleId, scopeType, scopeId, grantedBy, createdAt }
unique {staffId, scopeType, scopeId, roleId}
```

Bir personel birden çok kapsamda rol taşıyabilir (ör. platform personeli + varsayılan kiracıda rol). İstisna:
partner kapsamlı rolü olan personel, o partnere bağlı kiracılarda kiracı rolü alamaz (4.3.4, kendi kendine atama
yasağı). İstekte etkin kapsam tektir (5.3).

2FA: multi modda her personel için zorunludur; ilk girişte kurulum zorlanır (K12). Tek modda isteğe bağlıdır; etkin
olan hesapta girişte kod sorulur (V2).

### 4.4 `tenantId`'nin taşınması

1. **Alan:** her TEN koleksiyonunda `tenantId: { type: ObjectId, ref: 'Tenant', required: true, index: true,
   immutable: true }`. Geçiş süresince `required` İP-2 sonunda açılır.
2. **Bileşik indeksler:** her global unique `{tenantId, alan}` olur (2.1 tablosu); mevcut sorgu indeksleri
   `tenantId` ile başlayan sürümlerle değiştirilir (ör. `{tenantId, userId, createdAt}`). Global kalanlar: `Domain.host`,
   `Tenant.key`, `StaffAccount.email`, `Transaction.idempotencyKey`, `CryptoDeposit.txHash`,
   `SlikairPayment.requestId`, `InhouseCallbackReceipt.txnId`, `Event.externalId`, sağlayıcı indeksleri.
3. **İstek bağlamı:** `AsyncLocalStorage` tabanlı `tenantContext`:

```
ctx = { tenantId, brandId, actor: { kind: 'player'|'staff'|'system', id, scope }, mode: 'tenant'|'platform', reason }
tenantContext.run(ctx, fn)        // HTTP middleware, soket olay sarmalayıcısı, iş döngüsü
tenantContext.get()               // eklenti ve servisler
runWithTenant(tenantId, fn)       // bir kayıttan türetilen kiracıyla (callback, uzlaştırma)
runAsPlatform(reason, fn)         // açık kapsam dışı çalışma; reason zorunlu, log'a yazılır
forEachTenant(fn, {status})       // işler: kiracıları sırayla dolaşır, her biri kendi bağlamında
```

   Bağlamın kaybolduğu bilinen yerler: `setInterval` geri çağrıları (işler `forEachTenant` kullanır), Socket.IO olay
   işleyicileri (her işleyici `socket.data.tenantId` ile sarılır), Mongoose post-save kancaları (bağlam
   `CasinoRound`/`Bet` kaydının `tenantId`'sinden yeniden kurulur), `EventEmitter`. Bunlar için test zorunlu (8.1).
4. **Eklenti `tenantScoped`:**
   - `find*`, `count*`, `distinct`, `update*`, `replaceOne`, `delete*`, `findOneAnd*` ön kancaları: bağlamda
     `mode:'tenant'` varsa filtreye `tenantId` ekler; filtrede farklı bir `tenantId` varsa hata.
   - `aggregate` ön kancası: başa `$match:{tenantId}` ekler; `$lookup` hedefi TEN modeliyse alt boru hattına
     da `tenantId` eşlemesi şart, yoksa hata (`$lookup` yalnız `tenantLookup()` yardımcısıyla).
   - `save`/`insertMany`/`create`: `tenantId` boşsa bağlamdan doldurur, doluysa bağlamla eşit olmalı.
   - `bulkWrite` ve `Model.collection.*` ham erişim kanca çalıştırmaz: lint kuralı ile TEN modellerinde yasak,
     yalnız `runAsPlatform` içinde izinli (bugünkü kullanıcı: `services/ledgerDedupe.js`).
   - Bağlam yoksa ya da `mode:'platform'` değilse ve filtrede `tenantId` yoksa davranış zorlama moduna göre:
     `off` = hiçbir şey, `log` = uyarı + sayaç + örnek yığın, `enforce` = `TenantScopeError`.
   - `findById(id)` de bu kancalardan geçer (`findOne({_id})`); böylece bugünkü kontrolsüz `:id` aramaları otomatik
     olarak `{_id, tenantId}` olur. Bu, 3. bölüm #4'ün asıl çözümüdür; uç nokta bazında ek kontrol yine de yazılır.
5. **Açık kapsam dışı çalışma:** yalnız `runAsPlatform(reason, fn)`. Kullanım yerleri sınırlı ve listelenir: olay
   uzlaştırma döngüsü (bahisleri bulur, sonra her bahis için `runWithTenant`), `TenantDailyStat` toplama işi,
   platform raporları, kiracı provizyonu, geçiş betikleri, ledger dedupe. Lint: `runAsPlatform` çağrısı yalnız izinli
   dosya listesinde.
6. **Platform modelleri** (`Event`, `Permission`, `Migration`, `Tenant`, `Domain`, `Partner…`) eklentiyi almaz.
7. **Kiracı başına bağlantıya hazırlık (Y1):** TEN modelleri doğrudan `mongoose.model(...)` ile değil, tek bir
   `defineTenantModel(name, schema)` yardımcısıyla tanımlanır; servisler modeli bu kayıttan alır. Bugün yardımcı
   varsayılan bağlantıyı döndürür. İleride bir kiracı ayrı veritabanı isterse yalnız `resolveConnection(tenantId)`
   eklenir: yardımcı modeli bağlamdaki kiracının bağlantısında (bağlantı başına bir kez) derler. Eklenti ve sorgu
   koruması filtreyi yalnız `tenantContext`'ten okur, bağlantı varsayımı yapmaz; `runAsPlatform` ve `forEachTenant`
   bağlantıyı da bağlama koyar. Kabul: İP-1 testlerinde sahte ikinci bağlantıyla bir modelin kod değişmeden ona
   yönlenebildiği gösterilir.

### 4.5 Ayarlar ve kimlik bilgileri

- `Setting` anahtarı `{scope: 'platform'|'tenant'|'brand', tenantId, brandId, key}` olur, unique bu dörtlüde.
  Okuma sırası: marka → kiracı → platform varsayılanı → env (yalnız varsayılan kiracı ve `TENANCY_MODE=single` için).
- Tüm ayar depolarının önbelleği `tenantId[:brandId]` anahtarlı olur. Tek değişiklik noktası
  `config/secretSettingsStore.js:29-133`; diğer 16 kopya (C§2.1) aynı fabrikaya taşınır.
- Kiracı başına kimlik bilgisi (K6): Slikair, SMTP/Mailtrap, Twilio, Google OAuth, Telegram botu, Sumsub, Igames
  agent hesabı (her operatörün kendi agent hesabı ve kimlik bilgileri, K13), banka hesap bilgisi, kripto (S1'e bağlı).
  Multi modda env kimlik bilgileri hiçbir kiracıya düşmez (K10: merkezi kurulumda varsayılan kiracı yok). Platform geneli: odds feed anahtarı, lisans, AI yardım,
  Sentry, ops uyarıları, Turnstile (site anahtarına her alan adı eklenir).
- Sırlar `utils/secretCrypto.js` ile şifrelenir; KYC sırları da (bugün düz metin, 10. bölüm). Anahtar
  `OPERATOR_SECRET_ENCRYPTION_KEY` tek kalır; kiracı başına veri anahtarı (zarf şifreleme) kiracı dışa aktarımı
  gerekiyorsa sonraki iş.
- `CRYPTO_SETTINGS` bellekten `Setting`'e taşınır (bugün yeniden başlatmada kayboluyor).
- `CLIENT_URL` ilk köken kullanımı (10 yer) `getTenantBaseUrl(tenantId, brandId)` = birincil `Domain` ile değişir;
  CORS izin listesi `Domain` koleksiyonundan üretilir. Sağlayıcı `Operator.allowedOrigins` CORS'u yalnız
  `/api/provider/v1` için genişletir.

### 4.6 Paylaşımlı katalog ve uzlaştırma

- `Event` CAT kalır; tek odds feed (platform anahtarı). Kiracı tercihleri (`oddsProvider.enabledCategories`,
  `bet.prioritySport/Country`) kiracı ayarıdır; kiracı başına marj/görünürlük kaplaması bu işin dışındadır (S2).
- Otomatik uzlaştırma (`[betting] settlement.js:11-149`) `runAsPlatform('event-settlement')` içinde bahisleri bulur,
  her bahsi `runWithTenant(bet.tenantId)` içinde kendi işleminde uzlaştırır; referans/VIP/cashback kiracı
  yapılandırmasını kullanır.
- Elle uzlaştırma (`POST /api/admin/events/:id/settle`) platform iznine (`platform:events:settle`) taşınır.
  Kiracı personeli yalnız okur. Elle olay oluşturma/düzenleme de platformdadır.

---

## 5. Yetki matrisi, kimlik ayrımı, JWT ve kiracı çözümleme

### 5.1 Kimlik ayrımı (R3)

| Seçenek | Artı | Eksi |
|---|---|---|
| Kapsamlı tek `User` (`principalType` + kapsam alanı) | Göç küçük, mevcut `ref:'User'` alanları aynen | Oyuncu ve personel aynı unique uzayında; partner/platform personeli kiracısız `User` olur ve eklentinin istisnası gerekir; `requireAdmin` sınıfı hataların etki alanı sürer |
| **Ayrı `StaffAccount`** | Oyuncu tablosu saf kiracı verisi; personel kiracıdan bağımsız (partner, platform); personele zorunlu 2FA ve ayrı oturum politikası; oyuncu tokeni hiçbir koşulda admin rotasına giremez | `createdBy/updatedBy/reviewedBy/approvedBy/resolvedBy/grantedBy/triggeredBy/actorId` gibi personel referanslarının hedefi değişir |

**Karar:** ayrı `StaffAccount`. Göç maliyeti şöyle düşürülür: mevcut admin `User` kayıtları **aynı `_id`** ile
`StaffAccount`'a kopyalanır, böylece mevcut personel referansları geçerli id olarak kalır; şemalardaki `ref`
değerleri `StaffAccount`'a çevrilir. Eski `User` kaydı `role:'user'`, `staffMigratedAt` ile işaretlenir ve oyuncu
girişine kapatılır (bu kayıtlar oyuncu olarak oynamadıysa geçişten sonra arşivlenir). Uyumluluk: `TENANCY_MODE=single`
iken `/api/auth/login` kullanıcı adını önce oyuncularda, bulamazsa personelde arar ve personel tokeni döner; mevcut
admin giriş deneyimi değişmez. `multi` modda personel girişi `/api/staff/auth/login` üzerindendir.

Agent ayrı bir kimlik değildir: Agent bugün olduğu gibi `isAgent` işaretli bir oyuncu `User`'ıdır ve kiracıya aittir.
Agent'ın self-servis yüzeyi yok; eklenirse oyuncu tokeniyle, kiracı içinde, `agent:*` izinleriyle çalışır.

### 5.2 Roller

Tohum roller kapsam şablonu olur:

- Platform: `platform_owner` (her şey, rol yönetimi dahil), `platform_ops` (sağlık, işler, olay uzlaştırma,
  katalog), `platform_finance` (kiracı faturalama, toplamlar), `platform_support` (kiracı adına salt okuma, denetimli).
- Partner: `partner_admin` (kendi personeli, metrikler ve yetenek setinin izin verdiği tüm kurulum yazımları),
  `partner_ops` (yetenek seti içinde kiracı oluşturma/yapılandırma/alan adı/operatör admin kullanıcıları; partner
  personelini yönetemez), `partner_analyst` (yalnız metrikler). Etkin izin her zaman rol ∩ yetenek seti (R10);
  yetenek seti dışındaki bir izni taşıyan partner rolü kaydedilebilir ama etkisizdir.
- Partner izin ad alanı: `partner:metrics:read`, `partner:staff:write`, `partner:tenants:create`,
  `partner:tenants:config:write`, `partner:tenants:domains:write`, `partner:tenants:staff:write`,
  `partner:tenants:status:write`, `partner:tenants:integrations:write`, `partner:grants:use` (verilmiş
  `PartnerGrant` kapsamlarını kullanma). Hiçbir `partner:*` anahtarı `admin:*` oyuncu/para izni ima etmez.
- Kiracı: bugünkü `super_admin` → `tenant_owner`; `admin`, `finance`, `risk_analyst`, `casino_manager`, `support`,
  `content_manager` aynı adlarla kiracı kapsamında. Kiracı kendi özel rollerini oluşturabilir (`scopeId=tenantId`).
- İzin anahtarları önek alır: `platform:*`, `partner:*`, `admin:*` (kiracı, mevcut anahtarlar geriye uyum için
  korunur). Kiracı rolüne `platform:*` anahtarı atanamaz (doğrulayıcı reddeder).

### 5.3 Yetki matrisi

`✔` = izinli, `R` = salt okuma, `A` = yalnız toplulaştırılmış, `G` = yalnız açık `PartnerGrant` ile ve denetimli,
`T` = kiracı adına, `onBehalfOfTenantId` ile denetimli, `P` = partner: yalnız geçerli bağlantılı kendi kiracıları,
yalnız Platform Sahibinin verdiği yetenek seti içinde, `onBehalfOfTenantId` + `capability` ile denetimli (K16),
`S` = yalnız kendi kaydı, `-` = yok. Partner sütunları: `Partner admin` / `Partner ops` / `Partner analyst`.

| Yetenek | Platform owner | Platform ops | Platform finance | Platform support | Partner admin | Partner ops | Partner analyst | Kiracı owner | Kiracı admin | Kiracı finance | Kiracı risk/KYC | Kiracı support | Kiracı casino/content | Agent | Oyuncu |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Partner yetenek setini ve provizyon sınırlarını tanımlama | ✔ | - | R | R | R (kendi) | R (kendi) | R (kendi) | - | - | - | - | - | - | - | - |
| Kiracı oluşturma ve provizyon | ✔ | ✔ | R | R | P (`tenants.create`) | P (`tenants.create`) | - | - | - | - | - | - | - | - | - |
| Kiracı askıya alma / yeniden açma | ✔ | - | R | R | P (`tenants.status`) | - | - | R (kendi) | R (kendi) | - | - | - | - | - | - |
| Kiracı kapatma, veri silme/dışa aktarma | ✔ | - | R | R | - | - | - | R (kendi) | R (kendi) | - | - | - | - | - | - |
| Partner CRUD | ✔ | - | R | R | R (kendi) | R (kendi) | R (kendi) | - | - | - | - | - | - | - | - |
| Partner-kiracı bağlantısı değiştirme (taşıma, koşullar) | ✔ | - | R | - | R (kendi) | R (kendi) | R (kendi) | R (kendi) | R | - | - | - | - | - | - |
| Kiracı hakları (modül/limit) | ✔ | R | R | R | P (partner tavanı içinde, `tenants.create`/`tenants.configure`) | P (aynı) | - | R | R | - | - | - | - | - | - |
| Kiracı yapılandırması (marka, tema, sayfa, VIP, promosyon, ayar) | T | T | - | R/T | P (`tenants.configure`) | P (`tenants.configure`) | - | ✔ | ✔ | - | - | - | ✔ | - | - |
| Alan adı ekleme/kaldırma (DNS doğrulamalı) | ✔ | ✔ | - | - | P (`tenants.domains`) | P (`tenants.domains`) | - | istek | istek | - | - | - | - | - | - |
| Sağlayıcı kimlik bilgileri (PSP, KYC, SMTP/SMS, Igames, OAuth) | T | T | - | - | P (yalnız yazma, maskeli, `tenants.integrations`) | P (aynı) | - | ✔ | ✔ | R (maskeli) | - | - | - | - | - |
| Platform kimlik bilgileri (odds feed, lisans, şifreleme anahtarı) | ✔ | ✔ | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Oyuncu kişisel verisi | T | - | - | T (R) | G | G | - | ✔ | ✔ | R | ✔ | R | - | S (kendi oyuncuları, kullanıcı adı) | S |
| Oyuncu desteği ve durum (ticket, not, hesap kilidi, promosyon atama) | T | - | - | T | G (sınırlı yazma kapsamları) | G (aynı) | - | ✔ | ✔ | - | ✔ | ✔ | ✔ (promosyon) | - | - |
| Bakiyeler, finansal hareketler (okuma) | T | - | A | T (R) | G | G | - | ✔ | ✔ | ✔ | R | R | - | S (kendi oyuncuları) | S |
| Bakiye düzeltme, para onayı | - (yalnız kiracı devri sözleşmesiyle T) | - | - | - | - (grant ile de yok) | - | - | ✔ | ✔ | ✔ | - | - | - | agent→oyuncu transferi (kiracı izni) | - |
| Raporlar ham | T | R (teknik) | - | - | G | G | - | ✔ | ✔ | ✔ | R | - | R (casino) | - | - |
| Raporlar toplu (`TenantDailyStat`) | ✔ (tüm kiracılar) | ✔ | ✔ | R | A (kendi kiracıları) | A (kendi kiracıları) | A (kendi kiracıları) | ✔ | ✔ | ✔ | - | - | - | - | - |
| Paylaşımlı spor olayı uzlaştırma | ✔ | ✔ | - | - | - | - | - | - | - | - | - | - | - | - | - |
| RTP/oyun limitleri | ✔ (tavanlar) | ✔ | - | - | P (platform tavanı içinde, `tenants.configure`) | P (aynı) | - | ✔ (tavan içinde) | ✔ | - | - | - | ✔ | - | - |
| PartnerGrant verme/geri alma | - | - | - | - | - | - | - | ✔ | ✔ (yalnız okuma kapsamları) | - | - | - | - | - | - |
| Denetim kaydı okuma | ✔ (hepsi) | R | R | R | S (kendi partnerinin işlemleri) | S | S | ✔ (kiracı) | ✔ | R | R | - | - | - | - |
| Platform ve partner personeli yönetimi | ✔ (platform, partner) | - | - | - | ✔ (kendi partneri, `staff.manage`) | - | - | - | - | - | - | - | - | - | - |
| Kiracı personeli ve rol yönetimi | T | - | - | - | P (`tenants.staff`; `tenant_owner` kaldırma yok; kendi kendine atama yasak) | P (aynı) | - | ✔ (kiracı) | ✔ (owner hariç) | - | - | - | - | - | - |

"T" ve "P" kuralı (kiracı adına çalışma): kiracı kapsamı dışındaki personel (platform ya da partner) kiracı verisine
yalnız `X-Tenant-Id` başlığıyla etkin kiracı seçerek erişir. Partner için seçilebilen kiracılar yalnız geçerli
`PartnerOperatorLink`'i olanlardır; başka partnerin kiracısı 404 döner (varlık sızdırılmaz). Her yazma ve her
`PartnerGrant` kapsamındaki okuma `onBehalfOfTenantId` ile denetim kaydına yazılır (4.3.7) ve kiracının denetim
ekranında görünür. Platform personelinin kiracı adına para hareketi yapması varsayılan olarak kapalıdır (açık soru
S5); partner için bu hiçbir koşulda yoktur.

### 5.4 Token yapısı

İki ayrı token ailesi, ayrı imza anahtarları:

```
Oyuncu erişim tokeni (JWT_SECRET):   { sub: userId, typ: 'player', tid: tenantId, tv: tokenVersion, aud: 'player' }
Personel erişim tokeni (JWT_STAFF_SECRET): { sub: staffId, typ: 'staff', scp: 'platform'|'partner'|'tenant',
                                             sid: scopeId|null, tv, aud: 'staff', amr: ['pwd','otp'] }
Yenileme tokeni: aynı ayrım, httpOnly çerez, host'a bağlı (domain özniteliği yok, bugünkü gibi)
```

- `requireAuth` (oyuncu): imza + `aud:'player'` + `tid == req.tenant.id` + DB `tokenVersion` + `User.tenantId == tid`.
- `requireStaff(scope)`: imza + `aud:'staff'` + 2FA kontrolü + etkin kapsam kontrolü. 2FA kontrolü: multi modda
  `amr` içinde `otp` her personel için zorunlu (K12); tek modda yalnız hesapta 2FA etkinse zorunlu (V2), etkin
  değilse bugünkü gibi parola yeterli.
  - `scp:'tenant'`: `sid == req.tenant.id` (personel paneli kiracının kendi alan adında `/admin` altında).
  - `scp:'platform'`: platform konsolu host'u; kiracı verisi için `X-Tenant-Id` zorunlu ve `T` kuralı.
  - `scp:'partner'`: yalnız `/api/partner/*` ve konsol host'u; kiracı seçimi (`X-Tenant-Id`) geçerli bağlantılı
    kiracılarla sınırlı; kiracı yazımları yetenek seti ve `P` kuralıyla (5.3).
- Bugünkü `role` iddiası kalkar; `requireAdmin` `requireStaff('tenant')` olur.
- Soket: el sıkışmada aynı doğrulama; `socket.data = { tenantId, actor }`; tüm `/live` ve `/chat` el sıkışmaları
  `tokenVersion` ve `isSeed` kontrolünü de yapar (bugün yapmıyor, B§2).

### 5.5 Kiracı çözümleme

```
oyuncu isteği:  Host → Domain.host (önbellek, 60 sn) → { tenantId, brandId } → req.tenant
                bulunamazsa: single modda varsayılan kiracı; multi modda 404 (platform açılış sayfası değil)
personel:       token kapsamı + (tenant kapsamında) Host eşleşmesi; platform kapsamında X-Tenant-Id
callback:       URL yolundaki Tenant.key ya da kaydın tenantId'si (bölüm 2.2), Host'a güvenilmez
iş/soket:       kaydın tenantId'si ya da socket.data.tenantId
```

- Host kaynağı: `trust proxy` bugün 1 sekme; Cloudflare → nginx → node zincirinde Host başlığı nginx'ten gelir.
  `X-Forwarded-Host` yalnız güvenilen proxy'den kabul edilir; bugünkü şifre sıfırlama bağlantısı
  (`controllers/auth.js:424-435`) da `Domain` birincil adresine geçer.
- Çapraz kontroller (her biri test edilir, 8.1):
  1. Oyuncu tokeni `tid` ≠ Host kiracısı → 401.
  2. Kiracı personel tokeni `sid` ≠ Host kiracısı → 403.
  3. Kaydın `tenantId` ≠ bağlam kiracısı → eklenti hatası (`enforce`) / uyarı (`log`).
  4. Callback: URL kiracısı ≠ kaydın kiracısı ya da ≠ imzayı doğrulayan kimlik bilgisinin kiracısı → 401, kredi yok.
  5. Soket odasına katılma: oda kaydının `tenantId` ≠ `socket.data.tenantId` → ret.

### 5.6 Agent ile Partner ilişkisi

| Boyut | Agent (bayi, mevcut) | Partner (yeni) |
|---|---|---|
| Düzey | Kiracının içinde, oyuncuların üstünde | Kiracıların üstünde, platformun altında |
| Sahiplik | Oyuncuları (`players[]`, `User.agentId`) | Hiçbir kiracı verisine sahip olmaz; yalnız değiştirilebilir bağlantı |
| Kimlik | `isAgent` işaretli oyuncu `User` | `StaffAccount` + partner kapsamlı rol |
| Para | Nakit bakiyesi var, oyuncuya aktarır, komisyon kodu ölü (`services/agent.js:326-368`) | Oyuncu cüzdanına hiç dokunmaz; ticari komisyon `TenantDailyStat` × bağlantı koşulu |
| Görünürlük | Kendi oyuncularının kişisel verisi ve bakiyesi | Toplulaştırılmış metrik; ham veri yalnız `PartnerGrant` ile |
| Yazma | Oyuncuya bakiye transferi (kiracı izniyle) | Kendi operatörlerinin kurulumu (yetenek seti, K16); oyuncu ve para yok |
| Yer | Core, TEN | Core (K18), PART |

Karar: ayrı kalırlar (K7). Agent `tenantId` alır, `Agent.balance` ve `agent_*` ledger satırları kiracı defteri olarak
kalır. Ad çakışmasından kaçınmak için partner izinleri `partner:*`, model `Partner`; `admin:agent:*` dokunulmaz.
"Agent" kelimesi ayrıca Igames agent hesabı ve uzaktan bakım ajanı (`server/src/agent/*`) anlamında da geçiyor
(B§7); belgelerde "bayi (Agent)", "Igames agent hesabı", "bakım ajanı" diye ayrıştırılır. Partner komisyonu
oyuncudan oyuncuya `ReferralCommission` mekanizmasını kullanmaz.

---

## 6. Kurulum ve geçiş stratejisi (yeni merkezi kurulum; tek operatörlü kurulumlar bozulmadan)

İki yol vardır (K10, K11, R9):

- **Ana yol: yeni merkezi kurulum.** Boş veritabanı, `TENANCY_MODE=multi`. Sıra: platform kurulumu → ilk Platform
  Sahibi personeli → partnerler → kiracılar (6.2). Varsayılan kiracı yoktur; demo verisi ve demo davranışı yoktur.
- **Geriye uyum yolu: mevcut tek operatörlü kurulumlar.** Varsayılan kiracı geçişi G1-G8 (6.3). Bu kurulumlar tek
  modda kalır; multi'ye dönüştürülmez. `app.vip90.bet` de bu yoldaki tek kurulumlardan biridir: demo/satış ortamı
  olarak kalır, merkezi kuruluma **taşınmaz** ve çok kiracılı işin kabul ölçütlerinde kanıt kaynağı değildir.

Mevcut bir tek kurulumu multi'ye çevirmek (ve onun verisini merkezi kuruluma taşımak) bu planın parçası değildir;
gerekirse ayrı tasarım ister. v1'deki G9 (global unique indekslerin düşürülmesi) ve G10 (tek kurulumda multi'ye
geçiş) bu yüzden plandan çıkarıldı: yeni kurulum yalnız bileşik indekslerle açılır.

### 6.1 Modlar ve bayraklar

| Değişken | Değerler | Varsayılan | Anlamı |
|---|---|---|---|
| `TENANCY_MODE` | `single`, `multi` | `single` | `single`: her istek varsayılan kiracı; `Domain` kaydı gerekmez; env kimlik bilgileri geçerli; ikinci kiracı oluşturulamaz. `multi`: Host çözümleme zorunlu, varsayılan kiracı yok, env sağlayıcı kimlik bilgileri hiçbir kiracıya düşmez |
| `TENANCY_ENFORCEMENT` | `off`, `log`, `enforce` | tek mod: `off` (İP-1), `log` (İP-5'ten itibaren); multi: her zaman `enforce` | Eklentinin kapsamsız sorgu davranışı (4.4). Tek modda `enforce` isteğe bağlıdır (tek kiracıda kapsamsız sorgu veri sızdırmaz; kendi kendine güncelleyen kurulumları kırmamak için zorlanmaz, Y3) |
| `DEMO_BOTS`, `DEMO_FAKE_WINNERS`, `DEMO_INSTANT_DEPOSIT`, `DEMO_DATA` | `true`/`false` | `false` | Bot oyuncular, sahte kazananlar, ödemesiz demo depozit (V4), demo verisi yükleme. Kapalıyken iş kaydedilmez, rotalar 404, istemci düğmeleri gizli (R11) |

Açılış kontrolleri: `multi` yalnız `enforce` ile başlar; `multi` iken herhangi bir `DEMO_*` bayrağı açıksa,
`JWT_STAFF_SECRET` ya da `OPERATOR_SECRET_ENCRYPTION_KEY` yoksa sunucu başlamaz.

Tek kurulumlar için not: `DEMO_*` varsayılanının kapalı olması bugünkü davranışı değiştirir (sahte kazananlar bugün
`services/fakeWinners.js:32` ile varsayılan açık). `app.vip90.bet` gibi demo kurulumları güncellemeden önce
bayrakları `.env`'de açıkça açar; CHANGELOG'da **Kırılan Değişiklikler** altında yazılır. Bu, sahibin "bayrakların
arkasında, varsayılan kapalı" kararının (K10) bilinçli sonucudur; gerçek operatör kurulumları için daha güvenlidir.

### 6.2 Ana yol: yeni merkezi kurulum

| Adım | Ne yapılır | Doğrulama | Geri alma |
|---|---|---|---|
| N1 Platform kurulumu | Boş DB, `TENANCY_MODE=multi`, `TENANCY_ENFORCEMENT=enforce`, `DEMO_*` kapalı. Açılış geçişi `platform-001-bootstrap`: `Permission` kataloğu, rol şablonları (5.2), platform `Setting` varsayılanları, yalnız bileşik indeksler (eski global unique indeksler hiç oluşturulmaz). Varsayılan kiracı ve demo tohumu oluşturulmaz | açılış kontrolleri geçer; `listIndexes` beklenen kümeye eşit; `Tenant` sayısı 0 | DB'yi sil, baştan kur (veri yok) |
| N2 İlk Platform Sahibi | Tek seferlik CLI (`scripts/platform-bootstrap.mjs --owner-email`) ya da açılışta konsola yazılan tek kullanımlık kurulum tokeniyle ilk `StaffAccount` + `platform_owner`; ilk girişte 2FA kurulumu zorunlu; ardından kurulum sihirbazı multi modda kapanır | ikinci çalıştırma "zaten kurulu" der, hesap çoğaltmaz; 2FA'sız token hiçbir personel ucunda geçmez | hesabı devre dışı bırak, CLI ile yeniden oluştur |
| N3 Partnerler | Platform konsolunda `Partner` + yetenek seti + provizyon sınırları + ilk `partner_admin` daveti (2FA zorunlu) | 8.1 partner testleri staging'de; partner başka partnerin kiracısını göremez | partneri askıya al |
| N4 Kiracılar | Platform ya da yetenekli partner provizyonu: `Tenant`, `Brand`, `Domain` (DNS TXT doğrulaması, TLS), tohum alt kümesi (VIP, sayfa, şablon, sohbet odası, risk kuralı, segment; demo verisi ve bot yok), sağlayıcı `Operator` kaydı (inhouse yüklüyse), kiracının kendi Igames agent kimlik bilgileri (igames yüklüyse, K13), ilk `tenant_owner` daveti | provizyon idempotent (yarıda kesilip yeniden çalıştırılınca çift kayıt yok); kiracı `provisioning` durumunda canlı trafik almaz | kiracıyı `closed` yap ve verisini sil (canlıya çıkmadıysa) |
| N5 Kiracı canlıya çıkış listesi | Yasal varlık, sağlayıcı kimlik bilgileri, PSP sandbox'ında gerçek depozit/çekim, KYC webhook'u, e-posta gönderimi, alan adı/TLS; `status:'active'` | kontrol listesi konsolda tamam; o kiracı için yalıtım kosumu staging'de yeşil | `suspended` |
| N6 Staging → üretim kapıları | Aşağıdaki "kapsamsız sorgu" kapıları yeni kurulumun staging ve üretiminde ölçülür | aşağıda | önceki sürüme dön |

"N gün kapsamsız sorgu yok" kapıları (v1'de `app.vip90.bet` üretimine bağlıydı; artık yeni merkezi kurulumun
staging/üretimine bağlıdır):

- **Staging kapısı:** yeni kurulumun staging ortamı en az iki kiracı ve bir partnerle, uçtan uca senaryoları
  sürekli çalıştıran sentetik trafikle (oyuncu kaydı, depozit, bahis, casino, çekim, kampanya, partner işlemleri)
  **14 gün** boyunca sıfır `TenantScopeError` ve sıfır izinsiz `runAsPlatform` uyarısı verir. Bu kapı geçmeden
  üretime ilk kiracı alınmaz.
- **Üretim kapısı:** ilk gerçek kiracı canlıya çıktıktan sonra **7 gün** sıfır `TenantScopeError`; bu süre dolmadan
  ikinci kiracı canlıya alınmaz. Sonraki her sürüm staging'de en az 48 saat aynı sentetik trafikle çalışır.
- Tek kurulumlardaki `log` modu sayaçları (örneğin `app.vip90.bet`) bilgi amaçlıdır; çok kiracılı işin kapısı
  değildir.

### 6.3 Geriye uyum yolu: mevcut tek kurulumlar (varsayılan kiracı)

Varsayım Y3: premium alıcıları ve public core kullanıcıları güncellemeyi kendileri, gözetimsiz yapar. Bu yüzden her
G adımı açılışta kendiliğinden çalışır, idempotenttir, yarıda kalırsa bir sonraki açılışta kaldığı yerden devam eder,
başarısız olursa sunucu önceki davranışla (`off`) açılır ve admin panelinde uyarı gösterir; hiçbir adım yöneticiyi
dışarıda bırakamaz (G5 kurtarma yolu aşağıda).

| Adım | Ne yapılır | Doğrulama | Geri alma |
|---|---|---|---|
| G1 Varsayılan kiracı | Açılış geçişi: `Tenant{isDefault:true, key:'default'}` yoksa oluştur; `providerOperatorId` = `Operator{operatorKey:'vip90'}` varsa ona bağla; mevcut `Brand{isDefault}` ve `CLIENT_URL` kökenlerinden `Domain` kayıtları üret; `Migration{name:'tenancy-001-default-tenant'}` | tek `isDefault` kaydı; mevcut testler yeşil | kayıtları sil; kod `off` modda onları okumaz |
| G2 Alan ekleme | Şemalara `tenantId` (zorunlu değil) ve yazım sırasında bağlamdan damgalama | yeni yazılan her TEN kaydında `tenantId` dolu | alan zararsız; kod geri alınır |
| G3 Geri doldurma | `updateMany({tenantId:{$exists:false}}, {$set:{tenantId:default}})` koleksiyon başına, 10k'lık partiler, ilerleme `Migration` kaydında, yeniden çalıştırılabilir | her TEN koleksiyonunda `countDocuments({tenantId:null}) == 0` | `$unset` (gerek yok; alan okunmuyor) |
| G4 Yeni bileşik indeksler | `{tenantId, username}` vb. **önce oluşturulur** (Mongo 7 çevrimiçi indeks derlemesi); şemada tanımlanır ama açılış `autoIndex` yerine geçiş betiğiyle derlenir; mevcut global unique indeksler **yerinde kalır** (tek modda düşürülmez) | `listIndexes` iki indeksi de gösterir; global unique bileşik unique'i kapsadığı için ihlal olamaz | `dropIndex(yeni)` |
| G5 Personel ayrımı | Admin `User`'lar aynı `_id` ile `StaffAccount`'a; `super_admin` → varsayılan kiracıda `tenant_owner` **ve** platformda `platform_owner` (tek kurulum sahibi her ikisidir); rol şablonları; uyumlu giriş (5.1). 2FA zorunlu olmaz (K12); 2FA'sı etkin hesap girişte kod verir (V2) | eski admin hesabı aynı kullanıcı adı/şifreyle girer, aynı izinleri görür | `StaffAccount` kullanımı bayrakla kapatılır, `User.role:'admin'` yolu korunduğu sürece eski giriş çalışır (eski kayıtlar bu adımın sonuna kadar silinmez); kurtarma CLI'ı (`scripts/staff-recover.mjs`) sunucuda parolayı ve 2FA'yı sıfırlar |
| G6 Ayarlar | `Setting`'e `scope/tenantId/brandId`; mevcut satırlar `scope:'tenant', tenantId:default` ya da platform anahtarları için `scope:'platform'`; yeni bileşik unique önce; eski `key` unique tek modda yerinde kalır | her depo varsayılan kiracı için aynı değeri döndürür (anlık görüntü karşılaştırma testi) | eski `key` unique duruyor; kod geri alınır |
| G7 `log` modu | Eklenti filtre ekler; kapsamsız sorgular loglanır | CI'da tek mod regresyonu (8.7) ve anonimleştirilmiş tek kurulum dökümü üzerinde yükseltme provası (8.6) yeşil; çalışma zamanı kapısı yeni merkezi kurulumun staging'indedir (6.2 N6), `app.vip90.bet` değildir | `off`'a dön |
| G8 `enforce` (isteğe bağlı) | Tek modda yönetici isterse açar; varsayılan `log` kalır | aynı CI kosumu `enforce` ile de yeşil | `log`'a dön (bayrak, yeniden başlatma) |

Notlar:

- Tek operatörlü kurulumlar G1-G8'i alır. Davranış değişmez; ek olarak 10. bölüm düzeltmeleri ve `DEMO_*`
  bayrakları gelir (6.1).
- Mongoose `autoIndex` mevcut indeksleri düşürmez; şemadan `unique` kaldırmak indeksi düşürmez. Düşürme her zaman
  açık bir geçiş adımıdır (`GameSettings.syncIndexes()` deseni, `scripts/migrations/add-operator-to-game-settings.mjs:63`,
  bilinçli olarak kullanılmaz çünkü şemada olmayan her indeksi düşürür).
- Geçiş betikleri premium'a referans vermez (core'un premium'suz çalışması, 7.2); sağlayıcı tarafı eşleme betiği
  inhouse alt modülündedir ve core'un provizyon kancasına bağlanır.
- Yedek: her G adımından önce `mongodump` (açılış geçişi yedek alamıyorsa adımı çalıştırmaz, uyarı verir); G3
  anonimleştirilmiş üretim benzeri döküm üzerinde prova edilir (8.6).

---

## 7. İş paketleri ve sıralama; geliştirmenin public core'da yapılması, premium eklentilerle sınır

### 7.1 İş paketleri

"Yer" sütunu K18'e göredir: İP-U'dan sonra her şey `vip90-bet-core`'da geliştirilir ve bet'e çekilir; premium
eklentilere dokunan kısımlar kendi private alt modüllerinde yapılır.

| İP | İçerik | Bağımlılık | Teslim | Kabul ölçütü | Yer |
|---|---|---|---|---|---|
| İP-0 | 10. bölüm açıklarının düzeltilmesi (K17: rapor onayından sonra ilk iş). V4 ile `DEMO_INSTANT_DEPOSIT` bayrağı. Her V maddesi ayrı commit (yalnız düzeltme + testi, kiracı kodu karışmaz), non-custodial zincir sürümü'e cherry-pick edilebilir (K15) | rapor onayı | güvenli tek kiracılı kurulum | 10. bölümdeki her maddenin "bitti" ölçütü; regresyon kosumu yeşil; tek modda 2FA etkin hesaba kod sorulur, etkin olmayana sorulmaz | bet'te bugünkü akışla (bet → core senkronu) + igames/inhouse ilgili maddeler; zincire uygulanabilirlik İP-0 başında kontrol edilir |
| İP-U | Core upstream olur: son ileri senkron, bet-only commit'lerin envanteri, akışın çevrilmesi (`pull-core.mjs`), bet'te core yolu koruması, AGENTS.md metinleri (7.3) | İP-0 core'a senkronlanmış | core kaynak, bet çeker | 7.3 kabul ölçütleri | bet + core |
| İP-1 | Temel: `Tenant`, `Domain`, `tenantContext`, `tenantScoped` eklentisi (`off`), `defineTenantModel` ve bağlantı çözümleyici (4.4 madde 7), `runAsPlatform`/`forEachTenant`, varsayılan kiracı (G1), modlar ve açılış kontrolleri, `DEMO_*` bayrakları (bot, sahte kazanan, demo verisi), provizyon kanca kaydı (7.2), AGENTS.md yeni metni | İP-U | davranış değişikliği yok (demo bayrakları hariç, 6.1) | tüm testler yeşil; eklenti birim testleri; tek `isDefault`; ikinci bağlantıya yönlenme testi | core |
| İP-2 | Alanlar, damgalama, geri doldurma, bileşik indeksler (G2-G4); para kayıtlarında `currency` alanı (K14) | İP-1 | her TEN kaydı `tenantId` taşır | 8.6 geçiş testi; sıfır `tenantId:null` | core; premium modeller kendi alt modülünde |
| İP-3 | Kimlik ve yetki: `StaffAccount`, `RoleAssignment`, kapsamlı roller, partner izin ad alanı (5.2), iki token ailesi, Host çözümleme middleware'i, personel 2FA (multi'de zorunlu, tek modda etkinse; K12), uyumlu giriş ve kurtarma CLI'ı (G5) | İP-2 | 5. bölüm | 8.1 çapraz kontrol testleri; eski admin aynı izinlerle girer | core |
| İP-4 | Kiracı bazlı ayar ve kimlik bilgileri (G6), `CLIENT_URL` kaldırma, CORS'un `Domain`'den üretimi, kiracı başına e-posta transporter | İP-2 | 4.5 | ayar anlık görüntü testi; iki kiracı iki farklı SMTP ile gönderir | core |
| İP-5 | Para yolları ve admin uçları: tüm `:id` aramaları kapsamlı, Slikair payout `userId` kontrolü, promosyon, chat tip, raporlar, `TenantDailyStat`, `log` modu (G7), lint kuralları | İP-3, İP-4 | 2.2 tablosu | 8.3 para testleri | core |
| İP-6 | Callback atfı: Slikair (kayıt), Sumsub (URL), Igames (kiracının kendi agent hesabı ve kimlik bilgileri K13, kiracı başına URL+token, `{tenantId, palaceUserCode}`, işlem + ledger satırı), in-house (`Tenant.providerOperatorId`, URL anahtarı, oyuncu-kiracı kontrolü), game-host temasının launch tokenından gelmesi. In-house callback ve tema değişiklikleri geriye uyumlu (Y4): eski callback biçimi ve sabit tema, yeni alanlar yokken aynen çalışır | İP-4 | 3. bölüm #3, #5, #11 | 8.4 callback testleri; mevcut in-house sağlayıcı müşterisi sözleşme testi değişmeden geçer | core + igames + inhouse alt modülleri |
| İP-7 | İşler ve soketler: `forEachTenant`, kiracı odaları, global yayınların kiracıya indirgenmesi, kampanya kitleleri, bot zamanlayıcısının iç çağrıda kiracı taşıması, kiracı başına önbellek anahtarları | İP-3 | 3. bölüm #10, #12, #15, #17, #18 | 8.5 soket testleri | core + betting (yayınlar) |
| İP-8 | Multi modda `enforce` zorunluluğu; tek modda isteğe bağlı `enforce` (G8); istemci: marka geri dönüş metinlerinin kaldırılması, dinamik `manifest.webmanifest`, `index.html` başlığının sunucuda üretimi, yasal metnin `Tenant.legalEntity`'den gelmesi | İP-5, İP-6, İP-7 | yalıtım zorlanıyor | tüm yalıtım kosumu `enforce` modda yeşil | core |
| İP-9a | **Kritik yol (Y2).** Platform Sahibi paneli ve operatör yönetimi: multi kurulum (N1-N2), platform konsolu (`console/`), kiracı provizyonu (N4, tohum alt kümesi, sağlayıcı Operator kaydı kancası), alan adı doğrulama + TLS, canlıya çıkış listesi (N5), yeni merkezi kurulumun staging'i ve N6 kapıları | İP-8 | operatör #2 platform tarafından provizyonla canlı | 8. bölüm (partner hariç); N6 staging kapısı | core |
| İP-9b | Partner yönetimi: `Partner`, yetenek seti, `PartnerOperatorLink`, partnerin kendi operatörlerini oluşturma/yönetme (K16), `PartnerGrant` (okuma + sınırlı yazma), partner portalı (`console/` içinde partner kapsamı) | İP-9a | partner kaynaklı operatörler | 8.1 partner testleri; satış ortağı senaryosu uçtan uca | core |
| İP-9c | Komisyon ve faturalama (`TenantDailyStat` × bağlantı koşulları), platform çapraz raporları | İP-9b | faturalama | S3 yanıtına göre kabul | core |
| İP-10 | Ölçek: Socket.IO Redis adaptörü, süreç içi Map'lerin (OAuth state, Web3 nonce, oran sınırlayıcı) paylaşımlı depoya taşınması, ikinci süreç | eşik aşılınca (aşağıda) | yatay ölçek | iki süreçte soket ve OAuth testleri | core |

Sıra ve kritik yol (varsayım Y2): İP-0 → İP-U → İP-1 … İP-8 → İP-9a = operatör #2 canlı. İP-9b ve İP-9c
sonra gelebilir; partner kaynaklı ilk operatör İP-9b'yi bekler. Başlangıçta tek Node süreci yeterlidir.

İP-10 eşiği: merkezi kurulum üretiminde aşağıdakilerden biri sürekli görülürse İP-10 kritik yola girer; o zamana
kadar yalnız ölçüm yapılır (İP-1'den itibaren süreç metrikleri: eşzamanlı soket, event loop gecikmesi, CPU):

- eşzamanlı Socket.IO bağlantısı 15 dakikalık pencerede p95 > 2.000;
- event loop gecikmesi p99 > 100 ms, 15 dakika boyunca;
- Node süreci CPU > %70, 15 dakika boyunca, bir haftada 3 kez ya da daha sık;
- sıfır kesintili dağıtım (ikinci süreç) iş gereği olur.

Eşiğe yaklaşma (değerlerin %70'i) İP-10 tasarımını başlatır, böylece eşik aşıldığında iş hazırdır.

### 7.2 Her şey public core'da; premium eklentilerle sınır (R6, K18)

`premium/platform` alt modülü **yoktur** (v1'deki öneri kaldırıldı). Çok operatörlü işin tamamı public AGPL
`vip90-bet-core`'dadır:

| Parça | Yer (core içinde) | Not |
|---|---|---|
| Yalıtım çekirdeği: `Tenant`, `Domain`, `tenantId` alanları, indeksler, `tenantContext`, `tenantScoped`, Host çözümleme, kiracı bazlı ayar/kimlik bilgileri, `StaffAccount`/`RoleAssignment`, kiracı soket odaları, varsayılan kiracı geçişi, `TenantDailyStat` | `server/src` (bugünkü yapı) | tek kurulumlar varsayılan kiracıyla aynen çalışır |
| Platform ve partner sunucu tarafı: platform kurulumu, provizyon, alan adı/TLS akışı, `Partner`, yetenek seti, `PartnerOperatorLink`, `PartnerGrant`, partner uçları, komisyon ve faturalama, platform raporları | `server/src/platform/` (yeni dizin), rotalar `/api/platform/*` ve `/api/partner/*` | yalnız `multi` modda bağlanır; tek modda 404 |
| Kiracı (operatör) admin paneli | `client/` `/admin` (bugünkü yer) | kiracının kendi alan adında |
| Platform Sahibi paneli ve partner portalı istemcisi | core içinde **ayrı uygulama** `console/` (Vite), `client/`'ın parçası değil | gerekçe aşağıda |
| In-house kiracı → sağlayıcı Operator eşlemesi, callback yönlendirme | inhouse alt modülü (private, isteğe bağlı) | core'un provizyon kancasına bağlanır |
| Igames kiracı başına agent hesabı ve yönlendirme (K13) | igames alt modülü (private, isteğe bağlı) | kimlik bilgisi şeması core kancasıyla kaydedilir |
| Spor uzlaştırmanın bahis başına kiracı bağlamında çalışması (R7) | betting alt modülü (private, isteğe bağlı) | core `runWithTenant` sağlar |

Konsol istemcisi neden `client/` içinde değil, core içinde ayrı uygulama (`console/`):

1. Farklı host ve kiracısız çalışma: konsol platform host'unda (ör. `platform.<platform-alanı>`) açılır, Host'tan
   kiracı çözümlemez; `client/` ise her kiracı alan adında servis edilir.
2. Farklı kimlik ve güvenlik politikası: yalnız personel tokeni, multi'de zorunlu 2FA, ayrı CSP ve çerez; oyuncu
   oturumu hiç yoktur.
3. Saldırı yüzeyi ve boyut: her kiracı alan adındaki oyuncu/admin paketinde platform ve partner ekranları, rota
   listesi ve API adları bulunmaz.
4. Tek kurulumlar konsolu derlemez ve servis etmez; `client/` derlemesi bugünkü gibi kalır.
5. Eksi: ortak UI bileşenleri iki yerde gerekir. Başta `console/` `client/`'tan takma adla (alias) içe aktarır;
   tekrar büyürse ortak bir çalışma alanı paketi çıkarılır.

Core'un premium'suz kullanılabilirliği:

- Core premium'a hiç import vermez (bugünkü `app.js:63-99` dinamik import deseni sürer). Eklentiler core'un
  sunduğu kayıtlara bağlanır: `registerTenantProvisioningHook(fn)` (inhouse: sağlayıcı `Operator` kaydı oluşturur ve
  `Tenant.providerOperatorId`'yi yazar), `registerTenantCredentialSchema(moduleId, schema)` (igames: agent hesabı
  kimlik bilgileri formu ve doğrulaması), betting için uzlaştırmada `runWithTenant`.
- Eklenti yoksa: `Tenant.providerOperatorId` boş kalır (sparse), in-house oyunlar sunulmaz; Igames kimlik bilgisi
  bölümü konsolda görünmez; `Tenant.entitlements.modules` yüklü modüllerle kesişir, olmayan modül hak olarak
  verilemez. Yalıtım kosumu premium'suz core'da da çalışır (CI'da iki iş: core tek başına, bet ile birlikte).
- Lisans durumu: core'daki platform, partner ve faturalama kodu dahil her şey AGPL ve herkese açıktır (K18'de kabul
  edildi); rakipler de çok kiracılı platformu çalıştırabilir. Ticari koşullar (oranlar, sözleşmeler) kodda değil,
  veritabanındadır; kodda sır ya da müşteri adı bulunmaz. Premium eklentilerin lisans durumu bugünküyle aynıdır.
- Bu rapor ve ekleri: onaydan sonra core'a da konur (başlıktaki not: iç ayrıntılar çıkarılır, 10. bölüm İP-0
  yayınlanana kadar özetlenir). `docs/product/` altına yazılacak kullanıcı belgeleri iç alan adı ve sunucu yolu
  içermez.

### 7.3 Core upstream olur (İP-U)

Amaç: K18'e göre akışı bet → core'dan core → bet'e çevirmek, iki deponun birbirinin üzerine yazmasını önlemek ve
son senkrondan beri bet'te kalan commit'leri kaybetmemek. Kod ve AGENTS.md bu raporla değişmez; aşağısı öneridir.

1. **Ön koşul:** İP-0 bet'te birleşmiş ve bugünkü `scripts/sync-core.mjs` ile son kez core'a aktarılmış.
2. **Bet-only commit envanteri:** core'daki `.core-sync.json` tabanından bet `origin/main`'e kadar core'a ait
   yollara dokunan commit'ler listelenir (`git log <taban>..origin/main -- <core yolları>`). Her biri için karar:
   (a) core'a gitmeli → son ileri senkrona girer; (b) bet'e özel kalmalı (iç ayrıntı, sızıntı taramasına takılan)
   → core'a ait yoldan bet'e ait bir yola taşınır (premium alt modül, bet'e özel yapılandırma) ya da yeni çekme
   betiğinin yerel yama listesine yazılır. Liste İP-U PR'ına eklenir; hiçbir commit sessizce düşmez.
3. **Son ileri senkron:** (2)'deki (a) kümesiyle `sync-core.mjs` bir kez daha çalışır; çıkan core sha'sı ve bet
   sha'sı kaydedilir. Bu andan sonra core'a ait yollarda tek doğruluk kaynağı core'dur.
4. **Yön çevirme:** `sync-core.mjs` açıklayıcı bir hatayla çıkacak şekilde devre dışı bırakılır. Yeni
   `scripts/pull-core.mjs --core <clone> --ref <etiket|sha>` core'dan bet'e aynı yol kümesiyle 3 yollu birleştirme
   yapar; taban bet'teki yeni `.core-pull.json`'dır (son çekilen core sha'sı); çakışmada çıkış 2. Core'daki
   `.core-sync.json` silinmez, son ileri senkronun kaydı olarak kalır.
5. **Üzerine yazmayı önleme:** tek yön kuralı. Bet'te core'a ait yollar salt okunurdur: bet CI'ındaki yeni
   `check-core-owned.mjs`, core'a ait bir yolu değiştiren ve `Core-Pull: <core sha>` trailer'ı taşımayan PR'ı
   reddeder. Acil üretim düzeltmesi önce core'a PR olarak açılır; gerçekten beklenemiyorsa bet'te
   `Core-Upstream: <core PR adresi>` trailer'ıyla izinlidir ve bir sonraki çekmede core sürümü kazanır; CI, core'a
   karşılığı birleşmemiş bu tür commit'leri listeler.
6. **Core tarafı:** sızıntı taraması (iç alan adı, sunucu yolu, sır) `sync-core.mjs`'den core CI'ına taşınır ve her
   PR'da çalışır; AGENTS.md'deki "Public core" kuralı core'da geliştirilen her şeye uygulanır.
7. **Sürüm ve CHANGELOG:** core etiketleri birincildir; bet her çekmede çektiği core etiketini kaydeder. CHANGELOG
   core'da tutulur; bet'e özel (premium, deploy) girdiler premium depolarının ya da bet'in kendi bölümünde kalır.
   `check-changelog.mjs` her iki depoda kendi yollarına göre çalışır.
8. **Dağıtım:** `app.vip90.bet` bet'ten dağıtılmaya devam eder. Yeni merkezi kurulum, core'dan çekilmiş bet
   (core + premium eklentiler) ile build edilir; core'u doğrudan dağıtmaz.
9. **non-custodial zincir sürümü:** kapsam dışı (K15), core'dan çekmez. İP-0 düzeltmeleri bet'te ayrı commit'lerdir ve zincire
   cherry-pick edilebilir; İP-U sonrasında ortak bir güvenlik düzeltmesi core'da yapılırsa o commit de ayrı ve
   cherry-pick edilebilir tutulur.

Kabul: (2)'deki liste tam ve her satır karara bağlı; `pull-core.mjs` ile çekilen core etiketinde bet testleri yeşil;
bet CI core yolu korumasını uyguluyor (bilerek bozulan bir PR reddediliyor); core CI sızıntı taraması çalışıyor.

Önerilen AGENTS.md metni ("Repo dağılımı ve core senkronu" bölümünün yerine, bet ve core'da aynı anda; İP-U
birleştirildiğinde konur):

```
- `vip90-bet-core` (public, AGPL-3.0) çekirdeğin ve çok operatörlü platformun (kiracı
  yalıtımı, Platform Sahibi paneli, Partner yönetimi, operatör provizyonu, faturalama)
  geliştirildiği kaynak depodur (2026-11-09 kararı). Core'a ait yollardaki değişiklik
  core'da yapılır.
- `bet` (private) core'u `node scripts/pull-core.mjs --core <core-clone> --ref <etiket>`
  ile çeker (taban: bet'teki `.core-pull.json`) ve private premium eklentileri
  (`server/src/premium/*`) ekler. Bet'te core'a ait yolları elle düzenleme; CI bunu
  `Core-Pull` trailer'ı olmadan reddeder. Acil düzeltme önce core'a PR olarak açılır.
- `scripts/sync-core.mjs` (bet → core) emekliye ayrıldı; yeniden etkinleştirme.
- Core'a iç alan adı, sunucu yolu ya da sır girmez; core CI her PR'da sızıntı taraması
  yapar. Ayrıntılı işletim bilgisi bet'teki `docs/RUNBOOK.md`'dedir.
- Premium eklentiler (`vip90-bet-betting`, `vip90-bet-igames`, `vip90-bet-inhouse`)
  private ve isteğe bağlıdır; core onlara import vermez, kancalarla bağlanırlar.
```

---

## 8. Test planı

### 8.1 Kiracı yalıtım kosumu (harness)

- Fikstür: iki kiracı `T1`, `T2` + bir partner `P1` (`T1`'e bağlı). Çakışan veri: aynı `username`, `email`, `phone`,
  `palaceUserCode`, `ChatRoom.slug`, `PlayerSegment.slug`, `VipLevel.level`, `StaticPage.slug`, `Promotion` başlığı,
  aynı tutarlı işlemler; her kiracıda personel (her rol), oyuncu, agent.
- **Uç nokta taraması:** route tablosu (Ek B'deki 401 handler, testte `app._router` üzerinden üretilir) dolaşılır. Her
  kimlik doğrulamalı uç için: `T1` tokeniyle `T2` Host'una istek → 401/403; `T1` tokeniyle `T1` Host'unda `T2`
  kaydının id'si → 404 (403 değil; varlık sızdırılmaz). Yeni bir rota eklenip tabloya sınıf atanmamışsa test başarısız.
- **Yanıt taraması:** `T1` bağlamındaki her yanıtta `T2`'ye ait herhangi bir `_id`, kullanıcı adı ya da e-posta
  geçmemeli (fikstürde benzersiz işaretçiler).
- **Eklenti testleri:** her TEN modeli için kapsamsız `find`, `findById`, `aggregate`, `$lookup`, `updateMany`,
  `insertMany`, `bulkWrite` → `enforce` modda hata; `runAsPlatform` içinde izinli.
- **Bağlam kaybı testleri:** `setInterval`, soket işleyicisi, post-save kancası, `Promise.all` içinde bağlamın
  korunması.
- **İş testleri:** her iş (`bonusExpiry`, `kycExpiry`, `cryptoWithdrawalReconcile`, `systemMail`, `smsTemplate`, bot,
  fake winners, Igames mutabakat) iki kiracıda çalışır; `T1` yapılandırmasıyla `T2` kaydına yazım olmaz, kampanya
  `T2` oyuncusuna gitmez.
- **Partner testleri:** `P1` `T2` metriğini göremez; `T1` için yalnız `TenantDailyStat` alanları döner; `PartnerGrant`
  yokken ham uçlar 403; grant ile 200 ve `AuditLog` satırı; grant süresi dolunca ya da bağlantı kapanınca 403.
- **Partner yetenek testleri (K16):** fikstüre ikinci partner `P2` (`T2`'ye bağlı) eklenir. Her `partner:tenants:*`
  ucu için: yetenek setinde varsa `P1` kendi kiracısında 200 ve `onBehalfOfTenantId` + `capability` ile `AuditLog`
  satırı (kiracı ekranında görünür); yetenek yoksa 403; `T2` üzerinde 404; bağlantı daraltması (`link.capabilities`)
  uygulanır; `maxTenants` ve `allowedModules` aşılınca 400. Kendi kendine atama: `P1` personeline `T1`'de kiracı
  rolü atama reddedilir. Hiçbir partner ucu, hiçbir yetenekle, bakiye düzeltme, para onayı ya da KYC belgesi
  döndürmez/yapmaz. `tenants.integrations` ile yazılan sır geri okunamaz (yanıt tarama).
- **Demo testleri (K10):** multi modda `DEMO_*` açıkken sunucu başlamaz; multi modda bot ve sahte kazanan işleri
  kayıtlı değildir, `/api/transactions/deposit` ve demo veri uçları 404.

### 8.2 Unique indeks testleri

- Aynı `username/email/phone/walletAddress/googleId/telegramId` iki kiracıda kayıt olur; aynı kiracıda ikinci kayıt
  E11000 ile reddedilir.
- 2.1 tablosundaki her bileşik unique için aynı test; `Domain.host` iki kiracıda reddedilir.
- `syncIndexes` kullanılmadığını doğrulayan test: geçiş sonrası `listIndexes` beklenen kümeye eşit.

### 8.3 Kiracı başına para yolu testleri

Ek A §2.1'deki 46 yolun her canlısı için: işlem `T1` oyuncusunda bakiye ve ledger satırı üretir, `T2` bakiyesi değişmez;
admin onayı `T2` personeliyle `T1` kaydına 404; idempotency tekrarında tek ledger satırı; VIP/cashback/referans
`T1` yapılandırmasıyla hesaplanır (iki kiracıda farklı oranlar). Olay uzlaştırma: bir olay iki kiracının bahislerini
uzlaştırır, her biri kendi VIP tablosuyla. Chat tip `T2` oyuncusuna reddedilir.

### 8.4 Callback atıf testleri

- Slikair payin/payout: `T1` kaydı için webhook `T1` kimlik bilgisiyle durum sorgular; başka kiracının `payinId`'si
  ile gelen istek yanlış kiracıya kredi üretmez.
- Sumsub: `/api/webhook/sumsub/T1` `T1` sırrıyla doğrulanır; `T2` sırrıyla imzalı gövde 401; `externalUserId` `T2`
  oyuncusuysa 404. Gerçek `app` üzerinde (router tek başına değil) ham gövde testi.
- Igames: `T1` URL'si + `T1` token'ı + `T2` oyuncusunun `user_code`'u → ret; tekrar anahtarı kiracı önekli.
- In-house: `T1` anahtarlı callback, `T2` oyuncusunun `externalPlayerId`'si → ret, bakiye değişmez; yanlış sağlayıcı
  Operator imzası → 401.
- OAuth: `state` içindeki kiracı ile callback Host'u farklıysa ret.

### 8.5 Soket oda testleri

İki kiracı admini bağlanır; `T1` depoziti yalnız `T1` admin odasına gider; `winners:new`, `online:count`,
`bot:action` yalnız ilgili kiracı istemcilerine; `/chat` `T2` odasına `T1` oyuncusu katılamaz; `/live` oda anahtarı
kiracı önekli; süresi geçmiş `tokenVersion` ile el sıkışma reddedilir.

### 8.6 Kurulum ve geçiş testleri

- **Yeni merkezi kurulum (ana yol):** boş DB'de N1-N4 CI'da uçtan uca: her adım iki kez çalıştırılır (idempotent),
  ilk Platform Sahibi bir kez oluşur, 2FA kurulmadan personel ucu açılmaz, provizyon yarıda kesilip yeniden
  çalıştırılınca çift kayıt üretmez, `listIndexes` yalnız bileşik indeksleri gösterir, veritabanında demo/bot kaydı
  yoktur.
- **Tek kurulum yükseltmesi (geriye uyum yolu):** üretim benzeri anonimleştirilmiş tek kurulum dökümü
  (`mongodump`; demo kurulumunun kopyası da yalnız test fikstürü olarak kullanılabilir) üzerinde G1-G8: her adım iki
  kez çalıştırılır (idempotent), her adım sonrası belge sayıları ve bakiye toplamları değişmez, `tenantId:null` sayısı
  sıfır, bileşik indeks derlemesi yinelenen anahtar hatası vermez.
- **Gözetimsiz yükseltme (Y3):** geçiş adımı ortasında süreç öldürülür, yeniden açılışta kaldığı yerden devam eder;
  bilerek bozulan bir adımda sunucu `off` davranışıyla açılır ve eski admin girişi çalışır; kurtarma CLI'ı parola ve
  2FA'yı sıfırlar.
- Geri alma provası: her adım geri alınıp önceki sürümün kodu başlatılır ve smoke testi geçer.
- Süre ölçümü: en büyük koleksiyonlarda (`Transaction`, `CasinoRound`, `ActivityEvent`) geri doldurma ve indeks
  derleme süresi kaydedilir; bakım penceresi buna göre belirlenir.

### 8.7 Tek operatör regresyonu

`TENANCY_MODE=single` ile mevcut tüm sunucu ve istemci testleri, ayrıca: eski admin girişi aynı izinlerle; env'den
gelen SMTP/Slikair kimlik bilgileri çalışır; `CLIENT_URL`'siz varsayılan kiracıda bağlantılar doğru alan adını
üretir; herhangi bir Host ile site açılır (bugünkü davranış); 2FA'sı etkin olmayan admin yalnız parolayla girer,
2FA'sı etkin kullanıcıya (oyuncu ya da personel) kod sorulur (K12, V2); `DEMO_*` bayrakları açıkken bot ve sahte
kazananlar bugünkü gibi çalışır. Kosum CI'da her PR'da çalışır; yalıtım kosumu İP-1'den itibaren zorunlu kontroldür.
Core'da iki CI işi vardır: premium'suz core ve premium eklentilerle bet (7.2).

---

## 9. Güvenlik açısından kritik riskler ve kapanış ölçütleri

| # | Risk | Bitti sayılır, ne zaman ki … |
|---|---|---|
| G-1 | Kiracılar arası token yeniden kullanımı | 8.1 uç nokta taramasında `T1` tokeni `T2` Host'unda her kimlik doğrulamalı uçta 401/403 döner; soket el sıkışması için de aynı test geçer |
| G-2 | Kapsamsız sorgu (unutulmuş filtre) | `enforce` modda tüm test kosumu yeşil; yeni merkezi kurulumun staging'inde 14 gün, üretiminde ilk kiracıdan sonra 7 gün sıfır `TenantScopeError` (6.2 N6; `app.vip90.bet` ölçüt değildir); `runAsPlatform` çağrıları lint izin listesindeki dosyalarla sınırlı |
| G-3 | `:id` IDOR (başka kiracının kaydı) | 8.1'de her `:id` parametreli uç `T2` id'siyle 404 döner |
| G-4 | Callback'le yanlış kiracıya para | 8.4'teki her senaryo kredi üretmez; callback'ler yalnız URL/kayıt kiracısıyla ve o kiracının kimlik bilgisiyle doğrulanır |
| G-5 | Yetki yükseltme (kiracı personeli → platform) | kiracı rolüne `platform:*` atama 400 döner; kiracı personeli platform konsolu host'unda 403; rol atama `role='admin'` yan etkisi kaldırılmıştır (test) |
| G-6 | Partner'ın kişisel veriye erişimi | partner metrik uçlarının yanıt şeması yalnız `TenantDailyStat` alanlarıdır, kurulum uçları oyuncu/para alanı döndürmez (şema testi); grant'sız ham uç 403; her grant'lı okuma ve yazma `AuditLog` satırı üretir ve kiracı ekranında görünür |
| G-7 | Personel hesabı ele geçirme | multi modda personel tokeni `amr` içinde `otp` olmadan hiçbir personel ucunda kabul edilmez; tek modda 2FA'sı etkin hesap kodsuz token alamaz (V2); reset/doğrulama tokenları hashlenmiş saklanır; hiçbir yanıt `twoFactorSecret`, yedek kod ya da token alanı içermez (yanıt tarama testi) |
| G-8 | Soket yayın sızıntısı | 8.5 testleri; kodda `io.emit(` ve `to('role:admin')` kullanımı yok (lint) |
| G-9 | Kiracı başına sır karışması | iki kiracı farklı SMTP/Slikair/Sumsub kimlik bilgisiyle test edilir; önbellek anahtarı testi; tüm sırlar şifreli (DB'de düz metin sır taraması testi) |
| G-10 | Kampanya ve iş sızıntısı | 8.1 iş testleri; kampanya kitlesi sorgusu kiracı filtresi olmadan çalışamaz (`enforce`) |
| G-11 | Alan adı ele geçirme (sahipsiz alan adı başka kiracıya) | `Domain` doğrulaması (DNS TXT) olmadan `multi` modda alan adı etkinleşmez; `host` global unique |
| G-12 | Geçişte veri kaybı | 8.6 provası: belge sayısı ve bakiye toplamı eşitliği; her adımın geri alma provası geçti |
| G-13 | KYC dosyalarına yetkisiz erişim | `/uploads/kyc` statik sunumu kaldırılmış; indirme yalnız sahibi oyuncu ya da `admin:kyc:read` izinli aynı kiracı personeli ile; yol kiracı önekli |
| G-14 | Spor uzlaştırmanın kiracıdan tetiklenmesi | kiracı personeliyle `POST /events/:id/settle` 403; uzlaştırma bahis başına bahsin kiracı bağlamında çalışır (test) |
| G-15 | Partner yetkisinin taşması (başka partnerin kiracısı, yetenek seti dışı yazım, kendine kiracı rolü) | 8.1 partner yetenek testleri; `P1` `T2` üzerinde her uçta 404; yetenek seti dışı her yazım 403; partner personeline bağlı kiracıda kiracı rolü ataması reddedilir; her partner yazımı `onBehalfOfTenantId` + `capability` ile kayıtlı |
| G-16 | Merkezi kurulumda demo davranışı | multi modda `DEMO_*` açıkken sunucu başlamaz; bot/sahte kazanan işi kayıtlı değil; demo depozit ve demo veri uçları 404 (8.1 demo testleri) |
| G-17 | Core upstream geçişinde değişiklik kaybı ya da depoların birbirinin üzerine yazması | 7.3 kabul ölçütleri: bet-only commit listesi tam ve karara bağlı; bet CI core yolu korumasını uyguluyor; core CI sızıntı taraması çalışıyor |

---

## 10. Bugünkü kurulumda bulunan güvenlik açıkları (çok kiracılıktan bağımsız)

Bunlar tek operatörlü kurulumda bugün geçerlidir ve **kiracı işinden önce** (İP-0) kapatılır. Sahibin kararı (K17,
2026-11-09): V1-V22 kesin yapılır, bu rapor onaylandıktan sonra ilk iş olarak; henüz kod yazılmaz. Her madde ayrı
commit'tir ve non-custodial zincir sürümü ile ortak olanlar oraya cherry-pick edilebilir (K15). "Koordinatör" =
koordinatörün kodda doğruladığı; "doğrulandı" = bu rapor yazılırken kodda kontrol edildi; "envanter" = yalnız
envanter bulgusu.

| # | Açık | Kanıt | Önem | Doğrulama | Önerilen düzeltme |
|---|---|---|---|---|---|
| V1 | Admin kullanıcı listesi düz metin şifre sıfırlama/e-posta doğrulama tokenlarını, TOTP sırrını ve yedek kodları döndürüyor; `admin:users:read` taşıyan her rol (support, finance, risk) herhangi bir hesabı ele geçirebilir. `toSafeObject` yalnız `password`'ü siliyor, giriş/yenileme yanıtı da kişinin kendi 2FA sırrını döndürüyor | `controllers/admin.js:108-117` (`.select('-password')`), `models/User.js:221-223`, tokenlar düz metin `controllers/auth.js:381` | Kritik | Koordinatör | Şemada hassas alanlara `select:false`; `toSafeObject` izin listesiyle; admin listesi açık projeksiyon; reset/doğrulama tokenlarını SHA-256 ile sakla; mevcut tokenları geçersiz kıl, 2FA sırlarını şifrele |
| V2 | 2FA girişte hiç kontrol edilmiyor (kurulabiliyor ama uygulanmıyor) | `controllers/auth.js:160-241`; `twoFactorEnabled` yalnız `models/User.js:122` ve `routes/admin2fa.js`'de | Kritik | Koordinatör | Girişte `twoFactorEnabled` ise ikinci adım (kısa ömürlü ara token + `/auth/2fa/login`); token'da `amr`. Bu bir düzeltmedir, yeni zorunluluk değildir: 2FA'yı etkinleştirmemiş hesap bugünkü gibi girer. Personel için zorunlu 2FA yalnız multi modda gelir (K12, İP-3) |
| V3 | KYC belgeleri kimlik doğrulamasız statik sunuluyor | `app.js:190-191`; dosya adı `middleware/upload.js:18` | Kritik | Koordinatör | Statik sunumu kaldır; `GET /api/kyc/documents/:id` sahibi ya da `admin:kyc:read` ile, dosya akışla; depolamayı web kökünün dışına taşı; yol cwd'den bağımsız |
| V4 | `POST /api/transactions/deposit` ödeme olmadan bakiye yüklüyor (çağrı başına 50.000'e kadar); istemci kullanıyor | `controllers/transactions.js:11-45`, `routes/transactions.js:11`, `validators/transaction.js:28`, `client/src/pages/Profile.jsx:435` | Kritik (gerçek operatör için) | Koordinatör | Satış demosu için tasarlanmış; `DEMO_INSTANT_DEPOSIT` bayrağı (varsayılan kapalı, K10); kapalıyken rota 404; istemci butonu aynı bayrağı okur; multi modda hiçbir koşulda açılmaz (6.1). `app.vip90.bet` bayrağı açıkça açar |
| V5 | `requireAdmin` yalnız JWT `role` iddiasına bakıyor ve herhangi bir rol atanınca `role='admin'` oluyor; bu yüzden yalnız `requireAdmin` ile korunan rotalar (analytics, audit + CSV, reconciliation, modül aç/kapa, sağlayıcı kimlik bilgileri ve anahtar döndürme, ticket admin, chat admin, kripto ayar/hot wallet) her personel rolüne açık | `middleware/auth.js:89-92`, `services/permissions.js:368`; rota listesi B§3.3 | Yüksek | Doğrulandı | Her rotaya `requirePermission`; tanımlı ama uygulanmayan 7 anahtarı bağla (`admin:reports:export`, `admin:reconciliation:*`, `admin:support:*` …); sağlayıcı kimlik bilgileri için yeni `admin:integrations:write`; lint: `requireAdmin` tek başına yasak |
| V6 | Banka, ticket ve chat admin rotaları ile kripto ayar/hot wallet `/api/admin` dışında, admin IP izin listesini atlıyor | `routes/bank.js:21-23`, `routes/ticket.js:25-28`, `routes/chat.js:23-36`, `routes/crypto.js:323,329`, izin listesi yalnız `app.js:228` | Yüksek | Envanter | Rotaları `/api/admin/*` altına taşı (eski yolları geçici 308) ya da izin listesini bu yollara da uygula |
| V7 | Chat `chat:delete`: her oturum açmış oyuncu herhangi bir mesajı silebiliyor | `services/chat.js:667-674` → `deleteMessage` `:176-186`, rol/sahip kontrolü yok | Orta | Doğrulandı | Sahip kontrolü (yalnız kendi mesajı) ya da moderatör izni; admin silme yalnız REST admin rotasından |
| V8 | Chat rain para basıyor: oluşturan borçlandırılmıyor, rol kontrolü yok; tip işlem dışında | `services/chat.js:348-450` (yalnız alıcılara `$inc`, `:403-407`), soket `:694-700`; tip `:456-535`, `:685-691` | Yüksek | Doğrulandı | Rain'i yalnız personel/promosyon bütçesinden (ledger'da kaynak satırı) ya da oluşturanı aynı işlemde borçlandır; rol kontrolü; tip'i `withTransactionRetry` içine al |
| V9 | `GET /api/health/risk` kimlik doğrulamasız kurulum geneli risk istatistiği döndürüyor | `app.js:373-382` | Düşük-Orta | Doğrulandı | `/api/admin/health` altına taşı ya da `requireStaff` + `admin:risk:read` |
| V10 | Slikair payout webhook `failed` durumunda önceden düşülen bakiyeyi iade etmiyor | `controllers/slikairController.js:381-465` (durum eşlemesi `:400-412`, iade yok) | Yüksek (para kaybı/uyuşmazlık) | Doğrulandı | `failed` geçişinde idempotent iade (`slikair_payout_refund_${payoutId}`) işlem içinde; payout oluşturmadaki iade de işleme alınmalı (`:189`) |
| V11 | Sumsub webhook gerçek uygulamada büyük olasılıkla gövde alamıyor: global `express.json` (`app.js:182`) rotadan (`app.js:314`) önce akışı tüketiyor, rota içindeki `expressRawBody` `'end'` bekliyor; birim testi router'ı tek başına bağlıyor | `routes/sumsubWebhook.js:128-143`, `server/test/sumsub.test.js:237-238` | Yüksek (KYC kararları işlenmiyor) | Sıralama doğrulandı; çalışma zamanı davranışı entegrasyon testiyle doğrulanmalı | In-house callback desenini kullan: `app.use('/api/webhook/sumsub', express.json({verify: rawBody}))` global parser'dan önce; tam `app` üzerinde entegrasyon testi |
| V12 | KYC sağlayıcı sırları `Setting`'de düz metin | `config/kyc.js:75-88` (doğrudan `value`) | Orta | Doğrulandı | `utils/secretCrypto.js` ile şifrele, mevcut değerleri geçişle şifrele, admin yanıtında maskele |
| V13 | `winners:new` gerçek kazananların `userId` ve `username` bilgisini tüm bağlı istemcilere yayınlıyor | `services/liveGameStream.js:68-91`, `[inhouse] inhouseProviderProxy.js:194` | Orta (gizlilik) | Doğrulandı | Maskeli kullanıcı adı (`ab***`), `userId` yok; yalnız ilgili site istemcilerine |
| V14 | Google girişi e-postayla mevcut hesaba otomatik bağlıyor | `services/socialAuth.js:180-186` | Orta (hesap ele geçirme, doğrulanmamış e-posta varsa) | Doğrulandı | Yalnız `email_verified` ve mevcut hesapta e-posta doğrulanmışsa bağla; aksi halde oturum açıkken açık bağlama akışı |
| V15 | Sağlayıcı `Operator.allowedOrigins` tüm platform API'sine kimlikli CORS açıyor | `app.js:128-136` | Orta | Doğrulandı | Sağlayıcı kökenlerini yalnız `/api/provider/v1` için ayrı CORS politikasında kabul et |
| V16 | Denetim CSV dışa aktarımı kaçışsız (formül enjeksiyonu), yalnız `requireAdmin` | `routes/audit.js:6-18`, `services/audit.js:181-211` | Orta | Envanter | `= + - @` ile başlayan hücreleri kaçır; `admin:audit:read` + `admin:reports:export` |
| V17 | Kripto limit/kur/ağ düzenlemeleri yalnız bellekte; yeniden başlatmada kayboluyor; `cryptoDepositIndex` max+1 ile yarışlı ayrılıyor (iki oyuncuya aynı adres riski) | `controllers/admin.js:1863-1882`, `routes/crypto.js:28-40` | Orta | Envanter | Ayarları `Setting`'e yaz; indeks için atomik sayaç (`findOneAndUpdate $inc`) + `cryptoDepositIndex` unique sparse |
| V18 | Igames callback'leri bakiye yazarken işlem ve ledger satırı kullanmıyor; tekrar anahtarı global | `[igames] igames.js:461-464,553-680` | Yüksek (mutabakat) | Envanter | Her callback `withTransactionRetry` + `createTransaction` (`casino_bet/win/cancel`) + receipt aynı işlemde |
| V19 | Promosyon talebi, bonus forfeit, Igames oturum kapama, Slikair payout iadesi işlem dışında | A§2.2 | Orta | Envanter | `withTransactionRetry` içine al |
| V20 | `/live` ve `/chat` soket el sıkışmaları `tokenVersion`/`isSeed` kontrol etmiyor (çıkış yapmış ya da seed hesap tokeni 15 dk geçerli) | `socket/handler.js:60-69`, `services/chat.js:638-647` | Düşük | Envanter | `requireAuth` ile aynı DB kontrolü |
| V21 | `admin:users:write` ile `role:'admin'` kullanıcı oluşturulabiliyor ve sistem `admin` rolünü alıyor (support personeli neredeyse tam yetkili hesap yaratır) | `controllers/admin.js:176-213`, `services/permissions.js:351-357` | Yüksek | Envanter | Personel oluşturma yalnız `admin:roles:write` ile; atanabilecek roller atayanın kendi izinlerinin alt kümesi |
| V22 | `ledger.createReversal` enum dışı `type:'reversal'` kullanıyor (çağrılırsa doğrulama hatası) | `services/ledger.js:224`, `models/Transaction.js:5` | Düşük | Envanter | Enum'a ekle ya da ölü kodu sil |

Öneri: V1-V5 ve V8, V10, V11 tek bir güvenlik PR serisinde, kiracı işinden önce ve CHANGELOG'da
**Kırılan Değişiklikler** notuyla (V4 davranış değişikliği, V2 2FA'sı etkin hesapların girişini etkiler) yayınlanır. Bu
açıkların bir kısmı (V1, V2, V3, V5, V7, V9, V15, V16) public core'da da vardır; İP-0 İP-U'dan önce yapıldığı için
düzeltmeler bugünkü core senkronuyla (bet → core) dağıtılır (7.3).

non-custodial zincir sürümü (K15): zincir `bet`'ten ayrıldığı için bu dosyaların bir kısmını taşıyor olabilir. İP-0 başında her
V maddesinin zincirde var olup olmadığı kontrol edilir; ortak olanlar için bet'teki commit yalnız o düzeltmeyi ve
testini içerir (kiracı kodu, biçim değişikliği ya da başka madde karışmaz), böylece zincirde
`git fetch bet && git cherry-pick <sha>` ile alınabilir. Zincire kiracı kodu taşınmaz.

---

## 11. Varsayımlar ve sahibin yanıtlaması gereken açık sorular

### 11.1 Yanıt bekleyen varsayımlar (önem sırasıyla)

Sahip yanıtlayana kadar plan aşağıdaki varsayımları kullanır. Geliştirmenin hangi depoda yapılacağı sorusu
kapandı (K18) ve listeden çıkarıldı.

| # | Soru | Planın varsayımı | Varsayım yanlışsa ne değişir | Etkilediği |
|---|---|---|---|---|
| Y1 | Veri yerleşimi / lisans başına ayrım: herhangi bir operatör ülke içinde barındırma ya da ayrı veritabanı istiyor mu? | Açılıştaki hiçbir operatör istemiyor; paylaşımlı DB (R1) geçerli. Sorgu koruması ve eklenti, modeller yeniden yazılmadan kiracı başına bağlantı eklenebilecek şekilde yazılır (`defineTenantModel`, `resolveConnection`) | O kiracı için ayrı bağlantı ya da ayrı dağıtım; uzlaştırma ve toplama bağlantı başına; yedek ve izleme bağlantı başına (4.1) | 4.1, 4.4, İP-1 |
| Y2 | Zaman çizelgesi ve büyüklük: kaç operatör, ne zaman? | Operatör #2 platformun provizyon ettiği kiracıyla canlıya çıkabilir (İP-9a kritik yol); partner portalı (İP-9b) ve faturalama (İP-9c) sonra gelebilir. Başlangıçta tek Node süreci; İP-10 (Redis vb.) 7.1'deki eşik aşılana kadar kritik yolda değil | Partner kaynaklı ilk operatör erken gelirse İP-9b kritik yola girer; büyük trafik beklenirse İP-10 İP-9a'ya paralel başlar | 7.1 |
| Y3 | Diğer kendi kurduğu kurulumlar (premium alıcıları, public core kullanıcıları) kendi başına güncelleyecek mi? | Evet. Tek mod geçişleri gözetimsiz güvenli, idempotent, yarıda kalırsa devam eden ve yöneticiyi asla dışarıda bırakmayan şekilde yazılır; tek modda `enforce` zorlanmaz | Yanlışsa (yalnız VIP90 güncelliyorsa) geçişler elle, bakım penceresiyle yapılabilir; tasarım yine aynı kalır, yalnız güvenlik payı fazladır | 6.1, 6.3, 8.6 |
| Y4 | In-house sağlayıcının VIP90 dışında müşterisi var mı? | Var sayılır; in-house callback ve tema değişiklikleri geriye uyumlu tutulur (eski callback biçimi ve sabit tema, yeni alanlar yokken aynen çalışır) | Yoksa uyumluluk katmanı İP-6'dan sonra kaldırılabilir | İP-6 |

### 11.2 Açık sorular

| # | Soru | Etkilediği |
|---|---|---|
| S1 | Kripto saklama: kiracı başına tohum ve hot wallet mı (kiracının fonu ayrık, operasyon yükü kiracı başına), yoksa platform saklaması + kiracı alt hesapları mı (lisans/emanet sorumluluğu VIP90'da)? | 4.5, İP-4, İP-6 |
| S2 | Paylaşımlı odds feed maliyeti kiracılara nasıl yansıtılacak (sabit, bahis hacmi, spor modülü lisansı)? Kiracı başına marj/olay görünürlüğü kaplaması gerekiyor mu? | 4.6, İP-9c |
| S3 | Partner faturalama modeli: partner VIP90'a mı öder (toptan), VIP90 partnere mi komisyon öder (rev-share), ikisi birden mi? GGR mı NGR mı (NGR bugün hesaplanmıyor)? | 4.3.4, 4.3.6, İP-9c |
| S4 | Igames: her operatörün kendi agent hesabı ve kimlik bilgileri karara bağlandı (K13). Açık kalan: Palace'ın ticari izni (VIP90 altında birden çok operatöre ayrı agent hesabı açılması ve bunun sözleşme koşulları) ayrıca teyit edilecek. Teyit gelmeden Igames'li bir kiracı canlıya çıkmaz | İP-6, İP-9a (N5) |
| S5 | Platform personeli kiracı adına para hareketi (bakiye düzeltme, onay) yapabilsin mi, yoksa yalnız salt okuma + denetimli destek mi? | 5.3 |
| S6 | Platform ve partner denetim kayıtlarının saklama süresi (bugün TTL 365 gün)? | 4.3.7 |
| S7 | Kapandı (K14): çoklu para birimi şimdilik kapsam dışı; kiracı başına tek para birimi, `currency` alanı korunur | 4.3.2, `TenantDailyStat` |
| S8 | Çok alan adı için TLS: Cloudflare for SaaS (özel host adları) mı, Caddy on-demand TLS mi? | İP-9a |
| S9 | Kiracı kapatıldığında veri saklama ve dışa aktarma yükümlülüğü (lisans gereği yıllar)? | İP-9a |
| S10 | Varsayılan partner yetenek seti ne olsun (önerilen: `metrics.read`, `staff.manage`; diğerleri partner başına açılır) ve `tenants.integrations` hiç verilsin mi? | 4.3.4 |

---

## 12. Değişiklik kaydı

- **2026-11-12 onay:** sahip raporu v2 metniyle onayladı. İP-0 tamamlandı (bet PR #221-#224, core senkronu `bet@5a379f3`,
  core PR #19). Y1-Y4 varsayımları geçerlidir; S1-S10 etkiledikleri iş paketinden önce sahibe sorulur. Geliştirme
  7.1'deki sırayla İP-U'dan devam eder.
- **2026-11-09 v2:** sahibin 2026-11-09 kararları işlendi (K10-K18). Merkezi kurulum yeni ve temiz kurulum olarak
  tanımlandı, `app.vip90.bet` demo olarak tek modda kalıyor ve taşınmıyor; demo davranışı `DEMO_*` bayraklarının
  arkasına alındı (R11). Geçiş bölümü ana yol (N1-N6) ve geriye uyum yolu (G1-G8) olarak yeniden yazıldı; G9-G10
  çıkarıldı; "N gün" kapıları yeni kurulumun staging/üretimine bağlandı. Personel 2FA zorunluluğu yalnız multi moda
  indirildi (V2 düzeltmesi ayrı). Partnere yetenek setiyle kurulum yazma yetkisi verildi (yetenek kataloğu, partner
  izin ad alanı, `partner_ops` rolü, yetki matrisinde `P`, kendi kendine atama yasağı, `PartnerGrant` sınırlı yazma
  kapsamları, partner için `onBehalfOfTenantId` denetimi). Igames kiracı başına agent hesabı karara bağlandı (S4
  daraltıldı), çoklu para birimi kapsam dışı (S7 kapandı), non-custodial zincir sürümü kapsam dışı ve İP-0 commit'leri
  cherry-pick edilebilir. Geliştirmenin tamamı public `vip90-bet-core`'a taşındı (K18): `premium/platform` kaldırıldı,
  konsol core içinde ayrı uygulama (`console/`), premium eklentiler kancalarla bağlanıyor, core upstream olur iş
  paketi İP-U eklendi (7.3). İP-9, İP-9a/9b/9c olarak bölündü; İP-10 için eşik tanımlandı. Açık sorulara yanıt
  bekleyen varsayımlar (Y1-Y4) eklendi; G-15, G-16, G-17 riskleri eklendi.
- **2026-11-09 v1:** ilk taslak.
