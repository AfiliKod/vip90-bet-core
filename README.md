![VIP90.bet](https://img.shields.io/badge/VIP90.bet-iGaming%20Platform-1a2332?style=for-the-badge)
![Version](https://img.shields.io/badge/version-0.3.0-6366f1?style=flat-square)
![Node](https://img.shields.io/badge/node-%E2%89%A518-339933?style=flat-square&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/react-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![MongoDB](https://img.shields.io/badge/mongodb-8-47A248?style=flat-square&logo=mongodb&logoColor=white)
![License](https://img.shields.io/badge/license-commercial-orange?style=flat-square)

# VIP90.bet

**Self-hosted full-stack betting and casino platform with sportsbook,
live betting, casino, wallet, bonuses, affiliate and admin management.**

Kendi altyapınızda çalışan, kendi markanızı taşıyan tam bir online casino
+ spor bahisleri platformu. Kurulum sihirbazını bitirdiğiniz anda 13
in-house oyunla canlıya çıkın; hazır olduğunuzda spor bahisleri ve üçüncü
taraf casino içeriğini modül olarak ekleyin — tek kod tabanı, tek admin
panel, tek kurulum.

Çoğu "casino script"i demo verisine sarılı boş bir kabuk satar; canlıya
almaya çalıştığınız an kırılır. VIP90.bet'un çekirdeği bunun tersi: 13 oyun,
spor bahisleri sonuçlandırma motoru, tema editörü, canlı sohbet, referans
komisyonu — hepsi gerçek, uçtan uca test edilmiş ve kimsenin lisans
onayını beklemeden çalışır. Hangi özelliklerin henüz olgunlaşmadığını
gizlemiyoruz — bkz. [Yol Haritası](#yol-haritası).

---

## İçindekiler

- [Öne Çıkanlar](#öne-çıkanlar)
- [Neler Dahil](#neler-dahil)
- [Modül Sistemi](#modül-sistemi)
- [Mimari ve Teknoloji Yığını](#mimari-ve-teknoloji-yığını)
- [Hızlı Başlangıç](#hızlı-başlangıç)
- [Güvenlik](#güvenlik)
- [Belgeler](#belgeler)
- [Yol Haritası](#yol-haritası)
- [Lisanslama](#lisanslama)

---

## Öne Çıkanlar

| | |
|---|---|
| 🎰 **13 in-house oyun** | Crash, Mines, Plinko, Dice, Limbo, Wheel, Hi-Lo, Keno, Blackjack, Roulette, Baccarat, Video Poker, Dragon Tiger — hepsi HMAC-SHA256 **provably fair**, house edge her oyun için panelden ayarlanabilir |
| ⚽ **Spor & Canlı Bahis modülü** | 25 spor kategorisi, canlı oran akışı, kupon (tekli/kombine/sistem), otomatik sonuçlandırma |
| 🃏 **Casino İçeriği modülü** | Aggregator entegrasyonu ile slot ve masa oyunları — tek adaptör dosyası, sağlayıcı bağımsız mimari |
| 🛠️ **Kapsamlı admin panel** | Kullanıcılar, roller/izinler, analitik, tema/marka editörü, statik sayfa düzenleyici, modül aç/kapa, destek masası |
| 💰 **Esnek ödeme altyapısı** | Banka havalesi (admin onaylı), USDT-TRC20 kripto para yatırma takibi, cüzdan imzasıyla Web3 girişi |
| 🌍 **Çok dilli altyapı & PWA** | Türkçe/İngilizce sözlük + global dil değiştirici, kurulabilir Progressive Web App, iOS Capacitor kabuğu — sayfa çevirisi kısmi (bkz. Yol Haritası) |
| 🧩 **Modüler lisanslama** | Çekirdek platform her zaman açık; Bahis / Casino İçeriği / Canlı Casino ayrı modüller olarak panelden yönetilir |
| 🚀 **Tek adımda kurulum** | Tarayıcı tabanlı kurulum sihirbazı (`/install`) — terminal veya elle `.env` düzenleme gerekmez |

## Neler Dahil

### 🎰 13 In-House Oyun

Hiçbir üçüncü taraf sözleşmesi beklemeden açılışta çalışan, tamamen size
ait oyun kütüphanesi:

**Crash · Mines · Plinko · Dice · Limbo · Wheel · Hi-Lo · Keno ·
Blackjack · Roulette · Baccarat · Video Poker · Dragon Tiger**

- Her round `crypto.randomBytes` ile üretilen bir `serverSeed`'in
  HMAC-SHA256 hash'inden türetilir — sonuç sunucu tarafından round
  başlamadan önce belirlenemez (**provably fair**).
- House edge ve bahis limitleri oyun bazında admin panelinden
  ayarlanır — tek bir soyut "RTP" alanı değil, her oyunun gerçek
  matematiğini oluşturan değişkenler doğrudan açılır.
- Panel üzerinden anlık istatistik: oynanma sayısı, toplam el/toplam
  kazanç, oyun bazlı performans.

### ⚽ Spor Bahisleri & Canlı Bahis (modül)

- 25 spor kategorisi (futbol, basketbol, tenis, buz hokeyi, boks,
  rugby, kriket, motor sporları, satranç ve daha fazlası) için lig/
  ülke bazlı hiyerarşik listeleme.
- Canlı ve yaklaşan etkinlikler ayrı akışlarda; etkinlik detay
  sayfasında market bazlı oran tablosu.
- Tekli / kombine / sistem kupon desteği, otomatik sonuçlandırma
  motoru — uçtan uca test edildi: bahis oynanır, etkinlik sonuçlanınca
  bakiye atomik bir işlemle kredilenir.
- Veri kaynağı bağımsız adaptör mimarisi — lisanslı bir oran
  sağlayıcısıyla (ör. The Odds API veya eşdeğeri) veya kendi
  sözleşmenizle beslenir; platform veri akışının şeklini değil
  entegrasyon sözleşmesini tanımlar.

### 🃏 Casino İçeriği (modül)

- Standart aggregator konektörü — tek bir adaptör dosyasıyla slot ve
  masa oyunu kataloğunu platforma bağlar.
- Sağlayıcı bazlı filtreleme, favoriler, son oynananlar, arama —
  hepsi in-house oyunlarla aynı UI dilinde.
- Aynı konektör canlı krupiyeli (live-casino) içerik için genişletilebilir.

### 👤 Kullanıcı, Cüzdan ve Güvenlik

- E-posta/şifre + sosyal giriş + **Web3 cüzdan imzasıyla** kayıt/giriş.
- Banka havalesi (admin onay kuyruğu) ve **USDT-TRC20** kripto para
  yatırma takibi.
- Bonus/çevrim (wagering) motoru, VIP/seviye programı (seviye atlayınca
  gerçek bakiye ödülü).
- Admin için 2FA (TOTP), tiered admin rolleri/izinleri.

### 🎉 Topluluk ve Elde Tutma Araçları

- Moderasyonlu canlı sohbet, "rain" bonus dağıtımı, oyuncular arası
  bahşiş.
- Canlı kazanç akışı (Son Kazananlar), favoriler, son oynananlar.
- Referans linki ve komisyon sistemi — davet edilen kullanıcının ürettiği
  ev karının bir yüzdesi doğrudan referans veren kullanıcıya ödenir.
- Yapılandırılabilir "çevrimiçi oyuncu" sosyal kanıt katmanı.

### 🎨 Marka ve Görsel Kimlik

- Canlı önizlemeli tema editörü, logo/favicon/font yükleme.
- Sürükle-bırak statik sayfa/blok düzenleyici (Hakkımızda, Kariyer,
  Basın, İletişim, Yardım Merkezi vb. tamamı tek şablondan üretilir).
- Hazır tema seçenekleri.

### 🛠️ Yönetim Paneli

Kullanıcılar · Roller & İzinler · Analitik · Etkinlik Yönetimi ·
Oyun Ayarları · Modüller · Tema · Marka · Statik Sayfalar · VIP ·
Bahis/Banka Talepleri · Destek Bileti Sistemi · Casino İstatistikleri

## Modül Sistemi

VIP90.bet'un çekirdeği (13 in-house oyun, kullanıcı yönetimi, bonus/çevrim
motoru, temel admin panel) satın alma sonrası **her zaman açıktır** — ek
bir şey gerekmeden tam çalışır durumdadır.

Üç ek modül, admin panelinden tek bir anahtarla açılıp kapatılır ve
lisans durumuna göre işaretlenir:

| Modül | Sağlar | Bağımlılık |
|---|---|---|
| **Bahis** | Oran akışı, kupon, otomatik sonuçlandırma | Spor verisi sağlayıcısıyla sözleşme |
| **Casino İçeriği** | Slot/masa oyunları aggregator konektörü | Lisanslı aggregator sözleşmesi |
| **Canlı Casino** | Gerçek krupiyeli masa/video oyunları | Canlı içerik sağlayıcısıyla sözleşme |

Bir modül kapalıyken ilgili API uçları anlaşılır bir `MODULE_DISABLED`
hatası döner — platformun geri kalanı etkilenmeden çalışmaya devam eder.
Veri/içerik sağlayıcısı sözleşmesi platformdan ayrıdır: **kendi
sağlayıcınızı bağlayın** ya da başlangıç için yönlendirme isteyin.

## Mimari ve Teknoloji Yığını

```
client/   React 19 + Vite + Tailwind + Zustand — SPA, PWA, Capacitor (iOS)
server/   Node.js + Express + MongoDB (Mongoose) + Socket.IO
          JWT auth · Zod doğrulama · Helmet · rate limiting
installer/ Tarayıcı tabanlı kurulum sihirbazı (/install)
```

**Öne çıkan teknik kararlar:**

- **Gerçek zamanlı katman** Socket.IO üzerinden — bahis oranları,
  çevrimiçi oyuncu sayacı, canlı sohbet, kazanç akışı hepsi push
  tabanlı (polling yok).
- **Modül kapısı** (`moduleGate` middleware) her istekte lisans +
  panel anahtarı durumunu kontrol eder, tutarlı hata sözleşmesi sunar.
- **Paylaşılan UI bileşenleri** — sayfa şablonları (`PageWithRail`,
  `HomeSidebar`) tek yerden yönetilir, kopyala-yapıştır drift riski yok.
- Tam otomatik test paketi: auth, bahis, çevrim, modül kapısı ve i18n
  kapsıyor (`npm test`).

## Hızlı Başlangıç

### Tarayıcı tabanlı kurulum (önerilen)

```bash
npm run install:all   # kök + server + client bağımlılıkları
npm run build         # client production build
npm start             # server'ı ayağa kaldır
```

Sunucu ayaktayken tarayıcıdan **`/install`** adresine gidin — veritabanı
bağlantısı, ilk yönetici hesabı ve site ayarları tek sayfalık bir
sihirbazla tamamlanır; terminal veya elle `.env` düzenlemesi gerekmez.

### Geliştirme ortamı

```bash
npm run dev   # server + client'ı eşzamanlı, hot-reload ile başlatır
```

### Testler

```bash
npm test           # birim/entegrasyon testleri (server + i18n)
npm run test:e2e   # Playwright uçtan uca testleri
```

## Güvenlik

- HMAC-SHA256 **provably fair** round üretimi, oyuncu tarafında
  doğrulanabilir.
- JWT tabanlı oturum, gömülü/casino görünümleri için kapsamlı token'lar.
- `helmet`, `express-mongo-sanitize`, katmanlı `express-rate-limit`.
- Admin için TOTP tabanlı 2FA.
- Modül kapısı ile lisans/yetki sınırları API seviyesinde uygulanır.
- Belgelenmiş, git geçmişiyle denetlenebilir varlık lisanslaması —
  ürün paketine markalı/lisanssız üçüncü taraf içerik gömülmez.

## Belgeler

Operatörler için hazırlanan tam dokümantasyon [`docs/product/`](docs/product/)
altında:

- [Kurulum](docs/product/01-kurulum.md) · [Yapılandırma](docs/product/02-yapilandirma.md)
- [Modül Sistemi](docs/product/03-modul-sistemi.md) · [Oyun Matematiği](docs/product/04-oyun-matematigi.md)
- [API Referansı](docs/product/05-api-referansi.md) · [SSS](docs/product/06-sss.md)
- [Bilinen Kısıtlar](docs/product/09-bilinen-kisitlar.md)

Sürüm geçmişi için [`CHANGELOG.md`](CHANGELOG.md).

## Yol Haritası

Platform aktif geliştirme altında. Aşağıdakiler, kod tabanında **şema veya
kısmi altyapısı bulunan ama uçtan uca çalışmayan** özellikler — kod
denetimiyle doğrulandı, gizlenmiyor. Tam ayrıntı ve kod referansları için
[Bilinen Kısıtlar](docs/product/09-bilinen-kisitlar.md):

- **KYC belge inceleme akışı** — belge gönderme/onaylama/reddetme/süre
  dolumu için tam bir backend servisi (`kyc.js`) yazılmış durumda, ama
  hiçbir route'a bağlı değil ve kullanıcı tarafında belge yükleme arayüzü
  yok. Bugün itibarıyla "KYC", admin panelinde tek bir ham
  `kycVerified` işaretleme kutusundan ibaret.
- **Acente (reseller) sistemi** — `User` modelinde `isAgent`/`agentId`
  alanları tanımlı ama bunları okuyan/yazan hiçbir route, controller
  veya arayüz yok. Şu an tamamen kullanılmayan şema alanları.
- **Çok kademeli affiliate** — bugün yalnızca tek kademe var: davet
  edilen kullanıcının ürettiği ev karının bir yüzdesi doğrudan referans
  verene ödeniyor. Alt-referansların (2. kademe ve ötesi) da komisyon
  getirdiği bir yapı henüz yok.
- **VIP cashback** — VIP seviyelerinde tanımlı `cashbackPercent` alanı
  hiçbir job/serviste tüketilmiyor, hiç ödenmiyor. Yalnızca seviye
  atlarken tek seferlik bakiye ödülü (`rewardAmount`) gerçekten işliyor.
- **Rulet house edge ayarı devre dışı** — panelde `rouletteHouseEdgePercent`/
  `rouletteMaxPayout` alanları var ama rulet oyun mantığı bunları hiç
  okumuyor; değiştirmek oyunun davranışını etkilemiyor.
- **Sayfa çevirisi tamamlanmadı** — i18n altyapısı (sözlük + global dil
  değiştirici) hazır ama `HomePage.jsx`, `Bahis.jsx`, `Live.jsx`,
  `CasinoRedesign.jsx`, `Profile.jsx` gibi büyük sayfalarda hâlâ doğrudan
  gömülü Türkçe metin var — İngilizce'ye geçince bu sayfalar kısmen
  Türkçe kalıyor.

## Lisanslama

VIP90.bet ticari bir üründür, iki lisans seçeneğiyle sunulur:

- **Regular License** — tek bir son ürün için, son kullanıcıdan
  ürünün kendisi için ücret alınmıyorsa.
- **Extended License** — son kullanıcıların erişim için ödeme yaptığı
  bir üründe kullanım için.

Fiyatlandırma, destek süresi ve tedarik detayları için satış ekibiyle
iletişime geçin.

---

<sub>Node.js · Express · React · MongoDB · Socket.IO ile geliştirildi.</sub>
