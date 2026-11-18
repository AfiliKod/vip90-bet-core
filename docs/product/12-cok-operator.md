# Çok operatörlü kurulum

Sürüm 1.1.0 ile tek bir merkezi kurulum, birbirinden yalıtılmış birden çok operatörü çalıştırabilir. Her operatörün alan adı, marka ayarları, personeli, entegrasyon ayarları ve işletme verisi ayrıdır. Platform Sahibi konsolu, partner portalı, komisyon/NGR hesapları ve ekstreler bu merkezi kurulumun parçalarıdır.

Bu kılavuz yalnızca **yeni ve temiz** çok operatörlü kurulumlar içindir. Mevcut tek operatörlü kurulumları taşımaya yönelik bir yol değildir.

## Modlar

| Mod | Kullanım | Gerekli işlem |
|---|---|---|
| `single` | Bir kurulum, bir varsayılan operatör | Hiçbir yeni ayar gerekmez; mevcut akış sürer. |
| `multi` | Bir merkezi kurulum, bağımsız birçok operatör | Aşağıdaki ortam ayarları, bootstrap ve alan adı doğrulaması gerekir. |

Çok modda veri erişimi zorunlu olarak kiracı kapsamındadır. Bir operatörün kaydı diğer operatörün kimliğiyle istenirse erişim verilmez; istemciye `404` döner. Demo botları, sahte kazananlar, anlık demo yatırması ve demo veri üretimi çok modda kapalıdır.

## Yeni çok operatörlü kurulumu açma

Önce `server/.env` içinde aşağıdaki değerleri tanımlayın. `JWT_STAFF_SECRET` ve `OPERATOR_SECRET_ENCRYPTION_KEY` üretim sırlarıdır; örnek değer kullanmayın.

| Değişken | Çok modda değer/kural | Amaç |
|---|---|---|
| `TENANCY_MODE` | `multi` | Merkezi çok operatörlü çalışma. |
| `TENANCY_ENFORCEMENT` | `enforce` (başka değer kabul edilmez) | Kapsamsız operatör verisi sorgularını engeller. |
| `JWT_STAFF_SECRET` | Zorunlu | Personel token ailelerini imzalar. |
| `OPERATOR_SECRET_ENCRYPTION_KEY` | Zorunlu, 64 hex karakter | Panelde saklanan operatör sırlarını şifreler. |
| `PLATFORM_HOST` | Platform konsolunun alan adı, ör. `platform.example.com` | `/console` ile platform/partner API yollarını platform ana makinesine bağlar. |
| `SCOPE_GATE_ENV` | `staging` veya `production` | Kapsam ihlallerinin N6 ölçümünü kaydeder. |
| `AUDIT_RETENTION_DAYS` | En az `1825` | Denetim ve kapanış sonrası saklama süresinin alt sınırı. |
| `DEMO_BOTS`, `DEMO_FAKE_WINNERS`, `DEMO_INSTANT_DEPOSIT`, `DEMO_DATA` | Hepsi `false` | Çok modda demo davranışları yasaktır. |
| `LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_REGISTRATION_NO`, `LEGAL_ENTITY_ADDRESS` | Varsayılan operatör için isteğe bağlı | Varsayılan kiracı ilk kez oluşturulurken yasal bilgileri verir. |

Kurulum sihirbazı çok modda kapalıdır. Migrations'ı çalıştırdıktan sonra `platform-001-bootstrap` kaydı, platform izinlerini, rol şablonlarını, saklama ayarını ve gerekli indeksleri hazırlar. İlk Platform Sahibini oluşturmak için şunu çalıştırın:

```bash
node scripts/platform-bootstrap.mjs --owner-email owner@example.com --password-stdin
```

`--password-stdin` isteğe bağlıdır; verilmezse betik geçici parolayı yalnız terminalde bir kez gösterir. İlk girişte Platform Sahibi 2FA kurulumunu tamamlamak zorundadır. Çok modda 2FA doğrulaması olmayan personel erişim tokenı verilmez.

## Konsol ve operatör sağlama

Platform Sahibi konsolu çok modda yalnız platform ana makinesindeki `/console` yolunda sunulur: örneğin `https://platform.example.com/console`. Operatör oluşturma; `provisioning` durumunda bir Tenant, varsayılan marka, birincil Domain, temel ayarlar ve isteğe bağlı sahip personelini oluşturur.

Sahip için oluşturulan davet bağlantısı yalnız ilk sağlama yanıtında gösterilir. Bağlantı tek kullanımlıktır ve 72 saat geçerlidir. İlk bağlantı kaybolursa, hesap henüz giriş yapmamışsa konsoldan tekrar üretilebilir; giriş yapmış sahip parolasını kendi akışıyla sıfırlar.

### Alan adı doğrulama ve TLS

Her operatör alan adı, oyuncu trafiğine açılmadan önce DNS ile doğrulanır. Konsolun verdiği jetonu şu TXT adına ekleyin:

```text
_domain-verify.operator.example.com
```

Konsoldan DNS doğrulamasını başlatın; doğrulama, alan adının kökünde aynı jetonu bulmayı da kabul eder. Yalnız `verifiedAt` kaydı olan alan adları operatöre çözülür. Ardından TLS durumunu yenileyin; DNS doğrulaması tek başına TLS'i etkin yapmaz.

### Canlıya alma kontrolü

Operatörü `active` yapmadan önce konsolun kontrol listesini tamamlayın:

- tüzel kişi adı, sicil numarası ve adresi;
- casino içeriği yetkisi varsa yazılı sağlayıcı onayı ve belge başvurusu;
- PSP sandbox yatırma/çekme testi;
- KYC webhook testi;
- e-posta gönderim testi;
- birincil alan adı için doğrulanmış DNS ve etkin TLS.

Durum yaşam döngüsü `provisioning → active ⇄ suspended → closed` şeklindedir. `closed` terminal durumdur. Kapanışta silme, yapılandırılmış denetim saklama süresinden ve beş yıldan önce yapılamaz.

## Personel erişimi ve yazma istisnası

Platform kapsamlı personel, operatör rotalarında varsayılan olarak yalnız GET/HEAD/OPTIONS kullanabilir. Yazma denemesi `403 PLATFORM_READ_ONLY` döner ve denetim kaydı oluşturur. Yalnız Platform Sahibi; gerekçeli, belirli personel ve operatör için en fazla 24 saatlik yazma izni verebilir. Bu izin iptal edildiğinde veya süresi dolduğunda erişim yeniden salt okunur olur.

## Partnerler

Partnerin etkin olma durumu, yetenekleri (`metrics.read`, personel yönetimi, operatör oluşturma/durum/entegrasyon/sahip daveti gibi), operatör kotası, izinli modülleri ve entitlement tavanı ayrı tanımlanır. Bir partner personelinin etkin izni, rol izni ile partner ve gerekiyorsa operatör-bağlantısı yeteneğinin kesişimidir; bir rol tek başına partnerin sınırını genişletmez.

Partner portalı kendi portföyündeki operatörleri, personeli, entegrasyon ayarlarını, metrikleri ve ekstreleri gösterir. Metrikler günlük toplamlardan üretilir, oyuncu kimliği içermez ve `activePlayers < 5` olduğunda değer `"<5"` olarak gizlenir.

Operatör sahibi, partnerin operatör verisine ihtiyaç duyduğu sınırlı durumlarda PartnerGrant verir veya iptal eder. Grant; kapsamlar (`players:read`, `players:pii`, `finance:read`, `reports:raw`, `support:write`, `players:status:write`, `promotions:assign`), gerekçe, başlangıç/bitiş zamanı ve veren personeli kaydeder; en uzun süresi 90 gündür. Verme, iptal ve kullanım denetim kaydına yazılır. Partner kendi adına grant veremez.

## Faturalama ve NGR

Operatör ücret planı (K20), spor için sabit/ciro yüzdesi/ikisi; platform için sabit/GGR yüzdesi/ikisi modellerini içerir. Partner ticari koşulları ise komisyon tabanını `ggr`, `ngr`, `turnover` veya `fixed` olarak seçer. Ekstre akışı taslak oluşturma, kesme (`issued`), denetimli düzeltme, iptal (`voided`) ve CSV dışa aktarmadan oluşur. Kesilmiş veya uzlaştırılmış ekstredeki NGR tanım sürümü değiştirilemez.

NGR tanımı (K28) casino ve/veya spor GGR bileşenlerini ve bonus, sağlayıcı ücreti, vergi, chargeback, diğer kesintilerini içerir. Kesinti kaynağı günlük istatistik alanı, ücret planı, oran veya günlük sabit tutardır. Tanımlar sürümlüdür; NGR koşulu belirli bir tanım kimliği ve sürümüne bağlanır.

Aynı maliyet iki kez düşülemez: etkin kategori bir kez kullanılabilir (yalnız `other` farklı etiketlerle çoğalabilir); aynı istatistik alanı veya ücret planı bileşeni iki satıra bağlanamaz; GGR zaten bir maliyetten net ise o maliyet yeniden düşülemez. `rate` ve `fixed`, yeni maliyet hesapladığı için aynı hedef üzerinde ayrı satırlar olabilir. `providerFees`, açık `ProviderFeeSchedule` sözleşmesindeki sağlayıcı bazlı GGR oranlarından günlük hesaplanır; operatöre özel takvim, aynı gün ve sağlayıcı için platform varsayılanından önceliklidir. Negatif sağlayıcı GGR'sinde günlük ücret alınmaz; aylık asgari ücret sözleşmede bilgi amaçlı saklanır ve günlük hesaplamaya uygulanmaz. NGR'de bunu `provider_fee` kategorisinde `stat_field: providerFees` olarak kullanın. K20 spor bahisleri besleme maliyeti (`fee_plan: sportsbookFee`) `providerFees`'e dahil değildir; ayrı bir maliyettir. İkisi birlikte kullanılacaksa biri `provider_fee`, diğeri farklı etiketli `other` kalemi olur (her kategori bir kez). `chargebacks` ve `chargebackCount`, Slikair'in doğrulanmış `chargeback` bildirimlerinden dolar (bkz. [Slikair](../providers/slikair.md)): chargeback tutarı oyuncunun bakiyesinden düşülür, hesap risk incelemesine alınır ve NGR'deki `chargeback` kalemi `stat_field: chargebacks` ile bu tutarı kullanır. PSP chargeback ücreti için ayrı etiketli bir `other` kalemi `fixed` + `per_chargeback` olarak tanımlanır. İadeler ve defter ters kayıtları chargeback değildir.

## N6 kapsam kapıları

`SCOPE_GATE_ENV` ayarlıysa kapsam ihlalleri UTC gününe göre kalıcı olarak sayılır. Konsol; staging için ardışık 14 temiz gün, production için ardışık 7 temiz gün ister. Değişken boşsa ölçüm başlatılmaz; bu, çok moddaki zorunlu `enforce` davranışını değiştirmez.

## Kapasite ölçümü (İP-10a)

Platform konsolundaki "Kapasite Ölçümü" kartı, N6 kapılarının yanında son tamamlanmış 15 dakikalık pencerenin değerlendirmesini gösterir: eşzamanlı soket p95, event loop gecikmesi p99 (ms) ve süreç CPU ortalaması (%). Her metrik `ok`, `approaching` (eşiğin %70'i) veya `exceeded` durumundadır; CPU'da `exceeded` için son 7 günde en az 3 pencerenin %70 eşiğini aşması gerekir. Varsayılan eşikler soket p95 2000, event loop p99 100 ms, CPU %70'tir; `CAPACITY_SOCKETS_P95`, `CAPACITY_EVENT_LOOP_P99_MS`, `CAPACITY_CPU_PCT` ile değiştirilebilir. Aynı veri `GET /api/platform/system/capacity` rotasından (`platform:tenants:manage` izni) okunur. Durum `approaching`/`exceeded`'a her değişimde sunucu günlüğüne bir `[capacity]` uyarısı yazılır ve platform personeli için bir etkinlik kaydı (AuditLog, `actorType: system`) oluşturulur. Ölçüm her iki modda çalışır; tek modda yalnız günlük uyarısı yazılır, etkinlik kaydı çok moda özgüdür.

## Sık hatalar

| Kod | Anlamı | Yapılacak işlem |
|---|---|---|
| `TENANT_NOT_FOUND` | Ana makine doğrulanmış bir Domain'e bağlı değildir. | DNS TXT doğrulamasını tamamlayın; doğru alan adını kullanın. |
| `TENANT_NOT_READY` | Operatör hâlâ sağlanıyor. | Personel ayarlarını ve canlıya alma listesini tamamlayın. |
| `TENANT_SUSPENDED` | Operatör askıya alınmıştır. | Platform Sahibi ile durumu `active` yapın. |
| `TENANT_CLOSED` | Operatör kapatılmıştır. | Yeni operatör sağlayın; kapalı durum geri açılamaz. |
| `PLATFORM_READ_ONLY` | Platform personeli operatör rotasında yazmaya çalıştı. | Salt okunur işlemi kullanın veya Platform Sahibinden süreli grant isteyin. |
| `PARTNER_NOT_ACTIVE` | Partner askıda ya da kapalıdır. | Partner durumunu etkinleştirin. |
| `MAX_TENANTS_EXCEEDED` | Partner operatör kotasına ulaştı. | Partner limitini güncelleyin veya etkin bağlantıyı sonlandırın. |
| `MODULE_NOT_ALLOWED` | İstenen modül partnerin izinli modüllerinde yoktur. | Partnerin modül tavanını ve istenen entitlement'i eşleştirin. |
| `TENANT_KEY_TAKEN` | Operatör anahtarı başka bir operatöre aittir. | Benzersiz bir anahtar seçin. |
| `ERR_TERMS_NGR_DEFINITION` | NGR ticari koşulunda geçerli tanım/sürüm yoktur. | Tanımı ve sürümünü oluşturup koşula bağlayın. |
| `ERR_NGR_DUPLICATE_CATEGORY` / `ERR_NGR_DUPLICATE_SOURCE` / `ERR_NGR_ALREADY_NET_OF` | NGR tanımı aynı maliyeti iki kez düşebilir. | Çakışan kesintiyi kaldırın; GGR'nin zaten net olduğu maliyeti yeniden eklemeyin. |
| `ERR_NGR_DEFINITION_IN_USE` | Kesilmiş ekstre bir NGR sürümünü kullanıyor. | Mevcut sürümü değiştirmeyin; yeni sürüm oluşturun. |
| `ERR_STATEMENT_ALREADY_ISSUED` | Aynı dönem için kesilmiş ekstre vardır. | Yeni dönem kullanın; gerekirse taslak/ekstre akışını gözden geçirin. |
| `ERR_INVALID_STATUS` / `ERR_STATEMENT_VOIDED` | Ekstre durumu istenen işleme uygun değildir. | Yalnız taslağı kesin; iptal edilmiş ekstreye düzeltme eklemeyin. |
| `INVALID_WRITE_GRANT_DURATION` / `REASON_REQUIRED` | Yazma istisnası için süre veya gerekçe geçersizdir. | Gerekçe verin ve bitişi şimdi ile 24 saat arasına koyun. |
| `OWNER_ALREADY_ACTIVE` | Operatör sahibi daha önce giriş yapmıştır. | Daveti yeniden üretmeyin; sahibin kendi parola sıfırlama akışını kullanın. |
| `ERR_NGR_DOUBLE_DEDUCTION` | Hesaplama anında NGR kesintisi çakıştı. | Tanımı yukarıdaki çift kesinti kurallarına göre düzeltip yeni sürüm kullanın. |

### Boş veritabanından yeni merkezi kurulum

1. Yeni, boş bir MongoDB replica set kullanın; mevcut tek-operatör demo verisini çok moda taşımayın.
2. `TENANCY_MODE=multi`, `TENANCY_ENFORCEMENT=enforce`, `JWT_STAFF_SECRET`, `OPERATOR_SECRET_ENCRYPTION_KEY`, `PLATFORM_HOST` ve aşağıdaki tabloyu hazırlayın; uygulamayı başlatıp migration/bootstrap işlemlerini tamamlayın.
3. `node scripts/platform-bootstrap.mjs --owner-email owner@example.com --password-stdin` çalıştırın. Parolayı komut satırı yerine standart girdiden verin.
4. `https://platform.example.com/console` üzerinden giriş yapıp zorunlu 2FA kaydını tamamlayın.
5. Benzersiz anahtar, tüzel kişi, alan adı, para birimi/zaman dilimi ve entitlement'larla operatörü sağlayın; tek kullanımlık sahip davetini güvenli yoldan iletin.
6. DNS TXT, TLS, PSP/KYC/e-posta testlerini ve gerekiyorsa yazılı sağlayıcı onayını tamamlayın. Kontrol listesi tamamlanınca operatörü `active` yapın.

### Çok mod ortam değişkenleri

| Değişken | Gereklilik / varsayılan | Etki |
|---|---|---|
| `TENANCY_MODE` | `multi` | Merkezi operatör yalıtımını açar. |
| `TENANCY_ENFORCEMENT` | `enforce`; multi modda zorunlu | Kapsamsız operatör sorgularını reddeder. |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Zorunlu | Oyuncu erişim/yenileme tokenları. |
| `JWT_STAFF_SECRET` | Multi modda zorunlu | Ayrı personel token ailesi. |
| `OPERATOR_SECRET_ENCRYPTION_KEY` | Multi modda zorunlu, 64 hex | Panelde kaydedilen operatör sırlarını şifreler. |
| `PLATFORM_HOST` | Üretimde şiddetle önerilir (açılışta zorunlu değil) | Platform konsolu ve platform/partner API'si yalnız bu ana makinede sunulur; boşsa yalnız yol (`/api/platform`, `/api/partner`, `/console`) belirleyicidir. |
| `MONGODB_URI` | Zorunlu | Replica set bağlantısı. |
| `AUDIT_RETENTION_DAYS` | En az `1825` | Denetim saklama alt sınırı. |
| `SCOPE_GATE_ENV` | Boş, `staging` veya `production` | Kapsam kapısı temiz-gün ölçümünü açar. |
| `CAPACITY_SOCKETS_P95` | `2000` | Soket p95 eşiği. |
| `CAPACITY_EVENT_LOOP_P99_MS` | `100` | Event-loop p99 milisaniye eşiği. |
| `CAPACITY_CPU_PCT` | `70` | Süreç CPU ortalaması yüzde eşiği. |
| `DEMO_BOTS`, `DEMO_FAKE_WINNERS`, `DEMO_INSTANT_DEPOSIT`, `DEMO_DATA` | Etkin olarak `false` | Çok modda demo işlevleri kapalıdır. |
| Sağlayıcı değişkenleri (`SUMSUB_*`, `SLIKAIR_*` vb.) | Entegrasyona göre | Çok modda kimlik bilgileri operatör kapsamlı ayarlardan gelir; boş değer başka operatöre düşmez. |

### Partner onboarding

1. Partnerin anahtarını, tüzel kişi/iletişim bilgisini, yeteneklerini, kotasını, izinli modüllerini ve entitlement tavanını Platform Sahibi oluşturur.
2. Partner kendi personelini davet eder. Etkin yetki, rol izni ile partner/operatör bağlantısı yeteneklerinin kesişimidir.
3. Partner kota içindeyse operatör sağlar; etkin `PartnerOperatorLink` ve başlangıç ticari koşulları kaydedilir.
4. Operatöre özgü ticari koşullar bağlantı üzerinde tanımlanabilir. Partner metrikleri oyuncu kimliği içermez ve beşten az aktif oyuncuyu `"<5"` gösterir.
5. Operatör sahibi erişim gerektiğinde gerekçeli, kapsamlı ve en fazla 90 günlük grant verir; iş bitince iptal eder. Partner kendi adına grant veremez.

### Aylık ekstre döngüsü ve NGR örneği

1. Operatör ücret planını (spor için `fixed`/`turnover_percentage`/`both`; platform için `fixed`/`ggr_percentage`/`both`) oluşturun.
2. Sağlayıcı için platform varsayılanı ya da operatöre özel takvim oluşturun. Aynı kapsam ve sağlayıcıda yeni açık takvim, eskisini etkinlik tarihinde kapatır.
3. NGR gereken ticari koşula tanım kimliği ve sürümü bağlayın. Günlük istatistikte zaten net olan bir maliyeti yeniden düşmeyin.
4. Partner ve dönemle taslak ekstre üretin, satırları/para birimini/hesaplanan NGR'yi gözden geçirin.
5. Taslağa gerekçeli düzeltme ekleyin veya taslağı kesin. Kesilmiş/uzlaştırılmış ekstre ile kullandığı NGR sürümü değiştirilemez; gerekirse ekstreyi iptal edin. CSV hem platform hem partner görünümünden alınır.

| NGR kalemi (örnek) | Kaynak | Tutar | Ara toplam |
|---|---|---:|---:|
| Casino GGR + spor gerçekleşmiş GGR | Bileşenler | 1.500 | 1.500 |
| Bonus | `stat_field: bonusCost` | -120 | 1.380 |
| Sağlayıcı ücreti | `stat_field: providerFees` | -90 | 1.290 |
| Vergi | `rate`, GGR'nin %10'u | -150 | 1.140 |
| Chargeback | `stat_field: chargebacks` | -60 | 1.080 |
| Diğer: olay başı PSP masrafı | `fixed` + `per_chargeback`, 2 × 10 | -20 | 1.060 |

Örneğin NGR `1.060` olur. `other` dışındaki her kategori en çok bir kez kullanılabilir. GGR zaten bonus/vergi gibi bir maliyetten netse o kategori `ggrAlreadyNetOf` içindedir ve tekrar kalem olamaz. Sağlayıcı takvimindeki `minimumMonthlyFee` sözleşme bilgisidir; günlük `providerFees` hesaplamasına uygulanmaz.

### Chargeback geldiğinde

1. Slikair, kredilenmiş bir yatırım için `status: "chargeback"` bildirimi gönderir. Bildirim imzasız olduğundan çekirdek `get-status` ile aynı durum, tutar ve para birimini doğrular; doğrulanamazsa para hareket etmez, bildirim ödeme kaydında doğrulanmamış olarak saklanır ve kritik log düşülür.
2. Doğrulanınca yatırım tutarı oyuncunun bakiyesinden **bir kez** düşülür (bakiye eksiye inebilir), `chargeback` defter satırı asıl yatırıma bağlanır, ödeme `chargeback` durumuna geçer.
3. Hesaba yüksek önemde `PSP_CHARGEBACK` risk bulgusu yazılır ve risk durumu en az `REVIEW` olur; sonraki kural değerlendirmeleri bunu kaldırmaz. Yönetim akışına `deposit_chargeback` olayı düşer.
4. Eksi bakiyede oyuncu çekim ve bahis yapamaz. Personel durumu inceler (oyuncuyla iletişim, belge, PSP itiraz süreci), sonra bulguyu `resolved` ya da `dismissed` yapar; bir sonraki değerlendirmede hesap normal akışa döner.
5. Doğrulanmış chargeback'ler o günün `TenantDailyStat.chargebacks` ve `chargebackCount` alanlarına girer; NGR'de `chargeback` kalemi (`stat_field: chargebacks`) ve PSP ücreti için ayrı etiketli `other` + `fixed` + `per_chargeback` kalemi bunları kullanır. Ayrıntı: [Slikair](../providers/slikair.md).

### Kapasite durumuna göre işlem

| Durum | Anlamı | İşletim adımı |
|---|---|---|
| `ok` | Son pencere eşiklerin %70'inin altında. | Trendi izleyin. |
| `approaching` | Bir metrik eşiğin en az %70'inde; sınırlı sıcak CPU penceresi de buradadır. | Trafik, sorgu ve socket kullanımını inceleyin; kapasite artışı/yatay dağıtım planını hazırlayın. |
| `exceeded` | Soket veya event-loop eşiği aşıldı ya da son 7 günde en az üç CPU penceresi eşiği aştı. | Hizmet sağlığını inceleyin ve kapasiteyi artırın veya trafiği güvenli dağıtın; 1.2.0 otomatik ölçeklemez. |

### Ek hata kodları

| Kod | Anlamı ve işlem |
|---|---|
| `PROVIDER_RATEOFGGR_AND_CURRENCY_ARE_REQUIRED` | Sağlayıcı, GGR oranı veya para birimi eksik; üç alanı da girin. |
| `INVALID_PROVIDER_FEE_SCHEDULE` | Oran/tarih geçersiz; oranı `0`–`1` aralığında ve tarihleri sırayla verin. |
| `PARTNERID_PERIODSTART_AND_PERIODEND_ARE_REQUIRED` | Ekstre dönemi eksik; partner ve iki tarihi gönderin. |
| `AMOUNT_AND_DESCRIPTION_ARE_REQUIRED` | Düzeltme tutarı/açıklaması eksik; ikisini de verin. |
| `NOT_FOUND` | Platform, partner veya faturalama kaydı bulunamadı; kimlik ve erişim kapsamını doğrulayın. |
| `PARTNER_GRANT_REQUIRED` | İlgili operatör için etkin partner grant'i yok; operatör sahibi gerekli kapsamla grant vermeli. |
| `INVITE_INVALID` | Davet bağlantısı geçersiz, süresi dolmuş (72 saat) ya da kullanılmış; sahip henüz hiç giriş yapmadıysa yeni davet oluşturun. |
| `PASSWORD_TOO_SHORT` | Davet kabulünde parola 12 karakterden kısa. |

İlgili rotalar için [API Referansı](05-api-referansi.md), tüm ortam değişkenleri için [Yapılandırma](02-yapilandirma.md) ve kurulum ayrıntıları için [Kurulum](01-kurulum.md) belgesine bakın.

