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

Aynı maliyet iki kez düşülemez: etkin kategori bir kez kullanılabilir (yalnız `other` farklı etiketlerle çoğalabilir); aynı istatistik alanı veya ücret planı bileşeni iki satıra bağlanamaz; GGR zaten bir maliyetten net ise o maliyet yeniden düşülemez. `rate` ve `fixed`, yeni maliyet hesapladığı için aynı hedef üzerinde ayrı satırlar olabilir. `chargebacks` ve `providerFees` alanları mevcuttur ancak çekirdek bunları dolduran bir veri kaynağı sunmaz; bu nedenle başlangıçta sıfırdır. İadeler ve defter ters kayıtları chargeback değildir.

## N6 kapsam kapıları

`SCOPE_GATE_ENV` ayarlıysa kapsam ihlalleri UTC gününe göre kalıcı olarak sayılır. Konsol; staging için ardışık 14 temiz gün, production için ardışık 7 temiz gün ister. Değişken boşsa ölçüm başlatılmaz; bu, çok moddaki zorunlu `enforce` davranışını değiştirmez.

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

İlgili rotalar için [API Referansı](05-api-referansi.md), tüm ortam değişkenleri için [Yapılandırma](02-yapilandirma.md) ve kurulum ayrıntıları için [Kurulum](01-kurulum.md) belgesine bakın.

