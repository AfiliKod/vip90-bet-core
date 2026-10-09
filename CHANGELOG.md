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
