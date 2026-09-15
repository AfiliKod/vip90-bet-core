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
| 🛠️ **Kapsamlı admin panel** | Kullanıcılar, roller/izinler, canlı KPI+gelir grafikli analitik, tema/marka editörü, statik sayfa düzenleyici, modül aç/kapa, kripto işlemler, destek masası |
| 💰 **Uçtan uca kripto ödeme** | USDT-TRC20 — HD cüzdan tabanlı yatırma takibi + hot wallet üzerinden otomatik/onaylı çekim, admin panelden işlem geçmişi, cüzdan imzasıyla Web3 girişi |
| 🪪 **Çift KYC sistemi** | Yerel belge inceleme (admin onay/red kuyruğu) veya Sumsub ile otomatik doğrulama — panelden seçilebilir |
| 👑 **VIP & gerçek zamanlı cashback** | 5 seviyeli VIP programı; her sonuçlanan bahis/rounddan sonra seviyeye göre anlık cashback bakiyeye işler |
| 🌍 **Çok dilli altyapı & PWA** | 8 dilde tam sözlük + global dil değiştirici, kurulabilir Progressive Web App, iOS Capacitor kabuğu |
| 🧩 **Modüler lisanslama** | Çekirdek platform her zaman açık; Bahis / Casino İçeriği / In-house Oyunlar / Kripto Ödeme / KYC ayrı modüller olarak panelden yönetilir |
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
- Banka havalesi (admin onay kuyruğu) ve **USDT-TRC20** kripto ödeme —
  HD cüzdan tabanlı yatırma takibi, hot wallet üzerinden çekim, admin
  panelden işlem bazlı görünürlük.
- **KYC** — yerel belge inceleme (onay/red kuyruğu) veya **Sumsub**
  entegrasyonu, ikisinden biri panelden seçilir.
- Bonus/çevrim (wagering) motoru, 5 seviyeli VIP programı: seviye
  atlayınca tek seferlik bakiye ödülü **+** her sonuçlanan bahis/round
  sonrası seviyeye göre gerçek zamanlı cashback.
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

Kullanıcılar · Roller & İzinler · Canlı KPI/Gelir Analitiği ·
Etkinlik Yönetimi · Oyun Ayarları · Modüller · Tema · Marka ·
Statik Sayfalar · VIP · Bahis/Banka Talepleri · Kripto İşlemler ·
KYC İnceleme Kuyruğu · Destek Bileti Sistemi

## Modül Sistemi

VIP90.bet'un çekirdeği (kullanıcı yönetimi, cüzdan, bonus/çevrim motoru,
referans komisyonu, temel admin panel, i18n) satın alma sonrası **her
zaman açıktır** — bir modül değildir, ek bir şey gerekmeden tam çalışır
durumdadır.

Beş ayrı modül, admin panelinden tek bir anahtarla açılıp kapatılır ve
lisans durumuna göre işaretlenir:

| Modül | Sağlar | Bağımlılık |
|---|---|---|
| **Bahis** | Oran akışı, kupon, otomatik sonuçlandırma | Spor verisi sağlayıcısıyla sözleşme |
| **Casino İçeriği** | Slot/masa oyunları aggregator konektörü | Lisanslı aggregator sözleşmesi |
| **In-house Oyunlar** | 13 provably-fair oyun, ayrı bir oyun sunucusundan (JWT+origin korumalı) servis edilir | Yok — dahili, ayrı bir üçüncü taraf sözleşmesi gerektirmez |
| **Crypto Ödeme Ağ Geçidi** | USDT-TRC20 yatırma/çekme | Yok — dahili |
| **KYC Kimlik Doğrulama** | Yerel belge inceleme veya Sumsub | Sumsub seçilirse üçüncü taraf sözleşmesi |

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
altında (dizinin kendi indeksi: [docs/product/README.md](docs/product/README.md)):

- [Kurulum](docs/product/01-kurulum.md) · [Yapılandırma](docs/product/02-yapilandirma.md)
- [Modül Sistemi](docs/product/03-modul-sistemi.md) · [Oyun Matematiği](docs/product/04-oyun-matematigi.md)
- [API Referansı](docs/product/05-api-referansi.md) · [SSS](docs/product/06-sss.md)
- [Video Storyboard'ları](docs/product/07-video-storyboardlari.md) · [Varlık Lisans Denetimi](docs/product/08-varlik-lisans-denetimi.md)
- [Bilinen Kısıtlar](docs/product/09-bilinen-kisitlar.md)

Sağlayıcı/entegrasyon bazlı teknik dokümantasyon — oran akışı sağlayıcısı,
üçüncü taraf casino aggregator'ı, kripto ödeme ve KYC sağlayıcıları,
in-house oyun sunucusu mimarisi — [`docs/providers/`](docs/providers/)
altında:

- [Spor Bahisleri Sistemi](docs/providers/betting-sports.md) · [In-House Oyunlar Sistemi](docs/providers/inhouse-games.md)
- [Palace Casino Entegrasyonu](docs/providers/palace-casino.md) · [Palace Casino Sağlayıcı Yönetimi (API uçları)](docs/providers/index.md)
- [Kripto Ödeme Sağlayıcısı — TRC20 USDT](docs/providers/crypto-trc20.md)
- [Yerel (Manuel) KYC Servisi](docs/providers/local-kyc.md) · [Sumsub KYC Entegrasyonu](docs/providers/sumsub-kyc.md)

Sürüm geçmişi için [`CHANGELOG.md`](CHANGELOG.md).

## Yol Haritası

Platform aktif geliştirme altında. Aşağıdakiler, kod tabanında **şema veya
kısmi altyapısı bulunan ama uçtan uca çalışmayan** özellikler — kod
denetimiyle doğrulandı, gizlenmiyor. Tam ayrıntı ve kod referansları için
[Bilinen Kısıtlar](docs/product/09-bilinen-kisitlar.md):

- **Acente (reseller) sistemi** — `User` modelinde `isAgent`/`agentId`
  alanları tanımlı ama bunları okuyan/yazan hiçbir route, controller
  veya arayüz yok. Şu an tamamen kullanılmayan şema alanları.
- **Çok kademeli affiliate** — bugün yalnızca tek kademe var: davet
  edilen kullanıcının ürettiği ev karının bir yüzdesi doğrudan referans
  verene ödeniyor. Alt-referansların (2. kademe ve ötesi) da komisyon
  getirdiği bir yapı henüz yok.

## Lisanslama

VIP90.bet ticari bir üründür, iki lisans seçeneğiyle sunulur:

- **Regular License** — tek bir son ürün için, son kullanıcıdan
  ürünün kendisi için ücret alınmıyorsa.
- **Extended License** — son kullanıcıların erişim için ödeme yaptığı
  bir üründe kullanım için.

Fiyatlandırma, destek süresi ve tedarik detayları için satış ekibiyle
iletişime geçin.

---

## Proje Geçmişi

Bu commit geçmişi projenin gerçek geliştirme sürecini yansıtır. Platform
zaman içinde iki kez yeniden markalandı — **Betzone** → **Kismethane** →
**VIP90.bet** — bu yüzden eski commit'lerde önceki isimlere rastlayabilirsiniz;
bunlar terk edilmiş bir proje değil, aynı ürünün marka evrimidir.

---

<sub>Node.js · Express · React · MongoDB · Socket.IO ile geliştirildi.</sub>
